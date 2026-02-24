"use client";

import type { ReactNode } from "react";
import ThemeProvider from "@/components/providers/theme-provider";

type ClientProvidersProps = {
  children: ReactNode;
};

export default function ClientProviders({ children }: ClientProvidersProps) {
  return (
    <ThemeProvider>
      {children}
    </ThemeProvider>
  );
}
