"""
Agriculture-specific image analysis service for ML Studio.

Adds domain-specific intelligence (crop disease, pest damage, environmental
stress, health scoring) on top of the general image EDA results produced by
image_service.py.
"""

import os
import logging
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

# ── Knowledge Base ──────────────────────────────────────────────────────────
# Each entry: (name, symptoms, cause, treatment, risk_level, color_shift)

_KB_RAW = {
    "leaf_blight": ("Leaf Blight", "Large brown/tan lesions with yellow halos",
        "Fungal pathogens (Alternaria, Helminthosporium)",
        "Apply fungicides (mancozeb, chlorothalonil); remove debris", "high", "brown"),
    "rust": ("Rust", "Orange-brown pustules on leaf undersides, powdery spores",
        "Puccinia spp.; cool, moist conditions",
        "Resistant cultivars; foliar fungicides (propiconazole)", "high", "orange"),
    "powdery_mildew": ("Powdery Mildew", "White powdery coating on leaves, stunted growth",
        "Erysiphe / Podosphaera fungi; dry weather, moderate temps",
        "Sulfur-based fungicides; improve air circulation", "medium", "white"),
    "downy_mildew": ("Downy Mildew", "Yellow patches on upper leaf, grey-purple fuzz below",
        "Oomycete pathogens; cool, humid conditions",
        "Metalaxyl-based fungicides; avoid overhead irrigation", "high", "yellow"),
    "bacterial_spot": ("Bacterial Spot", "Small dark water-soaked spots, sometimes yellow halos",
        "Xanthomonas spp.; spread by rain splash",
        "Copper-based bactericides; crop rotation", "medium", "dark_spot"),
    "anthracnose": ("Anthracnose", "Dark sunken lesions on leaves, stems, or fruit",
        "Colletotrichum spp.; warm, wet conditions",
        "Fungicides (azoxystrobin); remove infected parts", "high", "dark_spot"),
    "aphids": ("Aphid Infestation", "Curled/distorted leaves, sticky honeydew, sooty mould",
        "Aphid colonies feeding on phloem sap",
        "Neem oil; introduce ladybugs; insecticidal soap", "medium", "yellow"),
    "whitefly": ("Whitefly Infestation", "Yellowing leaves, honeydew, small white insects",
        "Bemisia / Trialeurodes spp.; warm greenhouse conditions",
        "Yellow sticky traps; neem oil; Encarsia parasitoids", "medium", "yellow"),
    "caterpillar_damage": ("Caterpillar Damage", "Irregular holes, skeletonised foliage, frass",
        "Larvae of moths/butterflies (armyworms, loopers)",
        "Bt (Bacillus thuringiensis); hand-picking; pheromone traps", "medium", "brown"),
    "spider_mites": ("Spider Mite Damage", "Fine stippling on leaves, webbing on undersides",
        "Tetranychus spp.; hot, dry conditions",
        "Miticides; predatory mites (Phytoseiulus); increase humidity", "medium", "yellow"),
    "nitrogen_deficiency": ("Nitrogen (N) Deficiency", "Yellowing from older leaves, stunted growth",
        "Insufficient soil nitrogen; leaching",
        "Apply nitrogen fertiliser (urea, ammonium nitrate); compost", "medium", "yellow"),
    "phosphorus_deficiency": ("Phosphorus (P) Deficiency", "Purple/reddish leaves, delayed maturity",
        "Low soil phosphorus; cold soil limiting uptake",
        "Apply phosphorus fertiliser (superphosphate); bone meal", "medium", "purple"),
    "potassium_deficiency": ("Potassium (K) Deficiency", "Brown scorching of leaf edges, weak stems",
        "Insufficient soil potassium; sandy or leached soils",
        "Apply potash fertiliser (muriate of potash); wood ash", "medium", "brown"),
    "drought_stress": ("Drought Stress", "Wilting, leaf curling, premature drop, grey-green colour",
        "Insufficient water supply; high transpiration demand",
        "Irrigate; apply mulch; use drought-tolerant varieties", "high", "grey"),
    "sunscald": ("Sunscald / Heat Stress", "Bleached/white patches on fruit or leaves",
        "Excessive sun exposure; sudden canopy removal",
        "Shade cloth; avoid drastic pruning; adequate watering", "low", "white"),
    "mosaic_virus": ("Mosaic Virus", "Mottled light/dark green pattern, leaf distortion",
        "Viral infection spread by aphids or mechanical contact",
        "Remove infected plants; control aphid vectors; resistant cultivars", "high", "mosaic"),
}

KNOWLEDGE_BASE: Dict[str, Dict[str, Any]] = {
    k: {"name": v[0], "symptoms": v[1], "cause": v[2],
         "treatment": v[3], "risk_level": v[4], "color_shift": v[5]}
    for k, v in _KB_RAW.items()
}


# ── Helpers ─────────────────────────────────────────────────────────────────

def _load_image_cv2(path: str, size: int = 128):
    """Load an image with OpenCV, resize, return BGR array or None."""
    import cv2
    img = cv2.imread(path)
    if img is None:
        return None
    return cv2.resize(img, (size, size))


def _sample_paths(class_images: Dict[str, List[str]], max_sample: int) -> Dict[str, List[str]]:
    """Return at most *max_sample* images per class."""
    import numpy as np
    sampled: Dict[str, List[str]] = {}
    for cls, paths in class_images.items():
        if len(paths) <= max_sample:
            sampled[cls] = list(paths)
        else:
            idx = sorted(np.random.default_rng(42).choice(len(paths), max_sample, replace=False))
            sampled[cls] = [paths[i] for i in idx]
    return sampled


def _analyse_color_profile(images_bgr: list) -> Dict[str, Any]:
    """Per-channel RGB stats and green-dominance ratio."""
    import numpy as np
    if not images_bgr:
        return {"mean_rgb": [0, 0, 0], "std_rgb": [0, 0, 0], "green_dominance": 0.0,
                "yellow_ratio": 0.0, "brown_ratio": 0.0}
    means = np.array([[img[:, :, c].mean() for c in (2, 1, 0)] for img in images_bgr])
    mu = means.mean(axis=0).tolist()
    sd = means.std(axis=0).tolist()
    r, g, b = mu
    total = r + g + b + 1e-9
    return {
        "mean_rgb": [round(v, 2) for v in mu],
        "std_rgb": [round(v, 2) for v in sd],
        "green_dominance": round(g / total, 4),
        "yellow_ratio": round((r + g) / (2 * total), 4),
        "brown_ratio": round(r / (g + b + 1e-9), 4),
    }


def _analyse_texture(images_bgr: list) -> Dict[str, float]:
    """Laplacian variance (texture irregularity) and Canny edge density."""
    import cv2
    import numpy as np
    if not images_bgr:
        return {"laplacian_var": 0.0, "edge_density": 0.0}
    lap_vars, edge_dens = [], []
    for img in images_bgr:
        grey = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        lap_vars.append(cv2.Laplacian(grey, cv2.CV_64F).var())
        edge_dens.append(cv2.Canny(grey, 50, 150).mean() / 255.0)
    return {
        "laplacian_var": round(float(np.mean(lap_vars)), 4),
        "edge_density": round(float(np.mean(edge_dens)), 4),
    }


def _compute_health_score(color_profile: Dict, texture: Dict) -> float:
    """0-100 health score.  Weights: color 40%, texture 30%, uniformity 30%."""
    green_dom = color_profile.get("green_dominance", 0.33)
    color_health = min(green_dom / 0.40, 1.0) * 100

    lap = texture.get("laplacian_var", 0.0)
    if lap < 50:
        texture_health = 60.0
    elif lap < 500:
        texture_health = 100.0
    else:
        texture_health = max(0, 100 - (lap - 500) / 20)

    avg_std = sum(color_profile.get("std_rgb", [0, 0, 0])) / 3.0
    uniformity = max(0, 100 - avg_std * 2)

    return round(max(0.0, min(100.0,
        color_health * 0.4 + texture_health * 0.3 + uniformity * 0.3)), 2)


def _detect_disease_indicators(cls: str, cp: Dict, tx: Dict) -> List[Dict]:
    """Disease indicators from colour shifts and texture anomalies."""
    inds: List[Dict] = []
    brown, yellow = cp.get("brown_ratio", 0.0), cp.get("yellow_ratio", 0.0)
    green_dom, edge_den = cp.get("green_dominance", 0.33), tx.get("edge_density", 0.0)
    if brown > 0.75:
        inds.append({"class": cls, "indicator": "browning",
            "confidence": round(min(brown / 1.2, 1.0), 2),
            "description": "Elevated brown-ratio suggests blight or necrosis"})
    if yellow > 0.40 and green_dom < 0.34:
        inds.append({"class": cls, "indicator": "yellowing",
            "confidence": round(min(yellow / 0.50, 1.0), 2),
            "description": "Yellow shift with low green dominance indicates chlorosis"})
    if edge_den > 0.15:
        inds.append({"class": cls, "indicator": "dark_spots",
            "confidence": round(min(edge_den / 0.25, 1.0), 2),
            "description": "High edge density may indicate lesions or spots"})
    return inds


def _detect_pest_indicators(cls: str, tx: Dict) -> List[Dict]:
    """Pest damage from texture irregularities."""
    inds: List[Dict] = []
    lap, edge_den = tx.get("laplacian_var", 0.0), tx.get("edge_density", 0.0)
    if lap > 800:
        inds.append({"class": cls, "indicator": "texture_irregularity",
            "confidence": round(min(lap / 1500, 1.0), 2),
            "description": "Very high Laplacian variance suggests holes or bite marks"})
    if edge_den > 0.20:
        inds.append({"class": cls, "indicator": "edge_damage_pattern",
            "confidence": round(min(edge_den / 0.30, 1.0), 2),
            "description": "Excessive edge density consistent with chewing damage"})
    return inds


def _detect_environmental_stress(cls: str, cp: Dict, tx: Dict) -> List[Dict]:
    """Drought, nutrient deficiency, and heat stress signals."""
    stressors: List[Dict] = []
    green_dom = cp.get("green_dominance", 0.33)
    mean_rgb = cp.get("mean_rgb", [128, 128, 128])
    lap = tx.get("laplacian_var", 0.0)
    if green_dom < 0.30:
        stressors.append({"class": cls, "indicator": "low_green_dominance",
            "confidence": round(1.0 - green_dom / 0.30, 2),
            "description": "Low green channel suggests nutrient deficiency or drought"})
    if lap < 40:
        stressors.append({"class": cls, "indicator": "low_texture",
            "confidence": round(max(0, 1.0 - lap / 40), 2),
            "description": "Very low texture variance may indicate wilting"})
    brightness = sum(mean_rgb) / 3.0
    if brightness > 200:
        stressors.append({"class": cls, "indicator": "bleaching",
            "confidence": round(min((brightness - 200) / 55, 1.0), 2),
            "description": "High brightness suggests sunscald or bleaching"})
    return stressors


def _match_knowledge_base(indicators: List[Dict]) -> List[Dict]:
    """Match detected indicators against the knowledge base."""
    matches, seen = [], set()
    _MATCH_MAP = {
        "browning": lambda k: KNOWLEDGE_BASE[k]["color_shift"] == "brown",
        "yellowing": lambda k: KNOWLEDGE_BASE[k]["color_shift"] == "yellow",
        "dark_spots": lambda k: KNOWLEDGE_BASE[k]["color_shift"] == "dark_spot",
        "bleaching": lambda k: KNOWLEDGE_BASE[k]["color_shift"] == "white",
        "texture_irregularity": lambda k: k in ("caterpillar_damage", "spider_mites"),
        "edge_damage_pattern": lambda k: k in ("caterpillar_damage", "aphids"),
        "low_green_dominance": lambda k: k in ("nitrogen_deficiency", "drought_stress"),
    }
    for ind in indicators:
        pred = _MATCH_MAP.get(ind.get("indicator", ""))
        if not pred:
            continue
        for kb_key, entry in KNOWLEDGE_BASE.items():
            if kb_key not in seen and pred(kb_key):
                matches.append({"kb_key": kb_key, "matched_indicator": ind["indicator"], **entry})
                seen.add(kb_key)
    return matches


def _build_cause_analysis(disease: List, pest: List, env: List) -> List[Dict]:
    """Determine likely causes from all detected indicators."""
    causes = []
    for label, items, detail in [
        ("disease", disease, "Fungal or bacterial infection detected via colour anomalies"),
        ("pest", pest, "Insect or mite damage detected via texture irregularities"),
        ("environmental", env, "Abiotic stress detected (drought, nutrient, or heat)"),
    ]:
        if items:
            causes.append({"type": label, "detail": detail, "evidence_count": len(items)})
    return causes


def _build_effect_analysis(health_scores: Dict[str, float]) -> List[Dict]:
    """Quantify observed damage severity."""
    effects = []
    for cls, score in health_scores.items():
        sev = "healthy" if score >= 80 else "moderate" if score >= 50 else "severe"
        effects.append({"class": cls, "health_score": score,
                        "severity": sev, "damage_pct": round(100 - score, 2)})
    return effects


def _build_impact_assessment(health_scores: Dict[str, float],
                             disease: List, pest: List) -> Dict[str, Any]:
    """Estimate yield impact and spread risk."""
    avg = sum(health_scores.values()) / max(len(health_scores), 1)
    spread = "low"
    if disease:
        spread = "high" if len(disease) >= 3 else "medium"
    elif pest:
        spread = "medium"
    return {
        "estimated_yield_loss_pct": round(100 - avg, 2),
        "spread_risk": spread,
        "affected_classes": len([s for s in health_scores.values() if s < 80]),
        "total_classes": len(health_scores),
    }


def _build_future_risks(causes: List, impact: Dict) -> List[Dict]:
    """Predict emerging risks based on current patterns."""
    risks, cause_types = [], {c["type"] for c in causes}
    _RISK_MAP = [
        ("disease", "Disease spread to adjacent crops",
         lambda i: "high" if i.get("spread_risk") == "high" else "medium",
         "Apply preventive fungicide to surrounding plots"),
        ("pest", "Pest population growth in warm weather",
         lambda _: "medium", "Introduce biological controls; monitor with traps"),
        ("environmental", "Continued yield decline without intervention",
         lambda _: "high", "Adjust irrigation / fertilisation schedule immediately"),
    ]
    for ctype, risk, likelihood_fn, mitigation in _RISK_MAP:
        if ctype in cause_types:
            risks.append({"risk": risk, "likelihood": likelihood_fn(impact),
                          "mitigation": mitigation})
    if impact.get("estimated_yield_loss_pct", 0) > 30:
        risks.append({"risk": "Significant economic loss if untreated",
                       "likelihood": "high",
                       "mitigation": "Conduct field scouting and consult agronomist"})
    return risks


def _build_recommendations(kb_matches: List, causes: List, impact: Dict) -> List[str]:
    """Generate actionable recommendations."""
    recs = [f"{m['name']}: {m['treatment']}" for m in kb_matches]
    if not kb_matches and causes:
        recs.append("Consult a plant pathologist for precise diagnosis")
    if impact.get("spread_risk") in ("medium", "high"):
        recs.append("Quarantine affected areas to prevent spread")
    if impact.get("estimated_yield_loss_pct", 0) > 20:
        recs.append("Prioritise treatment — estimated yield loss exceeds 20%")
    return recs or ["Crops appear healthy — continue routine monitoring"]


def _discover_classes_simple(dataset_path: str) -> Dict[str, List[str]]:
    """Reuse the robust discovery from image_service."""
    try:
        from services.image_service import _discover_classes
        return _discover_classes(dataset_path)
    except ImportError:
        pass
    # Fallback: multi-level scan
    _EXTS = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif', '.webp', '.gif', '.heic'}
    classes: Dict[str, List[str]] = {}

    def _scan(root):
        try:
            for entry in sorted(os.listdir(root)):
                full = os.path.join(root, entry)
                if not os.path.isdir(full) or entry.startswith('.') or entry == '__MACOSX':
                    continue
                imgs = [os.path.join(full, f) for f in os.listdir(full)
                        if os.path.isfile(os.path.join(full, f))
                        and os.path.splitext(f)[1].lower() in _EXTS]
                if imgs:
                    classes[entry] = sorted(imgs)
        except Exception:
            pass

    _scan(dataset_path)
    if classes:
        return classes
    # Try one level deeper
    try:
        for sub in sorted(os.listdir(dataset_path)):
            sub_path = os.path.join(dataset_path, sub)
            if os.path.isdir(sub_path) and not sub.startswith('.') and sub != '__MACOSX':
                _scan(sub_path)
                if classes:
                    return classes
    except Exception:
        pass
    return classes


# ── Public API ──────────────────────────────────────────────────────────────

def run_agritech_analysis(dataset_path: str,
                          eda_results: Dict[str, Any],
                          max_sample: int = 500) -> Dict[str, Any]:
    """Run agriculture-specific analysis on an image dataset.

    Args:
        dataset_path: Root path of the image dataset.
        eda_results: Output dict from ``image_service.run_image_eda``.
        max_sample: Max images to sample per class.

    Returns:
        Dict with domain-specific agritech analysis results.
    """
    import numpy as np
    _empty = {
        "domain": "agritech", "health_scores": {}, "overall_health_score": 0.0,
        "disease_indicators": [], "pest_indicators": [], "environmental_stress": [],
        "color_profiles": {}, "texture_analysis": {}, "cause_analysis": [],
        "effect_analysis": [], "impact_assessment": {}, "future_risks": [],
        "knowledge_base_matches": [], "recommendations": [], "severity_summary": {},
    }
    try:
        class_images = eda_results.get("class_images", {}) or _discover_classes_simple(dataset_path)
        sampled = _sample_paths(class_images, max_sample)

        health_scores, color_profiles, texture_analysis = {}, {}, {}
        all_disease, all_pest, all_env = [], [], []

        for cls, paths in sampled.items():
            images = [img for p in paths if (img := _load_image_cv2(p)) is not None]
            if not images:
                logger.warning(f"No loadable images for class '{cls}'")
                continue
            cp = _analyse_color_profile(images)
            tx = _analyse_texture(images)
            color_profiles[cls] = cp
            texture_analysis[cls] = tx
            health_scores[cls] = _compute_health_score(cp, tx)
            all_disease.extend(_detect_disease_indicators(cls, cp, tx))
            all_pest.extend(_detect_pest_indicators(cls, tx))
            all_env.extend(_detect_environmental_stress(cls, cp, tx))

        overall = round(sum(health_scores.values()) / max(len(health_scores), 1), 2)
        kb_matches = _match_knowledge_base(all_disease + all_pest + all_env)
        causes = _build_cause_analysis(all_disease, all_pest, all_env)
        impact = _build_impact_assessment(health_scores, all_disease, all_pest)

        return {
            "domain": "agritech",
            "health_scores": health_scores,
            "overall_health_score": overall,
            "disease_indicators": all_disease,
            "pest_indicators": all_pest,
            "environmental_stress": all_env,
            "color_profiles": color_profiles,
            "texture_analysis": texture_analysis,
            "cause_analysis": causes,
            "effect_analysis": _build_effect_analysis(health_scores),
            "impact_assessment": impact,
            "future_risks": _build_future_risks(causes, impact),
            "knowledge_base_matches": kb_matches,
            "recommendations": _build_recommendations(kb_matches, causes, impact),
            "severity_summary": {
                "disease_count": len(all_disease),
                "pest_count": len(all_pest),
                "environmental_count": len(all_env),
                "critical_classes": [c for c, s in health_scores.items() if s < 50],
                "warning_classes": [c for c, s in health_scores.items() if 50 <= s < 80],
                "healthy_classes": [c for c, s in health_scores.items() if s >= 80],
            },
        }
    except Exception as exc:
        logger.exception("Agritech analysis failed")
        return {**_empty, "error": str(exc),
                "recommendations": ["Analysis failed — check logs for details"]}


def generate_agritech_report(analysis_results: Dict[str, Any]) -> str:
    """Generate a comprehensive human-readable AgriTech analysis report."""
    try:
        L: List[str] = []
        L.append("=" * 78)
        L.append("   🌱 AGRITECH IMAGE ANALYSIS — COMPREHENSIVE REPORT")
        L.append("=" * 78)

        overall = analysis_results.get("overall_health_score", 0)
        status = "HEALTHY" if overall >= 80 else "WARNING" if overall >= 50 else "CRITICAL"
        L.append(f"\n📊 Overall Health Score: {overall:.1f}/100  [{status}]")
        L.append(f"   Classes Analyzed:    {len(analysis_results.get('health_scores', {}))}")
        L.append(f"   Analysis Date:       Auto-generated by ML Studio AgriTech Engine")

        # Executive Summary
        L.append("\n" + "─" * 78)
        L.append("  📋 EXECUTIVE SUMMARY")
        L.append("─" * 78)
        sev = analysis_results.get("severity_summary", {})
        disease_n = sev.get("disease_count", 0)
        pest_n = sev.get("pest_count", 0)
        env_n = sev.get("environmental_count", 0)
        L.append(f"  • Total threats detected:  {disease_n + pest_n + env_n}")
        L.append(f"    - Disease indicators:    {disease_n}")
        L.append(f"    - Pest damage signals:   {pest_n}")
        L.append(f"    - Environmental stress:  {env_n}")
        impact = analysis_results.get("impact_assessment", {})
        if impact:
            L.append(f"  • Estimated yield loss:    {impact.get('estimated_yield_loss_pct', 0):.1f}%")
            L.append(f"  • Spread risk:             {impact.get('spread_risk', 'N/A')}")

        # Per-Class Health Scores
        scores = analysis_results.get("health_scores", {})
        if scores:
            L.append("\n" + "─" * 78)
            L.append("  🏥 PER-CLASS HEALTH SCORES")
            L.append("─" * 78)
            for cls, sc in sorted(scores.items(), key=lambda x: x[1]):
                bar = "█" * int(sc / 5) + "░" * (20 - int(sc / 5))
                tag = "✅" if sc >= 70 else "⚠️" if sc >= 40 else "🔴"
                L.append(f"  {tag} {cls:30s}  {sc:6.1f}%  {bar}")

        # Disease Indicators
        for section, label, emoji in [
            ("disease_indicators", "DISEASE INDICATORS", "🦠"),
            ("pest_indicators", "PEST DAMAGE INDICATORS", "🐛"),
            ("environmental_stress", "ENVIRONMENTAL STRESS FACTORS", "🌡️"),
        ]:
            items = analysis_results.get(section, [])
            if items:
                L.append(f"\n" + "─" * 78)
                L.append(f"  {emoji} {label}")
                L.append("─" * 78)
                for d in items:
                    conf_bar = "●" * int(d['confidence'] * 10) + "○" * (10 - int(d['confidence'] * 10))
                    L.append(f"  Class: {d['class']}")
                    L.append(f"    Indicator:   {d['indicator']}")
                    L.append(f"    Confidence:  {d['confidence']:.0%}  [{conf_bar}]")
                    L.append(f"    Detail:      {d['description']}")
                    L.append("")

        # Cause Analysis
        causes = analysis_results.get("cause_analysis", [])
        if causes:
            L.append("─" * 78)
            L.append("  🔍 CAUSE ANALYSIS")
            L.append("─" * 78)
            for c in causes:
                L.append(f"  Type: {c['type']}")
                L.append(f"    Evidence Count:   {c['evidence_count']} indicators")
                L.append(f"    Analysis:         {c['detail']}")
                L.append("")

        # Effect Analysis
        effects = analysis_results.get("effect_analysis", [])
        if effects:
            L.append("─" * 78)
            L.append("  📉 EFFECT ANALYSIS")
            L.append("─" * 78)
            for e in effects:
                L.append(f"  Class: {e['class']}")
                L.append(f"    Severity:   {e['severity']}")
                L.append(f"    Damage:     {e['damage_pct']:.1f}%")
                L.append("")

        # Impact Assessment
        if impact:
            L.append("─" * 78)
            L.append("  💥 IMPACT ASSESSMENT")
            L.append("─" * 78)
            L.append(f"  Estimated Yield Loss:  {impact.get('estimated_yield_loss_pct', 0):.1f}%")
            L.append(f"  Spread Risk:           {impact.get('spread_risk', 'unknown')}")
            L.append(f"  Affected Classes:      {impact.get('affected_classes', 0)} / {impact.get('total_classes', 0)}")

        # Knowledge Base Matches with Prevention
        kb = analysis_results.get("knowledge_base_matches", [])
        if kb:
            L.append("\n" + "─" * 78)
            L.append("  📚 KNOWLEDGE BASE — DETECTION & PREVENTION")
            L.append("─" * 78)
            for m in kb:
                L.append(f"\n  ■ {m['name'].upper()} (Risk: {m['risk_level']})")
                L.append(f"    Symptoms:      {m['symptoms']}")
                L.append(f"    Treatment:     {m['treatment']}")
                L.append(f"    Prevention:    {m.get('prevention', m['treatment'])}")
                L.append(f"    Affected Part: {m.get('affected_part', 'Leaves/Stems')}")
                if m.get('environmental_factors'):
                    L.append(f"    Environment:   {m['environmental_factors']}")

        # Future Risk Predictions
        risks = analysis_results.get("future_risks", [])
        if risks:
            L.append("\n" + "─" * 78)
            L.append("  ⚠️  FUTURE RISK PREDICTIONS")
            L.append("─" * 78)
            for r in risks:
                L.append(f"  Risk:       {r['risk']}")
                L.append(f"  Likelihood: {r['likelihood']}")
                L.append(f"  Mitigation: {r['mitigation']}")
                L.append("")

        # Recommendations
        recs = analysis_results.get("recommendations", [])
        if recs:
            L.append("─" * 78)
            L.append("  ✅ RECOMMENDATIONS & ACTION PLAN")
            L.append("─" * 78)
            for i, r in enumerate(recs, 1):
                L.append(f"  {i}. {r}")

        # Severity Summary
        if sev:
            L.append("\n" + "─" * 78)
            L.append("  📊 SEVERITY SUMMARY")
            L.append("─" * 78)
            L.append(f"  Disease Indicators:      {sev.get('disease_count', 0)}")
            L.append(f"  Pest Indicators:         {sev.get('pest_count', 0)}")
            L.append(f"  Environmental Stressors: {sev.get('environmental_count', 0)}")
            crit = sev.get("critical_classes", [])
            warn = sev.get("warning_classes", [])
            if crit:
                L.append(f"  🔴 Critical Classes:     {', '.join(crit)}")
            if warn:
                L.append(f"  ⚠️  Warning Classes:      {', '.join(warn)}")

        L.append("\n" + "=" * 78)
        L.append("  Report generated by ML Studio — AgriTech Analysis Engine v2.0")
        L.append("=" * 78)
        return "\n".join(L)
    except Exception as exc:
        logger.exception("Report generation failed")
        return f"Report generation failed: {exc}"


def generate_agritech_code(analysis_results: Dict[str, Any]) -> str:
    """Generate a standalone Python script reproducing the agritech analysis."""
    try:
        classes = list(analysis_results.get("health_scores", {}).keys())
        cls_str = ", ".join(f'"{c}"' for c in classes) if classes else '"class_a", "class_b"'
        return f'''\
"""Agritech Image Analysis — Generated Script"""
import os, cv2, numpy as np

DATASET_PATH = "dataset/"
IMAGE_SIZE, MAX_SAMPLE = 128, 500
IMAGE_EXTS = {{".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp"}}

def discover_classes(root):
    classes = {{}}
    for entry in sorted(os.listdir(root)):
        full = os.path.join(root, entry)
        if not os.path.isdir(full) or entry.startswith("."):
            continue
        imgs = [os.path.join(full, f) for f in os.listdir(full)
                if os.path.splitext(f)[1].lower() in IMAGE_EXTS]
        if imgs:
            classes[entry] = sorted(imgs)
    return classes

def load_image(path, size=IMAGE_SIZE):
    img = cv2.imread(path)
    return cv2.resize(img, (size, size)) if img is not None else None

def analyse_color_profile(images):
    means = np.array([[img[:, :, c].mean() for c in (2, 1, 0)] for img in images])
    mu = means.mean(axis=0)
    r, g, b = mu; total = r + g + b + 1e-9
    return {{"mean_rgb": mu.round(2).tolist(), "std_rgb": means.std(axis=0).round(2).tolist(),
             "green_dominance": round(g / total, 4),
             "yellow_ratio": round((r + g) / (2 * total), 4),
             "brown_ratio": round(r / (g + b + 1e-9), 4)}}

def analyse_texture(images):
    laps, edges = [], []
    for img in images:
        grey = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        laps.append(cv2.Laplacian(grey, cv2.CV_64F).var())
        edges.append(cv2.Canny(grey, 50, 150).mean() / 255.0)
    return {{"laplacian_var": round(float(np.mean(laps)), 4),
             "edge_density": round(float(np.mean(edges)), 4)}}

def compute_health_score(cp, tx):
    color_h = min(cp.get("green_dominance", .33) / .40, 1) * 100
    lap = tx.get("laplacian_var", 0)
    tex_h = 60 if lap < 50 else (100 if lap < 500 else max(0, 100 - (lap - 500) / 20))
    uni = max(0, 100 - sum(cp.get("std_rgb", [0, 0, 0])) / 3 * 2)
    return round(max(0, min(100, color_h * .4 + tex_h * .3 + uni * .3)), 2)

def main():
    print("=" * 60 + "\\n  Agritech Image Analysis\\n" + "=" * 60)
    classes = discover_classes(DATASET_PATH)
    if not classes:
        print("No classes found."); return
    results = {{}}
    for cls, paths in classes.items():
        rng = np.random.default_rng(42)
        sample = paths if len(paths) <= MAX_SAMPLE else [
            paths[i] for i in sorted(rng.choice(len(paths), MAX_SAMPLE, replace=False))]
        images = [img for p in sample if (img := load_image(p)) is not None]
        if not images:
            continue
        cp, tx = analyse_color_profile(images), analyse_texture(images)
        score = compute_health_score(cp, tx)
        results[cls] = {{"color": cp, "texture": tx, "health_score": score}}
        tag = "HEALTHY" if score >= 80 else "WARNING" if score >= 50 else "CRITICAL"
        print(f"  {{cls:30s}}  Score: {{score:6.1f}}  [{{tag}}]")
    if results:
        avg = np.mean([r["health_score"] for r in results.values()])
        print(f"\\nOverall Health Score: {{avg:.1f}}/100")
    print("=" * 60)

if __name__ == "__main__":
    main()
'''
    except Exception as exc:
        logger.exception("Code generation failed")
        return f"# Code generation failed: {{exc}}"
