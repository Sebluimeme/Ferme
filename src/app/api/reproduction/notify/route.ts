import { NextRequest, NextResponse } from "next/server";
import type { Animal } from "@/store/store";
import type { ChaleurEntry } from "@/services/animal-detail-service";
import { selectDueNotifications, type ReproNotification } from "@/lib/reproduction-notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface NotifyResult {
  ok: boolean;
  envoyes?: number;
  ignores?: number;
  error?: string;
}

function requireEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : null;
}

function getDatabaseUrl(): string {
  const databaseUrl = requireEnv("NEXT_PUBLIC_FIREBASE_DATABASE_URL");
  if (!databaseUrl) throw new Error("NEXT_PUBLIC_FIREBASE_DATABASE_URL manquant côté serveur");
  return databaseUrl.replace(/\/$/, "");
}

async function getFirebaseIdToken(): Promise<string> {
  const apiKey = requireEnv("NEXT_PUBLIC_FIREBASE_API_KEY");
  const email = requireEnv("FIREBASE_EMAIL");
  const password = requireEnv("FIREBASE_PASSWORD");
  if (!apiKey || !email || !password) {
    throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY, FIREBASE_EMAIL ou FIREBASE_PASSWORD manquant côté serveur");
  }

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Authentification Firebase échouée (${response.status})`);
  }

  const data = (await response.json()) as { idToken?: string };
  if (!data.idToken) throw new Error("Authentification Firebase : idToken manquant dans la réponse");
  return data.idToken;
}

async function fetchRtdb<T>(path: string, idToken: string): Promise<T | null> {
  const url = new URL(`${getDatabaseUrl()}/${path}.json`);
  url.searchParams.set("auth", idToken);

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Firebase a répondu ${response.status} pour ${path} : ${body.slice(0, 240)}`);
  }
  return (await response.json()) as T | null;
}

async function putRtdb(path: string, idToken: string, value: unknown): Promise<void> {
  const url = new URL(`${getDatabaseUrl()}/${path}.json`);
  url.searchParams.set("auth", idToken);

  const response = await fetch(url.toString(), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Firebase a répondu ${response.status} pour ${path} : ${body.slice(0, 240)}`);
  }
}

async function deleteRtdb(path: string, idToken: string): Promise<void> {
  const url = new URL(`${getDatabaseUrl()}/${path}.json`);
  url.searchParams.set("auth", idToken);
  const response = await fetch(url.toString(), { method: "DELETE", cache: "no-store" });
  if (!response.ok) throw new Error(`Firebase a répondu ${response.status} pendant la libération du verrou`);
}

/** Réserve atomiquement l'envoi quotidien via l'ETag RTDB. */
async function claimDailyRun(path: string, idToken: string): Promise<boolean> {
  const url = new URL(`${getDatabaseUrl()}/${path}.json`);
  url.searchParams.set("auth", idToken);
  const current = await fetch(url.toString(), {
    headers: { "X-Firebase-ETag": "true" },
    cache: "no-store",
  });
  if (!current.ok) throw new Error(`Firebase a répondu ${current.status} pendant la lecture du verrou`);
  if ((await current.json()) !== null) return false;
  const etag = current.headers.get("etag");
  if (!etag) throw new Error("Firebase n'a pas renvoyé d'ETag pour le verrou");
  const claimed = await fetch(url.toString(), {
    method: "PUT",
    headers: { "Content-Type": "application/json", "If-Match": etag },
    body: JSON.stringify({ statut: "en_cours", reserveLe: new Date().toISOString() }),
    cache: "no-store",
  });
  if (claimed.status === 412) return false;
  if (!claimed.ok) throw new Error(`Firebase a répondu ${claimed.status} pendant la réservation du verrou`);
  return true;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

function buildEmailHtml(notifications: ReproNotification[]): string {
  const rows = notifications
    .map((n) => {
      const label = n.type === "chaleur" ? "Chaleur prévue" : "Mise bas prévue";
      return `<li><strong>${escapeHtml(n.animalLabel)}</strong> — ${label} le ${n.dateEvenement}</li>`;
    })
    .join("");
  return `<p>Les échéances de reproduction suivantes arrivent dans 3 jours :</p><ul>${rows}</ul>`;
}

async function sendSummaryEmail(notifications: ReproNotification[], idempotencyKey: string): Promise<void> {
  const apiKey = requireEnv("RESEND_API_KEY");
  const recipientsRaw = requireEnv("REPRO_ALERT_EMAILS");
  if (!apiKey || !recipientsRaw) {
    throw new Error("RESEND_API_KEY ou REPRO_ALERT_EMAILS manquant côté serveur");
  }
  const to = recipientsRaw.split(",").map((e) => e.trim()).filter(Boolean);
  if (to.length === 0) {
    throw new Error("REPRO_ALERT_EMAILS ne contient aucune adresse valide");
  }

  const subject = `Ferme — ${notifications.length} échéance${notifications.length > 1 ? "s" : ""} de reproduction dans 3 jours`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: ["Bearer", apiKey].join(" "),
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      from: "Ferme <onboarding@resend.dev>",
      to,
      subject,
      html: buildEmailHtml(notifications),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend a répondu ${response.status} : ${body.slice(0, 240)}`);
  }
}

export async function GET(request: NextRequest) {
  const cronSecret = requireEnv("CRON_SECRET");
  if (!cronSecret) {
    return NextResponse.json<NotifyResult>({ ok: false, error: "CRON_SECRET manquant côté serveur" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json<NotifyResult>({ ok: false, error: "Non autorisé" }, { status: 401 });
  }

  let idToken: string;
  try {
    idToken = await getFirebaseIdToken();
  } catch (error) {
    return NextResponse.json<NotifyResult>({ ok: false, error: (error as Error).message }, { status: 500 });
  }

  try {
    const [animauxRaw, chaleursRaw] = await Promise.all([
      fetchRtdb<Record<string, Animal>>("animaux", idToken),
      fetchRtdb<Record<string, Record<string, ChaleurEntry>>>("animaux-chaleurs", idToken),
    ]);

    const animaux = Object.values(animauxRaw ?? {});
    const chaleursByAnimal: Record<string, ChaleurEntry[]> = {};
    for (const [animalId, entries] of Object.entries(chaleursRaw ?? {})) {
      chaleursByAnimal[animalId] = Object.values(entries ?? {});
    }

    const due = selectDueNotifications(animaux, chaleursByAnimal);

    const toSend: ReproNotification[] = [];
    let ignores = 0;
    for (const notification of due) {
      const existing = await fetchRtdb<unknown>(`notifications-repro/${notification.dedupKey}`, idToken);
      if (existing) {
        ignores++;
      } else {
        toSend.push(notification);
      }
    }

    if (toSend.length > 0) {
      const runDate = new Date().toISOString().slice(0, 10);
      const lockPath = `notifications-repro-runs/${runDate}`;
      const claimed = await claimDailyRun(lockPath, idToken);
      if (!claimed) {
        return NextResponse.json<NotifyResult>({ ok: true, envoyes: 0, ignores: ignores + toSend.length });
      }
      try {
        await sendSummaryEmail(toSend, `ferme-reproduction-${runDate}`);
      } catch (error) {
        // Resend déduplique la reprise grâce à l'Idempotency-Key stable.
        await deleteRtdb(lockPath, idToken);
        throw error;
      }
      const envoyeLe = new Date().toISOString();
      await Promise.all(
        toSend.map((n) =>
          putRtdb(`notifications-repro/${n.dedupKey}`, idToken, {
            envoyeLe,
            type: n.type,
            animalId: n.animalId,
          })
        )
      );
      await putRtdb(lockPath, idToken, { statut: "envoye", envoyeLe, nombre: toSend.length });
    }

    return NextResponse.json<NotifyResult>({ ok: true, envoyes: toSend.length, ignores });
  } catch (error) {
    return NextResponse.json<NotifyResult>({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
