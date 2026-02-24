"""Projects router."""
import logging
import os
import shutil

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models.project import Project
from schemas.project import ProjectCreate, ProjectResponse
from utils.dependencies import require_verified_user
from models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["Projects"])


@router.get("", response_model=list[ProjectResponse])
def list_projects(
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """Return all projects belonging to the current user."""
    return db.query(Project).filter(Project.user_id == current_user.id).all()


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """Create a new project and its output folder."""
    project = Project(
        name=payload.name,
        description=payload.description,
        user_id=current_user.id,
        project_type=payload.project_type,
        folder_path="",  # filled in after we know the ID
    )
    db.add(project)
    db.flush()  # populate project.id

    folder_path = os.path.join(settings.UPLOAD_DIR, current_user.id, project.id)
    os.makedirs(folder_path, exist_ok=True)
    project.folder_path = folder_path
    db.commit()
    db.refresh(project)
    logger.info("Project %s created for user %s", project.id, current_user.id)
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: str,
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """Return a single project by ID (must belong to current user)."""
    project = db.query(Project).filter(
        Project.id == project_id, Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: str,
    current_user: User = Depends(require_verified_user),
    db: Session = Depends(get_db),
):
    """Delete a project and all its associated files."""
    project = db.query(Project).filter(
        Project.id == project_id, Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    folder_path = project.folder_path
    db.delete(project)
    db.commit()

    if folder_path and os.path.isdir(folder_path):
        shutil.rmtree(folder_path, ignore_errors=True)
    logger.info("Project %s deleted", project_id)
