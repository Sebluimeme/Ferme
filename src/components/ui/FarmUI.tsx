"use client";

import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type ReactNode, type RefObject } from "react";
import { AlertCircle, CheckCircle2, Info, LoaderCircle, X } from "lucide-react";
import { createPortal } from "react-dom";
import styles from "./FarmUI.module.css";

export { styles as farmStyles };

let scrollLocks = 0;
let previousOverflow = "";
export function useBodyScrollLock() {
  useEffect(() => {
    if (scrollLocks === 0) { previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; }
    scrollLocks += 1;
    return () => { scrollLocks -= 1; if (scrollLocks === 0) document.body.style.overflow = previousOverflow; };
  }, []);
}

export function useVisualViewport() {
  const [viewport, setViewport] = useState<CSSProperties>({});
  useEffect(() => {
    const refresh = () => { const visual = window.visualViewport; if (visual?.scale === 1) setViewport({ height: `${visual.height}px`, top: `${visual.offsetTop}px`, bottom: "auto" }); };
    refresh();
    window.visualViewport?.addEventListener("resize", refresh);
    window.visualViewport?.addEventListener("scroll", refresh);
    return () => { window.visualViewport?.removeEventListener("resize", refresh); window.visualViewport?.removeEventListener("scroll", refresh); };
  }, []);
  return viewport;
}

export function Button({ variant = "secondary", fullWidth = false, busy = false, children, className = "", disabled, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; fullWidth?: boolean; busy?: boolean }) {
  return <button type={type} className={`${styles.button} ${styles[variant]} ${fullWidth ? styles.fullWidth : ""} ${className}`} disabled={disabled || busy} aria-busy={busy || undefined} {...props}>{busy && <LoaderCircle className={styles.spinner} aria-hidden="true" />}{children}</button>;
}

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`${styles.card} ${className}`} {...props} />;
}

export function Field({ label, hint, error, htmlFor, children }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; htmlFor?: string; children: ReactNode }) {
  return <div className={styles.field}><label className={styles.label} htmlFor={htmlFor}>{label}</label>{children}{hint && <p className={styles.hint}>{hint}</p>}{error && <p className={styles.fieldError} role="alert">{error}</p>}</div>;
}

export function Notice({ tone = "info", children, ...props }: HTMLAttributes<HTMLDivElement> & { tone?: "info" | "error" | "success" | "warning" }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "info" ? Info : AlertCircle;
  return <div role={tone === "error" ? "alert" : "status"} {...props} className={`${styles.notice} ${styles[tone]} ${props.className || ""}`}><Icon aria-hidden="true" /><div>{children}</div></div>;
}

/** Keeps keyboard focus in the topmost dialog and returns it to its trigger. */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, onClose: () => void, busy = false) {
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll<HTMLElement>("[data-farm-dialog]");
      if (dialogs[dialogs.length - 1] !== dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busyRef.current) closeRef.current();
      }
      if (event.key !== "Tab" || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex="0"]')).filter(item => !item.hidden && item.getClientRects().length > 0);
      if (!items.length) { event.preventDefault(); dialog.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [ref]);
}

export function Sheet({ title, description, onClose, children, footer, busy = false }: { title: string; description?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; busy?: boolean }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, onClose, busy);
  useBodyScrollLock();
  const viewport = useVisualViewport();
  if (typeof document === "undefined") return null;
  return createPortal(<div className={`${styles.theme} ${styles.overlay}`} style={viewport} onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}><div ref={ref} className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} data-farm-dialog><div className={styles.handle} aria-hidden="true" /><header className={styles.sheetHeader}><div><h2 id={id}>{title}</h2>{description && <p className={styles.sheetDescription}>{description}</p>}</div><Button variant="ghost" className={styles.closeButton} onClick={onClose} disabled={busy} aria-label="Fermer le panneau"><X aria-hidden="true" /></Button></header><div className={styles.sheetBody}>{children}</div>{footer && <footer className={styles.sheetFooter}>{footer}</footer>}</div></div>, document.body);
}
