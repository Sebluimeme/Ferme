"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

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

const icons: Record<string, string> = {
  success: "\u2713",
  error: "\u2717",
  warning: "\u26A0",
  info: "\u2139",
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
      <div className="fixed top-[80px] right-4 z-[1070] flex flex-col gap-2 max-w-[400px]">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-start gap-3 px-4 py-3 bg-white rounded-xl shadow-lg border-l-4 ${borderColors[toast.type]} slide-in-right min-w-[300px]`}
          >
            <span className="text-xl shrink-0">{icons[toast.type]}</span>
            <div className="flex-1">
              {toast.title && <div className="font-semibold text-sm">{toast.title}</div>}
              {toast.message && <div className="text-sm text-gray-600">{toast.message}</div>}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-gray-400 hover:text-gray-700 text-lg shrink-0 cursor-pointer"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
