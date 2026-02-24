"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  BookOpen,
  TrendingUp,
  BarChart3,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import api from "@/lib/api";
import { toast } from "sonner";
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

const COLORS = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4", "#84cc16"];

export default function PipelineResults({ job: initialJob, onUpdate }: PipelineResultsProps) {
  const [job, setJob] = useState<PipelineJob>(initialJob);

  useEffect(() => { setJob(initialJob); }, [initialJob]);

  useEffect(() => {
    if (job.status === "completed" || job.status === "failed") return;
    const interval = setInterval(async () => {
      try {
        const res = await api.get<PipelineJob>(`/pipeline/${job.id}`);
        setJob(res.data);
        onUpdate?.(res.data);
        if (res.data.status === "completed" || res.data.status === "failed") clearInterval(interval);
      } catch { /* silent */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [job.id, job.status, onUpdate]);

  const handleDownloadNotebook = () => {
    if (!job.notebook_url) { toast.error("Notebook not available."); return; }
    const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const url = job.notebook_url;
    window.open(url.startsWith("http") ? url : `${BASE}${url}`, "_blank");
  };

  const metricsEntries = job.metrics
    ? Object.entries(job.metrics).filter(([, v]) => v !== undefined) as [string, number][]
    : [];

  const featureData = (job.feature_importance || [])
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 15);

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

          {job.status === "running" && (
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 text-[var(--primary)] animate-spin" />
              <div className="flex-1">
                <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--accent)]"
                    animate={{ width: `${job.progress}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1 text-right">{job.progress}%</p>
              </div>
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

      {/* Feature importance */}
      {featureData.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-5 w-5 text-[var(--primary)]" />
              <h3 className="font-semibold text-[var(--text)]">Feature Importance</h3>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={featureData}
                layout="vertical"
                margin={{ top: 0, right: 16, bottom: 0, left: 80 }}
              >
                <XAxis type="number" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
                <YAxis
                  type="category"
                  dataKey="feature"
                  tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                  width={80}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "var(--text)",
                  }}
                  formatter={(v: number | undefined) => [v !== undefined ? v.toFixed(4) : "0", "Importance"]}
                />
                <Bar dataKey="importance" radius={4}>
                  {featureData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Confusion matrix */}
      {job.confusion_matrix && job.confusion_matrix.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold text-[var(--text)] mb-4">Confusion Matrix</h3>
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse mx-auto">
                <tbody>
                  {job.confusion_matrix.map((row, i) => (
                    <tr key={i}>
                      {row.map((val, j) => (
                        <td
                          key={j}
                          className={`border border-[var(--border)] p-2 text-center font-mono min-w-[48px] ${
                            i === j
                              ? "bg-[var(--primary)]/20 text-[var(--primary)] font-bold"
                              : "bg-[var(--surface-2)] text-[var(--text-muted)]"
                          }`}
                        >
                          {val}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-[var(--text-muted)] text-center mt-2">Predicted →</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Download */}
      {job.status === "completed" && job.notebook_url && (
        <Button variant="secondary" onClick={handleDownloadNotebook} className="w-full">
          <BookOpen className="h-4 w-4" />
          Download Training Notebook
        </Button>
      )}
    </div>
  );
}
