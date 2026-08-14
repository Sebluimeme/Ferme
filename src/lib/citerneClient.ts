import { get, ref } from "firebase/database";
import { database } from "@/lib/firebase";
import {
  normalizeCiterneHistory,
  type CiterneHistoryPoint,
} from "@/lib/citerneHistory";
import {
  normalizeCiternePayload,
  type CiterneRawPayload,
  type CiterneStatus,
} from "@/lib/citerneEau";

interface CiterneApiSuccess {
  ok: true;
  status: CiterneStatus;
}

interface CachedCiternePayload {
  payload: CiterneRawPayload;
  receivedAt: string;
}

/**
 * Reads the Vercel API first, then Firebase directly for authenticated PWA users.
 * This keeps the tank visible even if one delivery path is unavailable on the phone.
 */
export async function loadCiterneStatus(): Promise<CiterneStatus> {
  try {
    const response = await fetch("/api/home-assistant/citerne", { cache: "no-store" });
    const json = (await response.json()) as CiterneApiSuccess | { ok: false; error?: string };
    if (response.ok && json.ok && json.status.hasData) return json.status;
  } catch {
    // Continue with the authenticated Firebase fallback.
  }

  const snapshot = await get(ref(database, "integrations/citerne-1"));
  if (!snapshot.exists()) throw new Error("Mesures de citerne absentes dans Firebase");
  const cached = snapshot.val() as CachedCiternePayload;
  if (!cached?.payload || !cached.receivedAt) throw new Error("Mesures de citerne incomplètes dans Firebase");

  const status = normalizeCiternePayload(cached.payload, cached.receivedAt, Date.now());
  if (!status.hasData) throw new Error("Mesures de citerne indisponibles");
  return status;
}

export async function loadCiterneHistory(): Promise<CiterneHistoryPoint[]> {
  try {
    const response = await fetch("/api/home-assistant/citerne/history", { cache: "no-store" });
    const json = (await response.json()) as { ok?: boolean; history?: unknown };
    if (response.ok && json.ok) return normalizeCiterneHistory(json.history);
  } catch {
    // Continue with the authenticated Firebase fallback.
  }

  const snapshot = await get(ref(database, "integrations/citerne-1-history"));
  if (!snapshot.exists()) return [];
  return normalizeCiterneHistory(snapshot.val());
}
