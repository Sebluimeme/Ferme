import { NextResponse } from "next/server";
import { fetchHaStates } from "@/lib/homeAssistant";
import { CITERNE_ENTITY_ID_LIST, normalizeCiterneStatus } from "@/lib/citerneEau";

export const dynamic = "force-dynamic";

// Read-only, whitelisted GET endpoint — no POST/write access to Home Assistant here.
export async function GET() {
  try {
    const entities = await fetchHaStates(CITERNE_ENTITY_ID_LIST);
    const status = normalizeCiterneStatus(entities, Date.now());

    return NextResponse.json({ ok: true, status, updatedAt: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erreur Home Assistant" },
      { status: 502 },
    );
  }
}
