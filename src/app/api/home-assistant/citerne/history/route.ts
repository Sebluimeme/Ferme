import { NextResponse } from "next/server";
import { normalizeCiterneHistory } from "@/lib/citerneHistory";
import { readServerRtdb } from "@/lib/firebaseRtdbServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HISTORY_PATH = "integrations/citerne-1-history";

export async function GET() {
  try {
    const stored = await readServerRtdb<unknown>(HISTORY_PATH);
    const history = normalizeCiterneHistory(stored).slice(-180);
    return NextResponse.json({ ok: true, history });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Historique de la citerne temporairement indisponible." },
      { status: 502 },
    );
  }
}
