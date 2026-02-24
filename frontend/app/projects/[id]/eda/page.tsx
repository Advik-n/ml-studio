"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart2, ChevronDown, ChevronUp, CalendarDays } from "lucide-react";
import Navbar from "@/components/layout/navbar";
import Sidebar from "@/components/layout/sidebar";
import FileUpload from "@/components/eda/file-upload";
import EDAResults from "@/components/eda/eda-results";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth";
import api from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { Project, User, EDAJob } from "@/lib/types";

export default function EDAPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [edaJobs, setEdaJobs] = useState<EDAJob[]>([]);
  const [activeJob, setActiveJob] = useState<EDAJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [userData, projRes, edaRes] = await Promise.all([
        getCurrentUser(),
        api.get<Project>(`/projects/${id}`),
        api.get<EDAJob[]>(`/projects/${id}/eda`),
      ]);
      setUser(userData);
      setProject(projRes.data);
      setEdaJobs(edaRes.data);
      const latest = edaRes.data[0];
      if (latest && latest.status !== "completed" && latest.status !== "failed") {
        setActiveJob(latest);
      }
    } catch {
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleJobCreated = (job: EDAJob) => {
    setActiveJob(job);
    setEdaJobs((prev) => [job, ...prev]);
  };

  const handleJobUpdate = (updated: EDAJob) => {
    setEdaJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
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
      <Navbar userName={user?.full_name || user?.username} />
      <div className="flex">
        <Sidebar projectId={id} projectName={project.name} />
        <main className="flex-1 p-6">
          {/* Header */}
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
              <BarChart2 className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--text)]">Exploratory Data Analysis</h1>
              <p className="text-sm text-[var(--text-muted)]">{project.name}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 max-w-5xl">
            {/* Upload section */}
            <div>
              <h2 className="text-base font-semibold text-[var(--text)] mb-3">Upload Dataset</h2>
              <FileUpload projectId={id} onJobCreated={handleJobCreated} />
            </div>

            {/* Results section */}
            <AnimatePresence>
              {activeJob && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <h2 className="text-base font-semibold text-[var(--text)] mb-3">Results</h2>
                  <EDAResults job={activeJob} onUpdate={handleJobUpdate} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Previous jobs */}
          {edaJobs.length > 0 && (
            <div className="mt-8 max-w-5xl">
              <button
                onClick={() => setHistoryExpanded(!historyExpanded)}
                className="flex items-center gap-2 text-sm font-semibold text-[var(--text)] mb-3 hover:text-[var(--primary)] transition-colors"
              >
                Previous EDA Jobs ({edaJobs.length})
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
                    {edaJobs.map((job) => (
                      <Card
                        key={job.id}
                        className="cursor-pointer hover:border-[var(--primary)]/50 transition-colors"
                        onClick={() => setActiveJob(job)}
                      >
                        <CardContent className="flex items-center justify-between p-4">
                          <div>
                            <p className="text-sm font-medium text-[var(--text)]">{job.filename}</p>
                            <p className="flex items-center gap-1 text-xs text-[var(--text-muted)] mt-0.5">
                              <CalendarDays className="h-3 w-3" />
                              {formatDate(job.created_at)}
                            </p>
                          </div>
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
