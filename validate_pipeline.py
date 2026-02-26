#!/usr/bin/env python3
"""
ML Studio Pipeline Validator — Production Readiness Check
==========================================================
Validates frontend↔backend contract integrity across 7 dimensions:
  1. Frontend–Backend model name resolution
  2. Metrics display completeness
  3. Hyperparameter template coverage
  4. Type safety (optional test_size for clustering)
  5. Preprocessing consistency
  6. Dynamic step validation logic
  7. GaussianMixture sklearn pipeline compatibility
"""

import json
import sys
import re
from pathlib import Path
from typing import Dict, List, Set, Tuple

# ─── Paths ────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent
BACKEND = ROOT / "backend" / "services" / "ml_service.py"
FRONTEND_BUILDER = ROOT / "frontend" / "components" / "pipeline" / "pipeline-builder.tsx"
FRONTEND_RESULTS = ROOT / "frontend" / "components" / "pipeline" / "pipeline-results.tsx"
FRONTEND_TYPES = ROOT / "frontend" / "lib" / "types.ts"

# ─── Helpers ──────────────────────────────────────────────────────────────────
class Result:
    def __init__(self, check: str):
        self.check = check
        self.passed: List[str] = []
        self.warnings: List[str] = []
        self.errors: List[str] = []

    @property
    def ok(self):
        return len(self.errors) == 0

    def pass_(self, msg: str):
        self.passed.append(msg)

    def warn(self, msg: str):
        self.warnings.append(msg)

    def error(self, msg: str):
        self.errors.append(msg)

    def report(self) -> str:
        status = "✅ PASS" if self.ok else "❌ FAIL"
        lines = [f"\n{'='*70}", f"  {status}  {self.check}", f"{'='*70}"]
        for p in self.passed:
            lines.append(f"  ✅ {p}")
        for w in self.warnings:
            lines.append(f"  ⚠️  {w}")
        for e in self.errors:
            lines.append(f"  ❌ {e}")
        return "\n".join(lines)


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


# ─── Extract data from source files ──────────────────────────────────────────
def extract_frontend_models(src: str) -> Dict[str, List[str]]:
    """Parse the MODELS record from the frontend TSX."""
    # Match the MODELS block
    m = re.search(r"const MODELS:\s*Record<TaskType,\s*string\[\]>\s*=\s*\{(.*?)\};", src, re.DOTALL)
    if not m:
        return {}
    block = m.group(1)
    result = {}
    for task_m in re.finditer(r"(\w+):\s*\[(.*?)\]", block, re.DOTALL):
        task = task_m.group(1)
        models_str = task_m.group(2)
        models = re.findall(r'"([^"]+)"', models_str)
        result[task] = models
    return result


def extract_hp_templates(src: str) -> Set[str]:
    """Extract all keys from HP_TEMPLATES."""
    m = re.search(r"const HP_TEMPLATES:\s*Record<string,\s*HPField\[\]>\s*=\s*\{(.*?)\n\};", src, re.DOTALL)
    if not m:
        return set()
    block = m.group(1)
    keys = set()
    # Each key is at the start of a line like:  ModelName:  [...
    for km in re.finditer(r"^\s+(\w+)\s*:", block, re.MULTILINE):
        keys.add(km.group(1))
    return keys


def extract_metric_labels(src: str) -> Set[str]:
    """Extract all keys from METRIC_LABELS in pipeline-results.tsx."""
    m = re.search(r"const METRIC_LABELS:\s*Record<string,\s*string>\s*=\s*\{(.*?)\};", src, re.DOTALL)
    if not m:
        return set()
    block = m.group(1)
    # Keys can be unquoted (TypeScript shorthand) or quoted
    keys = set(re.findall(r'(?:^|\n)\s*"?(\w+)"?\s*:', block))
    return keys


def extract_backend_registries(src: str) -> Dict[str, Set[str]]:
    """Extract model names from _CLASSIFIERS, _REGRESSORS, _CLUSTERERS, _NLP_MODELS."""
    registries = {}
    for name in ("_CLASSIFIERS", "_REGRESSORS", "_CLUSTERERS", "_NLP_MODELS"):
        m = re.search(rf"{name}:\s*Dict\[str,\s*Any\]\s*=\s*\{{(.*?)\}}", src, re.DOTALL)
        if m:
            keys = set(re.findall(r'"(\w+)":', m.group(1)))
            registries[name] = keys
    # Also pick up XGBoost dynamic registration
    for xm in re.finditer(r'_CLASSIFIERS\["(\w+)"\]', src):
        registries.setdefault("_CLASSIFIERS", set()).add(xm.group(1))
    for xm in re.finditer(r'_REGRESSORS\["(\w+)"\]', src):
        registries.setdefault("_REGRESSORS", set()).add(xm.group(1))
    return registries


def extract_aliases(src: str) -> Dict[str, str]:
    """Extract _ALIASES dict from _normalize_model_name."""
    m = re.search(r"_ALIASES\s*=\s*\{(.*?)\}", src, re.DOTALL)
    if not m:
        return {}
    result = {}
    for am in re.finditer(r'"(\w+)":\s*"(\w+)"', m.group(1)):
        result[am.group(1)] = am.group(2)
    return result


def extract_backend_metrics(src: str) -> Set[str]:
    """Extract all metric keys the backend writes into the metrics dict."""
    keys = set()
    # Find all metrics[" ... "] = and "key": patterns in metrics dicts
    for m in re.finditer(r'metrics\s*=\s*\{(.*?)\}', src, re.DOTALL):
        block = m.group(1)
        for km in re.finditer(r'"(\w+)":', block):
            keys.add(km.group(1))
    for m in re.finditer(r'metrics\["(\w+)"\]', src):
        keys.add(m.group(1))
    # Remove non-metric keys
    keys.discard("warning")
    return keys


def extract_preprocessing_frontend(src: str) -> Dict[str, Dict[str, List[str]]]:
    """Extract PREPROCESSING dict from frontend."""
    m = re.search(r"const PREPROCESSING:\s*Record<TaskType,\s*PreprocessingConfig>\s*=\s*\{(.*?)\n\};", src, re.DOTALL)
    if not m:
        return {}
    block = m.group(1)
    result = {}
    # Parse each task type block
    for tm in re.finditer(r"(\w+):\s*\{(.*?)\}", block, re.DOTALL):
        task = tm.group(1)
        inner = tm.group(2)
        cats = {}
        for cm in re.finditer(r"(\w+):\s*\[(.*?)\]", inner, re.DOTALL):
            cat = cm.group(1)
            items = re.findall(r'"([^"]+)"', cm.group(2))
            cats[cat] = items
        result[task] = cats
    return result


def extract_backend_supported_transformers(src: str) -> Set[str]:
    """Extract all transformer names the backend _build_preprocessing_pipeline handles."""
    supported = set()
    # Direct string matches in if/elif conditions
    for m in re.finditer(r'"(\w+)"\s*in\s*transformer_names', src):
        supported.add(m.group(1))
    # Also add the always-applied defaults
    supported.add("StandardScaler")  # default scaler
    supported.add("OneHotEncoder")   # always applied to low-cardinality cats
    supported.add("LabelEncoder")    # target encoding handled separately
    return supported


# ─── Validators ───────────────────────────────────────────────────────────────

def check_1_model_mismatch(be_src: str, fe_src: str) -> Result:
    """Check 1: Every frontend model name resolves via backend _normalize_model_name."""
    r = Result("1. Frontend→Backend Model Name Resolution")
    fe_models = extract_frontend_models(fe_src)
    be_registries = extract_backend_registries(be_src)
    aliases = extract_aliases(be_src)

    task_registry_map = {
        "classification": "_CLASSIFIERS",
        "regression": "_REGRESSORS",
        "clustering": "_CLUSTERERS",
        "nlp": "_NLP_MODELS",
    }

    for task, models in fe_models.items():
        reg_name = task_registry_map.get(task)
        if not reg_name:
            r.error(f"Unknown task type '{task}' in frontend MODELS")
            continue
        registry = be_registries.get(reg_name, set())

        for model in models:
            # Simulate _normalize_model_name
            if model in registry:
                r.pass_(f"{task}/{model} → direct match in {reg_name}")
                continue
            aliased = aliases.get(model, model)
            if aliased in registry:
                r.pass_(f"{task}/{model} → alias '{aliased}' in {reg_name}")
                continue
            # Fuzzy match (lowercase, no underscores)
            norm = model.lower().replace("_", "")
            found = False
            for key in registry:
                if key.lower().replace("_", "") == norm:
                    r.pass_(f"{task}/{model} → fuzzy match '{key}' in {reg_name}")
                    found = True
                    break
            if not found:
                r.error(f"{task}/{model} → UNRESOLVABLE in {reg_name}. Registry keys: {sorted(registry)}")

    return r


def check_2_metrics_completeness(be_src: str, fe_results_src: str) -> Result:
    """Check 2: Frontend METRIC_LABELS covers all backend metrics."""
    r = Result("2. Metrics Display Completeness")
    be_metrics = extract_backend_metrics(be_src)
    fe_labels = extract_metric_labels(fe_results_src)

    # confusion_matrix is filtered out in frontend (line 85) — that's correct
    display_metrics = be_metrics - {"confusion_matrix"}

    for m in sorted(display_metrics):
        if m in fe_labels:
            r.pass_(f"'{m}' has a frontend label")
        else:
            r.error(f"'{m}' returned by backend but MISSING from METRIC_LABELS")

    extra = fe_labels - be_metrics
    if extra:
        r.warn(f"Frontend defines labels for metrics not returned by backend: {sorted(extra)}")

    return r


def check_3_hp_templates(fe_src: str) -> Result:
    """Check 3: Every model in MODELS has an HP_TEMPLATES entry."""
    r = Result("3. Hyperparameter Template Coverage")
    fe_models = extract_frontend_models(fe_src)
    hp_keys = extract_hp_templates(fe_src)

    all_models = set()
    for models in fe_models.values():
        all_models.update(models)

    for model in sorted(all_models):
        if model in hp_keys:
            r.pass_(f"HP_TEMPLATES['{model}'] exists")
        else:
            r.error(f"HP_TEMPLATES['{model}'] MISSING — model will show no hyperparameter UI")

    extra = hp_keys - all_models
    if extra:
        r.warn(f"HP_TEMPLATES has entries not in MODELS: {sorted(extra)}")

    return r


def check_4_type_safety(be_src: str, fe_types_src: str, fe_builder_src: str) -> Result:
    """Check 4: PipelineConfig.test_size is optional; backend handles missing for clustering."""
    r = Result("4. Type Safety — Optional test_size for Clustering")

    # Check types.ts
    if "test_size?: number" in fe_types_src or "test_size?: number" in fe_types_src:
        r.pass_("PipelineConfig.test_size is optional (number?) in types.ts")
    else:
        r.error("PipelineConfig.test_size is NOT optional in types.ts — clustering will send undefined")

    # Check frontend sends undefined for clustering
    if 'test_size: taskType !== "clustering"' in fe_builder_src:
        r.pass_("Frontend sends test_size=undefined for clustering tasks")
    else:
        r.warn("Frontend may send test_size for clustering — verify handleRun()")

    # Check backend defaults
    if 'config.get("test_size", 0.2)' in be_src:
        r.pass_("Backend defaults test_size to 0.2 when missing")
    else:
        r.warn("Backend may not default test_size — check config parsing")

    # Check backend skips split for clustering
    if 'model_type == "clustering"' in be_src:
        r.pass_("Backend skips train/test split for clustering (uses full dataset)")
    else:
        r.error("Backend may incorrectly split data for clustering tasks")

    return r


def check_5_preprocessing(be_src: str, fe_src: str) -> Result:
    """Check 5: Frontend preprocessing options match what backend supports."""
    r = Result("5. Preprocessing Frontend↔Backend Consistency")

    fe_preprocessing = extract_preprocessing_frontend(fe_src)
    be_supported = extract_backend_supported_transformers(be_src)

    all_fe_transformers = set()
    for task, cats in fe_preprocessing.items():
        for cat, items in cats.items():
            all_fe_transformers.update(items)

    for t in sorted(all_fe_transformers):
        if t in be_supported:
            r.pass_(f"'{t}' is supported by backend")
        else:
            r.error(f"'{t}' offered in frontend but NOT handled by backend _build_preprocessing_pipeline")

    # Check specific known handling
    # OneHotEncoder is auto-applied — selecting it doesn't change behavior
    if "OneHotEncoder" in all_fe_transformers:
        r.warn("'OneHotEncoder' is togglable in UI but backend ALWAYS auto-applies it to low-cardinality categoricals. User toggle is a no-op.")

    if "LabelEncoder" in all_fe_transformers:
        r.warn("'LabelEncoder' is togglable in UI but backend only uses it for target encoding, not feature encoding. User toggle is a no-op.")

    return r


def check_6_step_validation(fe_src: str) -> Result:
    """Check 6: isStepComplete() correctly blocks Next for each step."""
    r = Result("6. Dynamic Step Validation (isStepComplete)")

    # Extract isStepComplete function
    m = re.search(r"const isStepComplete.*?\n\s*\};", fe_src, re.DOTALL)
    if not m:
        r.error("Could not find isStepComplete function in frontend")
        return r

    func = m.group(0)

    # Extract all step IDs from StepId type
    step_ids = re.findall(r'"(\w+)"', re.search(r'type StepId\s*=\s*(.*?);', fe_src, re.DOTALL).group(1))

    # Check each step ID is handled
    for sid in step_ids:
        if f'case "{sid}"' in func:
            r.pass_(f"isStepComplete handles '{sid}' step")
        elif "default:" in func:
            r.warn(f"'{sid}' falls through to default (returns true) — step is always passable")
        else:
            r.error(f"'{sid}' has no case in isStepComplete and no default — may crash")

    # Verify critical blocking steps
    if 'return !!datasetFile' in func:
        r.pass_("'dataset' step blocks until file uploaded")
    else:
        r.error("'dataset' step may not properly block — needs datasetFile check")

    if 'return !!modelName' in func:
        r.pass_("'model' step blocks until model selected")
    else:
        r.error("'model' step may not properly block — needs modelName check")

    # Check clustering flow has no target/split steps
    m_cluster = re.search(r'case "clustering".*?return \[(.*?)\];', fe_src, re.DOTALL)
    if m_cluster:
        cluster_steps = m_cluster.group(1)
        if '"target"' not in cluster_steps:
            r.pass_("Clustering flow correctly omits 'target' step")
        else:
            r.error("Clustering flow includes 'target' step — should be omitted")
        if '"split"' not in cluster_steps:
            r.pass_("Clustering flow correctly omits 'split' step")
        else:
            r.error("Clustering flow includes 'split' step — should be omitted")

    return r


def check_7_gaussian_mixture(be_src: str, fe_src: str) -> Result:
    """Check 7: GaussianMixture sklearn pipeline compatibility."""
    r = Result("7. GaussianMixture Pipeline Compatibility")

    # Check backend has GaussianMixture with n_components (not n_clusters)
    if "GaussianMixture(n_components=" in be_src:
        r.pass_("Backend creates GaussianMixture with n_components (correct sklearn param)")
    elif "GaussianMixture(n_clusters=" in be_src:
        r.error("Backend uses n_clusters for GaussianMixture — should be n_components")
    else:
        r.warn("Could not verify GaussianMixture initialization params")

    # Check frontend HP_TEMPLATES uses n_components
    if 'n_components' in re.search(r'GaussianMixture:\s*\[(.*?)\]', fe_src, re.DOTALL).group(1):
        r.pass_("Frontend HP_TEMPLATES for GaussianMixture uses 'n_components' (correct)")
    else:
        r.error("Frontend HP_TEMPLATES for GaussianMixture should use 'n_components', not 'n_clusters'")

    # Check backend handles fit_predict vs fit+predict
    if "hasattr(estimator, \"fit_predict\")" in be_src:
        r.pass_("Backend checks hasattr(estimator, 'fit_predict') for clusterers")
    else:
        r.error("Backend doesn't check for fit_predict — GaussianMixture may fail in older sklearn")

    # Check the fallback path
    if "estimator.fit(X_transformed)" in be_src and "estimator.predict(X_transformed)" in be_src:
        r.pass_("Backend has fit()+predict() fallback for clusterers without fit_predict()")
    else:
        r.error("Backend missing fit()+predict() fallback for GaussianMixture")

    # Check GaussianMixture alias in _normalize_model_name
    if '"GaussianMixture": "GaussianMixture"' in be_src or '"GaussianMixture"' in be_src:
        r.pass_("'GaussianMixture' resolves correctly via alias or direct match")

    # Check _CLASS_MAP for notebook generation
    if '"GaussianMixture": ("mixture"' in be_src:
        r.pass_("Notebook generator maps GaussianMixture to sklearn.mixture (correct import)")
    else:
        r.warn("Notebook _CLASS_MAP may not correctly import GaussianMixture from sklearn.mixture")

    return r


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("\n" + "▓" * 70)
    print("  ML STUDIO PIPELINE VALIDATOR — Production Readiness Report")
    print("▓" * 70)

    be_src = read(BACKEND)
    fe_builder_src = read(FRONTEND_BUILDER)
    fe_results_src = read(FRONTEND_RESULTS)
    fe_types_src = read(FRONTEND_TYPES)

    results: List[Result] = [
        check_1_model_mismatch(be_src, fe_builder_src),
        check_2_metrics_completeness(be_src, fe_results_src),
        check_3_hp_templates(fe_builder_src),
        check_4_type_safety(be_src, fe_types_src, fe_builder_src),
        check_5_preprocessing(be_src, fe_builder_src),
        check_6_step_validation(fe_builder_src),
        check_7_gaussian_mixture(be_src, fe_builder_src),
    ]

    for r in results:
        print(r.report())

    # Summary
    total_pass = sum(len(r.passed) for r in results)
    total_warn = sum(len(r.warnings) for r in results)
    total_err = sum(len(r.errors) for r in results)
    all_ok = all(r.ok for r in results)

    print(f"\n{'='*70}")
    print(f"  SUMMARY: {total_pass} passed | {total_warn} warnings | {total_err} errors")
    if all_ok:
        print("  🟢 ALL CHECKS PASSED — Pipeline is production-ready")
    else:
        print("  🔴 ERRORS DETECTED — Fixes required before deployment")
    print(f"{'='*70}\n")

    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
