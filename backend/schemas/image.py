from pydantic import BaseModel, field_validator
from typing import Optional, Dict, List, Any
from datetime import datetime

class ImageJobResponse(BaseModel):
    id: str
    project_id: str
    job_type: str
    status: str
    total_images: Optional[int] = 0
    num_classes: Optional[int] = 0
    class_distribution: Optional[Dict[str, Any]] = None
    resolution_stats: Optional[Dict[str, Any]] = None
    rgb_stats: Optional[Dict[str, Any]] = None
    blur_scores: Optional[Dict[str, Any]] = None
    duplicate_count: Optional[int] = 0
    eda_report: Optional[Dict[str, Any]] = None
    model_name: Optional[str] = None
    accuracy: Optional[float] = None
    metrics: Optional[Dict[str, Any]] = None
    confusion_matrix: Optional[List[List[int]]] = None
    class_names: Optional[List[str]] = None
    training_history: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class ImagePipelineConfig(BaseModel):
    model_name: str = "RandomForest"
    target_size: List[int] = [128, 128]
    test_split: float = 0.2
    augment: bool = False
    normalize: bool = True
    feature_method: str = "hog"  # hog, lbp, combined
    use_pca: bool = False
    pca_components: int = 100
    hyperparams: Optional[Dict[str, Any]] = None

    @field_validator('target_size')
    @classmethod
    def validate_target_size(cls, v):
        if len(v) != 2 or any(d < 16 or d > 1024 for d in v):
            raise ValueError('target_size must be [width, height] with values between 16 and 1024')
        return v

    @field_validator('test_split')
    @classmethod
    def validate_test_split(cls, v):
        if v <= 0.05 or v >= 0.95:
            raise ValueError('test_split must be between 0.05 and 0.95')
        return v
