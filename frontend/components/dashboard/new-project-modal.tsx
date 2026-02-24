"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, BarChart2, GitBranch, Layers, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import api from "@/lib/api";
import { toast } from "sonner";
import type { Project } from "@/lib/types";

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (project: Project) => void;
}

const types = [
  {
    value: "eda" as const,
    label: "EDA",
    description: "Exploratory Data Analysis",
    icon: <BarChart2 className="h-6 w-6" />,
    color: "text-blue-500 bg-blue-500/10 border-blue-500/30",
    selectedColor: "border-blue-500 bg-blue-500/15",
  },
  {
    value: "pipeline" as const,
    label: "ML Pipeline",
    description: "Train & deploy ML models",
    icon: <GitBranch className="h-6 w-6" />,
    color: "text-purple-500 bg-purple-500/10 border-purple-500/30",
    selectedColor: "border-purple-500 bg-purple-500/15",
  },
  {
    value: "both" as const,
    label: "Full Suite",
    description: "EDA + ML Pipeline",
    icon: <Layers className="h-6 w-6" />,
    color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30",
    selectedColor: "border-emerald-500 bg-emerald-500/15",
  },
];

export default function NewProjectModal({ open, onClose, onCreated }: NewProjectModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"eda" | "pipeline" | "both">("both");
  const [nameError, setNameError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      setNameError("Project name is required");
      return;
    }
    setNameError("");
    setIsLoading(true);
    try {
      const response = await api.post<Project>("/projects", { name: name.trim(), description, type });
      toast.success("Project created!");
      onCreated(response.data);
      setName("");
      setDescription("");
      setType("both");
      onClose();
    } catch {
      toast.error("Failed to create project.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] p-5">
              <div className="flex items-center gap-2">
                <FolderPlus className="h-5 w-5 text-[var(--primary)]" />
                <h2 className="text-lg font-semibold text-[var(--text)]">New Project</h2>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-5">
              <Input
                label="Project Name *"
                placeholder="My ML Project"
                value={name}
                onChange={(e) => setName(e.target.value)}
                error={nameError}
              />

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[var(--text)]">Description</label>
                <textarea
                  placeholder="Optional project description..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent resize-none"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-[var(--text)]">Project Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {types.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setType(t.value)}
                      className={`rounded-xl border p-3 flex flex-col items-center gap-2 text-center transition-all duration-150 ${
                        type === t.value ? t.selectedColor : `${t.color} hover:opacity-80`
                      } ${type === t.value ? "ring-2 ring-offset-1 ring-[var(--primary)]" : ""}`}
                    >
                      <span className={type === t.value ? "" : "opacity-70"}>{t.icon}</span>
                      <div>
                        <p className="text-xs font-semibold text-[var(--text)]">{t.label}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">{t.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] p-5">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleCreate} isLoading={isLoading}>
                Create Project
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
