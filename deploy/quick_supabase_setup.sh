#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════
# ML Studio — Quick Supabase Database Setup
# Run this script to connect your HuggingFace backend to Supabase
# ══════════════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCHEMA_FILE="$SCRIPT_DIR/supabase/schema.sql"
SUPABASE_CLI="$HOME/.local/bin/supabase"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  ML Studio — Supabase Setup"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Step 1: Check/Install Supabase CLI
if [ ! -x "$SUPABASE_CLI" ]; then
    echo "[→] Installing Supabase CLI..."
    mkdir -p "$HOME/.local/bin"
    cd /tmp
    curl -sSL "https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz" -o supabase.tar.gz
    tar -xzf supabase.tar.gz
    mv supabase "$HOME/.local/bin/"
    rm supabase.tar.gz
fi
echo "[✓] Supabase CLI: $($SUPABASE_CLI --version)"

# Step 2: Login to Supabase
echo ""
echo "[→] Logging into Supabase..."
if ! $SUPABASE_CLI projects list &>/dev/null; then
    $SUPABASE_CLI login
fi
echo "[✓] Logged into Supabase"

# Step 3: List/Select project
echo ""
echo "[→] Fetching your Supabase projects..."
PROJECTS=$($SUPABASE_CLI projects list 2>/dev/null)
echo "$PROJECTS"

echo ""
echo "Enter your project reference (the 'id' column above):"
read -p "> " PROJECT_REF

echo ""
echo "Enter your database password (from when you created the project):"
read -sp "> " DB_PASS
echo ""

# Step 4: Build connection string
echo ""
echo "[→] Building connection string..."

# Get project region
REGION=$($SUPABASE_CLI projects list --output json 2>/dev/null | python3 -c "
import json,sys
for p in json.load(sys.stdin):
    if p.get('id') == '$PROJECT_REF':
        print(p.get('region', 'us-east-1'))
        break
else:
    print('us-east-1')
")

case "$REGION" in
    us-east-1) POOLER="aws-0-us-east-1" ;;
    us-west-1) POOLER="aws-0-us-west-1" ;;
    eu-west-1) POOLER="aws-0-eu-west-1" ;;
    eu-central-1) POOLER="aws-0-eu-central-1" ;;
    ap-southeast-1) POOLER="aws-0-ap-southeast-1" ;;
    *) POOLER="aws-0-$REGION" ;;
esac

DATABASE_URL="postgresql://postgres.${PROJECT_REF}:${DB_PASS}@${POOLER}.pooler.supabase.com:6543/postgres"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  YOUR DATABASE CONNECTION STRING"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "$DATABASE_URL"
echo ""

# Save to file
echo "$DATABASE_URL" > "$SCRIPT_DIR/../.database-url"
echo "[✓] Saved to: $SCRIPT_DIR/../.database-url"

# Step 5: Run schema
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  APPLY DATABASE SCHEMA"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Go to: https://supabase.com/dashboard/project/$PROJECT_REF/sql"
echo ""
echo "Paste the contents of:"
echo "  $SCHEMA_FILE"
echo ""
echo "Then click 'Run'"
echo ""
read -p "Press Enter after running the schema..."

# Step 6: Update HuggingFace secret
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  UPDATE HUGGINGFACE SPACES"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Go to your HuggingFace Space settings and add/update:"
echo ""
echo "  SECRET NAME:  DATABASE_URL"
echo "  SECRET VALUE: $DATABASE_URL"
echo ""
echo "Space URL: https://huggingface.co/spaces/x0advik/ml-studio-api/settings"
echo ""

# Try to update automatically if HF CLI is available
if python3 -c "from huggingface_hub import HfApi; HfApi().whoami()" &>/dev/null; then
    echo "[→] Updating HuggingFace secret automatically..."
    python3 << PYEOF
from huggingface_hub import HfApi, add_space_secret
api = HfApi()
user = api.whoami()["name"]
try:
    add_space_secret(f"{user}/ml-studio-api", "DATABASE_URL", "$DATABASE_URL")
    print("[✓] Secret updated successfully!")
except Exception as e:
    print(f"[!] Could not auto-update: {e}")
    print("    Please update manually in Space settings")
PYEOF
else
    echo "[!] Not logged into HuggingFace. Please update the secret manually."
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  DONE!"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Your ML Studio backend will now persist user data in Supabase."
echo ""
echo "To verify, restart your HF Space and try registering a user."
echo ""
