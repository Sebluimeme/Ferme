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
 * Reads the Vercel API first, then Firebase directly for authenticated PWA users.
 * This keeps the tank visible even if one delivery path is unavailable on the phone.
 */
export async function loadCiterneStatus(tankId: TankId = 1): Promise<CiterneStatus> {
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

export async function loadCiterneHistory(tankId: TankId = 1): Promise<CiterneHistoryPoint[]> {
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
