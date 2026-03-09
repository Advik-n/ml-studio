# ML Studio — Deployment Guide

Three-service architecture: **Vercel** (frontend) → **Render / HuggingFace** (backend) → **Supabase** (database).

---

## 1. Supabase (Database) — Set Up First

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

## 2A. Render (Backend) — Option A

1. Go to [render.com](https://render.com) → **New → Blueprint**
2. Connect your GitHub repo
3. Render auto-detects `render.yaml` at the root
4. Set the required environment variables:

   | Variable | Value |
   |----------|-------|
   | `DATABASE_URL` | Supabase connection string from step 1 |
   | `CORS_ORIGINS` | Your Vercel URL (e.g. `https://ml-studio.vercel.app`) |
   | `FRONTEND_URL` | Same as CORS_ORIGINS |

5. Deploy — Render builds the Docker image from `backend/Dockerfile`

> **Note**: Render provides a persistent disk at `/data` for file uploads.

---

## 2B. HuggingFace Spaces (Backend) — Option B

1. Go to [huggingface.co/spaces](https://huggingface.co/spaces) → **Create new Space**
2. Select **Docker** as the SDK
3. Clone the Space repo, copy the `backend/` directory contents into it
4. Copy `deploy/huggingface/README.md` to the Space repo root (replace the default)
5. Set **Secrets** in Space settings:

   | Secret | Value |
   |--------|-------|
   | `DATABASE_URL` | Supabase connection string |
   | `SECRET_KEY` | Generate a random 32+ char string |
   | `CORS_ORIGINS` | Your Vercel URL |
   | `FRONTEND_URL` | Same as CORS_ORIGINS |

6. Push — HF builds and deploys automatically

> **Note**: HF Spaces provides persistent storage at `/data` automatically.

---

## 3. Vercel (Frontend)

1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import your GitHub repo
3. Set **Root Directory** to `frontend`
4. Set environment variable:

   | Variable | Value |
   |----------|-------|
   | `NEXT_PUBLIC_API_URL` | Your backend URL (Render or HF Spaces) |

   Examples:
   - Render: `https://ml-studio-api.onrender.com`
   - HF Spaces: `https://your-username-ml-studio.hf.space`

5. Deploy — Vercel auto-detects Next.js from `vercel.json`

---

## Architecture Diagram

```
┌─────────────┐     HTTPS      ┌──────────────────┐     PostgreSQL    ┌───────────┐
│   Vercel     │ ──────────────→│  Render / HF     │ ────────────────→│ Supabase  │
│  (Next.js)   │                │  (FastAPI)       │                   │  (Postgres)│
│  Frontend    │←───────────────│  Backend         │←──────────────────│  Database  │
└─────────────┘    JSON API     └──────────────────┘    SQLAlchemy     └───────────┘
                                       │
                                  /data/uploads
                                (Persistent Disk)
```

---

## Environment Variables Summary

### Frontend (Vercel)
| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | ✅ | Backend API URL |

### Backend (Render / HF Spaces)
| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | Supabase PostgreSQL URI |
| `SECRET_KEY` | ✅ | JWT signing key (Render auto-generates) |
| `CORS_ORIGINS` | ✅ | Vercel frontend URL |
| `FRONTEND_URL` | ✅ | Vercel frontend URL |
| `UPLOAD_DIR` | ❌ | Auto-detected (`/data/uploads`) |
| `MAX_UPLOAD_SIZE_MB` | ❌ | Default: 100 |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | ❌ | Default: 60 |

---

## Troubleshooting

**CORS errors**: Ensure `CORS_ORIGINS` on the backend exactly matches your Vercel URL (no trailing slash).

**Database connection fails**: Use the **Transaction pooler** URI (port `6543`), not the direct connection (port `5432`).

**Uploads disappear on Render**: Ensure the disk is mounted. Free tier has no persistent disk — use Starter plan.

**HF Space sleeps**: Free HF Spaces sleep after inactivity. Upgrade to a persistent Space or use Render.
