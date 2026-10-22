#!/usr/bin/env node
/** Configuration-only bridge. The only HA service is the observation package's configurer script. */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { HEATING_CONTROL_PATH, controlStatusFromHa, parseHaHeatingConfiguration, validateHeatingControlRequest } from "../src/lib/heating-control.ts";

const SERVICE_PATH = "/api/services/script/ferme_chauffage_configurer";
const REQUEST_KEY = /^\d{13}-[a-f0-9]{32}$/;
const message = {
  accepted: "Réglages mémorisés dans Home Assistant. Observation uniquement : aucun mouvement du servomoteur.",
  rejected: "Demande refusée ou expirée. Rouvre les réglages pour lire la configuration actuelle.",
  uncertain: "La confirmation n’a pas pu être obtenue. Vérifie les réglages actuels avant toute nouvelle demande.",
};

async function boundedJson(url, init, fetchImpl, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetchImpl(url, { ...init, signal: controller.signal, cache: "no-store" });
    if (r.status === 412) return { conflict: true };
    if (!r.ok) throw new Error("request-failed");
    return { data: await r.json(), etag: r.headers.get("etag"), conflict: false };
  } catch { throw new Error("request-unconfirmed"); }
  finally { clearTimeout(timeout); }
}
function baseUrl(value) {
  const u = new URL(value);
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password || u.search || u.hash) throw new Error("invalid-url");
  return u.toString().replace(/\/$/, "");
}

export function createHeatingConfigurationHaClient({ url, token, fetchImpl = fetch, timeoutMs = 12_000 }) {
  const base = baseUrl(url);
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  return {
    readStates: async () => {
      const result = await boundedJson(`${base}/api/states`, { method: "GET", headers }, fetchImpl, timeoutMs);
      if (!Array.isArray(result.data)) throw new Error("invalid-states");
      return result.data;
    },
    configure: async request => {
      const valid = validateHeatingControlRequest({ ...request, status: "pending" }, request.id);
      const body = {
        mode: valid.mode, manual_temperature: valid.manualTemperature, minimum_d: valid.minimumD,
        request_id: valid.id, expires_at: Math.floor(valid.expiresAt / 1000), expected_revision: valid.expectedRevision,
      };
      await boundedJson(`${base}${SERVICE_PATH}`, { method: "POST", headers, body: JSON.stringify(body) }, fetchImpl, timeoutMs);
    },
  };
}

export function createHeatingControlFirebase({ url, apiKey, email, password, fetchImpl = fetch, now = Date.now }) {
  const base = baseUrl(url);
  let token = null, expires = 0;
  async function idToken() {
    if (token && expires > now() + 60_000) return token;
    const { data } = await boundedJson(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }),
    }, fetchImpl);
    if (typeof data?.idToken !== "string" || !Number.isFinite(Number(data.expiresIn))) throw new Error("auth-invalid");
    token = data.idToken; expires = now() + Number(data.expiresIn) * 1000; return token;
  }
  async function request(path, method = "GET", body, etag, params = {}, wantEtag = false) {
    const u = new URL(`${base}/${HEATING_CONTROL_PATH}/${path}.json`);
    u.searchParams.set("auth", await idToken());
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    try {
      return await boundedJson(u, { method, headers: { "Content-Type": "application/json", ...(wantEtag ? { "X-Firebase-ETag": "true" } : {}), ...(etag ? { "If-Match": etag } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, fetchImpl);
    } catch { token = null; throw new Error("firebase-unconfirmed"); }
  }
  function checkedKey(key) { if (!REQUEST_KEY.test(key)) throw new Error("invalid-key"); return `requests/${key}`; }
  return {
    readStatus: async () => (await request("status")).data,
    writeStatus: async value => { await request("status", "PUT", value); },
    requests: async () => (await request("requests", "GET", undefined, undefined, { orderBy: '"$key"', limitToLast: "30" })).data ?? {},
    readRequest: key => request(checkedKey(key), "GET", undefined, undefined, {}, true),
    claim: async (key, value, etag) => Boolean(etag) && !(await request(checkedKey(key), "PUT", { ...value, status: "processing", claimedAt: now() }, etag)).conflict,
    finish: async (key, outcome) => {
      const current = await request(checkedKey(key), "GET", undefined, undefined, {}, true);
      if (!current.etag || !["pending", "processing"].includes(current.data?.status)) return;
      await request(checkedKey(key), "PUT", { ...current.data, status: outcome, message: message[outcome], processedAt: now() }, current.etag);
    },
  };
}

export async function processHeatingControlRequests({ firebase, ha, states, now = Date.now }) {
  let current = states;
  const requests = await firebase.requests();
  for (const [key, summary] of Object.entries(requests).sort(([a], [b]) => a.localeCompare(b))) {
    if (!REQUEST_KEY.test(key) || !["pending", "processing"].includes(summary?.status)) continue;
    const item = await firebase.readRequest(key);
    if (!item.data || !["pending", "processing"].includes(item.data.status)) continue;
    const configuration = parseHaHeatingConfiguration(current);
    // A previous process might have completed the HA action but lost its receipt.
    if (item.data.status === "processing") {
      if (now() <= Math.max(item.data.expiresAt || 0, (item.data.claimedAt || 0) + 45_000)) continue;
      const accepted = configuration?.requestId === key && configuration.revision === item.data.expectedRevision + 1;
      await firebase.finish(key, accepted ? "accepted" : "uncertain");
      continue;
    }
    let valid;
    try { valid = validateHeatingControlRequest(item.data, key, now()); }
    catch { await firebase.finish(key, "rejected"); continue; }
    const status = controlStatusFromHa(current, now());
    if (!status.available || !status.fresh || status.revision !== valid.expectedRevision) {
      await firebase.finish(key, "rejected"); continue;
    }
    if (!await firebase.claim(key, valid, item.etag)) continue;
    // Never replay a command after a timeout. Read the local authoritative configuration instead.
    try { await ha.configure(valid); } catch { /* The call may have succeeded despite a lost reply. */ }
    try {
      current = await ha.readStates();
      const applied = parseHaHeatingConfiguration(current);
      await firebase.writeStatus(controlStatusFromHa(current, now()));
      await firebase.finish(key, applied?.requestId === key && applied.revision === valid.expectedRevision + 1 ? "accepted" : "uncertain");
    } catch {
      await firebase.finish(key, "uncertain");
    }
  }
  return current;
}

export async function main(args = process.argv.slice(2), env = process.env) {
  if (args.some(arg => arg !== "--once")) throw new Error("invalid-argument");
  function required(name) { if (!env[name]?.trim()) throw new Error("missing-environment"); return env[name].trim(); }
  const ha = createHeatingConfigurationHaClient({ url: required("HOME_ASSISTANT_URL"), token: required("HOME_ASSISTANT_TOKEN") });
  const firebase = createHeatingControlFirebase({ url: required("NEXT_PUBLIC_FIREBASE_DATABASE_URL"), apiKey: required("NEXT_PUBLIC_FIREBASE_API_KEY"), email: required("FIREBASE_EMAIL"), password: required("FIREBASE_PASSWORD") });
  const abort = new AbortController();
  const stop = () => abort.abort();
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try {
    do {
      try {
        const states = await ha.readStates();
        await firebase.writeStatus(controlStatusFromHa(states));
        await processHeatingControlRequests({ firebase, ha, states });
        console.log("[heating-control] observation configuration synchronized");
      } catch {
        console.error("[heating-control] synchronization unconfirmed");
        if (args.includes("--once")) process.exitCode = 1;
      }
      if (args.includes("--once")) return;
      await delay(10_000, undefined, { signal: abort.signal }).catch(() => {});
    } while (!abort.signal.aborted);
  } finally { process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => {
  console.error("[heating-control] startup failed"); process.exitCode = 1;
});
