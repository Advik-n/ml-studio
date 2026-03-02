"""MediTech Image Analysis Service — domain-specific medical imaging analysis
layered on top of general image EDA. For research/educational purposes only."""

import os
import logging
from typing import Dict, Any, List

logger = logging.getLogger(__name__)
DISCLAIMER = "For research/educational purposes only. Not for medical diagnosis."

# Knowledge Base — common medical imaging findings
def _kb(name, desc, causes, risk, urgency, appearance):
    return {"name": name, "description": desc, "common_causes": causes,
            "risk_level": risk, "urgency": urgency, "typical_appearance": appearance}

KNOWLEDGE_BASE: Dict[str, Dict[str, Any]] = {
    "melanoma": _kb("Melanoma", "Malignant skin neoplasm arising from melanocytes.",
        ["UV exposure", "genetic predisposition", "dysplastic nevi"], "HIGH", "CRITICAL",
        "Asymmetric, irregular borders, color variegation (brown/black/red/blue), diameter >6mm."),
    "benign_nevus": _kb("Benign Nevus", "Common mole; benign proliferation of melanocytes.",
        ["genetic factors", "sun exposure"], "LOW", "LOW",
        "Symmetric, uniform color, smooth borders, <6mm diameter."),
    "basal_cell_carcinoma": _kb("Basal Cell Carcinoma", "Most common skin cancer, slow growing.",
        ["chronic UV exposure", "fair skin", "immunosuppression"], "MODERATE", "MODERATE",
        "Pearly or waxy bump, rolled edges, central ulceration, telangiectasia."),
    "diabetic_retinopathy": _kb("Diabetic Retinopathy", "Retinal micro-vascular damage from hyperglycaemia.",
        ["type 1/2 diabetes", "poor glycaemic control", "hypertension"], "HIGH", "HIGH",
        "Micro-aneurysms, haemorrhages, hard exudates, neovascularisation."),
    "glaucoma": _kb("Glaucoma", "Progressive optic neuropathy with characteristic disc changes.",
        ["elevated IOP", "age", "family history", "myopia"], "HIGH", "MODERATE",
        "Increased cup-to-disc ratio, disc haemorrhage, nerve fibre layer defects."),
    "pneumonia": _kb("Pneumonia", "Lung parenchymal infection producing consolidation.",
        ["bacterial infection", "viral infection", "aspiration"], "MODERATE", "HIGH",
        "Lobar or patchy opacities, air bronchograms, pleural effusion."),
    "fracture": _kb("Fracture", "Break in bone continuity visible on radiograph.",
        ["trauma", "osteoporosis", "pathologic weakening"], "MODERATE", "HIGH",
        "Cortical disruption, fracture line, displacement, soft-tissue swelling."),
    "tumor": _kb("Tumor / Mass", "Abnormal tissue growth, may be benign or malignant.",
        ["genetic mutations", "environmental carcinogens", "chronic inflammation"], "HIGH", "HIGH",
        "Well- or ill-defined mass, variable density, possible calcification or necrosis."),
    "inflammation": _kb("Inflammation", "Tissue response to injury or infection.",
        ["infection", "autoimmune response", "trauma"], "MODERATE", "MODERATE",
        "Erythema, oedema, increased vascularity, warmth."),
    "edema": _kb("Edema", "Abnormal fluid accumulation in interstitial tissues.",
        ["heart failure", "renal disease", "lymphatic obstruction"], "MODERATE", "MODERATE",
        "Tissue swelling, increased signal on MRI T2, ground-glass opacity on CT."),
    "hemorrhage": _kb("Hemorrhage", "Bleeding into tissue or body cavity.",
        ["trauma", "coagulopathy", "vascular malformation", "hypertension"], "HIGH", "CRITICAL",
        "Hyper-dense on CT, signal varies with age on MRI, fluid-fluid levels."),
    "fibrosis": _kb("Fibrosis", "Excess fibrous tissue replacing normal parenchyma.",
        ["chronic inflammation", "radiation", "autoimmune disease"], "MODERATE", "MODERATE",
        "Reticular pattern, honeycombing, traction bronchiectasis, volume loss."),
    "calcification": _kb("Calcification", "Calcium deposits within tissue.",
        ["prior infection", "atherosclerosis", "tumour necrosis"], "LOW", "LOW",
        "Dense white foci on X-ray/CT, punctate or coarse pattern."),
    "cyst": _kb("Cyst", "Fluid-filled sac, usually benign.",
        ["developmental anomaly", "obstruction", "parasitic infection"], "LOW", "LOW",
        "Well-defined, thin-walled, homogeneous fluid density, no enhancement."),
    "abscess": _kb("Abscess", "Localised collection of pus within tissue.",
        ["bacterial infection", "post-surgical complication", "foreign body"], "MODERATE", "HIGH",
        "Rim-enhancing collection, surrounding oedema, restricted diffusion on MRI."),
}

# Medical colour semantics
_COLOUR_SEMANTICS = {
    "dark_brown_black": {"pigment": "melanin", "significance": "melanocytic activity"},
    "red": {"pigment": "haemoglobin", "significance": "inflammation or vascularity"},
    "blue_grey": {"pigment": "deep melanin / vascular", "significance": "dermal pigment or vascular lesion"},
    "white": {"pigment": "fibrosis / regression", "significance": "scarring or immune response"},
    "yellow": {"pigment": "lipid / keratin", "significance": "lipid deposition or keratinisation"},
}

# Internal helpers

def _sample_images(dataset_path: str, class_files: Dict[str, List[str]],
                   max_sample: int) -> Dict[str, List[str]]:
    """Return at most *max_sample* images per class."""
    import numpy as np
    rng = np.random.RandomState(42)
    sampled: Dict[str, List[str]] = {}
    for cls, files in class_files.items():
        if len(files) <= max_sample:
            sampled[cls] = list(files)
        else:
            idx = rng.choice(len(files), max_sample, replace=False)
            sampled[cls] = [files[i] for i in idx]
    return sampled

def _load_image_array(path: str, size: tuple = (128, 128)):
    """Load an image as an RGB numpy array, resized to *size*."""
    from PIL import Image
    import numpy as np
    try:
        img = Image.open(path).convert("RGB")
        img = img.resize(size)
        return np.array(img, dtype=np.float64)
    except Exception as e:
        logger.debug(f"Could not load {path}: {e}")
        return None

def _pixel_stats(arr):
    """Return per-channel mean and std for an image array."""
    import numpy as np
    means = arr.reshape(-1, 3).mean(axis=0)
    stds = arr.reshape(-1, 3).std(axis=0)
    return means, stds

def _glcm_features(gray_uint8):
    """Compute GLCM-derived texture features (contrast, dissimilarity,
    homogeneity, energy, correlation) using scikit-image."""
    try:
        from skimage.feature import graycomatrix, graycoprops
        import numpy as np
        glcm = graycomatrix(
            gray_uint8, distances=[1], angles=[0], levels=256,
            symmetric=True, normed=True,
        )
        features = {}
        for prop in ("contrast", "dissimilarity", "homogeneity", "energy", "correlation"):
            features[prop] = float(graycoprops(glcm, prop)[0, 0])
        return features
    except Exception as e:
        logger.debug(f"GLCM computation failed: {e}")
        return {}

def _colour_profile(arr):
    """Analyse colour distribution and map to medical semantics."""
    import numpy as np
    flat = arr.reshape(-1, 3)
    mean_rgb = flat.mean(axis=0)
    std_rgb = flat.std(axis=0)

    profile: Dict[str, Any] = {
        "mean_rgb": [round(v, 2) for v in mean_rgb],
        "std_rgb": [round(v, 2) for v in std_rgb],
        "dominant_channel": ["R", "G", "B"][int(np.argmax(mean_rgb))],
        "interpretations": [],
    }

    r, g, b = mean_rgb
    if r < 80 and g < 80 and b < 80:
        profile["interpretations"].append(_COLOUR_SEMANTICS["dark_brown_black"])
    if r > 150 and g < 100 and b < 100:
        profile["interpretations"].append(_COLOUR_SEMANTICS["red"])
    if b > 120 and r < 100:
        profile["interpretations"].append(_COLOUR_SEMANTICS["blue_grey"])
    if r > 200 and g > 200 and b > 200:
        profile["interpretations"].append(_COLOUR_SEMANTICS["white"])
    if r > 160 and g > 140 and b < 80:
        profile["interpretations"].append(_COLOUR_SEMANTICS["yellow"])

    return profile

def _severity_score(anomaly_score: float, color_dev: float,
                    texture_irreg: float) -> float:
    """Weighted severity: anomaly 40 %, colour deviation 30 %, texture 30 %."""
    score = 0.4 * anomaly_score + 0.3 * color_dev + 0.3 * texture_irreg
    return round(max(0.0, min(100.0, score)), 2)

def _urgency_from_severity(sev: float) -> str:
    if sev >= 75:
        return "CRITICAL"
    if sev >= 50:
        return "HIGH"
    if sev >= 25:
        return "MODERATE"
    return "LOW"

def _match_knowledge_base(class_name: str) -> List[Dict[str, Any]]:
    """Fuzzy-match a class name against the knowledge base."""
    matches: List[Dict[str, Any]] = []
    cn = class_name.lower().replace(" ", "_").replace("-", "_")
    for key, entry in KNOWLEDGE_BASE.items():
        if key in cn or cn in key or cn in entry["name"].lower():
            matches.append(entry)
    return matches

# Public API

def run_meditech_analysis(
    dataset_path: str,
    eda_results: Dict[str, Any],
    max_sample: int = 500,
) -> Dict[str, Any]:
    """Run domain-specific medical-image analysis on top of general EDA results."""
    import numpy as np
    import cv2
    from PIL import Image

    logger.info("Starting MediTech analysis on %s", dataset_path)

    result: Dict[str, Any] = {
        "domain": "meditech",
        "disclaimer": DISCLAIMER,
        "severity_scores": {},
        "overall_severity": 0.0,
        "anomaly_detections": [],
        "tissue_analysis": {},
        "color_profiles": {},
        "texture_analysis": {},
        "cause_analysis": [],
        "effect_analysis": [],
        "impact_assessment": {},
        "future_risks": [],
        "knowledge_base_matches": [],
        "recommendations": [],
        "urgency_level": "LOW",
    }

    try:
        # Discover classes from EDA results or filesystem
        class_dist = eda_results.get("class_distribution", {})
        if not class_dist:
            logger.warning("No class_distribution in EDA results; skipping analysis.")
            return result

        # Reconstruct class -> file-list mapping from disk
        from image_service import _discover_classes  # sibling module
    except ImportError:
        pass

    try:
        class_files = _discover_classes_local(dataset_path)
    except Exception:
        class_files = _build_class_files_fallback(dataset_path, list(class_dist.keys()))

    sampled = _sample_images(dataset_path, class_files, max_sample)

    # Global accumulators for baseline statistics
    global_means: List[float] = []
    global_stds: List[float] = []

    # --- Per-class analysis ---------------------------------------------------
    for cls, files in sampled.items():
        cls_means, cls_stds = [], []
        cls_textures: List[Dict[str, float]] = []
        cls_colours: List[Dict[str, Any]] = []

        for fpath in files:
            arr = _load_image_array(fpath)
            if arr is None:
                continue
            means, stds = _pixel_stats(arr)
            cls_means.append(means)
            cls_stds.append(stds)
            global_means.append(float(means.mean()))
            global_stds.append(float(stds.mean()))

            # Colour profile
            cls_colours.append(_colour_profile(arr))

            # Texture via GLCM on grayscale
            try:
                gray = cv2.cvtColor(arr.astype(np.uint8), cv2.COLOR_RGB2GRAY)
                tex = _glcm_features(gray)
                if tex:
                    cls_textures.append(tex)
            except Exception:
                pass

        if not cls_means:
            continue

        cls_means_arr = np.array(cls_means)
        cls_stds_arr = np.array(cls_stds)
        mean_of_means = cls_means_arr.mean(axis=0)
        std_of_means = cls_means_arr.std(axis=0)

        # ---- Anomaly detection (z-score outlier) ---
        anomaly_scores_z: List[float] = []
        for m in cls_means:
            z = float(np.abs((m - mean_of_means) / (std_of_means + 1e-8)).mean())
            anomaly_scores_z.append(z)

        anomaly_threshold = 2.0
        outlier_count = sum(1 for z in anomaly_scores_z if z > anomaly_threshold)
        anomaly_ratio = outlier_count / len(anomaly_scores_z) if anomaly_scores_z else 0
        anomaly_score = min(100.0, anomaly_ratio * 100 * 3)  # scale for severity

        if outlier_count > 0:
            result["anomaly_detections"].append({
                "class": cls,
                "type": "pixel_distribution_outlier",
                "confidence": round(min(1.0, anomaly_ratio * 2), 2),
                "description": (
                    f"{outlier_count}/{len(anomaly_scores_z)} images in '{cls}' show "
                    f"pixel distributions >2σ from class mean."
                ),
            })

        # ---- Colour deviation from neutral baseline ---
        neutral_baseline = np.array([128.0, 128.0, 128.0])
        color_dev = float(np.linalg.norm(mean_of_means - neutral_baseline))
        color_dev_norm = min(100.0, color_dev / 1.8)  # max L2 ~221

        # ---- Texture irregularity ---
        if cls_textures:
            contrasts = [t.get("contrast", 0) for t in cls_textures]
            texture_irreg = min(100.0, float(np.std(contrasts)) * 10)
        else:
            texture_irreg = 0.0

        sev = _severity_score(anomaly_score, color_dev_norm, texture_irreg)
        result["severity_scores"][cls] = sev

        # ---- Tissue analysis ---
        dom_interpretations: List[Dict[str, str]] = []
        for cp in cls_colours:
            dom_interpretations.extend(cp.get("interpretations", []))

        unique_interps = {i["significance"]: i for i in dom_interpretations}
        result["tissue_analysis"][cls] = {
            "mean_pixel_rgb": [round(v, 2) for v in mean_of_means],
            "std_pixel_rgb": [round(v, 2) for v in std_of_means],
            "dominant_interpretations": list(unique_interps.values()),
            "sample_count": len(cls_means),
        }

        # ---- Colour profile aggregate ---
        agg_profile = {
            "mean_rgb": [round(v, 2) for v in mean_of_means],
            "std_rgb": [round(v, 2) for v in std_of_means],
            "dominant_channel": ["R", "G", "B"][int(np.argmax(mean_of_means))],
            "medical_interpretations": list(unique_interps.values()),
        }
        result["color_profiles"][cls] = agg_profile

        # ---- Texture aggregate ---
        if cls_textures:
            agg_tex: Dict[str, float] = {}
            for prop in ("contrast", "dissimilarity", "homogeneity", "energy", "correlation"):
                vals = [t[prop] for t in cls_textures if prop in t]
                if vals:
                    agg_tex[prop] = round(float(np.mean(vals)), 4)
            result["texture_analysis"][cls] = agg_tex

        # ---- Knowledge base matching ---
        kb_matches = _match_knowledge_base(cls)
        for m in kb_matches:
            result["knowledge_base_matches"].append({
                "class": cls,
                **m,
            })

    # --- Aggregate metrics ----------------------------------------------------
    sev_values = list(result["severity_scores"].values())
    overall_sev = round(float(np.mean(sev_values)), 2) if sev_values else 0.0
    result["overall_severity"] = overall_sev
    result["urgency_level"] = _urgency_from_severity(overall_sev)

    # ---- Cause analysis ---
    for det in result["anomaly_detections"]:
        result["cause_analysis"].append({
            "class": det["class"],
            "potential_causes": [
                "Pathological tissue change altering pixel distribution",
                "Presence of lesion or abnormal growth",
                "Imaging artefact or staining variation",
            ],
            "confidence": det["confidence"],
        })

    for match in result["knowledge_base_matches"]:
        result["cause_analysis"].append({
            "class": match["class"],
            "potential_causes": match.get("common_causes", []),
            "confidence": 0.6,
        })

    # ---- Effect analysis ---
    for cls, tissue in result["tissue_analysis"].items():
        interps = tissue.get("dominant_interpretations", [])
        if interps:
            result["effect_analysis"].append({
                "class": cls,
                "observed_effects": [i["significance"] for i in interps],
                "description": (
                    f"Colour analysis of '{cls}' suggests: "
                    + ", ".join(i["significance"] for i in interps) + "."
                ),
            })

    # ---- Impact assessment ---
    result["impact_assessment"] = {
        "overall_severity": overall_sev,
        "urgency": result["urgency_level"],
        "classes_above_50": [c for c, s in result["severity_scores"].items() if s >= 50],
        "classes_above_75": [c for c, s in result["severity_scores"].items() if s >= 75],
        "summary": (
            f"Overall severity {overall_sev}/100 ({result['urgency_level']}). "
            f"{len([s for s in sev_values if s >= 50])} class(es) above moderate threshold."
        ),
    }

    # ---- Future risks ---
    for cls, sev in result["severity_scores"].items():
        if sev >= 50:
            result["future_risks"].append({
                "class": cls,
                "severity": sev,
                "risk": "Progression likely without intervention" if sev >= 75
                        else "Monitor for progression",
                "recommendation": "Urgent specialist referral" if sev >= 75
                                  else "Follow-up imaging recommended",
            })

    # ---- Recommendations ---
    result["recommendations"].append(
        f"⚠️ DISCLAIMER: {DISCLAIMER}"
    )
    if overall_sev >= 75:
        result["recommendations"].append(
            "CRITICAL: High severity detected — immediate specialist review recommended."
        )
    elif overall_sev >= 50:
        result["recommendations"].append(
            "HIGH: Moderate-to-high severity — follow-up clinical assessment advised."
        )
    elif overall_sev >= 25:
        result["recommendations"].append(
            "MODERATE: Some abnormal patterns noted — routine follow-up suggested."
        )
    else:
        result["recommendations"].append(
            "LOW: No significant anomalies detected in sampled images."
        )

    for cls, sev in result["severity_scores"].items():
        if sev >= 50:
            result["recommendations"].append(
                f"Class '{cls}' (severity {sev}) warrants closer examination."
            )

    logger.info("MediTech analysis complete — overall severity %.1f (%s)",
                overall_sev, result["urgency_level"])
    return result

# Filesystem helpers (fallbacks when image_service import unavailable)

def _discover_classes_local(dataset_path: str) -> Dict[str, List[str]]:
    """Lightweight class discovery mirroring image_service logic."""
    from image_service import _discover_classes
    return _discover_classes(dataset_path)

def _build_class_files_fallback(dataset_path: str,
                                class_names: List[str]) -> Dict[str, List[str]]:
    """Fallback: build class->files map assuming class-per-folder layout."""
    result: Dict[str, List[str]] = {}
    for cls in class_names:
        cls_dir = os.path.join(dataset_path, cls)
        if not os.path.isdir(cls_dir):
            # Try common wrappers (train/, test/)
            for sub in ("train", "test", "val", "valid"):
                alt = os.path.join(dataset_path, sub, cls)
                if os.path.isdir(alt):
                    cls_dir = alt
                    break
        if os.path.isdir(cls_dir):
            files = sorted(
                os.path.join(cls_dir, f) for f in os.listdir(cls_dir)
                if os.path.isfile(os.path.join(cls_dir, f))
            )
            if files:
                result[cls] = files
    return result

# Report Generation

def generate_meditech_report(analysis_results: Dict[str, Any]) -> str:
    """Generate a comprehensive plain-text medical analysis report."""
    try:
        lines: List[str] = []
        _hr = "=" * 72
        _g = analysis_results.get  # shorthand

        def _section(num, title):
            lines.append(f"{num}. {title}")
            lines.append("-" * 40)

        lines += [_hr, "  MEDITECH IMAGE ANALYSIS REPORT", _hr, "",
                  f"⚠️  {_g('disclaimer', DISCLAIMER)}", ""]

        _section(1, "EXECUTIVE SUMMARY")
        lines += [f"   Overall severity : {_g('overall_severity', 0)} / 100",
                  f"   Urgency level    : {_g('urgency_level', 'N/A')}", ""]

        _section(2, "SEVERITY SCORES (per class)")
        for cls, sev in sorted(_g("severity_scores", {}).items()):
            bar = "█" * int(sev // 5) + "░" * (20 - int(sev // 5))
            lines.append(f"   {cls:30s}  {sev:6.1f}  [{bar}]")
        lines.append("")

        anomalies = _g("anomaly_detections", [])
        _section(3, f"ANOMALY DETECTIONS ({len(anomalies)} found)")
        for a in anomalies:
            lines.append(f"   [{a.get('class','?')}] {a.get('type','')} "
                         f"(confidence {a.get('confidence',0):.0%})")
            lines.append(f"      {a.get('description', '')}")
        lines.append("")

        _section(4, "TISSUE ANALYSIS")
        for cls, info in _g("tissue_analysis", {}).items():
            lines.append(f"   Class: {cls}  Mean={info.get('mean_pixel_rgb',[])}  "
                         f"Std={info.get('std_pixel_rgb',[])}")
            for interp in info.get("dominant_interpretations", []):
                lines.append(f"      → {interp.get('pigment','')}: {interp.get('significance','')}")
        lines.append("")

        _section(5, "COLOUR PROFILES")
        for cls, cp in _g("color_profiles", {}).items():
            lines.append(f"   {cls}: dominant={cp.get('dominant_channel','')}  "
                         f"mean={cp.get('mean_rgb',[])}  std={cp.get('std_rgb',[])}")
        lines.append("")

        _section(6, "TEXTURE ANALYSIS (GLCM)")
        for cls, tex in _g("texture_analysis", {}).items():
            lines.append(f"   {cls}: {'  '.join(f'{k}={v:.4f}' for k, v in tex.items())}")
        lines.append("")

        causes = _g("cause_analysis", [])
        _section(7, f"CAUSE ANALYSIS ({len(causes)} entries)")
        for c in causes:
            lines.append(f"   [{c.get('class','?')}] {', '.join(c.get('potential_causes',[]))}")
        lines.append("")

        effects = _g("effect_analysis", [])
        _section(8, f"EFFECT ANALYSIS ({len(effects)} entries)")
        for e in effects:
            lines.append(f"   [{e.get('class','?')}] {e.get('description','')}")
        lines.append("")

        impact = _g("impact_assessment", {})
        _section(9, "IMPACT ASSESSMENT")
        lines.append(f"   {impact.get('summary', 'N/A')}")
        above50 = impact.get("classes_above_50", [])
        if above50:
            lines.append(f"   Classes ≥50: {', '.join(above50)}")
        lines.append("")

        risks = _g("future_risks", [])
        _section(10, f"FUTURE RISK ASSESSMENT ({len(risks)} flagged)")
        for r in risks:
            lines.append(f"   [{r.get('class','?')}] sev={r.get('severity',0):.1f} — {r.get('risk','')}")
        lines.append("")

        kb = _g("knowledge_base_matches", [])
        _section(11, f"KNOWLEDGE BASE MATCHES ({len(kb)})")
        for m in kb:
            lines.append(f"   [{m.get('class','?')}] {m.get('name','')} "
                         f"— risk={m.get('risk_level','')} urgency={m.get('urgency','')}")
        lines.append("")

        _section(12, "RECOMMENDATIONS")
        for rec in _g("recommendations", []):
            lines.append(f"   • {rec}")
        lines += ["", _hr, "  END OF REPORT", _hr]

        return "\n".join(lines)

    except Exception as e:
        logger.error("Failed to generate meditech report: %s", e, exc_info=True)
        return f"Report generation failed: {e}\n\n⚠️ {DISCLAIMER}"

# Code Generation

def generate_meditech_code(analysis_results: Dict[str, Any]) -> str:
    """Generate a standalone Python script that reproduces the analysis."""
    try:
        classes = list(analysis_results.get("severity_scores", {}).keys())
        classes_repr = repr(classes)

        code = f'''\
#!/usr/bin/env python3
\"\"\"MediTech Image Analysis — Auto-generated Script
⚠️  {DISCLAIMER}
\"\"\"
import os, sys
import numpy as np
import cv2
from PIL import Image
from skimage.feature import graycomatrix, graycoprops

DATASET_PATH = "."  # ← set to your dataset root
MAX_SAMPLE = 500
TARGET_SIZE = (128, 128)
CLASSES = {classes_repr}
IMAGE_EXTS = {{".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp"}}

def load_image(path, size=TARGET_SIZE):
    return np.array(Image.open(path).convert("RGB").resize(size), dtype=np.float64)

def discover_classes(root):
    classes = {{}}
    for entry in sorted(os.listdir(root)):
        d = os.path.join(root, entry)
        if os.path.isdir(d):
            imgs = sorted(os.path.join(d, f) for f in os.listdir(d)
                          if os.path.splitext(f)[1].lower() in IMAGE_EXTS)
            if imgs:
                classes[entry] = imgs
    if not classes:
        for sub in ("train", "test", "val"):
            sd = os.path.join(root, sub)
            if os.path.isdir(sd):
                classes.update(discover_classes(sd))
    return classes

def glcm_features(gray):
    glcm = graycomatrix(gray, [1], [0], 256, symmetric=True, normed=True)
    return {{prop: float(graycoprops(glcm, prop)[0, 0])
             for prop in ("contrast", "dissimilarity", "homogeneity", "energy", "correlation")}}

def severity_score(anomaly, color_dev, texture_irreg):
    return round(max(0, min(100, 0.4 * anomaly + 0.3 * color_dev + 0.3 * texture_irreg)), 2)

def analyse(dataset_path=DATASET_PATH, max_sample=MAX_SAMPLE):
    classes = discover_classes(dataset_path)
    if not classes:
        print("No image classes found."); return
    print(f"Found {{len(classes)}} classes: {{list(classes.keys())}}")
    results = {{}}
    for cls, files in classes.items():
        rng = np.random.RandomState(42)
        sample = [files[i] for i in rng.choice(len(files), min(max_sample, len(files)), replace=False)]
        means_list, textures = [], []
        for fpath in sample:
            try: arr = load_image(fpath)
            except Exception: continue
            means_list.append(arr.reshape(-1, 3).mean(axis=0))
            try:
                gray = cv2.cvtColor(arr.astype(np.uint8), cv2.COLOR_RGB2GRAY)
                textures.append(glcm_features(gray))
            except Exception: pass
        if not means_list: continue
        means_arr = np.array(means_list)
        mu, sigma = means_arr.mean(axis=0), means_arr.std(axis=0)
        z_scores = [float(np.abs((m - mu) / (sigma + 1e-8)).mean()) for m in means_list]
        outliers = sum(1 for z in z_scores if z > 2.0)
        anomaly = min(100, (outliers / len(z_scores)) * 300) if z_scores else 0
        color_dev = min(100, float(np.linalg.norm(mu - 128)) / 1.8)
        tex_irreg = min(100, float(np.std([t["contrast"] for t in textures])) * 10) if textures else 0
        sev = severity_score(anomaly, color_dev, tex_irreg)
        results[cls] = {{"severity": sev, "anomaly_score": round(anomaly, 2),
            "color_deviation": round(color_dev, 2), "texture_irregularity": round(tex_irreg, 2),
            "outlier_images": outliers, "sample_size": len(means_list),
            "mean_rgb": [round(v, 2) for v in mu]}}
        print(f"  {{cls:30s}}  severity={{sev:.1f}}")
    overall = np.mean([r["severity"] for r in results.values()]) if results else 0
    print(f"\\nOverall severity: {{overall:.1f}} / 100\\n⚠️  {DISCLAIMER}")
    return results

if __name__ == "__main__":
    analyse(sys.argv[1] if len(sys.argv) > 1 else DATASET_PATH)
'''
        return code

    except Exception as e:
        logger.error("Failed to generate meditech code: %s", e, exc_info=True)
        return f"# Code generation failed: {e}\n# {DISCLAIMER}\n"
