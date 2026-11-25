"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { onValue, ref, remove, set, update } from "firebase/database";
import { database } from "@/lib/firebase";
import { useAppStore } from "@/store/store";
import { CENDRES_PATH, buildCleaning, buildReminder, cancelReminder, normalizeCendres, rescheduleAfterCleaning, type CendresState } from "@/lib/cendres";

const WRITE_TIMEOUT_MS = 10_000;
const notConfirmed = "L'enregistrement n'a pas été confirmé. Vérifie la connexion puis l'état affiché avant de réessayer.";

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(notConfirmed)), WRITE_TIMEOUT_MS);
    promise.then(v => { clearTimeout(timer); resolve(v); }, () => { clearTimeout(timer); reject(new Error(notConfirmed)); });
  });
}

export function useCendres() {
  const uid = useAppStore().state.user?.uid;
  const [state, setState] = useState<CendresState>({ cleanings: [], reminder: null });
  const stateRef = useRef(state); stateRef.current = state;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  useEffect(() => {
    setLoading(true); setLoadError(null);
    if (!uid) { setLoading(false); return; }
    let active = true;
    const stop = onValue(ref(database, CENDRES_PATH), snapshot => {
      if (!active) return;
      setState(normalizeCendres(snapshot.val())); setLoading(false); setLoadError(null);
    }, () => { if (active) { setLoading(false); setLoadError("Le suivi du nettoyage n'a pas pu être chargé."); } });
    const timer = window.setTimeout(() => { if (active) setLoading(false); }, 8_000);
    return () => { active = false; clearTimeout(timer); stop(); };
  }, [uid]);

  const run = useCallback(async (write: () => Promise<unknown>) => {
    if (!online) throw new Error("Hors connexion : rien n'a été enregistré.");
    setBusy(true);
    try { await withTimeout(write()); } finally { setBusy(false); }
  }, [online]);

  return {
    state, loading, loadError, offline: !online, busy,
    /** Enregistre le nettoyage ET reporte le rappel (même délai) en une seule écriture : tout ou rien. Retourne un message si le rappel n'a pas pu être reporté. */
    recordCleaning: async (at?: string): Promise<string | null> => {
      let note: string | null = null;
      await run(() => {
        const now = Date.now();
        const cleaning = buildCleaning(`${now}-${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`, now, at);
        const { cleanings, reminder } = stateRef.current;
        const cycle = rescheduleAfterCleaning(reminder, cleaning, cleanings[0]?.at ?? null, crypto.randomUUID(), now);
        note = cycle.message;
        const updates: Record<string, unknown> = { [`cleanings/${cleaning.id}`]: cleaning };
        if (cycle.outcome === "rescheduled") updates.reminder = cycle.reminder;
        return update(ref(database, CENDRES_PATH), updates);
      });
      return note;
    },
    removeCleaning: (id: string) => run(() => remove(ref(database, `${CENDRES_PATH}/cleanings/${id}`))),
    /** Programmer ou modifier : remplace le rappel par un nouveau (nouvelle clé d'envoi). */
    saveReminder: (input: { dueAt?: string; delayMinutes?: number }) => run(() => {
      if (stateRef.current.reminder?.status === "sending") throw new Error("Un envoi est en cours : attends sa fin pour modifier le rappel.");
      return set(ref(database, `${CENDRES_PATH}/reminder`), buildReminder(crypto.randomUUID(), Date.now(), input));
    }),
    cancelReminder: () => run(() => {
      if (stateRef.current.reminder?.status === "sending") throw new Error("Un envoi est en cours : attends sa fin pour annuler.");
      return set(ref(database, `${CENDRES_PATH}/reminder`), cancelReminder(stateRef.current.reminder));
    }),
  };
}
