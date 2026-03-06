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

class ImageEDAConfig(BaseModel):
    file_type: str = "image"  # image, csv, txt, json — for future NLP processing
    max_sample: int = 500

    @field_validator('file_type')
    @classmethod
    def validate_file_type(cls, v):
        allowed = {"image", "csv", "txt", "json", "tsv", "parquet", "jsonl"}
        if v not in allowed:
            raise ValueError(f'file_type must be one of {allowed}')
        return v


class ImagePipelineConfig(BaseModel):
    model_name: str = "RandomForest"
    target_size: List[int] = [128, 128]
    test_split: float = 0.2
    augment: bool = False
    normalize: bool = True
    feature_method: str = "hog"  # hog, lbp, combined
    use_pca: bool = False
    pca_components: int = 100
    file_type: str = "image"  # image, csv, txt, json — for future NLP processing
    hyperparams: Optional[Dict[str, Any]] = None
    # Deep learning fields
    epochs: int = 10
    batch_size: int = 32
    learning_rate: float = 0.001
    use_pretrained: bool = True
    freeze_backbone: bool = True
    optimizer: str = "adam"  # adam, sgd, adamw
    scheduler: str = "none"  # none, cosine, step
    early_stopping: bool = True
    patience: int = 3
    data_augmentation: Optional[Dict[str, Any]] = None

    @field_validator('model_name')
    @classmethod
    def validate_model_name(cls, v):
        sklearn_models = {
            "RandomForest", "SVM", "KNN", "LogisticRegression",
            "GradientBoosting", "ExtraTrees", "XGBoost", "LightGBM",
        }
        dl_models = {
            "CNN_Simple", "CNN_ResNet", "CNN_VGG", "CNN_MobileNet",
            "CNN_EfficientNet", "ViT_Small",
        }
        allowed = sklearn_models | dl_models
        if v not in allowed:
            raise ValueError(f'model_name must be one of {sorted(allowed)}')
        return v

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
