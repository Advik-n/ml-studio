"""Chart generation service — produces base64-encoded PNG charts for EDA & domain analysis."""

import base64
import io
from typing import Any, Dict, List, Optional

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import numpy as np


# ── Shared style ──────────────────────────────────────────────────────────────
_BG = "#1e293b"
_TEXT = "#e2e8f0"
_GRID = "#334155"
_PALETTE = [
    "#8b5cf6", "#3b82f6", "#06b6d4", "#10b981", "#f59e0b",
    "#ef4444", "#ec4899", "#f97316", "#14b8a6", "#6366f1",
    "#a855f7", "#22c55e", "#eab308", "#f43f5e", "#0ea5e9",
    "#84cc16", "#d946ef", "#64748b",
]


def _setup_style():
    plt.rcParams.update({
        "figure.facecolor": _BG,
        "axes.facecolor": _BG,
        "axes.edgecolor": _GRID,
        "axes.labelcolor": _TEXT,
        "text.color": _TEXT,
        "xtick.color": _TEXT,
        "ytick.color": _TEXT,
        "grid.color": _GRID,
        "grid.alpha": 0.3,
        "font.size": 10,
        "figure.dpi": 120,
    })


def _fig_to_base64(fig: plt.Figure) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", pad_inches=0.3)
    plt.close(fig)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode("utf-8")


# ── Chart generators ──────────────────────────────────────────────────────────

def class_distribution_chart(class_dist: Dict[str, int], title: str = "Class Distribution") -> str:
    """Horizontal bar chart of class distribution."""
    _setup_style()
    sorted_items = sorted(class_dist.items(), key=lambda x: x[1], reverse=True)
    classes = [c for c, _ in sorted_items]
    counts = [n for _, n in sorted_items]
    total = sum(counts) or 1

    fig, ax = plt.subplots(figsize=(8, max(3, len(classes) * 0.4)))
    colors = [_PALETTE[i % len(_PALETTE)] for i in range(len(classes))]
    bars = ax.barh(range(len(classes)), counts, color=colors, edgecolor="none", height=0.7)

    ax.set_yticks(range(len(classes)))
    ax.set_yticklabels(classes, fontsize=9)
    ax.invert_yaxis()
    ax.set_xlabel("Count")
    ax.set_title(title, fontsize=13, fontweight="bold", pad=12)
    ax.grid(axis="x", alpha=0.2)

    for bar, count in zip(bars, counts):
        pct = count / total * 100
        ax.text(bar.get_width() + max(counts) * 0.01, bar.get_y() + bar.get_height() / 2,
                f"{count} ({pct:.1f}%)", va="center", fontsize=8, color=_TEXT)

    fig.tight_layout()
    return _fig_to_base64(fig)


def pixel_histogram_chart(pixel_stats: Dict[str, Any]) -> str:
    """RGB pixel mean/std bar chart."""
    _setup_style()
    fig, axes = plt.subplots(1, 2, figsize=(10, 4))

    channels = ["R", "G", "B"]
    means = [pixel_stats.get("mean_r", 0), pixel_stats.get("mean_g", 0), pixel_stats.get("mean_b", 0)]
    stds = [pixel_stats.get("std_r", 0), pixel_stats.get("std_g", 0), pixel_stats.get("std_b", 0)]
    channel_colors = ["#ef4444", "#22c55e", "#3b82f6"]

    axes[0].bar(channels, means, color=channel_colors, edgecolor="none", width=0.5)
    axes[0].set_title("Mean Pixel Values", fontsize=11, fontweight="bold")
    axes[0].set_ylabel("Value (0-255)")
    axes[0].set_ylim(0, 260)
    for i, v in enumerate(means):
        axes[0].text(i, v + 5, f"{v:.1f}", ha="center", fontsize=9, color=_TEXT)

    axes[1].bar(channels, stds, color=channel_colors, edgecolor="none", width=0.5, alpha=0.8)
    axes[1].set_title("Pixel Std Deviation", fontsize=11, fontweight="bold")
    axes[1].set_ylabel("Std Dev")
    for i, v in enumerate(stds):
        axes[1].text(i, v + 1, f"{v:.1f}", ha="center", fontsize=9, color=_TEXT)

    fig.suptitle("Pixel Statistics", fontsize=13, fontweight="bold", y=1.02)
    fig.tight_layout()
    return _fig_to_base64(fig)


def resolution_chart(resolution_stats: Dict[str, Any]) -> str:
    """Resolution range visualization."""
    _setup_style()
    fig, ax = plt.subplots(figsize=(8, 4))

    dims = ["Width", "Height"]
    mins = [resolution_stats.get("min_width", 0), resolution_stats.get("min_height", 0)]
    maxs = [resolution_stats.get("max_width", 0), resolution_stats.get("max_height", 0)]
    means = [resolution_stats.get("mean_width", 0), resolution_stats.get("mean_height", 0)]

    x = np.arange(len(dims))
    w = 0.25
    ax.bar(x - w, mins, w, label="Min", color="#3b82f6", edgecolor="none")
    ax.bar(x, means, w, label="Mean", color="#8b5cf6", edgecolor="none")
    ax.bar(x + w, maxs, w, label="Max", color="#ef4444", edgecolor="none")

    ax.set_xticks(x)
    ax.set_xticklabels(dims)
    ax.set_ylabel("Pixels")
    ax.set_title("Resolution Distribution", fontsize=13, fontweight="bold", pad=12)
    ax.legend(loc="upper right", framealpha=0.5)
    ax.grid(axis="y", alpha=0.2)

    fig.tight_layout()
    return _fig_to_base64(fig)


def quality_summary_chart(blur_stats: Optional[Dict], corrupt_count: int,
                          duplicate_count: int, total: int) -> str:
    """Donut chart showing image quality breakdown."""
    _setup_style()
    fig, ax = plt.subplots(figsize=(6, 5))

    blurry = blur_stats.get("blurry_count", 0) if blur_stats else 0
    clean = max(0, total - blurry - corrupt_count - duplicate_count)

    sizes = [clean, blurry, corrupt_count, duplicate_count]
    labels = ["Clean", "Blurry", "Corrupt", "Duplicates"]
    colors = ["#22c55e", "#f59e0b", "#ef4444", "#6366f1"]

    non_zero = [(s, l, c) for s, l, c in zip(sizes, labels, colors) if s > 0]
    if not non_zero:
        non_zero = [(1, "No Data", "#64748b")]

    sizes_f, labels_f, colors_f = zip(*non_zero)
    wedges, texts, autotexts = ax.pie(
        sizes_f, labels=labels_f, colors=colors_f, autopct="%1.1f%%",
        startangle=90, pctdistance=0.75, wedgeprops=dict(width=0.35, edgecolor=_BG),
        textprops={"fontsize": 9}
    )
    for at in autotexts:
        at.set_color(_TEXT)
        at.set_fontsize(8)

    ax.set_title("Image Quality Overview", fontsize=13, fontweight="bold", pad=12)
    fig.tight_layout()
    return _fig_to_base64(fig)


def health_scores_chart(health_scores: Dict[str, float], title: str = "Health Scores by Class") -> str:
    """Bar chart of health scores per class (AgriTech)."""
    _setup_style()
    sorted_items = sorted(health_scores.items(), key=lambda x: x[1])
    classes = [c for c, _ in sorted_items]
    scores = [s for _, s in sorted_items]

    fig, ax = plt.subplots(figsize=(8, max(3, len(classes) * 0.45)))

    colors_mapped = []
    for s in scores:
        if s >= 70:
            colors_mapped.append("#22c55e")
        elif s >= 40:
            colors_mapped.append("#f59e0b")
        else:
            colors_mapped.append("#ef4444")

    bars = ax.barh(range(len(classes)), scores, color=colors_mapped, edgecolor="none", height=0.7)
    ax.set_yticks(range(len(classes)))
    ax.set_yticklabels(classes, fontsize=9)
    ax.set_xlim(0, 105)
    ax.set_xlabel("Health Score (%)")
    ax.set_title(title, fontsize=13, fontweight="bold", pad=12)
    ax.axvline(x=70, color="#22c55e", linestyle="--", alpha=0.4, label="Healthy (70%)")
    ax.axvline(x=40, color="#f59e0b", linestyle="--", alpha=0.4, label="Warning (40%)")
    ax.legend(loc="lower right", fontsize=8, framealpha=0.5)

    for bar, score in zip(bars, scores):
        ax.text(bar.get_width() + 1, bar.get_y() + bar.get_height() / 2,
                f"{score:.1f}%", va="center", fontsize=8, color=_TEXT)

    fig.tight_layout()
    return _fig_to_base64(fig)


def severity_chart(severity_scores: Dict[str, float], title: str = "Severity Scores by Class") -> str:
    """Horizontal bar chart of severity scores (MediTech). Higher = more severe."""
    _setup_style()
    sorted_items = sorted(severity_scores.items(), key=lambda x: x[1], reverse=True)
    classes = [c for c, _ in sorted_items]
    scores = [s for _, s in sorted_items]

    fig, ax = plt.subplots(figsize=(8, max(3, len(classes) * 0.45)))

    colors_mapped = []
    for s in scores:
        if s >= 60:
            colors_mapped.append("#ef4444")
        elif s >= 30:
            colors_mapped.append("#f59e0b")
        else:
            colors_mapped.append("#22c55e")

    bars = ax.barh(range(len(classes)), scores, color=colors_mapped, edgecolor="none", height=0.7)
    ax.set_yticks(range(len(classes)))
    ax.set_yticklabels(classes, fontsize=9)
    ax.invert_yaxis()
    ax.set_xlim(0, 105)
    ax.set_xlabel("Severity (%)")
    ax.set_title(title, fontsize=13, fontweight="bold", pad=12)
    ax.axvline(x=60, color="#ef4444", linestyle="--", alpha=0.4, label="Critical (60%)")
    ax.axvline(x=30, color="#f59e0b", linestyle="--", alpha=0.4, label="Moderate (30%)")
    ax.legend(loc="lower right", fontsize=8, framealpha=0.5)

    for bar, score in zip(bars, scores):
        ax.text(bar.get_width() + 1, bar.get_y() + bar.get_height() / 2,
                f"{score:.1f}%", va="center", fontsize=8, color=_TEXT)

    fig.tight_layout()
    return _fig_to_base64(fig)


def imbalance_chart(class_dist: Dict[str, int]) -> str:
    """Pie chart showing class balance."""
    _setup_style()
    sorted_items = sorted(class_dist.items(), key=lambda x: x[1], reverse=True)[:15]
    labels = [c for c, _ in sorted_items]
    sizes = [n for _, n in sorted_items]

    fig, ax = plt.subplots(figsize=(7, 5))
    colors = [_PALETTE[i % len(_PALETTE)] for i in range(len(labels))]

    wedges, texts = ax.pie(
        sizes, labels=None, colors=colors, startangle=90,
        wedgeprops=dict(edgecolor=_BG, linewidth=1)
    )

    ax.legend(wedges, [f"{l} ({s})" for l, s in zip(labels, sizes)],
              loc="center left", bbox_to_anchor=(1, 0.5), fontsize=8, framealpha=0.5)
    ax.set_title("Class Balance", fontsize=13, fontweight="bold", pad=12)

    fig.tight_layout()
    return _fig_to_base64(fig)


# ── High-level generators ────────────────────────────────────────────────────

def generate_eda_charts(eda_report: Dict[str, Any]) -> Dict[str, str]:
    """Generate all EDA charts from an EDA report dict. Returns {name: base64_png}."""
    charts: Dict[str, str] = {}

    if eda_report.get("class_distribution"):
        try:
            charts["class_distribution"] = class_distribution_chart(eda_report["class_distribution"])
        except Exception:
            pass
        try:
            charts["class_balance"] = imbalance_chart(eda_report["class_distribution"])
        except Exception:
            pass

    if eda_report.get("pixel_stats"):
        try:
            charts["pixel_stats"] = pixel_histogram_chart(eda_report["pixel_stats"])
        except Exception:
            pass

    if eda_report.get("resolution_stats"):
        try:
            charts["resolution"] = resolution_chart(eda_report["resolution_stats"])
        except Exception:
            pass

    try:
        charts["quality"] = quality_summary_chart(
            eda_report.get("blur_stats"),
            eda_report.get("corrupt_count", 0),
            eda_report.get("duplicate_count", 0),
            eda_report.get("total_images", 0),
        )
    except Exception:
        pass

    return charts


def generate_agritech_charts(agritech_data: Dict[str, Any]) -> Dict[str, str]:
    """Generate AgriTech-specific charts."""
    charts: Dict[str, str] = {}
    if agritech_data.get("health_scores"):
        try:
            charts["health_scores"] = health_scores_chart(agritech_data["health_scores"])
        except Exception:
            pass
    return charts


def generate_meditech_charts(meditech_data: Dict[str, Any]) -> Dict[str, str]:
    """Generate MediTech-specific charts."""
    charts: Dict[str, str] = {}
    if meditech_data.get("severity_scores"):
        try:
            charts["severity_scores"] = severity_chart(meditech_data["severity_scores"])
        except Exception:
            pass
    return charts
