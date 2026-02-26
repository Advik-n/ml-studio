"use client";

import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  BookOpen,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import api from "@/lib/api";
import { toast } from "@/lib/toast";
import type { PipelineJob } from "@/lib/types";

interface PipelineResultsProps {
  job: PipelineJob;
  onUpdate?: (job: PipelineJob) => void;
}

const METRIC_LABELS: Record<string, string> = {
  accuracy: "Accuracy",
  f1_weighted: "F1 (Weighted)",
  precision_weighted: "Precision",
  recall_weighted: "Recall",
  roc_auc: "ROC-AUC",
  rmse: "RMSE",
  mse: "MSE",
  mae: "MAE",
  r2: "R²",
  adjusted_r2: "Adjusted R²",
  silhouette_score: "Silhouette",
  davies_bouldin: "Davies-Bouldin",
  calinski_harabasz: "Calinski-Harabasz",
  n_clusters: "N Clusters",
};

// Metrics displayed as raw numbers (not percentages)
const RAW_METRICS = new Set(["rmse", "mse", "mae", "davies_bouldin", "calinski_harabasz", "n_clusters"]);

export default function PipelineResults({ job: initialJob, onUpdate }: PipelineResultsProps) {
  const [job, setJob] = useState<PipelineJob>(initialJob);

  useEffect(() => { setJob(initialJob); }, [initialJob]);

  useEffect(() => {
    if (job.status === "completed" || job.status === "failed") return;
    const interval = setInterval(async () => {
      try {
        const res = await api.get<PipelineJob>(`/pipeline/jobs/${job.id}`);
        setJob(res.data);
        onUpdate?.(res.data);
        if (res.data.status === "completed" || res.data.status === "failed") clearInterval(interval);
      } catch { /* silent */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [job.id, job.status, onUpdate]);

  const downloadBlob = async (url: string, filename: string) => {
    try {
      const res = await api.get(url, { responseType: "blob" });
      const blob = new Blob([res.data]);
      const link = document.createElement("a");
      link.href = window.URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(link.href);
    } catch (err) {
      toast.error("Download failed.");
      console.error(err);
    }
  };

  const handleDownloadNotebook = async () => {
    if (!job.notebook_path) { toast.error("Notebook not available."); return; }
    const BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");
    await downloadBlob(`${BASE}/pipeline/jobs/${job.id}/download-notebook`, `pipeline_${job.id}.ipynb`);
  };

  const parsedMetrics = job.metrics ? JSON.parse(job.metrics) : null;
  const metricsEntries = parsedMetrics
    ? (Object.entries(parsedMetrics).filter(
        ([k, v]) => v !== undefined && v !== null && k !== "confusion_matrix"
      ) as [string, number][])
    : [];

  return (
    <div className="space-y-5">
      {/* Status */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[var(--text)]">Training Status</h3>
            <Badge
              variant={
                job.status === "completed"
                  ? "success"
                  : job.status === "failed"
                  ? "error"
                  : "processing"
              }
            >
              {job.status}
            </Badge>
          </div>

          {job.status === "processing" && (
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 text-[var(--primary)] animate-spin" />
              <p className="text-sm text-[var(--text-muted)]">Training in progress...</p>
            </div>
          )}

          {job.status === "completed" && (
            <div className="flex items-center gap-2 text-emerald-500">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm font-medium">Training complete!</span>
            </div>
          )}

          {job.status === "failed" && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {job.error_message || "Pipeline failed."}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Metrics */}
      {metricsEntries.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-[var(--primary)]" />
              <h3 className="font-semibold text-[var(--text)]">Model Metrics</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {metricsEntries.map(([key, value]) => (
                <div
                  key={key}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-center"
                >
                  <p className="text-2xl font-bold text-[var(--primary)]">
                    {RAW_METRICS.has(key)
                      ? value.toFixed(4)
                      : typeof value === "number"
                      ? `${(value * 100).toFixed(1)}%`
                      : String(value)}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">{METRIC_LABELS[key] || key}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Download */}
      {job.status === "completed" && job.notebook_path && (
        <Button variant="secondary" onClick={handleDownloadNotebook} className="w-full">
          <BookOpen className="h-4 w-4" />
          Download Training Notebook
        </Button>
      )}
    </div>
  );
}
