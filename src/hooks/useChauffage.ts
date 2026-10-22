"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onValue, ref } from "firebase/database";
import { auth, database } from "@/lib/firebase";
import { normalizeHeatingSnapshot } from "@/lib/chauffage";
import { useAppStore } from "@/store/store";

const SNAPSHOT_PATH = "chauffage-ha/status/current";
const cacheKey = (uid: string) => `ferme:chauffage:v1:${uid}`;

/** Cache du dernier relevé, par utilisateur. Ses dates d'origine restent intactes. */
function readLocal(uid: string): unknown {
  try {
    const text = localStorage.getItem(cacheKey(uid));
    return text && text.length <= 64_000 ? JSON.parse(text) : null;
  } catch { return null; }
}

function writeLocal(uid: string, snapshot: unknown) {
  try {
    if (snapshot == null) localStorage.removeItem(cacheKey(uid));
    else {
      const text = JSON.stringify(snapshot);
      if (text.length <= 64_000) localStorage.setItem(cacheKey(uid), text);
    }
  } catch { /* Une limitation locale ne doit pas empêcher la lecture en ligne. */ }
}

async function untilAborted<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new Error("timeout");
  let cancel: (() => void) | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      cancel = () => reject(new Error("timeout"));
      signal.addEventListener("abort", cancel, { once: true });
    })]);
  } finally { if (cancel) signal.removeEventListener("abort", cancel); }
}

export function useChauffage() {
  const { state } = useAppStore();
  const uid = state.user?.uid;
  const [raw, setRaw] = useState<unknown>(null);
  const [rawUser, setRawUser] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [networkOnline, setNetworkOnline] = useState(true);
  const [databaseConnected, setDatabaseConnected] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const request = useRef<AbortController | null>(null);
  const activeUser = useRef(uid);
  activeUser.current = uid;

  useEffect(() => {
    const updateNetwork = () => setNetworkOnline(navigator.onLine);
    updateNetwork();
    window.addEventListener("online", updateNetwork);
    window.addEventListener("offline", updateNetwork);
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", updateNetwork);
      window.removeEventListener("offline", updateNetwork);
    };
  }, []);

  useEffect(() => {
    request.current?.abort();
    request.current = null;
    setRefreshing(false);
    setError(null);
    setLoading(true);
    setDatabaseConnected(false);
    setRawUser(uid);
    setRaw(uid ? readLocal(uid) : null);
    if (!uid) { setLoading(false); return; }
    let active = true;
    const stopConnection = onValue(ref(database, ".info/connected"), snapshot => {
      if (active) setDatabaseConnected(snapshot.val() === true);
    });
    const stopSnapshot = onValue(ref(database, SNAPSHOT_PATH), snapshot => {
      if (!active) return;
      const value: unknown = snapshot.val();
      setRaw(value); writeLocal(uid, value); setNow(Date.now());
      setLoading(false); setError(null);
    }, () => {
      if (!active) return;
      setLoading(false);
      setError("Les nouvelles mesures ne peuvent pas être récupérées. Les dernières données disponibles restent affichées avec leur date.");
    });
    // Un téléphone sans réseau doit tout de même pouvoir consulter son cache.
    const timer = window.setTimeout(() => { if (active) setLoading(false); }, 8_000);
    return () => {
      active = false; window.clearTimeout(timer); stopSnapshot(); stopConnection();
      request.current?.abort(); request.current = null;
    };
  }, [uid]);

  const refresh = useCallback(async () => {
    if (!uid || request.current) return;
    if (!navigator.onLine) {
      setError("Vous êtes hors connexion. Les dernières mesures conservées sur cet appareil restent consultables.");
      return;
    }
    const controller = new AbortController();
    request.current = controller; setRefreshing(true); setError(null);
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const user = auth.currentUser;
      if (!user || user.uid !== uid) throw new Error("auth");
      const token = await untilAborted(user.getIdToken(), controller.signal);
      if (controller.signal.aborted) throw new Error("timeout");
      const project = database.app.options.projectId || "";
      const emulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true"
        && project.startsWith("demo-") && ["localhost", "127.0.0.1", "[::1]", "::1"].includes(window.location.hostname);
      const base = emulator ? "http://127.0.0.1:9000" : database.app.options.databaseURL;
      if (!base) throw new Error("config");
      const url = new URL(`${base.replace(/\/$/, "")}/${SNAPSHOT_PATH}.json`);
      url.searchParams.set("auth", token);
      if (emulator) url.searchParams.set("ns", `${project}-default-rtdb`);
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("read");
      const value: unknown = await response.json();
      if (activeUser.current !== uid || controller.signal.aborted) return;
      setRaw(value); writeLocal(uid, value); setNow(Date.now()); setLoading(false);
    } catch {
      if (activeUser.current === uid) setError("Actualisation indisponible. Les dernières mesures restent affichées avec leur date ; réessayez lorsque la connexion sera rétablie.");
    } finally {
      window.clearTimeout(timeout);
      if (request.current === controller) {
        request.current = null;
        setRefreshing(false);
      }
    }
  }, [uid]);

  const status = useMemo(() => normalizeHeatingSnapshot(rawUser === uid ? raw : null, now), [raw, rawUser, uid, now]);
  return { status, loading, refreshing, error, refresh, offline: !networkOnline || !databaseConnected };
}
