-- ══════════════════════════════════════════════════════════════════════
-- ML Studio — Supabase PostgreSQL Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ══════════════════════════════════════════════════════════════════════

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    username    TEXT NOT NULL UNIQUE,
    email       TEXT NOT NULL UNIQUE,
    hashed_password TEXT NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE,
    verification_code TEXT,
    theme       TEXT DEFAULT 'dark',
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- 2. Projects
CREATE TABLE IF NOT EXISTS projects (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    description  TEXT,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_type TEXT NOT NULL,
    folder_path  TEXT NOT NULL,
    created_at   TIMESTAMP DEFAULT NOW(),
    updated_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects (user_id);

-- 3. EDA Jobs
CREATE TABLE IF NOT EXISTS eda_jobs (
    id              TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    input_filename  TEXT NOT NULL,
    status          TEXT DEFAULT 'pending',
    output_folder   TEXT,
    notebook_path   TEXT,
    docx_path       TEXT,
    cleaned_csv_path TEXT,
    zip_path        TEXT,
    error_message   TEXT,
    created_at      TIMESTAMP DEFAULT NOW(),
    completed_at    TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_eda_jobs_project_id ON eda_jobs (project_id);

-- 4. Pipeline Jobs
CREATE TABLE IF NOT EXISTS pipeline_jobs (
    id               TEXT PRIMARY KEY,
    project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    dataset_filename TEXT,
    model_type       TEXT,
    model_name       TEXT,
    transformers     TEXT,
    test_size        DOUBLE PRECISION DEFAULT 0.2,
    target_column    TEXT,
    feature_columns  TEXT,
    hyperparams      TEXT,
    status           TEXT DEFAULT 'pending',
    notebook_path    TEXT,
    model_path       TEXT,
    accuracy         DOUBLE PRECISION,
    metrics          TEXT,
    error_message    TEXT,
    created_at       TIMESTAMP DEFAULT NOW(),
    completed_at     TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_project_id ON pipeline_jobs (project_id);

-- 5. Image Jobs
CREATE TABLE IF NOT EXISTS image_jobs (
    id                 TEXT PRIMARY KEY,
    project_id         TEXT NOT NULL,
    job_type           TEXT NOT NULL,
    status             TEXT DEFAULT 'pending',
    total_images       INTEGER DEFAULT 0,
    num_classes        INTEGER DEFAULT 0,
    class_distribution JSONB,
    resolution_stats   JSONB,
    rgb_stats          JSONB,
    blur_scores        JSONB,
    duplicate_count    INTEGER DEFAULT 0,
    eda_report         JSONB,
    model_name         TEXT,
    accuracy           DOUBLE PRECISION,
    metrics            JSONB,
    confusion_matrix   JSONB,
    class_names        JSONB,
    training_history   JSONB,
    error_message      TEXT,
    created_at         TIMESTAMP DEFAULT NOW(),
    updated_at         TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_image_jobs_project_id ON image_jobs (project_id);

-- ══════════════════════════════════════════════════════════════════════
-- Enable Row Level Security (RLS) — optional but recommended
-- ══════════════════════════════════════════════════════════════════════

-- Note: RLS is NOT enabled by default because the backend handles
-- authorization via JWT middleware. Enable only if you want
-- database-level security as an additional layer.

-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE eda_jobs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE pipeline_jobs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE image_jobs ENABLE ROW LEVEL SECURITY;
