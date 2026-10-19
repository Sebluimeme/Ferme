"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import styles from "./Toast.module.css";
import { CheckCircle2, CircleAlert, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";

interface Toast {
  id: number;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message?: string;
}

const ToastContext = createContext<{
  showToast: (toast: Omit<Toast, "id">) => void;
} | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}

const icons: Record<Toast["type"], LucideIcon> = {
  success: CheckCircle2,
  error: CircleAlert,
  warning: TriangleAlert,
  info: Info,
};

const borderColors: Record<string, string> = {
  success: "border-l-green-500",
  error: "border-l-red-500",
  warning: "border-l-amber-500",
  info: "border-l-blue-500",
};

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className={styles.region}>
        {toasts.map((toast) => { const Icon = icons[toast.type]; return (
          <div
            key={toast.id}
            role={toast.type === "error" ? "alert" : "status"}
            className={`${styles.toast} ${borderColors[toast.type]}`}
          >
            <Icon className={styles.icon} aria-hidden="true" />
            <div className={styles.content}>
              {toast.title && <div className={styles.title}>{toast.title}</div>}
              {toast.message && <div className={styles.message}>{toast.message}</div>}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              type="button"
              aria-label="Fermer le message"
              className={styles.close}
            >
              <X size={22} aria-hidden="true" />
            </button>
          </div>
        ); })}
      </div>
    </ToastContext.Provider>
  );
}
