"use client";

import type { ReactNode } from "react";
import { Toaster } from "react-hot-toast";
import ThemeProvider from "@/components/providers/theme-provider";

type ClientProvidersProps = {
  children: ReactNode;
};

export default function ClientProviders({ children }: ClientProvidersProps) {
  return (
    <ThemeProvider>
      {children}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: "var(--surface)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            fontSize: "14px",
          },
        }}
      />
    </ThemeProvider>
  );
}
