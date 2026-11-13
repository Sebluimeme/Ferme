import { NextResponse } from "next/server";
import { dispatchCendresReminder, readCendresMailConfig, ResendTransport } from "@/lib/cendres-mail";
import { createRestCendresStore } from "@/lib/cendres-store-server";

export const dynamic = "force-dynamic";

/** Appelé par un planificateur autorisé. Sans CRON_SECRET valide : aucun traitement. Envoi désactivé par défaut. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const { config, reason } = readCendresMailConfig(process.env);
  const apiKey = process.env.RESEND_API_KEY;
  try {
    const outcome = await dispatchCendresReminder({
      store: createRestCendresStore(), config: config && apiKey ? config : null, now: Date.now(),
      transport: new ResendTransport(apiKey ?? ""),
    });
    return NextResponse.json({ outcome, sending: config && apiKey ? "enabled" : "disabled", reason: config && !apiKey ? "Clé Resend absente." : reason });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}
