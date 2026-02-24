// Toast event bus — components call toast.success/error, the ToastProvider listens

export type ToastVariant = "success" | "error" | "info";

export interface ToastEvent {
  id: string;
  message: string;
  variant: ToastVariant;
}

type ToastListener = (event: ToastEvent) => void;

const listeners: Set<ToastListener> = new Set();
let counter = 0;

function emit(message: string, variant: ToastVariant) {
  const event: ToastEvent = { id: String(++counter), message, variant };
  listeners.forEach((fn) => fn(event));
}

export const toast = {
  success: (message: string) => emit(message, "success"),
  error: (message: string) => emit(message, "error"),
  info: (message: string) => emit(message, "info"),
};

export function subscribeToast(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
