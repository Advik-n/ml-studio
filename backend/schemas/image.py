from pydantic import BaseModel
from typing import Optional, Dict, List, Any
from datetime import datetime

class ImageJobResponse(BaseModel):
    id: str
    project_id: str
    job_type: str
    status: str
    total_images: Optional[float] = 0
    num_classes: Optional[float] = 0
    class_distribution: Optional[Dict[str, Any]] = None
    resolution_stats: Optional[Dict[str, Any]] = None
    rgb_stats: Optional[Dict[str, Any]] = None
    blur_scores: Optional[Dict[str, Any]] = None
    duplicate_count: Optional[float] = 0
    eda_report: Optional[Dict[str, Any]] = None
    model_name: Optional[str] = None
    accuracy: Optional[float] = None
    metrics: Optional[Dict[str, Any]] = None
    confusion_matrix: Optional[List[List[int]]] = None
    training_history: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class ImagePipelineConfig(BaseModel):
    target_size: List[int] = [128, 128]
    model_name: str = "RandomForest"
    test_split: float = 0.2
    augment: bool = False
    normalize: bool = True
    hyperparams: Optional[Dict[str, Any]] = None
