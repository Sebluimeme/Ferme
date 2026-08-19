import { get, limitToLast, query, ref } from "firebase/database";
import { database } from "@/lib/firebase";
import {
  CITERNE_HISTORY_MAX_POINTS,
  normalizeCiterneHistory,
  type CiterneHistoryPoint,
} from "@/lib/citerneHistory";
import {
  normalizeCiternePayload,
  normalizeCiterneStatus,
  type CiterneRawPayload,
  type CiterneStatus,
  type TankId,
} from "@/lib/citerneEau";
import { KeyedRequestCache, type RequestCacheOptions } from "@/lib/requestCache";

interface CiterneApiSuccess {
  ok: true;
  status: CiterneStatus;
}

interface CachedCiternePayload {
  payload: CiterneRawPayload;
  receivedAt: string;
}

function statusApiPath(tankId: TankId): string {
  return tankId === 1 ? "/api/home-assistant/citerne" : `/api/home-assistant/citerne/${tankId}`;
}

function historyApiPath(tankId: TankId): string {
  return tankId === 1 ? "/api/home-assistant/citerne/history" : `/api/home-assistant/citerne/${tankId}/history`;
}

/**
 * The MQTT relay reports each tank at most once a day (see classifyFreshness
 * in citerneEau.ts), so a cache this short can never mask a real update or
 * delay error/staleness detection — it stays far below the 5-minute poll
 * interval, so every automatic poll still performs a real check. It only
 * absorbs the repeated bursts measured across the home/eau/arrosage pages
 * (2 tanks × status+history, ~0.45–0.49s each, cache:no-store) when they
 * mount together or in quick succession during the same client session.
 */
export const CITERNE_CACHE_TTL_MS = 60_000;

const statusCache = new KeyedRequestCache<TankId, CiterneStatus>(CITERNE_CACHE_TTL_MS);
const historyCache = new KeyedRequestCache<TankId, CiterneHistoryPoint[]>(CITERNE_CACHE_TTL_MS);

export type LoadCiterneOptions = RequestCacheOptions;

/**
 * Reads the Vercel API first, then Firebase directly for authenticated PWA users.
 * This keeps the tank visible even if one delivery path is unavailable on the phone.
 * Wrapped in a short TTL + in-flight cache (see CITERNE_CACHE_TTL_MS): concurrent
 * callers share one network round-trip, and `options.force` (explicit user refresh)
 * bypasses the cached value while still joining any request already in flight.
 */
export async function loadCiterneStatus(tankId: TankId = 1, options: LoadCiterneOptions = {}): Promise<CiterneStatus> {
  return statusCache.get(tankId, () => fetchCiterneStatus(tankId), options);
}

async function fetchCiterneStatus(tankId: TankId): Promise<CiterneStatus> {
  try {
    const response = await fetch(statusApiPath(tankId), { cache: "no-store" });
    const json = (await response.json()) as CiterneApiSuccess | { ok: false; error?: string };
    if (response.ok && json.ok && json.status.hasData) return json.status;
  } catch {
    // Continue with the authenticated Firebase fallback.
  }

  const snapshot = await get(ref(database, `integrations/citerne-${tankId}`));
  if (!snapshot.exists()) {
    // No discovery yet for this tank: a neutral, non-error status, not a failed fetch.
    return normalizeCiterneStatus({}, Date.now(), tankId);
  }
  const cached = snapshot.val() as CachedCiternePayload;
  if (!cached?.payload || !cached.receivedAt) throw new Error("Mesures de citerne incomplètes dans Firebase");

  const status = normalizeCiternePayload(cached.payload, cached.receivedAt, Date.now(), tankId);
  if (!status.hasData) throw new Error("Mesures de citerne indisponibles");
  return status;
}

export async function loadCiterneHistory(tankId: TankId = 1, options: LoadCiterneOptions = {}): Promise<CiterneHistoryPoint[]> {
  return historyCache.get(tankId, () => fetchCiterneHistory(tankId), options);
}

async function fetchCiterneHistory(tankId: TankId): Promise<CiterneHistoryPoint[]> {
  try {
    const response = await fetch(historyApiPath(tankId), { cache: "no-store" });
    const json = (await response.json()) as { ok?: boolean; history?: unknown };
    if (response.ok && json.ok) return normalizeCiterneHistory(json.history);
  } catch {
    // Continue with the authenticated Firebase fallback.
  }

  const snapshot = await get(query(
    ref(database, `integrations/citerne-${tankId}-history`),
    limitToLast(CITERNE_HISTORY_MAX_POINTS),
  ));
  if (!snapshot.exists()) return [];
  return normalizeCiterneHistory(snapshot.val());
}
