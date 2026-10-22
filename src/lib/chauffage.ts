/** Shared, read-only heating telemetry contract. No network calls or device commands. */
export const HEATING_STATUS_PATH = "chauffage-ha/status/current";
export const HEATING_ENTITY_IDS = {
  tankA: "sensor.sous_station_bat_a_temperature_cuve",
  tankB: "sensor.batiment_b_ballon_b",
  tankD: "sensor.esphome_web_61063e_tampon_haut",
  woodBoiler: "sensor.esphome_web_61063e_temp_rature_chaudi_re",
  fuelSetpoint: "climate.chaudiere_fioul",
  servo: "sensor.batiment_b_position_servo_ballon_b",
  woodFault: "binary_sensor.esphome_web_61063e_d_faut_chaudi_re",
} as const;

export type HeatingEntityKey = keyof typeof HEATING_ENTITY_IDS;
export type HeatingFreshness = "fresh" | "aging" | "stale" | "unknown";
export type HeatingAvailability = "available" | "unavailable" | "missing" | "invalid";
export type HeatingSourceError = "ha-unreachable" | "ha-http-error" | "invalid-response";

export interface HeatingEntity {
  entity_id: string;
  state: string;
  attributes: {
    unit_of_measurement?: string;
    temperature_unit?: string;
    temperature?: number | string;
  };
  last_reported?: string;
  last_updated?: string;
  last_changed?: string;
}

export interface HeatingSnapshot {
  version: 1;
  connected: boolean;
  /** Time of the most recent attempt; never used as the measurement timestamp. */
  checkedAt: string;
  /** Most recent successful read of HA; retained across a transport failure. */
  lastSuccessfulAt: string | null;
  errorCode?: HeatingSourceError;
  /** Role keys (tankA, etc.), because Firebase keys cannot contain HA's dots. */
  entities: Partial<Record<HeatingEntityKey, HeatingEntity>>;
}

export interface HeatingMetric {
  value: number | null;
  unit: "°C" | "%";
  reportedAt: string | null;
  freshness: HeatingFreshness;
  availability: HeatingAvailability;
  label: string;
}

export interface ChauffageStatus {
  connected: boolean;
  checkedAt: string | null;
  lastSuccessfulAt: string | null;
  relayFreshness: HeatingFreshness;
  errorCode?: HeatingSourceError;
  measurements: Record<"tankA" | "tankB" | "tankD" | "woodBoiler", HeatingMetric>;
  fuel: { setpoint: HeatingMetric; mode: string | null };
  diagnostics: { servo: HeatingMetric; woodFault: boolean | null };
  hasData: boolean;
}

const PHYSICAL_FRESH_MS = 5 * 60_000;
const PHYSICAL_STALE_MS = 30 * 60_000;
const MAX_FUTURE_SKEW_MS = 60_000;
const UNAVAILABLE = new Set(["unavailable", "unknown", "none", ""]);
const ERROR_CODES = new Set<HeatingSourceError>(["ha-unreachable", "ha-http-error", "invalid-response"]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getHeatingEntityIds(): string[] {
  return Object.values(HEATING_ENTITY_IDS);
}

/** Keep only known entity IDs and the small set of attributes needed by the page. */
export function selectHeatingEntities(states: unknown): HeatingSnapshot["entities"] {
  const output: HeatingSnapshot["entities"] = {};
  const candidates = Array.isArray(states) ? states : record(states) ? Object.values(states) : [];
  for (const [key, id] of Object.entries(HEATING_ENTITY_IDS)) {
    const raw = candidates.find((item: unknown) => record(item) && item.entity_id === id);
    if (!record(raw) || typeof raw.state !== "string") continue;
    const attributes: HeatingEntity["attributes"] = {};
    if (record(raw.attributes)) {
      for (const field of ["unit_of_measurement", "temperature_unit"] as const) {
        if (typeof raw.attributes[field] === "string") attributes[field] = raw.attributes[field];
      }
      if (typeof raw.attributes.temperature === "string" || typeof raw.attributes.temperature === "number") {
        attributes.temperature = raw.attributes.temperature;
      }
    }
    const entity: HeatingEntity = { entity_id: id, state: raw.state, attributes };
    for (const field of ["last_reported", "last_updated", "last_changed"] as const) {
      if (typeof raw[field] === "string") entity[field] = raw[field];
    }
    output[key as HeatingEntityKey] = entity;
  }
  return output;
}

export function buildHeatingSnapshot(states: unknown, checkedAt: string): HeatingSnapshot {
  return {
    version: 1, connected: true, checkedAt, lastSuccessfulAt: checkedAt,
    entities: selectHeatingEntities(states),
  };
}

export function heatingFailureSnapshot(
  previous: HeatingSnapshot | null,
  checkedAt: string,
  errorCode: HeatingSourceError,
): HeatingSnapshot {
  return {
    version: 1, connected: false, checkedAt, errorCode,
    lastSuccessfulAt: previous?.lastSuccessfulAt ?? null,
    entities: selectHeatingEntities(previous?.entities),
  };
}

function validTimestamp(value: unknown, nowMs: number): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time > nowMs + MAX_FUTURE_SKEW_MS) return null;
  return new Date(time).toISOString();
}

export function classifyHeatingFreshness(timestamp: string | null, nowMs: number): HeatingFreshness {
  const valid = validTimestamp(timestamp, nowMs);
  if (!valid) return "unknown";
  const age = Math.max(0, nowMs - Date.parse(valid));
  if (age <= PHYSICAL_FRESH_MS) return "fresh";
  if (age <= PHYSICAL_STALE_MS) return "aging";
  return "stale";
}

function numberValue(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function metric(
  entity: HeatingEntity | undefined,
  label: string,
  nowMs: number,
  options: { setpoint?: boolean; percentage?: boolean } = {},
): HeatingMetric {
  const unit = options.percentage ? "%" : "°C";
  const reportedAt = validTimestamp(entity?.last_reported ?? entity?.last_updated ?? entity?.last_changed, nowMs);
  const base: HeatingMetric = {
    value: null, unit, reportedAt,
    freshness: classifyHeatingFreshness(reportedAt, nowMs),
    availability: entity ? "unavailable" : "missing", label,
  };
  if (!entity || UNAVAILABLE.has(entity.state.trim().toLowerCase())) return base;
  const rawValue = options.setpoint ? entity.attributes.temperature : entity.state;
  const value = numberValue(rawValue);
  // HA climate entities do not usually carry a unit. This installation uses °C;
  // an explicit different unit is rejected rather than silently relabelled.
  const sourceUnit = entity.attributes.temperature_unit ?? entity.attributes.unit_of_measurement;
  const supportedUnit = options.percentage
    ? sourceUnit === "%"
    : sourceUnit === "°C" || sourceUnit === "C" || (options.setpoint && sourceUnit === undefined);
  if (value === null || !supportedUnit || (options.percentage && (value < 0 || value > 100))) {
    return { ...base, availability: "invalid" };
  }
  return {
    ...base, value, availability: "available",
    // An unchanged persisted setting is not an old physical measurement.
    freshness: options.setpoint ? "fresh" : base.freshness,
  };
}

/** Accept unknown Firebase data: malformed or older schema is an empty state. */
export function normalizeHeatingSnapshot(raw: unknown, nowMs = Date.now()): ChauffageStatus {
  const snapshot = record(raw) && raw.version === 1 ? raw : null;
  const entities = selectHeatingEntities(snapshot?.entities);
  const fuelEntity = entities.fuelSetpoint;
  const checkedAt = validTimestamp(snapshot?.checkedAt, nowMs);
  const lastSuccessfulAt = validTimestamp(snapshot?.lastSuccessfulAt, nowMs);
  const fault = entities.woodFault?.state;
  return {
    connected: snapshot?.connected === true,
    checkedAt, lastSuccessfulAt,
    relayFreshness: classifyHeatingFreshness(lastSuccessfulAt, nowMs),
    ...(typeof snapshot?.errorCode === "string" && ERROR_CODES.has(snapshot.errorCode as HeatingSourceError)
      ? { errorCode: snapshot.errorCode as HeatingSourceError } : {}),
    measurements: {
      tankA: metric(entities.tankA, "Ballon bâtiment A", nowMs),
      tankB: metric(entities.tankB, "Ballon bâtiment B", nowMs),
      tankD: metric(entities.tankD, "Ballon bâtiment D", nowMs),
      woodBoiler: metric(entities.woodBoiler, "Chaudière à bois", nowMs),
    },
    fuel: {
      setpoint: metric(fuelEntity, "Consigne chaudière fioul", nowMs, { setpoint: true }),
      mode: fuelEntity && !UNAVAILABLE.has(fuelEntity.state.trim().toLowerCase()) ? fuelEntity.state : null,
    },
    diagnostics: {
      servo: metric(entities.servo, "Position du servomoteur", nowMs, { percentage: true }),
      woodFault: fault === "on" ? true : fault === "off" ? false : null,
    },
    hasData: Object.keys(entities).length > 0,
  };
}

export function formatHeatingValue(metricValue: HeatingMetric): string {
  if (metricValue.value === null) return "—";
  return `${metricValue.value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ${metricValue.unit}`;
}
