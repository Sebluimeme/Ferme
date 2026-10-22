export const HEATING_CONTROL_PATH = "chauffage-ha/control";
export type HeatingControlMode = "manual" | "automatic";
export interface HeatingControlSettings {
  mode: HeatingControlMode;
  manualTemperature: number;
  minimumD: number;
}
export interface HeatingControlStatus extends HeatingControlSettings {
  available: boolean;
  fresh: boolean;
  updatedAt: string | null;
  revision: number;
  requestId: string | null;
  phase: "observation" | "suspended";
  reason: string;
  recommendedTemperature: number | null;
  temperatureD: number | null;
  temperatureB: number | null;
  nextAdjustmentAt: string | null;
  calibrationValid: false;
  actuationEnabled: false;
}
export interface HeatingControlRequest extends HeatingControlSettings {
  version: 1;
  id: string;
  requestedBy: string;
  createdAt: number;
  expiresAt: number;
  expectedRevision: number;
  status: "pending" | "processing" | "accepted" | "rejected" | "uncertain";
  message?: string;
  processedAt?: number;
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const iso = (value: unknown): string | null => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
export function validHeatingSettings(value: unknown): value is HeatingControlSettings {
  const v = record(value);
  return (v.mode === "manual" || v.mode === "automatic")
    && finite(v.manualTemperature) && Number.isInteger(v.manualTemperature) && v.manualTemperature >= 50 && v.manualTemperature <= 90
    && finite(v.minimumD) && Number.isInteger(v.minimumD) && v.minimumD >= 40 && v.minimumD <= 75;
}

export function heatingControlReason(reason: string): string {
  return ({
    manual_observation: "Réglage manuel mémorisé, sans mouvement du servomoteur.",
    warming_up: "Observation des premières mesures avant de calculer une tendance.",
    automatic_observation: "Proposition calculée pour préserver la limite du ballon D.",
    resting_observation: "Fioul proposé au minimum de 50 °C : aucun appoint supplémentaire demandé.",
    releasing_observation: "Retour proposé directement à 50 °C : le ballon D est suffisamment chaud ou remonte vers ce niveau.",
    stabilizing: "La température se stabilise : aucun changement proposé.",
    cooldown: "Le délai entre deux ajustements est respecté.",
    sensor_d_unavailable: "Calcul suspendu : la sonde du ballon D ne répond pas.",
    sensor_b_unavailable: "Calcul suspendu : le module du bâtiment B ne répond pas.",
    sensor_d_stale: "Calcul suspendu : la mesure du ballon D est trop ancienne.",
    sensor_b_stale: "Calcul suspendu : la mesure du ballon B est trop ancienne.",
    no_heat_response: "L’observation ne montre pas de remontée ; aucune hausse supplémentaire n’est proposée.",
    observer_stale: "Calcul suspendu : l’observation n’a pas été actualisée récemment.",
    configuration_invalid: "Configuration de régulation indisponible ou invalide.",
    controller_unavailable: "Le suivi de la régulation n’est pas disponible.",
  } as Record<string, string>)[reason] ?? "Calcul en attente d’une nouvelle vérification.";
}

/** Strictly observation-only protocol. A future actuator needs a new, reviewed version. */
export function normalizeHeatingControl(value: unknown, now = Date.now()): HeatingControlStatus {
  const v = record(value);
  const updatedAt = iso(v.updatedAt);
  const age = updatedAt ? now - Date.parse(updatedAt) : Infinity;
  const available = v.version === 1 && v.available === true && validHeatingSettings(v)
    && finite(v.revision) && Number.isInteger(v.revision) && v.revision >= 0
    && v.calibrationValid === false && v.actuationEnabled === false;
  return {
    available, fresh: available && age >= -30_000 && age <= 90_000,
    updatedAt, revision: available ? v.revision as number : 0,
    mode: v.mode === "automatic" ? "automatic" : "manual",
    manualTemperature: validHeatingSettings(v) ? v.manualTemperature : 60,
    minimumD: validHeatingSettings(v) ? v.minimumD : 58,
    requestId: typeof v.requestId === "string" ? v.requestId : null,
    phase: v.phase === "observation" && available ? "observation" : "suspended",
    reason: available && typeof v.reason === "string" ? v.reason : "controller_unavailable",
    recommendedTemperature: available && finite(v.recommendedTemperature) && v.recommendedTemperature >= 50 && v.recommendedTemperature <= 90 ? v.recommendedTemperature : null,
    temperatureD: finite(v.temperatureD) ? v.temperatureD : null,
    temperatureB: finite(v.temperatureB) ? v.temperatureB : null,
    nextAdjustmentAt: iso(v.nextAdjustmentAt), calibrationValid: false, actuationEnabled: false,
  };
}

export function controlStatusFromHa(states: unknown, now = Date.now()) {
  const rows = Array.isArray(states) ? states.map(record) : [];
  const entity = rows.find(row => row.entity_id === "sensor.ferme_chauffage_controle");
  const a = record(entity?.attributes);
  const unavailable = !entity || ["unknown", "unavailable"].includes(String(entity.state));
  const nextAt = finite(a.next_adjustment_at) ? new Date(a.next_adjustment_at * 1000).toISOString() : null;
  const raw = {
    version: 1, available: !unavailable && a.schema_version === 1,
    updatedAt: a.updated_at, revision: a.revision, requestId: a.request_id,
    mode: a.mode, manualTemperature: a.manual_temperature, minimumD: a.minimum_d,
    phase: a.phase, reason: a.reason,
    recommendedTemperature: a.recommended_temperature,
    temperatureD: a.observed_temperature_d, temperatureB: a.observed_temperature_b,
    nextAdjustmentAt: nextAt, calibrationValid: a.calibration_valid, actuationEnabled: a.actuation_enabled,
  };
  return { version: 1, ...normalizeHeatingControl(raw, now) };
}

export function parseHaHeatingConfiguration(states: unknown): { revision: number; requestId: string } | null {
  if (!Array.isArray(states)) return null;
  const entity = states.map(record).find(row => row.entity_id === "input_text.ferme_chauffage_configuration");
  try {
    const c = JSON.parse(String(entity?.state));
    if (c?.v !== 1 || !Number.isInteger(c.r) || c.r < 0 || typeof c.id !== "string") return null;
    if (!validHeatingSettings({ mode: c.m, manualTemperature: c.t, minimumD: c.d })) return null;
    return { revision: c.r, requestId: c.id };
  } catch { return null; }
}

export function validateHeatingControlRequest(value: unknown, key: string, now = Date.now()): HeatingControlRequest {
  const v = record(value);
  if (!validHeatingSettings(v) || v.version !== 1 || v.id !== key || !/^\d{13}-[a-f0-9]{32}$/.test(key)
    || typeof v.requestedBy !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(v.requestedBy)
    || !Number.isInteger(v.expectedRevision) || (v.expectedRevision as number) < 0 || (v.expectedRevision as number) > 999999998
    || v.status !== "pending" || !finite(v.createdAt) || !finite(v.expiresAt)
    || v.createdAt > now + 30_000 || v.expiresAt <= now || v.expiresAt - v.createdAt > 90_000
    || v.expiresAt <= v.createdAt || now - v.createdAt > 90_000
    || Object.keys(v).some(k => !["version", "id", "requestedBy", "createdAt", "expiresAt", "expectedRevision", "status", "mode", "manualTemperature", "minimumD"].includes(k))) {
    throw new Error("invalid-or-expired-request");
  }
  return v as unknown as HeatingControlRequest;
}
