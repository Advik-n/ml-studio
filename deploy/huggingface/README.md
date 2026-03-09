---
title: ML Studio API
emoji: 🧪
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 8080
pinned: false
license: mit
---

# ML Studio API — Hugging Face Spaces

FastAPI backend for the ML Studio web application.

## Setup

1. Create a new **Docker** Space on Hugging Face
2. Copy the contents of the `backend/` directory into the Space repo
3. Set the following **Secrets** in your Space settings:

| Secret | Description |
|--------|-------------|
| `DATABASE_URL` | Supabase PostgreSQL connection string |
| `SECRET_KEY` | Random secret for JWT signing |
| `CORS_ORIGINS` | Your Vercel frontend URL |
| `FRONTEND_URL` | Your Vercel frontend URL |

4. The Space will auto-build and deploy using the existing `Dockerfile`

## Notes

- Uploads are stored at `/data/uploads` (persistent storage on HF Spaces)
- The database defaults to `/data/db/ml_studio.db` if `DATABASE_URL` is not set
- Set `DATABASE_URL` to your Supabase connection string for production
