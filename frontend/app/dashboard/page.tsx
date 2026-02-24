"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Plus, BarChart2, GitBranch, Folder, Layers } from "lucide-react";
import Navbar from "@/components/layout/navbar";
import ProjectCard from "@/components/dashboard/project-card";
import NewProjectModal from "@/components/dashboard/new-project-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import api from "@/lib/api";
import toast from "react-hot-toast";
import type { Project, User } from "@/lib/types";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

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

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/projects/${id}`);
      setProjects((p) => p.filter((x) => x.id !== id));
      toast.success("Project deleted.");
    } catch {
      toast.error("Failed to delete project.");
    }
  };

  const stats = [
    { label: "Total Projects", value: projects.length, icon: <Folder className="h-5 w-5" />, color: "text-blue-500 bg-blue-500/10" },
    { label: "EDA Projects", value: projects.filter((p) => p.type === "eda" || p.type === "both").length, icon: <BarChart2 className="h-5 w-5" />, color: "text-purple-500 bg-purple-500/10" },
    { label: "ML Pipelines", value: projects.filter((p) => p.type === "pipeline" || p.type === "both").length, icon: <GitBranch className="h-5 w-5" />, color: "text-emerald-500 bg-emerald-500/10" },
    { label: "Full Suite", value: projects.filter((p) => p.type === "both").length, icon: <Layers className="h-5 w-5" />, color: "text-orange-500 bg-orange-500/10" },
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

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar userName={user?.full_name || user?.username} />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Welcome */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-2xl font-bold text-[var(--text)]">
            Welcome back, {user?.full_name?.split(" ")[0] || user?.username} 👋
          </h1>
          <p className="text-[var(--text-muted)] mt-1">
            Manage your machine learning projects and experiments
          </p>
        </motion.div>

        {/* Stats */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${stat.color}`}>
                    {stat.icon}
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

        {/* Projects */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text)]">Your Projects</h2>
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        </div>

        {projects.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--border)] py-16 text-center"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface)] mb-4">
              <Folder className="h-8 w-8 text-[var(--text-muted)]" />
            </div>
            <h3 className="text-lg font-semibold text-[var(--text)]">No projects yet</h3>
            <p className="text-sm text-[var(--text-muted)] mt-1 mb-6">
              Create your first ML project to get started
            </p>
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4" />
              Create Project
            </Button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project, i) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <ProjectCard project={project} onDelete={handleDelete} />
              </motion.div>
            ))}
          </div>
        )}
      </main>

      <NewProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(p) => setProjects((prev) => [p, ...prev])}
      />
    </div>
  );
}
