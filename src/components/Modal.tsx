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
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxW = size === "large" ? "max-w-[900px]" : size === "small" ? "max-w-[400px]" : "max-w-[600px]";

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[1050] flex items-center justify-center p-4 fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`bg-white rounded-2xl shadow-xl ${maxW} w-full max-h-[90vh] flex flex-col slide-in-down`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-2xl font-bold m-0">{title}</h2>
          <button
            onClick={onClose}
            className="text-3xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full w-8 h-8 flex items-center justify-center cursor-pointer"
          >
            &times;
          </button>
        </div>
        <div className="flex-1 px-6 py-5 overflow-y-auto">{children}</div>
        {buttons.length > 0 && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
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
      <p className="text-gray-700" dangerouslySetInnerHTML={{ __html: message }} />
      <div className="flex gap-3 justify-end mt-6">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 cursor-pointer"
        >
          {cancelText}
        </button>
        <button
          onClick={() => { onConfirm(); onClose(); }}
          className={`px-4 py-2 text-sm font-medium text-white rounded-lg cursor-pointer ${
            danger ? "bg-red-500 hover:bg-red-600" : "bg-gradient-to-br from-primary to-secondary hover:from-primary-dark hover:to-secondary-dark"
          }`}
        >
          {confirmText}
        </button>
      </div>
    </Modal>
  );
}
