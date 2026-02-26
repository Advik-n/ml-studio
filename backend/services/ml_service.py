"""
ML Pipeline Service — builds, trains, evaluates sklearn pipelines,
generates a Jupyter notebook, saves the model, and handles predictions.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import joblib
from sklearn.base import clone
import matplotlib
matplotlib.use("Agg")

import matplotlib.pyplot as plt
import nbformat
import numpy as np
import pandas as pd
from nbformat.v4 import new_code_cell, new_markdown_cell, new_notebook
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import (
    GradientBoostingClassifier,
    GradientBoostingRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.linear_model import (
    ElasticNet,
    Lasso,
    LinearRegression,
    LogisticRegression,
    Ridge,
)
from sklearn.metrics import (
    accuracy_score,
    calinski_harabasz_score,
    classification_report,
    davies_bouldin_score,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
    silhouette_score,
)
from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.naive_bayes import GaussianNB
from sklearn.multioutput import MultiOutputClassifier, MultiOutputRegressor
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer, KNNImputer
from sklearn.preprocessing import (
    LabelEncoder,
    MinMaxScaler,
    OneHotEncoder,
    OrdinalEncoder,
    RobustScaler,
    StandardScaler,
)
from sklearn.feature_selection import SelectKBest, VarianceThreshold, f_classif, f_regression
from sklearn.preprocessing import PolynomialFeatures
from sklearn.svm import SVC, SVR
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
from sklearn.cluster import KMeans, DBSCAN, AgglomerativeClustering
from sklearn.mixture import GaussianMixture
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB

# Max unique values before switching from OHE to OrdinalEncoder
_HIGH_CARDINALITY_THRESHOLD = 50

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Model registry
# ---------------------------------------------------------------------------

_CLASSIFIERS: Dict[str, Any] = {
    "LogisticRegression": LogisticRegression(max_iter=1000, random_state=42),
    "RandomForest": RandomForestClassifier(n_estimators=100, random_state=42),
    "GradientBoosting": GradientBoostingClassifier(random_state=42),
    "SVM": SVC(probability=True, random_state=42),
    "KNN": KNeighborsClassifier(),
    "DecisionTree": DecisionTreeClassifier(random_state=42),
    "NaiveBayes": GaussianNB(),
}

_REGRESSORS: Dict[str, Any] = {
    "LinearRegression": LinearRegression(),
    "Ridge": Ridge(),
    "Lasso": Lasso(max_iter=1000),
    "ElasticNet": ElasticNet(max_iter=1000, random_state=42),
    "RandomForestRegressor": RandomForestRegressor(n_estimators=100, random_state=42),
    "GradientBoostingRegressor": GradientBoostingRegressor(random_state=42),
    "SVR": SVR(),
    "DecisionTreeRegressor": DecisionTreeRegressor(random_state=42),
}

_CLUSTERERS: Dict[str, Any] = {
    "KMeans": KMeans(n_clusters=3, random_state=42),
    "DBSCAN": DBSCAN(),
    "AgglomerativeClustering": AgglomerativeClustering(n_clusters=3),
    "GaussianMixture": GaussianMixture(n_components=3, random_state=42),
}

# NLP models — used with TfidfVectorizer preprocessing
_NLP_MODELS: Dict[str, Any] = {
    "TfidfLogistic": LogisticRegression(max_iter=1000, random_state=42),
    "TfidfNaiveBayes": MultinomialNB(),
    "TfidfSVM": SVC(kernel="linear", probability=True, random_state=42),
    "TfidfRandomForest": RandomForestClassifier(n_estimators=100, random_state=42),
}

try:
    from xgboost import XGBClassifier, XGBRegressor
    _CLASSIFIERS["XGBoost"] = XGBClassifier(eval_metric="logloss", random_state=42)
    _REGRESSORS["XGBoostRegressor"] = XGBRegressor(random_state=42)
    logger.info("XGBoost available and registered.")
except ImportError:
    pass


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def build_and_run_pipeline(
    config: Dict[str, Any],
    project_folder: str,
    job_id: str,
    dataset_path: str,
) -> Dict[str, Any]:
    """
    Build an sklearn pipeline, train it, evaluate it, save artifacts,
    and return metrics + paths.

    Parameters
    ----------
    config         : dict matching PipelineConfig schema
    project_folder : base project folder path
    job_id         : unique job identifier
    dataset_path   : path to the uploaded dataset

    Returns
    -------
    dict with keys: model_path, notebook_path, accuracy, metrics
    """
    output_folder = os.path.join(project_folder, f"pipeline_{job_id}")
    os.makedirs(output_folder, exist_ok=True)

    df = _read_dataset(dataset_path)
    model_type: str = config.get("model_type", "classification")
    allowed_model_types = {"classification", "regression", "clustering", "nlp"}
    if model_type not in allowed_model_types:
        raise ValueError(f"Unsupported model_type '{model_type}'. Allowed: {sorted(allowed_model_types)}")
    model_name: str = config.get("model_name", "RandomForest")
    target_raw = config.get("target_column")
    target_cols: List[str] = []
    if isinstance(target_raw, list):
        target_cols = [c for c in target_raw if c]
    elif target_raw:
        target_cols = [target_raw]
    target_col: Optional[str] = target_cols[0] if target_cols else None
    multi_target = len(target_cols) > 1

    feature_cols: Optional[List[str]] = config.get("feature_columns")
    test_size: float = float(config.get("test_size", 0.2))
    transformer_names: List[str] = config.get("transformers", [])
    hyperparams: Dict[str, Any] = config.get("hyperparams") or {}

    if model_type in {"classification", "regression", "nlp"} and not target_cols:
        raise ValueError("target_column is required for supervised model types.")
    if target_cols:
        missing_targets = [c for c in target_cols if c not in df.columns]
        if missing_targets:
            raise ValueError(f"Target column(s) not found in dataset: {missing_targets}")

    # Resolve feature and target columns
    if feature_cols:
        overlap = set(feature_cols) & set(target_cols)
        if overlap:
            raise ValueError(f"Target columns cannot be used as features: {sorted(overlap)}")
        X = df[feature_cols]
    elif target_cols:
        X = df.drop(columns=target_cols)
    else:
        X = df.iloc[:, :-1]
        target_cols = [df.columns[-1]]
        target_col = target_cols[0]

    if target_cols:
        y = df[target_cols] if multi_target else df[target_col]
    else:
        y = None

    # Auto-correct regression with categorical targets to classification
    if model_type == "regression" and y is not None:
        def _is_numeric(series: pd.Series) -> bool:
            return pd.api.types.is_numeric_dtype(series)
        if (multi_target and isinstance(y, pd.DataFrame) and any(not _is_numeric(y[col]) for col in y.columns)) or (
            not multi_target and not _is_numeric(y)
        ):
            logger.info("Detected non-numeric target for regression; switching to classification.")
            model_type = "classification"

    # Build preprocessing pipeline
    if model_type == "nlp":
        # NLP pipeline: identify text column(s), use TF-IDF
        text_col = config.get("text_column")
        if not text_col:
            # Auto-detect: pick the first object column with high avg length
            obj_cols = X.select_dtypes(include=["object", "category"]).columns.tolist()
            if obj_cols:
                avg_lens = {c: X[c].astype(str).str.len().mean() for c in obj_cols}
                text_col = max(avg_lens, key=avg_lens.get)
            else:
                raise ValueError("No text column found for NLP task. Provide a text_column or use object-type features.")
        text_data = X[text_col].astype(str).fillna("")
        # Replace X with the text series for TF-IDF pipeline
        X = text_data
        pipeline = Pipeline([
            ("tfidf", TfidfVectorizer(max_features=5000, stop_words="english", ngram_range=(1, 2))),
        ])
    else:
        pipeline, label_encoder = _build_preprocessing_pipeline(X, transformer_names, model_type)

    # Encode target for classification / nlp if needed
    le: Any = None
    if y is not None and model_type in ("classification", "nlp"):
        if multi_target and isinstance(y, pd.DataFrame):
            encoders: Dict[str, LabelEncoder] = {}
            for col in target_cols:
                series = y[col]
                if series.dtype == object or str(series.dtype) == "category":
                    enc = LabelEncoder()
                    y[col] = enc.fit_transform(series)
                    encoders[col] = enc
            le = encoders or None
        elif hasattr(y, "dtype") and (y.dtype == object or str(y.dtype) == "category"):
            enc = LabelEncoder()
            y = pd.Series(enc.fit_transform(y), name=target_col)
            le = enc

    # Attach the estimator
    estimator = _get_estimator(model_type, model_name, hyperparams)
    if multi_target:
        if model_type == "classification":
            estimator = MultiOutputClassifier(estimator)
        elif model_type == "regression":
            estimator = MultiOutputRegressor(estimator)
    pipeline.steps.append(("model", estimator))

    # Train / evaluate
    metrics: Dict[str, Any] = {}
    accuracy: Optional[float] = None

    if model_type == "clustering" or y is None:
        X_transformed = pipeline[:-1].fit_transform(X)
        # GaussianMixture uses predict() not fit_predict()
        if hasattr(estimator, "fit_predict"):
            labels = estimator.fit_predict(X_transformed)
        else:
            estimator.fit(X_transformed)
            labels = estimator.predict(X_transformed)
        n_labels = len(set(labels))
        if n_labels > 1 and n_labels < len(X_transformed):
            sil = silhouette_score(X_transformed, labels)
            db_score = davies_bouldin_score(X_transformed, labels)
            ch_score = calinski_harabasz_score(X_transformed, labels)
            metrics = {
                "silhouette_score": round(float(sil), 4),
                "davies_bouldin": round(float(db_score), 4),
                "calinski_harabasz": round(float(ch_score), 4),
                "n_clusters": n_labels,
            }
        else:
            metrics = {"silhouette_score": None, "davies_bouldin": None, "calinski_harabasz": None, "n_clusters": n_labels}
        pipeline.fit(X)
    else:
        # Guard: single-class target → return dummy metrics without fitting
        if model_type in ("classification", "nlp") and not multi_target:
            n_classes = pd.Series(y).nunique()
            if n_classes < 2:
                logger.warning("Only %d class found in target — returning constant prediction.", n_classes)
                constant_val = pd.Series(y).iloc[0]
                metrics = {"accuracy": 1.0, "f1_weighted": 1.0, "precision_weighted": 1.0, "recall_weighted": 1.0, "warning": "single_class_target"}
                accuracy = 1.0
                # Still save an unfitted pipeline so artifact exists
                model_path = os.path.join(output_folder, "model.joblib")
                _saved_feature_cols = list(X.columns) if hasattr(X, "columns") else ([X.name] if hasattr(X, "name") else [])
                joblib.dump({"pipeline": pipeline, "label_encoder": le, "target_columns": target_cols, "feature_columns": _saved_feature_cols}, model_path)
                notebook_path = os.path.join(output_folder, "pipeline_report.ipynb")
                _build_pipeline_notebook(dataset_path=dataset_path, output_folder=output_folder, notebook_path=notebook_path, config=config, metrics=metrics, feature_cols=_saved_feature_cols, target_cols=target_cols)
                return {"model_path": model_path, "notebook_path": notebook_path, "accuracy": accuracy, "metrics": json.dumps(metrics), "status": "completed", "model_type": model_type}

        # Stratified split for classification/nlp to preserve class distribution
        stratify_target = None
        if model_type in ("classification", "nlp") and not multi_target:
            # Only stratify if every class has >= 2 samples
            vc = pd.Series(y).value_counts()
            if vc.min() >= 2:
                stratify_target = y

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=42, stratify=stratify_target
        )

        # Class imbalance detection and auto-balancing for classification/nlp
        if model_type in ("classification", "nlp") and not multi_target:
            class_counts = pd.Series(y_train).value_counts()
            imbalance_ratio = class_counts.max() / max(class_counts.min(), 1)
            if imbalance_ratio > 3:
                logger.warning(
                    "Class imbalance detected (ratio %.1f:1). Applying class_weight='balanced' if supported.",
                    imbalance_ratio,
                )
                inner_estimator = estimator.estimators_[0] if hasattr(estimator, 'estimators_') else estimator
                if hasattr(inner_estimator, "class_weight"):
                    try:
                        inner_estimator.set_params(class_weight="balanced")
                    except Exception:
                        pass

        pipeline.fit(X_train, y_train)
        y_pred = pipeline.predict(X_test)

        if model_type in ("classification", "nlp"):
            if multi_target and isinstance(y_test, pd.DataFrame):
                accs = []
                per_target = {}
                for idx, col in enumerate(target_cols):
                    acc = accuracy_score(y_test.iloc[:, idx], y_pred[:, idx])
                    accs.append(acc)
                    per_target[f"accuracy_{col}"] = round(float(acc), 4)
                accuracy = round(float(np.mean(accs)), 4)
                metrics = {"accuracy": accuracy, **per_target}
            else:
                accuracy = round(float(accuracy_score(y_test, y_pred)), 4)
                metrics = {
                    "accuracy": accuracy,
                    "f1_weighted": round(float(f1_score(y_test, y_pred, average="weighted", zero_division=0)), 4),
                    "precision_weighted": round(float(precision_score(y_test, y_pred, average="weighted", zero_division=0)), 4),
                    "recall_weighted": round(float(recall_score(y_test, y_pred, average="weighted", zero_division=0)), 4),
                }
                # ROC-AUC (binary or multiclass OVR)
                if hasattr(pipeline, "predict_proba"):
                    try:
                        proba = pipeline.predict_proba(X_test)
                        n_classes = proba.shape[1] if proba.ndim > 1 else 2
                        if n_classes == 2:
                            auc = roc_auc_score(y_test, proba[:, 1])
                        else:
                            auc = roc_auc_score(y_test, proba, multi_class="ovr", average="weighted")
                        metrics["roc_auc"] = round(float(auc), 4)
                    except Exception:
                        metrics["roc_auc"] = None
                # Confusion matrix as nested list for frontend
                try:
                    from sklearn.metrics import confusion_matrix as cm_fn
                    cm = cm_fn(y_test, y_pred)
                    metrics["confusion_matrix"] = cm.tolist()
                except Exception:
                    pass
        elif model_type == "regression":
            if multi_target and isinstance(y_test, pd.DataFrame):
                rmses = []
                maes = []
                r2s = []
                for idx, col in enumerate(target_cols):
                    rmse = float(np.sqrt(mean_squared_error(y_test.iloc[:, idx], y_pred[:, idx])))
                    mae = float(mean_absolute_error(y_test.iloc[:, idx], y_pred[:, idx]))
                    r2 = float(r2_score(y_test.iloc[:, idx], y_pred[:, idx]))
                    rmses.append(rmse)
                    maes.append(mae)
                    r2s.append(r2)
                accuracy = round(float(np.mean(r2s)), 4)
                metrics = {
                    "r2": round(float(np.mean(r2s)), 4),
                    "rmse": round(float(np.mean(rmses)), 4),
                    "mae": round(float(np.mean(maes)), 4),
                }
            else:
                rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))
                r2 = float(r2_score(y_test, y_pred))
                n = len(y_test)
                p = X_test.shape[1] if hasattr(X_test, "shape") else 1
                adj_r2 = 1 - (1 - r2) * (n - 1) / max(n - p - 1, 1)
                accuracy = round(max(0.0, r2), 4)  # use R² as primary metric
                metrics = {
                    "r2": round(r2, 4),
                    "adjusted_r2": round(adj_r2, 4),
                    "rmse": round(rmse, 4),
                    "mse": round(float(mean_squared_error(y_test, y_pred)), 4),
                    "mae": round(float(mean_absolute_error(y_test, y_pred)), 4),
                }

    # Save model + label encoder
    model_path = os.path.join(output_folder, "model.joblib")
    if os.path.exists(model_path):
        backup_path = os.path.join(
            output_folder,
            f"model.joblib.bak_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
        )
        shutil.copy2(model_path, backup_path)
        logger.info("Existing model backed up to %s", backup_path)
    _saved_feature_cols = list(X.columns) if hasattr(X, "columns") else ([X.name] if hasattr(X, "name") else [])
    joblib.dump(
        {
            "pipeline": pipeline,
            "label_encoder": le,
            "target_columns": target_cols,
            "feature_columns": _saved_feature_cols,
        },
        model_path,
    )
    logger.info("Model saved to %s", model_path)

    # Build notebook
    notebook_path = os.path.join(output_folder, "pipeline_report.ipynb")
    _build_pipeline_notebook(
        dataset_path=dataset_path,
        output_folder=output_folder,
        notebook_path=notebook_path,
        config=config,
        metrics=metrics,
        feature_cols=_saved_feature_cols,
        target_cols=target_cols,
    )
    _execute_notebook(notebook_path)

    return {
        "model_path": model_path,
        "notebook_path": notebook_path,
        "accuracy": accuracy,
        "metrics": json.dumps(metrics),
        "status": "completed",
        "model_type": model_type,
    }


# ---------------------------------------------------------------------------
# Prediction
# ---------------------------------------------------------------------------

def predict(
    model_path: str,
    features_dict: Dict[str, Any],
    model_type: str,
    feature_columns: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Load a saved model and return a prediction for *features_dict*.

    Returns
    -------
    dict with keys: prediction, confidence, probabilities (optional)
    """
    artifact = joblib.load(model_path)
    pipeline = artifact["pipeline"]
    le = artifact.get("label_encoder")
    target_cols: List[str] = artifact.get("target_columns") or []
    feature_columns = feature_columns or artifact.get("feature_columns")

    input_df = pd.DataFrame([features_dict])

    pre = pipeline.named_steps.get("preprocessor")
    num_cols, cat_cols = set(), set()
    if isinstance(pre, ColumnTransformer):
        for name, transformer, cols in pre.transformers:
            cols_list = list(cols) if isinstance(cols, (list, tuple, np.ndarray)) else list(cols) if cols else []
            if transformer is None:
                continue
            if name == "num" or isinstance(transformer, (StandardScaler, MinMaxScaler, RobustScaler)):
                num_cols.update(cols_list)
            elif name in ("cat", "cat_ord") or isinstance(transformer, (OneHotEncoder, OrdinalEncoder)):
                cat_cols.update(cols_list)

    if feature_columns:
        for col in feature_columns:
            if col not in input_df.columns:
                input_df[col] = "" if col in cat_cols else 0
        input_df = input_df[feature_columns]

    for col in num_cols:
        if col in input_df.columns:
            input_df[col] = pd.to_numeric(input_df[col], errors="coerce")
    if num_cols:
        input_df[list(num_cols)] = input_df[list(num_cols)].fillna(0)
    if cat_cols:
        for col in cat_cols:
            if col in input_df.columns:
                input_df[col] = input_df[col].fillna("")

    prediction_raw = pipeline.predict(input_df)
    raw_item = prediction_raw[0] if hasattr(prediction_raw, "__len__") else prediction_raw

    prediction: Any
    if isinstance(le, dict):
        decoded: Dict[str, Any] = {}
        for idx, col in enumerate(target_cols[: len(raw_item) if hasattr(raw_item, "__len__") else 1]):
            val = raw_item[idx] if hasattr(raw_item, "__len__") else raw_item
            enc = le.get(col) if isinstance(le, dict) else None
            decoded[col] = enc.inverse_transform([int(val)])[0] if enc else val
        prediction = decoded
    else:
        prediction = le.inverse_transform([int(raw_item)])[0] if le else raw_item

    confidence: Optional[float] = None
    probabilities: Optional[Dict[str, float]] = None

    if model_type == "classification" and not isinstance(prediction, dict) and hasattr(pipeline, "predict_proba"):
        try:
            proba = pipeline.predict_proba(input_df)[0]
            confidence = round(float(proba.max()), 4)
            classes = le.classes_ if le else list(range(len(proba)))
            probabilities = {str(cls): round(float(p), 4) for cls, p in zip(classes, proba)}
        except Exception:
            pass

    if isinstance(prediction, np.generic):
        prediction = prediction.item()
    elif not isinstance(prediction, (int, float, str, dict, list)):
        prediction = str(prediction)

    return {"prediction": prediction, "confidence": confidence, "probabilities": probabilities}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _read_dataset(path: str) -> pd.DataFrame:
    """Read a dataset from *path* using an appropriate pandas reader."""
    ext = Path(path).suffix.lower()
    readers = {
        ".csv": pd.read_csv,
        ".tsv": lambda p: pd.read_csv(p, sep="\t"),
        ".xls": pd.read_excel,
        ".xlsx": pd.read_excel,
        ".json": pd.read_json,
        ".parquet": pd.read_parquet,
    }
    reader = readers.get(ext, pd.read_csv)
    return reader(path)


def _build_preprocessing_pipeline(
    X: pd.DataFrame,
    transformer_names: List[str],
    model_type: str,
) -> Tuple[Pipeline, None]:
    """
    Construct a ColumnTransformer-based preprocessing step.

    Pipeline order: Imputation → Encoding/Scaling → Feature Engineering.
    """
    num_cols = X.select_dtypes(include=[np.number]).columns.tolist()
    cat_cols = X.select_dtypes(include=["object", "category"]).columns.tolist()

    # --- Numeric imputer ---
    if "KNNImputer" in transformer_names:
        num_imputer = KNNImputer(n_neighbors=5)
    elif "DropMissing" in transformer_names:
        num_imputer = SimpleImputer(strategy="median")  # fallback; drop handled at df level
    elif "MedianImputer" in transformer_names or True:
        num_imputer = SimpleImputer(strategy="median")

    # --- Categorical imputer ---
    cat_imputer = SimpleImputer(strategy="most_frequent")

    # --- Numeric scaler ---
    if "RobustScaler" in transformer_names:
        numeric_scaler = RobustScaler()
    elif "MinMaxScaler" in transformer_names:
        numeric_scaler = MinMaxScaler()
    else:
        numeric_scaler = StandardScaler()

    # --- Numeric sub-pipeline: impute → scale ---
    from sklearn.pipeline import Pipeline as SkPipeline
    num_pipeline = SkPipeline([
        ("imputer", num_imputer),
        ("scaler", numeric_scaler),
    ])

    # --- Split categorical columns by cardinality ---
    low_card_cats = [c for c in cat_cols if X[c].nunique() <= _HIGH_CARDINALITY_THRESHOLD]
    high_card_cats = [c for c in cat_cols if X[c].nunique() > _HIGH_CARDINALITY_THRESHOLD]

    if high_card_cats:
        logger.warning(
            "High-cardinality columns (>%d unique) → OrdinalEncoder: %s",
            _HIGH_CARDINALITY_THRESHOLD, high_card_cats,
        )

    # --- Categorical sub-pipelines: impute → encode ---
    low_card_pipeline = SkPipeline([
        ("imputer", cat_imputer),
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

    steps: List[Tuple[str, Any]] = [("preprocessor", preprocessor)]

    # --- Optional feature-engineering steps ---
    if "VarianceThreshold" in transformer_names:
        steps.append(("variance_threshold", VarianceThreshold()))

    if "PolynomialFeatures" in transformer_names:
        steps.append(("poly", PolynomialFeatures(degree=2, include_bias=False, interaction_only=True)))

    if "SelectKBest" in transformer_names and model_type != "clustering":
        score_fn = f_regression if model_type == "regression" else f_classif
        n_est = max(1, len(num_cols) + len(low_card_cats) * 5 + len(high_card_cats))
        steps.append(("select_k_best", SelectKBest(score_func=score_fn, k=min(10, n_est))))

    if "PCA" in transformer_names:
        from sklearn.decomposition import PCA as SklearnPCA
        # Use variance ratio to auto-select components — safe regardless of feature count
        steps.append(("pca", SklearnPCA(n_components=0.95)))

    pipeline = Pipeline(steps=steps)
    return pipeline, None


def _normalize_model_name(name: str, registry: dict) -> str:
    """Case-insensitive / underscore-insensitive model name lookup with alias support."""
    if name in registry:
        return name

    # Common frontend → backend aliases
    _ALIASES = {
        "RandomForestClassifier": "RandomForest",
        "GradientBoostingClassifier": "GradientBoosting",
        "SVC": "SVM",
        "XGBClassifier": "XGBoost",
        "XGBRegressor": "XGBoostRegressor",
        "GaussianNB": "NaiveBayes",
        "KNeighborsClassifier": "KNN",
        "DecisionTreeClassifier": "DecisionTree",
        "ElasticNet": "ElasticNet",
        "GaussianMixture": "GaussianMixture",
    }
    aliased = _ALIASES.get(name, name)
    if aliased in registry:
        return aliased

    # Normalize: lowercase, remove underscores/spaces/suffixes
    def _norm(s: str) -> str:
        return s.lower().replace("_", "").replace(" ", "")
    normalized = _norm(name)
    for key in registry:
        if _norm(key) == normalized:
            return key
    return name


def _get_estimator(model_type: str, model_name: str, hyperparams: Dict[str, Any]) -> Any:
    """Return an sklearn estimator instance for the given model type and name."""
    registry: Dict[str, Any] = {}
    if model_type == "classification":
        registry = _CLASSIFIERS
    elif model_type == "regression":
        registry = _REGRESSORS
    elif model_type == "clustering":
        registry = _CLUSTERERS
    elif model_type == "nlp":
        registry = _NLP_MODELS

    model_name = _normalize_model_name(model_name, registry)

    if not registry:
        raise ValueError(f"No models registered for model_type '{model_type}'.")

    if model_name not in registry:
        raise ValueError(f"Unknown model '{model_name}' for model_type '{model_type}'. Allowed: {list(registry.keys())}")

    # Clone to avoid mutating the shared global registry instance
    estimator = clone(registry[model_name])

    # Apply user hyperparams (use set_params to avoid creating a new instance)
    if hyperparams:
        try:
            estimator.set_params(**hyperparams)
        except Exception as exc:
            logger.warning("Could not apply hyperparams %s: %s", hyperparams, exc)

    return estimator


# ---------------------------------------------------------------------------
# Notebook generation
# ---------------------------------------------------------------------------

def _build_pipeline_notebook(
    dataset_path: str,
    output_folder: str,
    notebook_path: str,
    config: Dict[str, Any],
    metrics: Dict[str, Any],
    feature_cols: List[str],
    target_cols: List[str],
) -> None:
    """Build and write a pipeline report notebook."""
    cells = []
    model_type = config.get("model_type", "classification")
    model_name = config.get("model_name", "Model")
    test_size = config.get("test_size", 0.2)

    target_label = ", ".join(target_cols) if target_cols else "None"
    cells.append(new_markdown_cell(
        f"# 🤖 ML Pipeline Report\n\n"
        f"**Model:** {model_name}  \n"
        f"**Type:** {model_type}  \n"
        f"**Target:** {target_label}  \n"
        f"**Test size:** {test_size}"
    ))

    cells.append(new_code_cell(
        "import warnings; warnings.filterwarnings('ignore')\n"
        "import matplotlib; matplotlib.use('Agg')\n"
        "import matplotlib.pyplot as plt\n"
        "import seaborn as sns\n"
        "import pandas as pd\n"
        "import numpy as np\n"
        "import joblib\n"
        "from sklearn.model_selection import train_test_split\n"
        "from sklearn.metrics import (\n"
        "    accuracy_score, classification_report, confusion_matrix,\n"
        "    mean_squared_error, r2_score, mean_absolute_error\n"
        ")\n"
        f"df = pd.read_csv(r'{dataset_path}') if r'{dataset_path}'.endswith('.csv') else pd.read_excel(r'{dataset_path}')\n"
        "print('Dataset shape:', df.shape)\n"
        "df.head()"
    ))

    cells.append(new_markdown_cell("## Feature & Target Selection"))
    feature_cols_repr = repr(feature_cols)
    target_cols_repr = repr(target_cols)
    cells.append(new_code_cell(
        f"feature_cols = {feature_cols_repr}\n"
        f"target_cols = {target_cols_repr}\n"
        "X = df[feature_cols] if feature_cols else df.drop(columns=target_cols or [])\n"
        "y = df[target_cols] if target_cols else None\n"
        "print('X shape:', X.shape)\n"
        "if y is not None:\n"
        "    try:\n"
        "        print('y value counts:\\n', y.value_counts().head(10))\n"
        "    except Exception:\n"
        "        print(y.describe())"
    ))

    cells.append(new_markdown_cell("## Preprocessing & Pipeline"))
    cells.append(new_code_cell(
        "from sklearn.compose import ColumnTransformer\n"
        "from sklearn.pipeline import Pipeline\n"
        "from sklearn.preprocessing import StandardScaler, MinMaxScaler, RobustScaler, OneHotEncoder, OrdinalEncoder, LabelEncoder\n"
        "from sklearn.impute import SimpleImputer, KNNImputer\n\n"
        "num_cols = X.select_dtypes(include=np.number).columns.tolist()\n"
        "cat_cols = X.select_dtypes(include=['object','category']).columns.tolist()\n"
        "print('Numeric columns:', num_cols)\n"
        "print('Categorical columns:', cat_cols)\n\n"
        "# Split cat cols by cardinality — OHE for low, Ordinal for high\n"
        "HIGH_CARD_THRESHOLD = 50\n"
        "low_card = [c for c in cat_cols if X[c].nunique() <= HIGH_CARD_THRESHOLD]\n"
        "high_card = [c for c in cat_cols if X[c].nunique() > HIGH_CARD_THRESHOLD]\n"
        "if high_card:\n"
        "    print(f'High-cardinality columns (OrdinalEncoder): {high_card}')\n\n"
        "# Sub-pipelines: impute → transform\n"
        "num_pipeline = Pipeline([('imputer', SimpleImputer(strategy='median')), ('scaler', StandardScaler())])\n"
        "cat_pipeline = Pipeline([('imputer', SimpleImputer(strategy='most_frequent')), ('encoder', OneHotEncoder(handle_unknown='ignore', sparse_output=False))])\n"
        "cat_ord_pipeline = Pipeline([('imputer', SimpleImputer(strategy='most_frequent')), ('encoder', OrdinalEncoder(handle_unknown='use_encoded_value', unknown_value=-1))])\n\n"
        "transformers = []\n"
        "if num_cols:\n"
        "    transformers.append(('num', num_pipeline, num_cols))\n"
        "if low_card:\n"
        "    transformers.append(('cat', cat_pipeline, low_card))\n"
        "if high_card:\n"
        "    transformers.append(('cat_ord', cat_ord_pipeline, high_card))\n"
        "preprocessor = ColumnTransformer(transformers=transformers, remainder='drop') if transformers else 'passthrough'\n"
    ))

    # Map model name to actual sklearn class name and module
    _CLASS_MAP = {
        "LogisticRegression": ("linear_model", "LogisticRegression"),
        "RandomForest": ("ensemble", "RandomForestClassifier"),
        "GradientBoosting": ("ensemble", "GradientBoostingClassifier"),
        "SVM": ("svm", "SVC"),
        "KNN": ("neighbors", "KNeighborsClassifier"),
        "DecisionTree": ("tree", "DecisionTreeClassifier"),
        "NaiveBayes": ("naive_bayes", "GaussianNB"),
        "LinearRegression": ("linear_model", "LinearRegression"),
        "Ridge": ("linear_model", "Ridge"),
        "Lasso": ("linear_model", "Lasso"),
        "ElasticNet": ("linear_model", "ElasticNet"),
        "RandomForestRegressor": ("ensemble", "RandomForestRegressor"),
        "GradientBoostingRegressor": ("ensemble", "GradientBoostingRegressor"),
        "SVR": ("svm", "SVR"),
        "DecisionTreeRegressor": ("tree", "DecisionTreeRegressor"),
        "KMeans": ("cluster", "KMeans"),
        "DBSCAN": ("cluster", "DBSCAN"),
        "AgglomerativeClustering": ("cluster", "AgglomerativeClustering"),
        "GaussianMixture": ("mixture", "GaussianMixture"),
        "XGBoost": ("xgboost", "XGBClassifier"),
        "XGBoostRegressor": ("xgboost", "XGBRegressor"),
        "TfidfLogistic": ("linear_model", "LogisticRegression"),
        "TfidfNaiveBayes": ("naive_bayes", "MultinomialNB"),
        "TfidfSVM": ("svm", "SVC"),
        "TfidfRandomForest": ("ensemble", "RandomForestClassifier"),
    }
    _mod, _cls = _CLASS_MAP.get(model_name, ("ensemble", model_name))

    cells.append(new_markdown_cell("## Model Training"))
    # Use try/except for optional packages like xgboost
    if _mod == "xgboost":
        import_line = f"from xgboost import {_cls}"
    elif _mod == "mixture":
        import_line = f"from sklearn.mixture import {_cls}"
    else:
        import_line = f"from sklearn.{_mod} import {_cls}"
    cells.append(new_code_cell(
        f"{import_line}\n"
        "# Note: model already trained in background — loading saved artifact\n"
        f"artifact = joblib.load(r'{output_folder}/model.joblib')\n"
        "pipeline = artifact['pipeline']\n"
        "print('Pipeline steps:', pipeline.named_steps)"
    ))

    cells.append(new_markdown_cell("## Evaluation Metrics"))
    metrics_repr = json.dumps(metrics, indent=2)
    cells.append(new_code_cell(
        f"metrics = {metrics_repr}\n"
        "import json\n"
        "print('=== Model Metrics ===')\n"
        "for k, v in metrics.items():\n"
        "    print(f'  {k}: {v}')"
    ))

    if model_type in ("classification", "nlp") and target_cols:
        cells.append(new_markdown_cell("## Confusion Matrix"))
        cells.append(new_code_cell(
            "if y is not None:\n"
            "    stratify_y = y.iloc[:,0] if hasattr(y, 'columns') else y\n"
            "    # Only stratify if every class has >= 2 samples\n"
            "    import pandas as _pd\n"
            "    _vc = _pd.Series(stratify_y).value_counts()\n"
            "    _strat = stratify_y if _vc.min() >= 2 else None\n"
            f"    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size={test_size}, random_state=42, stratify=_strat)\n"
            "    target_name = target_cols[0] if isinstance(target_cols, list) else target_cols\n"
            "    y_train_single = y_train[target_name] if hasattr(y_train, 'columns') else y_train\n"
            "    y_test_single = y_test[target_name] if hasattr(y_test, 'columns') else y_test\n"
            "    if getattr(y_train_single, 'dtype', None) == object:\n"
            "        from sklearn.preprocessing import LabelEncoder\n"
            "        le = LabelEncoder()\n"
            "        y_train_enc = le.fit_transform(y_train_single)\n"
            "        y_test_enc = le.transform(y_test_single)\n"
            "    else:\n"
            "        y_train_enc, y_test_enc = y_train_single, y_test_single\n"
            "    y_pred = pipeline.predict(X_test)\n"
            "    if y_pred.ndim > 1:\n"
            "        y_pred = y_pred[:, 0]\n"
            "    cm = confusion_matrix(y_test_enc, y_pred)\n"
            "    fig, ax = plt.subplots(figsize=(6, 5))\n"
            "    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', ax=ax)\n"
            "    ax.set_xlabel('Predicted'); ax.set_ylabel('Actual')\n"
            "    ax.set_title('Confusion Matrix')\n"
            "    plt.tight_layout()\n"
            f"    plt.savefig(r'{output_folder}/confusion_matrix.png', dpi=100, bbox_inches='tight')\n"
            "    plt.show(); plt.close()"
        ))

    if model_type == "regression" and target_cols:
        cells.append(new_markdown_cell("## Actual vs Predicted"))
        cells.append(new_code_cell(
            "if y is not None:\n"
            f"    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size={test_size}, random_state=42)\n"
            "    y_pred = pipeline.predict(X_test)\n"
            "    fig, ax = plt.subplots(figsize=(7, 5))\n"
            "    y_true = y_test.iloc[:, 0] if hasattr(y_test, 'columns') else y_test\n"
            "    y_pred_single = y_pred[:, 0] if y_pred.ndim > 1 else y_pred\n"
            "    ax.scatter(y_true, y_pred_single, alpha=0.4, s=20, c='steelblue')\n"
            "    lims = [min(y_true.min(), y_pred_single.min()), max(y_true.max(), y_pred_single.max())]\n"
            "    ax.plot(lims, lims, 'r--', linewidth=1)\n"
            "    ax.set_xlabel('Actual'); ax.set_ylabel('Predicted')\n"
            "    ax.set_title('Actual vs Predicted')\n"
            "    plt.tight_layout()\n"
            f"    plt.savefig(r'{output_folder}/actual_vs_predicted.png', dpi=100, bbox_inches='tight')\n"
            "    plt.show(); plt.close()"
        ))

    cells.append(new_markdown_cell("## Feature Importance"))
    cells.append(new_code_cell(
        "model_step = pipeline.named_steps.get('model')\n"
        "if hasattr(model_step, 'feature_importances_'):\n"
        "    importances = model_step.feature_importances_\n"
        "    pre = pipeline.named_steps.get('preprocessor')\n"
        "    try:\n"
        "        feat_names = pre.get_feature_names_out()\n"
        "    except Exception:\n"
        "        feat_names = [f'f{i}' for i in range(len(importances))]\n"
        "    fi_df = pd.DataFrame({'feature': feat_names, 'importance': importances})\n"
        "    fi_df = fi_df.sort_values('importance', ascending=False).head(20)\n"
        "    fig, ax = plt.subplots(figsize=(8, max(4, len(fi_df)*0.35)))\n"
        "    ax.barh(fi_df['feature'], fi_df['importance'], color='steelblue')\n"
        "    ax.invert_yaxis(); ax.set_title('Feature Importances')\n"
        "    plt.tight_layout()\n"
        f"    plt.savefig(r'{output_folder}/feature_importance.png', dpi=100, bbox_inches='tight')\n"
        "    plt.show(); plt.close()\n"
        "else:\n"
        "    print('Feature importances not available for this model.')"
    ))

    nb = new_notebook(cells=cells)
    nb.metadata["kernelspec"] = {
        "display_name": "Python 3",
        "language": "python",
        "name": "python3",
    }
    nb.metadata["language_info"] = {"name": "python", "version": "3.10.0"}

    with open(notebook_path, "w", encoding="utf-8") as f:
        nbformat.write(nb, f)
    logger.info("Pipeline notebook written to %s", notebook_path)


def _get_sklearn_module(model_type: str, model_name: str) -> str:
    """Return the sklearn sub-module for an import statement in notebooks."""
    _map = {
        "LogisticRegression": "linear_model",
        "RandomForest": "ensemble",
        "GradientBoosting": "ensemble",
        "SVM": "svm",
        "KNN": "neighbors",
        "DecisionTree": "tree",
        "NaiveBayes": "naive_bayes",
        "LinearRegression": "linear_model",
        "Ridge": "linear_model",
        "Lasso": "linear_model",
        "RandomForestRegressor": "ensemble",
        "GradientBoostingRegressor": "ensemble",
        "SVR": "svm",
        "DecisionTreeRegressor": "tree",
        "KMeans": "cluster",
        "DBSCAN": "cluster",
        "AgglomerativeClustering": "cluster",
        "XGBoost": "xgboost",
        "XGBoostRegressor": "xgboost",
        "TfidfLogistic": "linear_model",
        "TfidfNaiveBayes": "naive_bayes",
        "TfidfSVM": "svm",
        "TfidfRandomForest": "ensemble",
    }
    return _map.get(model_name, "ensemble")


# ---------------------------------------------------------------------------
# Notebook execution
# ---------------------------------------------------------------------------

def _execute_notebook(notebook_path: str) -> None:
    """Execute *notebook_path* in-place using jupyter nbconvert."""
    import sys
    try:
        result = subprocess.run(
            [
                sys.executable, "-m", "jupyter", "nbconvert",
                "--to", "notebook",
                "--execute",
                "--inplace",
                "--ExecutePreprocessor.timeout=600",
                "--ExecutePreprocessor.kernel_name=python3",
                notebook_path,
            ],
            capture_output=True,
            text=True,
            timeout=620,
        )
        if result.returncode != 0:
            logger.warning("nbconvert stderr: %s", result.stderr[-2000:])
        else:
            logger.info("Notebook executed: %s", notebook_path)
    except FileNotFoundError:
        logger.warning("jupyter nbconvert not found — notebook will not be executed")
    except subprocess.TimeoutExpired:
        logger.warning("Notebook execution timed out for %s", notebook_path)
    except Exception as exc:
        logger.error("Notebook execution error: %s", exc)
