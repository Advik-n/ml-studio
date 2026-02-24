"use client";

import React from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setTheme, getTheme, type Theme } from "@/lib/theme";
import { toast } from "@/lib/toast";

interface ThemePreview {
  id: Theme;
  label: string;
  description: string;
  bg: string;
  surface: string;
  text: string;
  primary: string;
  accent: string;
}

const THEMES: ThemePreview[] = [
  {
    id: "dark",
    label: "Dark",
    description: "Deep dark theme for low-light environments",
    bg: "#0f172a",
    surface: "#1e293b",
    text: "#f1f5f9",
    primary: "#8b5cf6",
    accent: "#34d399",
  },
  {
    id: "light",
    label: "Light",
    description: "Clean light theme for bright environments",
    bg: "#f8fafc",
    surface: "#ffffff",
    text: "#1e293b",
    primary: "#7c3aed",
    accent: "#10b981",
  },
  {
    id: "purple",
    label: "Purple (Dracula)",
    description: "Vivid purple Dracula-inspired theme",
    bg: "#282a36",
    surface: "#44475a",
    text: "#f8f8f2",
    primary: "#bd93f9",
    accent: "#50fa7b",
  },
];

interface ThemeSelectorProps {
  currentTheme?: Theme;
  onChange?: (theme: Theme) => void;
}

export default function ThemeSelector({ currentTheme: externalTheme, onChange }: ThemeSelectorProps) {
  const [selected, setSelected] = React.useState<Theme>(externalTheme || getTheme());

  const handleApply = (theme: Theme) => {
    setSelected(theme);
    setTheme(theme);
    onChange?.(theme);
    toast.success(`${THEMES.find((t) => t.id === theme)?.label} theme applied!`);
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {THEMES.map((theme) => {
        const isSelected = selected === theme.id;
        return (
          <motion.div
            key={theme.id}
            whileHover={{ y: -2 }}
            transition={{ duration: 0.15 }}
          >
            <button
              onClick={() => handleApply(theme.id)}
              className={`w-full rounded-xl border-2 overflow-hidden transition-all text-left ${
                isSelected
                  ? "border-[var(--primary)] shadow-lg shadow-[var(--primary)]/20"
                  : "border-[var(--border)] hover:border-[var(--primary)]/50"
              }`}
            >
              {/* Preview */}
              <div
                className="h-28 p-3 flex flex-col gap-2"
                style={{ backgroundColor: theme.bg }}
              >
                {/* Mock navbar */}
                <div
                  className="h-5 rounded flex items-center px-2 gap-1"
                  style={{ backgroundColor: theme.surface }}
                >
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: theme.primary }} />
                  <div className="h-1.5 w-12 rounded-full" style={{ backgroundColor: theme.text, opacity: 0.3 }} />
                </div>
                {/* Mock cards */}
                <div className="flex gap-1.5 flex-1">
                  {[theme.primary, theme.accent, theme.surface].map((color, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded"
                      style={{ backgroundColor: i < 2 ? `${color}33` : color }}
                    />
                  ))}
                </div>
                {/* Mock button */}
                <div
                  className="h-4 w-16 rounded text-[8px] font-bold flex items-center justify-center"
                  style={{ backgroundColor: theme.primary, color: "#fff" }}
                >
                  Button
                </div>
              </div>

              {/* Label */}
              <div
                className="p-3 flex items-center justify-between"
                style={{ backgroundColor: theme.surface }}
              >
                <div>
                  <p className="text-sm font-semibold" style={{ color: theme.text }}>{theme.label}</p>
                  <p className="text-xs" style={{ color: `${theme.text}80` }}>{theme.description}</p>
                </div>
                {isSelected && (
                  <div
                    className="h-5 w-5 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: theme.primary }}
                  >
                    <Check className="h-3 w-3 text-white" />
                  </div>
                )}
              </div>
            </button>
          </motion.div>
        );
      })}
    </div>
  );
}
