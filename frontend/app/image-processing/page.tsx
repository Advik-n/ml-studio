"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Image, Plus, ArrowRight } from "lucide-react";
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
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
              <Image className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--text)]">Image Processing</h1>
              <p className="text-sm text-[var(--text-muted)]">Computer vision, image analysis & classification</p>
            </div>
          </div>
        </div>

        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm text-[var(--text-muted)]">{projects.length} image project{projects.length !== 1 ? "s" : ""}</p>
          <Button onClick={() => router.push("/projects?create=image")}>
            <Plus className="h-4 w-4" /> New Image Project
          </Button>
        </div>

        {projects.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--border)] py-16 text-center"
          >
            <Image className="h-16 w-16 text-[var(--text-muted)] mb-4" />
            <h3 className="text-lg font-semibold text-[var(--text)]">No image projects yet</h3>
            <p className="text-sm text-[var(--text-muted)] mt-1 mb-6">Upload image datasets for EDA analysis and ML classification</p>
            <Button onClick={() => router.push("/projects?create=image")}>
              <Plus className="h-4 w-4" /> Create Image Project
            </Button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project, i) => (
              <motion.div key={project.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="cursor-pointer hover:border-[var(--primary)]/30 transition-all hover:shadow-lg" onClick={() => router.push(`/projects/${project.id}`)}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                        <Image className="h-5 w-5 text-orange-500" />
                      </div>
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
