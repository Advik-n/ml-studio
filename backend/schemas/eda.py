"""Pydantic schemas for EDA jobs."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class EDAJobResponse(BaseModel):
    id: str
    project_id: str
    input_filename: str
    status: str
    output_folder: Optional[str]
    notebook_path: Optional[str]
    docx_path: Optional[str]
    cleaned_csv_path: Optional[str]
    zip_path: Optional[str]
    error_message: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]

    model_config = {"from_attributes": True}
