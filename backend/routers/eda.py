"""EDA router."""
import logging
import os
from datetime import datetime
from typing import List

import aiofiles
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models.eda_job import EDAJob
from models.project import Project
from models.user import User
from schemas.eda import EDAJobResponse
from services.eda_service import generate_eda
from utils.dependencies import require_verified_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/eda", tags=["EDA"])

ALLOWED_EXTENSIONS = {".csv", ".tsv", ".xls", ".xlsx", ".json", ".parquet"}


async def _run_eda_job(job_id: str, file_path: str, project_folder: str, db_url: str) -> None:
    """Background task: execute EDA and update job record in DB."""
    # Each background task needs its own DB session to avoid threading issues
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    engine = create_engine(db_url, connect_args={"check_same_thread": False})
    Session_ = sessionmaker(bind=engine)
    db = Session_()

    job = db.query(EDAJob).filter(EDAJob.id == job_id).first()
    if not job:
        db.close()
        return

    job.status = "processing"
    db.commit()

    try:
        result = await generate_eda(file_path, project_folder, job_id)
        job.status = "completed"
        job.output_folder = result["output_folder"]
        job.notebook_path = result["notebook_path"]
        job.docx_path = result["docx_path"]
        job.cleaned_csv_path = result["cleaned_csv_path"]
        job.zip_path = result["zip_path"]
        job.completed_at = datetime.utcnow()
    except Exception as exc:
        logger.exception("EDA job %s failed: %s", job_id, exc)
        job.status = "failed"
        job.error_message = str(exc)
        job.completed_at = datetime.utcnow()
    finally:
        db.commit()
        db.close()


@router.post("/{project_id}/upload", response_model=EDAJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_for_eda(
    project_id: str,
    file: UploadFile,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """Upload a dataset file and kick off EDA generation in the background."""
    project = db.query(Project).filter(
        Project.id == project_id, Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    ext = os.path.splitext(file.filename or "")[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # Persist uploaded file
    uploads_dir = os.path.join(project.folder_path, "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    dest_path = os.path.join(uploads_dir, file.filename)
    async with aiofiles.open(dest_path, "wb") as out_file:
        while chunk := await file.read(1024 * 1024):  # 1 MB chunks
            await out_file.write(chunk)

    job = EDAJob(
        project_id=project_id,
        input_filename=file.filename,
        status="pending",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    background_tasks.add_task(
        _run_eda_job, job.id, dest_path, project.folder_path, settings.DATABASE_URL
    )
    return job


@router.get("/{project_id}/jobs", response_model=List[EDAJobResponse])
def list_eda_jobs(
    project_id: str,
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """List all EDA jobs for a project."""
    project = db.query(Project).filter(
        Project.id == project_id, Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return db.query(EDAJob).filter(EDAJob.project_id == project_id).all()


@router.get("/jobs/{job_id}", response_model=EDAJobResponse)
def get_eda_job(
    job_id: str,
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """Get the status/result of a single EDA job."""
    job = db.query(EDAJob).filter(EDAJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="EDA job not found.")
    # Ensure the job belongs to a project owned by the current user
    project = db.query(Project).filter(
        Project.id == job.project_id, Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    return job


@router.get("/jobs/{job_id}/download")
def download_eda_output(
    job_id: str,
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """Download the zipped EDA output (or notebook if zip unavailable)."""
    job = db.query(EDAJob).filter(EDAJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="EDA job not found.")
    project = db.query(Project).filter(
        Project.id == job.project_id, Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    if job.status != "completed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Job not completed yet.")

    # Prefer zip, fall back to notebook
    download_path = job.zip_path or job.notebook_path
    if not download_path or not os.path.exists(download_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Output file not found on disk.")

    media_type = "application/zip" if download_path.endswith(".zip") else "application/octet-stream"
    return FileResponse(download_path, media_type=media_type, filename=os.path.basename(download_path))


@router.get("/jobs/{job_id}/files/{kind}")
def download_eda_file(
    job_id: str,
    kind: str,
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """Download a specific EDA artifact."""
    job = db.query(EDAJob).filter(EDAJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="EDA job not found.")
    project = db.query(Project).filter(
        Project.id == job.project_id, Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    if job.status != "completed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Job not completed yet.")

    path_map = {
        "zip": job.zip_path or job.notebook_path,
        "docx": job.docx_path,
        "cleaned": job.cleaned_csv_path,
        "notebook": job.notebook_path,
    }
    download_path = path_map.get(kind)
    if not download_path or not os.path.exists(download_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requested file not found.")

    media_types = {
        "zip": "application/zip",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "cleaned": "text/csv",
        "notebook": "application/octet-stream",
    }
    return FileResponse(
        download_path,
        media_type=media_types.get(kind, "application/octet-stream"),
        filename=os.path.basename(download_path),
    )
