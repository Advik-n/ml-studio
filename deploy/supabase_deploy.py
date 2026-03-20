#!/usr/bin/env python3
"""
ML Studio — Automated Supabase Deployment Script
Deploys database schema to Supabase via Management API.

Usage:
  # With environment variable:
  SUPABASE_ACCESS_TOKEN=sbp_xxx python3 supabase_deploy.py
  
  # Or interactively:
  python3 supabase_deploy.py
"""

import json
import os
import sys
import time
import subprocess
import urllib.request
import urllib.error
from pathlib import Path

SUPABASE_API_BASE = "https://api.supabase.com/v1"
SCHEMA_FILE = Path(__file__).parent / "supabase" / "schema.sql"
SUPABASE_CLI = Path.home() / ".local/bin/supabase"


def get_access_token():
    """Get Supabase access token from environment or CLI or prompt."""
    token = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if token:
        return token
    
    # Try to get token from Supabase CLI config
    cli_config = Path.home() / ".supabase" / "access-token"
    if cli_config.exists():
        token = cli_config.read_text().strip()
        if token:
            return token
    
    print("\n" + "="*60)
    print("SUPABASE ACCESS TOKEN REQUIRED")
    print("="*60)
    print("\nTo get your access token:")
    print("1. Go to https://supabase.com/dashboard/account/tokens")
    print("2. Click 'Generate new token'")
    print("3. Name it 'ML Studio Deploy'")
    print("4. Copy the token (starts with 'sbp_')")
    print("\nPaste your token below (or press Ctrl+C to exit):")
    try:
        token = input("> ").strip()
    except (KeyboardInterrupt, EOFError):
        return None
    return token


def api_request(endpoint: str, token: str, method: str = "GET", data: dict = None):
    """Make authenticated API request to Supabase."""
    url = f"{SUPABASE_API_BASE}{endpoint}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    
    req = urllib.request.Request(url, headers=headers, method=method)
    if data:
        req.data = json.dumps(data).encode()
    
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else ""
        print(f"API Error {e.code}: {error_body}")
        raise


def list_projects(token: str) -> list:
    """List all Supabase projects for the authenticated user."""
    return api_request("/projects", token)


def get_project_connection_string(project: dict) -> str:
    """Build PostgreSQL connection string from project info."""
    ref = project.get("id")  # This is the project reference
    region = project.get("region", "us-east-1")
    
    # Map region to AWS region
    region_map = {
        "us-east-1": "aws-0-us-east-1",
        "us-west-1": "aws-0-us-west-1",
        "eu-west-1": "aws-0-eu-west-1",
        "eu-central-1": "aws-0-eu-central-1",
        "ap-southeast-1": "aws-0-ap-southeast-1",
        "ap-northeast-1": "aws-0-ap-northeast-1",
    }
    
    pooler_region = region_map.get(region, f"aws-0-{region}")
    return f"postgresql://postgres.{ref}:[YOUR-PASSWORD]@{pooler_region}.pooler.supabase.com:6543/postgres"


def create_project(token: str, name: str, org_id: str, db_pass: str, region: str = "us-east-1"):
    """Create a new Supabase project."""
    data = {
        "name": name,
        "organization_id": org_id,
        "db_pass": db_pass,
        "region": region,
        "plan": "free",
    }
    return api_request("/projects", token, method="POST", data=data)


def list_organizations(token: str) -> list:
    """List all organizations."""
    return api_request("/organizations", token)


def run_sql(token: str, project_ref: str, sql: str):
    """Run SQL on a Supabase project via the SQL endpoint."""
    # Use the database API endpoint
    url = f"https://{project_ref}.supabase.co/rest/v1/rpc/exec_sql"
    
    # This requires a service role key, not the access token
    # Instead, we'll provide instructions for manual SQL execution
    return None


def main():
    print("\n" + "="*60)
    print("  ML Studio — Supabase Database Deployment")
    print("="*60)
    
    token = get_access_token()
    if not token:
        print("No token provided. Exiting.")
        return 1
    
    print("\n[1/4] Fetching your Supabase projects...")
    try:
        projects = list_projects(token)
    except Exception as e:
        print(f"Failed to fetch projects: {e}")
        return 1
    
    if not projects:
        print("\nNo existing projects found.")
        print("\n[2/4] Fetching organizations...")
        
        try:
            orgs = list_organizations(token)
        except Exception as e:
            print(f"Failed to fetch organizations: {e}")
            return 1
        
        if not orgs:
            print("No organizations found. Please create one at https://supabase.com/dashboard")
            return 1
        
        print("\nAvailable organizations:")
        for i, org in enumerate(orgs):
            print(f"  {i+1}. {org.get('name', 'Unknown')} (ID: {org.get('id')})")
        
        org_choice = input("\nSelect organization number [1]: ").strip() or "1"
        org = orgs[int(org_choice) - 1]
        
        print("\n[3/4] Creating new Supabase project...")
        import secrets
        db_pass = secrets.token_urlsafe(24)
        
        try:
            project = create_project(
                token=token,
                name="ml-studio",
                org_id=org["id"],
                db_pass=db_pass,
                region="us-east-1"
            )
            print(f"✓ Project created: {project.get('name')}")
            print(f"\n⚠️  SAVE THIS DATABASE PASSWORD (you won't see it again):")
            print(f"   {db_pass}")
            
            # Wait for project to be ready
            print("\nWaiting for project to initialize (this takes 1-2 minutes)...")
            for i in range(12):
                time.sleep(10)
                try:
                    projects = list_projects(token)
                    for p in projects:
                        if p.get("id") == project.get("id"):
                            status = p.get("status")
                            print(f"  Status: {status}")
                            if status == "ACTIVE_HEALTHY":
                                project = p
                                break
                    else:
                        continue
                    break
                except:
                    pass
            
        except Exception as e:
            print(f"Failed to create project: {e}")
            return 1
    else:
        print("\nExisting projects:")
        for i, proj in enumerate(projects):
            status = proj.get("status", "Unknown")
            print(f"  {i+1}. {proj.get('name', 'Unknown')} ({status})")
        
        proj_choice = input("\nSelect project number [1]: ").strip() or "1"
        project = projects[int(proj_choice) - 1]
        db_pass = None  # User needs to provide this
    
    # Display connection info
    ref = project.get("id")
    region = project.get("region", "us-east-1")
    
    print("\n" + "="*60)
    print("  PROJECT DETAILS")
    print("="*60)
    print(f"\n  Name:   {project.get('name')}")
    print(f"  Ref:    {ref}")
    print(f"  Region: {region}")
    print(f"  Status: {project.get('status')}")
    
    # Build connection string
    region_map = {
        "us-east-1": "aws-0-us-east-1",
        "us-west-1": "aws-0-us-west-1",
        "eu-west-1": "aws-0-eu-west-1", 
        "eu-central-1": "aws-0-eu-central-1",
        "ap-southeast-1": "aws-0-ap-southeast-1",
        "ap-northeast-1": "aws-0-ap-northeast-1",
        "ap-south-1": "aws-0-ap-south-1",
    }
    pooler_host = region_map.get(region, f"aws-0-{region}")
    
    print("\n" + "="*60)
    print("  DATABASE CONNECTION STRING")
    print("="*60)
    
    if db_pass:
        conn_str = f"postgresql://postgres.{ref}:{db_pass}@{pooler_host}.pooler.supabase.com:6543/postgres"
        print(f"\n  {conn_str}")
    else:
        print(f"\n  postgresql://postgres.{ref}:[YOUR-PASSWORD]@{pooler_host}.pooler.supabase.com:6543/postgres")
        print("\n  Replace [YOUR-PASSWORD] with your database password")
    
    print("\n" + "="*60)
    print("  NEXT STEPS")
    print("="*60)
    print("""
  1. Go to Supabase Dashboard → SQL Editor
     https://supabase.com/dashboard/project/{ref}/sql

  2. Paste the schema from:
     deploy/supabase/schema.sql

  3. Click 'Run' to create tables

  4. Set DATABASE_URL in your deployment:
     - Render: Dashboard → Environment
     - HuggingFace: Settings → Secrets
     - Vercel: Not needed (frontend only)
""".format(ref=ref))
    
    # Save connection string to file
    config_file = Path(__file__).parent.parent / ".supabase-config"
    with open(config_file, "w") as f:
        f.write(f"PROJECT_REF={ref}\n")
        f.write(f"REGION={region}\n")
        f.write(f"POOLER_HOST={pooler_host}\n")
        if db_pass:
            f.write(f"DB_PASS={db_pass}\n")
            f.write(f"DATABASE_URL={conn_str}\n")
    
    print(f"  Configuration saved to: {config_file}")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
