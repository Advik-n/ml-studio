"use client";

import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileText,
  X,
  CheckCircle2,
  AlertCircle,
  Table2,
  FileJson,
  FileSpreadsheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/utils";
import api from "@/lib/api";
import { toast } from "sonner";
import type { EDAJob } from "@/lib/types";

const ACCEPTED_FORMATS = {
  "text/csv": [".csv"],
  "text/tab-separated-values": [".tsv"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/json": [".json"],
  "application/octet-stream": [".parquet"],
};

const formatIcons: Record<string, React.ReactNode> = {
  csv: <Table2 className="h-4 w-4 text-green-500" />,
  tsv: <Table2 className="h-4 w-4 text-cyan-500" />,
  xls: <FileSpreadsheet className="h-4 w-4 text-green-600" />,
  xlsx: <FileSpreadsheet className="h-4 w-4 text-green-600" />,
  json: <FileJson className="h-4 w-4 text-yellow-500" />,
  parquet: <FileText className="h-4 w-4 text-orange-500" />,
};

interface FileUploadProps {
  projectId: string;
  onJobCreated: (job: EDAJob) => void;
}

export default function FileUpload({ projectId, onJobCreated }: FileUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles[0]) setFile(acceptedFiles[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: ACCEPTED_FORMATS,
    maxFiles: 1,
    maxSize: 200 * 1024 * 1024, // 200MB
  });

  const ext = file?.name.split(".").pop()?.toLowerCase() || "";

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await api.post<EDAJob>(`/projects/${projectId}/eda`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      toast.success("File uploaded! EDA analysis starting...");
      onJobCreated(response.data);
      setFile(null);
      setUploadProgress(0);
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`relative rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-200 ${
          isDragActive
            ? "border-[var(--primary)] bg-[var(--primary)]/5"
            : "border-[var(--border)] hover:border-[var(--primary)]/50 hover:bg-[var(--surface-2)]"
        }`}
      >
        <input {...getInputProps()} />
        <AnimatePresence mode="wait">
          {isDragActive ? (
            <motion.div
              key="drag"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-2"
            >
              <Upload className="h-10 w-10 text-[var(--primary)]" />
              <p className="font-medium text-[var(--primary)]">Drop your file here</p>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-2)]">
                <Upload className="h-7 w-7 text-[var(--text-muted)]" />
              </div>
              <div>
                <p className="font-medium text-[var(--text)]">
                  Drag & drop your dataset here
                </p>
                <p className="text-sm text-[var(--text-muted)] mt-0.5">
                  or click to browse files
                </p>
              </div>
              <p className="text-xs text-[var(--text-muted)]">Max size: 200 MB</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Supported formats */}
      <div className="flex flex-wrap gap-2">
        {Object.keys(formatIcons).map((fmt) => (
          <span
            key={fmt}
            className="flex items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-muted)]"
          >
            {formatIcons[fmt]}
            .{fmt}
          </span>
        ))}
      </div>

      {/* File rejection error */}
      {fileRejections.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {fileRejections[0].errors[0].message}
        </div>
      )}

      {/* Selected file */}
      <AnimatePresence>
        {file && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--surface)]">
                  {formatIcons[ext] || <FileText className="h-5 w-5 text-[var(--text-muted)]" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text)] truncate">{file.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">{formatFileSize(file.size)}</p>
                </div>
              </div>
              {!uploading && (
                <button
                  onClick={() => setFile(null)}
                  className="text-[var(--text-muted)] hover:text-red-500 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Upload progress */}
            {uploading && (
              <div className="mt-3 space-y-1">
                <div className="h-1.5 w-full rounded-full bg-[var(--border)] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-[var(--primary)]"
                    animate={{ width: `${uploadProgress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <p className="text-xs text-[var(--text-muted)] text-right">{uploadProgress}%</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload button */}
      {file && !uploading && (
        <Button onClick={handleUpload} className="w-full" size="lg">
          <CheckCircle2 className="h-4 w-4" />
          Start EDA Analysis
        </Button>
      )}
    </div>
  );
}
