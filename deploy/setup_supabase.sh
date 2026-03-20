#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════
# ML Studio — Complete Supabase Setup Script
# This script automates the entire Supabase database deployment
# ══════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCHEMA_FILE="$SCRIPT_DIR/supabase/schema.sql"
SUPABASE_CLI="$HOME/.local/bin/supabase"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }
info() { echo -e "${CYAN}[→]${NC} $1"; }

# ──────────────────────────────────────────────────────────────────────
# Install Supabase CLI if needed
install_supabase_cli() {
    if [ -x "$SUPABASE_CLI" ]; then
        log "Supabase CLI already installed: $($SUPABASE_CLI --version)"
        return 0
    fi
    
    info "Installing Supabase CLI..."
    mkdir -p "$HOME/.local/bin"
    cd /tmp
    curl -sSL "https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz" -o supabase.tar.gz
    tar -xzf supabase.tar.gz
    mv supabase "$HOME/.local/bin/"
    rm supabase.tar.gz
    log "Supabase CLI installed: $($SUPABASE_CLI --version)"
}

# ──────────────────────────────────────────────────────────────────────
# Login to Supabase
supabase_login() {
    if $SUPABASE_CLI projects list &>/dev/null; then
        log "Already logged into Supabase"
        return 0
    fi
    
    info "Logging into Supabase..."
    echo ""
    echo -e "${BOLD}Option 1: Browser Login${NC}"
    echo "  Run: $SUPABASE_CLI login"
    echo ""
    echo -e "${BOLD}Option 2: Access Token${NC}"
    echo "  1. Go to https://supabase.com/dashboard/account/tokens"
    echo "  2. Generate a new token"
    echo "  3. Set: export SUPABASE_ACCESS_TOKEN=sbp_xxx"
    echo ""
    
    if [ -t 0 ]; then
        read -p "Press Enter to open browser login, or Ctrl+C to exit: "
        $SUPABASE_CLI login
    else
        err "Non-interactive mode. Set SUPABASE_ACCESS_TOKEN environment variable."
        exit 1
    fi
}

# ──────────────────────────────────────────────────────────────────────
# Create or select project
setup_project() {
    info "Fetching Supabase projects..."
    
    PROJECTS=$($SUPABASE_CLI projects list --output json 2>/dev/null || echo "[]")
    PROJECT_COUNT=$(echo "$PROJECTS" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")
    
    if [ "$PROJECT_COUNT" -eq 0 ]; then
        info "No existing projects. Creating new project..."
        
        # Get organization
        ORGS=$($SUPABASE_CLI orgs list --output json)
        ORG_ID=$(echo "$ORGS" | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['id'])")
        
        # Generate password
        DB_PASS=$(python3 -c "import secrets; print(secrets.token_urlsafe(24))")
        
        # Create project
        $SUPABASE_CLI projects create ml-studio \
            --org-id "$ORG_ID" \
            --db-password "$DB_PASS" \
            --region us-east-1
        
        echo ""
        echo -e "${BOLD}${RED}IMPORTANT: Save this database password!${NC}"
        echo -e "Database Password: ${BOLD}$DB_PASS${NC}"
        echo ""
        
        # Wait for project to be ready
        info "Waiting for project to initialize (1-2 minutes)..."
        sleep 60
        
        PROJECT_REF=$($SUPABASE_CLI projects list --output json | python3 -c "import json,sys; p=json.load(sys.stdin); print(p[0]['id'] if p else '')")
    else
        echo ""
        echo "Existing projects:"
        echo "$PROJECTS" | python3 -c "
import json,sys
projects = json.load(sys.stdin)
for i, p in enumerate(projects):
    print(f\"  {i+1}. {p.get('name', 'Unknown')} (ref: {p.get('id')})\")"
        
        read -p "Select project number [1]: " PROJ_CHOICE
        PROJ_CHOICE=${PROJ_CHOICE:-1}
        
        PROJECT_REF=$(echo "$PROJECTS" | python3 -c "
import json,sys
projects = json.load(sys.stdin)
idx = int('${PROJ_CHOICE}') - 1
print(projects[idx]['id'])")
        
        # For existing project, user must provide password
        echo ""
        read -sp "Enter database password for this project: " DB_PASS
        echo ""
    fi
    
    log "Using project: $PROJECT_REF"
    
    # Export for later use
    export PROJECT_REF DB_PASS
}

# ──────────────────────────────────────────────────────────────────────
# Run schema SQL
run_schema() {
    if [ ! -f "$SCHEMA_FILE" ]; then
        err "Schema file not found: $SCHEMA_FILE"
        exit 1
    fi
    
    info "Running database schema..."
    
    # Use supabase db push or direct connection
    # Since we have the password, use psql-like connection via the CLI
    $SUPABASE_CLI db push --project-ref "$PROJECT_REF" --password "$DB_PASS" 2>/dev/null || {
        # Fallback: provide instructions for manual SQL execution
        warn "Automatic schema push not available. Manual steps required:"
        echo ""
        echo "  1. Go to: https://supabase.com/dashboard/project/$PROJECT_REF/sql"
        echo "  2. Paste the contents of: $SCHEMA_FILE"
        echo "  3. Click 'Run'"
        echo ""
    }
}

# ──────────────────────────────────────────────────────────────────────
# Generate connection string and save config
save_config() {
    # Determine pooler region
    PROJECT_INFO=$($SUPABASE_CLI projects list --output json | python3 -c "
import json,sys
projects = json.load(sys.stdin)
for p in projects:
    if p.get('id') == '${PROJECT_REF}':
        print(json.dumps(p))
        break")
    
    REGION=$(echo "$PROJECT_INFO" | python3 -c "import json,sys; print(json.load(sys.stdin).get('region', 'us-east-1'))")
    
    # Map to pooler host
    case "$REGION" in
        us-east-1) POOLER_HOST="aws-0-us-east-1" ;;
        us-west-1) POOLER_HOST="aws-0-us-west-1" ;;
        eu-west-1) POOLER_HOST="aws-0-eu-west-1" ;;
        eu-central-1) POOLER_HOST="aws-0-eu-central-1" ;;
        ap-southeast-1) POOLER_HOST="aws-0-ap-southeast-1" ;;
        *) POOLER_HOST="aws-0-$REGION" ;;
    esac
    
    DATABASE_URL="postgresql://postgres.${PROJECT_REF}:${DB_PASS}@${POOLER_HOST}.pooler.supabase.com:6543/postgres"
    
    # Save config
    CONFIG_FILE="$SCRIPT_DIR/../.supabase-config"
    cat > "$CONFIG_FILE" << EOF
# Supabase Configuration for ML Studio
# Generated: $(date -Iseconds)
PROJECT_REF=$PROJECT_REF
REGION=$REGION
POOLER_HOST=$POOLER_HOST
DATABASE_URL=$DATABASE_URL
EOF
    
    log "Configuration saved to: $CONFIG_FILE"
    
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo "  DATABASE CONNECTION STRING"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo -e "  ${BOLD}$DATABASE_URL${NC}"
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo ""
}

# ──────────────────────────────────────────────────────────────────────
# Update HuggingFace Spaces secrets
update_hf_secrets() {
    info "Updating HuggingFace Spaces secrets..."
    
    if ! python3 -c "from huggingface_hub import HfApi; HfApi().whoami()" &>/dev/null; then
        warn "Not logged into HuggingFace. Skipping secret update."
        echo "  To update manually:"
        echo "  1. Go to your HF Space settings"
        echo "  2. Add/update the DATABASE_URL secret"
        return 0
    fi
    
    # Update via HF Hub API
    python3 << PYEOF
import os
from huggingface_hub import HfApi, add_space_secret

api = HfApi()
user = api.whoami()["name"]
space_id = f"{user}/ml-studio-api"

db_url = "$DATABASE_URL"

try:
    add_space_secret(space_id, "DATABASE_URL", db_url)
    print(f"✓ Updated DATABASE_URL on {space_id}")
except Exception as e:
    print(f"Could not update secret: {e}")
    print("  Update manually in Space settings")
PYEOF
}

# ──────────────────────────────────────────────────────────────────────
# Main
main() {
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo "  ML Studio — Supabase Database Setup"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    
    install_supabase_cli
    supabase_login
    setup_project
    run_schema
    save_config
    update_hf_secrets
    
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo "  NEXT STEPS"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo "  1. If schema wasn't auto-applied, run it manually:"
    echo "     https://supabase.com/dashboard/project/$PROJECT_REF/sql"
    echo ""
    echo "  2. Set DATABASE_URL in your deployment:"
    echo "     - HF Spaces: Settings → Secrets"
    echo "     - Render: Dashboard → Environment"
    echo ""
    echo "  3. Restart your backend to apply changes"
    echo ""
    
    log "Setup complete!"
}

main "$@"
