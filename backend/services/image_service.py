import os
import uuid
import hashlib
import logging
import json
from typing import Dict, Any, List, Tuple, Optional
from pathlib import Path
from datetime import datetime
import numpy as np

logger = logging.getLogger(__name__)

IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif', '.webp', '.gif',
              '.ico', '.ppm', '.pgm', '.pbm', '.pnm', '.svg', '.heic', '.heif',
              '.jfif', '.jp2', '.j2k', '.jpx', '.raw', '.cr2', '.nef', '.arw',
              '.dng', '.orf', '.rw2', '.pef', '.srw'}

SKIP_DIRS = {'__MACOSX', '.DS_Store', '__pycache__', '.git', '.svn',
             '.hg', 'node_modules', '.ipynb_checkpoints', 'Thumbs.db'}


def _is_image(f: str) -> bool:
    return os.path.splitext(f)[1].lower() in IMAGE_EXTS


def _is_skip_dir(name: str) -> bool:
    return name in SKIP_DIRS or name.startswith('.')


def _load_image(path: str, target_size: Tuple[int, int] = (128, 128)):
    """Load and resize a single image."""
    from PIL import Image
    try:
        img = Image.open(path).convert("RGB")
        img = img.resize(target_size)
        return np.array(img)
    except Exception as e:
        logger.warning(f"Failed to load {path}: {e}")
        return None


def _discover_classes(dataset_path: str) -> Dict[str, List[str]]:
    """Dynamically discover image classes from any folder structure.
    Handles: class folders, train/test splits, nested wrappers,
    flat image collections (no class folders), and deeply nested structures.
    """

    def _scan_flat(root):
        """Check if root directly contains class folders with images."""
        classes = {}
        try:
            entries = sorted(os.listdir(root))
        except PermissionError:
            return classes
        for entry in entries:
            if _is_skip_dir(entry):
                continue
            class_dir = os.path.join(root, entry)
            if os.path.isdir(class_dir):
                images = []
                for f in os.listdir(class_dir):
                    fpath = os.path.join(class_dir, f)
                    if os.path.isfile(fpath) and _is_image(f):
                        images.append(fpath)
                if images:
                    classes[entry] = sorted(images)
        return classes

    def _collect_all_images(root, max_depth=5):
        """Recursively collect all images from any depth."""
        images = []
        if max_depth <= 0:
            return images
        try:
            for entry in os.listdir(root):
                if _is_skip_dir(entry):
                    continue
                full = os.path.join(root, entry)
                if os.path.isfile(full) and _is_image(entry):
                    images.append(full)
                elif os.path.isdir(full):
                    images.extend(_collect_all_images(full, max_depth - 1))
        except PermissionError:
            pass
        return images

    SPLIT_NAMES = {'train', 'test', 'val', 'validation', 'dev', 'training', 'testing'}

    # 1. Try direct class folders at root
    classes = _scan_flat(dataset_path)
    if classes:
        return classes

    # 2. Get valid subdirectories (skip junk)
    try:
        subdirs = [d for d in sorted(os.listdir(dataset_path))
                   if os.path.isdir(os.path.join(dataset_path, d)) and not _is_skip_dir(d)]
    except PermissionError:
        subdirs = []

    # 3. Check for train/test/val split structure
    split_dirs = [d for d in subdirs if d.lower() in SPLIT_NAMES]
    if split_dirs:
        merged = {}
        for split in split_dirs:
            split_classes = _scan_flat(os.path.join(dataset_path, split))
            for cls, files in split_classes.items():
                merged.setdefault(cls, []).extend(files)
        if merged:
            return merged

    # 4. Check one level deeper (wrapper folder like "dataset_name/")
    for subdir in subdirs:
        sub_path = os.path.join(dataset_path, subdir)
        sub_classes = _scan_flat(sub_path)
        if sub_classes:
            return sub_classes
        # Check if this subdir has train/test splits
        try:
            sub_subdirs = [d for d in os.listdir(sub_path)
                           if os.path.isdir(os.path.join(sub_path, d)) and not _is_skip_dir(d)]
        except PermissionError:
            continue
        sub_splits = [d for d in sub_subdirs if d.lower() in SPLIT_NAMES]
        if sub_splits:
            merged = {}
            for split in sub_splits:
                split_classes = _scan_flat(os.path.join(sub_path, split))
                for cls, files in split_classes.items():
                    merged.setdefault(cls, []).extend(files)
            if merged:
                return merged

    # 5. Check two levels deeper
    for subdir in subdirs:
        sub_path = os.path.join(dataset_path, subdir)
        try:
            sub_subdirs = [d for d in os.listdir(sub_path)
                           if os.path.isdir(os.path.join(sub_path, d)) and not _is_skip_dir(d)]
        except PermissionError:
            continue
        for sub2 in sub_subdirs:
            sub2_path = os.path.join(sub_path, sub2)
            sub2_classes = _scan_flat(sub2_path)
            if sub2_classes:
                return sub2_classes

    # 6. FALLBACK: Collect ALL images from anywhere in the tree
    #    Group by parent folder name, or use "unlabeled" if all at root
    all_images = _collect_all_images(dataset_path)
    if all_images:
        # Group by immediate parent folder
        grouped: Dict[str, List[str]] = {}
        for img_path in all_images:
            parent = os.path.basename(os.path.dirname(img_path))
            # If parent is the dataset_path itself or a skip dir, use "unlabeled"
            if parent == os.path.basename(dataset_path) or _is_skip_dir(parent):
                parent = "unlabeled"
            grouped.setdefault(parent, []).append(img_path)

        # If everything ended up in "unlabeled", that's fine — single-class dataset
        return grouped

    return {}

def _compute_dhash(img_array: np.ndarray, hash_size: int = 8) -> str:
    """Compute difference hash for duplicate detection."""
    from PIL import Image
    img = Image.fromarray(img_array).convert('L').resize((hash_size + 1, hash_size))
    pixels = np.array(img)
    diff = pixels[:, 1:] > pixels[:, :-1]
    return ''.join(['1' if b else '0' for b in diff.flatten()])

def _compute_blur_score(img_array: np.ndarray) -> float:
    """Compute Laplacian variance as blur measure."""
    import cv2
    gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())

def run_image_eda(dataset_path: str, max_sample: int = 500, file_type: str = "image") -> Dict[str, Any]:
    """Run comprehensive image EDA on a folder-structured dataset."""
    import cv2
    from PIL import Image
    from PIL.ExifTags import TAGS
    from collections import Counter

    classes = _discover_classes(dataset_path)
    if not classes:
        raise ValueError(f"No images found in {dataset_path}. Supported formats: {', '.join(sorted(IMAGE_EXTS))}")

    # Class distribution
    class_distribution = {cls: len(files) for cls, files in classes.items()}
    total_images = sum(class_distribution.values())
    class_names = sorted(classes.keys())

    # Imbalance analysis
    counts = list(class_distribution.values())
    max_count = max(counts)
    min_count = min(counts)
    imbalance_ratio = round(max_count / max(min_count, 1), 2)
    minority_classes = [cls for cls, c in class_distribution.items() if c < max_count * 0.3]

    # Dataset hash
    hasher = hashlib.sha256()
    for cls in sorted(classes.keys()):
        for f in sorted(classes[cls])[:10]:
            hasher.update(f.encode())
    dataset_hash = hasher.hexdigest()[:16]

    # Sample images for analysis
    all_files = [(cls, f) for cls, files in classes.items() for f in files]
    sample_size = min(max_sample, len(all_files))
    rng = np.random.RandomState(42)
    sample_indices = rng.choice(len(all_files), sample_size, replace=False)
    sampled = [all_files[i] for i in sample_indices]

    # Analysis accumulators
    widths, heights = [], []
    pixel_means_r, pixel_means_g, pixel_means_b = [], [], []
    pixel_stds_r, pixel_stds_g, pixel_stds_b = [], [], []
    r_hist = np.zeros(256, dtype=np.float64)
    g_hist = np.zeros(256, dtype=np.float64)
    b_hist = np.zeros(256, dtype=np.float64)
    blur_scores = {}
    hashes = {}
    corrupt_images = []
    formats_seen = Counter()
    color_spaces = Counter()
    metadata_samples = []
    aspect_ratios = []
    file_sizes = []

    for cls, fpath in sampled:
        try:
            # File size
            fsize = os.path.getsize(fpath)
            file_sizes.append(fsize)
            fmt = os.path.splitext(fpath)[1].lower()
            formats_seen[fmt] += 1

            img = Image.open(fpath)
            color_spaces[img.mode] += 1

            # Extract metadata/EXIF
            if len(metadata_samples) < 5:
                try:
                    exif_data = img.getexif()
                    if exif_data:
                        meta = {}
                        for tag_id, value in exif_data.items():
                            tag = TAGS.get(tag_id, tag_id)
                            meta[str(tag)] = str(value)[:100]
                        if meta:
                            metadata_samples.append({"file": os.path.basename(fpath), "exif": meta})
                except Exception:
                    pass

            img = img.convert("RGB")
            w, h = img.size
            widths.append(w)
            heights.append(h)
            aspect_ratios.append(round(w / max(h, 1), 2))

            arr = np.array(img, dtype=np.float64)

            # Per-channel statistics
            pixel_means_r.append(float(arr[:, :, 0].mean()))
            pixel_means_g.append(float(arr[:, :, 1].mean()))
            pixel_means_b.append(float(arr[:, :, 2].mean()))
            pixel_stds_r.append(float(arr[:, :, 0].std()))
            pixel_stds_g.append(float(arr[:, :, 1].std()))
            pixel_stds_b.append(float(arr[:, :, 2].std()))

            # RGB histograms
            r_hist += np.histogram(arr[:, :, 0], bins=256, range=(0, 256))[0]
            g_hist += np.histogram(arr[:, :, 1], bins=256, range=(0, 256))[0]
            b_hist += np.histogram(arr[:, :, 2], bins=256, range=(0, 256))[0]

            # Blur score
            small = img.resize((256, 256))
            small_arr = np.array(small)
            score = _compute_blur_score(small_arr)
            blur_scores[os.path.basename(fpath)] = round(score, 2)

            # Hash for duplicates
            small_hash = _compute_dhash(np.array(img.resize((9, 8))))
            hashes.setdefault(small_hash, []).append(fpath)
        except Exception as e:
            corrupt_images.append({"file": os.path.basename(fpath), "class": cls, "error": str(e)})
            logger.warning(f"Error analyzing {fpath}: {e}")

    # Normalize histograms
    total_px = max(sum(r_hist), 1)
    r_hist_norm = (r_hist / total_px).tolist()
    g_hist_norm = (g_hist / total_px).tolist()
    b_hist_norm = (b_hist / total_px).tolist()

    # Resolution stats
    resolution_stats = {
        "min_width": int(min(widths)) if widths else 0,
        "max_width": int(max(widths)) if widths else 0,
        "mean_width": round(float(np.mean(widths)), 1) if widths else 0,
        "min_height": int(min(heights)) if heights else 0,
        "max_height": int(max(heights)) if heights else 0,
        "mean_height": round(float(np.mean(heights)), 1) if heights else 0,
        "std_width": round(float(np.std(widths)), 1) if widths else 0,
        "std_height": round(float(np.std(heights)), 1) if heights else 0,
        "width_distribution": np.histogram(widths, bins=20)[0].tolist() if widths else [],
        "height_distribution": np.histogram(heights, bins=20)[0].tolist() if heights else [],
    }

    # Pixel statistics
    pixel_stats = {
        "mean_r": round(float(np.mean(pixel_means_r)), 2) if pixel_means_r else 0,
        "mean_g": round(float(np.mean(pixel_means_g)), 2) if pixel_means_g else 0,
        "mean_b": round(float(np.mean(pixel_means_b)), 2) if pixel_means_b else 0,
        "std_r": round(float(np.mean(pixel_stds_r)), 2) if pixel_stds_r else 0,
        "std_g": round(float(np.mean(pixel_stds_g)), 2) if pixel_stds_g else 0,
        "std_b": round(float(np.mean(pixel_stds_b)), 2) if pixel_stds_b else 0,
        "global_mean": round(float(np.mean(pixel_means_r + pixel_means_g + pixel_means_b)), 2),
        "global_std": round(float(np.mean(pixel_stds_r + pixel_stds_g + pixel_stds_b)), 2),
    }

    # Blur analysis
    blur_values = list(blur_scores.values())
    blur_threshold = 100.0
    blurry_count = sum(1 for s in blur_values if s < blur_threshold)
    blur_stats = {
        "mean_score": round(float(np.mean(blur_values)), 2) if blur_values else 0,
        "min_score": round(float(np.min(blur_values)), 2) if blur_values else 0,
        "max_score": round(float(np.max(blur_values)), 2) if blur_values else 0,
        "blurry_count": blurry_count,
        "blurry_pct": round(blurry_count / max(len(blur_values), 1) * 100, 1),
        "threshold": blur_threshold,
        "worst_10": sorted(blur_scores.items(), key=lambda x: x[1])[:10],
    }

    # Duplicate detection
    duplicates = {h: paths for h, paths in hashes.items() if len(paths) > 1}
    duplicate_count = sum(len(paths) - 1 for paths in duplicates.values())

    # Preprocessing recommendations
    mean_w = resolution_stats["mean_width"]
    mean_h = resolution_stats["mean_height"]
    recommendations = []
    if mean_w > 300 or mean_h > 300:
        recommendations.append("Resize to 224×224 for standard CNN architectures")
    elif mean_w < 64 or mean_h < 64:
        recommendations.append("Consider upscaling — images are very small for feature extraction")
    else:
        recommendations.append(f"Resize to {min(int(mean_w), 224)}×{min(int(mean_h), 224)} for consistency")

    recommendations.append("Normalize pixel values to [0,1] or use ImageNet stats (mean=[0.485,0.456,0.406])")

    if blur_stats["blurry_pct"] > 10:
        recommendations.append("Apply CLAHE (Contrast Limited Adaptive Histogram Equalization) to improve contrast")

    if imbalance_ratio > 3:
        for mc in minority_classes[:3]:
            recommendations.append(f"Use augmentation for class '{mc}' (minority class)")
        recommendations.append("Apply weighted loss function to handle class imbalance")
    elif imbalance_ratio > 1.5:
        recommendations.append("Consider oversampling minority classes or using weighted loss")

    if duplicate_count > 0:
        recommendations.append(f"Remove {duplicate_count} duplicate image(s) before training")

    if len(corrupt_images) > 0:
        recommendations.append(f"Fix or remove {len(corrupt_images)} corrupt image(s)")

    # Suggested train/test split
    if total_images < 100:
        suggested_split = "70/30 (small dataset)"
    elif total_images < 1000:
        suggested_split = "80/20"
    else:
        suggested_split = "85/15 or 80/10/10 (train/val/test)"

    # Risk assessment
    risk_level = "LOW"
    risk_factors = []
    if total_images < 50:
        risk_level = "HIGH"
        risk_factors.append("Very small dataset — high risk of overfitting")
    elif total_images < 200:
        risk_level = "MEDIUM"
        risk_factors.append("Small dataset — consider data augmentation")
    if imbalance_ratio > 5:
        risk_level = "HIGH"
        risk_factors.append(f"Severe class imbalance (ratio {imbalance_ratio}:1)")
    elif imbalance_ratio > 3:
        if risk_level != "HIGH":
            risk_level = "MEDIUM"
        risk_factors.append(f"Moderate class imbalance (ratio {imbalance_ratio}:1)")
    if len(corrupt_images) > total_images * 0.05:
        risk_level = "HIGH"
        risk_factors.append(f"{len(corrupt_images)} corrupt images (>{5}% of dataset)")
    if blur_stats["blurry_pct"] > 20:
        if risk_level != "HIGH":
            risk_level = "MEDIUM"
        risk_factors.append(f"{blur_stats['blurry_pct']}% blurry images")
    if not risk_factors:
        risk_factors.append("Dataset looks healthy")

    # Build result
    result = {
        "total_images": total_images,
        "num_classes": len(classes),
        "class_distribution": class_distribution,
        "class_names": class_names,
        "file_type": file_type,
        "resolution_stats": resolution_stats,
        "rgb_stats": {
            "red": r_hist_norm,
            "green": g_hist_norm,
            "blue": b_hist_norm,
        },
        "pixel_stats": pixel_stats,
        "blur_stats": blur_stats,
        "duplicate_count": duplicate_count,
        "duplicate_groups": len(duplicates),
        "sample_size": sample_size,
        "corrupt_images": corrupt_images,
        "corrupt_count": len(corrupt_images),
        "imbalance_ratio": imbalance_ratio,
        "minority_classes": minority_classes,
        "image_formats": dict(formats_seen),
        "color_spaces": dict(color_spaces),
        "metadata_samples": metadata_samples,
        "aspect_ratios": {
            "mean": round(float(np.mean(aspect_ratios)), 2) if aspect_ratios else 1.0,
            "std": round(float(np.std(aspect_ratios)), 2) if aspect_ratios else 0,
        },
        "file_size_stats": {
            "mean_kb": round(float(np.mean(file_sizes)) / 1024, 1) if file_sizes else 0,
            "min_kb": round(float(min(file_sizes)) / 1024, 1) if file_sizes else 0,
            "max_kb": round(float(max(file_sizes)) / 1024, 1) if file_sizes else 0,
            "total_mb": round(sum(file_sizes) / (1024 * 1024), 1) if file_sizes else 0,
        },
        "dataset_hash": dataset_hash,
        "recommendations": recommendations,
        "suggested_split": suggested_split,
        "risk_assessment": {
            "level": risk_level,
            "factors": risk_factors,
        },
        "label_encoding": {cls: i for i, cls in enumerate(class_names)},
    }

    # Generate EDA code and report
    result["eda_code"] = _generate_eda_code(result)
    result["eda_report_text"] = _generate_eda_report(result)

    return result


def _generate_eda_code(result: Dict[str, Any]) -> str:
    """Generate a Python script that reproduces the EDA analysis."""
    class_dist = result.get("class_distribution", {})
    pixel = result.get("pixel_stats", {})
    res = result.get("resolution_stats", {})

    code = f'''#!/usr/bin/env python3
"""
Image Dataset EDA Analysis
===========================
Generated by ML Studio
Dataset Hash: {result.get("dataset_hash", "N/A")}
Total Images: {result.get("total_images", 0)}
Classes: {result.get("num_classes", 0)}
"""

import os
import numpy as np
from PIL import Image
from collections import Counter
import warnings
warnings.filterwarnings("ignore")

# ── Dataset Configuration ──────────────────────────────────────────────────────
DATASET_PATH = "./your_dataset"  # Replace with your dataset path
IMAGE_EXTS = {{'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif', '.webp', '.gif'}}

# ── Class Discovery ────────────────────────────────────────────────────────────
def discover_classes(root):
    """Dynamically discover classes from folder structure."""
    classes = {{}}
    for entry in sorted(os.listdir(root)):
        class_dir = os.path.join(root, entry)
        if os.path.isdir(class_dir) and not entry.startswith('.'):
            images = [os.path.join(class_dir, f) for f in os.listdir(class_dir)
                      if os.path.splitext(f)[1].lower() in IMAGE_EXTS]
            if images:
                classes[entry] = sorted(images)
    if not classes:
        # Fallback: collect all images as single class
        all_imgs = [os.path.join(root, f) for f in os.listdir(root)
                    if os.path.splitext(f)[1].lower() in IMAGE_EXTS]
        if all_imgs:
            classes["unlabeled"] = all_imgs
    return classes

# ── Analysis Results (from ML Studio) ──────────────────────────────────────────
print("=" * 60)
print("IMAGE DATASET EDA REPORT")
print("=" * 60)

# Class Distribution
print("\\n📊 Class Distribution:")
class_distribution = {json.dumps(class_dist)}
for cls, count in sorted(class_distribution.items()):
    pct = count / {result.get("total_images", 1)} * 100
    bar = "█" * int(pct / 2)
    print(f"  {{cls:<25}} {{count:>6}} ({{pct:.1f}}%) {{bar}}")

# Imbalance
print(f"\\n⚖️  Imbalance Ratio: {result.get('imbalance_ratio', 1)}:1")
minority = {result.get("minority_classes", [])}
if minority:
    print(f"  ⚠️  Minority classes: {{', '.join(minority)}}")

# Resolution
print(f"\\n📐 Resolution Statistics:")
print(f"  Width:  {res.get('min_width', 0)}-{res.get('max_width', 0)} (avg {res.get('mean_width', 0)})")
print(f"  Height: {res.get('min_height', 0)}-{res.get('max_height', 0)} (avg {res.get('mean_height', 0)})")

# Pixel Statistics
print(f"\\n🎨 Pixel Statistics:")
print(f"  Mean R/G/B: {pixel.get('mean_r', 0):.1f} / {pixel.get('mean_g', 0):.1f} / {pixel.get('mean_b', 0):.1f}")
print(f"  Std  R/G/B: {pixel.get('std_r', 0):.1f} / {pixel.get('std_g', 0):.1f} / {pixel.get('std_b', 0):.1f}")
print(f"  Global Mean: {pixel.get('global_mean', 0):.1f}")
print(f"  Global Std:  {pixel.get('global_std', 0):.1f}")

# Quality
blur = {json.dumps(result.get("blur_stats", {}))}
print(f"\\n🔍 Image Quality:")
print(f"  Blurry images: {{blur.get('blurry_count', 0)}} ({{blur.get('blurry_pct', 0)}}%)")
print(f"  Corrupt images: {result.get('corrupt_count', 0)}")
print(f"  Duplicates: {result.get('duplicate_count', 0)}")

# Recommendations
print("\\n💡 Preprocessing Recommendations:")
recommendations = {json.dumps(result.get("recommendations", []))}
for i, rec in enumerate(recommendations, 1):
    print(f"  {{i}}. {{rec}}")

# Risk Assessment
risk = {json.dumps(result.get("risk_assessment", {}))}
print(f"\\n🛡️  Risk Assessment: {{risk.get('level', 'N/A')}}")
for factor in risk.get("factors", []):
    print(f"  • {{factor}}")

print("\\n" + "=" * 60)
print("Dataset Hash: {result.get('dataset_hash', 'N/A')}")
print("Suggested Split: {result.get('suggested_split', '80/20')}")
print("=" * 60)
'''
    return code


def _generate_eda_report(result: Dict[str, Any]) -> str:
    """Generate a comprehensive text EDA report."""
    class_dist = result.get("class_distribution", {})
    pixel = result.get("pixel_stats", {})
    res = result.get("resolution_stats", {})
    blur = result.get("blur_stats", {})
    risk = result.get("risk_assessment", {})
    formats = result.get("image_formats", {})
    colors = result.get("color_spaces", {})

    report = f"""╔══════════════════════════════════════════════════════════════╗
║            IMAGE DATASET EDA REPORT                          ║
║            Generated by ML Studio                            ║
╚══════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  DATASET OVERVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Dataset Hash ID:        {result.get('dataset_hash', 'N/A')}
  Total Images:           {result.get('total_images', 0):,}
  Number of Classes:      {result.get('num_classes', 0)}
  Image Formats:          {', '.join(f'{k} ({v})' for k, v in formats.items())}
  Color Spaces:           {', '.join(f'{k} ({v})' for k, v in colors.items())}
  Average Resolution:     {res.get('mean_width', 0):.0f} × {res.get('mean_height', 0):.0f}
  Samples Analyzed:       {result.get('sample_size', 0)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PIXEL STATISTICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Pixel Mean (R/G/B):     {pixel.get('mean_r', 0):.2f} / {pixel.get('mean_g', 0):.2f} / {pixel.get('mean_b', 0):.2f}
  Pixel Std  (R/G/B):     {pixel.get('std_r', 0):.2f} / {pixel.get('std_g', 0):.2f} / {pixel.get('std_b', 0):.2f}
  Global Mean:            {pixel.get('global_mean', 0):.2f}
  Global Std:             {pixel.get('global_std', 0):.2f}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  CLASS DISTRIBUTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""
    total = result.get('total_images', 1)
    for cls, count in sorted(class_dist.items(), key=lambda x: -x[1]):
        pct = count / total * 100
        bar = "█" * int(pct / 2) + "░" * (50 - int(pct / 2))
        report += f"  {cls:<25} {count:>6} ({pct:5.1f}%) {bar}\n"

    report += f"""
  Imbalance Ratio:        {result.get('imbalance_ratio', 1)}:1"""

    if result.get('minority_classes'):
        report += f"""
  ⚠ Minority Classes:     {', '.join(result['minority_classes'])}"""

    report += f"""

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  LABEL ENCODING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""
    for cls, idx in result.get('label_encoding', {}).items():
        report += f"  {cls} → {idx}\n"

    report += f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  IMAGE QUALITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Blurry Images:          {blur.get('blurry_count', 0)} ({blur.get('blurry_pct', 0)}%)
  Mean Blur Score:        {blur.get('mean_score', 0)}
  Blur Threshold:         {blur.get('threshold', 100)}
  Corrupt Images:         {result.get('corrupt_count', 0)}
  Duplicate Images:       {result.get('duplicate_count', 0)}
  Duplicate Groups:       {result.get('duplicate_groups', 0)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  RESOLUTION DISTRIBUTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Width:  {res.get('min_width', 0)} - {res.get('max_width', 0)} (avg {res.get('mean_width', 0):.0f} ± {res.get('std_width', 0):.0f})
  Height: {res.get('min_height', 0)} - {res.get('max_height', 0)} (avg {res.get('mean_height', 0):.0f} ± {res.get('std_height', 0):.0f})
  Aspect Ratio:           {result.get('aspect_ratios', {}).get('mean', 1.0)} (std {result.get('aspect_ratios', {}).get('std', 0)})

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  FILE SIZE STATISTICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Mean Size:              {result.get('file_size_stats', {}).get('mean_kb', 0)} KB
  Min Size:               {result.get('file_size_stats', {}).get('min_kb', 0)} KB
  Max Size:               {result.get('file_size_stats', {}).get('max_kb', 0)} KB
  Total Size:             {result.get('file_size_stats', {}).get('total_mb', 0)} MB

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PREPROCESSING RECOMMENDATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""
    for i, rec in enumerate(result.get('recommendations', []), 1):
        report += f"  {i}. {rec}\n"

    report += f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  RISK ASSESSMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Risk Level:             {risk.get('level', 'N/A')}
"""
    for factor in risk.get('factors', []):
        report += f"  • {factor}\n"

    report += f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  TRAIN/TEST CONFIGURATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Suggested Split:        {result.get('suggested_split', '80/20')}
  Class Mapping:          {json.dumps(result.get('label_encoding', {}))}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""
    return report


def run_image_pipeline(
    dataset_path: str,
    config: Dict[str, Any],
) -> Dict[str, Any]:
    """Train an image classification model with comprehensive reporting."""
    from sklearn.model_selection import train_test_split, cross_val_score
    from sklearn.preprocessing import StandardScaler, LabelEncoder
    from sklearn.decomposition import PCA
    from sklearn.metrics import (
        accuracy_score, precision_score, recall_score, f1_score,
        confusion_matrix, classification_report, roc_auc_score
    )

    target_size = tuple(config.get("target_size", [128, 128]))
    model_name = config.get("model_name", "RandomForest")
    test_split = config.get("test_split", 0.2)
    normalize = config.get("normalize", True)
    hyperparams = config.get("hyperparams", {}) or {}
    feature_method = config.get("feature_method", "hog")
    use_pca = config.get("use_pca", False)
    pca_components = config.get("pca_components", 100)
    file_type = config.get("file_type", "image")

    # Discover classes
    classes = _discover_classes(dataset_path)
    if not classes:
        raise ValueError("No images found in dataset path")

    class_names = sorted(classes.keys())

    # Load and extract features
    features = []
    labels = []
    failed_loads = []

    for cls_name in class_names:
        for fpath in classes[cls_name]:
            img = _load_image(fpath, target_size)
            if img is None:
                failed_loads.append(fpath)
                continue
            feat = _extract_features(img, method=feature_method)
            features.append(feat)
            labels.append(cls_name)

    if len(features) < 10:
        raise ValueError(f"Too few valid images loaded ({len(features)}). Need at least 10.")

    X = np.array(features)
    le = LabelEncoder()
    y = le.fit_transform(labels)

    # Split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_split, random_state=42, stratify=y
    )

    # Normalize
    scaler = None
    if normalize:
        scaler = StandardScaler()
        X_train = scaler.fit_transform(X_train)
        X_test = scaler.transform(X_test)

    # Optional PCA
    pca = None
    if use_pca and pca_components < X_train.shape[1]:
        pca = PCA(n_components=min(pca_components, X_train.shape[1], X_train.shape[0]))
        X_train = pca.fit_transform(X_train)
        X_test = pca.transform(X_test)

    # Select model
    model = _get_image_model(model_name, hyperparams)

    # Train
    model.fit(X_train, y_train)

    # Evaluate
    y_pred = model.predict(X_test)
    y_train_pred = model.predict(X_train)

    acc = float(accuracy_score(y_test, y_pred))
    train_acc = float(accuracy_score(y_train, y_train_pred))
    prec = float(precision_score(y_test, y_pred, average='weighted', zero_division=0))
    rec = float(recall_score(y_test, y_pred, average='weighted', zero_division=0))
    f1 = float(f1_score(y_test, y_pred, average='weighted', zero_division=0))
    cm = confusion_matrix(y_test, y_pred).tolist()
    report = classification_report(y_test, y_pred, target_names=class_names, output_dict=True, zero_division=0)

    # ROC-AUC (multi-class)
    roc_auc = None
    try:
        if hasattr(model, 'predict_proba'):
            y_proba = model.predict_proba(X_test)
            if len(class_names) == 2:
                roc_auc = round(float(roc_auc_score(y_test, y_proba[:, 1])), 4)
            else:
                roc_auc = round(float(roc_auc_score(y_test, y_proba, multi_class='ovr', average='weighted')), 4)
    except Exception:
        pass

    # Cross-validation
    cv_scores = None
    try:
        cv = cross_val_score(model, np.vstack([X_train, X_test]),
                             np.concatenate([y_train, y_test]), cv=min(5, len(class_names)), scoring='accuracy')
        cv_scores = {
            "mean": round(float(cv.mean()), 4),
            "std": round(float(cv.std()), 4),
            "scores": [round(float(s), 4) for s in cv],
        }
    except Exception:
        pass

    # Overfitting detection
    overfit_gap = train_acc - acc
    overfitting = "NONE"
    if overfit_gap > 0.15:
        overfitting = "SEVERE"
    elif overfit_gap > 0.08:
        overfitting = "MODERATE"
    elif overfit_gap > 0.03:
        overfitting = "MILD"

    # Per-class metrics
    per_class = {}
    for cls_name in class_names:
        if cls_name in report:
            per_class[cls_name] = {
                "precision": round(report[cls_name]["precision"], 4),
                "recall": round(report[cls_name]["recall"], 4),
                "f1": round(report[cls_name]["f1-score"], 4),
                "support": int(report[cls_name]["support"]),
            }

    # Error analysis
    misclassified_indices = np.where(y_pred != y_test)[0]
    misclassified = []
    for idx in misclassified_indices[:20]:
        misclassified.append({
            "true_class": class_names[y_test[idx]],
            "predicted_class": class_names[y_pred[idx]],
            "index": int(idx),
        })

    # Confidence distribution
    confidence_stats = None
    if hasattr(model, 'predict_proba'):
        try:
            probas = model.predict_proba(X_test)
            max_probs = np.max(probas, axis=1)
            confidence_stats = {
                "mean": round(float(np.mean(max_probs)), 4),
                "std": round(float(np.std(max_probs)), 4),
                "min": round(float(np.min(max_probs)), 4),
                "max": round(float(np.max(max_probs)), 4),
                "low_confidence_count": int(np.sum(max_probs < 0.5)),
                "high_confidence_count": int(np.sum(max_probs > 0.9)),
                "distribution": np.histogram(max_probs, bins=10, range=(0, 1))[0].tolist(),
            }
        except Exception:
            pass

    # Feature importance (for tree-based models)
    feature_importance = None
    if hasattr(model, 'feature_importances_'):
        importances = model.feature_importances_
        top_k = min(20, len(importances))
        top_indices = np.argsort(importances)[-top_k:][::-1]
        feature_importance = {
            "top_features": [{"index": int(i), "importance": round(float(importances[i]), 4)} for i in top_indices],
            "total_features": len(importances),
        }

    result = {
        "accuracy": round(acc, 4),
        "train_accuracy": round(train_acc, 4),
        "precision": round(prec, 4),
        "recall": round(rec, 4),
        "f1_score": round(f1, 4),
        "roc_auc": roc_auc,
        "confusion_matrix": cm,
        "class_names": class_names,
        "per_class_metrics": per_class,
        "total_samples": len(features),
        "train_samples": len(X_train),
        "test_samples": len(X_test),
        "failed_loads": len(failed_loads),
        "feature_dim": X_train.shape[1],
        "model_name": model_name,
        "feature_method": feature_method,
        "file_type": file_type,
        "cv_scores": cv_scores,
        "overfitting": {
            "level": overfitting,
            "train_acc": round(train_acc, 4),
            "test_acc": round(acc, 4),
            "gap": round(overfit_gap, 4),
        },
        "error_analysis": {
            "total_misclassified": len(misclassified_indices),
            "misclassified_pct": round(len(misclassified_indices) / max(len(y_test), 1) * 100, 1),
            "samples": misclassified,
        },
        "confidence_stats": confidence_stats,
        "feature_importance": feature_importance,
    }

    # Save model artifacts for prediction
    import joblib
    model_dir = os.path.join(dataset_path, "..", "_model_artifacts")
    os.makedirs(model_dir, exist_ok=True)
    joblib.dump(model, os.path.join(model_dir, "model.joblib"))
    joblib.dump(le, os.path.join(model_dir, "label_encoder.joblib"))
    if scaler:
        joblib.dump(scaler, os.path.join(model_dir, "scaler.joblib"))
    if pca:
        joblib.dump(pca, os.path.join(model_dir, "pca.joblib"))
    # Save config for prediction
    import json as _json
    with open(os.path.join(model_dir, "config.json"), "w") as f:
        _json.dump({"target_size": list(target_size), "feature_method": feature_method,
                     "normalize": normalize, "use_pca": use_pca}, f)

    # Generate pipeline code and report
    result["report_code"] = _generate_pipeline_code(result, config)
    result["pipeline_report_text"] = _generate_pipeline_report(result, config)

    return result


def predict_single_image(job_dir: str, image_path: str) -> Dict[str, Any]:
    """Predict the class of a single image using a trained pipeline model."""
    import joblib, json as _json

    model_dir = os.path.join(job_dir, "_model_artifacts")
    if not os.path.isdir(model_dir):
        # Try parent dir
        model_dir = os.path.join(os.path.dirname(job_dir), "_model_artifacts")
    if not os.path.isdir(model_dir):
        raise FileNotFoundError("No trained model found. Run pipeline first.")

    model = joblib.load(os.path.join(model_dir, "model.joblib"))
    le = joblib.load(os.path.join(model_dir, "label_encoder.joblib"))
    scaler_path = os.path.join(model_dir, "scaler.joblib")
    scaler = joblib.load(scaler_path) if os.path.exists(scaler_path) else None
    pca_path = os.path.join(model_dir, "pca.joblib")
    pca = joblib.load(pca_path) if os.path.exists(pca_path) else None

    with open(os.path.join(model_dir, "config.json")) as f:
        cfg = _json.load(f)

    target_size = tuple(cfg.get("target_size", [128, 128]))
    feature_method = cfg.get("feature_method", "hog")

    img = _load_image(image_path, target_size)
    if img is None:
        raise ValueError("Could not load the image. Ensure it is a valid image file.")

    feat = _extract_features(img, method=feature_method)
    X = feat.reshape(1, -1)

    if scaler:
        X = scaler.transform(X)
    if pca:
        X = pca.transform(X)

    predicted_idx = model.predict(X)[0]
    predicted_class = le.inverse_transform([predicted_idx])[0]

    probabilities = {}
    if hasattr(model, "predict_proba"):
        probs = model.predict_proba(X)[0]
        for i, cls in enumerate(le.classes_):
            probabilities[cls] = round(float(probs[i]), 4)

    confidence = max(probabilities.values()) if probabilities else None

    # Build report
    report_lines = [
        f"Prediction: {predicted_class}",
        f"Confidence: {confidence * 100:.1f}%" if confidence else "",
    ]
    if predicted_class.lower() in ("healthy", "normal", "benign", "good"):
        report_lines.append("Status: The image appears healthy/normal.")
        report_lines.append("Recommendation: Continue current care practices to maintain health.")
    else:
        report_lines.append(f"Status: Potential issue detected — {predicted_class}.")
        report_lines.append("Recommendation: Consult domain experts for further assessment and treatment options.")

    return {
        "predicted_class": predicted_class,
        "confidence": confidence,
        "probabilities": probabilities,
        "report": "\n".join([l for l in report_lines if l]),
    }


def _generate_pipeline_code(result: Dict[str, Any], config: Dict[str, Any]) -> str:
    """Generate a Python script that reproduces the image pipeline."""
    class_names = result.get("class_names", [])
    cm = result.get("confusion_matrix", [])
    per_class = result.get("per_class_metrics", {})

    code = f'''#!/usr/bin/env python3
"""
Image Classification Pipeline
==============================
Generated by ML Studio
Model: {result.get("model_name", "N/A")}
Feature Extraction: {config.get("feature_method", "hog")}
Image Size: {config.get("target_size", [128, 128])}
Test Split: {config.get("test_split", 0.2)}
Accuracy: {result.get("accuracy", 0):.4f}
"""

import os
import numpy as np
from PIL import Image
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
from sklearn.metrics import confusion_matrix, classification_report
from skimage.feature import hog
from skimage.color import rgb2gray
import warnings
warnings.filterwarnings("ignore")

# ── Configuration ──────────────────────────────────────────────────────────────
DATASET_PATH = "./your_dataset"   # Replace with your dataset path
TARGET_SIZE = tuple({list(config.get("target_size", [128, 128]))})
TEST_SPLIT = {config.get("test_split", 0.2)}
MODEL_NAME = "{result.get("model_name", "RandomForest")}"
FEATURE_METHOD = "{config.get("feature_method", "hog")}"
IMAGE_EXTS = {{'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp', '.gif'}}

# ── Image Loading & Feature Extraction ─────────────────────────────────────────
def load_image(path, target_size=TARGET_SIZE):
    img = Image.open(path).convert("RGB").resize(target_size)
    return np.array(img)

def extract_features(img, method=FEATURE_METHOD):
    gray = rgb2gray(img)
    color_features = []
    for ch in range(3):
        hist, _ = np.histogram(img[:, :, ch], bins=32, range=(0, 256))
        color_features.extend(hist / max(hist.sum(), 1))
    if method == "hog" or method == "combined":
        hog_feat = hog(gray, orientations=9, pixels_per_cell=(8, 8),
                       cells_per_block=(2, 2), feature_vector=True)
        features = np.concatenate([hog_feat, color_features])
    else:
        features = np.array(color_features)
    return features

# ── Dataset Loading ────────────────────────────────────────────────────────────
def discover_classes(root):
    classes = {{}}
    for entry in sorted(os.listdir(root)):
        class_dir = os.path.join(root, entry)
        if os.path.isdir(class_dir) and not entry.startswith('.'):
            images = [os.path.join(class_dir, f) for f in os.listdir(class_dir)
                      if os.path.splitext(f)[1].lower() in IMAGE_EXTS]
            if images:
                classes[entry] = sorted(images)
    return classes

# ── Main Pipeline ──────────────────────────────────────────────────────────────
print("Loading dataset...")
classes = discover_classes(DATASET_PATH)
class_names = sorted(classes.keys())
print(f"Found {{len(class_names)}} classes: {{class_names}}")

features, labels = [], []
for cls_name in class_names:
    for fpath in classes[cls_name]:
        img = load_image(fpath)
        features.append(extract_features(img))
        labels.append(cls_name)

X = np.array(features)
le = LabelEncoder()
y = le.fit_transform(labels)
print(f"Loaded {{len(features)}} images, feature dim: {{X.shape[1]}}")

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=TEST_SPLIT, random_state=42, stratify=y
)

scaler = StandardScaler()
X_train = scaler.fit_transform(X_train)
X_test = scaler.transform(X_test)

# ── Model Training ─────────────────────────────────────────────────────────────
print(f"Training {{MODEL_NAME}}...")
'''

    # Add model import based on selected model
    model_imports = {
        "RandomForest": "from sklearn.ensemble import RandomForestClassifier\nmodel = RandomForestClassifier(n_estimators=100, random_state=42)",
        "SVM": "from sklearn.svm import SVC\nmodel = SVC(kernel='rbf', probability=True, random_state=42)",
        "KNN": "from sklearn.neighbors import KNeighborsClassifier\nmodel = KNeighborsClassifier(n_neighbors=5)",
        "LogisticRegression": "from sklearn.linear_model import LogisticRegression\nmodel = LogisticRegression(max_iter=1000, random_state=42)",
        "GradientBoosting": "from sklearn.ensemble import GradientBoostingClassifier\nmodel = GradientBoostingClassifier(n_estimators=100, random_state=42)",
        "ExtraTrees": "from sklearn.ensemble import ExtraTreesClassifier\nmodel = ExtraTreesClassifier(n_estimators=100, random_state=42)",
    }
    code += model_imports.get(result.get("model_name", "RandomForest"),
                              "from sklearn.ensemble import RandomForestClassifier\nmodel = RandomForestClassifier(n_estimators=100, random_state=42)")

    code += f'''

model.fit(X_train, y_train)

# ── Evaluation ─────────────────────────────────────────────────────────────────
y_pred = model.predict(X_test)
y_train_pred = model.predict(X_train)

train_acc = accuracy_score(y_train, y_train_pred)
test_acc = accuracy_score(y_test, y_pred)

print(f"\\n{'='*60}")
print(f"MODEL PERFORMANCE")
print(f"{'='*60}")
print(f"  Training Accuracy:  {{train_acc:.4f}}")
print(f"  Test Accuracy:      {{test_acc:.4f}}")
print(f"  Precision:          {{precision_score(y_test, y_pred, average='weighted', zero_division=0):.4f}}")
print(f"  Recall:             {{recall_score(y_test, y_pred, average='weighted', zero_division=0):.4f}}")
print(f"  F1 Score:           {{f1_score(y_test, y_pred, average='weighted', zero_division=0):.4f}}")

# Overfitting check
gap = train_acc - test_acc
if gap > 0.15:
    print(f"  ⚠️  SEVERE overfitting detected (gap: {{gap:.4f}})")
elif gap > 0.08:
    print(f"  ⚠️  Moderate overfitting (gap: {{gap:.4f}})")

print(f"\\nClassification Report:")
print(classification_report(y_test, y_pred, target_names=class_names, zero_division=0))

print(f"Confusion Matrix:")
print(confusion_matrix(y_test, y_pred))
'''
    return code


def _generate_pipeline_report(result: Dict[str, Any], config: Dict[str, Any]) -> str:
    """Generate a comprehensive pipeline report document."""
    overfit = result.get("overfitting", {})
    error = result.get("error_analysis", {})
    conf = result.get("confidence_stats", {})
    cv = result.get("cv_scores", {})
    per_class = result.get("per_class_metrics", {})

    report = f"""╔══════════════════════════════════════════════════════════════╗
║          IMAGE PIPELINE REPORT                               ║
║          Generated by ML Studio                              ║
╚══════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PIPELINE CONFIGURATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Model:                  {result.get('model_name', 'N/A')}
  Feature Extraction:     {config.get('feature_method', 'hog')}
  Image Size:             {config.get('target_size', [128, 128])}
  Test Split:             {config.get('test_split', 0.2)}
  Total Samples:          {result.get('total_samples', 0)}
  Train / Test:           {result.get('train_samples', 0)} / {result.get('test_samples', 0)}
  Feature Dimensions:     {result.get('feature_dim', 0)}
  Failed Loads:           {result.get('failed_loads', 0)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. TRAINING PERFORMANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Training Accuracy:      {overfit.get('train_acc', 0):.4f} ({overfit.get('train_acc', 0) * 100:.1f}%)
  Validation Accuracy:    {overfit.get('test_acc', 0):.4f} ({overfit.get('test_acc', 0) * 100:.1f}%)
  Overfit Gap:            {overfit.get('gap', 0):.4f}
  Overfitting Level:      {overfit.get('level', 'NONE')}
"""

    if cv:
        report += f"""
  Cross-Validation:       {cv.get('mean', 0):.4f} ± {cv.get('std', 0):.4f}
  CV Fold Scores:         {', '.join(str(s) for s in cv.get('scores', []))}
"""

    report += f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  2. EVALUATION METRICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Accuracy:               {result.get('accuracy', 0):.4f}
  Precision (weighted):   {result.get('precision', 0):.4f}
  Recall (weighted):      {result.get('recall', 0):.4f}
  F1 Score (weighted):    {result.get('f1_score', 0):.4f}
  ROC-AUC:                {result.get('roc_auc', 'N/A')}

  Per-Class Breakdown:
  {'Class':<25} {'Precision':>10} {'Recall':>10} {'F1':>10} {'Support':>10}
  {'-' * 65}
"""
    for cls_name, m in per_class.items():
        report += f"  {cls_name:<25} {m.get('precision', 0):>10.4f} {m.get('recall', 0):>10.4f} {m.get('f1', 0):>10.4f} {m.get('support', 0):>10}\n"

    report += f"""
  Confusion Matrix:
"""
    cm = result.get("confusion_matrix", [])
    class_names = result.get("class_names", [])
    if cm and class_names:
        header = "  " + " " * 15 + " ".join(f"{c[:8]:>8}" for c in class_names)
        report += header + "\n"
        for i, row in enumerate(cm):
            report += f"  {class_names[i][:14]:<15}" + " ".join(f"{v:>8}" for v in row) + "\n"

    report += f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  3. ERROR ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Total Misclassified:    {error.get('total_misclassified', 0)} ({error.get('misclassified_pct', 0)}%)

  Misclassified Samples (top 10):
"""
    for sample in error.get("samples", [])[:10]:
        report += f"    True: {sample['true_class']:<20} → Predicted: {sample['predicted_class']}\n"

    if conf:
        report += f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  4. PREDICTION INTELLIGENCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Mean Confidence:        {conf.get('mean', 0):.4f} ({conf.get('mean', 0) * 100:.1f}%)
  Std Confidence:         {conf.get('std', 0):.4f}
  Min Confidence:         {conf.get('min', 0):.4f}
  Max Confidence:         {conf.get('max', 0):.4f}
  Low Confidence (<50%):  {conf.get('low_confidence_count', 0)}
  High Confidence (>90%): {conf.get('high_confidence_count', 0)}

  Confidence Distribution (0-100%):
"""
        dist = conf.get("distribution", [])
        for i, count in enumerate(dist):
            pct_label = f"{i * 10}-{(i + 1) * 10}%"
            bar = "█" * min(count, 50)
            report += f"    {pct_label:<10} {count:>4} {bar}\n"

    fi = result.get("feature_importance")
    if fi:
        report += f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  5. FEATURE IMPORTANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Total Features:         {fi.get('total_features', 0)}
  Top Features:
"""
        for f in fi.get("top_features", [])[:10]:
            bar = "█" * int(f["importance"] * 100)
            report += f"    Feature[{f['index']:>4}]  {f['importance']:.4f}  {bar}\n"

    report += f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""
    return report


def _extract_lbp_features(gray: np.ndarray, radius: int = 3, n_points: int = 24) -> np.ndarray:
    """Extract Local Binary Pattern histogram features."""
    from skimage.feature import local_binary_pattern
    lbp = local_binary_pattern(gray, n_points, radius, method='uniform')
    n_bins = n_points + 2
    hist, _ = np.histogram(lbp.ravel(), bins=n_bins, range=(0, n_bins), density=True)
    return hist


def _extract_features(img: np.ndarray, method: str = "hog") -> np.ndarray:
    """Extract features from image using the specified method."""
    from skimage.feature import hog
    from skimage.color import rgb2gray

    gray = rgb2gray(img)

    if method == "lbp":
        lbp_feat = _extract_lbp_features((gray * 255).astype(np.uint8))
        color_features = []
        for ch in range(3):
            hist, _ = np.histogram(img[:, :, ch], bins=32, range=(0, 256))
            color_features.extend(hist / max(hist.sum(), 1))
        return np.concatenate([lbp_feat, color_features])

    elif method == "combined":
        # HOG + LBP + Color histogram
        hog_features = hog(gray, orientations=9, pixels_per_cell=(8, 8),
                           cells_per_block=(2, 2), feature_vector=True)
        lbp_feat = _extract_lbp_features((gray * 255).astype(np.uint8))
        color_features = []
        for ch in range(3):
            hist, _ = np.histogram(img[:, :, ch], bins=32, range=(0, 256))
            color_features.extend(hist / max(hist.sum(), 1))
        return np.concatenate([hog_features, lbp_feat, color_features])

    else:  # default: hog
        hog_features = hog(gray, orientations=9, pixels_per_cell=(8, 8),
                           cells_per_block=(2, 2), feature_vector=True)
        color_features = []
        for ch in range(3):
            hist, _ = np.histogram(img[:, :, ch], bins=32, range=(0, 256))
            color_features.extend(hist / max(hist.sum(), 1))
        return np.concatenate([hog_features, color_features])


def _get_image_model(model_name: str, hyperparams: Dict[str, Any]):
    """Return a classifier for image classification."""
    from sklearn.ensemble import (
        RandomForestClassifier, GradientBoostingClassifier, ExtraTreesClassifier
    )
    from sklearn.svm import SVC
    from sklearn.neighbors import KNeighborsClassifier
    from sklearn.linear_model import LogisticRegression

    # Convert string hyperparams to proper types
    clean_params = {}
    for k, v in hyperparams.items():
        if isinstance(v, str):
            try:
                clean_params[k] = int(v)
            except ValueError:
                try:
                    clean_params[k] = float(v)
                except ValueError:
                    clean_params[k] = v
        else:
            clean_params[k] = v

    models = {
        "RandomForest": lambda: RandomForestClassifier(n_estimators=100, random_state=42),
        "SVM": lambda: SVC(kernel="rbf", probability=True, random_state=42),
        "KNN": lambda: KNeighborsClassifier(n_neighbors=5),
        "LogisticRegression": lambda: LogisticRegression(max_iter=1000, random_state=42),
        "GradientBoosting": lambda: GradientBoostingClassifier(n_estimators=100, random_state=42),
        "ExtraTrees": lambda: ExtraTreesClassifier(n_estimators=100, random_state=42),
    }

    # Optional: XGBoost
    try:
        from xgboost import XGBClassifier
        models["XGBoost"] = lambda: XGBClassifier(
            n_estimators=100, max_depth=6, learning_rate=0.1,
            use_label_encoder=False, eval_metric='mlogloss', random_state=42, verbosity=0
        )
    except ImportError:
        pass

    # Optional: LightGBM
    try:
        from lightgbm import LGBMClassifier
        models["LightGBM"] = lambda: LGBMClassifier(
            n_estimators=100, max_depth=6, learning_rate=0.1, random_state=42, verbose=-1
        )
    except ImportError:
        pass

    name_lower = model_name.lower().replace("_", "").replace(" ", "")
    selected = None
    for key, factory in models.items():
        if key.lower().replace("_", "") == name_lower:
            selected = factory()
            break

    if selected is None:
        selected = models["RandomForest"]()
        logger.warning(f"Unknown model '{model_name}', falling back to RandomForest")

    if clean_params:
        try:
            selected.set_params(**clean_params)
        except Exception as e:
            logger.warning(f"Failed to set hyperparams: {e}")

    return selected


def generate_image_report(result: Dict[str, Any], config: Dict[str, Any]) -> str:
    """Legacy wrapper — calls _generate_pipeline_code."""
    return _generate_pipeline_code(result, config)
