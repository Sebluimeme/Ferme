"use client";

import { useEffect } from "react";

const VERSION_KEY = "ferme-app-version";
const SAFE_AUTO_RELOAD_PATHS = new Set(["/", "/eau"]);

export default function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;

    let stopped = false;

    async function checkVersion() {
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) return;
        const { version } = (await response.json()) as { version?: string };
        if (!version || stopped) return;

        const previous = window.localStorage.getItem(VERSION_KEY);
        window.localStorage.setItem(VERSION_KEY, version);
        if (previous && previous !== version && SAFE_AUTO_RELOAD_PATHS.has(window.location.pathname)) {
          window.location.reload();
        }
      } catch {
        // Une vérification de version ne doit jamais bloquer l'application hors ligne.
      }
    }

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => undefined);

    void checkVersion();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void checkVersion();
    };
    const refreshWhenOnline = () => void checkVersion();
    const timer = window.setInterval(() => void checkVersion(), 5 * 60 * 1000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("online", refreshWhenOnline);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("online", refreshWhenOnline);
    };
  }, []);

  return null;
}
