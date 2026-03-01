import os
import uuid
import shutil
import zipfile
import logging
import asyncio
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session
from database import get_db
from models.image_job import ImageJob
from models.user import User
from schemas.image import ImageJobResponse, ImagePipelineConfig
from models.project import Project
from services import image_service
from utils.dependencies import require_verified_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/image", tags=["image"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "images")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {".zip"}
MAX_UPLOAD_SIZE = 500 * 1024 * 1024  # 500MB


@router.post("/{project_id}/upload", response_model=ImageJobResponse)
async def upload_image_dataset(
    project_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """Upload a ZIP file containing image dataset with class folders."""
    project = db.query(Project).filter(
        Project.id == project_id, Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(404, f"Project not found: {project_id}")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Only ZIP files are accepted. Got: {ext}")
    
    job_id = str(uuid.uuid4())
    job_dir = os.path.join(UPLOAD_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)
    
    # Save and extract ZIP
    zip_path = os.path.join(job_dir, "dataset.zip")
    try:
        total_size = 0
        CHUNK_SIZE = 1024 * 1024  # 1MB chunks
        with open(zip_path, "wb") as f:
            while True:
                chunk = await file.read(CHUNK_SIZE)
                if not chunk:
                    break
                total_size += len(chunk)
                if total_size > MAX_UPLOAD_SIZE:
                    f.close()
                    os.remove(zip_path)
                    raise HTTPException(413, f"File too large. Maximum {MAX_UPLOAD_SIZE // (1024*1024)}MB.")
                f.write(chunk)
        
        with zipfile.ZipFile(zip_path, 'r') as zf:
            # Security: check for path traversal
            for name in zf.namelist():
                if name.startswith('/') or '..' in name:
                    raise HTTPException(400, "Invalid file paths in ZIP")
            zf.extractall(job_dir)
        
        os.remove(zip_path)  # Remove zip after extraction
        
        # Find the dataset root (may be nested in a folder)
        dataset_path = _find_dataset_root(job_dir)
        
        # Create job record
        job = ImageJob(
            id=job_id,
            project_id=project_id,
            job_type="image_eda",
            status="pending",
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        
        return job
    except HTTPException:
        raise
    except Exception as e:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(500, f"Failed to process upload: {str(e)}")


@router.post("/{project_id}/upload-folder", response_model=ImageJobResponse)
async def register_local_folder(
    project_id: str,
    folder_path: str,
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """Register a local folder as image dataset (for testing)."""
    project = db.query(Project).filter(
        Project.id == project_id, Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(404, f"Project not found: {project_id}")

    if not os.path.isdir(folder_path):
        raise HTTPException(400, f"Folder not found: {folder_path}")
    
    job_id = str(uuid.uuid4())
    
    # Symlink or copy to uploads
    job_dir = os.path.join(UPLOAD_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)
    
    # Create symlink to avoid copying large datasets
    link_path = os.path.join(job_dir, "dataset")
    os.symlink(os.path.abspath(folder_path), link_path)
    
    job = ImageJob(
        id=job_id,
        project_id=project_id,
        job_type="image_eda",
        status="pending",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    
    return job


@router.post("/jobs/{job_id}/run-eda", response_model=ImageJobResponse)
async def run_image_eda(
    job_id: str,
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """Run image EDA analysis on uploaded dataset."""
    job = db.query(ImageJob).filter(ImageJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    project = db.query(Project).filter(
        Project.id == job.project_id, Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(403, "Access denied.")
    
    dataset_path = _get_dataset_path(job_id)
    
    try:
        job.status = "processing"
        db.commit()
        
        result = await asyncio.to_thread(image_service.run_image_eda, dataset_path)
        
        job.status = "completed"
        job.total_images = result["total_images"]
        job.num_classes = result["num_classes"]
        job.class_distribution = result["class_distribution"]
        job.resolution_stats = result["resolution_stats"]
        job.rgb_stats = result["rgb_stats"]
        job.blur_scores = result.get("blur_stats")
        job.duplicate_count = result["duplicate_count"]
        job.eda_report = result
        db.commit()
        db.refresh(job)
        
        return job
    except Exception as e:
        job.status = "failed"
        job.error_message = str(e)
        db.commit()
        raise HTTPException(500, f"EDA failed: {str(e)}")


@router.post("/jobs/{job_id}/run-pipeline", response_model=ImageJobResponse)
async def run_image_pipeline(
    job_id: str,
    config: ImagePipelineConfig,
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """Train image classification model."""
    job = db.query(ImageJob).filter(ImageJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    project = db.query(Project).filter(
        Project.id == job.project_id, Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(403, "Access denied.")
    
    dataset_path = _get_dataset_path(job_id)
    
    try:
        # Create a new pipeline job linked to the same dataset
        pipeline_job_id = str(uuid.uuid4())
        pipeline_job = ImageJob(
            id=pipeline_job_id,
            project_id=job.project_id,
            job_type="image_pipeline",
            status="processing",
        )
        db.add(pipeline_job)
        db.commit()
        
        result = await asyncio.to_thread(image_service.run_image_pipeline, dataset_path, config.model_dump())
        
        pipeline_job.status = "completed"
        pipeline_job.model_name = result["model_name"]
        pipeline_job.accuracy = result["accuracy"]
        pipeline_job.metrics = {
            "precision": result["precision"],
            "recall": result["recall"],
            "f1_score": result["f1_score"],
            "total_samples": result["total_samples"],
            "train_samples": result["train_samples"],
            "test_samples": result["test_samples"],
            "feature_dim": result["feature_dim"],
            "per_class_metrics": result["per_class_metrics"],
            "feature_method": result.get("feature_method", "hog"),
        }
        pipeline_job.confusion_matrix = result["confusion_matrix"]
        pipeline_job.total_images = result["total_samples"]
        pipeline_job.num_classes = len(result["class_names"])
        pipeline_job.class_distribution = {name: 0 for name in result["class_names"]}
        pipeline_job.class_names = result["class_names"]
        pipeline_job.training_history = {"report_code": result.get("report_code", "")}
        db.commit()
        db.refresh(pipeline_job)
        
        return pipeline_job
    except Exception as e:
        logger.exception(f"Pipeline failed: {e}")
        raise HTTPException(500, f"Pipeline failed: {str(e)}")


@router.get("/jobs/{job_id}", response_model=ImageJobResponse)
async def get_image_job(
    job_id: str,
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """Get image job status and results."""
    job = db.query(ImageJob).filter(ImageJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    project = db.query(Project).filter(
        Project.id == job.project_id, Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(403, "Access denied.")
    return job


@router.get("/{project_id}/jobs", response_model=list[ImageJobResponse])
async def list_image_jobs(
    project_id: str,
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """List all image jobs for a project."""
    project = db.query(Project).filter(
        Project.id == project_id, Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(404, "Project not found.")
    jobs = db.query(ImageJob).filter(
        ImageJob.project_id == project_id
    ).order_by(ImageJob.created_at.desc()).all()
    return jobs


@router.get("/jobs/{job_id}/download-report")
async def download_image_report(
    job_id: str,
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """Download the image pipeline report as a Python script."""
    job = db.query(ImageJob).filter(ImageJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    project = db.query(Project).filter(
        Project.id == job.project_id, Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(403, "Access denied.")
    if job.status != "completed":
        raise HTTPException(400, "Job not completed yet.")

    report_code = ""
    if job.training_history and isinstance(job.training_history, dict):
        report_code = job.training_history.get("report_code", "")
    if not report_code:
        report_code = f"# Image Pipeline Report\n# Model: {job.model_name}\n# Accuracy: {job.accuracy}\n"

    return Response(
        content=report_code,
        media_type="text/x-python",
        headers={"Content-Disposition": f"attachment; filename=image_pipeline_{job_id[:8]}.py"},
    )


def _find_dataset_root(job_dir: str) -> str:
    """Find the root directory for the dataset. Returns job_dir itself
    since _discover_classes handles traversal."""
    # Check for symlinked dataset folder (from upload-folder endpoint)
    dataset_link = os.path.join(job_dir, "dataset")
    if os.path.isdir(dataset_link):
        return dataset_link
    return job_dir


def _get_dataset_path(job_id: str) -> str:
    """Get the dataset path for a job."""
    job_dir = os.path.join(UPLOAD_DIR, job_id)
    if not os.path.isdir(job_dir):
        raise HTTPException(404, "Dataset not found")
    return _find_dataset_root(job_dir)
