"""
Comprehensive tests for the clustering pipeline fixes in ml_service.py.

Verifies:
1. OrdinalEncoder for clustering (no OHE)
2. ID-like column auto-drop
3. Silhouette no longer 1.0
4. Cluster size distribution metrics
5. Inertia (KMeans only)
6. Warnings for suspicious silhouette
7. Feature count logging in metrics
8. All clustering models still work
9. Regression/Classification not affected
10. End-to-end pipeline run
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import tempfile
import traceback
from typing import Any, Dict

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.datasets import make_blobs
from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder

# Ensure the project root is on sys.path
sys.path.insert(0, os.path.dirname(__file__))

from backend.services.ml_service import (
    _build_preprocessing_pipeline,
    build_and_run_pipeline,
)


# ── Helpers ──────────────────────────────────────────────────────────────────

_PASS = 0
_FAIL = 0
_ERRORS: list[str] = []


def _report(name: str, passed: bool, detail: str = ""):
    global _PASS, _FAIL
    tag = "✅ PASS" if passed else "❌ FAIL"
    print(f"  {tag}  {name}")
    if detail:
        print(f"         ↳ {detail}")
    if passed:
        _PASS += 1
    else:
        _FAIL += 1
        _ERRORS.append(f"{name}: {detail}")


def _run_async(coro):
    """Run an async coroutine synchronously."""
    return asyncio.get_event_loop().run_until_complete(coro)


def _make_mixed_df(n: int = 200, n_cat_cols: int = 1, cat_cardinality: int = 5,
                   n_num_cols: int = 3, add_id: bool = False) -> pd.DataFrame:
    """Generate a DataFrame with numeric + low-cardinality categorical cols."""
    rng = np.random.RandomState(42)
    data: Dict[str, Any] = {}
    for i in range(n_num_cols):
        data[f"num_{i}"] = rng.randn(n)
    for i in range(n_cat_cols):
        data[f"cat_{i}"] = rng.choice([f"val_{j}" for j in range(cat_cardinality)], size=n)
    if add_id:
        # 95% unique → qualifies as ID-like (>= 90% unique)
        unique_vals = [f"id_{j}" for j in range(int(n * 0.95))]
        repeated = rng.choice(unique_vals[:max(1, len(unique_vals) // 2)], size=n - len(unique_vals))
        id_col = list(unique_vals) + list(repeated)
        rng.shuffle(id_col)
        data["id_col"] = id_col[:n]
    return pd.DataFrame(data)


# ── Test 1: OrdinalEncoder for clustering ────────────────────────────────────

def test_ordinal_encoder_for_clustering():
    """Clustering must use OrdinalEncoder for ALL categoricals; classification uses OHE."""
    print("\n── Test 1: OrdinalEncoder for clustering ──")
    df = _make_mixed_df(n=100, n_cat_cols=2, cat_cardinality=10, n_num_cols=3)

    # --- Clustering path ---
    pipe_clust, _ = _build_preprocessing_pipeline(df, [], "clustering")
    preprocessor_clust = pipe_clust.named_steps["preprocessor"]
    assert isinstance(preprocessor_clust, ColumnTransformer)

    has_ohe_clust = False
    has_ordinal_clust = False
    for name, transformer, cols in preprocessor_clust.transformers:
        if hasattr(transformer, "named_steps"):
            enc = transformer.named_steps.get("encoder")
            if isinstance(enc, OneHotEncoder):
                has_ohe_clust = True
            if isinstance(enc, OrdinalEncoder):
                has_ordinal_clust = True

    _report("No OHE in clustering pipeline", not has_ohe_clust,
            f"OHE found={has_ohe_clust}")
    _report("OrdinalEncoder used in clustering", has_ordinal_clust,
            f"OrdinalEncoder found={has_ordinal_clust}")

    # Verify feature count doesn't explode
    X_clust = pipe_clust.fit_transform(df)
    n_features_clust = X_clust.shape[1]
    # With ordinal: 3 numeric + 2 categorical = 5 features
    _report("Clustering feature count ≤ input columns", n_features_clust <= df.shape[1],
            f"features_after={n_features_clust}, input_cols={df.shape[1]}")

    # --- Classification path ---
    pipe_class, _ = _build_preprocessing_pipeline(df, [], "classification")
    preprocessor_class = pipe_class.named_steps["preprocessor"]

    has_ohe_class = False
    for name, transformer, cols in preprocessor_class.transformers:
        if hasattr(transformer, "named_steps"):
            enc = transformer.named_steps.get("encoder")
            if isinstance(enc, OneHotEncoder):
                has_ohe_class = True

    _report("OHE IS used in classification pipeline", has_ohe_class,
            f"OHE found={has_ohe_class}")

    # Classification feature count should be larger due to OHE
    X_class = pipe_class.fit_transform(df)
    n_features_class = X_class.shape[1]
    _report("Classification features > clustering features",
            n_features_class > n_features_clust,
            f"class={n_features_class} vs clust={n_features_clust}")


# ── Test 2: ID-like column auto-drop ─────────────────────────────────────────

def test_id_like_column_auto_drop():
    """Columns with ≥90% unique values should be dropped for clustering, kept for classification."""
    print("\n── Test 2: ID-like column auto-drop ──")
    df = _make_mixed_df(n=100, n_cat_cols=1, cat_cardinality=5, n_num_cols=2, add_id=True)

    # Check id_col uniqueness
    id_uniqueness = df["id_col"].nunique() / len(df)
    _report("id_col has ≥90% unique values", id_uniqueness >= 0.9,
            f"uniqueness={id_uniqueness:.2%}")

    # --- Clustering: id_col should be dropped ---
    pipe_clust, _ = _build_preprocessing_pipeline(df, [], "clustering")
    preprocessor_clust = pipe_clust.named_steps["preprocessor"]

    clust_cols_used = set()
    for name, transformer, cols in preprocessor_clust.transformers:
        if isinstance(cols, (list, tuple)):
            clust_cols_used.update(cols)
        elif hasattr(cols, '__iter__'):
            clust_cols_used.update(cols)

    _report("id_col dropped for clustering", "id_col" not in clust_cols_used,
            f"cols_used={sorted(clust_cols_used)}")

    # --- Classification: id_col should be kept ---
    pipe_class, _ = _build_preprocessing_pipeline(df, [], "classification")
    preprocessor_class = pipe_class.named_steps["preprocessor"]

    class_cols_used = set()
    for name, transformer, cols in preprocessor_class.transformers:
        if isinstance(cols, (list, tuple)):
            class_cols_used.update(cols)
        elif hasattr(cols, '__iter__'):
            class_cols_used.update(cols)

    _report("id_col kept for classification", "id_col" in class_cols_used,
            f"cols_used={sorted(class_cols_used)}")


# ── Test 3: Silhouette no longer 1.0 ─────────────────────────────────────────

def test_silhouette_not_perfect():
    """With mixed data, silhouette should be realistic (<1.0)."""
    print("\n── Test 3: Silhouette no longer 1.0 ──")
    rng = np.random.RandomState(42)
    n = 200
    data = {
        "num_0": rng.randn(n),
        "num_1": rng.randn(n) * 2,
        "num_2": rng.randn(n) + 5,
        "cat_0": rng.choice([f"type_{i}" for i in range(10)], size=n),
    }
    df = pd.DataFrame(data)

    with tempfile.TemporaryDirectory() as tmpdir:
        csv_path = os.path.join(tmpdir, "sil_test.csv")
        df.to_csv(csv_path, index=False)

        config = {
            "model_type": "clustering",
            "model_name": "KMeans",
            "target_column": None,
            "hyperparams": {"n_clusters": 3},
        }
        result = _run_async(build_and_run_pipeline(config, tmpdir, "sil_test", csv_path))
        metrics = json.loads(result["metrics"])

    sil = metrics.get("silhouette_score")
    _report("silhouette_score is returned", sil is not None, f"sil={sil}")
    _report("silhouette_score < 1.0", sil is not None and sil < 1.0, f"sil={sil}")
    _report("silhouette_score > -1.0", sil is not None and sil > -1.0, f"sil={sil}")


# ── Test 4: Cluster size distribution ─────────────────────────────────────────

def test_cluster_sizes():
    """cluster_sizes should be a dict mapping label → count, summing to N."""
    print("\n── Test 4: Cluster size distribution ──")
    n = 150
    rng = np.random.RandomState(42)
    df = pd.DataFrame({"a": rng.randn(n), "b": rng.randn(n), "c": rng.randn(n)})

    with tempfile.TemporaryDirectory() as tmpdir:
        csv_path = os.path.join(tmpdir, "cluster_size.csv")
        df.to_csv(csv_path, index=False)

        config = {
            "model_type": "clustering",
            "model_name": "KMeans",
            "hyperparams": {"n_clusters": 3},
        }
        result = _run_async(build_and_run_pipeline(config, tmpdir, "cs_test", csv_path))
        metrics = json.loads(result["metrics"])

    cs = metrics.get("cluster_sizes")
    _report("cluster_sizes is in metrics", cs is not None, f"keys={list(cs.keys()) if cs else None}")
    _report("cluster_sizes is a dict", isinstance(cs, dict), f"type={type(cs).__name__}")
    if cs:
        total = sum(cs.values())
        _report("cluster_sizes sums to total rows", total == n,
                f"sum={total}, expected={n}")
        _report("cluster_sizes has correct number of keys", len(cs) == 3,
                f"keys={len(cs)}")


# ── Test 5: Inertia ──────────────────────────────────────────────────────────

def test_inertia():
    """Inertia should be present for KMeans, absent for DBSCAN."""
    print("\n── Test 5: Inertia ──")
    n = 100
    rng = np.random.RandomState(42)
    df = pd.DataFrame({"a": rng.randn(n), "b": rng.randn(n)})

    with tempfile.TemporaryDirectory() as tmpdir:
        csv_path = os.path.join(tmpdir, "inertia.csv")
        df.to_csv(csv_path, index=False)

        # KMeans → inertia should exist
        config_km = {
            "model_type": "clustering",
            "model_name": "KMeans",
            "hyperparams": {"n_clusters": 3},
        }
        result_km = _run_async(build_and_run_pipeline(config_km, tmpdir, "inertia_km", csv_path))
        metrics_km = json.loads(result_km["metrics"])

        _report("inertia present for KMeans", "inertia" in metrics_km,
                f"inertia={metrics_km.get('inertia')}")
        if "inertia" in metrics_km:
            _report("inertia is a positive number", metrics_km["inertia"] > 0,
                    f"inertia={metrics_km['inertia']}")

        # DBSCAN → inertia should NOT exist
        config_db = {
            "model_type": "clustering",
            "model_name": "DBSCAN",
        }
        result_db = _run_async(build_and_run_pipeline(config_db, tmpdir, "inertia_db", csv_path))
        metrics_db = json.loads(result_db["metrics"])

        _report("inertia NOT present for DBSCAN", "inertia" not in metrics_db,
                f"keys={list(metrics_db.keys())}")


# ── Test 6: Warnings for high silhouette ──────────────────────────────────────

def test_warnings_high_silhouette():
    """Very well-separated blobs should trigger a silhouette > 0.95 warning."""
    print("\n── Test 6: Warnings for high silhouette ──")
    X_blob, _ = make_blobs(n_samples=300, centers=3, cluster_std=0.01,
                           n_features=3, random_state=42)
    df = pd.DataFrame(X_blob, columns=["f0", "f1", "f2"])

    with tempfile.TemporaryDirectory() as tmpdir:
        csv_path = os.path.join(tmpdir, "blobs.csv")
        df.to_csv(csv_path, index=False)

        config = {
            "model_type": "clustering",
            "model_name": "KMeans",
            "hyperparams": {"n_clusters": 3},
        }
        result = _run_async(build_and_run_pipeline(config, tmpdir, "warn_test", csv_path))
        metrics = json.loads(result["metrics"])

    sil = metrics.get("silhouette_score")
    warnings = metrics.get("warnings", [])
    _report("silhouette > 0.95 for trivially separable data", sil is not None and sil > 0.95,
            f"sil={sil}")
    _report("warnings list is non-empty", len(warnings) > 0,
            f"warnings={warnings}")
    has_sil_warning = any("silhouette" in w.lower() or "0.95" in w for w in warnings)
    _report("warning mentions silhouette > 0.95", has_sil_warning,
            f"warnings={warnings}")


# ── Test 7: Feature count logging ─────────────────────────────────────────────

def test_feature_count_in_metrics():
    """n_features_after_preprocessing should be in clustering metrics."""
    print("\n── Test 7: Feature count logging ──")
    rng = np.random.RandomState(42)
    n = 100
    df = pd.DataFrame({
        "x": rng.randn(n),
        "y": rng.randn(n),
        "cat": rng.choice(["a", "b", "c"], size=n),
    })

    with tempfile.TemporaryDirectory() as tmpdir:
        csv_path = os.path.join(tmpdir, "feat_count.csv")
        df.to_csv(csv_path, index=False)

        config = {
            "model_type": "clustering",
            "model_name": "KMeans",
            "hyperparams": {"n_clusters": 2},
            "feature_columns": ["x", "y", "cat"],
        }
        result = _run_async(build_and_run_pipeline(config, tmpdir, "fc_test", csv_path))
        metrics = json.loads(result["metrics"])

    nf = metrics.get("n_features_after_preprocessing")
    _report("n_features_after_preprocessing in metrics", nf is not None, f"value={nf}")
    if nf is not None:
        # 2 numeric + 1 cat (ordinal encoded) = 3
        _report("n_features_after_preprocessing == 3", nf == 3, f"value={nf}")


# ── Test 8: All clustering models still work ──────────────────────────────────

def test_all_clustering_models():
    """KMeans, DBSCAN, AgglomerativeClustering, GaussianMixture should all work."""
    print("\n── Test 8: All clustering models still work ──")
    rng = np.random.RandomState(42)
    n = 120
    df = pd.DataFrame({
        "a": rng.randn(n),
        "b": rng.randn(n) * 2 + 1,
        "cat": rng.choice(["x", "y", "z"], size=n),
    })

    models = ["KMeans", "DBSCAN", "AgglomerativeClustering", "GaussianMixture"]
    for model_name in models:
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                csv_path = os.path.join(tmpdir, f"{model_name}.csv")
                df.to_csv(csv_path, index=False)

                config = {
                    "model_type": "clustering",
                    "model_name": model_name,
                }
                result = _run_async(build_and_run_pipeline(config, tmpdir, f"m8_{model_name}", csv_path))
                metrics = json.loads(result["metrics"])

            _report(f"{model_name} runs successfully", result["status"] == "completed",
                    f"status={result['status']}")
            _report(f"{model_name} returns cluster_sizes",
                    "cluster_sizes" in metrics,
                    f"keys={list(metrics.keys())}")
        except Exception as e:
            _report(f"{model_name} runs successfully", False, f"ERROR: {e}")
            traceback.print_exc()


# ── Test 9: Regression/Classification not affected ────────────────────────────

def test_classification_not_affected():
    """Classification pipeline should still use OHE and produce valid metrics."""
    print("\n── Test 9: Regression/Classification not affected ──")
    rng = np.random.RandomState(42)
    n = 200
    df = pd.DataFrame({
        "num_0": rng.randn(n),
        "num_1": rng.randn(n),
        "cat_0": rng.choice(["a", "b", "c"], size=n),
        "target": rng.choice(["yes", "no"], size=n),
    })

    with tempfile.TemporaryDirectory() as tmpdir:
        csv_path = os.path.join(tmpdir, "class_test.csv")
        df.to_csv(csv_path, index=False)

        config = {
            "model_type": "classification",
            "model_name": "RandomForest",
            "target_column": "target",
            "test_size": 0.2,
        }
        result = _run_async(build_and_run_pipeline(config, tmpdir, "class_ok", csv_path))
        metrics = json.loads(result["metrics"])

    _report("Classification completes", result["status"] == "completed",
            f"status={result['status']}")
    _report("accuracy in metrics", "accuracy" in metrics,
            f"accuracy={metrics.get('accuracy')}")
    _report("f1_weighted in metrics", "f1_weighted" in metrics,
            f"f1={metrics.get('f1_weighted')}")

    # Verify OHE was used by checking the pipeline
    pipe_class, _ = _build_preprocessing_pipeline(
        df.drop(columns=["target"]), [], "classification"
    )
    preprocessor = pipe_class.named_steps["preprocessor"]
    has_ohe = False
    for name, transformer, cols in preprocessor.transformers:
        if hasattr(transformer, "named_steps"):
            enc = transformer.named_steps.get("encoder")
            if isinstance(enc, OneHotEncoder):
                has_ohe = True
    _report("OHE is used in classification preprocessing", has_ohe)

    # Quick regression check
    df_reg = pd.DataFrame({
        "x": rng.randn(n),
        "y": rng.randn(n),
        "target": rng.randn(n) * 10 + 5,
    })
    with tempfile.TemporaryDirectory() as tmpdir:
        csv_path = os.path.join(tmpdir, "reg_test.csv")
        df_reg.to_csv(csv_path, index=False)

        config_reg = {
            "model_type": "regression",
            "model_name": "LinearRegression",
            "target_column": "target",
            "test_size": 0.2,
        }
        result_reg = _run_async(build_and_run_pipeline(config_reg, tmpdir, "reg_ok", csv_path))
        metrics_reg = json.loads(result_reg["metrics"])

    _report("Regression completes", result_reg["status"] == "completed")
    _report("r2 in regression metrics", "r2" in metrics_reg,
            f"r2={metrics_reg.get('r2')}")


# ── Test 10: End-to-end with mixed-type data ─────────────────────────────────

def test_end_to_end():
    """Full pipeline run with CSV containing mixed types: numeric, categorical, ID-like."""
    print("\n── Test 10: End-to-end with mixed-type data ──")
    rng = np.random.RandomState(42)
    n = 250
    df = pd.DataFrame({
        "age": rng.randint(18, 65, size=n).astype(float),
        "income": rng.normal(50000, 15000, size=n),
        "score": rng.uniform(0, 100, size=n),
        "department": rng.choice(["eng", "sales", "hr", "marketing", "ops"], size=n),
        "city": rng.choice(["NYC", "LA", "CHI", "HOU", "PHX", "PHI", "SA", "SD"], size=n),
        # ID-like column (should be auto-dropped)
        "employee_id": [f"EMP-{i:05d}" for i in range(n)],
    })

    csv_path = "/tmp/test_e2e_clustering.csv"
    df.to_csv(csv_path, index=False)

    with tempfile.TemporaryDirectory() as tmpdir:
        config = {
            "model_type": "clustering",
            "model_name": "KMeans",
            "hyperparams": {"n_clusters": 4},
        }
        result = _run_async(build_and_run_pipeline(config, tmpdir, "e2e_clust", csv_path))
        metrics = json.loads(result["metrics"])

        _report("E2E status completed", result["status"] == "completed")

        sil = metrics.get("silhouette_score")
        _report("E2E silhouette_score is reasonable",
                sil is not None and -1.0 < sil < 1.0, f"sil={sil}")

        cs = metrics.get("cluster_sizes")
        _report("E2E cluster_sizes present", cs is not None)
        if cs:
            total = sum(cs.values())
            _report("E2E cluster_sizes sums to N", total == n,
                    f"sum={total}, n={n}")

        nf = metrics.get("n_features_after_preprocessing")
        _report("E2E n_features_after_preprocessing present", nf is not None, f"value={nf}")
        if nf is not None:
            # 3 numeric + 2 categorical (ordinal) = 5 (employee_id dropped)
            _report("E2E feature count = 5 (ID col dropped)", nf == 5,
                    f"value={nf}")

        _report("E2E inertia present (KMeans)", "inertia" in metrics,
                f"inertia={metrics.get('inertia')}")

        _report("E2E model_path exists", os.path.exists(result["model_path"]),
                f"path={result['model_path']}")

    # Cleanup
    if os.path.exists(csv_path):
        os.remove(csv_path)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 70)
    print("  Clustering Pipeline Fix — Comprehensive Test Suite")
    print("=" * 70)

    tests = [
        test_ordinal_encoder_for_clustering,
        test_id_like_column_auto_drop,
        test_silhouette_not_perfect,
        test_cluster_sizes,
        test_inertia,
        test_warnings_high_silhouette,
        test_feature_count_in_metrics,
        test_all_clustering_models,
        test_classification_not_affected,
        test_end_to_end,
    ]

    for test_fn in tests:
        try:
            test_fn()
        except Exception as e:
            print(f"\n  💥 EXCEPTION in {test_fn.__name__}: {e}")
            traceback.print_exc()
            global _FAIL
            _FAIL += 1
            _ERRORS.append(f"{test_fn.__name__}: EXCEPTION {e}")

    print("\n" + "=" * 70)
    print(f"  RESULTS:  {_PASS} passed,  {_FAIL} failed,  {_PASS + _FAIL} total")
    print("=" * 70)
    if _ERRORS:
        print("\n  Failed tests:")
        for err in _ERRORS:
            print(f"    ❌ {err}")
    else:
        print("\n  🎉 All tests passed!")

    return 0 if _FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
