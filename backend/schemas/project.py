"""Pydantic schemas for projects."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    project_type: str  # eda / pipeline / mixed

    @field_validator("project_type")
    @classmethod
    def validate_project_type(cls, v):
        allowed = {"eda", "pipeline", "mixed"}
        if v not in allowed:
            raise ValueError(f"project_type must be one of: {', '.join(sorted(allowed))}")
        return v


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    project_type: str
    folder_path: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
