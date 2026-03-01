"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { GitBranch, ChevronDown, ChevronUp, CalendarDays, Sparkles } from "lucide-react";
import Navbar from "@/components/layout/navbar";
import Sidebar from "@/components/layout/sidebar";
import PipelineBuilder from "@/components/pipeline/pipeline-builder";
import PipelineResults from "@/components/pipeline/pipeline-results";
import PredictionGUI from "@/components/pipeline/prediction-gui";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth";
import api from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { Project, User, PipelineJob } from "@/lib/types";

export default function PipelinePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [pipelineJobs, setPipelineJobs] = useState<PipelineJob[]>([]);
  const [activeJob, setActiveJob] = useState<PipelineJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [userData, projRes, pipeRes] = await Promise.all([
        getCurrentUser(),
        api.get<Project>(`/projects/${id}`),
        api.get<PipelineJob[]>(`/pipeline/${id}/jobs`),
      ]);
      setUser(userData);
      setProject(projRes.data);
      const jobs = Array.isArray(pipeRes.data) ? pipeRes.data : [];
      setPipelineJobs(jobs);
      // Set most recent active job
      const latest = jobs[0];
      if (latest && (latest.status === "processing" || latest.status === "completed")) {
        setActiveJob(latest);
      }
    } catch {
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleJobCreated = (job: PipelineJob) => {
    setActiveJob(job);
    setPipelineJobs((prev) => [job, ...prev]);
  };

  const handleJobUpdate = useCallback((updated: PipelineJob) => {
    setActiveJob(updated);
    setPipelineJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
  }, []);

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
        <Sidebar projectId={id} projectName={project.name} projectType={project.project_type as "eda" | "pipeline" | "mixed"} />
        <main className="flex-1 p-6">
          {/* Header */}
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10">
              <GitBranch className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--text)]">ML Pipeline</h1>
              <p className="text-sm text-[var(--text-muted)]">{project.name}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 max-w-6xl">
            {/* Builder */}
            <div>
              <h2 className="text-base font-semibold text-[var(--text)] mb-3">Configure Pipeline</h2>
              <PipelineBuilder projectId={id} onJobCreated={handleJobCreated} />
            </div>

            {/* Results + Prediction */}
            <div className="space-y-6">
              <AnimatePresence>
                {activeJob && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <h2 className="text-base font-semibold text-[var(--text)] mb-3">Training Results</h2>
                    <PipelineResults job={activeJob} onUpdate={handleJobUpdate} />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Prediction GUI (show after completed) */}
              <AnimatePresence>
                {activeJob?.status === "completed" && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <h2 className="text-base font-semibold text-[var(--text)]">Interactive Prediction</h2>
                      <Sparkles className="h-4 w-4 text-[var(--accent)]" />
                    </div>
                    <PredictionGUI job={activeJob} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* History */}
          {pipelineJobs.length > 0 && (
            <div className="mt-8 max-w-6xl">
              <button
                onClick={() => setHistoryExpanded(!historyExpanded)}
                className="flex items-center gap-2 text-sm font-semibold text-[var(--text)] mb-3 hover:text-[var(--primary)] transition-colors"
              >
                Previous Pipelines ({pipelineJobs.length})
                {historyExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              <AnimatePresence>
                {historyExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-2 overflow-hidden"
                  >
                    {pipelineJobs.map((job) => (
                      <Card
                        key={job.id}
                        className="cursor-pointer hover:border-[var(--primary)]/50 transition-colors"
                        onClick={() => setActiveJob(job)}
                      >
                        <CardContent className="flex items-center justify-between p-4">
                          <div>
                            <p className="text-sm font-medium text-[var(--text)]">
                              {job.model_name} · {job.model_type}
                            </p>
                            <p className="flex items-center gap-1 text-xs text-[var(--text-muted)] mt-0.5">
                              <CalendarDays className="h-3 w-3" />
                              {formatDate(job.created_at)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {job.accuracy !== undefined && job.accuracy !== null && (
                              <span className="text-xs font-medium text-[var(--primary)]">
                                {(job.accuracy * 100).toFixed(1)}% acc
                              </span>
                            )}
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
                        </CardContent>
                      </Card>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
