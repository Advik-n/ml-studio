"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Image, Upload, BarChart2, Eye, AlertTriangle, Copy, CheckCircle2, Download, FileText, Code,
  Shield, Zap, Info, Leaf, HeartPulse, Bug, Microscope, Activity, Layers, TrendingDown,
  TrendingUp, Target, Beaker, ArrowRight, ChevronDown, ChevronUp,
} from "lucide-react";
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

type DomainTab = "general" | "agritech" | "meditech";

/* ── Chart component ──────────────────────────────────────────────────────── */
function ChartImage({ base64, alt, className }: { base64?: string; alt: string; className?: string }) {
  if (!base64) return null;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={className}>
      <img src={`data:image/png;base64,${base64}`} alt={alt} className="w-full rounded-lg" />
    </motion.div>
  );
}

/* ── Collapsible section ──────────────────────────────────────────────────── */
function Section({ title, icon, children, defaultOpen = true, accent }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean; accent?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className={`card-hover-glow ${accent || ""}`}>
      <CardContent className="p-0">
        <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-5 text-left">
          <h3 className="text-sm font-semibold text-[var(--text)] flex items-center gap-2">{icon} {title}</h3>
          {open ? <ChevronUp className="h-4 w-4 text-[var(--text-muted)]" /> : <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />}
        </button>
        <AnimatePresence>
          {open && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="px-5 pb-5">{children}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

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
  const domainParam = searchParams.get("domain") as DomainTab | null;
  const [domainTab, setDomainTab] = useState<DomainTab>(domainParam === "agritech" || domainParam === "meditech" ? domainParam : "general");

  const fetchData = useCallback(async () => {
    try {
      const [userData, projRes] = await Promise.all([getCurrentUser(), api.get<Project>(`/projects/${id}`)]);
      setUser(userData);
      setProject(projRes.data);
      try {
        const jobsRes = await api.get(`/image/${id}/jobs`);
        const jobsList = Array.isArray(jobsRes.data) ? jobsRes.data : [];
        // Look for EDA jobs first, then fall back to any job with eda_report (legacy)
        const edaJobs = jobsList.filter((j: any) => j.job_type === "image_eda");
        const legacyJobs = jobsList.filter((j: any) => j.eda_report && j.status === "completed");
        const candidates = edaJobs.length > 0 ? edaJobs : legacyJobs;
        if (candidates.length > 0) {
          const latest = candidates[0];
          setJob(latest);
          if (latest.status === "completed" && latest.eda_report) setEdaResult(latest.eda_report);
        }
      } catch (err) { console.error("Failed to fetch image jobs:", err); }
    } catch { router.push("/dashboard"); } finally { setLoading(false); }
  }, [id, router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024 * 1024) { toast.error("File too large. Maximum 500MB."); return; }
    setUploading(true); setUploadProgress(0);
    try {
      const formData = new FormData(); formData.append("file", file);
      const res = await api.post(`/image/${id}/upload`, formData, {
        timeout: 300000, onUploadProgress: (e) => { if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100)); },
      });
      setJob(res.data); toast.success("Dataset uploaded successfully!");
    } catch (err: unknown) { toast.error(extractApiError(err, "Upload failed")); }
    finally { setUploading(false); setUploadProgress(0); }
  };

  const handleRunEDA = async () => {
    if (!job) return; setRunning(true);
    try {
      const res = await api.post(`/image/jobs/${job.id}/run-eda`, { file_type: fileType, max_sample: maxSample }, { timeout: 600000 });
      setJob(res.data);
      if (res.data.eda_report) setEdaResult(res.data.eda_report);
    } catch (err: unknown) { toast.error(extractApiError(err, "EDA failed")); }
    finally { setRunning(false); }
  };

  const handleRunDomain = async (dt: "agritech" | "meditech") => {
    if (!job) return;
    const setter = dt === "agritech" ? setRunningAgritech : setRunningMeditech;
    setter(true);
    try {
      const res = await api.post(`/image/jobs/${job.id}/run-${dt}`, { domain: dt }, { timeout: 600000 });
      setJob(res.data);
      if (res.data.eda_report) setEdaResult(res.data.eda_report);
      toast.success(`${dt === "agritech" ? "AgriTech" : "MediTech"} analysis complete!`);
    } catch (err: unknown) { toast.error(extractApiError(err, `${dt} analysis failed`)); }
    finally { setter(false); }
  };

  const downloadFile = async (endpoint: string, filename: string, type: string) => {
    try {
      const res = await api.get(endpoint, { responseType: "blob" });
      const blob = new Blob([res.data], { type });
      const link = document.createElement("a"); link.href = URL.createObjectURL(blob);
      link.download = filename; link.click(); URL.revokeObjectURL(link.href);
      toast.success(`Downloaded ${filename}`);
    } catch { toast.error("Download failed"); }
  };

  if (loading || !project) {
    return <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center"><div className="h-8 w-8 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" /></div>;
  }

  const charts = edaResult?.charts || {};

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar userName={user?.name || user?.username} />
      <div className="flex">
        <Sidebar projectId={id} projectName={project.name} projectType="image" />
        <main className="flex-1 p-6 max-w-6xl">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-xl font-bold text-[var(--text)] flex items-center gap-2">
              <motion.div whileHover={{ rotate: 10 }}><Eye className="h-5 w-5 text-orange-500" /></motion.div>
              Image EDA
            </h1>
            <p className="text-sm text-[var(--text-muted)]">Comprehensive image dataset analysis</p>
          </div>

          {/* Domain Tab Selector */}
          <div className="mb-6">
            <div className="flex gap-1 p-1 rounded-xl bg-[var(--surface)] border border-[var(--border)] w-fit">
              {([
                { key: "general" as DomainTab, label: "General", icon: <Layers className="h-3.5 w-3.5" />, color: "text-violet-400" },
                { key: "agritech" as DomainTab, label: "AgriTech", icon: <Leaf className="h-3.5 w-3.5" />, color: "text-green-400" },
                { key: "meditech" as DomainTab, label: "MediTech", icon: <HeartPulse className="h-3.5 w-3.5" />, color: "text-red-400" },
              ]).map(tab => (
                <button key={tab.key} onClick={() => setDomainTab(tab.key)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                    domainTab === tab.key
                      ? "bg-[var(--primary)] text-white shadow-md"
                      : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]"
                  }`}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Upload Section — shown when no job exists, or as a compact re-upload option */}
          {!job ? (
            <Card className="mb-6 card-hover-glow">
              <CardContent className="p-6">
                <div className="flex flex-col items-center justify-center py-8">
                  <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
                    <Upload className="h-12 w-12 text-[var(--text-muted)] mb-4" />
                  </motion.div>
                  <p className="text-[var(--text)] font-medium mb-2">Upload Image Dataset</p>
                  <p className="text-sm text-[var(--text-muted)] mb-2 text-center max-w-md">
                    Upload a ZIP file — supports class folders, flat directories, train/test splits, and nested structures
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mb-4">JPG, PNG, BMP, TIFF, WebP, GIF, HEIC, RAW</p>
                  {!uploading ? (
                    <label className="cursor-pointer inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-all btn-glow">
                      <input type="file" accept=".zip" onChange={handleUpload} className="hidden" /> <Upload className="h-4 w-4" /> Select ZIP File
                    </label>
                  ) : (
                    <div className="w-full max-w-xs">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-[var(--text)]">Uploading...</span>
                        <span className="text-[var(--text-muted)]">{uploadProgress}%</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${uploadProgress}%` }}
                          className="h-full rounded-full bg-gradient-to-r from-blue-600 via-purple-500 to-cyan-500" />
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : edaResult && (
            <div className="mb-4 flex items-center justify-between p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-xs text-[var(--text-muted)]">Dataset loaded • Job {job.id.slice(0, 8)}... • {edaResult.total_images} images • {edaResult.num_classes} classes</span>
              </div>
              <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
                <input type="file" accept=".zip" onChange={handleUpload} className="hidden" />
                <Upload className="h-3.5 w-3.5" /> Upload New Dataset
              </label>
            </div>
          )}

          {/* Job Status (before EDA run) */}
          {job && !edaResult && (
            <Card className="mb-6 card-hover-glow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="font-medium text-[var(--text)]">Dataset Uploaded</p>
                    <p className="text-sm text-[var(--text-muted)]">Job ID: {job.id.slice(0, 8)}...</p>
                  </div>
                  <Badge variant={job.status === "completed" ? "success" : job.status === "failed" ? "error" : "processing"}>{job.status}</Badge>
                </div>
                {job.status === "pending" && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">File Type</label>
                        <select value={fileType} onChange={(e) => setFileType(e.target.value)}
                          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] min-w-[140px]">
                          {["image", "csv", "txt", "json", "tsv", "parquet", "jsonl"].map(t => (
                            <option key={t} value={t}>{t.toUpperCase()}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Max Samples</label>
                        <input type="number" value={maxSample} onChange={(e) => setMaxSample(Math.max(10, parseInt(e.target.value) || 500))}
                          min={10} max={5000}
                          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] w-[120px]" />
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
                {job.status === "failed" && <p className="text-sm text-red-500 mt-2">{job.error_message}</p>}
              </CardContent>
            </Card>
          )}

          {/* ══════════════════ EDA RESULTS ══════════════════ */}
          {edaResult && (
            <div className="space-y-5">

              {/* Download Bar */}
              <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                <span className="text-xs font-medium text-[var(--text-muted)] flex items-center gap-1 mr-2"><Download className="h-3.5 w-3.5" /> Downloads:</span>
                <Button variant="secondary" size="sm" onClick={() => downloadFile(`/image/jobs/${job.id}/download-eda-code`, `image_eda_${job.id.slice(0, 8)}.py`, "text/x-python")}>
                  <Code className="h-3.5 w-3.5" /> EDA Code
                </Button>
                <Button variant="secondary" size="sm" onClick={() => downloadFile(`/image/jobs/${job.id}/download-eda-report`, `eda_report_${job.id.slice(0, 8)}.txt`, "text/plain")}>
                  <FileText className="h-3.5 w-3.5" /> EDA Report
                </Button>
                {edaResult.agritech && (
                  <>
                    <Button variant="secondary" size="sm" className="border-green-500/20" onClick={() => downloadFile(`/image/jobs/${job.id}/download-agritech-report`, `agritech_report.txt`, "text/plain")}>
                      <Leaf className="h-3.5 w-3.5 text-green-400" /> AgriTech Report
                    </Button>
                    <Button variant="secondary" size="sm" className="border-green-500/20" onClick={() => downloadFile(`/image/jobs/${job.id}/download-agritech-code`, `agritech_code.py`, "text/x-python")}>
                      <Code className="h-3.5 w-3.5 text-green-400" /> AgriTech Code
                    </Button>
                  </>
                )}
                {edaResult.meditech && (
                  <>
                    <Button variant="secondary" size="sm" className="border-red-500/20" onClick={() => downloadFile(`/image/jobs/${job.id}/download-meditech-report`, `meditech_report.txt`, "text/plain")}>
                      <HeartPulse className="h-3.5 w-3.5 text-red-400" /> MediTech Report
                    </Button>
                    <Button variant="secondary" size="sm" className="border-red-500/20" onClick={() => downloadFile(`/image/jobs/${job.id}/download-meditech-code`, `meditech_code.py`, "text/x-python")}>
                      <Code className="h-3.5 w-3.5 text-red-400" /> MediTech Code
                    </Button>
                  </>
                )}
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

              {/* ── GENERAL TAB ────────────────────────────────────────── */}
              {domainTab === "general" && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">

                  {/* Dataset Info */}
                  <Section title="Dataset Overview" icon={<Info className="h-4 w-4 text-blue-400" />}>
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
                  </Section>

                  {/* Pixel Statistics + Chart */}
                  {edaResult.pixel_stats && (
                    <Section title="Pixel Statistics" icon={<Zap className="h-4 w-4 text-yellow-400" />}>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4">
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
                      <ChartImage base64={charts.pixel_stats} alt="Pixel Statistics Chart" />
                    </Section>
                  )}

                  {/* Class Distribution + Chart */}
                  <Section title="Class Distribution" icon={<BarChart2 className="h-4 w-4 text-blue-400" />}>
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
                    <div className="space-y-3 mb-4">
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <ChartImage base64={charts.class_distribution} alt="Class Distribution Chart" />
                      <ChartImage base64={charts.class_balance} alt="Class Balance Chart" />
                    </div>
                  </Section>

                  {/* Label Encoding */}
                  {edaResult.label_encoding && (
                    <Section title="Label Encoding" icon={<Code className="h-4 w-4 text-cyan-400" />} defaultOpen={false}>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(edaResult.label_encoding).map(([cls, idx]: [string, any]) => (
                          <span key={cls} className="text-xs px-2.5 py-1 rounded-full bg-[var(--bg)] text-[var(--text)] border border-[var(--border)]">
                            {cls} → <span className="font-mono text-[var(--primary)]">{idx}</span>
                          </span>
                        ))}
                      </div>
                    </Section>
                  )}

                  {/* Resolution + Chart */}
                  {edaResult.resolution_stats && (
                    <Section title="Resolution Distribution" icon={<Image className="h-4 w-4 text-purple-400" />}>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-4">
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
                      <ChartImage base64={charts.resolution} alt="Resolution Chart" />
                    </Section>
                  )}

                  {/* Image Quality + Chart */}
                  <Section title="Image Quality" icon={<AlertTriangle className="h-4 w-4 text-amber-400" />}>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4">
                      {edaResult.blur_stats && [
                        { label: "Blurry Images", value: edaResult.blur_stats.blurry_count, color: "text-amber-400" },
                        { label: "Blurry %", value: `${edaResult.blur_stats.blurry_pct}%`, color: "text-[var(--text)]" },
                        { label: "Avg Score", value: edaResult.blur_stats.mean_score, color: "text-[var(--text)]" },
                        { label: "Threshold", value: edaResult.blur_stats.threshold, color: "text-[var(--text)]" },
                      ].map(s => (
                        <div key={s.label} className="rounded-lg bg-[var(--bg)] p-3">
                          <p className="text-xs text-[var(--text-muted)]">{s.label}</p>
                          <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                        </div>
                      ))}
                    </div>
                    <ChartImage base64={charts.quality} alt="Quality Overview Chart" className="mb-4" />
                    {/* Corrupt */}
                    {edaResult.corrupt_count > 0 && (
                      <div className="rounded-lg border border-red-500/20 p-3 mb-3">
                        <p className="text-xs font-medium text-red-400 mb-1">⚠ {edaResult.corrupt_count} Corrupt Image(s)</p>
                        {edaResult.corrupt_images?.slice(0, 5).map((img: any, i: number) => (
                          <p key={i} className="text-[10px] text-[var(--text-muted)]">{img.file}: {img.error}</p>
                        ))}
                      </div>
                    )}
                    {/* Duplicates */}
                    <div className="flex items-center gap-2">
                      {edaResult.duplicate_count === 0 ? (
                        <><CheckCircle2 className="h-4 w-4 text-emerald-400" /><span className="text-sm text-emerald-400">No duplicates detected</span></>
                      ) : (
                        <><AlertTriangle className="h-4 w-4 text-amber-400" /><span className="text-sm text-amber-400">{edaResult.duplicate_count} duplicate(s) in {edaResult.duplicate_groups} group(s)</span></>
                      )}
                    </div>
                  </Section>

                  {/* Recommendations */}
                  {edaResult.recommendations?.length > 0 && (
                    <Section title="Preprocessing Recommendations" icon={<Zap className="h-4 w-4 text-yellow-400" />}>
                      <div className="space-y-2">
                        {edaResult.recommendations.map((rec: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-sm">
                            <span className="text-[var(--primary)] font-mono text-xs mt-0.5">{i + 1}.</span>
                            <span className="text-[var(--text-muted)]">{rec}</span>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                  {/* Risk Assessment */}
                  {edaResult.risk_assessment && (
                    <Section title="Risk Assessment" icon={<Shield className="h-4 w-4 text-blue-400" />}
                      accent={edaResult.risk_assessment.level === 'HIGH' ? 'border-red-500/20' : edaResult.risk_assessment.level === 'MEDIUM' ? 'border-amber-500/20' : 'border-emerald-500/20'}>
                      <Badge variant={edaResult.risk_assessment.level === 'HIGH' ? 'error' : edaResult.risk_assessment.level === 'MEDIUM' ? 'processing' : 'success'} className="mb-3">
                        {edaResult.risk_assessment.level} RISK
                      </Badge>
                      <div className="space-y-1.5">
                        {edaResult.risk_assessment.factors?.map((factor: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-sm"><span className="text-[var(--text-muted)]">•</span><span className="text-[var(--text-muted)]">{factor}</span></div>
                        ))}
                      </div>
                    </Section>
                  )}

                  {/* Metadata */}
                  {edaResult.metadata_samples?.length > 0 && (
                    <Section title="Image Metadata (EXIF)" icon={<FileText className="h-4 w-4 text-indigo-400" />} defaultOpen={false}>
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
                    </Section>
                  )}
                </motion.div>
              )}

              {/* ── AGRITECH TAB ───────────────────────────────────────── */}
              {domainTab === "agritech" && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
                  {/* Run Button */}
                  {!edaResult.agritech && (
                    <Card className="border-green-500/20 bg-green-500/5">
                      <CardContent className="p-6 text-center">
                        <Leaf className="h-10 w-10 text-green-400 mx-auto mb-3" />
                        <h3 className="font-semibold text-[var(--text)] mb-2">Run AgriTech Analysis</h3>
                        <p className="text-xs text-[var(--text-muted)] mb-4 max-w-md mx-auto">
                          Analyze your dataset for crop diseases, pest damage, environmental stress, and generate comprehensive health reports with treatment recommendations.
                        </p>
                        <Button onClick={() => handleRunDomain("agritech")} isLoading={runningAgritech}
                          className="bg-green-600 hover:bg-green-700 text-white">
                          <Leaf className="h-4 w-4" /> Run AgriTech Analysis
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  {/* Results */}
                  {edaResult.agritech && (
                    <>
                      {/* Dataset Summary */}
                      <Section title="Dataset Summary" icon={<Info className="h-4 w-4 text-green-400" />} accent="border-green-500/10">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                          <div><p className="text-xs text-[var(--text-muted)]">Total Images</p><p className="text-[var(--text)] font-medium text-xs">{edaResult.total_images}</p></div>
                          <div><p className="text-xs text-[var(--text-muted)]">Number of Classes</p><p className="text-[var(--text)] font-medium text-xs">{edaResult.num_classes}</p></div>
                          <div><p className="text-xs text-[var(--text-muted)]">Domain</p><p className="text-[var(--text)] font-medium text-xs">Agriculture / Crop Science</p></div>
                          <div><p className="text-xs text-[var(--text-muted)]">Healthy Classes</p><p className="text-green-400 font-medium text-xs">{edaResult.agritech.severity_summary?.healthy_classes?.length || 0}</p></div>
                          <div><p className="text-xs text-[var(--text-muted)]">Warning Classes</p><p className="text-amber-400 font-medium text-xs">{edaResult.agritech.severity_summary?.warning_classes?.length || 0}</p></div>
                          <div><p className="text-xs text-[var(--text-muted)]">Critical Classes</p><p className="text-red-400 font-medium text-xs">{edaResult.agritech.severity_summary?.critical_classes?.length || 0}</p></div>
                        </div>
                        <p className="text-xs text-[var(--text-muted)] mt-3 leading-relaxed">
                          This dataset contains {edaResult.total_images} crop/plant images across {edaResult.num_classes} classes.
                          The AgriTech analysis evaluates each class for disease symptoms, pest damage, and environmental stress
                          using color profile analysis, texture irregularity detection, and pattern matching against a comprehensive
                          knowledge base of known crop diseases and conditions.
                        </p>
                      </Section>

                      {/* Summary Cards */}
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {[
                          { label: "Health Score", value: `${edaResult.agritech.overall_health_score?.toFixed(1)}%`, color: edaResult.agritech.overall_health_score > 70 ? "text-green-400" : edaResult.agritech.overall_health_score > 40 ? "text-amber-400" : "text-red-400" },
                          { label: "Classes", value: Object.keys(edaResult.agritech.health_scores || {}).length, color: "text-blue-400" },
                          { label: "Disease Matches", value: edaResult.agritech.knowledge_base_matches?.length || 0, color: "text-purple-400" },
                          { label: "Risk Level", value: (edaResult.agritech.severity_summary?.critical_classes?.length || 0) > 0 ? "HIGH" : "MODERATE", color: (edaResult.agritech.severity_summary?.critical_classes?.length || 0) > 0 ? "text-red-400" : "text-amber-400" },
                        ].map(s => (
                          <Card key={s.label} className="stat-card-glow border-green-500/10">
                            <CardContent className="p-4">
                              <p className="text-xs text-[var(--text-muted)]">{s.label}</p>
                              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>

                      {/* Health Scores Chart */}
                      <Section title="Health Scores by Class" icon={<TrendingUp className="h-4 w-4 text-green-400" />} accent="border-green-500/10">
                        <ChartImage base64={edaResult.agritech.charts?.health_scores} alt="Health Scores" className="mb-4" />
                        {edaResult.agritech.health_scores && (
                          <div className="space-y-2">
                            {Object.entries(edaResult.agritech.health_scores as Record<string, number>)
                              .sort(([, a], [, b]) => a - b)
                              .map(([cls, score]) => (
                                <div key={cls} className="flex items-center gap-3">
                                  <span className="text-xs text-[var(--text)] w-32 truncate">{cls}</span>
                                  <div className="flex-1 h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                                    <motion.div initial={{ width: 0 }} animate={{ width: `${score}%` }}
                                      className={`h-full rounded-full ${score >= 70 ? "bg-green-500" : score >= 40 ? "bg-amber-500" : "bg-red-500"}`} />
                                  </div>
                                  <span className={`text-xs font-mono w-14 text-right ${score >= 70 ? "text-green-400" : score >= 40 ? "text-amber-400" : "text-red-400"}`}>{score.toFixed(1)}%</span>
                                </div>
                              ))}
                          </div>
                        )}
                      </Section>

                      {/* Knowledge Base Matches — detailed */}
                      {edaResult.agritech.knowledge_base_matches?.length > 0 && (
                        <Section title="Detection & Knowledge Base" icon={<Target className="h-4 w-4 text-green-400" />} accent="border-green-500/10">
                          <p className="text-xs text-[var(--text-muted)] mb-3 leading-relaxed">
                            The following conditions were detected by analyzing color anomalies, texture patterns, and leaf damage signatures
                            in the dataset images. Each match is cross-referenced against a curated knowledge base of crop diseases, pests,
                            and environmental stresses.
                          </p>
                          <div className="space-y-4">
                            {edaResult.agritech.knowledge_base_matches.map((match: any, i: number) => (
                              <div key={i} className="rounded-lg bg-green-500/5 border border-green-500/10 p-4">
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-sm font-semibold text-[var(--text)]">{match.disease || match.name}</span>
                                  <div className="flex items-center gap-2">
                                    <Badge variant={match.risk_level === 'high' ? 'error' : match.risk_level === 'medium' ? 'processing' : 'success'} className="text-[10px]">
                                      {match.risk_level?.toUpperCase()} RISK
                                    </Badge>
                                  </div>
                                </div>
                                <div className="space-y-2 text-xs">
                                  {match.symptoms && (
                                    <div><span className="text-[var(--text-muted)] font-medium">Symptoms: </span><span className="text-[var(--text)] leading-relaxed">{match.symptoms}</span></div>
                                  )}
                                  {match.cause && (
                                    <div><span className="text-[var(--text-muted)] font-medium">Causes: </span><span className="text-amber-400 leading-relaxed">{match.cause}</span></div>
                                  )}
                                  {match.treatment && (
                                    <div><span className="text-[var(--text-muted)] font-medium">Treatment & Prevention: </span><span className="text-green-400 leading-relaxed">{match.treatment}</span></div>
                                  )}
                                  {match.color_shift && (
                                    <div><span className="text-[var(--text-muted)] font-medium">Visual Indicator: </span><span className="text-cyan-400">{match.color_shift} color shift detected in affected regions</span></div>
                                  )}
                                  {match.matched_indicator && (
                                    <div><span className="text-[var(--text-muted)] font-medium">Detection Method: </span><span className="text-purple-400">Matched via {match.matched_indicator.replace(/_/g, ' ')} analysis</span></div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </Section>
                      )}

                      {/* Cause-Effect-Impact — expanded */}
                      <Section title="Cause-Effect Analysis" icon={<Activity className="h-4 w-4 text-green-400" />} accent="border-green-500/10">
                        <div className="space-y-4">
                          {edaResult.agritech.cause_analysis?.length > 0 ? (
                            edaResult.agritech.cause_analysis.map((c: any, i: number) => (
                              <div key={i} className="rounded-lg bg-[var(--bg)] p-4">
                                <div className="flex items-center gap-2 mb-2">
                                  <Badge variant={c.type === 'disease' ? 'error' : c.type === 'pest' ? 'processing' : 'success'} className="text-[10px]">
                                    {c.type.toUpperCase()}
                                  </Badge>
                                  <span className="text-xs font-medium text-[var(--text)]">{c.evidence_count} indicator(s) detected</span>
                                </div>
                                <p className="text-xs text-[var(--text-muted)] leading-relaxed">{c.detail}</p>
                                {c.type === 'disease' && (
                                  <p className="text-xs text-amber-400 mt-1.5 leading-relaxed">
                                    Disease indicators suggest fungal or bacterial pathogens are present. Common causes include humid conditions,
                                    poor air circulation, contaminated soil, or infected seed material. Early detection and treatment can significantly
                                    reduce crop loss.
                                  </p>
                                )}
                                {c.type === 'pest' && (
                                  <p className="text-xs text-amber-400 mt-1.5 leading-relaxed">
                                    Pest damage patterns indicate insect or mite activity. Affected plants may show leaf curling, stippling,
                                    honeydew deposits, or irregular holes. Integrated Pest Management (IPM) combining biological controls
                                    and targeted pesticides is recommended.
                                  </p>
                                )}
                                {c.type === 'environmental' && (
                                  <p className="text-xs text-amber-400 mt-1.5 leading-relaxed">
                                    Environmental stress indicators point to abiotic factors such as water deficit, nutrient deficiency,
                                    or temperature extremes. Addressing irrigation, soil nutrition, and microclimate management can help
                                    restore plant health.
                                  </p>
                                )}
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-emerald-400">No significant causes of concern detected.</p>
                          )}
                          {edaResult.agritech.impact_assessment && (
                            <div className="rounded-lg bg-amber-500/5 border border-amber-500/10 p-4">
                              <p className="text-xs font-medium text-amber-400 mb-2">Impact Assessment</p>
                              <div className="grid grid-cols-2 gap-3 text-xs mb-2">
                                <div><span className="text-[var(--text-muted)]">Estimated Yield Loss:</span> <span className="text-red-400 font-medium">{edaResult.agritech.impact_assessment.estimated_yield_loss_pct?.toFixed(1)}%</span></div>
                                <div><span className="text-[var(--text-muted)]">Spread Risk:</span> <span className={edaResult.agritech.impact_assessment.spread_risk === 'high' ? "text-red-400" : "text-amber-400"}>{edaResult.agritech.impact_assessment.spread_risk?.toUpperCase()}</span></div>
                                <div><span className="text-[var(--text-muted)]">Affected Classes:</span> <span className="text-[var(--text)]">{edaResult.agritech.impact_assessment.affected_classes} / {edaResult.agritech.impact_assessment.total_classes}</span></div>
                              </div>
                              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                                Based on the analysis, approximately {edaResult.agritech.impact_assessment.estimated_yield_loss_pct?.toFixed(1)}% yield
                                loss is estimated across affected crops. {edaResult.agritech.impact_assessment.spread_risk === 'high'
                                  ? 'The high spread risk means urgent intervention is needed to prevent further crop loss.'
                                  : 'Monitor affected areas closely and apply targeted treatments.'}
                              </p>
                            </div>
                          )}
                        </div>
                      </Section>

                      {/* Recommendations */}
                      {edaResult.agritech.recommendations?.length > 0 && (
                        <Section title="Recommendations & Action Plan" icon={<CheckCircle2 className="h-4 w-4 text-green-400" />} accent="border-green-500/10">
                          <div className="space-y-1.5">
                            {edaResult.agritech.recommendations.map((rec: string, i: number) => (
                              <div key={i} className="flex items-start gap-2 text-xs"><span className="text-green-400 font-mono">{i + 1}.</span><span className="text-[var(--text-muted)]">{rec}</span></div>
                            ))}
                          </div>
                        </Section>
                      )}

                      {/* Re-run button */}
                      <Button onClick={() => handleRunDomain("agritech")} isLoading={runningAgritech} variant="secondary" className="border-green-500/20">
                        <Leaf className="h-3.5 w-3.5 text-green-400" /> Re-run AgriTech Analysis
                      </Button>
                    </>
                  )}
                </motion.div>
              )}

              {/* ── MEDITECH TAB ───────────────────────────────────────── */}
              {domainTab === "meditech" && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
                  {/* Run Button */}
                  {!edaResult.meditech && (
                    <Card className="border-red-500/20 bg-red-500/5">
                      <CardContent className="p-6 text-center">
                        <HeartPulse className="h-10 w-10 text-red-400 mx-auto mb-3" />
                        <h3 className="font-semibold text-[var(--text)] mb-2">Run MediTech Analysis</h3>
                        <p className="text-xs text-[var(--text-muted)] mb-4 max-w-md mx-auto">
                          Medical image analysis with anomaly detection, tissue characterization, severity scoring, and clinical recommendations.
                        </p>
                        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 mb-4 max-w-md mx-auto">
                          <p className="text-[10px] text-amber-400">⚠️ For research & educational purposes only. Not for clinical diagnosis.</p>
                        </div>
                        <Button onClick={() => handleRunDomain("meditech")} isLoading={runningMeditech}
                          className="bg-red-600 hover:bg-red-700 text-white">
                          <HeartPulse className="h-4 w-4" /> Run MediTech Analysis
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  {/* Results */}
                  {edaResult.meditech && (
                    <>
                      {/* Disclaimer */}
                      <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
                        <p className="text-[10px] text-amber-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Medical Disclaimer: This analysis is for research purposes only. Not for clinical diagnosis.</p>
                      </div>

                      {/* Dataset Summary */}
                      <Section title="Dataset Summary" icon={<Info className="h-4 w-4 text-red-400" />} accent="border-red-500/10">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                          <div><p className="text-xs text-[var(--text-muted)]">Total Images</p><p className="text-[var(--text)] font-medium text-xs">{edaResult.total_images}</p></div>
                          <div><p className="text-xs text-[var(--text-muted)]">Number of Classes</p><p className="text-[var(--text)] font-medium text-xs">{edaResult.num_classes}</p></div>
                          <div><p className="text-xs text-[var(--text-muted)]">Domain</p><p className="text-[var(--text)] font-medium text-xs">Medical Imaging / Diagnostics</p></div>
                          <div><p className="text-xs text-[var(--text-muted)]">Severity Level</p><p className={`font-medium text-xs ${edaResult.meditech.overall_severity > 60 ? "text-red-400" : edaResult.meditech.overall_severity > 30 ? "text-amber-400" : "text-green-400"}`}>{edaResult.meditech.overall_severity > 60 ? "High" : edaResult.meditech.overall_severity > 30 ? "Moderate" : "Low"}</p></div>
                          <div><p className="text-xs text-[var(--text-muted)]">Urgency</p><p className="text-red-400 font-medium text-xs">{edaResult.meditech.urgency_level || "N/A"}</p></div>
                          <div><p className="text-xs text-[var(--text-muted)]">Conditions Detected</p><p className="text-purple-400 font-medium text-xs">{edaResult.meditech.knowledge_base_matches?.length || 0}</p></div>
                        </div>
                        <p className="text-xs text-[var(--text-muted)] mt-3 leading-relaxed">
                          This medical imaging dataset contains {edaResult.total_images} images across {edaResult.num_classes} diagnostic categories.
                          The MediTech analysis performs anomaly detection, tissue characterization using color semantics and GLCM texture analysis,
                          severity scoring, and cross-references findings against a clinical knowledge base covering skin lesions, retinal conditions,
                          radiographic findings, and other medical imaging pathologies.
                        </p>
                      </Section>

                      {/* Summary Cards */}
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {[
                          { label: "Severity Score", value: `${edaResult.meditech.overall_severity?.toFixed(1)}%`, color: edaResult.meditech.overall_severity > 60 ? "text-red-400" : edaResult.meditech.overall_severity > 30 ? "text-amber-400" : "text-green-400" },
                          { label: "Classes", value: Object.keys(edaResult.meditech.severity_scores || {}).length, color: "text-blue-400" },
                          { label: "Anomalies", value: edaResult.meditech.knowledge_base_matches?.length || 0, color: "text-purple-400" },
                          { label: "Urgency", value: edaResult.meditech.urgency_level || "N/A", color: edaResult.meditech.urgency_level === "CRITICAL" ? "text-red-400" : edaResult.meditech.urgency_level === "HIGH" ? "text-red-400" : "text-amber-400" },
                        ].map(s => (
                          <Card key={s.label} className="stat-card-glow border-red-500/10">
                            <CardContent className="p-4">
                              <p className="text-xs text-[var(--text-muted)]">{s.label}</p>
                              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>

                      {/* Severity Chart */}
                      <Section title="Severity Scores by Class" icon={<TrendingDown className="h-4 w-4 text-red-400" />} accent="border-red-500/10">
                        <ChartImage base64={edaResult.meditech.charts?.severity_scores} alt="Severity Scores" className="mb-4" />
                        {edaResult.meditech.severity_scores && (
                          <div className="space-y-2">
                            {Object.entries(edaResult.meditech.severity_scores as Record<string, number>)
                              .sort(([, a], [, b]) => b - a)
                              .map(([cls, score]) => (
                                <div key={cls} className="flex items-center gap-3">
                                  <span className="text-xs text-[var(--text)] w-32 truncate">{cls}</span>
                                  <div className="flex-1 h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                                    <motion.div initial={{ width: 0 }} animate={{ width: `${score}%` }}
                                      className={`h-full rounded-full ${score >= 60 ? "bg-red-500" : score >= 30 ? "bg-amber-500" : "bg-green-500"}`} />
                                  </div>
                                  <span className={`text-xs font-mono w-14 text-right ${score >= 60 ? "text-red-400" : score >= 30 ? "text-amber-400" : "text-green-400"}`}>{score.toFixed(1)}%</span>
                                </div>
                              ))}
                          </div>
                        )}
                      </Section>

                      {/* Knowledge Base — detailed */}
                      {edaResult.meditech.knowledge_base_matches?.length > 0 && (
                        <Section title="Detection & Clinical Knowledge" icon={<Microscope className="h-4 w-4 text-red-400" />} accent="border-red-500/10">
                          <p className="text-xs text-[var(--text-muted)] mb-3 leading-relaxed">
                            The following medical conditions were identified by analyzing tissue color semantics, texture patterns (GLCM),
                            morphological features, and anomaly detection. Each finding is cross-referenced against a clinical knowledge base
                            of known pathologies, including their causes, risk factors, typical appearance, and recommended actions.
                          </p>
                          <div className="space-y-4">
                            {edaResult.meditech.knowledge_base_matches.map((match: any, i: number) => (
                              <div key={i} className="rounded-lg bg-red-500/5 border border-red-500/10 p-4">
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-sm font-semibold text-[var(--text)]">{match.condition || match.name}</span>
                                  <div className="flex items-center gap-2">
                                    {match.urgency && (
                                      <Badge variant={match.urgency === 'CRITICAL' ? 'error' : match.urgency === 'HIGH' ? 'error' : 'processing'} className="text-[10px]">
                                        {match.urgency}
                                      </Badge>
                                    )}
                                    <Badge variant={match.risk_level === 'HIGH' ? 'error' : match.risk_level === 'MODERATE' ? 'processing' : 'success'} className="text-[10px]">
                                      {match.risk_level} RISK
                                    </Badge>
                                  </div>
                                </div>
                                <div className="space-y-2 text-xs">
                                  {match.description && (
                                    <div><span className="text-[var(--text-muted)] font-medium">Description: </span><span className="text-[var(--text)] leading-relaxed">{match.description}</span></div>
                                  )}
                                  {match.common_causes && (
                                    <div><span className="text-[var(--text-muted)] font-medium">Common Causes: </span><span className="text-amber-400 leading-relaxed">{Array.isArray(match.common_causes) ? match.common_causes.join(', ') : match.common_causes}</span></div>
                                  )}
                                  {match.typical_appearance && (
                                    <div><span className="text-[var(--text-muted)] font-medium">Typical Appearance: </span><span className="text-cyan-400 leading-relaxed">{match.typical_appearance}</span></div>
                                  )}
                                  {match.matched_indicator && (
                                    <div><span className="text-[var(--text-muted)] font-medium">Detection Method: </span><span className="text-purple-400">Identified via {match.matched_indicator.replace(/_/g, ' ')} analysis</span></div>
                                  )}
                                  <div className="mt-2 p-2 rounded bg-red-500/5 border border-red-500/5">
                                    <span className="text-[var(--text-muted)] font-medium">Prevention & Management: </span>
                                    <span className="text-green-400 leading-relaxed">
                                      {match.risk_level === 'HIGH'
                                        ? 'Immediate specialist consultation recommended. Regular screening and early detection are critical for managing this condition.'
                                        : match.risk_level === 'MODERATE'
                                        ? 'Schedule follow-up evaluation. Maintain regular monitoring and address modifiable risk factors.'
                                        : 'Routine monitoring recommended. Maintain healthy lifestyle and regular check-ups.'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </Section>
                      )}

                      {/* Tissue + Texture Analysis */}
                      {(edaResult.meditech.tissue_analysis || edaResult.meditech.texture_analysis) && (
                        <Section title="Tissue & Texture Analysis" icon={<Beaker className="h-4 w-4 text-red-400" />} accent="border-red-500/10" defaultOpen={false}>
                          {edaResult.meditech.tissue_analysis && Object.entries(edaResult.meditech.tissue_analysis).map(([cls, info]: [string, any]) => (
                            <div key={cls} className="rounded-lg bg-[var(--bg)] p-3 mb-2">
                              <p className="text-xs font-medium text-[var(--text)] mb-1">{cls}</p>
                              {info.dominant_interpretations?.map((interp: any, j: number) => (
                                <p key={j} className="text-[10px] text-[var(--text-muted)]">→ {interp.pigment}: {interp.significance}</p>
                              ))}
                            </div>
                          ))}
                        </Section>
                      )}

                      {/* Cause-Effect — expanded */}
                      <Section title="Cause-Effect & Risk Analysis" icon={<Activity className="h-4 w-4 text-red-400" />} accent="border-red-500/10">
                        <div className="space-y-3">
                          {edaResult.meditech.cause_analysis?.length > 0 ? (
                            edaResult.meditech.cause_analysis.map((c: any, i: number) => (
                              <div key={i} className="rounded-lg bg-[var(--bg)] p-4">
                                <p className="text-xs font-semibold text-[var(--text)] mb-1">Class: {c.class}</p>
                                {c.potential_causes?.length > 0 && (
                                  <div className="mb-2">
                                    <span className="text-xs text-[var(--text-muted)] font-medium">Potential Causes: </span>
                                    <span className="text-xs text-amber-400 leading-relaxed">{c.potential_causes.join(", ")}</span>
                                  </div>
                                )}
                                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                                  Analysis of color profile and texture patterns in the &quot;{c.class}&quot; class suggests possible pathological findings.
                                  Clinical correlation with patient history, laboratory results, and additional imaging studies is recommended
                                  for definitive diagnosis.
                                </p>
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-green-400">No significant pathological patterns detected in the current analysis.</p>
                          )}
                          {edaResult.meditech.impact_assessment && (
                            <div className="rounded-lg bg-red-500/5 border border-red-500/10 p-4">
                              <p className="text-xs font-medium text-red-400 mb-2">Clinical Impact Assessment</p>
                              <p className="text-xs text-[var(--text-muted)] leading-relaxed">{edaResult.meditech.impact_assessment.summary}</p>
                              <p className="text-xs text-[var(--text-muted)] mt-2 leading-relaxed">
                                Based on the severity distribution and detected anomalies, {edaResult.meditech.urgency_level === 'CRITICAL'
                                  ? 'immediate clinical attention is recommended. The findings indicate potentially serious pathology requiring urgent evaluation.'
                                  : edaResult.meditech.urgency_level === 'HIGH'
                                  ? 'prompt medical evaluation is advised. Schedule follow-up diagnostic studies and specialist consultation.'
                                  : 'routine follow-up monitoring is sufficient. Continue regular screening intervals.'}
                              </p>
                            </div>
                          )}
                        </div>
                      </Section>

                      {/* Recommendations */}
                      {edaResult.meditech.recommendations?.length > 0 && (
                        <Section title="Clinical Recommendations" icon={<CheckCircle2 className="h-4 w-4 text-red-400" />} accent="border-red-500/10">
                          <div className="space-y-1.5">
                            {edaResult.meditech.recommendations.map((rec: string, i: number) => (
                              <div key={i} className="flex items-start gap-2 text-xs"><span className="text-red-400 font-mono">{i + 1}.</span><span className="text-[var(--text-muted)]">{rec}</span></div>
                            ))}
                          </div>
                        </Section>
                      )}

                      {/* Re-run */}
                      <Button onClick={() => handleRunDomain("meditech")} isLoading={runningMeditech} variant="secondary" className="border-red-500/20">
                        <HeartPulse className="h-3.5 w-3.5 text-red-400" /> Re-run MediTech Analysis
                      </Button>
                    </>
                  )}
                </motion.div>
              )}

              {/* Continue to Pipeline */}
              <div className="flex justify-end pt-4">
                <Button onClick={() => router.push(`/projects/${id}/image-pipeline${job ? `?edaJobId=${job.id}` : ''}`)} className="btn-glow">
                  Continue to Image Pipeline <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
