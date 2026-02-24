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
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    logger.info("Database tables created (or already exist).")
    logger.info("Upload directory: %s", os.path.abspath(settings.UPLOAD_DIR))
    yield  # app runs here
    # shutdown logic (if any) goes after yield


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
    allow_origins=["*"],
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
        "database": settings.DATABASE_URL,
        "upload_dir": settings.UPLOAD_DIR,
    }
