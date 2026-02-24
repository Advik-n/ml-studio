"use client";

import { useEffect } from "react";
import { applyTheme, getTheme } from "@/lib/theme";

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    applyTheme(getTheme());
  }, []);
  return <>{children}</>;
}
