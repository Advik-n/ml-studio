"""Pydantic schemas for projects."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    project_type: str  # eda / pipeline / mixed


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    project_type: str
    folder_path: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
