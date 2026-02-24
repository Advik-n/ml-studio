import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    completed: "success",
    failed: "error",
    running: "processing",
    pending: "pending",
    uploading: "processing",
    analyzing: "processing",
    generating_notebook: "processing",
    creating_report: "processing",
    cleaning_data: "processing",
  };
  return map[status] || "default";
}
