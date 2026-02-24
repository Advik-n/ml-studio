"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Download,
  FileText,
  BookOpen,
  FileBarChart,
  Archive,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Table2,
  Hash,
  Columns,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import api from "@/lib/api";
import { toast } from "sonner";
import type { EDAJob, EDAJobStatus } from "@/lib/types";

const STEPS: { key: EDAJobStatus; label: string }[] = [
  { key: "uploading", label: "Uploading" },
  { key: "analyzing", label: "Analyzing" },
  { key: "generating_notebook", label: "Generating Notebook" },
  { key: "creating_report", label: "Creating Report" },
  { key: "cleaning_data", label: "Cleaning Data" },
  { key: "completed", label: "Complete" },
];

const stepOrder: EDAJobStatus[] = [
  "pending",
  "uploading",
  "analyzing",
  "generating_notebook",
  "creating_report",
  "cleaning_data",
  "completed",
];

function getStepIndex(status: EDAJobStatus) {
  return stepOrder.indexOf(status);
}

interface EDAResultsProps {
  job: EDAJob;
  onUpdate?: (job: EDAJob) => void;
}

export default function EDAResults({ job: initialJob, onUpdate }: EDAResultsProps) {
  const [job, setJob] = useState<EDAJob>(initialJob);

  useEffect(() => {
    setJob(initialJob);
  }, [initialJob]);

  // Poll for updates while processing
  useEffect(() => {
    if (job.status === "completed" || job.status === "failed") return;

    const interval = setInterval(async () => {
      try {
        const response = await api.get<EDAJob>(`/eda/${job.id}`);
        setJob(response.data);
        onUpdate?.(response.data);
        if (response.data.status === "completed" || response.data.status === "failed") {
          clearInterval(interval);
        }
      } catch {
        // Silent fail during polling
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [job.id, job.status, onUpdate]);

  const currentStepIndex = getStepIndex(job.status);

  const handleDownload = async (type: "dataset" | "notebook" | "report" | "cleaned" | "all") => {
    const urlMap = {
      dataset: job.file_url,
      notebook: job.notebook_url,
      report: job.report_url,
      cleaned: job.cleaned_data_url,
      all: job.zip_url,
    };
    const url = urlMap[type];
    if (!url) {
      toast.error("File not available yet.");
      return;
    }
    try {
      const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const fullUrl = url.startsWith("http") ? url : `${BASE}${url}`;
      window.open(fullUrl, "_blank");
    } catch {
      toast.error("Download failed.");
    }
  };

  return (
    <div className="space-y-5">
      {/* Status + progress */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-[var(--text)]">Analysis Progress</h3>
            <Badge variant={job.status === "completed" ? "success" : job.status === "failed" ? "error" : "processing"}>
              {job.status === "completed"
                ? "Complete"
                : job.status === "failed"
                ? "Failed"
                : "Processing"}
            </Badge>
          </div>

          {job.status === "failed" && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {job.error_message || "Analysis failed."}
            </div>
          )}

          {/* Step tracker */}
          <div className="space-y-2">
            {STEPS.map((step, i) => {
              const stepIdx = stepOrder.indexOf(step.key);
              const isCompleted = currentStepIndex > stepIdx;
              const isActive = job.status === step.key;
              const isPending = currentStepIndex < stepIdx && job.status !== "failed";

              return (
                <div key={step.key} className="flex items-center gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                    {isCompleted || job.status === "completed" ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    ) : isActive ? (
                      <Loader2 className="h-5 w-5 text-[var(--primary)] animate-spin" />
                    ) : (
                      <div className={`h-4 w-4 rounded-full border-2 ${isPending ? "border-[var(--border)]" : "border-red-500"}`} />
                    )}
                  </div>
                  <span
                    className={`text-sm ${
                      isCompleted || job.status === "completed"
                        ? "text-emerald-500 font-medium"
                        : isActive
                        ? "text-[var(--primary)] font-medium"
                        : "text-[var(--text-muted)]"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Progress bar */}
          <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--accent)]"
              animate={{ width: `${job.progress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <p className="text-xs text-[var(--text-muted)] text-right">{job.progress}% complete</p>
        </CardContent>
      </Card>

      {/* Stats preview */}
      {(job.row_count || job.column_count) && (
        <div className="grid grid-cols-2 gap-3">
          {job.row_count && (
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                  <Hash className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-lg font-bold text-[var(--text)]">{job.row_count.toLocaleString()}</p>
                  <p className="text-xs text-[var(--text-muted)]">Rows</p>
                </div>
              </CardContent>
            </Card>
          )}
          {job.column_count && (
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10">
                  <Columns className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-lg font-bold text-[var(--text)]">{job.column_count}</p>
                  <p className="text-xs text-[var(--text-muted)]">Columns</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Downloads */}
      {job.status === "completed" && (
        <Card>
          <CardContent className="p-5">
            <h3 className="mb-4 font-semibold text-[var(--text)]">Download Results</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Button
                variant="secondary"
                className="flex-col h-auto py-3 gap-1.5"
                onClick={() => handleDownload("dataset")}
                disabled={!job.file_url}
              >
                <Table2 className="h-5 w-5 text-green-500" />
                <span className="text-xs">Dataset (CSV)</span>
              </Button>
              <Button
                variant="secondary"
                className="flex-col h-auto py-3 gap-1.5"
                onClick={() => handleDownload("notebook")}
                disabled={!job.notebook_url}
              >
                <BookOpen className="h-5 w-5 text-orange-500" />
                <span className="text-xs">Notebook (ipynb)</span>
              </Button>
              <Button
                variant="secondary"
                className="flex-col h-auto py-3 gap-1.5"
                onClick={() => handleDownload("report")}
                disabled={!job.report_url}
              >
                <FileBarChart className="h-5 w-5 text-blue-500" />
                <span className="text-xs">Report (docx)</span>
              </Button>
              <Button
                variant="secondary"
                className="flex-col h-auto py-3 gap-1.5"
                onClick={() => handleDownload("cleaned")}
                disabled={!job.cleaned_data_url}
              >
                <FileText className="h-5 w-5 text-purple-500" />
                <span className="text-xs">Cleaned Data</span>
              </Button>
              <Button
                className="flex-col h-auto py-3 gap-1.5 col-span-2 sm:col-span-1"
                onClick={() => handleDownload("all")}
                disabled={!job.zip_url}
              >
                <Archive className="h-5 w-5" />
                <span className="text-xs">All (ZIP)</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
