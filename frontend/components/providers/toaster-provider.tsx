"use client";

import { useState, useEffect, useCallback } from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { CheckCircle, XCircle, Info, X } from "lucide-react";
import { subscribeToast, type ToastEvent } from "@/lib/toast";

const VARIANTS = {
  success: {
    icon: CheckCircle,
    className: "border-green-500/30 bg-green-500/10 text-green-400",
    iconClass: "text-green-400",
  },
  error: {
    icon: XCircle,
    className: "border-red-500/30 bg-red-500/10 text-red-400",
    iconClass: "text-red-400",
  },
  info: {
    icon: Info,
    className: "border-blue-500/30 bg-blue-500/10 text-blue-400",
    iconClass: "text-blue-400",
  },
};

interface ActiveToast extends ToastEvent {
  open: boolean;
}

export default function ToasterProvider() {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);

  const addToast = useCallback((event: ToastEvent) => {
    setToasts((prev) => [...prev, { ...event, open: true }]);
    // Auto-remove after 4.5s
    setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === event.id ? { ...t, open: false } : t))
      );
    }, 4000);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== event.id));
    }, 4600);
  }, []);

  useEffect(() => {
    return subscribeToast(addToast);
  }, [addToast]);

  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={4000}>
      {toasts.map((t) => {
        const v = VARIANTS[t.variant];
        const Icon = v.icon;
        return (
          <ToastPrimitive.Root
            key={t.id}
            open={t.open}
            onOpenChange={(open) => {
              if (!open) {
                setToasts((prev) =>
                  prev.map((x) => (x.id === t.id ? { ...x, open: false } : x))
                );
                setTimeout(() => {
                  setToasts((prev) => prev.filter((x) => x.id !== t.id));
                }, 300);
              }
            }}
            className={`flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm
              data-[state=open]:animate-in data-[state=closed]:animate-out
              data-[swipe=end]:animate-out data-[state=closed]:slide-out-to-right-full
              data-[state=open]:slide-in-from-top-2
              ${v.className}`}
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${v.iconClass}`} />
            <ToastPrimitive.Description asChild>
              <p className="flex-1 text-sm font-medium leading-snug">{t.message}</p>
            </ToastPrimitive.Description>
            <ToastPrimitive.Close asChild>
              <button className="ml-1 shrink-0 rounded opacity-60 hover:opacity-100 transition-opacity">
                <X className="h-3.5 w-3.5" />
              </button>
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        );
      })}
      <ToastPrimitive.Viewport className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]" />
    </ToastPrimitive.Provider>
  );
}
