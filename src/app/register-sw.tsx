"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { AppVersionTracker, type ReloadContext } from "@/lib/app-update";

const FIELD_SELECTOR = 'input:not([type="hidden"]), textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]';
const DIALOG_SELECTOR = '[role="dialog"], [aria-modal="true"], dialog[open], [data-farm-dialog], [data-modal-root="true"]';
const INTERACTION_DELAY_MS = 3_000;

function visible(element: Element): boolean {
  return element.isConnected && !element.closest('[hidden], [aria-hidden="true"]')
    && element.getClientRects().length > 0;
}

function visibleMatch(selector: string): boolean {
  return Array.from(document.querySelectorAll(selector)).some(visible);
}

export default function RegisterSW({ loadedVersion }: { loadedVersion: string | null }) {
  const pathname = usePathname();
  const checkRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;

    const versions = new AppVersionTracker(loadedVersion);
    const editedFields = new Set<Element>();
    let stopped = false;
    let checking = false;
    let lastInteraction = 0;
    let settledTimer: number | undefined;

    function context(): ReloadContext {
      // A closed/unmounted editor has discarded or saved its draft. Hidden but
      // still mounted edited controls keep protecting their pending input.
      for (const field of editedFields) if (!field.isConnected) editedFields.delete(field);
      return {
        pathname: window.location.pathname,
        online: navigator.onLine !== false,
        visible: document.visibilityState === "visible",
        dialogOpen: visibleMatch(DIALOG_SELECTOR),
        // Includes inline settings without a <form>, as on the water page.
        formPresent: visibleMatch(`form, ${FIELD_SELECTOR}`),
        fieldActive: document.activeElement instanceof Element && !!document.activeElement.closest(FIELD_SELECTOR),
        hasDraft: editedFields.size > 0,
        busy: visibleMatch('[aria-busy="true"], [data-update-busy="true"]'),
        interacting: Date.now() - lastInteraction < INTERACTION_DELAY_MS,
      };
    }

    async function checkVersion() {
      if (stopped || checking || navigator.onLine === false || document.visibilityState !== "visible") return;
      checking = true;
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok || stopped) return;
        const { version } = (await response.json()) as { version?: unknown };
        if (stopped) return;
        if (!versions.observe(version)) return;
        // Read the current UI after the request: a sheet may have opened while
        // the network was slow. Only a successful online check can reload.
        if (versions.consumeReload(context())) window.location.reload();
      } catch {
        // Une vérification de version ne doit jamais bloquer l'application hors ligne.
      } finally {
        checking = false;
      }
    }

    function userActivity(event: Event) {
      lastInteraction = Date.now();
      if ((event.type === "input" || event.type === "change") && event.target instanceof Element) {
        const field = event.target.closest(FIELD_SELECTOR);
        if (field) editedFields.add(field);
      }
      window.clearTimeout(settledTimer);
      settledTimer = window.setTimeout(() => {
        // Revalidate online after closing a panel; never replay a cached reload
        // decision when connectivity or the page's editing state has changed.
        if (versions.hasPendingUpdate()) void checkVersion();
      }, INTERACTION_DELAY_MS + 50);
    }

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => undefined);

    checkRef.current = () => { void checkVersion(); };
    void checkVersion();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void checkVersion();
    };
    const refreshWhenOnline = () => void checkVersion();
    const timer = window.setInterval(() => void checkVersion(), 5 * 60 * 1000);
    const activityEvents = ["pointerdown", "pointerup", "keydown", "input", "change", "focusout"];
    for (const event of activityEvents) document.addEventListener(event, userActivity, true);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("online", refreshWhenOnline);

    return () => {
      stopped = true;
      checkRef.current = null;
      window.clearInterval(timer);
      window.clearTimeout(settledTimer);
      for (const event of activityEvents) document.removeEventListener(event, userActivity, true);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("online", refreshWhenOnline);
    };
  }, [loadedVersion]);

  useEffect(() => { checkRef.current?.(); }, [pathname]);

  return null;
}
