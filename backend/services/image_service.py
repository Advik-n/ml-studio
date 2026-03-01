import os
import uuid
import hashlib
import logging
from typing import Dict, Any, List, Tuple, Optional
from pathlib import Path
import numpy as np

logger = logging.getLogger(__name__)

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
    """Discover class folders and their image files.
    Handles: flat (root/class/imgs), split (root/train/class/imgs),
    and nested (root/wrapper/class/imgs) structures.
    """
    IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp', '.gif'}

    def _is_image(f):
        return os.path.splitext(f)[1].lower() in IMAGE_EXTS

    def _scan_flat(root):
        """Check if root directly contains class folders with images."""
        classes = {}
        for entry in sorted(os.listdir(root)):
            class_dir = os.path.join(root, entry)
            if os.path.isdir(class_dir):
                images = [os.path.join(class_dir, f) for f in os.listdir(class_dir) if _is_image(f)]
                if images:
                    classes[entry] = images
        return classes

    # 1. Try direct class folders
    classes = _scan_flat(dataset_path)
    if classes:
        return classes

    # 2. Check for train/test/val split structure or single wrapper folder
    subdirs = [d for d in sorted(os.listdir(dataset_path)) if os.path.isdir(os.path.join(dataset_path, d))]

    SPLIT_NAMES = {'train', 'test', 'val', 'validation', 'dev', 'training', 'testing'}
    split_dirs = [d for d in subdirs if d.lower() in SPLIT_NAMES]

    if split_dirs:
        merged = {}
        for split in split_dirs:
            split_classes = _scan_flat(os.path.join(dataset_path, split))
            for cls, files in split_classes.items():
                merged.setdefault(cls, []).extend(files)
        if merged:
            return merged

    # 3. Check one level deeper (wrapper folder like "dataset_name/")
    for subdir in subdirs:
        sub_path = os.path.join(dataset_path, subdir)
        sub_classes = _scan_flat(sub_path)
        if sub_classes:
            return sub_classes
        # Check if this subdir has train/test splits
        sub_subdirs = [d for d in os.listdir(sub_path) if os.path.isdir(os.path.join(sub_path, d))]
        sub_splits = [d for d in sub_subdirs if d.lower() in SPLIT_NAMES]
        if sub_splits:
            merged = {}
            for split in sub_splits:
                split_classes = _scan_flat(os.path.join(sub_path, split))
                for cls, files in split_classes.items():
                    merged.setdefault(cls, []).extend(files)
            if merged:
                return merged

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

def run_image_eda(dataset_path: str, max_sample: int = 500) -> Dict[str, Any]:
    """Run comprehensive image EDA on a folder-structured dataset."""
    import cv2
    from PIL import Image
    from collections import Counter
    
    classes = _discover_classes(dataset_path)
    if not classes:
        raise ValueError(f"No class folders with images found in {dataset_path}")
    
    # Class distribution
    class_distribution = {cls: len(files) for cls, files in classes.items()}
    total_images = sum(class_distribution.values())
    
    # Sample images for analysis
    all_files = [(cls, f) for cls, files in classes.items() for f in files]
    sample_size = min(max_sample, len(all_files))
    rng = np.random.RandomState(42)
    sample_indices = rng.choice(len(all_files), sample_size, replace=False)
    sampled = [all_files[i] for i in sample_indices]
    
    # Analyze sampled images
    widths, heights = [], []
    r_hist = np.zeros(256, dtype=np.float64)
    g_hist = np.zeros(256, dtype=np.float64)
    b_hist = np.zeros(256, dtype=np.float64)
    blur_scores = {}
    hashes = {}
    
    for cls, fpath in sampled:
        try:
            img = Image.open(fpath).convert("RGB")
            w, h = img.size
            widths.append(w)
            heights.append(h)
            
            arr = np.array(img)
            
            # RGB histograms
            r_hist += np.histogram(arr[:,:,0], bins=256, range=(0,256))[0]
            g_hist += np.histogram(arr[:,:,1], bins=256, range=(0,256))[0]
            b_hist += np.histogram(arr[:,:,2], bins=256, range=(0,256))[0]
            
            # Blur score
            small = img.resize((256, 256))
            small_arr = np.array(small)
            score = _compute_blur_score(small_arr)
            blur_scores[os.path.basename(fpath)] = round(score, 2)
            
            # Hash for duplicates
            small_hash = _compute_dhash(np.array(img.resize((9, 8))))
            hashes.setdefault(small_hash, []).append(fpath)
        except Exception as e:
            logger.warning(f"Error analyzing {fpath}: {e}")
    
    # Normalize histograms
    total_px = max(sum(r_hist), 1)
    r_hist = (r_hist / total_px).tolist()
    g_hist = (g_hist / total_px).tolist()
    b_hist = (b_hist / total_px).tolist()
    
    # Resolution stats
    resolution_stats = {
        "min_width": int(min(widths)) if widths else 0,
        "max_width": int(max(widths)) if widths else 0,
        "mean_width": round(float(np.mean(widths)), 1) if widths else 0,
        "min_height": int(min(heights)) if heights else 0,
        "max_height": int(max(heights)) if heights else 0,
        "mean_height": round(float(np.mean(heights)), 1) if heights else 0,
        "width_distribution": np.histogram(widths, bins=20)[0].tolist() if widths else [],
        "height_distribution": np.histogram(heights, bins=20)[0].tolist() if heights else [],
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
    
    return {
        "total_images": total_images,
        "num_classes": len(classes),
        "class_distribution": class_distribution,
        "resolution_stats": resolution_stats,
        "rgb_stats": {
            "red": r_hist,
            "green": g_hist,
            "blue": b_hist,
        },
        "blur_stats": blur_stats,
        "duplicate_count": duplicate_count,
        "duplicate_groups": len(duplicates),
        "sample_size": sample_size,
    }


def run_image_pipeline(
    dataset_path: str,
    config: Dict[str, Any],
) -> Dict[str, Any]:
    """Train an image classification model using HOG features + sklearn."""
    from skimage.feature import hog
    from skimage.color import rgb2gray
    from sklearn.model_selection import train_test_split
    from sklearn.preprocessing import StandardScaler, LabelEncoder
    from sklearn.metrics import (
        accuracy_score, precision_score, recall_score, f1_score,
        confusion_matrix, classification_report
    )
    
    target_size = tuple(config.get("target_size", [128, 128]))
    model_name = config.get("model_name", "RandomForest")
    test_split = config.get("test_split", 0.2)
    normalize = config.get("normalize", True)
    hyperparams = config.get("hyperparams", {}) or {}
    
    # Discover classes
    classes = _discover_classes(dataset_path)
    if not classes:
        raise ValueError("No class folders with images found")
    
    class_names = sorted(classes.keys())
    
    # Load and extract features
    features = []
    labels = []
    
    for cls_name in class_names:
        for fpath in classes[cls_name]:
            img = _load_image(fpath, target_size)
            if img is None:
                continue
            
            # Convert to grayscale and extract HOG features
            gray = rgb2gray(img)
            hog_features = hog(
                gray,
                orientations=9,
                pixels_per_cell=(8, 8),
                cells_per_block=(2, 2),
                feature_vector=True,
            )
            
            # Also add color histogram features
            color_features = []
            for ch in range(3):
                hist, _ = np.histogram(img[:,:,ch], bins=32, range=(0, 256))
                color_features.extend(hist / max(hist.sum(), 1))
            
            combined = np.concatenate([hog_features, color_features])
            features.append(combined)
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
    if normalize:
        scaler = StandardScaler()
        X_train = scaler.fit_transform(X_train)
        X_test = scaler.transform(X_test)
    
    # Select model
    model = _get_image_model(model_name, hyperparams)
    
    # Train
    model.fit(X_train, y_train)
    
    # Evaluate
    y_pred = model.predict(X_test)
    
    acc = float(accuracy_score(y_test, y_pred))
    prec = float(precision_score(y_test, y_pred, average='weighted', zero_division=0))
    rec = float(recall_score(y_test, y_pred, average='weighted', zero_division=0))
    f1 = float(f1_score(y_test, y_pred, average='weighted', zero_division=0))
    cm = confusion_matrix(y_test, y_pred).tolist()
    report = classification_report(y_test, y_pred, target_names=class_names, output_dict=True, zero_division=0)
    
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
    
    return {
        "accuracy": round(acc, 4),
        "precision": round(prec, 4),
        "recall": round(rec, 4),
        "f1_score": round(f1, 4),
        "confusion_matrix": cm,
        "class_names": class_names,
        "per_class_metrics": per_class,
        "total_samples": len(features),
        "train_samples": len(X_train),
        "test_samples": len(X_test),
        "feature_dim": X.shape[1],
        "model_name": model_name,
    }


def _get_image_model(model_name: str, hyperparams: Dict[str, Any]):
    """Return an sklearn classifier for image classification."""
    from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
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
        "RandomForest": RandomForestClassifier(n_estimators=100, random_state=42),
        "SVM": SVC(kernel="rbf", random_state=42),
        "KNN": KNeighborsClassifier(n_neighbors=5),
        "LogisticRegression": LogisticRegression(max_iter=1000, random_state=42),
        "GradientBoosting": GradientBoostingClassifier(n_estimators=100, random_state=42),
    }
    
    name_lower = model_name.lower().replace("_", "").replace(" ", "")
    selected = None
    for key, val in models.items():
        if key.lower().replace("_", "") == name_lower:
            selected = val
            break
    
    if selected is None:
        selected = models["RandomForest"]
        logger.warning(f"Unknown model '{model_name}', falling back to RandomForest")
    
    if clean_params:
        try:
            selected.set_params(**clean_params)
        except Exception as e:
            logger.warning(f"Failed to set hyperparams: {e}")
    
    return selected
