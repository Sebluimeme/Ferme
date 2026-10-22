#!/usr/bin/env node
/**
 * Read-only heating relay: HA GET states/history → dedicated Firebase telemetry.
 * It never calls HA services and has no command listener.
 * Environment is supplied by the caller (e.g. systemd EnvironmentFile).
 * node --experimental-strip-types scripts/home-assistant-chauffage-bridge.mjs [--once] [--backfill-days 1..7]
 */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  HEATING_STATUS_PATH,
  buildHeatingSnapshot,
  heatingFailureSnapshot,
  selectHeatingEntities,
  mergeHeatingLastValid,
  HEATING_ENTITY_IDS,
  HEATING_TRANSMITTED_ENTITY_ID,
} from "../src/lib/chauffage.ts";
import {
  HEATING_HISTORY_PATH, HEATING_HISTORY_KEYS, heatingHistoryUpdates,
  mergeHeatingHistoryUpdates, validateHeatingHistoryUpdates, importHeatingRecorderHistory,
} from "../src/lib/chauffage-history.ts";

const DEFAULT_POLL_MS = 30_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const DEFAULT_TIMEOUT_MS = 20_000;

class RelayError extends Error {
  constructor(code) { super(code); this.code = code; }
}

/** Bounded fetch + body read; no response body or credential-bearing URL in errors. */
async function jsonRequest(url, init, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, errorPrefix }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new RelayError(`${errorPrefix}-http-error`);
    try { return await response.json(); }
    catch { throw new RelayError(controller.signal.aborted ? `${errorPrefix}-unreachable` : "invalid-response"); }
  } catch (error) {
    if (error instanceof RelayError) throw error;
    throw new RelayError(`${errorPrefix}-unreachable`);
  } finally {
    clearTimeout(timeout);
  }
}

function checkedUrl(value, name) {
  let url;
  try { url = new URL(value); } catch { throw new RelayError(`${name}-invalid-url`); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new RelayError(`${name}-invalid-url`);
  }
  return url.toString().replace(/\/$/, "");
}

export function createHeatingHaReader({ baseUrl, token, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const base = checkedUrl(baseUrl, "ha");
  return async function readStates() {
    const states = await jsonRequest(`${base}/api/states`, {
      method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    }, { fetchImpl, timeoutMs, errorPrefix: "ha" });
    if (!Array.isArray(states)) throw new RelayError("invalid-response");
    return states;
  };
}

/** Recorder access is GET-only, targeted to six known entities and at most seven days. */
export function createHeatingHaHistoryReader({ baseUrl, token, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const base = checkedUrl(baseUrl, "ha");
  return async function readHistory(fromMs, toMs) {
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs < 0 || toMs <= fromMs || toMs - fromMs > 7 * 86_400_000) {
      throw new RelayError("invalid-history-range");
    }
    const url = new URL(`${base}/api/history/period/${new Date(fromMs).toISOString()}`);
    url.searchParams.set("end_time", new Date(toMs).toISOString());
    url.searchParams.set("filter_entity_id", [...HEATING_HISTORY_KEYS.map((key) => HEATING_ENTITY_IDS[key]), HEATING_TRANSMITTED_ENTITY_ID].join(","));
    const history = await jsonRequest(url, {
      method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store",
    }, { fetchImpl, timeoutMs, errorPrefix: "ha-history" });
    if (!Array.isArray(history)) throw new RelayError("invalid-response");
    return history;
  };
}

/** Authenticated REST prevents a Firebase SDK write being queued past a timeout. */
export function createHeatingFirebaseClient({
  databaseUrl, apiKey, email, password, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, now = Date.now,
}) {
  const base = checkedUrl(databaseUrl, "firebase");
  let cachedToken = null;
  let tokenExpiresAt = 0;
  async function token() {
    if (cachedToken && tokenExpiresAt > now() + 60_000) return cachedToken;
    const result = await jsonRequest(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }, { fetchImpl, timeoutMs, errorPrefix: "firebase-auth" });
    if (typeof result?.idToken !== "string" || !result.idToken || !Number.isFinite(Number(result.expiresIn))) {
      throw new RelayError("firebase-auth-invalid-response");
    }
    cachedToken = result.idToken;
    tokenExpiresAt = now() + Number(result.expiresIn) * 1_000;
    return cachedToken;
  }
  async function request(method, snapshot, path = HEATING_STATUS_PATH) {
    const url = new URL(`${base}/${path}.json`);
    url.searchParams.set("auth", await token());
    try {
      return await jsonRequest(url, {
        method, headers: { "Content-Type": "application/json" }, cache: "no-store",
        ...(["PUT", "PATCH"].includes(method) ? { body: JSON.stringify(snapshot) } : {}),
      }, { fetchImpl, timeoutMs, errorPrefix: "firebase" });
    } catch (error) {
      // Refresh credentials on the next bounded attempt; never retry a write invisibly.
      cachedToken = null;
      throw error;
    }
  }
  return {
    read: () => request("GET"),
    write: (snapshot) => request("PUT", snapshot),
    writeHistory: (updates) => {
      const safe = validateHeatingHistoryUpdates(updates);
      return Object.keys(safe).length ? request("PATCH", safe, HEATING_HISTORY_PATH) : Promise.resolve(null);
    },
  };
}

export async function collectHeatingSnapshot({ readStates, previous = null, now = Date.now }) {
  try {
    const states = await readStates();
    if (!Array.isArray(states)) throw new RelayError("invalid-response");
    return buildHeatingSnapshot(states, new Date(now()).toISOString(), previous);
  } catch (error) {
    const code = ["ha-unreachable", "ha-http-error", "invalid-response"].includes(error?.code)
      ? error.code : "ha-unreachable";
    return heatingFailureSnapshot(previous, new Date(now()).toISOString(), code);
  }
}

/** Only retain data from the supported schema when recovering after a restart. */
export function restoreHeatingSnapshot(value, nowMs = Date.now()) {
  if (!value || value.version !== 1 || typeof value.checkedAt !== "string") return null;
  return {
    version: 1, connected: value.connected === true, checkedAt: value.checkedAt,
    lastSuccessfulAt: typeof value.lastSuccessfulAt === "string" ? value.lastSuccessfulAt : null,
    entities: selectHeatingEntities(value.entities),
    lastValid: mergeHeatingLastValid(value.lastValid, value.entities, {}, nowMs),
  };
}

export function heatingBackoffMs(consecutiveFailures, pollMs = DEFAULT_POLL_MS) {
  return Math.min(MAX_BACKOFF_MS, pollMs * (2 ** Math.min(Math.max(0, consecutiveFailures), 8)));
}

/** Keep history retries idempotent and independent from live-status publication. */
export async function publishHeatingCycle({ firebase, current, previous = null, pendingHistory = {} }) {
  mergeHeatingHistoryUpdates(pendingHistory, heatingHistoryUpdates(current, previous));
  await firebase.write(current);
  try {
    await firebase.writeHistory(pendingHistory);
    return { pendingHistory: {}, historyError: null };
  } catch (error) {
    return { pendingHistory, historyError: error instanceof RelayError ? error.code : "unexpected-failure" };
  }
}

function requireEnv(env, key) {
  const value = env[key]?.trim();
  if (!value) throw new RelayError(`${key}-missing`);
  return value;
}

export async function main(args = process.argv.slice(2), env = process.env) {
  const { once, backfillDays } = parseHeatingRelayArgs(args);
  const readStates = createHeatingHaReader({
    baseUrl: requireEnv(env, "HOME_ASSISTANT_URL"), token: requireEnv(env, "HOME_ASSISTANT_TOKEN"),
  });
  const readHistory = createHeatingHaHistoryReader({
    baseUrl: requireEnv(env, "HOME_ASSISTANT_URL"), token: requireEnv(env, "HOME_ASSISTANT_TOKEN"),
  });
  const firebase = createHeatingFirebaseClient({
    databaseUrl: requireEnv(env, "NEXT_PUBLIC_FIREBASE_DATABASE_URL"),
    apiKey: requireEnv(env, "NEXT_PUBLIC_FIREBASE_API_KEY"),
    email: requireEnv(env, "FIREBASE_EMAIL"), password: requireEnv(env, "FIREBASE_PASSWORD"),
  });
  const requestedPoll = Number(env.HEATING_POLL_MS || DEFAULT_POLL_MS);
  const pollMs = Number.isFinite(requestedPoll) ? Math.min(MAX_BACKOFF_MS, Math.max(DEFAULT_POLL_MS, requestedPoll)) : DEFAULT_POLL_MS;
  const shutdown = new AbortController();
  const stop = () => shutdown.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  let previous = null;
  let restored = false;
  let failures = 0;
  let historyImported = false;
  let nextHistoryAttempt = 0;
  let historyBootstrapError = false;
  let pendingHistory = {};
  try {
    do {
      try {
        // A failed initial read must not erase previously published measurements.
        if (!restored) {
          previous = restoreHeatingSnapshot(await firebase.read());
          restored = true;
        }
        if (!historyImported && Date.now() >= nextHistoryAttempt) {
          try {
            const end = Date.now();
            const start = end - backfillDays * 86_400_000;
            const imported = importHeatingRecorderHistory(await readHistory(start, end), start, end);
            mergeHeatingHistoryUpdates(pendingHistory, imported.updates);
            if (previous) previous.lastValid = mergeHeatingLastValid(imported.lastValid, previous.lastValid, previous.entities, end);
            else previous = { version: 1, connected: false, checkedAt: new Date(end).toISOString(), lastSuccessfulAt: null, entities: {}, lastValid: imported.lastValid };
            historyImported = true;
            historyBootstrapError = false;
          } catch (error) {
            nextHistoryAttempt = Date.now() + MAX_BACKOFF_MS;
            historyBootstrapError = true;
            console.error(`[chauffage] history-bootstrap ${error instanceof RelayError ? error.code : "unexpected-failure"}`);
          }
        }
        const current = await collectHeatingSnapshot({ readStates, previous });
        const published = await publishHeatingCycle({ firebase, current, previous, pendingHistory });
        previous = current;
        pendingHistory = published.pendingHistory;
        if (published.historyError) console.error(`[chauffage] history-publish ${published.historyError}`);
        failures = previous.connected ? 0 : failures + 1;
        console.log(`[chauffage] published connected=${previous.connected} entities=${Object.keys(previous.entities).length}`);
        if (once) {
          if (!previous.connected || published.historyError || historyBootstrapError) process.exitCode = 1;
          return;
        }
      } catch (error) {
        failures += 1;
        const safeCode = error instanceof RelayError ? error.code : "unexpected-failure";
        console.error(`[chauffage] ${safeCode}`);
        if (once) { process.exitCode = 1; return; }
      }
      await delay(heatingBackoffMs(failures, pollMs), undefined, { signal: shutdown.signal }).catch((error) => {
        if (error?.name !== "AbortError") throw error;
      });
    } while (!shutdown.signal.aborted);
  } finally {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
  }
}

export function parseHeatingRelayArgs(args) {
  let once = false;
  let backfillDays = 1;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--once") once = true;
    else if (args[index] === "--backfill-days" && /^[1-7]$/.test(args[index + 1] ?? "")) backfillDays = Number(args[++index]);
    else throw new RelayError("usage: --once [--backfill-days 1..7]");
  }
  return { once, backfillDays };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[chauffage] ${error instanceof RelayError ? error.code : "unexpected-failure"}`);
    process.exitCode = 1;
  });
}
