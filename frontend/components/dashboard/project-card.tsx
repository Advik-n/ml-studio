"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Folder,
  BarChart2,
  GitBranch,
  Layers,
  Image,
  CalendarDays,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import type { Project } from "@/lib/types";

const typeConfig = {
  eda: { label: "EDA", icon: <BarChart2 className="h-3.5 w-3.5" />, variant: "eda" as const },
  pipeline: { label: "Pipeline", icon: <GitBranch className="h-3.5 w-3.5" />, variant: "pipeline" as const },
  mixed: { label: "Full Suite", icon: <Layers className="h-3.5 w-3.5" />, variant: "mixed" as const },
  image: { label: "Image", icon: <Image className="h-3.5 w-3.5" />, variant: "image" as const },
};

interface ProjectCardProps {
  project: Project;
  onDelete?: (id: string) => void | Promise<void>;
}

export default function ProjectCard({ project, onDelete }: ProjectCardProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const config = typeConfig[project.project_type as keyof typeof typeConfig];

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDelete) return;
    if (!confirm(`Delete "${project.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await onDelete(project.id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: "0 8px 30px var(--shadow)" }}
      transition={{ duration: 0.15 }}
    >
      <Card className="group cursor-pointer overflow-hidden h-full flex flex-col">
        {/* Color accent bar */}
        <div
          className={`h-1.5 w-full ${
            project.project_type === "eda"
              ? "bg-gradient-to-r from-blue-500 to-cyan-400"
              : project.project_type === "pipeline"
              ? "bg-gradient-to-r from-purple-500 to-violet-400"
              : project.project_type === "image"
              ? "bg-gradient-to-r from-orange-500 to-amber-400"
              : "bg-gradient-to-r from-emerald-500 to-teal-400"
          }`}
        />

        <CardContent className="p-5 flex flex-col flex-1 gap-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-2)]">
                <Folder className="h-5 w-5 text-[var(--primary)]" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-[var(--text)] truncate">{project.name}</h3>
                <Badge variant={config.variant} className="mt-0.5 flex items-center gap-1 w-fit">
                  {config.icon}
                  {config.label}
                </Badge>
              </div>
            </div>
          </div>

          {/* Description */}
          {project.description && (
            <p className="text-sm text-[var(--text-muted)] line-clamp-2 flex-1">
              {project.description}
            </p>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between mt-auto pt-2 border-t border-[var(--border)]">
            <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatDate(project.created_at)}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleDelete}
                disabled={deleting}
                className="opacity-0 group-hover:opacity-100 text-red-500 hover:bg-red-500/10 hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button
                size="icon-sm"
                onClick={() => router.push(`/projects/${project.id}`)}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
