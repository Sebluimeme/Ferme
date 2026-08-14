import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { fetchHaStates } from "@/lib/homeAssistant";
import {
  CITERNE_ENTITY_ID_LIST,
  normalizeCiternePayload,
  normalizeCiterneStatus,
  type CiterneRawPayload,
} from "@/lib/citerneEau";
import { readServerRtdb, writeServerRtdb } from "@/lib/firebaseRtdbServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE_PATH = "integrations/citerne-1";

interface CachedCiternePayload {
  payload: CiterneRawPayload;
  receivedAt: string;
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
export async function GET() {
  try {
    const entities = await fetchHaStates(CITERNE_ENTITY_ID_LIST);
    const status = normalizeCiterneStatus(entities, Date.now());
    if (status.hasData) {
      return NextResponse.json({ ok: true, status, source: "home-assistant", updatedAt: new Date().toISOString() });
    }
  } catch {
    // Vercel cannot reach the local HA address; continue with the secured Firebase relay.
  }

  try {
    const cached = await readServerRtdb<CachedCiternePayload>(CACHE_PATH);
    if (!cached || !isPayload(cached.payload) || !cached.receivedAt) {
      throw new Error("Cache citerne absent");
    }
    const status = normalizeCiternePayload(cached.payload, cached.receivedAt, Date.now());
    if (!status.hasData) throw new Error("Cache citerne vide");
    return NextResponse.json({ ok: true, status, source: "firebase-relay", updatedAt: new Date().toISOString() });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Mesures de la citerne temporairement indisponibles." },
      { status: 502 },
    );
  }
}

// Secured ingestion endpoint called by Home Assistant after each retained MQTT update.
export async function POST(request: NextRequest) {
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
    const status = normalizeCiternePayload(payload, receivedAt, Date.now());
    if (!status.hasData) {
      return NextResponse.json({ ok: false, error: "Aucune mesure reconnue" }, { status: 400 });
    }
    await writeServerRtdb(CACHE_PATH, { payload, receivedAt });
    return NextResponse.json({ ok: true, status, receivedAt });
  } catch {
    return NextResponse.json({ ok: false, error: "Enregistrement de la mesure impossible" }, { status: 500 });
  }
}
