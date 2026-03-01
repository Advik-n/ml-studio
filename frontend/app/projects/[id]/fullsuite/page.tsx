"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Layers,
  BarChart2,
  GitBranch,
  FileText,
  Sparkles,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import Navbar from "@/components/layout/navbar";
import Sidebar from "@/components/layout/sidebar";
import FileUpload from "@/components/eda/file-upload";
import EDAResults from "@/components/eda/eda-results";
import DataSummary from "@/components/fullsuite/data-summary";
import PipelineBuilder from "@/components/pipeline/pipeline-builder";
import PipelineResults from "@/components/pipeline/pipeline-results";
import PredictionGUI from "@/components/pipeline/prediction-gui";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import api from "@/lib/api";
import type { Project, User, EDAJob, PipelineJob } from "@/lib/types";

type Phase = "upload" | "eda" | "summary" | "pipeline";

const PHASE_META: Record<Phase, { label: string; icon: React.ReactNode; step: number }> = {
  upload:   { label: "Upload Dataset",   icon: <FileText className="h-4 w-4" />,  step: 1 },
  eda:      { label: "EDA Analysis",     icon: <BarChart2 className="h-4 w-4" />, step: 2 },
  summary:  { label: "Data Summary",     icon: <Layers className="h-4 w-4" />,    step: 3 },
  pipeline: { label: "ML Pipeline",      icon: <GitBranch className="h-4 w-4" />, step: 4 },
};

export default function FullSuitePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  const [phase, setPhase] = useState<Phase>("upload");
  const [edaJob, setEdaJob] = useState<EDAJob | null>(null);
  const [pipelineJob, setPipelineJob] = useState<PipelineJob | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [userData, projRes] = await Promise.all([
        getCurrentUser(),
        api.get<Project>(`/projects/${id}`),
      ]);
      setUser(userData);
      setProject(projRes.data);

      // Check for existing EDA jobs to resume workflow
      try {
        const edaRes = await api.get<EDAJob[]>(`/eda/${id}/jobs`);
        const edaList = Array.isArray(edaRes.data) ? edaRes.data : [];
        const latestEda = edaList[0];
        if (latestEda?.status === "completed") {
          setEdaJob(latestEda);
          // Check for pipeline jobs too
          try {
            const pipRes = await api.get<PipelineJob[]>(`/pipeline/${id}/jobs`);
            const pipList = Array.isArray(pipRes.data) ? pipRes.data : [];
            const latestPip = pipList[0];
            if (latestPip) {
              setPipelineJob(latestPip);
              setPhase("pipeline");
            } else {
              setPhase("summary");
            }
          } catch {
            setPhase("summary");
          }
        } else if (latestEda) {
          setEdaJob(latestEda);
          setPhase("eda");
        }
      } catch {
        // No EDA jobs, start from upload
      }
    } catch {
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ---------- EDA callbacks ---------- */
  const handleEdaJobCreated = (job: EDAJob) => {
    setEdaJob(job);
    setPhase("eda");
  };

  const handleEdaJobUpdate = useCallback((updated: EDAJob) => {
    setEdaJob(updated);
  }, []);

  /* ---------- Pipeline callbacks ---------- */
  const handlePipelineJobCreated = (job: PipelineJob) => {
    setPipelineJob(job);
  };

  const handlePipelineJobUpdate = useCallback((updated: PipelineJob) => {
    setPipelineJob(updated);
  }, []);

  /* ---------- Phase transitions ---------- */
  const goToSummary = () => setPhase("summary");
  const goToPipeline = () => setPhase("pipeline");

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
        <Sidebar
          projectId={id}
          projectName={project.name}
          projectType={project.project_type as "eda" | "pipeline" | "mixed" | "image"}
        />
        <main className="flex-1 p-6 max-w-6xl">
          {/* Header */}
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20">
              <Layers className="h-5 w-5 text-[var(--primary)]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--text)]">Full Suite — EDA + Pipeline</h1>
              <p className="text-sm text-[var(--text-muted)]">{project.name}</p>
            </div>
          </div>

          {/* Stepper */}
          <div className="mb-8 flex items-center gap-2">
            {(Object.keys(PHASE_META) as Phase[]).map((p, i, arr) => {
              const meta = PHASE_META[p];
              const currentStep = PHASE_META[phase].step;
              const isDone = meta.step < currentStep;
              const isActive = p === phase;

              return (
                <React.Fragment key={p}>
                  <button
                    onClick={() => {
                      // Allow navigating back to completed phases
                      if (meta.step <= currentStep) setPhase(p);
                    }}
                    disabled={meta.step > currentStep}
                    className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                      isActive
                        ? "bg-[var(--primary)] text-white shadow-md"
                        : isDone
                        ? "bg-green-500/15 text-green-400 cursor-pointer hover:bg-green-500/25"
                        : "bg-[var(--surface-2)] text-[var(--text-muted)] cursor-not-allowed opacity-50"
                    }`}
                  >
                    {isDone ? <CheckCircle2 className="h-4 w-4" /> : meta.icon}
                    <span className="hidden sm:inline">{meta.label}</span>
                    <span className="sm:hidden">{meta.step}</span>
                  </button>
                  {i < arr.length - 1 && (
                    <ArrowRight className={`h-4 w-4 shrink-0 ${
                      meta.step < currentStep ? "text-green-400" : "text-[var(--text-muted)] opacity-30"
                    }`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Phase content */}
          <AnimatePresence mode="wait">
            {/* Phase 1: Upload */}
            {phase === "upload" && (
              <motion.div
                key="upload"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-lg"
              >
                <h2 className="text-base font-semibold text-[var(--text)] mb-3">Upload Your Dataset</h2>
                <p className="text-sm text-[var(--text-muted)] mb-4">
                  Upload a CSV file to begin the end-to-end analysis and modeling workflow.
                </p>
                <FileUpload projectId={id} onJobCreated={handleEdaJobCreated} />
              </motion.div>
            )}

            {/* Phase 2: EDA */}
            {phase === "eda" && edaJob && (
              <motion.div
                key="eda"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <h2 className="text-base font-semibold text-[var(--text)] mb-3">EDA Results</h2>
                <EDAResults job={edaJob} onUpdate={handleEdaJobUpdate} />

                {edaJob.status === "completed" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-6"
                  >
                    <Button onClick={goToSummary} className="gap-2">
                      Continue to Data Summary
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </motion.div>
                )}
              </motion.div>
            )}

            {/* Phase 3: Data Summary */}
            {phase === "summary" && edaJob && (
              <motion.div
                key="summary"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <DataSummary jobId={edaJob.id} onProceedToPipeline={goToPipeline} />
              </motion.div>
            )}

            {/* Phase 4: Pipeline */}
            {phase === "pipeline" && edaJob && (
              <motion.div
                key="pipeline"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div>
                    <h2 className="text-base font-semibold text-[var(--text)] mb-3">Configure Pipeline</h2>
                    <PipelineBuilder
                      projectId={id}
                      onJobCreated={handlePipelineJobCreated}
                      edaJobId={edaJob.id}
                    />
                  </div>

                  <div className="space-y-6">
                    <AnimatePresence>
                      {pipelineJob && (
                        <motion.div
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0 }}
                        >
                          <h2 className="text-base font-semibold text-[var(--text)] mb-3">Training Results</h2>
                          <PipelineResults job={pipelineJob} onUpdate={handlePipelineJobUpdate} />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <AnimatePresence>
                      {pipelineJob?.status === "completed" && (
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                        >
                          <div className="flex items-center gap-2 mb-3">
                            <h2 className="text-base font-semibold text-[var(--text)]">Interactive Prediction</h2>
                            <Sparkles className="h-4 w-4 text-[var(--accent)]" />
                          </div>
                          <PredictionGUI job={pipelineJob} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
