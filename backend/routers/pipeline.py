"""Pipeline router."""
import json
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
from models.pipeline_job import PipelineJob
from models.project import Project
from models.user import User
from schemas.pipeline import PipelineConfig, PipelineJobResponse, PredictRequest, PredictResponse
from services.ml_service import build_and_run_pipeline, predict, _read_dataset
from utils.dependencies import require_verified_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/pipeline", tags=["Pipeline"])

ALLOWED_EXTENSIONS = {".csv", ".tsv", ".xls", ".xlsx", ".json", ".parquet"}
ALLOWED_MODEL_TYPES = {"classification", "regression", "clustering", "nlp"}


async def _run_pipeline_job(
    job_id: str,
    config_dict: dict,
    project_folder: str,
    dataset_path: str,
    db_url: str,
) -> None:
    """Background task: run the ML pipeline and persist results."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    engine = create_engine(db_url, connect_args={"check_same_thread": False})
    Session_ = sessionmaker(bind=engine)
    db = Session_()

    job = db.query(PipelineJob).filter(PipelineJob.id == job_id).first()
    if not job:
        db.close()
        return

    job.status = "processing"
    db.commit()

    try:
        result = await build_and_run_pipeline(config_dict, project_folder, job_id, dataset_path)
        job.status = "completed"
        job.model_path = result["model_path"]
        job.notebook_path = result["notebook_path"]
        job.model_type = result.get("model_type", job.model_type)
        job.accuracy = result.get("accuracy")
        job.metrics = result.get("metrics")
        job.completed_at = datetime.utcnow()
    except Exception as exc:
        logger.exception("Pipeline job %s failed: %s", job_id, exc)
        job.status = "failed"
        job.error_message = str(exc)
        job.completed_at = datetime.utcnow()
    finally:
        db.commit()
        db.close()


@router.post("/{project_id}/upload-dataset")
async def upload_dataset(
    project_id: str,
    file: UploadFile,
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """Upload a dataset file for a pipeline project."""
    project = db.query(Project).filter(
        Project.id == project_id, Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    ext = os.path.splitext(file.filename or "")[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{ext}'.",
        )

    uploads_dir = os.path.join(project.folder_path, "datasets")
    os.makedirs(uploads_dir, exist_ok=True)
    dest_path = os.path.join(uploads_dir, file.filename)

    async with aiofiles.open(dest_path, "wb") as out_file:
        while chunk := await file.read(1024 * 1024):
            await out_file.write(chunk)

    return {"filename": file.filename, "path": dest_path, "message": "Dataset uploaded successfully."}


@router.post("/{project_id}/configure", response_model=PipelineJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def configure_and_run(
    project_id: str,
    config: PipelineConfig,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """Configure an ML pipeline and start training in the background."""
    logger.info("Pipeline configure request: model_type=%s, model_name=%s, dataset=%s, target=%s, features=%s",
                config.model_type, config.model_name, config.dataset_filename,
                config.target_column, config.feature_columns[:3] if config.feature_columns else None)
    project = db.query(Project).filter(
        Project.id == project_id, Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    if config.model_type not in ALLOWED_MODEL_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported model_type '{config.model_type}'. Allowed: {sorted(ALLOWED_MODEL_TYPES)}",
        )

    dataset_path = os.path.join(project.folder_path, "datasets", config.dataset_filename)
    if not os.path.exists(dataset_path):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Dataset '{config.dataset_filename}' not found. Upload it first.",
        )

    df = _read_dataset(dataset_path)

    target_cols = config.target_column if isinstance(config.target_column, list) else ([config.target_column] if config.target_column else [])
    if config.model_type in {"classification", "regression", "nlp"} and not target_cols:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="target_column is required for supervised model types.",
        )
    if target_cols:
        missing = [c for c in target_cols if c not in df.columns]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Target column(s) not found in dataset: {missing}",
            )
    if config.feature_columns:
        overlap = set(config.feature_columns) & set(target_cols)
        if overlap:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Target columns cannot be used as features: {sorted(overlap)}",
            )
    if config.model_type == "nlp":
        obj_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()
        if not obj_cols:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="NLP task requires at least one text (object/string) column in the dataset. This dataset has only numeric columns — try Classification or Regression instead.",
            )

    target_value = (
        json.dumps(config.target_column)
        if isinstance(config.target_column, list)
        else (config.target_column or None)
    )

    job = PipelineJob(
        project_id=project_id,
        dataset_filename=config.dataset_filename,
        model_type=config.model_type,
        model_name=config.model_name,
        transformers=json.dumps(config.transformers),
        test_size=config.test_size,
        target_column=target_value,
        feature_columns=json.dumps(config.feature_columns) if config.feature_columns else None,
        hyperparams=json.dumps(config.hyperparams) if config.hyperparams else None,
        status="pending",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    background_tasks.add_task(
        _run_pipeline_job,
        job.id,
        config.model_dump(),
        project.folder_path,
        dataset_path,
        settings.DATABASE_URL,
    )
    return job


@router.get("/{project_id}/jobs", response_model=List[PipelineJobResponse])
def list_pipeline_jobs(
    project_id: str,
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """List all pipeline jobs for a project."""
    project = db.query(Project).filter(
        Project.id == project_id, Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return db.query(PipelineJob).filter(PipelineJob.project_id == project_id).all()


@router.get("/jobs/{job_id}", response_model=PipelineJobResponse)
def get_pipeline_job(
    job_id: str,
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """Get the status and result of a single pipeline job."""
    job = db.query(PipelineJob).filter(PipelineJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pipeline job not found.")
    project = db.query(Project).filter(
        Project.id == job.project_id, Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    return job


@router.post("/jobs/{job_id}/predict", response_model=PredictResponse)
def make_prediction(
    job_id: str,
    payload: PredictRequest,
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """Use a trained model to make a prediction on the provided features."""
    job = db.query(PipelineJob).filter(PipelineJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pipeline job not found.")
    project = db.query(Project).filter(
        Project.id == job.project_id, Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    if job.status != "completed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Model training not completed.")
    if not job.model_path or not os.path.exists(job.model_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model file not found.")

    feature_columns = json.loads(job.feature_columns) if job.feature_columns else None

    try:
        result = predict(job.model_path, payload.features, job.model_type or "classification", feature_columns)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))

    return result


@router.get("/jobs/{job_id}/download-notebook")
def download_notebook(
    job_id: str,
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """Download the pipeline Jupyter notebook."""
    job = db.query(PipelineJob).filter(PipelineJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pipeline job not found.")
    project = db.query(Project).filter(
        Project.id == job.project_id, Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    if job.status != "completed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Job not completed yet.")
    if not job.notebook_path or not os.path.exists(job.notebook_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notebook not found on disk.")

    return FileResponse(
        job.notebook_path,
        media_type="application/octet-stream",
        filename=os.path.basename(job.notebook_path),
    )
