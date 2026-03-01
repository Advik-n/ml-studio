from sqlalchemy import Column, String, Float, Integer, DateTime, JSON, Text
from sqlalchemy.sql import func
from database import Base

class ImageJob(Base):
    __tablename__ = "image_jobs"
    
    id = Column(String, primary_key=True)
    project_id = Column(String, nullable=False, index=True)
    job_type = Column(String, nullable=False)  # "image_eda" or "image_pipeline"
    status = Column(String, default="pending")  # pending, processing, completed, failed
    
    # Image EDA fields
    total_images = Column(Integer, default=0)
    num_classes = Column(Integer, default=0)
    class_distribution = Column(JSON, nullable=True)
    resolution_stats = Column(JSON, nullable=True)
    rgb_stats = Column(JSON, nullable=True)
    blur_scores = Column(JSON, nullable=True)
    duplicate_count = Column(Integer, default=0)
    eda_report = Column(JSON, nullable=True)
    
    # Image Pipeline fields
    model_name = Column(String, nullable=True)
    accuracy = Column(Float, nullable=True)
    metrics = Column(JSON, nullable=True)
    confusion_matrix = Column(JSON, nullable=True)
    training_history = Column(JSON, nullable=True)
    
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
