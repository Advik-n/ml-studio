"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Plus, BarChart2, GitBranch, Folder, Layers, Image, Activity, ArrowRight, Sparkles } from "lucide-react";
import Navbar from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth";
import api from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { Project, User } from "@/lib/types";

export default function DashboardPage() {
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
      setProjects(projectsRes.data);
    } catch {
      router.push("/login");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const stats = [
    { label: "Total Projects", value: projects.length, icon: Folder, color: "text-blue-500 bg-blue-500/10" },
    { label: "EDA Projects", value: projects.filter(p => p.project_type === "eda" || p.project_type === "mixed").length, icon: BarChart2, color: "text-purple-500 bg-purple-500/10" },
    { label: "ML Pipelines", value: projects.filter(p => p.project_type === "pipeline" || p.project_type === "mixed").length, icon: GitBranch, color: "text-emerald-500 bg-emerald-500/10" },
    { label: "Image Projects", value: projects.filter(p => p.project_type === "image").length, icon: Image, color: "text-orange-500 bg-orange-500/10" },
  ];

  const quickActions = [
    { label: "EDA Analysis", desc: "Explore & analyze tabular data", icon: BarChart2, color: "from-blue-600 to-cyan-500", type: "eda" },
    { label: "ML Pipeline", desc: "Train & evaluate ML models", icon: GitBranch, color: "from-purple-600 to-pink-500", type: "pipeline" },
    { label: "Full Suite", desc: "End-to-end EDA + Pipeline", icon: Layers, color: "from-emerald-600 to-teal-500", type: "mixed" },
    { label: "Image Processing", desc: "Computer vision & image ML", icon: Image, color: "from-orange-600 to-amber-500", type: "image" },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <div className="h-16 bg-[var(--surface)] border-b border-[var(--border)]" />
        <div className="mx-auto max-w-7xl px-4 py-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-[var(--surface)] animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const recentProjects = [...projects].sort((a, b) => 
    new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()
  ).slice(0, 5);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar userName={user?.name || user?.username} />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Welcome */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-2xl font-bold text-[var(--text)]">
            Welcome back, {user?.name?.split(" ")[0] || user?.username} 👋
          </h1>
          <p className="text-[var(--text-muted)] mt-1">
            Your machine learning command center
          </p>
        </motion.div>

        {/* Stats */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map((stat, i) => (
            <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${stat.color}`}>
                    <stat.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-[var(--text)]">{stat.value}</p>
                    <p className="text-xs text-[var(--text-muted)]">{stat.label}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Quick Actions */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-5 w-5 text-[var(--primary)]" />
            <h2 className="text-lg font-semibold text-[var(--text)]">Quick Actions</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {quickActions.map((action, i) => (
              <motion.button
                key={action.type}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 + i * 0.05 }}
                onClick={() => router.push(`/projects?create=${action.type}`)}
                className="group rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left hover:border-[var(--primary)]/50 transition-all hover:shadow-lg"
              >
                <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${action.color} flex items-center justify-center mb-3`}>
                  <action.icon className="h-5 w-5 text-white" />
                </div>
                <p className="font-semibold text-[var(--text)] text-sm">{action.label}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{action.desc}</p>
                <ArrowRight className="h-4 w-4 text-[var(--text-muted)] mt-2 group-hover:text-[var(--primary)] transition-colors" />
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Recent Activity */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-[var(--primary)]" />
              <h2 className="text-lg font-semibold text-[var(--text)]">Recent Projects</h2>
            </div>
            <Button variant="ghost" size="sm" onClick={() => router.push("/projects")} className="text-[var(--text-muted)]">
              View All <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
          
          {recentProjects.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Folder className="h-12 w-12 text-[var(--text-muted)] mb-3" />
                <p className="text-[var(--text)] font-medium">No projects yet</p>
                <p className="text-sm text-[var(--text-muted)] mt-1">Create your first project to get started</p>
                <Button className="mt-4" onClick={() => router.push("/projects")}>
                  <Plus className="h-4 w-4" /> Create Project
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {recentProjects.map((project, i) => (
                <motion.div key={project.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 + i * 0.05 }}>
                  <Card className="cursor-pointer hover:border-[var(--primary)]/30 transition-colors" onClick={() => router.push(`/projects/${project.id}`)}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                          project.project_type === "image" ? "bg-orange-500/10 text-orange-500" :
                          project.project_type === "mixed" ? "bg-emerald-500/10 text-emerald-500" :
                          project.project_type === "pipeline" ? "bg-purple-500/10 text-purple-500" :
                          "bg-blue-500/10 text-blue-500"
                        }`}>
                          {project.project_type === "image" ? <Image className="h-4 w-4" /> :
                           project.project_type === "mixed" ? <Layers className="h-4 w-4" /> :
                           project.project_type === "pipeline" ? <GitBranch className="h-4 w-4" /> :
                           <BarChart2 className="h-4 w-4" />}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[var(--text)]">{project.name}</p>
                          <p className="text-xs text-[var(--text-muted)]">{formatDate(project.created_at)}</p>
                        </div>
                      </div>
                      <Badge variant={project.project_type as "eda" | "pipeline" | "mixed" | "image"}>
                        {project.project_type === "mixed" ? "Full Suite" : project.project_type === "image" ? "Image" : project.project_type.toUpperCase()}
                      </Badge>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
