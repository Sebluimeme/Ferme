1|"use client";
2|
3|import React, { useEffect } from "react";
4|
5|interface ModalButton {
6|  label: string;
7|  className?: string;
8|  onClick: () => void;
9|}
10|
11|interface ModalProps {
12|  isOpen: boolean;
13|  onClose: () => void;
14|  title: string;
15|  children: React.ReactNode;
16|  buttons?: ModalButton[];
17|  size?: "small" | "medium" | "large";
18|}
19|
20|export default function Modal({ isOpen, onClose, title, children, buttons = [], size = "medium" }: ModalProps) {
21|  useEffect(() => {
22|    const handleEsc = (e: KeyboardEvent) => {
23|      if (e.key === "Escape") onClose();
24|    };
25|    if (isOpen) {
26|      document.addEventListener("keydown", handleEsc);
27|      // iOS-safe scroll lock
28|      const scrollY = window.scrollY;
29|      document.body.style.position = "fixed";
30|      document.body.style.top = `-${scrollY}px`;
31|      document.body.style.left = "0";
32|      document.body.style.right = "0";
33|      document.body.style.overflow = "hidden";
34|    }
35|    return () => {
36|      document.removeEventListener("keydown", handleEsc);
37|      const scrollY = document.body.style.top;
38|      document.body.style.position = "";
39|      document.body.style.top = "";
40|      document.body.style.left = "";
41|      document.body.style.right = "";
42|      document.body.style.overflow = "";
43|      if (scrollY) window.scrollTo(0, -parseInt(scrollY));
44|    };
45|  }, [isOpen, onClose]);
46|
47|  if (!isOpen) return null;
48|
49|  const maxW = size === "large" ? "max-w-[900px]" : size === "small" ? "max-w-sm" : "max-w-lg";
50|
51|  return (
52|    <div
53|      className="fixed inset-0 bg-black/50 z-[1050] flex items-end sm:items-center justify-center overflow-hidden fade-in"
54|      style={{
55|        paddingLeft: "env(safe-area-inset-left, 0px)",
56|        paddingRight: "env(safe-area-inset-right, 0px)",
57|        paddingBottom: "env(safe-area-inset-bottom, 0px)",
58|      }}
59|      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
60|    >
61|      <div className={`bg-white shadow-xl w-full ${maxW} flex flex-col slide-in-down
62|        rounded-t-2xl sm:rounded-2xl
63|        max-h-[92dvh] sm:max-h-[90dvh]`}
64|      >
65|        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 shrink-0">
66|          <h2 className="text-xl font-bold m-0 text-stone-900">{title}</h2>
67|          <button
68|            onClick={onClose}
69|            className="text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-full w-8 h-8 flex items-center justify-center cursor-pointer text-xl"
70|          >
71|            &times;
72|          </button>
73|        </div>
74|        <div className="flex-1 px-5 py-5 overflow-y-auto overflow-x-hidden">{children}</div>
75|        {buttons.length > 0 && (
76|          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-stone-200 shrink-0">
77|            {buttons.map((btn, i) => (
78|              <button key={i} onClick={btn.onClick} className={btn.className || "btn-secondary"}>
79|                {btn.label}
80|              </button>
81|            ))}
82|          </div>
83|        )}
84|      </div>
85|    </div>
86|  );
87|}
88|
89|interface ConfirmModalProps {
90|  isOpen: boolean;
91|  onClose: () => void;
92|  onConfirm: () => void;
93|  title?: string;
94|  message: string;
95|  confirmText?: string;
96|  cancelText?: string;
97|  danger?: boolean;
98|}
99|
100|export function ConfirmModal({
101|  isOpen,
102|  onClose,
103|  onConfirm,
104|  title = "Confirmation",
105|  message,
106|  confirmText = "Confirmer",
107|  cancelText = "Annuler",
108|  danger = false,
109|}: ConfirmModalProps) {
110|  return (
111|    <Modal isOpen={isOpen} onClose={onClose} title={title} size="small">
112|      <p className="text-stone-700" dangerouslySetInnerHTML={{ __html: message }} />
113|      <div className="flex gap-3 justify-end mt-6">
114|        <button
115|          onClick={onClose}
116|          className="px-4 py-2 text-sm font-medium bg-stone-100 text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-200 cursor-pointer"
117|        >
118|          {cancelText}
119|        </button>
120|        <button
121|          onClick={() => { onConfirm(); onClose(); }}
122|          className={`px-4 py-2 text-sm font-medium text-white rounded-lg cursor-pointer ${
123|            danger ? "bg-red-500 hover:bg-red-600" : "bg-brand-600 hover:bg-brand-700 transition-colors"
124|          }`}
125|        >
126|          {confirmText}
127|        </button>
128|      </div>
129|    </Modal>
130|  );
131|}
132|