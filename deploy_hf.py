#!/usr/bin/env python3
"""Deploy ML Studio backend to HuggingFace Spaces.

Usage:
    python deploy_hf.py --token hf_xxxxx
    # or set HF_TOKEN env var
    HF_TOKEN=hf_xxxxx python deploy_hf.py
"""

import argparse
import os
import sys

def main():
    parser = argparse.ArgumentParser(description="Deploy backend to HuggingFace Spaces")
    parser.add_argument("--token", help="HuggingFace API token (or set HF_TOKEN env var)")
    parser.add_argument("--space", default="ml-studio-api", help="Space name (under your account)")
    args = parser.parse_args()

    token = args.token or os.environ.get("HF_TOKEN")
    if not token:
        print("❌ No HuggingFace token provided.")
        print("   Get one at: https://huggingface.co/settings/tokens")
        print("   Then run:   python deploy_hf.py --token hf_xxxxx")
        sys.exit(1)

    try:
        from huggingface_hub import HfApi, upload_folder
    except ImportError:
        os.system(f"{sys.executable} -m pip install huggingface_hub")
        from huggingface_hub import HfApi, upload_folder

    api = HfApi(token=token)

    try:
        user = api.whoami()
        username = user["name"]
        print(f"✓ Authenticated as: {username}")
    except Exception as e:
        print(f"❌ Invalid token — {e}")
        sys.exit(1)

    space_id = f"{username}/{args.space}"

    # Create Space if needed
    try:
        api.repo_info(repo_id=space_id, repo_type="space")
        print(f"✓ Space {space_id} exists")
    except Exception:
        print(f"  Creating Space {space_id}...")
        api.create_repo(repo_id=space_id, repo_type="space", space_sdk="docker", private=False)
        print(f"✓ Created Space {space_id}")

    backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")

    # Write HF Space metadata README
    readme = f"""---
title: ML Studio API
emoji: 🧠
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
---

# ML Studio API Backend
FastAPI backend for [ML Studio](https://ml-studio-zeta.vercel.app) — automated ML pipeline & EDA platform.
"""
    with open(os.path.join(backend_dir, "README.md"), "w") as f:
        f.write(readme)

    print(f"  Uploading backend from {backend_dir}...")
    api.upload_folder(
        folder_path=backend_dir,
        repo_id=space_id,
        repo_type="space",
        ignore_patterns=["__pycache__/**", "venv/**", "*.pyc", "*.db", "*.sqlite",
                         "uploads/**", ".env", ".git/**", ".github/**"],
    )

    os.remove(os.path.join(backend_dir, "README.md"))

    api_url = f"https://{username}-{args.space}.hf.space"
    print(f"\n{'='*55}")
    print(f"  ✅ Deployed to HuggingFace Spaces!")
    print(f"  Space: https://huggingface.co/spaces/{space_id}")
    print(f"  API:   {api_url}")
    print(f"  Docs:  {api_url}/docs")
    print(f"{'='*55}")
    print(f"\n  Next step: update Vercel env var:")
    print(f"  cd frontend && vercel env rm NEXT_PUBLIC_API_URL production -y")
    print(f"  echo '{api_url}' | vercel env add NEXT_PUBLIC_API_URL production")
    print(f"  vercel deploy --prod --yes")

if __name__ == "__main__":
    main()

