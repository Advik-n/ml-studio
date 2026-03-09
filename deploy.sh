#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════
# ML Studio — One-Click Deployment Script
# Usage: bash deploy.sh [vercel|render|huggingface|all]
# ══════════════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }
info() { echo -e "${CYAN}[→]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
BACKEND_DIR="$SCRIPT_DIR/backend"

# ──────────────────────────────────────────────────────────────────────
deploy_vercel() {
    info "Deploying frontend to Vercel..."

    if ! command -v vercel &>/dev/null; then
        err "Vercel CLI not found. Install: npm i -g vercel"
        return 1
    fi

    cd "$FRONTEND_DIR"

    # Link if not already linked
    if [ ! -d .vercel ]; then
        info "Linking Vercel project..."
        vercel link --yes
    fi

    # Deploy to production
    DEPLOY_URL=$(vercel deploy --prod --yes 2>&1 | grep -oP 'https://[^\s]+\.vercel\.app' | tail -1)

    if [ -n "$DEPLOY_URL" ]; then
        log "Frontend deployed: $DEPLOY_URL"
        echo "$DEPLOY_URL" > "$SCRIPT_DIR/.vercel-url"
    else
        warn "Deploy ran but could not extract URL. Check: vercel ls --prod"
    fi
}

# ──────────────────────────────────────────────────────────────────────
deploy_render() {
    info "Render deployment setup..."

    if [ -z "${RENDER_API_KEY:-}" ]; then
        warn "No RENDER_API_KEY found."
        echo ""
        echo "  Manual steps:"
        echo "  1. Go to https://render.com → New → Blueprint"
        echo "  2. Connect repo: https://github.com/Advik-n/ml-studio.git"
        echo "  3. Render auto-detects render.yaml"
        echo "  4. Set environment variables:"
        echo "     DATABASE_URL  = <your Supabase connection string>"
        echo "     CORS_ORIGINS  = <your Vercel URL>"
        echo "     FRONTEND_URL  = <your Vercel URL>"
        echo ""
        return 0
    fi

    # If API key exists, create service via API
    info "Creating Render service via API..."
    RESPONSE=$(curl -s -X POST "https://api.render.com/v1/services" \
        -H "Authorization: Bearer $RENDER_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{
            "type": "web_service",
            "name": "ml-studio-api",
            "repo": "https://github.com/Advik-n/ml-studio.git",
            "branch": "main",
            "rootDir": "backend",
            "runtime": "docker",
            "dockerfilePath": "./Dockerfile",
            "plan": "starter",
            "region": "oregon",
            "healthCheckPath": "/health",
            "envVars": [
                {"key": "PORT", "value": "8080"}
            ]
        }')

    SERVICE_URL=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('service',{}).get('serviceDetails',{}).get('url',''))" 2>/dev/null || echo "")

    if [ -n "$SERVICE_URL" ]; then
        log "Backend deployed to Render: $SERVICE_URL"
        echo "$SERVICE_URL" > "$SCRIPT_DIR/.render-url"
    else
        warn "Render API response: $RESPONSE"
    fi
}

# ──────────────────────────────────────────────────────────────────────
deploy_huggingface() {
    info "HuggingFace Spaces deployment..."

    if ! python3 -c "from huggingface_hub import HfApi; HfApi().whoami()" &>/dev/null; then
        warn "Not logged into HuggingFace."
        echo ""
        echo "  Manual steps:"
        echo "  1. Run: pip install huggingface_hub && huggingface-cli login"
        echo "  2. Create a Docker Space at https://huggingface.co/new-space"
        echo "  3. Clone the Space repo, then copy backend/ contents into it"
        echo "  4. Copy deploy/huggingface/README.md to the Space root"
        echo "  5. Set Secrets: DATABASE_URL, SECRET_KEY, CORS_ORIGINS, FRONTEND_URL"
        echo "  6. Push to deploy"
        echo ""
        echo "  Or run this after logging in:"
        echo "    bash deploy.sh huggingface"
        echo ""
        return 0
    fi

    info "Creating HuggingFace Space..."
    python3 << 'PYEOF'
import os, shutil, tempfile
from huggingface_hub import HfApi, create_repo

api = HfApi()
user = api.whoami()["name"]
space_name = f"{user}/ml-studio-api"

# Create Space (Docker SDK)
try:
    create_repo(space_name, repo_type="space", space_sdk="docker", exist_ok=True)
    print(f"Space created/exists: https://huggingface.co/spaces/{space_name}")
except Exception as e:
    print(f"Error creating space: {e}")
    exit(1)

# Upload backend directory
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
readme_src = os.path.join(os.path.dirname(os.path.abspath(__file__)), "deploy", "huggingface", "README.md")

api.upload_folder(
    folder_path=backend_dir,
    repo_id=space_name,
    repo_type="space",
    ignore_patterns=["__pycache__", "*.pyc", ".env", "uploads/*", "*.db", "venv", ".venv"],
)

# Upload HF README
if os.path.exists(readme_src):
    api.upload_file(
        path_or_fileobj=readme_src,
        path_in_repo="README.md",
        repo_id=space_name,
        repo_type="space",
    )

print(f"✓ Deployed to: https://huggingface.co/spaces/{space_name}")
print(f"  Set Secrets in Space settings: DATABASE_URL, SECRET_KEY, CORS_ORIGINS, FRONTEND_URL")
PYEOF
}

# ──────────────────────────────────────────────────────────────────────
setup_supabase() {
    info "Supabase database setup..."
    echo ""
    echo "  Manual steps:"
    echo "  1. Go to https://supabase.com → New Project"
    echo "  2. Save your database password"
    echo "  3. Go to SQL Editor → New Query"
    echo "  4. Paste contents of: deploy/supabase/schema.sql"
    echo "  5. Click Run"
    echo "  6. Go to Settings → Database → Connection string → URI"
    echo "  7. Copy the Transaction pooler URI (port 6543)"
    echo "  8. Use this as DATABASE_URL in Render/HF Spaces env vars"
    echo ""
}

# ──────────────────────────────────────────────────────────────────────
show_status() {
    echo ""
    echo "═══════════════════════════════════════════════════"
    echo "  ML Studio — Deployment Status"
    echo "═══════════════════════════════════════════════════"
    echo ""

    if [ -f "$SCRIPT_DIR/.vercel-url" ]; then
        log "Frontend (Vercel): $(cat "$SCRIPT_DIR/.vercel-url")"
    else
        warn "Frontend: Not deployed or URL not saved"
    fi

    if [ -f "$SCRIPT_DIR/.render-url" ]; then
        log "Backend (Render): $(cat "$SCRIPT_DIR/.render-url")"
    else
        warn "Backend: Manual setup needed (see DEPLOYMENT.md)"
    fi

    echo ""
    info "Next: Set NEXT_PUBLIC_API_URL on Vercel to your backend URL"
    info "Next: Set DATABASE_URL on backend to your Supabase URI"
    echo ""
}

# ──────────────────────────────────────────────────────────────────────
case "${1:-all}" in
    vercel)       deploy_vercel ;;
    render)       deploy_render ;;
    huggingface)  deploy_huggingface ;;
    supabase)     setup_supabase ;;
    all)
        deploy_vercel
        echo ""
        deploy_render
        echo ""
        deploy_huggingface
        echo ""
        setup_supabase
        echo ""
        show_status
        ;;
    status)       show_status ;;
    *)
        echo "Usage: bash deploy.sh [vercel|render|huggingface|supabase|all|status]"
        exit 1
        ;;
esac
