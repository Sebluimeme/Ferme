import { CENDRES_PATH, normalizeCendres, type CendresReminder } from "./cendres.ts";
import type { CendresServerStore } from "./cendres-mail.ts";

type ServerEnv = Record<string, string | undefined>;

/** Utilise les mêmes identifiants serveur Firebase que les autres tâches de l'application. */
async function firebaseIdToken(env: ServerEnv, fetchImpl: typeof fetch): Promise<string> {
  const apiKey = env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  const email = env.FIREBASE_EMAIL?.trim();
  const password = env.FIREBASE_PASSWORD?.trim();
  if (!apiKey || !email || !password) throw new Error("Configuration Firebase serveur incomplète.");
  const response = await fetchImpl(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }), cache: "no-store",
  });
  if (!response.ok) throw new Error(`Authentification Firebase échouée (HTTP ${response.status}).`);
  const body = await response.json() as { idToken?: string };
  if (!body.idToken) throw new Error("Authentification Firebase sans jeton.");
  return body.idToken;
}

/**
 * Stockage serveur via l'API REST de Firebase Realtime Database.
 * Écriture conditionnelle par ETag : si l'utilisateur modifie ou annule le rappel pendant le traitement, l'écriture est refusée (412).
 */
export function createRestCendresStore(env: ServerEnv = process.env, fetchImpl: typeof fetch = fetch): CendresServerStore {
  const baseUrl = env.NEXT_PUBLIC_FIREBASE_DATABASE_URL?.trim().replace(/\/$/, "");
  if (!baseUrl) throw new Error("URL Firebase serveur absente.");
  let tokenPromise: Promise<string> | null = null;
  const url = async (path: string) => {
    tokenPromise ??= firebaseIdToken(env, fetchImpl);
    const u = new URL(`${baseUrl}/${CENDRES_PATH}/${path}.json`);
    u.searchParams.set("auth", await tokenPromise);
    return u;
  };
  return {
    async read() {
      const reminderResponse = await fetchImpl(await url("reminder"), { headers: { "X-Firebase-ETag": "true" }, cache: "no-store" });
      if (!reminderResponse.ok) throw new Error(`Lecture du rappel impossible (HTTP ${reminderResponse.status}).`);
      const version = reminderResponse.headers.get("etag");
      if (!version) throw new Error("Version du rappel indisponible.");
      const reminderRaw = await reminderResponse.json();
      const cleaningsResponse = await fetchImpl(await url("cleanings"), { cache: "no-store" });
      if (!cleaningsResponse.ok) throw new Error(`Lecture de l'historique impossible (HTTP ${cleaningsResponse.status}).`);
      const state = normalizeCendres({ reminder: reminderRaw, cleanings: await cleaningsResponse.json() });
      return { reminder: state.reminder, lastCleaningAt: state.cleanings[0]?.at ?? null, version };
    },
    async writeIfUnchanged(reminder: CendresReminder, version: string) {
      const response = await fetchImpl(await url("reminder"), { method: "PUT", headers: { "if-match": version, "content-type": "application/json" }, body: JSON.stringify(reminder) });
      if (response.status === 412) return false;
      if (!response.ok) throw new Error(`Écriture du rappel impossible (HTTP ${response.status}).`);
      return true;
    },
  };
}
