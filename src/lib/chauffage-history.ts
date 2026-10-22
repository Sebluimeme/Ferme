import {
  HEATING_ENTITY_IDS, HEATING_METRIC_KEYS, normalizeHeatingSnapshot, selectHeatingEntities,
  mergeHeatingLastValid,
} from "./chauffage.ts";
import type { HeatingMetric, HeatingMetricKey, HeatingSnapshot } from "./chauffage.ts";

export const HEATING_HISTORY_PATH = "chauffage-ha/history";
export const HEATING_HISTORY_KEYS = HEATING_METRIC_KEYS;
export type HeatingHistoryKey = HeatingMetricKey;
export interface HeatingHistoryPoint { at: number; value: number | null; kind: "measurement" | "gap" }
export type HeatingHistoryUpdates = Record<string, HeatingHistoryPoint>;

const MINUTE = 60_000;
const DAY = 86_400_000;
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function usablePoint(raw: unknown): HeatingHistoryPoint | null {
  if (!object(raw) || !Number.isSafeInteger(raw.at) || (raw.at as number) < 0
    || !Number.isFinite(new Date(raw.at as number).getTime())) return null;
  if (raw.kind === "gap" && raw.value == null) return { at: raw.at as number, value: null, kind: "gap" };
  if (raw.kind === "measurement" && typeof raw.value === "number" && Number.isFinite(raw.value)) {
    return { at: raw.at as number, value: raw.value, kind: "measurement" };
  }
  return null;
}

/** Decode a single day, multiple day buckets or an array; ignore malformed payloads. */
export function normalizeHeatingHistory(raw: unknown): HeatingHistoryPoint[] {
  const found = new Map<string, HeatingHistoryPoint>();
  function visit(value: unknown, depth: number) {
    if (depth > 4) return;
    const point = usablePoint(value);
    if (point) { found.set(`${point.at}:${point.kind}`, point); return; }
    if (Array.isArray(value) || object(value)) for (const child of Object.values(value)) visit(child, depth + 1);
  }
  visit(raw, 0);
  // A gap precedes a resumed measurement if timestamps happen to be identical.
  return [...found.values()].sort((a, b) => a.at - b.at || (a.kind === "gap" ? -1 : 1));
}

export function heatingHistoryDays(fromMs: number, toMs: number): string[] {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs || fromMs < 0) return [];
  const first = Math.floor(fromMs / DAY) * DAY;
  const last = Math.floor(toMs / DAY) * DAY;
  if ((last - first) / DAY > 366) return [];
  const days: string[] = [];
  for (let at = first; at <= last; at += DAY) days.push(new Date(at).toISOString().slice(0, 10));
  return days;
}

export function heatingHistoryPointPath(key: HeatingHistoryKey, point: HeatingHistoryPoint): string {
  const day = new Date(point.at).toISOString().slice(0, 10);
  const bucket = point.kind === "gap" ? `${point.at}g` : String(Math.floor(point.at / MINUTE) * MINUTE);
  return `${key}/${day}/${bucket}`;
}

/** Merge latest sample within each minute, while retaining all distinct source outage events. */
export function mergeHeatingHistoryUpdates(target: HeatingHistoryUpdates, incoming: HeatingHistoryUpdates): HeatingHistoryUpdates {
  for (const [path, point] of Object.entries(incoming)) {
    if (!target[path] || point.at >= target[path].at) target[path] = point;
  }
  return target;
}

function metrics(snapshot: HeatingSnapshot) {
  const status = normalizeHeatingSnapshot(snapshot, Date.parse(snapshot.checkedAt));
  return { ...status.measurements, fuelSetpoint: status.fuel.setpoint, servo: status.diagnostics.servo };
}

function genuine(metric: HeatingMetric): boolean {
  return metric.availability === "available" && !metric.isFallback && metric.value !== null && metric.reportedAt !== null;
}

/** Archive genuine source observations only. Poll time never becomes a measurement time. */
export function heatingHistoryUpdates(snapshot: HeatingSnapshot, previous: HeatingSnapshot | null = null): HeatingHistoryUpdates {
  const updates: HeatingHistoryUpdates = {};
  const current = metrics(snapshot);
  const old = previous ? metrics(previous) : null;
  for (const key of HEATING_HISTORY_KEYS) {
    const metric = current[key];
    const prior = old?.[key];
    if (snapshot.connected && genuine(metric)) {
      // A reconnect using the same old source reading is not a new measurement.
      if (previous && prior?.reportedAt === metric.reportedAt && prior.value === metric.value) continue;
      const point: HeatingHistoryPoint = { at: Date.parse(metric.reportedAt!), value: metric.value, kind: "measurement" };
      updates[heatingHistoryPointPath(key, point)] = point;
      continue;
    }
    const newlyDisconnected = !snapshot.connected && previous?.connected !== false;
    const sourceChanged = snapshot.connected && (!previous || !prior || genuine(prior)
      || prior.sourceStateAt !== metric.sourceStateAt || prior.availability !== metric.availability);
    if (!newlyDisconnected && !sourceChanged) continue;
    const at = !snapshot.connected ? Date.parse(snapshot.checkedAt) : Date.parse(metric.sourceStateAt ?? snapshot.checkedAt);
    if (!Number.isFinite(at)) continue;
    const point: HeatingHistoryPoint = { at, value: null, kind: "gap" };
    updates[heatingHistoryPointPath(key, point)] = point;
  }
  return updates;
}

/** Validation before REST PATCH prevents arbitrary Firebase paths or null deletions. */
export function validateHeatingHistoryUpdates(raw: unknown): HeatingHistoryUpdates {
  if (!object(raw)) throw new Error("invalid-history-updates");
  const result: HeatingHistoryUpdates = {};
  for (const [path, rawPoint] of Object.entries(raw)) {
    const point = usablePoint(rawPoint);
    const [key] = path.split("/");
    if (!point || !HEATING_HISTORY_KEYS.includes(key as HeatingHistoryKey)
      || path !== heatingHistoryPointPath(key as HeatingHistoryKey, point)) throw new Error("invalid-history-updates");
    result[path] = point;
  }
  return result;
}

/**
 * Recorder import is bounded by its caller. Do not request HA's minimal_response:
 * source units and actual timestamps are required to validate each observation.
 * An initial state synthesized exactly at the query boundary is skipped unless
 * HA also supplies an older last_changed, in which case that original date is kept.
 */
export function importHeatingRecorderHistory(raw: unknown, fromMs: number, toMs: number): {
  updates: HeatingHistoryUpdates; lastValid: NonNullable<HeatingSnapshot["lastValid"]>;
} {
  const updates: HeatingHistoryUpdates = {};
  let lastValid: NonNullable<HeatingSnapshot["lastValid"]> = {};
  if (!Array.isArray(raw)) return { updates, lastValid };
  const allowed = new Set<string>(HEATING_HISTORY_KEYS.map((key) => HEATING_ENTITY_IDS[key]));
  const observations = raw.flat().filter((item) => object(item) && allowed.has(String(item.entity_id))) as Record<string, unknown>[];
  for (const rawEntity of observations) {
    const entity = Object.values(selectHeatingEntities([rawEntity]))[0];
    if (!entity) continue;
    let timestamp = entity.last_updated ?? entity.last_changed;
    let at = Date.parse(timestamp ?? "");
    const changed = Date.parse(entity.last_changed ?? "");
    if (at === fromMs) {
      if (Number.isFinite(changed) && changed < fromMs) { at = changed; timestamp = entity.last_changed; }
      else continue;
    }
    if (!Number.isFinite(at) || at < 0 || at > toMs) continue;
    // Recorder timestamps are source observations, never the HTTP retrieval time.
    const original = { ...entity, last_reported: timestamp, last_updated: timestamp };
    const entities = selectHeatingEntities([original]);
    lastValid = mergeHeatingLastValid(lastValid, {}, entities, toMs);
    const snapshot: HeatingSnapshot = { version: 1, connected: true, checkedAt: new Date(toMs).toISOString(), lastSuccessfulAt: null, entities };
    const key = HEATING_HISTORY_KEYS.find((candidate) => HEATING_ENTITY_IDS[candidate] === original.entity_id)!;
    const value = metrics(snapshot)[key];
    const point: HeatingHistoryPoint = genuine(value)
      ? { at, value: value.value, kind: "measurement" } : { at, value: null, kind: "gap" };
    // A genuine pre-window initial state is useful as a last-known value but not
    // inserted as a new boundary reading in the requested history window.
    if (at >= fromMs) mergeHeatingHistoryUpdates(updates, { [heatingHistoryPointPath(key, point)]: point });
  }
  return { updates, lastValid };
}
