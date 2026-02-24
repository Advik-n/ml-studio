export type Theme = "dark" | "light" | "purple";

const THEME_KEY = "ml-studio-theme";

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
  root.classList.remove("dark", "light", "purple");
  root.classList.add(theme);
}

export function cycleTheme(): Theme {
  const current = getTheme();
  const themes: Theme[] = ["dark", "light", "purple"];
  const nextIndex = (themes.indexOf(current) + 1) % themes.length;
  const next = themes[nextIndex];
  setTheme(next);
  return next;
}
