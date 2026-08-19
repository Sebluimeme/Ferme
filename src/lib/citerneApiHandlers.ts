import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { fetchHaStates } from "@/lib/homeAssistant";
import {
  getCiterneEntityIdList,
  normalizeCiternePayload,
  normalizeCiterneStatus,
  type CiterneRawPayload,
  type TankId,
} from "@/lib/citerneEau";
import { buildCiterneHistoryRecord, CITERNE_HISTORY_READ_QUERY, normalizeCiterneHistory } from "@/lib/citerneHistory";
import { readServerRtdb, writeServerRtdb } from "@/lib/firebaseRtdbServer";

/**
 * Shared GET/POST logic behind /api/home-assistant/citerne (tank 1) and
 * /api/home-assistant/citerne/2 (tank 2), parameterized by tankId so both
 * routes stay in lockstep instead of duplicating the HA/Firebase fallback logic.
 */

interface CachedCiternePayload {
  payload: CiterneRawPayload;
  receivedAt: string;
}

function cachePath(tankId: TankId): string {
  return `integrations/citerne-${tankId}`;
}

function historyPath(tankId: TankId): string {
  return `integrations/citerne-${tankId}-history`;
}

function secretsMatch(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isPayload(value: unknown): value is CiterneRawPayload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Read-only public endpoint. It uses HA directly on the local network and the Firebase relay in production.
export async function handleCiterneGet(tankId: TankId): Promise<NextResponse> {
  try {
    const entities = await fetchHaStates(getCiterneEntityIdList(tankId));
    const status = normalizeCiterneStatus(entities, Date.now(), tankId);
    if (status.hasData) {
      return NextResponse.json({ ok: true, status, source: "home-assistant", updatedAt: new Date().toISOString() });
    }
  } catch {
    // Vercel cannot reach the local HA address; continue with the secured Firebase relay.
  }

  let cached: CachedCiternePayload | null;
  try {
    cached = await readServerRtdb<CachedCiternePayload>(cachePath(tankId));
  } catch {
    // Real network/permission failure reading Firebase: this is an actual error.
    return NextResponse.json(
      { ok: false, error: "Mesures de la citerne temporairement indisponibles." },
      { status: 502 },
    );
  }

  if (!cached) {
    // No discovery/MQTT payload has ever reached this tank: a neutral status, not an error.
    const status = normalizeCiterneStatus({}, Date.now(), tankId);
    return NextResponse.json({ ok: true, status, source: "none", updatedAt: new Date().toISOString() });
  }

  if (!isPayload(cached.payload) || !cached.receivedAt) {
    return NextResponse.json(
      { ok: false, error: "Mesures de la citerne temporairement indisponibles." },
      { status: 502 },
    );
  }

  const status = normalizeCiternePayload(cached.payload, cached.receivedAt, Date.now(), tankId);
  if (!status.hasData) {
    return NextResponse.json(
      { ok: false, error: "Mesures de la citerne temporairement indisponibles." },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, status, source: "firebase-relay", updatedAt: new Date().toISOString() });
}

// Secured ingestion endpoint called by Home Assistant after each retained MQTT update.
export async function handleCiternePost(tankId: TankId, request: NextRequest): Promise<NextResponse> {
  const expected = process.env.CITERNE_SYNC_SECRET?.trim();
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !provided || !secretsMatch(provided, expected)) {
    return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as unknown;
    if (!isPayload(payload)) {
      return NextResponse.json({ ok: false, error: "Payload invalide" }, { status: 400 });
    }
    const receivedAt = new Date().toISOString();
    const status = normalizeCiternePayload(payload, receivedAt, Date.now(), tankId);
    if (!status.hasData) {
      return NextResponse.json({ ok: false, error: "Aucune mesure reconnue" }, { status: 400 });
    }
    await writeServerRtdb(cachePath(tankId), { payload, receivedAt });
    const historyRecord = buildCiterneHistoryRecord(tankId, status);
    if (historyRecord) {
      const dayKey = receivedAt.slice(0, 10);
      await writeServerRtdb(`${historyPath(tankId)}/${dayKey}`, {
        receivedAt,
        ...historyRecord,
      });
    }
    return NextResponse.json({ ok: true, status, receivedAt });
  } catch {
    return NextResponse.json({ ok: false, error: "Enregistrement de la mesure impossible" }, { status: 500 });
  }
}

export async function handleCiterneHistoryGet(tankId: TankId): Promise<NextResponse> {
  try {
    const stored = await readServerRtdb<unknown>(historyPath(tankId), CITERNE_HISTORY_READ_QUERY);
    const history = normalizeCiterneHistory(stored);
    return NextResponse.json({ ok: true, history });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Historique de la citerne temporairement indisponible." },
      { status: 502 },
    );
  }
}
