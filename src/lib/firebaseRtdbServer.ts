function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} manquant côté serveur`);
  return value;
}

function getDatabaseUrl(): string {
  return requireEnv("NEXT_PUBLIC_FIREBASE_DATABASE_URL").replace(/\/$/, "");
}

async function getFirebaseIdToken(): Promise<string> {
  const apiKey = requireEnv("NEXT_PUBLIC_FIREBASE_API_KEY");
  const email = requireEnv("FIREBASE_EMAIL");
  const password = requireEnv("FIREBASE_PASSWORD");
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Authentification Firebase échouée (${response.status})`);
  const data = (await response.json()) as { idToken?: string };
  if (!data.idToken) throw new Error("Authentification Firebase : idToken manquant");
  return data.idToken;
}

function rtdbUrl(path: string, idToken: string): string {
  const url = new URL(`${getDatabaseUrl()}/${path}.json`);
  url.searchParams.set("auth", idToken);
  return url.toString();
}

export async function readServerRtdb<T>(path: string): Promise<T | null> {
  const idToken = await getFirebaseIdToken();
  const response = await fetch(rtdbUrl(path, idToken), { cache: "no-store" });
  if (!response.ok) throw new Error(`Firebase a répondu ${response.status} pendant la lecture de ${path}`);
  return (await response.json()) as T | null;
}

export async function writeServerRtdb(path: string, value: unknown): Promise<void> {
  const idToken = await getFirebaseIdToken();
  const response = await fetch(rtdbUrl(path, idToken), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Firebase a répondu ${response.status} pendant l'écriture de ${path}`);
}
