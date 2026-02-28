"""
EDA Service — generates a Jupyter notebook, Word document, and cleaned CSV
from an uploaded dataset file.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import matplotlib
matplotlib.use("Agg")  # non-interactive backend — must be set before importing pyplot

import matplotlib.pyplot as plt
import nbformat
import numpy as np
import pandas as pd
import seaborn as sns
from docx import Document
from docx.shared import Inches, Pt
from nbformat.v4 import new_code_cell, new_markdown_cell, new_notebook
from scipy import stats

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def generate_eda(file_path: str, project_folder: str, job_id: str) -> Dict[str, Any]:
    """
    Run a full EDA pipeline for the uploaded file.

    Parameters
    ----------
    file_path      : absolute path to the uploaded dataset
    project_folder : base folder for the project (uploads/{user_id}/{project_id})
    job_id         : unique job identifier (used for output folder name)

    Returns
    -------
    dict with keys: output_folder, notebook_path, docx_path,
                    cleaned_csv_path, zip_path (may be None)
    """
    output_folder = os.path.join(project_folder, f"eda_{job_id}")
    os.makedirs(output_folder, exist_ok=True)

    # Copy raw input into output folder so the notebook can reference it via local relative path
    data_file_name = os.path.basename(file_path)
    dest_file = os.path.join(output_folder, data_file_name)
    if not os.path.exists(dest_file):
        shutil.copy2(file_path, dest_file)

    df = _read_file(file_path)
    stats_dict = _analyze_dataframe(df)
    findings = _generate_findings(df, stats_dict)

    notebook_path = os.path.join(output_folder, "eda_report.ipynb")
    _build_notebook(df, data_file_name, output_folder, notebook_path, stats_dict, findings)
    _execute_notebook(notebook_path)

    docx_path = os.path.join(output_folder, "eda_report.docx")
    _create_word_doc(df, stats_dict, findings, docx_path)

    cleaned_csv_path = os.path.join(output_folder, "cleaned_data.csv")
    cleaned_df = _clean_dataframe(df)
    cleaned_df.to_csv(cleaned_csv_path, index=False)

    # Always bundle key artifacts into a zip for easy download
    zip_path = _zip_artifacts(
        output_folder,
        {
            "eda_report.ipynb": notebook_path,
            "eda_report.docx": docx_path,
            "cleaned_data.csv": cleaned_csv_path,
            os.path.basename(dest_file): dest_file,
        },
    )

    return {
        "output_folder": output_folder,
        "notebook_path": notebook_path,
        "docx_path": docx_path,
        "cleaned_csv_path": cleaned_csv_path,
        "zip_path": zip_path,
        "status": "completed",
    }


# ---------------------------------------------------------------------------
# File reading
# ---------------------------------------------------------------------------

def _detect_file_format(filepath: str):
    """Return the appropriate pandas read function based on file extension."""
    ext = Path(filepath).suffix.lower()
    mapping = {
        ".csv": pd.read_csv,
        ".tsv": lambda p: pd.read_csv(p, sep="\t"),
        ".xls": pd.read_excel,
        ".xlsx": pd.read_excel,
        ".json": pd.read_json,
        ".parquet": pd.read_parquet,
        ".data": pd.read_csv,
    }
    return mapping.get(ext, pd.read_csv)


def _read_file(filepath: str) -> pd.DataFrame:
    """Read a dataset file into a DataFrame, auto-detecting the format."""
    reader = _detect_file_format(filepath)
    df = reader(filepath)
    # Flatten multi-index columns (e.g., from some Excel files)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = ["_".join(str(c) for c in col).strip() for col in df.columns]
    return df


# ---------------------------------------------------------------------------
# Analysis helpers
# ---------------------------------------------------------------------------

def _analyze_dataframe(df: pd.DataFrame) -> Dict[str, Any]:
    """Compute a comprehensive statistics dictionary for *df*."""
    num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    cat_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()

    # Missing values
    null_counts = df.isnull().sum().to_dict()
    null_pct = (df.isnull().mean() * 100).round(2).to_dict()

    # Descriptive stats
    desc = df.describe(include="all").to_dict()

    # Correlation matrix (numeric only)
    corr_matrix: Optional[pd.DataFrame] = None
    top_correlations: List[Tuple[str, str, float]] = []
    if len(num_cols) >= 2:
        corr_matrix = df[num_cols].corr()
        # Top 5 absolute correlations (excluding self-correlations)
        corr_pairs = (
            corr_matrix.abs()
            .unstack()
            .reset_index()
        )
        corr_pairs.columns = ["col1", "col2", "corr"]
        corr_pairs = corr_pairs[corr_pairs["col1"] < corr_pairs["col2"]]
        corr_pairs = corr_pairs.sort_values("corr", ascending=False)
        # Use signed values from original matrix for correct direction
        top_correlations = [
            (row["col1"], row["col2"], round(float(corr_matrix.loc[row["col1"], row["col2"]]), 4))
            for _, row in corr_pairs.head(5).iterrows()
        ]

    # Skewness
    skewness = {col: round(df[col].skew(), 4) for col in num_cols}

    # Outlier counts via IQR
    outlier_counts: Dict[str, int] = {}
    for col in num_cols:
        q1, q3 = df[col].quantile(0.25), df[col].quantile(0.75)
        iqr = q3 - q1
        mask = (df[col] < q1 - 1.5 * iqr) | (df[col] > q3 + 1.5 * iqr)
        outlier_counts[col] = int(mask.sum())

    # Date column detection
    date_cols: List[str] = []
    for col in df.columns:
        if "date" in col.lower() or "time" in col.lower() or "year" in col.lower():
            date_cols.append(col)

    return {
        "shape": df.shape,
        "num_cols": num_cols,
        "cat_cols": cat_cols,
        "null_counts": null_counts,
        "null_pct": null_pct,
        "desc": desc,
        "corr_matrix": corr_matrix,
        "top_correlations": top_correlations,
        "skewness": skewness,
        "outlier_counts": outlier_counts,
        "date_cols": date_cols,
        "duplicates": int(df.duplicated().sum()),
    }


def _generate_findings(df: pd.DataFrame, stats: Dict[str, Any]) -> List[str]:
    """Generate human-readable finding strings from the analysis stats."""
    findings: List[str] = []
    rows, cols = stats["shape"]
    findings.append(f"Dataset contains {rows:,} rows and {cols} columns.")
    findings.append(
        f"{len(stats['num_cols'])} numeric column(s) and "
        f"{len(stats['cat_cols'])} categorical column(s) detected."
    )

    if stats["duplicates"] > 0:
        findings.append(f"Found {stats['duplicates']:,} duplicate rows ({stats['duplicates']/rows*100:.1f}%).")

    # High-null columns
    high_null = {col: pct for col, pct in stats["null_pct"].items() if pct > 20}
    if high_null:
        cols_list = ", ".join(f"{c} ({p}%)" for c, p in list(high_null.items())[:5])
        findings.append(f"High missing-value columns (>20%): {cols_list}.")

    # Top correlations
    for c1, c2, corr in stats["top_correlations"][:3]:
        direction = "positive" if corr > 0 else "negative"
        strength = "strong" if abs(corr) > 0.7 else "moderate"
        findings.append(f"{strength.capitalize()} {direction} correlation ({corr}) between '{c1}' and '{c2}'.")

    # Skewed features
    highly_skewed = {c: s for c, s in stats["skewness"].items() if abs(s) > 1}
    if highly_skewed:
        cols_list = ", ".join(f"{c} (skew={s})" for c, s in list(highly_skewed.items())[:5])
        findings.append(f"Highly skewed features: {cols_list}.")

    # Outliers
    high_outlier = {c: n for c, n in stats["outlier_counts"].items() if n > 0}
    if high_outlier:
        summary = ", ".join(f"{c}: {n}" for c, n in list(high_outlier.items())[:5])
        findings.append(f"Outliers detected (IQR method): {summary}.")

    # Date/time columns
    if stats["date_cols"]:
        findings.append(f"Potential time-series column(s) detected: {', '.join(stats['date_cols'])}.")

    return findings


# ---------------------------------------------------------------------------
# Notebook generation
# ---------------------------------------------------------------------------

def _build_notebook(
    df: pd.DataFrame,
    data_file_name: str,
    output_folder: str,
    notebook_path: str,
    stats: Dict[str, Any],
    findings: List[str],
) -> None:
    """Build and write a comprehensive EDA notebook to *notebook_path*."""
    cells = []
    fname = data_file_name

    # ---- Section 1: Setup & Data Loading ----
    cells.append(new_markdown_cell("# 📊 EDA Report\n## Section 1 — Setup & Data Loading"))
    cells.append(new_code_cell(
        "import warnings\n"
        "warnings.filterwarnings('ignore')\n"
        "import matplotlib\n"
        "matplotlib.use('Agg')\n"
        "import matplotlib.pyplot as plt\n"
        "import seaborn as sns\n"
        "import pandas as pd\n"
        "import numpy as np\n"
        "from scipy import stats\n"
        "from sklearn.decomposition import PCA\n"
        "from sklearn.preprocessing import StandardScaler\n"
        "from pathlib import Path\n"
        "import os\n\n"
        "sns.set_theme(style='whitegrid')\n"
        "%matplotlib inline\n"
        "data_file = Path(" + repr(data_file_name) + ")\n"
        "if data_file.suffix.lower() == '.csv':\n"
        "    df = pd.read_csv(data_file)\n"
        "elif data_file.suffix.lower() == '.tsv':\n"
        "    df = pd.read_csv(data_file, sep='\\t')\n"
        "elif data_file.suffix.lower() in ['.xls', '.xlsx']:\n"
        "    df = pd.read_excel(data_file)\n"
        "elif data_file.suffix.lower() == '.json':\n"
        "    df = pd.read_json(data_file)\n"
        "else:\n"
        "    raise ValueError('Unsupported file format')\n"
        "print('Shape:', df.shape)\n"
        "print('\\nData Types:\\n', df.dtypes)\n"
        "df.head()"
    ))

    # ---- Section 2: Basic Statistics ----
    cells.append(new_markdown_cell("## Section 2 — Basic Statistics"))
    cells.append(new_code_cell(
        "print('--- Descriptive Statistics ---')\n"
        "display(df.describe(include='all'))\n\n"
        "print('\\n--- Null Counts ---')\n"
        "null_info = pd.DataFrame({'count': df.isnull().sum(), 'pct': (df.isnull().mean()*100).round(2)})\n"
        "display(null_info[null_info['count'] > 0].sort_values('pct', ascending=False))\n\n"
        "print(f'\\nDuplicate rows: {df.duplicated().sum()}')"
    ))

    # ---- Section 3: Data Quality ----
    cells.append(new_markdown_cell("## Section 3 — Data Quality"))
    cells.append(new_code_cell(
        "import matplotlib.pyplot as plt\n"
        "import seaborn as sns\n"
        "import numpy as np\n\n"
        "# Missing value heatmap\n"
        "null_cols = df.columns[df.isnull().any()].tolist()\n"
        "if null_cols:\n"
        "    fig, ax = plt.subplots(figsize=(min(14, len(null_cols)+2), 5))\n"
        "    sns.heatmap(df[null_cols].isnull(), cbar=True, yticklabels=False, ax=ax, cmap='viridis')\n"
        "    ax.set_title('Missing Value Heatmap')\n"
        "    plt.tight_layout()\n"
        "    plt.savefig(os.path.join(r'" + output_folder + "', 'missing_heatmap.png'), dpi=100, bbox_inches='tight')\n"
        "    plt.show()\n"
        "    plt.close()\n"
        "else:\n"
        "    print('No missing values — dataset is complete!')\n\n"
        "# IQR outlier detection\n"
        "num_cols = df.select_dtypes(include=np.number).columns.tolist()\n"
        "outlier_summary = {}\n"
        "for col in num_cols:\n"
        "    q1, q3 = df[col].quantile(0.25), df[col].quantile(0.75)\n"
        "    iqr = q3 - q1\n"
        "    mask = (df[col] < q1 - 1.5*iqr) | (df[col] > q3 + 1.5*iqr)\n"
        "    outlier_summary[col] = mask.sum()\n"
        "outlier_df = pd.Series(outlier_summary, name='outlier_count').to_frame()\n"
        "print('\\nOutlier counts (IQR method):')\n"
        "display(outlier_df[outlier_df['outlier_count'] > 0])"
    ))

    # ---- Section 4: Univariate Analysis ----
    cells.append(new_markdown_cell("## Section 4 — Univariate Analysis"))
    cells.append(new_code_cell(
        "num_cols = df.select_dtypes(include=np.number).columns.tolist()\n"
        "cat_cols = df.select_dtypes(include=['object', 'category']).columns.tolist()\n\n"
        "# Histograms for numeric columns\n"
        "if num_cols:\n"
        "    n = len(num_cols)\n"
        "    ncols = 3\n"
        "    nrows = (n + ncols - 1) // ncols\n"
        "    fig, axes = plt.subplots(nrows, ncols, figsize=(ncols*5, nrows*4))\n"
        "    axes = np.array(axes).flatten()\n"
        "    for i, col in enumerate(num_cols):\n"
        "        axes[i].hist(df[col].dropna(), bins=30, color='steelblue', edgecolor='white', alpha=0.8)\n"
        "        axes[i].set_title(col, fontsize=11)\n"
        "        axes[i].set_xlabel('')\n"
        "    for j in range(i+1, len(axes)):\n"
        "        axes[j].set_visible(False)\n"
        "    plt.suptitle('Numeric Feature Distributions', fontsize=14, y=1.01)\n"
        "    plt.tight_layout()\n"
        "    plt.savefig(os.path.join(r'" + output_folder + "', 'numeric_histograms.png'), dpi=100, bbox_inches='tight')\n"
        "    plt.show(); plt.close()\n\n"
        "# Bar charts for categorical columns\n"
        "if cat_cols:\n"
        "    n = min(len(cat_cols), 9)\n"
        "    ncols = 3\n"
        "    nrows = (n + ncols - 1) // ncols\n"
        "    fig, axes = plt.subplots(nrows, ncols, figsize=(ncols*5, nrows*4))\n"
        "    axes = np.array(axes).flatten()\n"
        "    for i, col in enumerate(cat_cols[:9]):\n"
        "        vc = df[col].value_counts().head(15)\n"
        "        axes[i].barh(vc.index.astype(str), vc.values, color='coral', edgecolor='white')\n"
        "        axes[i].set_title(col, fontsize=11)\n"
        "    for j in range(i+1, len(axes)):\n"
        "        axes[j].set_visible(False)\n"
        "    plt.suptitle('Categorical Feature Value Counts', fontsize=14, y=1.01)\n"
        "    plt.tight_layout()\n"
        "    plt.savefig(os.path.join(r'" + output_folder + "', 'categorical_bars.png'), dpi=100, bbox_inches='tight')\n"
        "    plt.show(); plt.close()"
    ))

    # ---- Section 5: Bivariate Analysis ----
    cells.append(new_markdown_cell("## Section 5 — Bivariate Analysis"))
    cells.append(new_code_cell(
        "num_cols = df.select_dtypes(include=np.number).columns.tolist()\n\n"
        "# Correlation heatmap\n"
        "if len(num_cols) >= 2:\n"
        "    corr = df[num_cols].corr()\n"
        "    mask = np.triu(np.ones_like(corr, dtype=bool))\n"
        "    fig, ax = plt.subplots(figsize=(max(8, len(num_cols)), max(6, len(num_cols)-1)))\n"
        "    sns.heatmap(corr, mask=mask, annot=True, fmt='.2f', cmap='coolwarm',\n"
        "                center=0, square=True, linewidths=0.5, ax=ax)\n"
        "    ax.set_title('Correlation Heatmap', fontsize=14)\n"
        "    plt.tight_layout()\n"
        "    plt.savefig(os.path.join(r'" + output_folder + "', 'correlation_heatmap.png'), dpi=100, bbox_inches='tight')\n"
        "    plt.show(); plt.close()\n\n"
        "    # Scatter plots for top correlated pairs\n"
        "    corr_pairs = (corr.abs().unstack().reset_index())\n"
        "    corr_pairs.columns = ['col1','col2','corr']\n"
        "    corr_pairs = corr_pairs[corr_pairs['col1'] < corr_pairs['col2']].sort_values('corr', ascending=False)\n"
        "    top_pairs = corr_pairs.head(min(6, len(corr_pairs)))\n"
        "    if not top_pairs.empty:\n"
        "        n = len(top_pairs)\n"
        "        ncols = min(3, n)\n"
        "        nrows = (n + ncols - 1) // ncols\n"
        "        fig, axes = plt.subplots(nrows, ncols, figsize=(ncols*5, nrows*4))\n"
        "        axes = np.array(axes).flatten()\n"
        "        for i, (_, row) in enumerate(top_pairs.iterrows()):\n"
        "            axes[i].scatter(df[row['col1']], df[row['col2']], alpha=0.4, s=15, color='steelblue')\n"
        "            axes[i].set_xlabel(row['col1']); axes[i].set_ylabel(row['col2'])\n"
        "            axes[i].set_title(f\"r={row['corr']:.2f}\", fontsize=10)\n"
        "        for j in range(i+1, len(axes)):\n"
        "            axes[j].set_visible(False)\n"
        "        plt.suptitle('Top Correlated Pairs', fontsize=13)\n"
        "        plt.tight_layout()\n"
        "        plt.savefig(os.path.join(r'" + output_folder + "', 'scatter_pairs.png'), dpi=100, bbox_inches='tight')\n"
        "        plt.show(); plt.close()\n\n"
        "# Box plots\n"
        "if len(num_cols) >= 1:\n"
        "    ncols = 3\n"
        "    n = min(len(num_cols), 9)\n"
        "    nrows = (n + ncols - 1) // ncols\n"
        "    fig, axes = plt.subplots(nrows, ncols, figsize=(ncols*4, nrows*3))\n"
        "    axes = np.array(axes).flatten()\n"
        "    for i, col in enumerate(num_cols[:9]):\n"
        "        axes[i].boxplot(df[col].dropna(), patch_artist=True,\n"
        "                        boxprops=dict(facecolor='lightblue'))\n"
        "        axes[i].set_title(col, fontsize=10)\n"
        "    for j in range(i+1, len(axes)):\n"
        "        axes[j].set_visible(False)\n"
        "    plt.suptitle('Box Plots (Outlier View)', fontsize=13)\n"
        "    plt.tight_layout()\n"
        "    plt.savefig(os.path.join(r'" + output_folder + "', 'boxplots.png'), dpi=100, bbox_inches='tight')\n"
        "    plt.show(); plt.close()"
    ))

    # ---- Section 6: Multivariate Analysis ----
    cells.append(new_markdown_cell("## Section 6 — Multivariate Analysis"))
    cells.append(new_code_cell(
        "from sklearn.decomposition import PCA\n"
        "from sklearn.preprocessing import StandardScaler\n\n"
        "num_cols = df.select_dtypes(include=np.number).columns.tolist()\n\n"
        "# Pair plot for top-5 numeric features\n"
        "if len(num_cols) >= 3:\n"
        "    top5 = num_cols[:5]\n"
        "    pair_df = df[top5].dropna()\n"
        "    if len(pair_df) > 2000:\n"
        "        pair_df = pair_df.sample(2000, random_state=42)\n"
        "    pair_fig = sns.pairplot(pair_df, diag_kind='kde', plot_kws={'alpha': 0.3, 's': 10})\n"
        "    pair_fig.fig.suptitle('Pair Plot — Top Numeric Features', y=1.01, fontsize=13)\n"
        "    pair_fig.savefig(os.path.join(r'" + output_folder + "', 'pairplot.png'), dpi=80, bbox_inches='tight')\n"
        "    plt.show(); plt.close()\n\n"
        "# PCA for datasets with > 5 numeric columns\n"
        "if len(num_cols) > 5:\n"
        "    pca_df = df[num_cols].dropna()\n"
        "    scaler = StandardScaler()\n"
        "    X_scaled = scaler.fit_transform(pca_df)\n"
        "    pca = PCA(n_components=2, random_state=42)\n"
        "    components = pca.fit_transform(X_scaled)\n"
        "    fig, ax = plt.subplots(figsize=(8, 6))\n"
        "    ax.scatter(components[:, 0], components[:, 1], alpha=0.4, s=15, c='steelblue')\n"
        "    ax.set_xlabel(f'PC1 ({pca.explained_variance_ratio_[0]*100:.1f}% variance)')\n"
        "    ax.set_ylabel(f'PC2 ({pca.explained_variance_ratio_[1]*100:.1f}% variance)')\n"
        "    ax.set_title('PCA — First Two Principal Components')\n"
        "    plt.tight_layout()\n"
        "    plt.savefig(os.path.join(r'" + output_folder + "', 'pca_plot.png'), dpi=100, bbox_inches='tight')\n"
        "    plt.show(); plt.close()\n"
        "    print(f'PCA explained variance: {pca.explained_variance_ratio_}')"
    ))

    # ---- Section 7: Time Series Detection ----
    cells.append(new_markdown_cell("## Section 7 — Time Series Detection"))
    cells.append(new_code_cell(
        "import re\n"
        "date_candidates = [c for c in df.columns if re.search(r'date|time|year|month|day', c, re.I)]\n"
        "if date_candidates:\n"
        "    for dcol in date_candidates:\n"
        "        try:\n"
        "            df[dcol] = pd.to_datetime(df[dcol], errors='coerce')\n"
        "            ts = df.dropna(subset=[dcol]).set_index(dcol).sort_index()\n"
        "            num_cols = ts.select_dtypes(include=np.number).columns.tolist()\n"
        "            if num_cols:\n"
        "                n = min(len(num_cols), 3)\n"
        "                fig, axes = plt.subplots(n, 1, figsize=(12, 4*n))\n"
        "                if n == 1: axes = [axes]\n"
        "                for i, col in enumerate(num_cols[:n]):\n"
        "                    axes[i].plot(ts.index, ts[col], linewidth=0.8, color='steelblue')\n"
        "                    axes[i].set_title(f'{col} over time')\n"
        "                    axes[i].set_xlabel(dcol)\n"
        "                plt.suptitle(f'Time Series Trends (index: {dcol})', fontsize=13)\n"
        "                plt.tight_layout()\n"
        "                plt.savefig(os.path.join(r'" + output_folder + "', 'time_series.png'), dpi=100, bbox_inches='tight')\n"
        "                plt.show(); plt.close()\n"
        "        except Exception as e:\n"
        "            print(f'Could not parse {dcol} as datetime: {e}')\n"
        "else:\n"
        "    print('No date/time columns detected — skipping time series analysis.')"
    ))

    # ---- Section 8: Key Findings ----
    findings_md = "\n".join(f"- {f}" for f in findings)
    cells.append(new_markdown_cell(
        f"## Section 8 — Key Findings\n\n{findings_md}"
    ))
    cells.append(new_code_cell(
        "# Summary statistics overview\n"
        "print('=== Dataset Summary ===')\n"
        "print(f'Rows: {df.shape[0]:,}  |  Columns: {df.shape[1]}')\n"
        "print(f'Numeric columns : {len(df.select_dtypes(include=np.number).columns)}')\n"
        "print(f'Categorical cols: {len(df.select_dtypes(include=[\"object\",\"category\"]).columns)}')\n"
        "print(f'Total missing   : {df.isnull().sum().sum():,}')\n"
        "print(f'Duplicate rows  : {df.duplicated().sum():,}')"
    ))

    # ---- Section 9: Data Cleaning ----
    cells.append(new_markdown_cell("## Section 9 — Data Cleaning"))
    cells.append(new_code_cell(
        "cleaned = df.copy()\n\n"
        "# Drop duplicates\n"
        "before = len(cleaned)\n"
        "cleaned = cleaned.drop_duplicates()\n"
        "print(f'Removed {before - len(cleaned)} duplicate rows.')\n\n"
        "# Fill numeric NaN with median\n"
        "num_cols = cleaned.select_dtypes(include=np.number).columns.tolist()\n"
        "for col in num_cols:\n"
        "    if cleaned[col].isnull().any():\n"
        "        med = cleaned[col].median()\n"
        "        cleaned[col] = cleaned[col].fillna(med)\n\n"
        "# Fill categorical NaN with mode\n"
        "cat_cols = cleaned.select_dtypes(include=['object','category']).columns.tolist()\n"
        "for col in cat_cols:\n"
        "    if cleaned[col].isnull().any():\n"
        "        mode_val = cleaned[col].mode()\n"
        "        if not mode_val.empty:\n"
        "            cleaned[col] = cleaned[col].fillna(mode_val[0])\n\n"
        "# Remove IQR outliers from numeric columns (cap to 1.5*IQR)\n"
        "for col in num_cols:\n"
        "    q1, q3 = cleaned[col].quantile(0.25), cleaned[col].quantile(0.75)\n"
        "    iqr = q3 - q1\n"
        "    lower, upper = q1 - 1.5*iqr, q3 + 1.5*iqr\n"
        "    cleaned[col] = cleaned[col].clip(lower, upper)\n\n"
        "print(f'Cleaned shape: {cleaned.shape}')\n"
        "print(f'Remaining nulls: {cleaned.isnull().sum().sum()}')\n"
        "cleaned.head()"
    ))

    # ---- Section 10: Save Cleaned Dataset ----
    cells.append(new_markdown_cell("## Section 10 — Save Cleaned Dataset"))
    cells.append(new_code_cell(
        f"cleaned_path = r'{output_folder}/cleaned_data.csv'\n"
        "cleaned.to_csv(cleaned_path, index=False)\n"
        "print(f'Cleaned dataset saved to: {cleaned_path}')\n"
        f"print(f'File size: {{os.path.getsize(cleaned_path) / 1024:.1f}} KB')"
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
    logger.info("Notebook written to %s", notebook_path)


# ---------------------------------------------------------------------------
# Notebook execution
# ---------------------------------------------------------------------------

def _execute_notebook(notebook_path: str) -> None:
    """Execute the notebook in-place using jupyter nbconvert."""
    import sys
    # Use the same Python interpreter's jupyter (works in venv)
    jupyter_cmd = [sys.executable, "-m", "jupyter", "nbconvert"]
    try:
        result = subprocess.run(
            jupyter_cmd + [
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
            logger.info("Notebook executed successfully: %s", notebook_path)
    except FileNotFoundError:
        logger.warning("jupyter nbconvert not found — notebook will not be executed")
    except subprocess.TimeoutExpired:
        logger.warning("Notebook execution timed out for %s", notebook_path)
    except Exception as exc:
        logger.error("Notebook execution error: %s", exc)


# ---------------------------------------------------------------------------
# Word document generation
# ---------------------------------------------------------------------------

def _create_word_doc(
    df: pd.DataFrame,
    stats: Dict[str, Any],
    findings: List[str],
    output_path: str,
) -> None:
    """Generate a Word document summarising the EDA findings."""
    doc = Document()

    # Title
    title = doc.add_heading("EDA Report", 0)
    title.alignment = 1  # center

    doc.add_paragraph(f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
    doc.add_paragraph("")

    # Dataset overview
    doc.add_heading("1. Dataset Overview", level=1)
    rows, cols = stats["shape"]
    doc.add_paragraph(f"Shape: {rows:,} rows × {cols} columns")
    doc.add_paragraph(f"Numeric columns: {len(stats['num_cols'])}")
    doc.add_paragraph(f"Categorical columns: {len(stats['cat_cols'])}")
    doc.add_paragraph(f"Duplicate rows: {stats['duplicates']:,}")

    # Data quality table
    doc.add_heading("2. Data Quality — Missing Values", level=1)
    table = doc.add_table(rows=1, cols=3)
    table.style = "Table Grid"
    hdr = table.rows[0].cells
    hdr[0].text, hdr[1].text, hdr[2].text = "Column", "Missing Count", "Missing %"
    for col in df.columns:
        cnt = stats["null_counts"].get(col, 0)
        pct = stats["null_pct"].get(col, 0.0)
        row = table.add_row().cells
        row[0].text = col
        row[1].text = str(cnt)
        row[2].text = f"{pct}%"

    # Key findings
    doc.add_heading("3. Key Findings", level=1)
    for f in findings:
        p = doc.add_paragraph(style="List Bullet")
        p.add_run(f)

    # Top correlations
    if stats["top_correlations"]:
        doc.add_heading("4. Top Correlations", level=1)
        for c1, c2, corr in stats["top_correlations"]:
            doc.add_paragraph(f"• {c1} ↔ {c2}: r = {corr}", style="List Bullet")

    # Skewness
    if stats["skewness"]:
        doc.add_heading("5. Feature Skewness", level=1)
        for col, skew_val in sorted(stats["skewness"].items(), key=lambda x: abs(x[1]), reverse=True)[:10]:
            doc.add_paragraph(f"• {col}: {skew_val:+.4f}")

    # Recommendations
    doc.add_heading("6. Recommendations", level=1)
    recommendations = [
        "Handle missing values appropriately (median/mode imputation or model-based imputation).",
        "Investigate and treat outliers before modelling.",
        "Apply log-transformation to highly skewed numeric features.",
        "Encode categorical variables (one-hot or label encoding) before training.",
        "Use the cleaned_data.csv file for downstream modelling.",
    ]
    for rec in recommendations:
        p = doc.add_paragraph(style="List Bullet")
        p.add_run(rec)

    doc.save(output_path)
    logger.info("Word document saved to %s", output_path)


# ---------------------------------------------------------------------------
# Data cleaning
# ---------------------------------------------------------------------------

def _clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Return a cleaned copy of *df*."""
    cleaned = df.copy()
    cleaned = cleaned.drop_duplicates()

    num_cols = cleaned.select_dtypes(include=[np.number]).columns.tolist()
    cat_cols = cleaned.select_dtypes(include=["object", "category"]).columns.tolist()

    for col in num_cols:
        if cleaned[col].isnull().any():
            cleaned[col] = cleaned[col].fillna(cleaned[col].median())
        q1, q3 = cleaned[col].quantile(0.25), cleaned[col].quantile(0.75)
        iqr = q3 - q1
        cleaned[col] = cleaned[col].clip(q1 - 1.5 * iqr, q3 + 1.5 * iqr)

    for col in cat_cols:
        if cleaned[col].isnull().any():
            mode = cleaned[col].mode()
            if not mode.empty:
                cleaned[col] = cleaned[col].fillna(mode[0])

    return cleaned


# ---------------------------------------------------------------------------
# Zip helper
# ---------------------------------------------------------------------------

def _zip_artifacts(base_folder: str, files: Dict[str, str]) -> str:
    """Zip selected files into base_folder + '.zip' using provided arc names (flattened)."""
    zip_path = base_folder.rstrip("/").rstrip("\\") + ".zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for arcname, src in files.items():
            if src and os.path.exists(src):
                zf.write(src, os.path.basename(arcname))
    logger.info("Artifacts zipped to %s", zip_path)
    return zip_path
