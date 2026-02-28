"use client";
import React, { Suspense, useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Plus, Search, Filter, Folder } from "lucide-react";
import Navbar from "@/components/layout/navbar";
import ProjectCard from "@/components/dashboard/project-card";
import NewProjectModal from "@/components/dashboard/new-project-modal";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import api from "@/lib/api";
import { toast } from "@/lib/toast";
import type { Project, User } from "@/lib/types";

const TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "eda", label: "EDA" },
  { value: "pipeline", label: "Pipeline" },
  { value: "mixed", label: "Full Suite" },
  { value: "image", label: "Image" },
];

export default function ProjectsPage() {
  return (
    <Suspense>
      <ProjectsContent />
    </Suspense>
  );
}

function ProjectsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

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
  
  useEffect(() => {
    const createType = searchParams.get("create");
    if (createType && !loading) {
      setModalOpen(true);
    }
  }, [searchParams, loading]);

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/projects/${id}`);
      setProjects(p => p.filter(x => x.id !== id));
      toast.success("Project deleted.");
    } catch {
      toast.error("Failed to delete project.");
    }
  };

  const filtered = useMemo(() => {
    return projects.filter(p => {
      const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
      const matchesType = typeFilter === "all" || p.project_type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [projects, search, typeFilter]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <div className="h-16 bg-[var(--surface)] border-b border-[var(--border)]" />
        <div className="mx-auto max-w-7xl px-4 py-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-40 rounded-xl bg-[var(--surface)] animate-pulse" />
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
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Projects</h1>
            <p className="text-sm text-[var(--text-muted)]">{projects.length} projects total</p>
          </div>
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> New Project
          </Button>
        </div>

        {/* Search + Filter */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search projects..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-8 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none appearance-none cursor-pointer"
            >
              {TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Project Grid */}
        {filtered.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--border)] py-16 text-center"
          >
            <Folder className="h-16 w-16 text-[var(--text-muted)] mb-4" />
            <h3 className="text-lg font-semibold text-[var(--text)]">
              {search || typeFilter !== "all" ? "No matching projects" : "No projects yet"}
            </h3>
            <p className="text-sm text-[var(--text-muted)] mt-1 mb-6">
              {search || typeFilter !== "all" ? "Try adjusting your filters" : "Create your first ML project to get started"}
            </p>
            {!search && typeFilter === "all" && (
              <Button onClick={() => setModalOpen(true)}>
                <Plus className="h-4 w-4" /> Create Project
              </Button>
            )}
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((project, i) => (
              <motion.div key={project.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <ProjectCard project={project} onDelete={handleDelete} />
              </motion.div>
            ))}
          </div>
        )}
      </main>
      <NewProjectModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={p => setProjects(prev => [p, ...prev])} />
    </div>
  );
}
