"""
Clustering Pipeline Diagnostic Test
====================================
Reproduces and diagnoses the suspicious silhouette_score == 1.0 bug
in ml_service.py's clustering path.

Root-cause hypothesis:
    OneHotEncoder on categorical columns (especially moderate/high-cardinality
    ones) inflates the feature space.  In that sparse binary space every point
    can end up perfectly separable, so KMeans returns silhouette = 1.0 – a
    metric that is *technically* correct on the transformed data but
    *meaningless* for real-world cluster quality.

This script:
    1. Creates a synthetic dataset with numeric, low-card, and high-card cols.
    2. Runs the same preprocessing + clustering logic used in ml_service.py.
    3. Prints the transformed feature matrix shape and sparsity.
    4. Prints cluster-size distribution.
    5. Checks whether silhouette == 1.0 and explains WHY.
"""

from __future__ import annotations

import sys
import os
import warnings

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    calinski_harabasz_score,
    davies_bouldin_score,
    silhouette_score,
)
from sklearn.pipeline import Pipeline as SkPipeline
from sklearn.preprocessing import (
    OneHotEncoder,
    OrdinalEncoder,
    StandardScaler,
)

warnings.filterwarnings("ignore")

# ---------------------------------------------------------------------------
# Reproduce the EXACT preprocessing from ml_service.py (lines 557-651)
# ---------------------------------------------------------------------------
_HIGH_CARDINALITY_THRESHOLD = 50          # line 79 of ml_service.py


def build_preprocessing_pipeline_original(X: pd.DataFrame):
    """
    Exact copy of _build_preprocessing_pipeline() for clustering
    (no SelectKBest, no PCA unless requested).
    """
    num_cols = X.select_dtypes(include=[np.number]).columns.tolist()
    cat_cols = X.select_dtypes(include=["object", "category"]).columns.tolist()

    low_card_cats = [c for c in cat_cols if X[c].nunique() <= _HIGH_CARDINALITY_THRESHOLD]
    high_card_cats = [c for c in cat_cols if X[c].nunique() > _HIGH_CARDINALITY_THRESHOLD]

    num_pipeline = SkPipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
    ])

    low_card_pipeline = SkPipeline([
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
    ])

    high_card_pipeline = SkPipeline([
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("encoder", OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1)),
    ])

    ct_transformers = []
    if num_cols:
        ct_transformers.append(("num", num_pipeline, num_cols))
    if low_card_cats:
        ct_transformers.append(("cat", low_card_pipeline, low_card_cats))
    if high_card_cats:
        ct_transformers.append(("cat_ord", high_card_pipeline, high_card_cats))

    if ct_transformers:
        preprocessor = ColumnTransformer(transformers=ct_transformers, remainder="drop")
    else:
        preprocessor = ColumnTransformer(
            transformers=[("passthrough", "passthrough", list(X.columns))]
        )

    return SkPipeline([("preprocessor", preprocessor)]), num_cols, cat_cols, low_card_cats, high_card_cats


# ---------------------------------------------------------------------------
# Proposed FIXED preprocessing for clustering
# ---------------------------------------------------------------------------
def build_preprocessing_pipeline_fixed(X: pd.DataFrame):
    """
    Fixed pipeline: OrdinalEncoder for ALL categoricals in clustering,
    and auto-drop columns where nunique == nrows (ID-like).
    """
    num_cols = X.select_dtypes(include=[np.number]).columns.tolist()
    cat_cols = X.select_dtypes(include=["object", "category"]).columns.tolist()

    # --- FIX 1: Drop ID-like columns (nunique == nrows or > 90% unique) ---
    id_like = [c for c in cat_cols if X[c].nunique() >= 0.9 * len(X)]
    kept_cats = [c for c in cat_cols if c not in id_like]

    # --- FIX 2: OrdinalEncoder for ALL categoricals in clustering ---
    cat_pipeline = SkPipeline([
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("encoder", OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1)),
    ])

    num_pipeline = SkPipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
    ])

    ct_transformers = []
    if num_cols:
        ct_transformers.append(("num", num_pipeline, num_cols))
    if kept_cats:
        ct_transformers.append(("cat_ord", cat_pipeline, kept_cats))

    if ct_transformers:
        preprocessor = ColumnTransformer(transformers=ct_transformers, remainder="drop")
    else:
        preprocessor = ColumnTransformer(
            transformers=[("passthrough", "passthrough", list(X.columns))]
        )

    return SkPipeline([("preprocessor", preprocessor)]), num_cols, kept_cats, id_like


# ---------------------------------------------------------------------------
# Synthetic data
# ---------------------------------------------------------------------------
def make_synthetic(n_rows: int = 100, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    df = pd.DataFrame({
        # 2 numeric columns with 3 natural blobs
        "feat_num1": np.concatenate([rng.normal(0, 1, n_rows // 3),
                                     rng.normal(5, 1, n_rows // 3),
                                     rng.normal(10, 1, n_rows - 2 * (n_rows // 3))]),
        "feat_num2": np.concatenate([rng.normal(0, 1, n_rows // 3),
                                     rng.normal(5, 1, n_rows // 3),
                                     rng.normal(10, 1, n_rows - 2 * (n_rows // 3))]),
        # Low-cardinality categorical (3 categories → 3 OHE columns)
        "color": rng.choice(["red", "green", "blue"], n_rows),
        # MODERATE-cardinality categorical (30 unique → 30 OHE columns, under threshold 50)
        "city": [f"city_{i % 30}" for i in range(n_rows)],
        # HIGH-cardinality categorical — ID-like (unique per row)
        "customer_id": [f"CUST_{i:04d}" for i in range(n_rows)],
    })
    return df


def make_synthetic_worst_case(n_rows: int = 45, seed: int = 42) -> pd.DataFrame:
    """
    Worst-case scenario: multiple categorical columns where each has
    unique-per-row values BUT stays UNDER the _HIGH_CARDINALITY_THRESHOLD
    of 50, so they ALL get OneHotEncoded.

    With 45 rows and 45 unique IDs → 45 OHE columns → each row has a unique
    binary pattern → trivially perfect clusters.
    """
    rng = np.random.default_rng(seed)
    df = pd.DataFrame({
        "feat_num1": rng.normal(0, 1, n_rows),
        "feat_num2": rng.normal(0, 1, n_rows),
        # 3 categories → 3 OHE columns
        "color": rng.choice(["red", "green", "blue"], n_rows),
        # 45 unique values < 50 threshold → ALL get OHE → 45 binary columns!
        "customer_id": [f"CUST_{i:04d}" for i in range(n_rows)],
        # Another near-unique col: 40 unique email domains
        "email_domain": [f"user{i}@example.com" for i in range(n_rows)],
    })
    return df


def make_proxy_variable_dataset(n_rows: int = 300, seed: int = 42) -> pd.DataFrame:
    """
    Reproduces EXACT silhouette = 1.0.

    A categorical column that perfectly maps to 3 well-separated numeric
    groups, where within-group variance is zero or near-zero.  OHE on those
    columns creates orthogonal binary features that make clusters trivially
    perfect. This is the proxy-variable / implicit-target pattern.
    """
    rng = np.random.default_rng(seed)
    k = n_rows // 3
    groups = (["Premium"] * k) + (["Standard"] * k) + (["Budget"] * (n_rows - 2 * k))
    ga = np.array(groups)
    df = pd.DataFrame({
        # Numeric features: perfectly separated groups, zero within-group variance
        "revenue": np.where(ga == "Premium", 1000.0,
                   np.where(ga == "Standard", 500.0, 100.0)),
        "orders": np.where(ga == "Premium", 50.0,
                  np.where(ga == "Standard", 25.0, 5.0)),
        # Categorical proxy: 1:1 mapping to the groups
        "segment": groups,
        # Another 1:1 mapping
        "tier": np.where(ga == "Premium", "Gold",
                np.where(ga == "Standard", "Silver", "Bronze")),
    })
    return df


# ---------------------------------------------------------------------------
# Diagnostics
# ---------------------------------------------------------------------------
def run_diagnostic(label: str, X: pd.DataFrame, pipeline, n_clusters: int = 3):
    print(f"\n{'='*72}")
    print(f"  {label}")
    print(f"{'='*72}")

    X_transformed = pipeline.fit_transform(X)
    print(f"\n  Input shape  : {X.shape}  ({X.shape[1]} columns)")
    print(f"  Output shape : {X_transformed.shape}  ({X_transformed.shape[1]} features)")
    print(f"  Sparsity     : {(X_transformed == 0).sum() / X_transformed.size:.2%} zeros")

    # Show feature names if available
    try:
        names = pipeline.named_steps["preprocessor"].get_feature_names_out()
        print(f"  Feature names ({len(names)} total):")
        if len(names) <= 20:
            for n in names:
                print(f"    - {n}")
        else:
            for n in names[:10]:
                print(f"    - {n}")
            print(f"    ... ({len(names) - 20} more) ...")
            for n in names[-10:]:
                print(f"    - {n}")
    except Exception:
        pass

    # KMeans clustering
    km = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    labels = km.fit_predict(X_transformed)

    # Cluster sizes
    unique, counts = np.unique(labels, return_counts=True)
    print(f"\n  Cluster sizes (n_clusters={n_clusters}):")
    for u, c in zip(unique, counts):
        pct = 100 * c / len(labels)
        bar = "█" * int(pct / 2)
        print(f"    Cluster {u}: {c:>4d} samples ({pct:5.1f}%) {bar}")

    # Metrics
    sil = silhouette_score(X_transformed, labels)
    db = davies_bouldin_score(X_transformed, labels)
    ch = calinski_harabasz_score(X_transformed, labels)
    inertia = km.inertia_

    print(f"\n  Metrics:")
    print(f"    Silhouette Score     : {sil:.4f}  {'⚠️  SUSPICIOUS — perfect score!' if sil > 0.95 else '✓'}")
    print(f"    Davies-Bouldin       : {db:.4f}  {'⚠️  SUSPICIOUS — near zero!' if db < 0.05 else '✓'}")
    print(f"    Calinski-Harabasz    : {ch:.2f}  {'⚠️  SUSPICIOUS — extremely high!' if ch > 100000 else '✓'}")
    print(f"    KMeans Inertia       : {inertia:.2f}")

    # --- Root-cause diagnosis ---
    print(f"\n  Diagnosis:")
    if sil > 0.95:
        if X_transformed.shape[1] > 20:
            print(f"    [CRITICAL] Feature explosion: {X.shape[1]} input cols → {X_transformed.shape[1]} features")
            print(f"               OneHotEncoder on categorical columns inflated the feature space.")
            print(f"               In this high-dimensional sparse binary space, points are trivially")
            print(f"               separable — silhouette=1.0 is an ARTIFACT, not real cluster quality.")
        if (X_transformed == 0).sum() / X_transformed.size > 0.5:
            print(f"    [CRITICAL] High sparsity ({(X_transformed == 0).sum() / X_transformed.size:.1%} zeros)")
            print(f"               Sparse OHE features dominate distance calculations, making")
            print(f"               clusters trivially perfect in the transformed space.")
        # Check for degenerate cluster sizes
        max_pct = max(counts) / sum(counts)
        min_pct = min(counts) / sum(counts)
        if max_pct > 0.9:
            print(f"    [WARNING]  Degenerate cluster: one cluster has {max_pct:.0%} of all data.")
        if min_pct < 0.01:
            print(f"    [WARNING]  Degenerate cluster: smallest cluster has < 1% of data.")
    else:
        print(f"    [OK] Silhouette score {sil:.4f} is within normal range.")

    return {
        "silhouette": sil, "davies_bouldin": db, "calinski_harabasz": ch,
        "n_features_in": X.shape[1], "n_features_out": X_transformed.shape[1],
        "inertia": inertia, "cluster_sizes": dict(zip(unique.tolist(), counts.tolist())),
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    print("╔══════════════════════════════════════════════════════════════════════╗")
    print("║       CLUSTERING PIPELINE DIAGNOSTIC — ml_service.py AUDIT         ║")
    print("╚══════════════════════════════════════════════════════════════════════╝")

    df = make_synthetic(n_rows=100)
    print(f"\nSynthetic dataset: {df.shape[0]} rows × {df.shape[1]} columns")
    print(f"Columns: {list(df.columns)}")
    print(f"Unique values per column:")
    for c in df.columns:
        print(f"  {c:20s} → {df[c].nunique():>4d} unique  (dtype={df[c].dtype})")

    # --- TEST 1: Original pipeline, normal data ---
    pipe_orig, num_cols, cat_cols, low_cats, high_cats = build_preprocessing_pipeline_original(df)
    print(f"\n--- Original pipeline column routing (100-row dataset) ---")
    print(f"  Numeric cols      : {num_cols}")
    print(f"  Low-card cats     : {low_cats}   → OneHotEncoder (threshold ≤ {_HIGH_CARDINALITY_THRESHOLD})")
    print(f"  High-card cats    : {high_cats}  → OrdinalEncoder (threshold > {_HIGH_CARDINALITY_THRESHOLD})")

    result_orig = run_diagnostic("TEST 1: ORIGINAL PIPELINE (100 rows, ID > threshold)", df, pipe_orig)

    # --- TEST 2: PROXY VARIABLE SCENARIO — reproduces silhouette = 1.0 ---
    print(f"\n\n{'#'*72}")
    print(f"# PROXY VARIABLE SCENARIO: Categorical perfectly maps to groups")
    print(f"{'#'*72}")
    df_proxy = make_proxy_variable_dataset(n_rows=300)
    print(f"\nProxy-variable dataset: {df_proxy.shape[0]} rows × {df_proxy.shape[1]} columns")
    print(f"Unique values per column:")
    for c in df_proxy.columns:
        under = "✓ UNDER" if df_proxy[c].nunique() <= _HIGH_CARDINALITY_THRESHOLD else "OVER"
        print(f"  {c:20s} → {df_proxy[c].nunique():>4d} unique  ({under} threshold={_HIGH_CARDINALITY_THRESHOLD})")

    pipe_proxy, _, _, low_p, high_p = build_preprocessing_pipeline_original(df_proxy)
    print(f"\n--- Original pipeline column routing (proxy-variable data) ---")
    print(f"  Low-card cats → OHE : {low_p}")
    print(f"  High-card cats      : {high_p}")

    result_proxy = run_diagnostic("TEST 2: PROXY VARIABLE (reproduces silhouette≈1.0)", df_proxy, pipe_proxy)

    # --- TEST 3: WORST CASE — ID-like columns under threshold ---
    print(f"\n\n{'#'*72}")
    print(f"# WORST-CASE SCENARIO: Small dataset where ID columns < threshold")
    print(f"{'#'*72}")
    df_worst = make_synthetic_worst_case(n_rows=45)
    print(f"\nWorst-case dataset: {df_worst.shape[0]} rows × {df_worst.shape[1]} columns")
    print(f"Unique values per column:")
    for c in df_worst.columns:
        under = "✓ UNDER" if df_worst[c].nunique() <= _HIGH_CARDINALITY_THRESHOLD else "OVER"
        print(f"  {c:20s} → {df_worst[c].nunique():>4d} unique  ({under} threshold={_HIGH_CARDINALITY_THRESHOLD})")

    pipe_worst, _, _, low_w, high_w = build_preprocessing_pipeline_original(df_worst)
    result_worst = run_diagnostic("TEST 3: WORST-CASE (ID cols under threshold → OHE)", df_worst, pipe_worst)

    # --- TEST 4: Numeric-only (sanity check) ---
    df_numeric = df[["feat_num1", "feat_num2"]]
    pipe_num, _, _, _, _ = build_preprocessing_pipeline_original(df_numeric)
    result_numeric = run_diagnostic("TEST 4: NUMERIC-ONLY (sanity baseline)", df_numeric, pipe_num)

    # --- TEST 5: Fixed pipeline on proxy-variable data ---
    pipe_fixed_proxy, kept_num_p, kept_cats_p, dropped_ids_p = build_preprocessing_pipeline_fixed(df_proxy)
    print(f"\n--- Fixed pipeline column routing (proxy-variable data) ---")
    print(f"  Numeric cols      : {kept_num_p}")
    print(f"  Kept categoricals : {kept_cats_p}  → OrdinalEncoder (all)")
    print(f"  Dropped (ID-like) : {dropped_ids_p}")

    result_fixed_proxy = run_diagnostic("TEST 5: FIXED PIPELINE on proxy-variable data", df_proxy, pipe_fixed_proxy)

    # --- TEST 6: Fixed pipeline on worst-case data ---
    pipe_fixed, kept_num, kept_cats, dropped_ids = build_preprocessing_pipeline_fixed(df_worst)
    print(f"\n--- Fixed pipeline column routing (worst-case data) ---")
    print(f"  Numeric cols      : {kept_num}")
    print(f"  Kept categoricals : {kept_cats}  → OrdinalEncoder (all)")
    print(f"  Dropped (ID-like) : {dropped_ids}")

    result_fixed = run_diagnostic("TEST 6: FIXED PIPELINE on worst-case data", df_worst, pipe_fixed)

    # --- Summary ---
    print(f"\n{'='*72}")
    print(f"  SUMMARY COMPARISON")
    print(f"{'='*72}")
    print(f"  {'Pipeline':<48s} {'Features':>8s} {'Silhouette':>11s} {'CH Score':>14s}")
    print(f"  {'-'*48} {'-'*8} {'-'*11} {'-'*14}")
    for name, r in [("Original (100-row, mixed cats)", result_orig),
                    ("PROXY VAR Original (silhouette≈1.0!)", result_proxy),
                    ("WORST CASE Original (ID < threshold)", result_worst),
                    ("Numeric-only (baseline)", result_numeric),
                    ("Fixed (proxy-variable data)", result_fixed_proxy),
                    ("Fixed (worst-case data)", result_fixed)]:
        flag = " ⚠️" if r["silhouette"] > 0.95 else ""
        print(f"  {name:<48s} {r['n_features_out']:>8d} {r['silhouette']:>11.4f}{flag} {r['calinski_harabasz']:>14.2f}")

    print(f"\n{'='*72}")
    print(f"  CONCLUSION")
    print(f"{'='*72}")
    if result_proxy["silhouette"] > 0.95:
        print("  ✅ BUG CONFIRMED: Original pipeline produces silhouette ≈ 1.0 when")
        print("     categorical columns act as proxy variables for the groups.")
        print(f"     Proxy-var orig : {result_proxy['n_features_in']} cols → {result_proxy['n_features_out']} features (silhouette={result_proxy['silhouette']:.4f})")
        if result_fixed_proxy["silhouette"] < result_proxy["silhouette"]:
            print(f"     Proxy-var fixed: {result_fixed_proxy['n_features_in']} cols → {result_fixed_proxy['n_features_out']} features (silhouette={result_fixed_proxy['silhouette']:.4f})")
        print("  ")
        print("  Root causes:")
        print("  1. OneHotEncoder creates orthogonal binary features for clustering")
        print("     → artificial distance inflation in the feature space")
        print("  2. No filtering of ID-like or proxy columns before clustering")
        print("  3. No warnings for suspiciously perfect metrics")
        print("  4. No cluster size distribution or inertia in returned metrics")
    else:
        print("  ℹ️  Bug partially reproduced — check detailed test output above.")

    # Return exit code for CI
    return 1 if result_proxy["silhouette"] > 0.95 else 0


if __name__ == "__main__":
    sys.exit(main())
