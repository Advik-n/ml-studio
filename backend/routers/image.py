import os
import uuid
import shutil
import zipfile
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session
from database import get_db
from models.image_job import ImageJob
from schemas.image import ImageJobResponse, ImagePipelineConfig
from models.project import Project
from services import image_service

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
    db: Session = Depends(get_db),
):
    """Upload a ZIP file containing image dataset with class folders."""
    project = db.query(Project).filter(Project.id == project_id).first()
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
        content = await file.read()
        if len(content) > MAX_UPLOAD_SIZE:
            raise HTTPException(413, "File too large. Maximum 500MB.")
        
        with open(zip_path, "wb") as f:
            f.write(content)
        
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
    db: Session = Depends(get_db),
):
    """Register a local folder as image dataset (for testing)."""
    project = db.query(Project).filter(Project.id == project_id).first()
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
    db: Session = Depends(get_db),
):
    """Run image EDA analysis on uploaded dataset."""
    job = db.query(ImageJob).filter(ImageJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    
    dataset_path = _get_dataset_path(job_id)
    
    try:
        job.status = "processing"
        db.commit()
        
        result = image_service.run_image_eda(dataset_path)
        
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
    db: Session = Depends(get_db),
):
    """Train image classification model."""
    job = db.query(ImageJob).filter(ImageJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    
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
        
        result = image_service.run_image_pipeline(dataset_path, config.model_dump())
        
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
        }
        pipeline_job.confusion_matrix = result["confusion_matrix"]
        pipeline_job.total_images = result["total_samples"]
        pipeline_job.num_classes = len(result["class_names"])
        pipeline_job.class_distribution = {name: 0 for name in result["class_names"]}
        db.commit()
        db.refresh(pipeline_job)
        
        return pipeline_job
    except Exception as e:
        logger.exception(f"Pipeline failed: {e}")
        raise HTTPException(500, f"Pipeline failed: {str(e)}")


@router.get("/jobs/{job_id}", response_model=ImageJobResponse)
async def get_image_job(
    job_id: str,
    db: Session = Depends(get_db),
):
    """Get image job status and results."""
    job = db.query(ImageJob).filter(ImageJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@router.get("/{project_id}/jobs", response_model=list[ImageJobResponse])
async def list_image_jobs(
    project_id: str,
    db: Session = Depends(get_db),
):
    """List all image jobs for a project."""
    jobs = db.query(ImageJob).filter(
        ImageJob.project_id == project_id
    ).order_by(ImageJob.created_at.desc()).all()
    return jobs


def _find_dataset_root(job_dir: str) -> str:
    """Find the root directory containing class folders."""
    # Check if job_dir directly has class folders
    entries = [e for e in os.listdir(job_dir) if os.path.isdir(os.path.join(job_dir, e))]
    
    # Check for a symlinked dataset folder
    dataset_link = os.path.join(job_dir, "dataset")
    if os.path.isdir(dataset_link):
        return dataset_link
    
    # Check if entries have image files (indicating class folders)
    for entry in entries:
        entry_path = os.path.join(job_dir, entry)
        files = os.listdir(entry_path)
        if any(f.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp')) for f in files):
            return job_dir
        # Check one level deeper
        sub_entries = [e for e in os.listdir(entry_path) if os.path.isdir(os.path.join(entry_path, e))]
        for sub in sub_entries:
            sub_path = os.path.join(entry_path, sub)
            sub_files = os.listdir(sub_path)
            if any(f.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp')) for f in sub_files):
                return entry_path
    
    return job_dir


def _get_dataset_path(job_id: str) -> str:
    """Get the dataset path for a job."""
    job_dir = os.path.join(UPLOAD_DIR, job_id)
    if not os.path.isdir(job_dir):
        raise HTTPException(404, "Dataset not found")
    return _find_dataset_root(job_dir)
