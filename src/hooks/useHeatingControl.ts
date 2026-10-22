"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { onValue, ref } from "firebase/database";
import { auth, database } from "@/lib/firebase";
import { useAppStore } from "@/store/store";
import { HEATING_CONTROL_PATH, normalizeHeatingControl, validHeatingSettings, type HeatingControlRequest, type HeatingControlSettings } from "@/lib/heating-control";

const pendingKey = (uid: string) => `ferme:heating-control:receipt:${uid}`;
const unconfirmed = "La confirmation n’a pas été reçue. Le réglage peut avoir été mémorisé : vérifie l’état actuel avant de réessayer.";
const accepted = "Réglages mémorisés dans Home Assistant. Observation uniquement : aucun mouvement du servomoteur.";

export function useHeatingControl() {
  const uid = useAppStore().state.user?.uid;
  const activeUid = useRef(uid); activeUid.current = uid;
  const [raw, setRaw] = useState<{ uid: string; value: unknown } | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState(true);
  const [now, setNow] = useState(Date.now);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const operation = useRef<AbortController | null>(null);
  const rawRef = useRef(raw); rawRef.current = raw;
  const receiptStop = useRef<(() => void) | null>(null);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update); window.addEventListener("offline", update);
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => { clearInterval(timer); window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  useEffect(() => {
    setLoading(true); setConnected(false); setRaw(null); setError(null); setResult(null); setBusy(false);
    if (!uid) { setLoading(false); return; }
    let active = true;
    const statusStop = onValue(ref(database, `${HEATING_CONTROL_PATH}/status`), snapshot => {
      if (!active) return;
      setRaw({ uid, value: snapshot.val() }); setNow(Date.now()); setLoading(false);
    }, () => { if (active) { setLoading(false); setError("Les réglages n’ont pas pu être chargés."); } });
    const connectionStop = onValue(ref(database, ".info/connected"), snapshot => { if (active) setConnected(snapshot.val() === true); });
    const timer = window.setTimeout(() => { if (active) setLoading(false); }, 8_000);
    let previousStop: (() => void) | undefined;
    try {
      const id = localStorage.getItem(pendingKey(uid));
      if (id && /^\d{13}-[a-f0-9]{32}$/.test(id)) {
        previousStop = onValue(ref(database, `${HEATING_CONTROL_PATH}/requests/${id}`), snapshot => {
          if (!active) return;
          const receipt = snapshot.val();
          if (receipt?.status === "accepted") {
            setError(null); setResult(accepted); localStorage.removeItem(pendingKey(uid));
          } else if (["rejected", "uncertain"].includes(receipt?.status)) {
            setResult(null); setError(receipt.status === "rejected" ? "La précédente demande a été refusée ou a expiré." : unconfirmed);
            localStorage.removeItem(pendingKey(uid));
          } else setError("Une précédente demande n’a pas encore été confirmée. Consulte les réglages actuels avant de réessayer.");
        });
      }
    } catch { /* A receipt cache is optional and never a command queue. */ }
    return () => {
      active = false; clearTimeout(timer); statusStop(); connectionStop(); previousStop?.();
      operation.current?.abort(); operation.current = null; receiptStop.current?.(); receiptStop.current = null;
    };
  }, [uid]);

  const status = useMemo(() => raw && raw.uid === uid ? normalizeHeatingControl(raw.value, now) : null, [raw, uid, now]);
  const offline = !online || !connected;

  async function save(settings: HeatingControlSettings, expectedRevision: number) {
    if (operation.current) throw new Error("Une demande est déjà en cours.");
    const current = rawRef.current && rawRef.current.uid === uid ? normalizeHeatingControl(rawRef.current.value) : null;
    if (!uid || offline || !navigator.onLine || !current?.available || !current.fresh) throw new Error("Attends le retour de la connexion et des réglages récents.");
    if (!validHeatingSettings(settings) || current.revision !== expectedRevision) throw new Error("Les réglages ont changé. Ferme puis rouvre le panneau.");
    const controller = new AbortController(); operation.current = controller;
    setBusy(true); setError(null); setResult(null);
    const timeout = window.setTimeout(() => controller.abort(), 45_000);
    let abortListener: (() => void) | undefined;
    let localReceiptStop: (() => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      abortListener = () => reject(new Error(unconfirmed));
      controller.signal.addEventListener("abort", abortListener, { once: true });
    });
    try {
      const user = auth.currentUser;
      if (!user || user.uid !== uid) throw new Error("Reconnecte-toi avant de modifier les réglages.");
      const token = await Promise.race([user.getIdToken(), aborted]);
      if (activeUid.current !== uid || controller.signal.aborted) throw new Error(unconfirmed);
      const createdAt = Date.now();
      const id = `${createdAt}-${crypto.randomUUID().replaceAll("-", "")}`;
      const request: HeatingControlRequest = { version: 1, id, requestedBy: uid, createdAt, expiresAt: createdAt + 90_000, expectedRevision, status: "pending", ...settings };
      const project = database.app.options.projectId ?? "";
      const emulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true" && project.startsWith("demo-") && ["localhost", "127.0.0.1", "[::1]", "::1"].includes(location.hostname);
      const base = emulator ? "http://127.0.0.1:9000" : database.app.options.databaseURL;
      if (!base) throw new Error("Configuration de connexion indisponible.");
      const url = new URL(`${base.replace(/\/$/, "")}/${HEATING_CONTROL_PATH}/requests/${id}.json`);
      url.searchParams.set("auth", token);
      if (emulator) url.searchParams.set("ns", `${project}-default-rtdb`);
      try { localStorage.setItem(pendingKey(uid), id); } catch { /* No queued write. */ }
      const response = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "If-Match": "null_etag" }, body: JSON.stringify(request), signal: controller.signal });
      if (!response.ok) {
        // A definite client-side refusal created no request. Keep the receipt only
        // when the server outcome is uncertain (5xx) or an existing key was found.
        if (response.status >= 400 && response.status < 500 && response.status !== 412) {
          try { localStorage.removeItem(pendingKey(uid)); } catch { /* Optional receipt cache. */ }
        }
        throw new Error(response.status === 412 ? "Cette demande existe déjà. Vérifie son état." : "L’enregistrement n’a pas été confirmé. Aucun nouvel essai automatique ne sera effectué.");
      }
      const receipt = new Promise<void>((resolve, reject) => {
        localReceiptStop = onValue(ref(database, `${HEATING_CONTROL_PATH}/requests/${id}`), snapshot => {
          const value = snapshot.val();
          if (activeUid.current !== uid) { reject(new Error(unconfirmed)); return; }
          if (value?.status === "accepted") resolve();
          else if (value?.status === "rejected") reject(new Error("La demande a été refusée ou a expiré. Ferme puis rouvre les réglages."));
          else if (value?.status === "uncertain") reject(new Error(unconfirmed));
        }, () => reject(new Error(unconfirmed)));
        receiptStop.current = localReceiptStop;
      });
      await Promise.race([receipt, aborted]);
      if (activeUid.current !== uid) throw new Error(unconfirmed);
      try { localStorage.removeItem(pendingKey(uid)); } catch { /* Optional receipt cache. */ }
      setResult(accepted);
    } catch (failure) {
      const text = failure instanceof Error && failure.name !== "AbortError" ? failure.message : unconfirmed;
      if (activeUid.current === uid) setError(text);
      throw new Error(text);
    } finally {
      clearTimeout(timeout);
      if (abortListener) controller.signal.removeEventListener("abort", abortListener);
      localReceiptStop?.(); if (receiptStop.current === localReceiptStop) receiptStop.current = null;
      if (operation.current === controller) { operation.current = null; if (activeUid.current === uid) setBusy(false); }
    }
  }
  return { status, loading, offline, busy, error, result, save };
}
