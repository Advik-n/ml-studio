"""PipelineJob SQLAlchemy model."""
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, String
from sqlalchemy.orm import relationship

from database import Base


class PipelineJob(Base):
    __tablename__ = "pipeline_jobs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    dataset_filename = Column(String, nullable=True)
    model_type = Column(String, nullable=True)       # classification / regression / clustering / nlp / image
    model_name = Column(String, nullable=True)
    transformers = Column(String, nullable=True)     # JSON string
    test_size = Column(Float, default=0.2)
    target_column = Column(String, nullable=True)
    feature_columns = Column(String, nullable=True)  # JSON string
    hyperparams = Column(String, nullable=True)      # JSON string
    status = Column(String, default="pending")       # pending / processing / completed / failed
    notebook_path = Column(String, nullable=True)
    model_path = Column(String, nullable=True)
    accuracy = Column(Float, nullable=True)
    metrics = Column(String, nullable=True)          # JSON string
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    project = relationship("Project", back_populates="pipeline_jobs")
