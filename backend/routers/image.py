import os
import uuid
import shutil
import zipfile
import logging
import asyncio
import hashlib
from typing import Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session
from database import get_db
from models.image_job import ImageJob
from models.user import User
from schemas.image import ImageJobResponse, ImagePipelineConfig, ImageEDAConfig
from models.project import Project
from services import image_service
from services import agritech_service, meditech_service
from utils.dependencies import require_verified_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/image", tags=["image"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "images")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {".zip"}
MAX_UPLOAD_SIZE = 500 * 1024 * 1024  # 500MB

# LRU cache for zip hashes (max 50 entries)
from functools import lru_cache
from collections import OrderedDict

class _LRUCache:
    def __init__(self, maxsize=50):
        self._data: OrderedDict = OrderedDict()
        self._maxsize = maxsize
    def get(self, key, default=None):
        if key in self._data:
            self._data.move_to_end(key)
            return self._data[key]
        return default
    def __setitem__(self, key, value):
        if key in self._data:
            self._data.move_to_end(key)
        self._data[key] = value
        while len(self._data) > self._maxsize:
            self._data.popitem(last=False)
    def __contains__(self, key):
        return key in self._data

_zip_cache = _LRUCache(50)

SKIP_ZIP_ENTRIES = {'__MACOSX', '.DS_Store', 'Thumbs.db', '._.'}


def _should_skip_zip_entry(name: str) -> bool:
    """Check if a zip entry should be skipped."""
    parts = name.split('/')
    for part in parts:
        if part in SKIP_ZIP_ENTRIES or part.startswith('._') or part.startswith('__MACOSX'):
            return True
    return False


def _extract_nested_zips(directory: str, depth: int = 0) -> None:
    """Recursively extract any .zip files found inside the extracted directory."""
    if depth > 3:  # Prevent infinite nesting
        return
    for root, dirs, files in os.walk(directory):
        for fname in files:
            if fname.lower().endswith('.zip'):
                nested_zip = os.path.join(root, fname)
                try:
                    if not zipfile.is_zipfile(nested_zip):
                        continue
                    with zipfile.ZipFile(nested_zip, 'r') as zf:
                        for member in zf.infolist():
                            if member.filename.startswith('/') or '..' in member.filename:
                                continue
                            if _should_skip_zip_entry(member.filename):
                                continue
                            if member.is_dir():
                                os.makedirs(os.path.join(root, member.filename), exist_ok=True)
                                continue
                            zf.extract(member, root)
                    os.remove(nested_zip)
                    logger.info(f"Extracted nested zip: {fname} ({depth})")
                    _extract_nested_zips(root, depth + 1)
                except Exception as e:
                    logger.warning(f"Failed to extract nested zip {fname}: {e}")


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
        CHUNK_SIZE = 8 * 1024 * 1024  # 8MB chunks for faster I/O
        file_hash = hashlib.sha256()
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
                file_hash.update(chunk)

        zip_hash = file_hash.hexdigest()

        # Check cache — if same zip was already extracted, reuse
        if zip_hash in _zip_cache and os.path.isdir(_zip_cache[zip_hash]):
            cached_dir = _zip_cache[zip_hash]
            # Create symlink to cached extraction
            os.remove(zip_path)
            link_path = os.path.join(job_dir, "dataset")
            os.symlink(cached_dir, link_path)
        else:
            # Extract ZIP, skipping junk entries
            with zipfile.ZipFile(zip_path, 'r') as zf:
                for member in zf.infolist():
                    # Security: check for path traversal
                    if member.filename.startswith('/') or '..' in member.filename:
                        continue
                    # Skip junk entries
                    if _should_skip_zip_entry(member.filename):
                        continue
                    # Skip directories (they'll be created by file extraction)
                    if member.is_dir():
                        os.makedirs(os.path.join(job_dir, member.filename), exist_ok=True)
                        continue
                    zf.extract(member, job_dir)

            os.remove(zip_path)  # Remove zip after extraction

            # Handle nested zips (zip-inside-zip)
            _extract_nested_zips(job_dir)

            _zip_cache[zip_hash] = job_dir
        
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
    config: Optional[ImageEDAConfig] = None,
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
    
    eda_config = config or ImageEDAConfig()
    dataset_path = _get_dataset_path(job_id)
    
    try:
        job.status = "processing"
        db.commit()
        
        result = await asyncio.to_thread(
            image_service.run_image_eda, dataset_path,
            max_sample=eda_config.max_sample,
            file_type=eda_config.file_type,
        )
        
        job.status = "completed"
        job.total_images = result["total_images"]
        job.num_classes = result["num_classes"]
        job.class_distribution = result["class_distribution"]
        job.resolution_stats = result["resolution_stats"]
        job.rgb_stats = result["rgb_stats"]
        job.blur_scores = result.get("blur_stats")
        job.duplicate_count = result["duplicate_count"]
        # Store full report including code and text
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
        # Update the existing job with pipeline results
        job.status = "processing"
        job.job_type = "image_pipeline"
        db.commit()
        
        result = await asyncio.to_thread(image_service.run_image_pipeline, dataset_path, config.model_dump())
        
        job.status = "completed"
        job.model_name = result["model_name"]
        job.accuracy = result["accuracy"]
        job.metrics = {
            "precision": result["precision"],
            "recall": result["recall"],
            "f1_score": result["f1_score"],
            "roc_auc": result.get("roc_auc"),
            "total_samples": result["total_samples"],
            "train_samples": result["train_samples"],
            "test_samples": result["test_samples"],
            "failed_loads": result.get("failed_loads", 0),
            "feature_dim": result["feature_dim"],
            "per_class_metrics": result["per_class_metrics"],
            "feature_method": result.get("feature_method", "hog"),
            "cv_scores": result.get("cv_scores"),
            "overfitting": result.get("overfitting"),
            "error_analysis": result.get("error_analysis"),
            "confidence_stats": result.get("confidence_stats"),
            "feature_importance": result.get("feature_importance"),
        }
        job.confusion_matrix = result["confusion_matrix"]
        job.total_images = result["total_samples"]
        job.num_classes = len(result["class_names"])
        job.class_names = result["class_names"]
        job.training_history = {
            "report_code": result.get("report_code", ""),
            "pipeline_report_text": result.get("pipeline_report_text", ""),
        }
        db.commit()
        db.refresh(job)
        
        return job
    except Exception as e:
        logger.exception(f"Pipeline failed: {e}")
        raise HTTPException(500, f"Pipeline failed: {str(e)}")


# ── Domain-Specific Analysis Endpoints ─────────────────────────────────────────

from pydantic import BaseModel as _BM

class DomainAnalysisConfig(_BM):
    max_sample: int = 500


@router.post("/jobs/{job_id}/run-agritech", response_model=ImageJobResponse)
async def run_agritech(
    job_id: str,
    config: DomainAnalysisConfig = DomainAnalysisConfig(),
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """Run AgriTech domain analysis on an image dataset (requires EDA first)."""
    job = db.query(ImageJob).filter(ImageJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    project = db.query(Project).filter(
        Project.id == job.project_id, Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(403, "Access denied.")

    # Need EDA results first
    eda_results = job.eda_report if isinstance(job.eda_report, dict) else {}
    dataset_path = _get_dataset_path(job_id)

    try:
        result = await asyncio.to_thread(
            agritech_service.run_agritech_analysis,
            dataset_path, eda_results, config.max_sample
        )
        # Store domain results in eda_report alongside existing data
        if not isinstance(job.eda_report, dict):
            job.eda_report = {}
        updated = dict(job.eda_report)
        updated["agritech"] = result
        updated["agritech_report_text"] = agritech_service.generate_agritech_report(result)
        updated["agritech_code"] = agritech_service.generate_agritech_code(result)
        job.eda_report = updated
        db.commit()
        db.refresh(job)
        return job
    except Exception as e:
        logger.exception(f"AgriTech analysis failed: {e}")
        raise HTTPException(500, f"AgriTech analysis failed: {str(e)}")


@router.post("/jobs/{job_id}/run-meditech", response_model=ImageJobResponse)
async def run_meditech(
    job_id: str,
    config: DomainAnalysisConfig = DomainAnalysisConfig(),
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """Run MediTech domain analysis on an image dataset (requires EDA first)."""
    job = db.query(ImageJob).filter(ImageJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    project = db.query(Project).filter(
        Project.id == job.project_id, Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(403, "Access denied.")

    eda_results = job.eda_report if isinstance(job.eda_report, dict) else {}
    dataset_path = _get_dataset_path(job_id)

    try:
        result = await asyncio.to_thread(
            meditech_service.run_meditech_analysis,
            dataset_path, eda_results, config.max_sample
        )
        if not isinstance(job.eda_report, dict):
            job.eda_report = {}
        updated = dict(job.eda_report)
        updated["meditech"] = result
        updated["meditech_report_text"] = meditech_service.generate_meditech_report(result)
        updated["meditech_code"] = meditech_service.generate_meditech_code(result)
        job.eda_report = updated
        db.commit()
        db.refresh(job)
        return job
    except Exception as e:
        logger.exception(f"MediTech analysis failed: {e}")
        raise HTTPException(500, f"MediTech analysis failed: {str(e)}")


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


@router.get("/jobs/{job_id}/download-pipeline-report")
async def download_pipeline_report(
    job_id: str,
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """Download the image pipeline report as a text document."""
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

    report_text = ""
    if job.training_history and isinstance(job.training_history, dict):
        report_text = job.training_history.get("pipeline_report_text", "")
    if not report_text:
        report_text = f"# Pipeline Report\n# Model: {job.model_name}\n# Accuracy: {job.accuracy}\n"

    return Response(
        content=report_text,
        media_type="text/plain",
        headers={"Content-Disposition": f"attachment; filename=pipeline_report_{job_id[:8]}.txt"},
    )


@router.get("/jobs/{job_id}/download-eda-code")
async def download_eda_code(
    job_id: str,
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """Download the EDA analysis as a Python script."""
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

    eda_code = ""
    if job.eda_report and isinstance(job.eda_report, dict):
        eda_code = job.eda_report.get("eda_code", "")
    if not eda_code:
        eda_code = "# No EDA code available\n"

    return Response(
        content=eda_code,
        media_type="text/x-python",
        headers={"Content-Disposition": f"attachment; filename=image_eda_{job_id[:8]}.py"},
    )


@router.get("/jobs/{job_id}/download-eda-report")
async def download_eda_report(
    job_id: str,
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """Download the EDA report as a text document."""
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

    report_text = ""
    if job.eda_report and isinstance(job.eda_report, dict):
        report_text = job.eda_report.get("eda_report_text", "")
    if not report_text:
        report_text = "# No EDA report available\n"

    return Response(
        content=report_text,
        media_type="text/plain",
        headers={"Content-Disposition": f"attachment; filename=eda_report_{job_id[:8]}.txt"},
    )


# ── Domain Report Download Endpoints ──────────────────────────────────────────

def _get_verified_job(job_id: str, current_user: User, db: Session) -> ImageJob:
    """Helper: get a completed job with access check."""
    job = db.query(ImageJob).filter(ImageJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    project = db.query(Project).filter(
        Project.id == job.project_id, Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(403, "Access denied.")
    return job


@router.get("/jobs/{job_id}/download-agritech-report")
async def download_agritech_report(
    job_id: str,
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """Download AgriTech analysis report."""
    job = _get_verified_job(job_id, current_user, db)
    text = ""
    if isinstance(job.eda_report, dict):
        text = job.eda_report.get("agritech_report_text", "")
    if not text:
        raise HTTPException(400, "No AgriTech report available. Run AgriTech analysis first.")
    return Response(content=text, media_type="text/plain",
                    headers={"Content-Disposition": f"attachment; filename=agritech_report_{job_id[:8]}.txt"})


@router.get("/jobs/{job_id}/download-agritech-code")
async def download_agritech_code(
    job_id: str,
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """Download AgriTech analysis Python code."""
    job = _get_verified_job(job_id, current_user, db)
    code = ""
    if isinstance(job.eda_report, dict):
        code = job.eda_report.get("agritech_code", "")
    if not code:
        raise HTTPException(400, "No AgriTech code available. Run AgriTech analysis first.")
    return Response(content=code, media_type="text/x-python",
                    headers={"Content-Disposition": f"attachment; filename=agritech_analysis_{job_id[:8]}.py"})


@router.get("/jobs/{job_id}/download-meditech-report")
async def download_meditech_report(
    job_id: str,
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """Download MediTech analysis report."""
    job = _get_verified_job(job_id, current_user, db)
    text = ""
    if isinstance(job.eda_report, dict):
        text = job.eda_report.get("meditech_report_text", "")
    if not text:
        raise HTTPException(400, "No MediTech report available. Run MediTech analysis first.")
    return Response(content=text, media_type="text/plain",
                    headers={"Content-Disposition": f"attachment; filename=meditech_report_{job_id[:8]}.txt"})


@router.get("/jobs/{job_id}/download-meditech-code")
async def download_meditech_code(
    job_id: str,
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """Download MediTech analysis Python code."""
    job = _get_verified_job(job_id, current_user, db)
    code = ""
    if isinstance(job.eda_report, dict):
        code = job.eda_report.get("meditech_code", "")
    if not code:
        raise HTTPException(400, "No MediTech code available. Run MediTech analysis first.")
    return Response(content=code, media_type="text/x-python",
                    headers={"Content-Disposition": f"attachment; filename=meditech_analysis_{job_id[:8]}.py"})


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
