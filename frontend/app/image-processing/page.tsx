"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Image, Plus, ArrowRight, Layers, Eye, GitBranch, Leaf, HeartPulse, Microscope, Bug, Sparkles, BarChart2, Zap } from "lucide-react";
import Navbar from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth";
import api from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { Project, User } from "@/lib/types";

type Domain = "general" | "agritech" | "meditech";

const DOMAINS: { key: Domain; label: string; subtitle: string; icon: React.ReactNode; gradient: string; border: string; badge: string; badgeText: string; features: string[] }[] = [
  {
    key: "general", label: "General", subtitle: "Domain-Independent Analysis",
    icon: <Layers className="h-7 w-7 text-white" />,
    gradient: "from-violet-600 via-purple-600 to-indigo-600",
    border: "border-violet-500/30 hover:border-violet-400/60",
    badge: "bg-violet-500/20 text-violet-400", badgeText: "Universal",
    features: ["Image EDA", "Pixel Statistics", "Quality Analysis", "Class Balance", "Pipeline Training", "Full Reports"],
  },
  {
    key: "agritech", label: "AgriTech", subtitle: "Agriculture & Crop Science",
    icon: <Leaf className="h-7 w-7 text-white" />,
    gradient: "from-green-600 via-emerald-600 to-teal-600",
    border: "border-green-500/30 hover:border-green-400/60",
    badge: "bg-green-500/20 text-green-400", badgeText: "Agriculture",
    features: ["Crop Disease Detection", "Pest Analysis", "Health Scoring", "Yield Impact", "Treatment Plans", "Environmental Risk"],
  },
  {
    key: "meditech", label: "MediTech", subtitle: "Medical Imaging & Diagnostics",
    icon: <HeartPulse className="h-7 w-7 text-white" />,
    gradient: "from-red-600 via-rose-600 to-pink-600",
    border: "border-red-500/30 hover:border-red-400/60",
    badge: "bg-red-500/20 text-red-400", badgeText: "Healthcare",
    features: ["Anomaly Detection", "Tissue Analysis", "Severity Scoring", "GLCM Texture", "Cause-Effect", "Clinical Reports"],
  },
];

export default function ImageProcessingPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null);

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

  const navigateToProject = (projectId: string, page: "image-eda" | "image-pipeline") => {
    const domainParam = selectedDomain && selectedDomain !== "general" ? `?domain=${selectedDomain}` : "";
    router.push(`/projects/${projectId}/${page}${domainParam}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <div className="h-16 bg-[var(--surface)] border-b border-[var(--border)]" />
        <div className="mx-auto max-w-7xl px-4 py-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-48 rounded-2xl bg-[var(--surface)] animate-pulse shimmer-bg" />
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
        {/* Hero Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <motion.div whileHover={{ scale: 1.1, rotate: 5 }} className="h-12 w-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20 icon-pulse">
              <Image className="h-6 w-6 text-white" />
            </motion.div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--text)]">Image Processing</h1>
              <p className="text-sm text-[var(--text-muted)]">Computer vision, analysis & domain-specific intelligence</p>
            </div>
          </div>
        </motion.div>

        {/* ── Step 1: Domain Selection ──────────────────────────────────── */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-5">
            <div className="h-7 w-7 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-xs font-bold">1</div>
            <h2 className="text-lg font-semibold text-[var(--text)]">Select Domain</h2>
            <span className="text-xs text-[var(--text-muted)] ml-1">Choose analysis context</span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {DOMAINS.map((d, i) => (
              <motion.div
                key={d.key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ y: -6, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Card
                  className={`cursor-pointer domain-card ${d.border} transition-all duration-300 ${
                    selectedDomain === d.key ? "ring-2 ring-[var(--primary)] selected-glow" : ""
                  }`}
                  onClick={() => setSelectedDomain(d.key)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <motion.div
                        whileHover={{ rotate: 10 }}
                        className={`h-14 w-14 rounded-xl bg-gradient-to-br ${d.gradient} flex items-center justify-center shadow-lg`}
                      >
                        {d.icon}
                      </motion.div>
                      <Badge variant="default" className={`text-[10px] ${d.badge}`}>{d.badgeText}</Badge>
                    </div>
                    <h3 className="text-lg font-bold text-[var(--text)] mb-1">{d.label}</h3>
                    <p className="text-xs text-[var(--text-muted)] mb-4">{d.subtitle}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {d.features.map(f => (
                        <span key={f} className={`text-[9px] px-2 py-0.5 rounded-full ${d.badge}`}>{f}</span>
                      ))}
                    </div>
                    {selectedDomain === d.key && (
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="mt-4 flex items-center gap-1 text-[var(--primary)]">
                        <Sparkles className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium">Selected</span>
                      </motion.div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>

        {/* ── Step 2: Workflow Options (shown after domain selected) ──── */}
        <AnimatePresence>
          {selectedDomain && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-10 overflow-hidden"
            >
              <div className="flex items-center gap-2 mb-5">
                <div className="h-7 w-7 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-xs font-bold">2</div>
                <h2 className="text-lg font-semibold text-[var(--text)]">Choose Workflow</h2>
                <Badge variant="default" className="text-[10px]">{DOMAINS.find(d => d.key === selectedDomain)?.label}</Badge>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {/* EDA */}
                <motion.div whileHover={{ y: -4 }} transition={{ duration: 0.2 }}>
                  <Card
                    className="cursor-pointer card-hover-glow h-full border-[var(--border)]"
                    onClick={() => {
                      if (projects.length > 0) navigateToProject(projects[0].id, "image-eda");
                      else router.push("/projects?create=image");
                    }}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center">
                          <Eye className="h-5 w-5 text-blue-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[var(--text)]">EDA Analysis</p>
                          <p className="text-[10px] text-[var(--text-muted)]">Explore & understand data</p>
                        </div>
                      </div>
                      <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-3">
                        Upload dataset → comprehensive statistical analysis → quality checks → downloadable reports with charts
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {["Quality", "Distribution", "Statistics", "Charts", "Report"].map(t => (
                          <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">{t}</span>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                {/* Pipeline */}
                <motion.div whileHover={{ y: -4 }} transition={{ duration: 0.2 }}>
                  <Card
                    className="cursor-pointer card-hover-glow h-full border-[var(--border)]"
                    onClick={() => {
                      if (projects.length > 0) navigateToProject(projects[0].id, "image-pipeline");
                      else router.push("/projects?create=image");
                    }}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                          <GitBranch className="h-5 w-5 text-purple-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[var(--text)]">Pipeline Training</p>
                          <p className="text-[10px] text-[var(--text-muted)]">Train & evaluate models</p>
                        </div>
                      </div>
                      <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-3">
                        Build ML models → training metrics → confusion matrix → error analysis → prediction intelligence
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {["Training", "Metrics", "F1/AUC", "Confusion", "Report"].map(t => (
                          <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">{t}</span>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                {/* Full Suite */}
                <motion.div whileHover={{ y: -4 }} transition={{ duration: 0.2 }}>
                  <Card
                    className="cursor-pointer card-hover-glow h-full border-[var(--border)] border-dashed"
                    onClick={() => {
                      if (projects.length > 0) navigateToProject(projects[0].id, "image-eda");
                      else router.push("/projects?create=image");
                    }}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
                          <Zap className="h-5 w-5 text-amber-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[var(--text)]">Full Suite</p>
                          <p className="text-[10px] text-[var(--text-muted)]">EDA + Domain + Pipeline</p>
                        </div>
                      </div>
                      <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-3">
                        Complete end-to-end analysis: EDA → Domain analysis → Model training → Comprehensive reporting
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {["End-to-End", "All Reports", "All Charts", "Complete"].map(t => (
                          <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">{t}</span>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Step 3: Projects ─────────────────────────────────────────── */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-[var(--text-muted)] text-xs font-bold">3</div>
            <p className="text-sm text-[var(--text-muted)]">{projects.length} image project{projects.length !== 1 ? "s" : ""}</p>
          </div>
          <Button onClick={() => router.push("/projects?create=image")} className="btn-glow">
            <Plus className="h-4 w-4" /> New Image Project
          </Button>
        </div>

        {projects.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--border)] py-16 text-center hover-border-glow"
          >
            <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
              <Image className="h-16 w-16 text-[var(--text-muted)] mb-4" />
            </motion.div>
            <h3 className="text-lg font-semibold text-[var(--text)]">No image projects yet</h3>
            <p className="text-sm text-[var(--text-muted)] mt-1 mb-6">Create a project to start analyzing image datasets</p>
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
