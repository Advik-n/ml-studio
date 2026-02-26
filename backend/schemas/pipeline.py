"""Pydantic schemas for pipeline jobs."""
from datetime import datetime
from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, ConfigDict


class PipelineConfig(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    dataset_filename: str
    model_type: str          # classification / regression / clustering
    model_name: str
    transformers: List[str] = []
    test_size: float = 0.2
    target_column: Optional[Union[str, List[str]]] = None
    feature_columns: Optional[List[str]] = None
    hyperparams: Optional[Dict[str, Any]] = None


class PipelineJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    id: str
    project_id: str
    model_type: Optional[str]
    model_name: Optional[str]
    dataset_filename: Optional[str]
    transformers: Optional[str]
    test_size: Optional[float]
    target_column: Optional[str]
    feature_columns: Optional[str]
    hyperparams: Optional[str]
    status: str
    accuracy: Optional[float]
    metrics: Optional[str]
    notebook_path: Optional[str]
    model_path: Optional[str]
    error_message: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]


class PredictRequest(BaseModel):
    features: Dict[str, Any]


class PredictResponse(BaseModel):
    prediction: Any
    confidence: Optional[float] = None
    probabilities: Optional[Dict[str, float]] = None
