export const HEATING_CONTROL_PATH = "chauffage-ha/control";
export const HEATING_CONTROL_VERSION = 2;
export const HEATING_FUEL_MINIMUM = 50;
export const HEATING_FUEL_MAXIMUM = 70;
export const HEATING_RELEASE_D = 60;
export const HEATING_DEFAULT_MINIMUM_D = 57;
export type HeatingControlMode = "manual" | "automatic";
export const HEATING_DELIVERY_STATES = ["disabled", "waiting_module", "waiting_sensor", "pending", "transmitted", "uncertain", "blocked"] as const;
export type HeatingDeliveryState = typeof HEATING_DELIVERY_STATES[number];
export interface HeatingControlSettings {
  mode: HeatingControlMode;
  manualTemperature: number;
  minimumD: number;
}
export interface HeatingControlStatus extends HeatingControlSettings {
  version: 2;
  available: boolean;
  fresh: boolean;
  updatedAt: string | null;
  revision: number;
  requestId: string | null;
  phase: "active" | "suspended";
  reason: string;
  recommendedTemperature: number | null;
  temperatureD: number | null;
  temperatureB: number | null;
  nextAdjustmentAt: string | null;
  calibrationValid: boolean;
  actuationEnabled: boolean;
  fuelMinimum: 50;
  fuelMaximum: 70;
  releaseTemperatureD: 60;
  moduleOnline: boolean;
  moduleLastSeenAt: string | null;
  deliveryState: HeatingDeliveryState;
  desiredTemperature: number | null;
  lastTransmittedTemperature: number | null;
  lastTransmittedAt: string | null;
  positionFeedback: "unmeasured";
}
export interface HeatingControlRequest extends HeatingControlSettings {
  version: 2;
  id: string;
  requestedBy: string;
  createdAt: number;
  expiresAt: number;
  expectedRevision: number;
  status: "pending" | "processing" | "accepted" | "rejected" | "uncertain";
  message?: string;
  processedAt?: number;
}

/** Display-only fallback: a remembered API setting never becomes a new control decision. */
export function heatingDisplayedTarget(status: HeatingControlStatus, offline = false) {
  if (!status.available) return { value: null, label: "Consigne indisponible", detail: "En attente des réglages" };
  const stale = offline || !status.fresh;
  if (status.mode === "manual") return { value: status.manualTemperature, label: "Consigne souhaitée", detail: stale ? "Mode manuel · état ancien" : "Mode manuel" };
  const calculated = status.desiredTemperature ?? status.recommendedTemperature;
  if (calculated !== null) return {
    value: calculated,
    label: stale ? "Dernière consigne calculée" : "Consigne théorique",
    detail: stale ? "Calcul ancien" : status.phase === "suspended" ? "En attente de transmission" : "Calcul automatique",
  };
  if (status.lastTransmittedTemperature !== null && status.lastTransmittedAt !== null) return {
    value: status.lastTransmittedTemperature,
    label: "Consigne conservée",
    detail: stale ? "Dernier état connu" : "Calcul suspendu",
  };
  return { value: null, label: "Consigne à calculer", detail: "Aucune consigne connue" };
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const iso = (value: unknown): string | null => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
const nullableObservedIso = (value: unknown, now: number) => value == null || (iso(value) !== null && Date.parse(value as string) >= 0 && Date.parse(value as string) <= now + 30_000);
const fuelTemperature = (value: unknown): value is number => finite(value) && value >= HEATING_FUEL_MINIMUM && value <= HEATING_FUEL_MAXIMUM;
const nullableFuelTemperature = (value: unknown) => value == null || fuelTemperature(value);
const observedTemperature = (value: unknown) => finite(value) && value >= 0 && value <= 110 ? value : null;
export function validHeatingSettings(value: unknown): value is HeatingControlSettings {
  const v = record(value);
  return (v.mode === "manual" || v.mode === "automatic")
    && fuelTemperature(v.manualTemperature) && Number.isInteger(v.manualTemperature)
    && finite(v.minimumD) && Number.isInteger(v.minimumD) && v.minimumD >= 55 && v.minimumD <= 59;
}

/** Preserve a hidden invalid draft while saving the active mode with its last confirmed counterpart. */
export function heatingSettingsFromDraft(mode: HeatingControlMode, manualTemperature: unknown, minimumD: unknown, confirmed: HeatingControlSettings): HeatingControlSettings | null {
  if (!validHeatingSettings(confirmed)) return null;
  const manualValid = fuelTemperature(manualTemperature) && Number.isInteger(manualTemperature);
  const minimumValid = finite(minimumD) && Number.isInteger(minimumD) && minimumD >= 55 && minimumD <= 59;
  if ((mode === "manual" && !manualValid) || (mode === "automatic" && !minimumValid)) return null;
  const settings = {
    mode,
    manualTemperature: manualValid ? manualTemperature as number : confirmed.manualTemperature,
    minimumD: minimumValid ? minimumD as number : confirmed.minimumD,
  };
  return validHeatingSettings(settings) ? settings : null;
}

export function heatingControlReason(reason: string): string {
  return ({
    control_disabled: "Le pilotage du servomoteur est désactivé.",
    calibration_required: "Les trois points de calibration du servomoteur ne sont pas encore validés. Les réglages peuvent être mémorisés, mais aucune consigne n’est transmise.",
    legacy_conflict: "Pilotage suspendu : une autre automatisation commande encore le servomoteur.",
    warming_up: "Premières mesures en cours pour calculer la tendance.",
    manual_ready: "La consigne manuelle est mémorisée. Son état de transmission apparaît ci-dessous.",
    rest_hot: "Le ballon D est durablement à 60 °C, ou atteint 62 °C : retour du fioul à 50 °C.",
    temperature_confirmation: "Variation en cours de confirmation : la consigne est conservée.",
    stabilisation_wait: "Consigne maintenue pour laisser l’installation se stabiliser : 30 minutes en fonctionnement normal.",
    rest_in_band: "La consigne fioul reste au minimum de 50 °C.",
    support_start: "La baisse du ballon D appelle un appoint progressif.",
    support_increase: "La consigne fioul augmente progressivement pour soutenir le ballon D.",
    support_stable: "L’appoint reste stable pendant l’observation de la réponse du ballon D.",
    recent_recovery: "Le ballon D remonte : aucune hausse supplémentaire n’est demandée.",
    release_support: "L’approche de 60 °C permet de réduire progressivement le fioul.",
    increase_cooldown: "Le délai entre deux hausses de consigne est respecté.",
    decrease_cooldown: "Le délai entre deux baisses de consigne est respecté.",
    at_maximum: "La consigne fioul a atteint sa limite de 70 °C.",
    response_not_observed: "Aucune remontée détectée malgré l’appoint : hausse suspendue, installation à vérifier.",
    awaiting_transmission: "La consigne attend sa transmission au module B.",
    transmission_uncertain: "La dernière transmission n’a pas pu être confirmée.",
    sensor_d_unavailable: "Calcul suspendu : la sonde du ballon D ne répond pas.",
    sensor_b_unavailable: "Calcul suspendu : le module du bâtiment B ne répond pas.",
    sensor_d_stale: "Calcul suspendu : la mesure du ballon D est trop ancienne.",
    sensor_b_stale: "Calcul suspendu : la mesure du ballon B est trop ancienne.",
    observer_stale: "Calcul suspendu : la régulation n’a pas été actualisée récemment.",
    configuration_invalid: "Configuration de régulation indisponible ou invalide.",
    controller_unavailable: "Le suivi de la régulation n’est pas disponible.",
  } as Record<string, string>)[reason] ?? "Calcul en attente d’une nouvelle vérification.";
}

/** Version 2 reports configuration and API transmission separately; neither measures servo position. */
export function normalizeHeatingControl(value: unknown, now = Date.now()): HeatingControlStatus {
  const v = record(value);
  const updatedAt = iso(v.updatedAt);
  const age = updatedAt ? now - Date.parse(updatedAt) : Infinity;
  const available = v.version === HEATING_CONTROL_VERSION && v.available === true && validHeatingSettings(v)
    && finite(v.revision) && Number.isInteger(v.revision) && v.revision >= 0 && v.revision <= 999999999
    && typeof v.calibrationValid === "boolean" && typeof v.actuationEnabled === "boolean"
    && (!v.actuationEnabled || v.calibrationValid)
    && (v.phase === "active" || v.phase === "suspended")
    && v.fuelMinimum === HEATING_FUEL_MINIMUM && v.fuelMaximum === HEATING_FUEL_MAXIMUM && v.releaseTemperatureD === HEATING_RELEASE_D
    && typeof v.moduleOnline === "boolean" && nullableObservedIso(v.moduleLastSeenAt, now)
    && HEATING_DELIVERY_STATES.includes(v.deliveryState as HeatingDeliveryState)
    && v.positionFeedback === "unmeasured" && typeof v.reason === "string"
    && nullableFuelTemperature(v.desiredTemperature) && nullableFuelTemperature(v.lastTransmittedTemperature)
    && nullableObservedIso(v.lastTransmittedAt, now)
    && (v.deliveryState !== "transmitted" || (fuelTemperature(v.lastTransmittedTemperature) && iso(v.lastTransmittedAt) !== null));
  return {
    version: HEATING_CONTROL_VERSION,
    available, fresh: available && age >= -30_000 && age <= 90_000,
    updatedAt, revision: available ? v.revision as number : 0,
    mode: v.mode === "automatic" ? "automatic" : "manual",
    manualTemperature: validHeatingSettings(v) ? v.manualTemperature : 60,
    minimumD: validHeatingSettings(v) ? v.minimumD : HEATING_DEFAULT_MINIMUM_D,
    requestId: typeof v.requestId === "string" ? v.requestId : null,
    phase: v.phase === "active" && available ? "active" : "suspended",
    reason: available && typeof v.reason === "string" ? v.reason : "controller_unavailable",
    recommendedTemperature: available && fuelTemperature(v.recommendedTemperature) ? v.recommendedTemperature : null,
    temperatureD: observedTemperature(v.temperatureD),
    temperatureB: observedTemperature(v.temperatureB),
    nextAdjustmentAt: iso(v.nextAdjustmentAt), calibrationValid: available && v.calibrationValid === true, actuationEnabled: available && v.actuationEnabled === true,
    fuelMinimum: HEATING_FUEL_MINIMUM, fuelMaximum: HEATING_FUEL_MAXIMUM, releaseTemperatureD: HEATING_RELEASE_D,
    moduleOnline: available && v.moduleOnline === true,
    moduleLastSeenAt: available ? iso(v.moduleLastSeenAt) : null,
    deliveryState: available ? v.deliveryState as HeatingDeliveryState : "blocked",
    desiredTemperature: available && fuelTemperature(v.desiredTemperature) ? v.desiredTemperature : null,
    lastTransmittedTemperature: available && fuelTemperature(v.lastTransmittedTemperature) ? v.lastTransmittedTemperature : null,
    lastTransmittedAt: available ? iso(v.lastTransmittedAt) : null,
    positionFeedback: "unmeasured",
  };
}

export function controlStatusFromHa(states: unknown, now = Date.now()) {
  const rows = Array.isArray(states) ? states.map(record) : [];
  const entity = rows.find(row => row.entity_id === "sensor.ferme_chauffage_controle");
  const a = record(entity?.attributes);
  const unavailable = !entity || ["unknown", "unavailable"].includes(String(entity.state));
  const nextDate = finite(a.next_adjustment_at) ? new Date(a.next_adjustment_at * 1000) : null;
  const nextAt = nextDate && Number.isFinite(nextDate.getTime()) ? nextDate.toISOString() : null;
  const raw = {
    version: a.schema_version, available: !unavailable && a.schema_version === HEATING_CONTROL_VERSION,
    updatedAt: a.updated_at, revision: a.revision, requestId: a.request_id,
    mode: a.mode, manualTemperature: a.manual_temperature, minimumD: a.minimum_d,
    phase: a.phase, reason: a.reason,
    recommendedTemperature: a.recommended_temperature,
    temperatureD: a.observed_temperature_d, temperatureB: a.observed_temperature_b,
    nextAdjustmentAt: nextAt, calibrationValid: a.calibration_valid, actuationEnabled: a.actuation_enabled,
    fuelMinimum: a.fuel_minimum, fuelMaximum: a.fuel_maximum, releaseTemperatureD: a.release_temperature_d,
    moduleOnline: a.module_online, moduleLastSeenAt: a.module_last_seen_at,
    deliveryState: a.delivery_state, desiredTemperature: a.desired_temperature,
    lastTransmittedTemperature: a.last_transmitted_temperature, lastTransmittedAt: a.last_transmitted_at,
    positionFeedback: a.position_feedback,
  };
  return normalizeHeatingControl(raw, now);
}

export function parseHaHeatingConfiguration(states: unknown): { revision: number; requestId: string } | null {
  if (!Array.isArray(states)) return null;
  const entity = states.map(record).find(row => row.entity_id === "input_text.ferme_chauffage_configuration");
  try {
    const c = JSON.parse(String(entity?.state));
    // The durable HA helper deliberately keeps its internal v1 schema.
    if (c?.v !== 1 || !Number.isInteger(c.r) || c.r < 0 || c.r > 999999999 || typeof c.id !== "string") return null;
    if (!validHeatingSettings({ mode: c.m, manualTemperature: c.t, minimumD: c.d })) return null;
    return { revision: c.r, requestId: c.id };
  } catch { return null; }
}

export function validateHeatingControlRequest(value: unknown, key: string, now = Date.now()): HeatingControlRequest {
  const v = record(value);
  if (!validHeatingSettings(v) || v.version !== HEATING_CONTROL_VERSION || v.id !== key || !/^\d{13}-[a-f0-9]{32}$/.test(key)
    || typeof v.requestedBy !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(v.requestedBy)
    || !Number.isInteger(v.expectedRevision) || (v.expectedRevision as number) < 0 || (v.expectedRevision as number) > 999999998
    || v.status !== "pending" || !finite(v.createdAt) || !finite(v.expiresAt)
    || Number(key.slice(0, 13)) !== v.createdAt
    || v.createdAt > now + 30_000 || v.expiresAt <= now || v.expiresAt - v.createdAt > 90_000
    || v.expiresAt <= v.createdAt || now - v.createdAt > 90_000
    || Object.keys(v).some(k => !["version", "id", "requestedBy", "createdAt", "expiresAt", "expectedRevision", "status", "mode", "manualTemperature", "minimumD"].includes(k))) {
    throw new Error("invalid-or-expired-request");
  }
  return v as unknown as HeatingControlRequest;
}

/** A receipt confirms only configuration persistence, never transmission to the actuator. */
export function heatingConfigurationReceiptState(value: unknown, id: string, uid: string): HeatingControlRequest["status"] | null {
  const v = record(value);
  if (v.version !== HEATING_CONTROL_VERSION || v.id !== id || v.requestedBy !== uid || !validHeatingSettings(v)
    || !/^\d{13}-[a-f0-9]{32}$/.test(id) || Number(id.slice(0, 13)) !== v.createdAt
    || !Number.isInteger(v.expectedRevision) || (v.expectedRevision as number) < 0 || (v.expectedRevision as number) > 999999998
    || !finite(v.createdAt) || !finite(v.expiresAt) || v.expiresAt <= v.createdAt
    || v.expiresAt - v.createdAt > 90_000
    || typeof v.status !== "string" || !["pending", "processing", "accepted", "rejected", "uncertain"].includes(v.status)) return null;
  return v.status as HeatingControlRequest["status"];
}
