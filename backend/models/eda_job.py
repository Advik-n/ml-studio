"""EDAJob SQLAlchemy model."""
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.orm import relationship

from database import Base


class EDAJob(Base):
    __tablename__ = "eda_jobs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    input_filename = Column(String, nullable=False)
    status = Column(String, default="pending")  # pending / processing / completed / failed
    output_folder = Column(String, nullable=True)
    notebook_path = Column(String, nullable=True)
    docx_path = Column(String, nullable=True)
    cleaned_csv_path = Column(String, nullable=True)
    zip_path = Column(String, nullable=True)
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    project = relationship("Project", back_populates="eda_jobs")
