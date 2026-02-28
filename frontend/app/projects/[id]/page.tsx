"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BarChart2,
  GitBranch,
  CalendarDays,
  ExternalLink,
  Tag,
} from "lucide-react";
import Navbar from "@/components/layout/navbar";
import Sidebar from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import api from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { Project, User, EDAJob, PipelineJob } from "@/lib/types";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [edaJobs, setEdaJobs] = useState<EDAJob[]>([]);
  const [pipelineJobs, setPipelineJobs] = useState<PipelineJob[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [userData, projRes, edaRes, pipeRes] = await Promise.all([
        getCurrentUser(),
        api.get<Project>(`/projects/${id}`),
        api.get<EDAJob[]>(`/eda/${id}/jobs`),
        api.get<PipelineJob[]>(`/pipeline/${id}/jobs`),
      ]);
      setUser(userData);
      setProject(projRes.data);
      setEdaJobs(edaRes.data);
      setPipelineJobs(pipeRes.data);
    } catch {
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { fetchData(); }, [fetchData]);

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
        <main className="flex-1 p-6 max-w-4xl">
          {/* Back + Header */}
          <div className="mb-6">
            <button
              onClick={() => router.push("/dashboard")}
              className="flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)] mb-4 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Dashboard
            </button>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-[var(--text)]">{project.name}</h1>
                {project.description && (
                  <p className="text-[var(--text-muted)] mt-1">{project.description}</p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant={project.project_type as "eda" | "pipeline" | "mixed"}>
                    <Tag className="h-3 w-3 mr-1" />
                    {project.project_type === "mixed" ? "Full Suite" : project.project_type.toUpperCase()}
                  </Badge>
                  <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Created {formatDate(project.created_at)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-3 mb-8">
            {project.project_type === "eda" && (
              <Button
                variant="secondary"
                className="h-auto py-4 flex-col gap-2"
                onClick={() => router.push(`/projects/${id}/eda`)}
              >
                <BarChart2 className="h-6 w-6 text-blue-500" />
                <span>Open EDA Tool</span>
              </Button>
            )}
            {project.project_type === "pipeline" && (
              <Button
                variant="secondary"
                className="h-auto py-4 flex-col gap-2"
                onClick={() => router.push(`/projects/${id}/pipeline`)}
              >
                <GitBranch className="h-6 w-6 text-purple-500" />
                <span>Open ML Pipeline</span>
              </Button>
            )}
            {project.project_type === "mixed" && (
              <Button
                variant="secondary"
                className="h-auto py-4 flex-col gap-2 col-span-2"
                onClick={() => router.push(`/projects/${id}/fullsuite`)}
              >
                <BarChart2 className="h-6 w-6 text-blue-500" />
                <span>Open Full Suite (EDA + Pipeline)</span>
              </Button>
            )}
          </div>

          {/* EDA Jobs */}
          {edaJobs.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-[var(--text)] mb-3">
                EDA Jobs ({edaJobs.length})
              </h2>
              <div className="space-y-2">
                {edaJobs.slice(0, 5).map((job) => (
                  <motion.div key={job.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <Card>
                      <CardContent className="flex items-center justify-between p-4">
                        <div>
                          <p className="text-sm font-medium text-[var(--text)]">{job.input_filename}</p>
                          <p className="text-xs text-[var(--text-muted)]">{formatDate(job.created_at)}</p>
                        </div>
                        <div className="flex items-center gap-2">
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
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => router.push(`/projects/${id}/eda`)}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </section>
          )}

          {/* Pipeline Jobs */}
          {pipelineJobs.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-[var(--text)] mb-3">
                Pipeline Jobs ({pipelineJobs.length})
              </h2>
              <div className="space-y-2">
                {pipelineJobs.slice(0, 5).map((job) => (
                  <motion.div key={job.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <Card>
                      <CardContent className="flex items-center justify-between p-4">
                        <div>
                          <p className="text-sm font-medium text-[var(--text)]">
                            {job.model_name} · {job.model_type}
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">{formatDate(job.created_at)}</p>
                        </div>
                        <div className="flex items-center gap-2">
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
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => router.push(`/projects/${id}/pipeline`)}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
