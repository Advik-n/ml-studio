"""Project SQLAlchemy model."""
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.orm import relationship

from database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    project_type = Column(String, nullable=False)  # eda / pipeline / mixed
    folder_path = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner = relationship("User", back_populates="projects")
    eda_jobs = relationship("EDAJob", back_populates="project", cascade="all, delete-orphan")
    pipeline_jobs = relationship("PipelineJob", back_populates="project", cascade="all, delete-orphan")
