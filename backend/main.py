"""
ML Studio — FastAPI application entry point.
"""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import settings
from database import Base, engine
from routers import auth, eda, pipeline, projects
from routers.image import router as image_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan (replaces deprecated on_event)
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create database tables and ensure uploads directory exists on startup."""
    Base.metadata.create_all(bind=engine)
    _run_migrations(engine)
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    logger.info("Database tables created (or already exist).")
    logger.info("Upload directory: %s", os.path.abspath(settings.UPLOAD_DIR))
    yield  # app runs here
    # shutdown logic (if any) goes after yield


def _run_migrations(eng):
    """Add missing columns to existing tables (lightweight auto-migration)."""
    from sqlalchemy import text, inspect as sa_inspect
    insp = sa_inspect(eng)

    # image_jobs migrations
    if "image_jobs" in insp.get_table_names():
        existing = {c["name"] for c in insp.get_columns("image_jobs")}
        # Use TEXT for cross-DB compat (SQLite + PostgreSQL)
        migrations = [
            ("class_names", "TEXT"),
        ]
        with eng.begin() as conn:
            for col_name, col_type in migrations:
                if col_name not in existing:
                    conn.execute(text(f"ALTER TABLE image_jobs ADD COLUMN {col_name} {col_type}"))
                    logger.info("Added column image_jobs.%s", col_name)


app = FastAPI(
    title="ML Studio API",
    description="Backend API for the ML Studio web application.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS — allow all origins in development
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(",") if settings.CORS_ORIGINS != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(eda.router)
app.include_router(pipeline.router)
app.include_router(image_router)

# ---------------------------------------------------------------------------
# Static file serving for generated outputs
# ---------------------------------------------------------------------------
UPLOAD_DIR = settings.UPLOAD_DIR
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/static/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/", tags=["Health"])
def health_check():
    """Simple liveness probe."""
    return {"status": "ok", "service": "ML Studio API"}


@app.get("/health", tags=["Health"])
def health():
    """Detailed health check."""
    return {
        "status": "ok",
        "version": "1.0.0",
    }
