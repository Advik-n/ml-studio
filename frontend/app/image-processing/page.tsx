"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Image, Plus, ArrowRight, Sparkles, Layers, Eye, GitBranch, Leaf, HeartPulse, Microscope, Bug } from "lucide-react";
import Navbar from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth";
import api from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { Project, User } from "@/lib/types";

export default function ImageProcessingPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [userData, projectsRes] = await Promise.all([
        getCurrentUser(),
        api.get<Project[]>("/projects"),
      ]);
      setUser(userData);
      setProjects(projectsRes.data.filter((p: Project) => p.project_type === "image"));
    } catch {
      router.push("/login");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <div className="h-16 bg-[var(--surface)] border-b border-[var(--border)]" />
        <div className="mx-auto max-w-7xl px-4 py-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-40 rounded-xl bg-[var(--surface)] animate-pulse shimmer-bg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar userName={user?.name || user?.username} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Header with glow */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <motion.div
              whileHover={{ scale: 1.1, rotate: 5 }}
              className="h-12 w-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20 icon-pulse"
            >
              <Image className="h-6 w-6 text-white" />
            </motion.div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--text)]">Image Processing</h1>
              <p className="text-sm text-[var(--text-muted)]">Computer vision, image analysis & classification</p>
            </div>
          </div>
        </div>

        {/* General Section */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="h-4 w-4 text-[var(--primary)]" />
            <h2 className="text-lg font-semibold text-[var(--text)]">General</h2>
            <Badge variant="default" className="text-[10px]">Domain-Independent</Badge>
          </div>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-6">
            <motion.div whileHover={{ y: -3 }} transition={{ duration: 0.2 }}>
              <Card className="card-hover-glow cursor-pointer border-[var(--border)] h-full" onClick={() => projects.length > 0 ? router.push(`/projects/${projects[0].id}/image-eda`) : router.push("/projects?create=image")}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center">
                      <Eye className="h-4 w-4 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">Image EDA</p>
                      <p className="text-[10px] text-[var(--text-muted)]">Comprehensive analysis</p>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    Quality analysis, class balance, pixel statistics, corrupt detection, preprocessing recommendations
                  </p>
                  <div className="flex flex-wrap gap-1 mt-3">
                    {["Quality", "Balance", "Pixel Stats", "Report"].map(t => (
                      <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">{t}</span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div whileHover={{ y: -3 }} transition={{ duration: 0.2 }}>
              <Card className="card-hover-glow cursor-pointer border-[var(--border)] h-full" onClick={() => projects.length > 0 ? router.push(`/projects/${projects[0].id}/image-pipeline`) : router.push("/projects?create=image")}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                      <GitBranch className="h-4 w-4 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">Image Pipeline</p>
                      <p className="text-[10px] text-[var(--text-muted)]">Train & evaluate models</p>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    Classification training, evaluation metrics, error analysis, prediction intelligence
                  </p>
                  <div className="flex flex-wrap gap-1 mt-3">
                    {["Training", "Metrics", "Confusion Matrix", "Report"].map(t => (
                      <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">{t}</span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>

        {/* AgriTech Section */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Leaf className="h-4 w-4 text-green-500" />
            <h2 className="text-lg font-semibold text-[var(--text)]">AgriTech</h2>
            <Badge variant="default" className="text-[10px] bg-green-500/20 text-green-400">Agriculture</Badge>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-6">
            <motion.div whileHover={{ y: -3 }} transition={{ duration: 0.2 }}>
              <Card className="card-hover-glow cursor-pointer border-[var(--border)] h-full" onClick={() => projects.length > 0 ? router.push(`/projects/${projects[0].id}/image-eda?domain=agritech`) : router.push("/projects?create=image")}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center">
                      <Leaf className="h-4 w-4 text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">Crop Disease Detection</p>
                      <p className="text-[10px] text-[var(--text-muted)]">AI-powered plant analysis</p>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    Detect crop diseases, pest damage, nutrient deficiency. Get health scores, cause-effect analysis & treatment recommendations.
                  </p>
                  <div className="flex flex-wrap gap-1 mt-3">
                    {["Disease", "Pest", "Health Score", "Treatment"].map(t => (
                      <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">{t}</span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div whileHover={{ y: -3 }} transition={{ duration: 0.2 }}>
              <Card className="card-hover-glow cursor-pointer border-[var(--border)] h-full" onClick={() => projects.length > 0 ? router.push(`/projects/${projects[0].id}/image-pipeline?domain=agritech`) : router.push("/projects?create=image")}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-lime-500/20 to-green-500/20 flex items-center justify-center">
                      <Bug className="h-4 w-4 text-lime-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">Pest & Impact Analysis</p>
                      <p className="text-[10px] text-[var(--text-muted)]">Environmental assessment</p>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    Analyze pest patterns, environmental stress, yield impact prediction & risk assessment with detailed knowledge base.
                  </p>
                  <div className="flex flex-wrap gap-1 mt-3">
                    {["Risk", "Yield Impact", "Climate", "Report"].map(t => (
                      <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-lime-500/10 text-lime-400">{t}</span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>

        {/* MediTech Section */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <HeartPulse className="h-4 w-4 text-red-500" />
            <h2 className="text-lg font-semibold text-[var(--text)]">MediTech</h2>
            <Badge variant="default" className="text-[10px] bg-red-500/20 text-red-400">Healthcare</Badge>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-6">
            <motion.div whileHover={{ y: -3 }} transition={{ duration: 0.2 }}>
              <Card className="card-hover-glow cursor-pointer border-[var(--border)] h-full" onClick={() => projects.length > 0 ? router.push(`/projects/${projects[0].id}/image-eda?domain=meditech`) : router.push("/projects?create=image")}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-red-500/20 to-rose-500/20 flex items-center justify-center">
                      <HeartPulse className="h-4 w-4 text-red-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">Medical Image Analysis</p>
                      <p className="text-[10px] text-[var(--text-muted)]">Clinical-grade insights</p>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    Anomaly detection, tissue analysis, severity scoring. Analyze skin lesions, X-rays, retinal images with medical knowledge base.
                  </p>
                  <div className="flex flex-wrap gap-1 mt-3">
                    {["Anomaly", "Severity", "Tissue", "Diagnosis"].map(t => (
                      <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">{t}</span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div whileHover={{ y: -3 }} transition={{ duration: 0.2 }}>
              <Card className="card-hover-glow cursor-pointer border-[var(--border)] h-full" onClick={() => projects.length > 0 ? router.push(`/projects/${projects[0].id}/image-pipeline?domain=meditech`) : router.push("/projects?create=image")}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-rose-500/20 to-pink-500/20 flex items-center justify-center">
                      <Microscope className="h-4 w-4 text-rose-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">Pathology & Risk</p>
                      <p className="text-[10px] text-[var(--text-muted)]">Cause-effect intelligence</p>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    Cause analysis, effect assessment, impact scoring, future risk prediction with comprehensive medical report generation.
                  </p>
                  <div className="flex flex-wrap gap-1 mt-3">
                    {["Cause", "Effect", "Impact", "Risk"].map(t => (
                      <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400">{t}</span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>

        {/* Projects Section */}
        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm text-[var(--text-muted)]">{projects.length} image project{projects.length !== 1 ? "s" : ""}</p>
          <Button onClick={() => router.push("/projects?create=image")} className="btn-glow">
            <Plus className="h-4 w-4" /> New Image Project
          </Button>
        </div>

        {projects.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--border)] py-16 text-center hover-border-glow"
          >
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <Image className="h-16 w-16 text-[var(--text-muted)] mb-4" />
            </motion.div>
            <h3 className="text-lg font-semibold text-[var(--text)]">No image projects yet</h3>
            <p className="text-sm text-[var(--text-muted)] mt-1 mb-6">Upload image datasets for EDA analysis and ML classification</p>
            <Button onClick={() => router.push("/projects?create=image")} className="btn-glow">
              <Plus className="h-4 w-4" /> Create Image Project
            </Button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project, i) => (
              <motion.div key={project.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="cursor-pointer card-hover-glow" onClick={() => router.push(`/projects/${project.id}`)}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <motion.div whileHover={{ rotate: 10, scale: 1.1 }} className="h-10 w-10 rounded-lg bg-gradient-to-br from-orange-500/20 to-amber-500/20 flex items-center justify-center">
                        <Image className="h-5 w-5 text-orange-500" />
                      </motion.div>
                      <Badge variant="default">Image</Badge>
                    </div>
                    <h3 className="font-semibold text-[var(--text)] mb-1">{project.name}</h3>
                    <p className="text-xs text-[var(--text-muted)] mb-3">{project.description || "Image processing project"}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[var(--text-muted)]">{formatDate(project.created_at)}</span>
                      <ArrowRight className="h-4 w-4 text-[var(--text-muted)]" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
