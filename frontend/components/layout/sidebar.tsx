"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutGrid,
  BarChart2,
  GitBranch,
  Layers,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
} from "lucide-react";

interface SidebarProps {
  projectId: string;
  projectName: string;
  projectType?: "eda" | "pipeline" | "mixed";
}

export default function Sidebar({ projectId, projectName, projectType = "mixed" }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const links = [
    {
      href: `/projects/${projectId}`,
      label: "Overview",
      icon: <LayoutGrid className="h-4 w-4 shrink-0" />,
      exact: true,
      show: true,
    },
    {
      href: `/projects/${projectId}/eda`,
      label: "EDA",
      icon: <BarChart2 className="h-4 w-4 shrink-0" />,
      show: projectType === "eda",
    },
    {
      href: `/projects/${projectId}/pipeline`,
      label: "ML Pipeline",
      icon: <GitBranch className="h-4 w-4 shrink-0" />,
      show: projectType === "pipeline",
    },
    {
      href: `/projects/${projectId}/fullsuite`,
      label: "Full Suite",
      icon: <Layers className="h-4 w-4 shrink-0" />,
      show: projectType === "mixed",
    },
  ].filter((l) => l.show);

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 220 }}
      transition={{ duration: 0.2 }}
      className="relative flex flex-col border-r border-[var(--border)] bg-[var(--surface)] h-full min-h-screen"
    >
      {/* Project header */}
      <div className="flex h-14 items-center gap-2 border-b border-[var(--border)] px-3 overflow-hidden">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/20">
          <FolderOpen className="h-4 w-4 text-[var(--primary)]" />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-sm font-semibold text-[var(--text)] truncate"
            >
              {projectName}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Nav Links */}
      <nav className="flex flex-col gap-1 p-2 flex-1">
        {links.map((link) => {
          const active = link.exact
            ? pathname === link.href
            : pathname.startsWith(link.href);

          return (
            <Link
              key={link.href}
              href={link.href}
              title={collapsed ? link.label : undefined}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-[var(--primary)] text-white"
                  : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              }`}
            >
              {link.icon}
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    {link.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-16 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)] shadow-sm z-10"
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5" />
        ) : (
          <ChevronLeft className="h-3.5 w-3.5" />
        )}
      </button>
    </motion.aside>
  );
}
