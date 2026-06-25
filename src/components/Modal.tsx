"use client";

import React, { useEffect } from "react";

interface ModalButton {
  label: string;
  className?: string;
  onClick: () => void;
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  buttons?: ModalButton[];
  size?: "small" | "medium" | "large";
}

export default function Modal({ isOpen, onClose, title, children, buttons = [], size = "medium" }: ModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEsc);
      // iOS-safe scroll lock
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEsc);
      const scrollY = document.body.style.top;
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.overflow = "";
      if (scrollY) window.scrollTo(0, -parseInt(scrollY));
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxW = size === "large" ? "max-w-[900px]" : size === "small" ? "max-w-sm" : "max-w-lg";

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[1050] flex items-end sm:items-center justify-center overflow-hidden fade-in"
      style={{
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`bg-white shadow-xl w-full ${maxW} flex flex-col slide-in-down
        rounded-t-2xl sm:rounded-2xl
        max-h-[92dvh] sm:max-h-[90dvh]`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 shrink-0">
          <h2 className="text-xl font-bold m-0 text-stone-900">{title}</h2>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-full w-8 h-8 flex items-center justify-center cursor-pointer text-xl"
          >
            &times;
          </button>
        </div>
        <div className="flex-1 px-5 py-5 overflow-y-auto overflow-x-hidden">{children}</div>
        {buttons.length > 0 && (
          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-stone-200 shrink-0">
            {buttons.map((btn, i) => (
              <button key={i} onClick={btn.onClick} className={btn.className || "btn-secondary"}>
                {btn.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirmation",
  message,
  confirmText = "Confirmer",
  cancelText = "Annuler",
  danger = false,
}: ConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="small">
      <p className="text-stone-700" dangerouslySetInnerHTML={{ __html: message }} />
      <div className="flex gap-3 justify-end mt-6">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium bg-stone-100 text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-200 cursor-pointer"
        >
          {cancelText}
        </button>
        <button
          onClick={() => { onConfirm(); onClose(); }}
          className={`px-4 py-2 text-sm font-medium text-white rounded-lg cursor-pointer ${
            danger ? "bg-red-500 hover:bg-red-600" : "bg-brand-600 hover:bg-brand-700 transition-colors"
          }`}
        >
          {confirmText}
        </button>
      </div>
    </Modal>
  );
}
