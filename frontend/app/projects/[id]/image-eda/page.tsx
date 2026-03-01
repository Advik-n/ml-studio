"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Image, Upload, BarChart2, Eye, AlertTriangle, Copy, CheckCircle2 } from "lucide-react";
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
  const [running, setRunning] = useState(false);
  const [job, setJob] = useState<any>(null);
  const [edaResult, setEdaResult] = useState<any>(null);

  const fetchData = useCallback(async () => {
    try {
      const [userData, projRes] = await Promise.all([
        getCurrentUser(),
        api.get<Project>(`/projects/${id}`),
      ]);
      setUser(userData);
      setProject(projRes.data);

      // Check for existing image jobs
      try {
        const jobsRes = await api.get(`/image/${id}/jobs`);
        const edaJobs = jobsRes.data.filter((j: any) => j.job_type === "image_eda");
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

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post(`/image/${id}/upload`, formData);
      setJob(res.data);
    } catch (err: unknown) {
      toast.error(extractApiError(err, "Upload failed"));
    } finally {
      setUploading(false);
    }
  };

  const handleRunEDA = async () => {
    if (!job) return;
    setRunning(true);
    try {
      const res = await api.post(`/image/jobs/${job.id}/run-eda`);
      setJob(res.data);
      if (res.data.eda_report) {
        setEdaResult(res.data.eda_report);
      }
    } catch (err: unknown) {
      toast.error(extractApiError(err, "EDA failed"));
    } finally {
      setRunning(false);
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
              <Eye className="h-5 w-5 text-orange-500" /> Image EDA
            </h1>
            <p className="text-sm text-[var(--text-muted)]">Analyze your image dataset</p>
          </div>

          {/* Upload Section */}
          {!job && (
            <Card className="mb-6">
              <CardContent className="p-6">
                <div className="flex flex-col items-center justify-center py-8">
                  <Upload className="h-12 w-12 text-[var(--text-muted)] mb-4" />
                  <p className="text-[var(--text)] font-medium mb-2">Upload Image Dataset</p>
                  <p className="text-sm text-[var(--text-muted)] mb-4 text-center max-w-md">
                    Upload a ZIP file containing class folders with images (e.g., train/cat/*.jpg, train/dog/*.jpg)
                  </p>
                  <label className="cursor-pointer">
                    <input type="file" accept=".zip" onChange={handleUpload} className="hidden" />
                    <Button isLoading={uploading}>
                      <Upload className="h-4 w-4" /> {uploading ? "Uploading..." : "Select ZIP File"}
                    </Button>
                  </label>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Job Status */}
          {job && !edaResult && (
            <Card className="mb-6">
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
                  <Button onClick={handleRunEDA} isLoading={running}>
                    <BarChart2 className="h-4 w-4" /> Run Image EDA
                  </Button>
                )}
                {job.status === "failed" && (
                  <p className="text-sm text-red-500">{job.error_message}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* EDA Results */}
          {edaResult && (
            <div className="space-y-6">
              {/* Overview Cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Card><CardContent className="p-4">
                  <p className="text-xs text-[var(--text-muted)]">Total Images</p>
                  <p className="text-2xl font-bold text-[var(--text)]">{edaResult.total_images?.toLocaleString()}</p>
                </CardContent></Card>
                <Card><CardContent className="p-4">
                  <p className="text-xs text-[var(--text-muted)]">Classes</p>
                  <p className="text-2xl font-bold text-[var(--text)]">{edaResult.num_classes}</p>
                </CardContent></Card>
                <Card><CardContent className="p-4">
                  <p className="text-xs text-[var(--text-muted)]">Avg Resolution</p>
                  <p className="text-2xl font-bold text-[var(--text)]">{edaResult.resolution_stats?.mean_width?.toFixed(0)}×{edaResult.resolution_stats?.mean_height?.toFixed(0)}</p>
                </CardContent></Card>
                <Card><CardContent className="p-4">
                  <p className="text-xs text-[var(--text-muted)]">Duplicates</p>
                  <p className="text-2xl font-bold text-[var(--text)]">{edaResult.duplicate_count}</p>
                </CardContent></Card>
              </div>

              {/* Class Distribution */}
              <Card>
                <CardContent className="p-5">
                  <h3 className="text-sm font-semibold text-[var(--text)] mb-4 flex items-center gap-2">
                    <BarChart2 className="h-4 w-4 text-blue-400" /> Class Distribution
                  </h3>
                  <div className="space-y-3">
                    {Object.entries(edaResult.class_distribution || {}).map(([cls, count]: [string, any]) => {
                      const pct = (count / edaResult.total_images) * 100;
                      return (
                        <div key={cls}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-[var(--text)] font-medium">{cls}</span>
                            <span className="text-[var(--text-muted)]">{count} ({pct.toFixed(1)}%)</span>
                          </div>
                          <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.5 }}
                              className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-500" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Resolution Stats */}
              {edaResult.resolution_stats && (
                <Card>
                  <CardContent className="p-5">
                    <h3 className="text-sm font-semibold text-[var(--text)] mb-4 flex items-center gap-2">
                      <Image className="h-4 w-4 text-purple-400" /> Resolution Distribution
                    </h3>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
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
                <Card>
                  <CardContent className="p-5">
                    <h3 className="text-sm font-semibold text-[var(--text)] mb-4 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-400" /> Blur Detection
                    </h3>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-4">
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

              {/* Duplicate Detection */}
              <Card>
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

              {/* Continue to Pipeline */}
              <div className="flex justify-end">
                <Button onClick={() => router.push(`/projects/${id}/image-pipeline${job ? `?edaJobId=${job.id}` : ''}`)}>
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
