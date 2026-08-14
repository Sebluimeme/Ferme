/**
 * citerneEau.ts
 * Pure parsing/normalization logic for the Citerne 1 eau potable MQTT/Home Assistant sensors.
 * No Firebase, no HA network calls — fully testable in isolation.
 */

// ── Home Assistant raw state (subset used here) ────────────────────────────────

export interface HaEntityState {
  entity_id: string;
  state: string;
  attributes?: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
}

// ── Whitelisted entities ────────────────────────────────────────────────────────

export const CITERNE_ENTITY_IDS = {
  niveau: "sensor.citerne_1_eau_potable_niveau",
  volumeDisponible: "sensor.citerne_1_eau_potable_volume_disponible",
  hauteurEau: "sensor.citerne_1_eau_potable_hauteur_d_eau",
  distanceCapteur: "sensor.citerne_1_eau_potable_distance_capteur",
  debit: "sensor.citerne_1_eau_potable_debit",
  batterie: "sensor.citerne_1_eau_potable_batterie",
  tensionBatterie: "sensor.citerne_1_eau_potable_tension_batterie",
  rssi: "sensor.citerne_1_eau_potable_rssi",
  snr: "sensor.citerne_1_eau_potable_snr",
} as const;

export type CiterneMetricKey = keyof typeof CITERNE_ENTITY_IDS;

export const CITERNE_ENTITY_ID_LIST: string[] = Object.values(CITERNE_ENTITY_IDS);

const DEFAULT_UNITS: Record<CiterneMetricKey, string> = {
  niveau: "%",
  volumeDisponible: "L",
  hauteurEau: "m",
  distanceCapteur: "cm",
  debit: "L/h",
  batterie: "%",
  tensionBatterie: "V",
  rssi: "dBm",
  snr: "dB",
};

/** Sentinel values used by the payload to mean "no measurement" for specific sensors. */
const SENTINEL_UNAVAILABLE: Partial<Record<CiterneMetricKey, number[]>> = {
  debit: [-1],
};

const CLAMP_0_100: Partial<Record<CiterneMetricKey, true>> = {
  niveau: true,
  batterie: true,
};

/** Negative values are invalid for these physical measurements; RSSI/SNR may legitimately be negative. */
const NEGATIVE_UNAVAILABLE = new Set<CiterneMetricKey>([
  "volumeDisponible",
  "hauteurEau",
  "distanceCapteur",
  "debit",
  "tensionBatterie",
]);

// ── Value parsing ───────────────────────────────────────────────────────────────

/** Parses a Home Assistant state string into a finite number, or null when absent/unavailable/unknown/non-numeric. */
export function parseHaNumber(state: string | undefined | null): number | null {
  if (state == null) return null;
  const trimmed = state.trim();
  if (trimmed === "" || trimmed === "unavailable" || trimmed === "unknown" || trimmed === "none") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Clamps a value to [0, 100]; passes null through unchanged. */
export function clampPct(value: number | null): number | null {
  if (value === null) return null;
  return Math.max(0, Math.min(100, value));
}

// ── Freshness classification ────────────────────────────────────────────────────

export type Freshness = "fresh" | "aging" | "stale" | "unknown";

/**
 * Classifies data freshness for a sensor that reports once per day.
 * - fresh:   <= 27h  (a day plus a few hours of slack for daily-report jitter)
 * - aging:   <= 48h  (missed one report cycle, worth a soft warning)
 * - stale:   > 48h   (missed multiple cycles, don't call it live)
 * - unknown: no timestamp available
 */
export function classifyFreshness(lastUpdatedIso: string | null | undefined, nowMs: number): Freshness {
  if (!lastUpdatedIso) return "unknown";
  const t = new Date(lastUpdatedIso).getTime();
  if (!Number.isFinite(t)) return "unknown";
  const ageHours = (nowMs - t) / (1000 * 60 * 60);
  if (ageHours <= 27) return "fresh";
  if (ageHours <= 48) return "aging";
  return "stale";
}

// ── Normalized payload ──────────────────────────────────────────────────────────

export interface CiterneMetric {
  value: number | null;
  unit: string;
  lastUpdated: string | null;
}

export interface CiterneStatus {
  niveau: CiterneMetric;
  volumeDisponible: CiterneMetric;
  hauteurEau: CiterneMetric;
  distanceCapteur: CiterneMetric;
  debit: CiterneMetric;
  batterie: CiterneMetric;
  tensionBatterie: CiterneMetric;
  rssi: CiterneMetric;
  snr: CiterneMetric;
  /** Most recent last_updated/last_changed across all present entities, or null if none found. */
  lastUpdated: string | null;
  freshness: Freshness;
  /** True when at least one whitelisted entity was found in the HA states payload. */
  hasData: boolean;
}

function buildMetric(entity: HaEntityState | undefined, key: CiterneMetricKey): CiterneMetric {
  const fallbackUnit = DEFAULT_UNITS[key];
  if (!entity) return { value: null, unit: fallbackUnit, lastUpdated: null };

  let value = parseHaNumber(entity.state);
  const sentinels = SENTINEL_UNAVAILABLE[key];
  if (value !== null && sentinels?.includes(value)) value = null;
  if (value !== null && NEGATIVE_UNAVAILABLE.has(key) && value < 0) value = null;
  if (value !== null && CLAMP_0_100[key]) value = clampPct(value);

  const unit = typeof entity.attributes?.unit_of_measurement === "string"
    ? entity.attributes.unit_of_measurement
    : fallbackUnit;
  const lastUpdated = entity.last_updated ?? entity.last_changed ?? null;

  return { value, unit, lastUpdated };
}

/** Normalizes raw Home Assistant states for the tank entities into a typed, null-safe payload. */
export function normalizeCiterneStatus(
  entities: Record<string, HaEntityState>,
  nowMs: number,
): CiterneStatus {
  const get = (key: CiterneMetricKey) => entities[CITERNE_ENTITY_IDS[key]];

  const niveau = buildMetric(get("niveau"), "niveau");
  const volumeDisponible = buildMetric(get("volumeDisponible"), "volumeDisponible");
  const hauteurEau = buildMetric(get("hauteurEau"), "hauteurEau");
  const distanceCapteur = buildMetric(get("distanceCapteur"), "distanceCapteur");
  const debit = buildMetric(get("debit"), "debit");
  const batterie = buildMetric(get("batterie"), "batterie");
  const tensionBatterie = buildMetric(get("tensionBatterie"), "tensionBatterie");
  const rssi = buildMetric(get("rssi"), "rssi");
  const snr = buildMetric(get("snr"), "snr");

  const presentEntities = CITERNE_ENTITY_ID_LIST
    .map((id) => entities[id])
    .filter((e): e is HaEntityState => !!e);

  const hasData = presentEntities.length > 0;
  const lastUpdated = presentEntities.reduce<string | null>((latest, e) => {
    const ts = e.last_updated ?? e.last_changed ?? null;
    if (!ts) return latest;
    if (!latest) return ts;
    return new Date(ts).getTime() > new Date(latest).getTime() ? ts : latest;
  }, null);

  return {
    niveau, volumeDisponible, hauteurEau, distanceCapteur, debit,
    batterie, tensionBatterie, rssi, snr,
    lastUpdated,
    freshness: classifyFreshness(lastUpdated, nowMs),
    hasData,
  };
}

export interface CiterneRawPayload {
  niveau?: number | string;
  volume?: number | string;
  hauteur?: number | string;
  distance?: number | string;
  debit?: number | string;
  batterie?: number | string;
  batterie_voltage?: number | string;
  rssi?: number | string;
  snr?: number | string;
}

const PAYLOAD_FIELDS: Array<{
  key: keyof CiterneRawPayload;
  metric: CiterneMetricKey;
  unit: string;
}> = [
  { key: "niveau", metric: "niveau", unit: "%" },
  { key: "volume", metric: "volumeDisponible", unit: "L" },
  { key: "hauteur", metric: "hauteurEau", unit: "m" },
  { key: "distance", metric: "distanceCapteur", unit: "cm" },
  { key: "debit", metric: "debit", unit: "L/min" },
  { key: "batterie", metric: "batterie", unit: "%" },
  { key: "batterie_voltage", metric: "tensionBatterie", unit: "V" },
  { key: "rssi", metric: "rssi", unit: "dBm" },
  { key: "snr", metric: "snr", unit: "dB" },
];

/** Normalizes the raw retained MQTT payload used by the Firebase production relay. */
export function normalizeCiternePayload(
  payload: CiterneRawPayload,
  receivedAt: string,
  nowMs: number,
): CiterneStatus {
  const entities: Record<string, HaEntityState> = {};
  for (const field of PAYLOAD_FIELDS) {
    const value = payload[field.key];
    if (value === undefined || value === null) continue;
    const entityId = CITERNE_ENTITY_IDS[field.metric];
    entities[entityId] = {
      entity_id: entityId,
      state: String(value),
      attributes: { unit_of_measurement: field.unit },
      last_changed: receivedAt,
      last_updated: receivedAt,
    };
  }
  return normalizeCiterneStatus(entities, nowMs);
}

// ── Formatting helpers (used by UI) ──────────────────────────────────────────────

export function formatFreshnessLabel(freshness: Freshness): string {
  switch (freshness) {
    case "fresh": return "À jour";
    case "aging": return "Vieillissante";
    case "stale": return "Obsolète";
    case "unknown": return "Inconnue";
    default: return freshness;
  }
}

export function formatMetricValue(metric: CiterneMetric, digits = 1): string {
  if (metric.value === null) return "—";
  const formatted = metric.value.toLocaleString("fr-FR", { maximumFractionDigits: digits }).replace(/\u202f/g, " ");
  return `${formatted} ${metric.unit}`;
}

/** Relative age label ("il y a 3 h") for a last-updated timestamp. */
export function formatRelativeAge(iso: string | null, nowMs: number): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diffMs = Math.max(0, nowMs - t);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}
