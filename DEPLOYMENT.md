# ML Studio — Deployment Guide

Three-service architecture: **Vercel** (frontend) → **HuggingFace Spaces** (backend) → **Supabase** (database).

---

## Current Deployment Status

| Service | Platform | URL | Status |
|---------|----------|-----|--------|
| Frontend | Vercel | https://ml-studio.vercel.app | ✅ Deployed |
| Backend | HuggingFace Spaces | https://x0advik-ml-studio-api.hf.space | ✅ Deployed |
| Database | Supabase | — | ⚠️ **Needs Setup** |

> **⚠️ CRITICAL:** The backend currently uses ephemeral SQLite storage. User data is lost on each Space restart. Follow Step 1 below to set up persistent Supabase storage.

---

## 1. Supabase (Database) — **REQUIRED FOR DATA PERSISTENCE**

### Quick Setup (Automated)
```bash
cd deploy
bash quick_supabase_setup.sh
```

### Manual Setup

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Save your **database password** — you'll need it
3. Go to **SQL Editor** → **New Query**
4. Paste the contents of `deploy/supabase/schema.sql` → **Run**
5. Go to **Settings → Database → Connection string → URI**
6. Copy the connection string (use **Transaction pooler** on port `6543`):
   ```
   postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
   ```

---

## 2. HuggingFace Spaces (Backend) — Already Deployed

The backend is deployed at: `https://x0advik-ml-studio-api.hf.space`

**To connect Supabase:**

1. Go to [HuggingFace Space Settings](https://huggingface.co/spaces/x0advik/ml-studio-api/settings)
2. Add the following **Secret**:

   | Secret | Value |
   |--------|-------|
   | `DATABASE_URL` | Your Supabase connection string |

3. The Space will automatically restart and use Supabase

> **Note**: Other secrets like `SECRET_KEY`, `CORS_ORIGINS`, and `FRONTEND_URL` are optional on HF Spaces as they have sensible defaults.

---

## 3. Vercel (Frontend) — Already Deployed

The frontend is deployed at: `https://ml-studio.vercel.app`

Environment variable (already set):
- `NEXT_PUBLIC_API_URL` = `https://x0advik-ml-studio-api.hf.space`

---

## Architecture Diagram

```
┌─────────────┐     HTTPS      ┌──────────────────┐     PostgreSQL    ┌───────────┐
│   Vercel    │ ──────────────→│  HuggingFace     │ ────────────────→│ Supabase  │
│  (Next.js)  │                │  Spaces          │                   │ (Postgres)│
│  Frontend   │←───────────────│  (FastAPI)       │←──────────────────│ Database  │
└─────────────┘    JSON API    └──────────────────┘    SQLAlchemy     └───────────┘
     ↑                                │
     │                          /data/uploads
ml-studio.vercel.app         (Persistent Storage)
```

---

## Environment Variables Summary

### Frontend (Vercel)
| Variable | Required | Description | Current Value |
|----------|----------|-------------|---------------|
| `NEXT_PUBLIC_API_URL` | ✅ | Backend API URL | `https://x0advik-ml-studio-api.hf.space` |

### Backend (HuggingFace Spaces)
| Variable | Required | Description | Status |
|----------|----------|-------------|--------|
| `DATABASE_URL` | ✅ | Supabase PostgreSQL URI | ⚠️ **Not Set** |
| `SECRET_KEY` | ❌ | JWT signing key (auto-generated) | ✅ Default |
| `CORS_ORIGINS` | ❌ | Vercel frontend URL | ✅ Default (`*`) |
| `FRONTEND_URL` | ❌ | Vercel frontend URL | ✅ Default |
| `UPLOAD_DIR` | ❌ | Auto-detected (`/data/uploads`) | ✅ Auto |
| `MAX_UPLOAD_SIZE_MB` | ❌ | Default: 100 | ✅ Default |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | ❌ | Default: 60 | ✅ Default |

---

## Troubleshooting

**User data disappearing**: The `DATABASE_URL` secret is not set on HuggingFace Spaces. Follow Step 1 to set up Supabase.

**CORS errors**: Ensure `CORS_ORIGINS` on the backend exactly matches your Vercel URL (no trailing slash).

**Database connection fails**: Use the **Transaction pooler** URI (port `6543`), not the direct connection (port `5432`).

**HF Space sleeps**: Free HF Spaces sleep after inactivity. Data persists in Supabase when the Space wakes up.
