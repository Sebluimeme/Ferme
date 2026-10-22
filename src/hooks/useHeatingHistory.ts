"use client";

import { useEffect, useMemo, useState } from "react";
import { endAt, onValue, orderByKey, query, ref, startAt } from "firebase/database";
import { database } from "@/lib/firebase";
import { useAppStore } from "@/store/store";
import { HEATING_HISTORY_KEYS, HEATING_HISTORY_PATH, heatingHistoryDays, normalizeHeatingHistory, type HeatingHistoryKey, type HeatingHistoryPoint } from "@/lib/chauffage-history";

export interface HeatingHistoryRange { start: number; end: number }
const MAX_WINDOW_MS = 31 * 86_400_000;
const CACHE_LIMIT = 250_000;
const storageKey = (uid: string, key: HeatingHistoryKey) => `ferme:heating-history:v1:${uid}:${key}`;

function cachedPoints(uid: string, key: HeatingHistoryKey): HeatingHistoryPoint[] {
  try {
    const value = localStorage.getItem(storageKey(uid, key));
    return value && value.length <= CACHE_LIMIT ? normalizeHeatingHistory(JSON.parse(value)) : [];
  } catch { return []; }
}

function cachePoints(uid: string, key: HeatingHistoryKey, points: HeatingHistoryPoint[]) {
  try {
    const value = JSON.stringify(points);
    // Cache only a complete window. Never silently thin a chart's offline data.
    if (value.length <= CACHE_LIMIT) localStorage.setItem(storageKey(uid, key), value);
  } catch { /* Cache quota must not interrupt live readings. */ }
}

/** One authenticated, bounded query for the selected component and UTC day buckets. */
export function useHeatingHistory(key: HeatingHistoryKey | null, range: HeatingHistoryRange) {
  const uid = useAppStore().state.user?.uid;
  const valid = key !== null && HEATING_HISTORY_KEYS.includes(key)
    && Number.isFinite(range.start) && Number.isFinite(range.end)
    && range.start >= 0 && range.end >= range.start && range.end - range.start <= MAX_WINDOW_MS;
  const days = valid ? heatingHistoryDays(range.start, range.end) : [];
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  const identity = uid && key && firstDay ? `${uid}:${key}:${firstDay}:${lastDay}` : "";
  const [data, setData] = useState<{ identity: string; points: HeatingHistoryPoint[] }>({ identity: "", points: [] });
  const [loadingIdentity, setLoadingIdentity] = useState("");
  const [failure, setFailure] = useState<{ identity: string; message: string } | null>(null);

  useEffect(() => {
    if (!identity || !uid || !key || !firstDay || !lastDay) return;
    let active = true;
    setData({ identity, points: cachedPoints(uid, key) });
    setLoadingIdentity(identity);
    setFailure(null);
    const historyQuery = query(ref(database, `${HEATING_HISTORY_PATH}/${key}`), orderByKey(), startAt(firstDay), endAt(lastDay));
    const timer = window.setTimeout(() => {
      if (!active) return;
      setLoadingIdentity("");
      setFailure({ identity, message: "L’historique n’a pas pu être synchronisé. Les relevés déjà conservés sur cet appareil restent consultables." });
    }, 12_000);
    const unsubscribe = onValue(historyQuery, snapshot => {
      if (!active) return;
      window.clearTimeout(timer);
      const points = normalizeHeatingHistory(snapshot.val());
      setData({ identity, points });
      cachePoints(uid, key, points);
      setLoadingIdentity("");
      setFailure(null);
    }, () => {
      if (!active) return;
      window.clearTimeout(timer);
      setLoadingIdentity("");
      setFailure({ identity, message: "Impossible de charger les nouveaux relevés. Réessaie lorsque la connexion sera rétablie." });
    });
    return () => { active = false; window.clearTimeout(timer); unsubscribe(); };
  }, [identity, uid, key, firstDay, lastDay]);

  const points = useMemo(() => data.identity === identity
    ? data.points.filter(point => point.at >= range.start && point.at <= range.end)
    : [], [data, identity, range.start, range.end]);
  return {
    points,
    loading: Boolean(identity) && (loadingIdentity === identity || data.identity !== identity),
    error: failure?.identity === identity ? failure.message : null,
  };
}
