# ML Studio — Deployment Status Report
Generated: 2026-03-20

## 📊 Current Deployment Status

| Service | Platform | URL | Status |
|---------|----------|-----|--------|
| **Frontend** | Vercel | `https://frontend-j0l339s7z-advik-ns-projects.vercel.app` | ✅ **Deployed** |
| **Backend** | HuggingFace Spaces | `https://x0advik-ml-studio-api.hf.space` | ✅ **Deployed** |
| **Database** | Supabase | Not configured | ⚠️ **SETUP REQUIRED** |

---

## ⚠️ Issue: User Data Not Persisting

**Root Cause:** The HuggingFace Spaces backend is using SQLite as the default database, which is stored in ephemeral container storage. When the Space restarts (due to inactivity, updates, or scaling), the SQLite database file is lost.

**Solution:** Connect to Supabase PostgreSQL for persistent storage.

---

## 🛠️ How to Fix: Set Up Supabase (5 minutes)

### Step 1: Create Supabase Project (if not already done)

1. Go to [supabase.com](https://supabase.com)
2. Sign in with GitHub
3. Click **New Project**
4. Choose a name (e.g., `ml-studio`)
5. **SAVE your database password** - you'll need it!
6. Wait 1-2 minutes for the project to initialize

### Step 2: Create Database Tables

1. In your Supabase project, go to **SQL Editor**
2. Click **New Query**
3. Paste this SQL (from `deploy/supabase/schema.sql`):

```sql
-- Users
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

-- Projects
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

-- EDA Jobs
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

-- Pipeline Jobs
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

-- Image Jobs
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
```

4. Click **Run** ✅

### Step 3: Get Your Connection String

1. In Supabase, go to **Settings → Database**
2. Scroll to **Connection string → URI**
3. Select **Transaction pooler** (port 6543)
4. Copy the connection string - it looks like:
   ```
   postgresql://postgres.[PROJECT_REF]:[YOUR_PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   ```
5. Replace `[YOUR_PASSWORD]` with your actual database password

### Step 4: Update HuggingFace Space Secret

1. Go to your HuggingFace Space: [x0advik/ml-studio-api](https://huggingface.co/spaces/x0advik/ml-studio-api/settings)
2. Click **Settings** tab
3. Scroll to **Repository Secrets**
4. Click **New secret**
5. Add:
   - **Name:** `DATABASE_URL`
   - **Value:** Your Supabase connection string from Step 3
6. Click **Add**
7. The Space will automatically restart

### Step 5: Verify

1. Wait 30-60 seconds for the Space to rebuild
2. Go to your ML Studio app and try registering a new user
3. Log out and log back in - your data should persist!

---

## 📁 Files Created

| File | Purpose |
|------|---------|
| `deploy/quick_supabase_setup.sh` | Interactive setup script (run locally) |
| `deploy/setup_supabase.sh` | Full automated setup with CLI |
| `deploy/supabase_deploy.py` | Python setup script |
| `deploy/supabase/schema.sql` | Database schema for Supabase |

---

## 🔗 Quick Links

- **Frontend:** https://frontend-j0l339s7z-advik-ns-projects.vercel.app
- **Backend Health:** https://x0advik-ml-studio-api.hf.space/health
- **Backend API Docs:** https://x0advik-ml-studio-api.hf.space/docs
- **Supabase Dashboard:** https://supabase.com/dashboard
- **HF Space Settings:** https://huggingface.co/spaces/x0advik/ml-studio-api/settings
- **Vercel Dashboard:** https://vercel.com/advik-ns-projects/frontend

---

## 📝 Notes

- The backend auto-detects SQLite vs PostgreSQL based on the `DATABASE_URL` format
- File uploads are stored in `/data/uploads` on HuggingFace Spaces (persistent storage)
- The frontend uses `NEXT_PUBLIC_API_URL` which is already configured on Vercel
- User JWT tokens expire after 60 minutes by default
