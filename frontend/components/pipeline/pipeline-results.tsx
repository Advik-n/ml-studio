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
  f1_score: "F1 Score",
  precision: "Precision",
  recall: "Recall",
  rmse: "RMSE",
  mae: "MAE",
  r2: "R²",
};

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

  const handleDownloadNotebook = () => {
    if (!job.notebook_path) { toast.error("Notebook not available."); return; }
    const BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");
    window.open(`${BASE}/pipeline/jobs/${job.id}/download-notebook`, "_blank");
  };

  const parsedMetrics = job.metrics ? JSON.parse(job.metrics) : null;
  const metricsEntries = parsedMetrics
    ? Object.entries(parsedMetrics).filter(([, v]) => v !== undefined) as [string, number][]
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
                    {key === "rmse" || key === "mae"
                      ? value.toFixed(4)
                      : `${(value * 100).toFixed(1)}%`}
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
