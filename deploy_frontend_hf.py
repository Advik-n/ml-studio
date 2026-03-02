#!/usr/bin/env python3
"""Deploy ML Studio frontend to HuggingFace Spaces.

Usage:
    python deploy_frontend_hf.py --token hf_xxxxx
    HF_TOKEN=hf_xxxxx python deploy_frontend_hf.py
"""

import argparse, os, sys

def main():
    parser = argparse.ArgumentParser(description="Deploy frontend to HuggingFace Spaces")
    parser.add_argument("--token", help="HuggingFace API token (or set HF_TOKEN env var)")
    parser.add_argument("--space", default="ml-studio", help="Space name")
    args = parser.parse_args()

    token = args.token or os.environ.get("HF_TOKEN")
    if not token:
        print("❌ No HuggingFace token. Set HF_TOKEN or use --token")
        sys.exit(1)

    try:
        from huggingface_hub import HfApi
    except ImportError:
        os.system(f"{sys.executable} -m pip install huggingface_hub")
        from huggingface_hub import HfApi

    api = HfApi(token=token)
    user = api.whoami()
    username = user["name"]
    print(f"✓ Authenticated as: {username}")

    space_id = f"{username}/{args.space}"

    try:
        api.repo_info(repo_id=space_id, repo_type="space")
        print(f"✓ Space {space_id} exists")
    except Exception:
        print(f"  Creating Space {space_id}...")
        api.create_repo(repo_id=space_id, repo_type="space", space_sdk="docker", private=False)
        print(f"✓ Created Space {space_id}")

    frontend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend")

    readme = f"""---
title: ML Studio
emoji: 🧪
colorFrom: indigo
colorTo: cyan
sdk: docker
app_port: 7860
pinned: true
---

# ML Studio
Full-stack ML pipeline & EDA platform.
"""
    with open(os.path.join(frontend_dir, "README.md"), "w") as f:
        f.write(readme)

    print(f"  Uploading frontend from {frontend_dir}...")
    api.upload_folder(
        folder_path=frontend_dir,
        repo_id=space_id,
        repo_type="space",
        ignore_patterns=[
            "node_modules/**", ".next/**", ".vercel/**",
            "*.tsbuildinfo", "next-env.d.ts", ".env.local",
        ],
    )

    os.remove(os.path.join(frontend_dir, "README.md"))

    url = f"https://{username}-{args.space}.hf.space"
    print(f"\n{'='*55}")
    print(f"  ✅ Frontend deployed to HuggingFace Spaces!")
    print(f"  Space: https://huggingface.co/spaces/{space_id}")
    print(f"  URL:   {url}")
    print(f"{'='*55}")

if __name__ == "__main__":
    main()
