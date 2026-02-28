export type Theme = "dark" | "light" | "purple" | "ocean" | "forest" | "sunset" | "solar" | "midnight";

const THEME_KEY = "ml-studio-theme";

export const THEMES: { id: Theme; label: string; color: string }[] = [
  { id: "dark", label: "Dark", color: "#1e293b" },
  { id: "light", label: "Light", color: "#f8fafc" },
  { id: "purple", label: "Purple", color: "#bd93f9" },
  { id: "ocean", label: "Ocean", color: "#0ea5e9" },
  { id: "forest", label: "Forest", color: "#22c55e" },
  { id: "sunset", label: "Sunset", color: "#ef4444" },
  { id: "solar", label: "Solar", color: "#eab308" },
  { id: "midnight", label: "Midnight", color: "#a855f7" },
];

export function getTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return (localStorage.getItem(THEME_KEY) as Theme) || "dark";
}

export function setTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}

export function applyTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("dark", "light", "purple", "ocean", "forest", "sunset", "solar", "midnight");
  root.classList.add(theme);
}

export function cycleTheme(): Theme {
  const current = getTheme();
  const ids = THEMES.map(t => t.id);
  const nextIndex = (ids.indexOf(current) + 1) % ids.length;
  const next = ids[nextIndex];
  setTheme(next);
  return next;
}
