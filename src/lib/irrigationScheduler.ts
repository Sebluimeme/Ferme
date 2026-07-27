/**
 * irrigationScheduler.ts — V2
 * Types + pure computation for auto-irrigation scheduling based on estimated zone moisture.
 * No Firebase, no HA imports — fully testable in isolation.
 *
 * V2 model: moisture-driven, per-zone quality modes, large spaced cycles (min 45 min).
 * V1 computeIrrigationPlan kept for reference; V2 uses computeIrrigationPlanV2.
 */

// ── Quality modes ─────────────────────────────────────────────────────────────

export type QualityMode = "eco" | "passable" | "correct" | "green" | "manual";

export interface QualityThresholds {
  /** Trigger irrigation when estimated humidity falls at or below this % */
  triggerPct: number;
  /** Target humidity % to reach after irrigation */
  targetPct: number;
}

export const QUALITY_THRESHOLDS: Record<QualityMode, QualityThresholds> = {
  eco:      { triggerPct: 25, targetPct: 55 },
  passable: { triggerPct: 30, targetPct: 65 },
  correct:  { triggerPct: 40, targetPct: 75 },
  green:    { triggerPct: 50, targetPct: 85 },
  manual:   { triggerPct: 30, targetPct: 65 }, // uses triggerPct/targetPct fields as overrides
};

// ── Zone configuration ────────────────────────────────────────────────────────

export interface ZoneConfig {
  zone: 1 | 2;
  enabled: boolean;

  // V2 fields (optional → retro-compat with V1 Firebase data)
  /** Lawn quality / irrigation profile. Default: "passable" */
  qualityMode?: QualityMode;
  /** Custom trigger % override (when qualityMode = "manual") */
  triggerPct?: number;
  /** Custom target % override (when qualityMode = "manual") */
  targetPct?: number;
  /** Soil water reserve capacity in mm (empty→full). Default: 35 */
  soilCapacityMm?: number;
  /** Irrigation application rate in mm/h. Default: 5 */
  irrigationDepthMmPerHour?: number;
  /** Minimum run time per zone in minutes (avoids micro-cycles). Default: 45 */
  minRunMinutes?: number;
  /** Maximum run time per zone in minutes. Default: 240 */
  maxRunMinutes?: number;
  /** Estimated daily evapotranspiration/soil loss in mm/day. Default: 3 */
  dailyLossMm?: number;
  /** ISO timestamp of last confirmed irrigation for this zone */
  lastIrrigationAt?: string | null;
  /** mm applied during last irrigation (derived from duration × rate) */
  lastIrrigationMm?: number | null;

  // Legacy V1 (kept for retro-compat)
  maxDurationMinutes?: number;
}

// ── Auto-schedule config ──────────────────────────────────────────────────────

export interface AutoIrrigationConfig {
  enabled: boolean;
  lastError?: string | null;
  lastErrorAt?: string | null;
  zones: ZoneConfig[];
  windowStartHour: number;
  windowEndHour: number;
  // Legacy V1 (optional for retro-compat)
  rainThresholdMm?: number;
  targetMm?: number;
  mmPerHour?: number;
}

// ── Plan types ────────────────────────────────────────────────────────────────

export type PlanStatus = "scheduled" | "skipped" | "executing" | "done" | "error";

export interface ScheduledZone {
  zone: 1 | 2;
  durationMinutes: number;
  startAt: string;  // ISO
  endAt: string;    // ISO
  status?: "pending" | "executing" | "done" | "error";
  doneAt?: string;
}

export interface ZoneMoistureState {
  zone: 1 | 2;
  estimatedHumidityPct: number;
  triggerPct: number;
  targetPct: number;
  decision: "wait" | "irrigate" | "disabled";
  plannedDurationMinutes: number;
  debugInfo: string;
}

export interface IrrigationPlan {
  planId: string;              // YYYY-MM-DD (morning date = end of window)
  date: string;
  status: PlanStatus;
  reason: string;
  rainMeasuredMm: number;
  rainThresholdMm: number;
  startAt: string;             // ISO — empty when skipped/error
  endAt: string;               // ISO — empty when skipped/error
  totalDurationMinutes: number;
  zones: ScheduledZone[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  // V2 addition: per-zone moisture states at plan creation time
  zoneStates?: ZoneMoistureState[];
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_AUTO_IRRIGATION_CONFIG: AutoIrrigationConfig = {
  enabled: false,
  rainThresholdMm: 15,
  zones: [
    {
      zone: 1,
      enabled: true,
      qualityMode: "passable",
      soilCapacityMm: 35,
      irrigationDepthMmPerHour: 5,
      minRunMinutes: 45,
      maxRunMinutes: 240,
      dailyLossMm: 3,
    },
    {
      zone: 2,
      enabled: true,
      qualityMode: "passable",
      soilCapacityMm: 35,
      irrigationDepthMmPerHour: 5,
      minRunMinutes: 45,
      maxRunMinutes: 240,
      dailyLossMm: 3,
    },
  ],
  windowStartHour: 22,
  windowEndHour: 6,
};

// ── Date/time helpers ─────────────────────────────────────────────────────────

/** Returns YYYY-MM-DD in local timezone */
export function localDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Determine the "morning date" (YYYY-MM-DD) for the next irrigation window end.
 * - hour < windowEndHour (06): window ends this morning → today.
 * - otherwise: window ends tomorrow morning → tomorrow.
 */
export function getNextMorningDate(now: Date, windowEndHour: number): string {
  if (now.getHours() < windowEndHour) return localDateString(now);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return localDateString(tomorrow);
}

// ── Rain helpers ──────────────────────────────────────────────────────────────

type WeatherReading = { date?: string; timestamp?: string; rainTotalMm?: number | null };

/**
 * Compute today's rain total (mm) from weather readings.
 * Uses max(rainTotalMm) for the given date (cumulative daily counter).
 */
export function computeTodayRain(
  readings: WeatherReading[],
  todayStr: string,
): number {
  let maxRain = 0;
  for (const r of readings) {
    const date = r.date ?? r.timestamp?.slice(0, 10);
    if (date === todayStr && r.rainTotalMm != null && Number.isFinite(r.rainTotalMm as number)) {
      maxRain = Math.max(maxRain, r.rainTotalMm as number);
    }
  }
  return maxRain;
}

/**
 * Compute recent rain over 48h (today + yesterday) from weather readings.
 * Used for moisture estimation to account for recent precipitation.
 */
export function computeRecentRainMm(
  readings: WeatherReading[],
  nowMs: number,
): number {
  const now = new Date(nowMs);
  const todayStr = localDateString(now);
  const yesterday = new Date(nowMs - 24 * 60 * 60 * 1000);
  const yestStr = localDateString(yesterday);
  return computeTodayRain(readings, todayStr) + computeTodayRain(readings, yestStr);
}

// ── V2: moisture estimation ───────────────────────────────────────────────────

/**
 * Estimate soil moisture (0–100%) for a zone.
 * Based on time since last irrigation, daily loss, and recent rain.
 * Clearly an ESTIMATE — not a real sensor reading.
 */
export function estimateZoneMoisture(
  zone: ZoneConfig,
  recentRainMm: number,
  nowMs: number,
): number {
  const capacity = zone.soilCapacityMm ?? 35;
  const mode = zone.qualityMode ?? "passable";
  const thresholds = QUALITY_THRESHOLDS[mode] ?? QUALITY_THRESHOLDS.passable;
  const dailyLoss = zone.dailyLossMm ?? 3;

  let reserveMm: number;
  if (zone.lastIrrigationAt) {
    const lastMs = new Date(zone.lastIrrigationAt).getTime();
    const daysSince = Math.max(0, (nowMs - lastMs) / (24 * 60 * 60 * 1000));
    // After last irrigation we filled to targetPct
    const startMm = (thresholds.targetPct / 100) * capacity;
    reserveMm = startMm - daysSince * dailyLoss + recentRainMm;
  } else {
    // No irrigation history → assume moderate 40%
    reserveMm = 0.4 * capacity + recentRainMm;
  }

  reserveMm = Math.max(0, Math.min(capacity, reserveMm));
  return Math.round((reserveMm / capacity) * 100);
}

/**
 * Compute irrigation decision for a single zone given its estimated moisture %.
 * - decision "wait": humidity > triggerPct → no irrigation needed
 * - decision "irrigate": humidity ≤ triggerPct → compute large cycle duration
 * - decision "disabled": zone.enabled = false
 */
export function computeZoneDecision(
  zone: ZoneConfig,
  humidityPct: number,
): ZoneMoistureState {
  const mode = zone.qualityMode ?? "passable";
  const thresholds = QUALITY_THRESHOLDS[mode] ?? QUALITY_THRESHOLDS.passable;
  const triggerPct = (mode === "manual" && zone.triggerPct != null) ? zone.triggerPct : thresholds.triggerPct;
  const targetPct  = (mode === "manual" && zone.targetPct  != null) ? zone.targetPct  : thresholds.targetPct;

  if (!zone.enabled) {
    return {
      zone: zone.zone, estimatedHumidityPct: humidityPct,
      triggerPct, targetPct, decision: "disabled",
      plannedDurationMinutes: 0,
      debugInfo: "Zone désactivée",
    };
  }

  if (humidityPct > triggerPct) {
    return {
      zone: zone.zone, estimatedHumidityPct: humidityPct,
      triggerPct, targetPct, decision: "wait",
      plannedDurationMinutes: 0,
      debugInfo: `Estimée ${humidityPct}% > seuil ${triggerPct}% — en attente`,
    };
  }

  // Irrigation needed — compute duration
  const capacity = zone.soilCapacityMm ?? 35;
  const mmPerHour = zone.irrigationDepthMmPerHour ?? 5;
  const minRun = zone.minRunMinutes ?? 45;
  const maxRun = zone.maxRunMinutes ?? (zone.maxDurationMinutes ?? 240);

  const currentMm = (humidityPct / 100) * capacity;
  const targetMm  = (targetPct  / 100) * capacity;
  const mmNeeded  = Math.max(0, targetMm - currentMm);
  const rawMinutes = Math.ceil((mmNeeded / mmPerHour) * 60);
  const planned = Math.min(maxRun, Math.max(minRun, rawMinutes));

  return {
    zone: zone.zone, estimatedHumidityPct: humidityPct,
    triggerPct, targetPct, decision: "irrigate",
    plannedDurationMinutes: planned,
    debugInfo: `Estimée ${humidityPct}% ≤ seuil ${triggerPct}% → ${mmNeeded.toFixed(1)} mm → ${planned} min`,
  };
}

// ── V2: plan computation ──────────────────────────────────────────────────────

/**
 * Compute a V2 irrigation plan from pre-computed zone moisture states.
 * - Sequential zones, ending at windowEndHour (06:00)
 * - Maximum 8h total (480 min) — error if exceeded
 * - Heavy rain override: if rainMeasuredMm >= rainThresholdMm, skip all
 */
export function computeIrrigationPlanV2(
  config: AutoIrrigationConfig,
  zoneStates: ZoneMoistureState[],
  rainMeasuredMm: number,
  morningDateLocal: string,
  nowIso: string,
): IrrigationPlan {
  const planId = morningDateLocal;
  const rainThresholdMm = config.rainThresholdMm ?? 15;

  const base = {
    planId,
    date: morningDateLocal,
    rainMeasuredMm,
    rainThresholdMm,
    createdAt: nowIso,
    zoneStates,
  };

  // Hard skip: heavy rain
  if (rainMeasuredMm >= rainThresholdMm) {
    return {
      ...base,
      status: "skipped",
      reason: `Pluie récente (${rainMeasuredMm.toFixed(1)} mm ≥ seuil ${rainThresholdMm} mm) — arrosage non nécessaire`,
      startAt: "", endAt: "", totalDurationMinutes: 0, zones: [],
    };
  }

  const toIrrigate = zoneStates.filter((z) => z.decision === "irrigate");

  if (toIrrigate.length === 0) {
    const reasons = zoneStates.map((z) =>
      z.decision === "disabled"
        ? `Z${z.zone}: désactivée`
        : `Z${z.zone}: estimée ${z.estimatedHumidityPct}% > seuil ${z.triggerPct}%`
    ).join("; ");
    return {
      ...base,
      status: "skipped",
      reason: `Humidité estimée suffisante — ${reasons}`,
      startAt: "", endAt: "", totalDurationMinutes: 0, zones: [],
    };
  }

  const totalMinutes = toIrrigate.reduce((s, z) => s + z.plannedDurationMinutes, 0);
  const maxWindowMinutes = 8 * 60; // 8h hard cap

  if (totalMinutes > maxWindowMinutes) {
    return {
      ...base,
      status: "error",
      reason: `Durée totale (${totalMinutes} min = ${(totalMinutes / 60).toFixed(1)}h) dépasse le maximum de 8h — réduire maxRunMinutes ou changer le mode qualité.`,
      startAt: "", endAt: "", totalDurationMinutes: totalMinutes, zones: [],
    };
  }

  // Compute start time (backwards from windowEndHour)
  const hEnd = String(config.windowEndHour).padStart(2, "0");
  const endLocal = new Date(`${morningDateLocal}T${hEnd}:00:00`);
  const startLocal = new Date(endLocal.getTime() - totalMinutes * 60 * 1000);

  // Check lower boundary: previous day at windowStartHour
  const dayBefore = new Date(endLocal.getTime() - 24 * 60 * 60 * 1000);
  dayBefore.setHours(config.windowStartHour, 0, 0, 0);

  if (startLocal < dayBefore) {
    return {
      ...base,
      status: "error",
      reason: `Heure de démarrage (${startLocal.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}) antérieure à ${config.windowStartHour}h00 — fenêtre insuffisante.`,
      startAt: "", endAt: "", totalDurationMinutes: totalMinutes, zones: [],
    };
  }

  // Build sequential zone schedule
  let cursor = startLocal.getTime();
  const scheduledZones: ScheduledZone[] = toIrrigate.map((z) => {
    const zStart = new Date(cursor);
    cursor += z.plannedDurationMinutes * 60 * 1000;
    return {
      zone: z.zone,
      durationMinutes: z.plannedDurationMinutes,
      startAt: zStart.toISOString(),
      endAt: new Date(cursor).toISOString(),
      status: "pending" as const,
    };
  });

  const zonesLabel = toIrrigate.map((z) => `Z${z.zone} ${z.plannedDurationMinutes}min`).join(" + ");
  const rainNote = rainMeasuredMm > 0 ? ` · pluie récente ${rainMeasuredMm.toFixed(1)} mm prise en compte` : "";

  return {
    ...base,
    status: "scheduled",
    reason: `${zonesLabel}${rainNote}`,
    startAt: startLocal.toISOString(),
    endAt: endLocal.toISOString(),
    totalDurationMinutes: totalMinutes,
    zones: scheduledZones,
  };
}

// ── Legacy V1 computation (kept for retro-compat) ─────────────────────────────

/**
 * @deprecated Use computeIrrigationPlanV2 instead.
 * Kept for backward compat. V1 logic: duration proportional to rain deficit.
 */
export function computeIrrigationPlan(
  config: AutoIrrigationConfig,
  rainMeasuredMm: number,
  morningDateLocal: string,
  nowIso: string,
): IrrigationPlan {
  const planId = morningDateLocal;
  const rainThresholdMm = config.rainThresholdMm ?? 15;
  const targetMm = config.targetMm ?? 20;

  const base = {
    planId,
    date: morningDateLocal,
    rainMeasuredMm,
    rainThresholdMm,
    createdAt: nowIso,
  };

  if (rainMeasuredMm >= rainThresholdMm) {
    return {
      ...base,
      status: "skipped",
      reason: `Pluie suffisante (${rainMeasuredMm.toFixed(1)} mm ≥ seuil ${rainThresholdMm} mm) — arrosage non nécessaire`,
      startAt: "", endAt: "", totalDurationMinutes: 0, zones: [],
    };
  }

  const enabledZones = config.zones.filter((z) => z.enabled);
  if (enabledZones.length === 0) {
    return {
      ...base,
      status: "skipped",
      reason: "Aucune zone activée dans la configuration",
      startAt: "", endAt: "", totalDurationMinutes: 0, zones: [],
    };
  }

  const deficit = Math.max(0, targetMm - rainMeasuredMm);
  const scale = targetMm > 0 ? Math.min(1, deficit / targetMm) : 1;

  const zoneDurations = enabledZones.map((z) => ({
    zone: z.zone as 1 | 2,
    durationMinutes: Math.max(1, Math.round((z.maxDurationMinutes ?? z.maxRunMinutes ?? 120) * scale)),
  }));
  const totalMinutes = zoneDurations.reduce((sum, z) => sum + z.durationMinutes, 0);

  const windowMaxMinutes = (config.windowEndHour + 24 - config.windowStartHour) * 60;
  if (totalMinutes > windowMaxMinutes) {
    return {
      ...base,
      status: "error",
      reason: `Durée totale (${totalMinutes} min) dépasse la fenêtre ${config.windowStartHour}h–${config.windowEndHour}h (max ${windowMaxMinutes} min). Réduire les durées max des zones.`,
      startAt: "", endAt: "", totalDurationMinutes: totalMinutes, zones: [],
    };
  }

  const hEnd = String(config.windowEndHour).padStart(2, "0");
  const endLocal = new Date(`${morningDateLocal}T${hEnd}:00:00`);
  const startLocal = new Date(endLocal.getTime() - totalMinutes * 60 * 1000);

  const dayBefore = new Date(endLocal.getTime() - 24 * 60 * 60 * 1000);
  dayBefore.setHours(config.windowStartHour, 0, 0, 0);

  if (startLocal < dayBefore) {
    return {
      ...base,
      status: "error",
      reason: `Heure de démarrage calculée (${startLocal.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}) est antérieure à ${config.windowStartHour}h00 — fenêtre insuffisante.`,
      startAt: "", endAt: "", totalDurationMinutes: totalMinutes, zones: [],
    };
  }

  let cursor = startLocal.getTime();
  const scheduledZones: ScheduledZone[] = zoneDurations.map((z) => {
    const zStart = new Date(cursor);
    cursor += z.durationMinutes * 60 * 1000;
    return {
      zone: z.zone,
      durationMinutes: z.durationMinutes,
      startAt: zStart.toISOString(),
      endAt: new Date(cursor).toISOString(),
      status: "pending" as const,
    };
  });

  return {
    ...base,
    status: "scheduled",
    reason: `Déficit: ${deficit.toFixed(1)} mm (mesuré ${rainMeasuredMm.toFixed(1)} mm, cible ${targetMm} mm)`,
    startAt: startLocal.toISOString(),
    endAt: endLocal.toISOString(),
    totalDurationMinutes: totalMinutes,
    zones: scheduledZones,
  };
}

// ── Formatting helpers (used by UI) ──────────────────────────────────────────

export function formatPlanStatus(status: PlanStatus): string {
  switch (status) {
    case "scheduled": return "Programmé";
    case "skipped":   return "Ignoré";
    case "executing": return "En cours";
    case "done":      return "Terminé";
    case "error":     return "Erreur";
    default:          return status;
  }
}

export function formatLocalTime(isoString: string | undefined): string {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
