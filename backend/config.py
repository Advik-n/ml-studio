"""Application configuration using pydantic-settings."""
import os
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_db_url() -> str:
    """Use /data for persistent storage on HuggingFace Spaces, else local."""
    if os.path.isdir("/data"):
        os.makedirs("/data/db", exist_ok=True)
        return "sqlite:////data/db/ml_studio.db"
    return "sqlite:///./ml_studio.db"


def _default_upload_dir() -> str:
    if os.path.isdir("/data"):
        d = "/data/uploads"
        os.makedirs(d, exist_ok=True)
        return d
    return "./uploads"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    SECRET_KEY: str = "ml-studio-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    DATABASE_URL: str = ""
    MAX_USERS: int = 10000
    UPLOAD_DIR: str = ""
    MAX_UPLOAD_SIZE_MB: int = 100

    # SMTP settings (optional — if not set, codes are printed to console)
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    BASE_URL: str = "http://localhost:8000"
    FRONTEND_URL: str = "http://localhost:3000"
    CORS_ORIGINS: str = "*"

    def model_post_init(self, __context) -> None:
        if not self.DATABASE_URL:
            self.DATABASE_URL = _default_db_url()
        if not self.UPLOAD_DIR:
            self.UPLOAD_DIR = _default_upload_dir()


settings = Settings()
