"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Image, Upload, BarChart2, Eye, AlertTriangle, Copy, CheckCircle2, Download, FileText, Code, Shield, Zap, Info, Leaf, HeartPulse, Bug, Microscope, Activity } from "lucide-react";
import Navbar from "@/components/layout/navbar";
import Sidebar from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth";
import api from "@/lib/api";
import { toast } from "@/lib/toast";
import { extractApiError } from "@/lib/api-errors";
import type { Project, User } from "@/lib/types";

export default function ImageEDAPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [job, setJob] = useState<any>(null);
  const [edaResult, setEdaResult] = useState<any>(null);
  const [fileType, setFileType] = useState("image");
  const [maxSample, setMaxSample] = useState(500);
  const [runningAgritech, setRunningAgritech] = useState(false);
  const [runningMeditech, setRunningMeditech] = useState(false);
  const searchParams = useSearchParams();
  const domain = searchParams.get("domain");

  const fetchData = useCallback(async () => {
    try {
      const [userData, projRes] = await Promise.all([
        getCurrentUser(),
        api.get<Project>(`/projects/${id}`),
      ]);
      setUser(userData);
      setProject(projRes.data);

      try {
        const jobsRes = await api.get(`/image/${id}/jobs`);
        const jobsList = Array.isArray(jobsRes.data) ? jobsRes.data : [];
        const edaJobs = jobsList.filter((j: any) => j.job_type === "image_eda");
        if (edaJobs.length > 0) {
          const latest = edaJobs[0];
          setJob(latest);
          if (latest.status === "completed" && latest.eda_report) {
            setEdaResult(latest.eda_report);
          }
        }
      } catch (err) {
        console.error("Failed to fetch image jobs:", err);
      }
    } catch {
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const MAX_SIZE = 500 * 1024 * 1024;
    if (file.size > MAX_SIZE) { toast.error("File too large. Maximum 500MB."); return; }
    setUploading(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post(`/image/${id}/upload`, formData, {
        timeout: 300000,
        onUploadProgress: (e) => { if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100)); },
      });
      setJob(res.data);
      toast.success("Dataset uploaded successfully!");
    } catch (err: unknown) {
      toast.error(extractApiError(err, "Upload failed"));
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleRunEDA = async () => {
    if (!job) return;
    setRunning(true);
    try {
      const res = await api.post(`/image/jobs/${job.id}/run-eda`, { file_type: fileType, max_sample: maxSample }, { timeout: 600000 });
      setJob(res.data);
      if (res.data.eda_report) setEdaResult(res.data.eda_report);
    } catch (err: unknown) {
      toast.error(extractApiError(err, "EDA failed"));
    } finally {
      setRunning(false);
    }
  };

  const handleRunDomain = async (domainType: "agritech" | "meditech") => {
    if (!job) return;
    const setter = domainType === "agritech" ? setRunningAgritech : setRunningMeditech;
    setter(true);
    try {
      const res = await api.post(`/image/jobs/${job.id}/run-${domainType}`, { domain: domainType }, { timeout: 600000 });
      setJob(res.data);
      if (res.data.eda_report) setEdaResult(res.data.eda_report);
      toast.success(`${domainType === "agritech" ? "AgriTech" : "MediTech"} analysis complete!`);
    } catch (err: unknown) {
      toast.error(extractApiError(err, `${domainType} analysis failed`));
    } finally {
      setter(false);
    }
  };

  const downloadFile = async (endpoint: string, filename: string, type: string) => {
    try {
      const res = await api.get(endpoint, { responseType: "blob" });
      const blob = new Blob([res.data], { type });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success(`Downloaded ${filename}`);
    } catch {
      toast.error("Download failed");
    }
  };

  if (loading || !project) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar userName={user?.name || user?.username} />
      <div className="flex">
        <Sidebar projectId={id} projectName={project.name} projectType="image" />
        <main className="flex-1 p-6 max-w-6xl">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-[var(--text)] flex items-center gap-2">
              <motion.div whileHover={{ rotate: 10 }}>
                <Eye className="h-5 w-5 text-orange-500" />
              </motion.div>
              Image EDA
            </h1>
            <p className="text-sm text-[var(--text-muted)]">Comprehensive image dataset analysis</p>
          </div>

          {/* Upload Section */}
          {!job && (
            <Card className="mb-6 card-hover-glow">
              <CardContent className="p-6">
                <div className="flex flex-col items-center justify-center py-8">
                  <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
                    <Upload className="h-12 w-12 text-[var(--text-muted)] mb-4" />
                  </motion.div>
                  <p className="text-[var(--text)] font-medium mb-2">Upload Image Dataset</p>
                  <p className="text-sm text-[var(--text-muted)] mb-2 text-center max-w-md">
                    Upload a ZIP file with images — supports class folders, flat directories, train/test splits, and nested structures
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mb-4 text-center max-w-md">
                    Formats: JPG, PNG, BMP, TIFF, WebP, GIF, HEIC, RAW, and more
                  </p>
                  {!uploading ? (
                    <label className="cursor-pointer inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-all btn-glow">
                      <input type="file" accept=".zip" onChange={handleUpload} className="hidden" />
                      <Upload className="h-4 w-4" /> Select ZIP File
                    </label>
                  ) : (
                    <div className="w-full max-w-xs">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-[var(--text)]">Uploading...</span>
                        <span className="text-[var(--text-muted)]">{uploadProgress}%</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${uploadProgress}%` }}
                          className="h-full rounded-full bg-gradient-to-r from-blue-600 via-purple-500 to-cyan-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Job Status */}
          {job && !edaResult && (
            <Card className="mb-6 card-hover-glow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="font-medium text-[var(--text)]">Dataset Uploaded</p>
                    <p className="text-sm text-[var(--text-muted)]">Job ID: {job.id.slice(0, 8)}...</p>
                  </div>
                  <Badge variant={job.status === "completed" ? "success" : job.status === "failed" ? "error" : "processing"}>
                    {job.status}
                  </Badge>
                </div>
                {job.status === "pending" && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">File Type</label>
                        <select
                          value={fileType}
                          onChange={(e) => setFileType(e.target.value)}
                          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] min-w-[140px]"
                        >
                          <option value="image">Image</option>
                          <option value="csv">CSV</option>
                          <option value="txt">Text</option>
                          <option value="json">JSON</option>
                          <option value="tsv">TSV</option>
                          <option value="parquet">Parquet</option>
                          <option value="jsonl">JSONL</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Max Samples</label>
                        <input
                          type="number"
                          value={maxSample}
                          onChange={(e) => setMaxSample(Math.max(10, parseInt(e.target.value) || 500))}
                          min={10}
                          max={5000}
                          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] w-[120px]"
                        />
                      </div>
                    </div>
                    <Button onClick={handleRunEDA} isLoading={running} className="btn-glow">
                      <BarChart2 className="h-4 w-4" /> Run Image EDA
                    </Button>
                  </div>
                )}
                {running && (
                  <div className="flex items-center gap-3 mt-4">
                    <div className="h-5 w-5 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
                    <span className="text-sm text-[var(--text-muted)]">Running comprehensive EDA... This may take a minute.</span>
                  </div>
                )}
                {job.status === "failed" && (
                  <p className="text-sm text-red-500 mt-2">{job.error_message}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* EDA Results */}
          {edaResult && (
            <div className="space-y-5">
              {/* Download Buttons */}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" className="btn-glow" onClick={() => downloadFile(`/image/jobs/${job.id}/download-eda-code`, `image_eda_${job.id.slice(0, 8)}.py`, "text/x-python")}>
                  <Code className="h-3.5 w-3.5" /> Download EDA Code (.py)
                </Button>
                <Button variant="secondary" size="sm" className="btn-glow" onClick={() => downloadFile(`/image/jobs/${job.id}/download-eda-report`, `eda_report_${job.id.slice(0, 8)}.txt`, "text/plain")}>
                  <FileText className="h-3.5 w-3.5" /> Download EDA Report
                </Button>
              </div>

              {/* Overview Cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Total Images", value: edaResult.total_images?.toLocaleString(), color: "text-blue-400" },
                  { label: "Classes", value: edaResult.num_classes, color: "text-purple-400" },
                  { label: "Avg Resolution", value: `${edaResult.resolution_stats?.mean_width?.toFixed(0)}×${edaResult.resolution_stats?.mean_height?.toFixed(0)}`, color: "text-cyan-400" },
                  { label: "Duplicates", value: edaResult.duplicate_count, color: edaResult.duplicate_count > 0 ? "text-amber-400" : "text-emerald-400" },
                ].map(s => (
                  <Card key={s.label} className="stat-card-glow">
                    <CardContent className="p-4">
                      <p className="text-xs text-[var(--text-muted)]">{s.label}</p>
                      <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Dataset Info */}
              <Card className="card-hover-glow">
                <CardContent className="p-5">
                  <h3 className="text-sm font-semibold text-[var(--text)] mb-4 flex items-center gap-2">
                    <Info className="h-4 w-4 text-blue-400" /> Dataset Overview
                  </h3>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                    {[
                      { label: "Dataset Hash", value: edaResult.dataset_hash },
                      { label: "Image Formats", value: Object.keys(edaResult.image_formats || {}).join(", ") || "—" },
                      { label: "Color Spaces", value: Object.keys(edaResult.color_spaces || {}).join(", ") || "—" },
                      { label: "Avg File Size", value: `${edaResult.file_size_stats?.mean_kb || 0} KB` },
                      { label: "Suggested Split", value: edaResult.suggested_split || "80/20" },
                      { label: "Samples Analyzed", value: edaResult.sample_size },
                    ].map(s => (
                      <div key={s.label}>
                        <p className="text-xs text-[var(--text-muted)]">{s.label}</p>
                        <p className="text-[var(--text)] font-medium text-xs">{s.value}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Pixel Statistics */}
              {edaResult.pixel_stats && (
                <Card className="card-hover-glow">
                  <CardContent className="p-5">
                    <h3 className="text-sm font-semibold text-[var(--text)] mb-4 flex items-center gap-2">
                      <Zap className="h-4 w-4 text-yellow-400" /> Pixel Statistics
                    </h3>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        { label: "Mean R", value: edaResult.pixel_stats.mean_r, color: "text-red-400" },
                        { label: "Mean G", value: edaResult.pixel_stats.mean_g, color: "text-green-400" },
                        { label: "Mean B", value: edaResult.pixel_stats.mean_b, color: "text-blue-400" },
                        { label: "Global Mean", value: edaResult.pixel_stats.global_mean, color: "text-[var(--text)]" },
                        { label: "Std R", value: edaResult.pixel_stats.std_r, color: "text-red-400" },
                        { label: "Std G", value: edaResult.pixel_stats.std_g, color: "text-green-400" },
                        { label: "Std B", value: edaResult.pixel_stats.std_b, color: "text-blue-400" },
                        { label: "Global Std", value: edaResult.pixel_stats.global_std, color: "text-[var(--text)]" },
                      ].map(s => (
                        <div key={s.label} className="rounded-lg bg-[var(--bg)] p-3">
                          <p className="text-xs text-[var(--text-muted)]">{s.label}</p>
                          <p className={`text-lg font-bold ${s.color}`}>{typeof s.value === 'number' ? s.value.toFixed(1) : s.value}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Class Distribution */}
              <Card className="card-hover-glow">
                <CardContent className="p-5">
                  <h3 className="text-sm font-semibold text-[var(--text)] mb-2 flex items-center gap-2">
                    <BarChart2 className="h-4 w-4 text-blue-400" /> Class Distribution
                  </h3>
                  {edaResult.imbalance_ratio > 1 && (
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant={edaResult.imbalance_ratio > 3 ? "error" : edaResult.imbalance_ratio > 1.5 ? "processing" : "success"}>
                        Imbalance Ratio: {edaResult.imbalance_ratio}:1
                      </Badge>
                      {edaResult.minority_classes?.length > 0 && (
                        <span className="text-xs text-amber-400">⚠ Minority: {edaResult.minority_classes.join(", ")}</span>
                      )}
                    </div>
                  )}
                  <div className="space-y-3">
                    {Object.entries(edaResult.class_distribution || {})
                      .sort(([, a]: any, [, b]: any) => b - a)
                      .map(([cls, count]: [string, any]) => {
                        const pct = (count / edaResult.total_images) * 100;
                        return (
                          <div key={cls}>
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span className="text-[var(--text)] font-medium">{cls}</span>
                              <span className="text-[var(--text-muted)]">{count} ({pct.toFixed(1)}%)</span>
                            </div>
                            <div className="h-2.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                              <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, delay: 0.1 }}
                                className="h-full rounded-full bg-gradient-to-r from-blue-600 via-purple-500 to-cyan-500" />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>

              {/* Label Encoding */}
              {edaResult.label_encoding && (
                <Card className="card-hover-glow">
                  <CardContent className="p-5">
                    <h3 className="text-sm font-semibold text-[var(--text)] mb-3 flex items-center gap-2">
                      <Code className="h-4 w-4 text-cyan-400" /> Label Encoding
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(edaResult.label_encoding).map(([cls, idx]: [string, any]) => (
                        <span key={cls} className="text-xs px-2.5 py-1 rounded-full bg-[var(--bg)] text-[var(--text)] border border-[var(--border)]">
                          {cls} → <span className="font-mono text-[var(--primary)]">{idx}</span>
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Resolution Stats */}
              {edaResult.resolution_stats && (
                <Card className="card-hover-glow">
                  <CardContent className="p-5">
                    <h3 className="text-sm font-semibold text-[var(--text)] mb-4 flex items-center gap-2">
                      <Image className="h-4 w-4 text-purple-400" /> Resolution Distribution
                    </h3>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {[
                        { label: "Min Width", value: edaResult.resolution_stats.min_width },
                        { label: "Max Width", value: edaResult.resolution_stats.max_width },
                        { label: "Avg Width", value: edaResult.resolution_stats.mean_width?.toFixed(0) },
                        { label: "Min Height", value: edaResult.resolution_stats.min_height },
                        { label: "Max Height", value: edaResult.resolution_stats.max_height },
                        { label: "Avg Height", value: edaResult.resolution_stats.mean_height?.toFixed(0) },
                      ].map(s => (
                        <div key={s.label} className="rounded-lg bg-[var(--bg)] p-3">
                          <p className="text-xs text-[var(--text-muted)]">{s.label}</p>
                          <p className="text-lg font-bold text-[var(--text)]">{s.value}px</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Blur Detection */}
              {edaResult.blur_stats && (
                <Card className="card-hover-glow">
                  <CardContent className="p-5">
                    <h3 className="text-sm font-semibold text-[var(--text)] mb-4 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-400" /> Image Quality — Blur Detection
                    </h3>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4">
                      <div className="rounded-lg bg-[var(--bg)] p-3">
                        <p className="text-xs text-[var(--text-muted)]">Blurry Images</p>
                        <p className="text-lg font-bold text-amber-400">{edaResult.blur_stats.blurry_count}</p>
                      </div>
                      <div className="rounded-lg bg-[var(--bg)] p-3">
                        <p className="text-xs text-[var(--text-muted)]">Blurry %</p>
                        <p className="text-lg font-bold text-[var(--text)]">{edaResult.blur_stats.blurry_pct}%</p>
                      </div>
                      <div className="rounded-lg bg-[var(--bg)] p-3">
                        <p className="text-xs text-[var(--text-muted)]">Avg Score</p>
                        <p className="text-lg font-bold text-[var(--text)]">{edaResult.blur_stats.mean_score}</p>
                      </div>
                      <div className="rounded-lg bg-[var(--bg)] p-3">
                        <p className="text-xs text-[var(--text-muted)]">Threshold</p>
                        <p className="text-lg font-bold text-[var(--text)]">{edaResult.blur_stats.threshold}</p>
                      </div>
                    </div>
                    {edaResult.blur_stats.worst_10?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Worst Blur Scores</p>
                        <div className="space-y-1">
                          {edaResult.blur_stats.worst_10.map(([name, score]: [string, number], i: number) => (
                            <div key={i} className="flex items-center justify-between text-sm">
                              <span className="text-[var(--text-muted)] truncate max-w-[200px]">{name}</span>
                              <span className={`font-mono ${score < edaResult.blur_stats.threshold ? 'text-red-400' : 'text-[var(--text-muted)]'}`}>
                                {score}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Corrupt Images */}
              {edaResult.corrupt_count > 0 && (
                <Card className="card-hover-glow border-red-500/20">
                  <CardContent className="p-5">
                    <h3 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" /> Corrupt Images ({edaResult.corrupt_count})
                    </h3>
                    <div className="space-y-1">
                      {edaResult.corrupt_images?.slice(0, 10).map((img: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-[var(--text-muted)] truncate max-w-[200px]">{img.file}</span>
                          <span className="text-xs text-red-400 truncate max-w-[200px]">{img.error}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Duplicate Detection */}
              <Card className="card-hover-glow">
                <CardContent className="p-5">
                  <h3 className="text-sm font-semibold text-[var(--text)] mb-4 flex items-center gap-2">
                    <Copy className="h-4 w-4 text-emerald-400" /> Duplicate Detection
                  </h3>
                  <div className="flex items-center gap-4">
                    {edaResult.duplicate_count === 0 ? (
                      <div className="flex items-center gap-2 text-emerald-400">
                        <CheckCircle2 className="h-5 w-5" />
                        <span className="text-sm font-medium">No duplicate images detected</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-amber-400">
                        <AlertTriangle className="h-5 w-5" />
                        <span className="text-sm font-medium">{edaResult.duplicate_count} duplicate(s) found in {edaResult.duplicate_groups} group(s)</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Preprocessing Recommendations */}
              {edaResult.recommendations?.length > 0 && (
                <Card className="card-hover-glow">
                  <CardContent className="p-5">
                    <h3 className="text-sm font-semibold text-[var(--text)] mb-3 flex items-center gap-2">
                      <Zap className="h-4 w-4 text-yellow-400" /> Preprocessing Recommendations
                    </h3>
                    <div className="space-y-2">
                      {edaResult.recommendations.map((rec: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-[var(--primary)] font-mono text-xs mt-0.5">{i + 1}.</span>
                          <span className="text-[var(--text-muted)]">{rec}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Risk Assessment */}
              {edaResult.risk_assessment && (
                <Card className={`card-hover-glow ${edaResult.risk_assessment.level === 'HIGH' ? 'border-red-500/20' : edaResult.risk_assessment.level === 'MEDIUM' ? 'border-amber-500/20' : 'border-emerald-500/20'}`}>
                  <CardContent className="p-5">
                    <h3 className="text-sm font-semibold text-[var(--text)] mb-3 flex items-center gap-2">
                      <Shield className="h-4 w-4 text-blue-400" /> Risk Assessment
                    </h3>
                    <Badge variant={edaResult.risk_assessment.level === 'HIGH' ? 'error' : edaResult.risk_assessment.level === 'MEDIUM' ? 'processing' : 'success'} className="mb-3">
                      {edaResult.risk_assessment.level} RISK
                    </Badge>
                    <div className="space-y-1.5">
                      {edaResult.risk_assessment.factors?.map((factor: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-[var(--text-muted)]">•</span>
                          <span className="text-[var(--text-muted)]">{factor}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Metadata */}
              {edaResult.metadata_samples?.length > 0 && (
                <Card className="card-hover-glow">
                  <CardContent className="p-5">
                    <h3 className="text-sm font-semibold text-[var(--text)] mb-3 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-indigo-400" /> Image Metadata (EXIF Samples)
                    </h3>
                    <div className="space-y-3">
                      {edaResult.metadata_samples.map((meta: any, i: number) => (
                        <div key={i} className="rounded-lg bg-[var(--bg)] p-3">
                          <p className="text-xs font-medium text-[var(--text)] mb-1">{meta.file}</p>
                          <div className="grid grid-cols-2 gap-1">
                            {Object.entries(meta.exif || {}).slice(0, 6).map(([k, v]: [string, any]) => (
                              <p key={k} className="text-[10px] text-[var(--text-muted)]"><span className="font-medium">{k}:</span> {v}</p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Domain Analysis Section */}
              {edaResult && (
                <Card className="card-hover-glow border-[var(--border)]">
                  <CardContent className="p-5">
                    <h3 className="text-sm font-semibold text-[var(--text)] mb-4 flex items-center gap-2">
                      <Activity className="h-4 w-4 text-indigo-400" /> Domain-Specific Analysis
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] mb-4">
                      Run specialized analysis on your dataset. Requires EDA to be completed first.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* AgriTech */}
                      <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Leaf className="h-4 w-4 text-green-400" />
                          <span className="text-sm font-semibold text-[var(--text)]">AgriTech Analysis</span>
                        </div>
                        <p className="text-xs text-[var(--text-muted)] mb-3">
                          Crop disease detection, pest analysis, health scoring, treatment recommendations
                        </p>
                        <Button
                          size="sm"
                          onClick={() => handleRunDomain("agritech")}
                          isLoading={runningAgritech}
                          className="w-full bg-green-600 hover:bg-green-700 text-white"
                        >
                          <Leaf className="h-3.5 w-3.5" /> {edaResult.agritech ? "Re-run" : "Run"} AgriTech
                        </Button>
                        {edaResult.agritech && (
                          <div className="mt-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="success" className="text-[10px]">Complete</Badge>
                              <span className="text-xs text-[var(--text-muted)]">
                                Health Score: {edaResult.agritech.overall_health_score?.toFixed(1)}%
                              </span>
                            </div>
                            <div className="flex gap-2">
                              <Button variant="secondary" size="sm" className="flex-1 text-xs" onClick={() => downloadFile(`/image/jobs/${job.id}/download-agritech-report`, `agritech_report_${job.id.slice(0, 8)}.txt`, "text/plain")}>
                                <FileText className="h-3 w-3" /> Report
                              </Button>
                              <Button variant="secondary" size="sm" className="flex-1 text-xs" onClick={() => downloadFile(`/image/jobs/${job.id}/download-agritech-code`, `agritech_analysis_${job.id.slice(0, 8)}.py`, "text/x-python")}>
                                <Code className="h-3 w-3" /> Code
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* MediTech */}
                      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <HeartPulse className="h-4 w-4 text-red-400" />
                          <span className="text-sm font-semibold text-[var(--text)]">MediTech Analysis</span>
                        </div>
                        <p className="text-xs text-[var(--text-muted)] mb-3">
                          Medical image analysis, anomaly detection, severity scoring, clinical insights
                        </p>
                        <Button
                          size="sm"
                          onClick={() => handleRunDomain("meditech")}
                          isLoading={runningMeditech}
                          className="w-full bg-red-600 hover:bg-red-700 text-white"
                        >
                          <HeartPulse className="h-3.5 w-3.5" /> {edaResult.meditech ? "Re-run" : "Run"} MediTech
                        </Button>
                        {edaResult.meditech && (
                          <div className="mt-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="success" className="text-[10px]">Complete</Badge>
                              <span className="text-xs text-[var(--text-muted)]">
                                Severity: {edaResult.meditech.overall_severity?.toFixed(1)}%
                              </span>
                            </div>
                            <div className="flex gap-2">
                              <Button variant="secondary" size="sm" className="flex-1 text-xs" onClick={() => downloadFile(`/image/jobs/${job.id}/download-meditech-report`, `meditech_report_${job.id.slice(0, 8)}.txt`, "text/plain")}>
                                <FileText className="h-3 w-3" /> Report
                              </Button>
                              <Button variant="secondary" size="sm" className="flex-1 text-xs" onClick={() => downloadFile(`/image/jobs/${job.id}/download-meditech-code`, `meditech_analysis_${job.id.slice(0, 8)}.py`, "text/x-python")}>
                                <Code className="h-3 w-3" /> Code
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* AgriTech Results */}
              {edaResult?.agritech && (
                <Card className="card-hover-glow border-green-500/20">
                  <CardContent className="p-5">
                    <h3 className="text-sm font-semibold text-[var(--text)] mb-4 flex items-center gap-2">
                      <Leaf className="h-4 w-4 text-green-400" /> AgriTech Analysis Results
                    </h3>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4">
                      {[
                        { label: "Health Score", value: `${edaResult.agritech.overall_health_score?.toFixed(1)}%`, color: edaResult.agritech.overall_health_score > 70 ? "text-green-400" : edaResult.agritech.overall_health_score > 40 ? "text-amber-400" : "text-red-400" },
                        { label: "Classes Analyzed", value: Object.keys(edaResult.agritech.health_scores || {}).length, color: "text-blue-400" },
                        { label: "Disease Matches", value: edaResult.agritech.knowledge_base_matches?.length || 0, color: "text-purple-400" },
                        { label: "Risk Level", value: (edaResult.agritech.severity_summary?.critical_classes?.length || 0) > 0 ? "HIGH" : (edaResult.agritech.severity_summary?.warning_classes?.length || 0) > 0 ? "MEDIUM" : "LOW", color: (edaResult.agritech.severity_summary?.critical_classes?.length || 0) > 0 ? "text-red-400" : "text-amber-400" },
                      ].map(s => (
                        <div key={s.label} className="rounded-lg bg-[var(--bg)] p-3">
                          <p className="text-xs text-[var(--text-muted)]">{s.label}</p>
                          <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                        </div>
                      ))}
                    </div>
                    {edaResult.agritech.knowledge_base_matches?.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Disease/Pest Matches</p>
                        <div className="space-y-2">
                          {edaResult.agritech.knowledge_base_matches.map((match: any, i: number) => (
                            <div key={i} className="rounded-lg bg-green-500/5 border border-green-500/10 p-3">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-[var(--text)]">{match.disease || match.name}</span>
                                <Badge variant="processing" className="text-[10px]">{(match.confidence * 100).toFixed(0)}% match</Badge>
                              </div>
                              {match.treatment && <p className="text-xs text-[var(--text-muted)]">Treatment: {match.treatment}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {edaResult.agritech.recommendations?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Recommendations</p>
                        <div className="space-y-1">
                          {edaResult.agritech.recommendations.map((rec: string, i: number) => (
                            <div key={i} className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
                              <span className="text-green-400">•</span> {rec}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* MediTech Results */}
              {edaResult?.meditech && (
                <Card className="card-hover-glow border-red-500/20">
                  <CardContent className="p-5">
                    <h3 className="text-sm font-semibold text-[var(--text)] mb-4 flex items-center gap-2">
                      <HeartPulse className="h-4 w-4 text-red-400" /> MediTech Analysis Results
                    </h3>
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 mb-4">
                      <p className="text-[10px] text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Medical Disclaimer: This analysis is for research purposes only. Not for clinical diagnosis.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4">
                      {[
                        { label: "Severity Score", value: `${edaResult.meditech.overall_severity?.toFixed(1)}%`, color: edaResult.meditech.overall_severity > 60 ? "text-red-400" : edaResult.meditech.overall_severity > 30 ? "text-amber-400" : "text-green-400" },
                        { label: "Classes Analyzed", value: Object.keys(edaResult.meditech.severity_scores || {}).length, color: "text-blue-400" },
                        { label: "Anomalies Found", value: edaResult.meditech.knowledge_base_matches?.length || 0, color: "text-purple-400" },
                        { label: "Risk Level", value: edaResult.meditech.urgency_level || "N/A", color: edaResult.meditech.urgency_level === "HIGH" ? "text-red-400" : "text-amber-400" },
                      ].map(s => (
                        <div key={s.label} className="rounded-lg bg-[var(--bg)] p-3">
                          <p className="text-xs text-[var(--text-muted)]">{s.label}</p>
                          <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                        </div>
                      ))}
                    </div>
                    {edaResult.meditech.knowledge_base_matches?.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Condition Matches</p>
                        <div className="space-y-2">
                          {edaResult.meditech.knowledge_base_matches.map((match: any, i: number) => (
                            <div key={i} className="rounded-lg bg-red-500/5 border border-red-500/10 p-3">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-[var(--text)]">{match.condition || match.name}</span>
                                <Badge variant="processing" className="text-[10px]">{(match.confidence * 100).toFixed(0)}% match</Badge>
                              </div>
                              {match.severity && <p className="text-xs text-[var(--text-muted)]">Severity: {match.severity}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {edaResult.meditech.recommendations?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Clinical Recommendations</p>
                        <div className="space-y-1">
                          {edaResult.meditech.recommendations.map((rec: string, i: number) => (
                            <div key={i} className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
                              <span className="text-red-400">•</span> {rec}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Continue to Pipeline */}
              <div className="flex justify-end">
                <Button onClick={() => router.push(`/projects/${id}/image-pipeline${job ? `?edaJobId=${job.id}` : ''}`)} className="btn-glow">
                  Continue to Image Pipeline →
                </Button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
