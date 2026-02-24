"""Pydantic schemas for pipeline jobs."""
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class PipelineConfig(BaseModel):
    dataset_filename: str
    model_type: str          # classification / regression / clustering / nlp / image
    model_name: str
    transformers: List[str] = []
    test_size: float = 0.2
    target_column: Optional[str] = None
    feature_columns: Optional[List[str]] = None
    hyperparams: Optional[Dict[str, Any]] = None


class PipelineJobResponse(BaseModel):
    id: str
    project_id: str
    model_type: Optional[str]
    model_name: Optional[str]
    status: str
    accuracy: Optional[float]
    metrics: Optional[str]
    notebook_path: Optional[str]
    error_message: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]

    model_config = {"from_attributes": True}


class PredictRequest(BaseModel):
    features: Dict[str, Any]


class PredictResponse(BaseModel):
    prediction: Any
    confidence: Optional[float] = None
    probabilities: Optional[Dict[str, float]] = None
