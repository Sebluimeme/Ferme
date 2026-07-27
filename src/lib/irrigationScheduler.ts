/**
 * irrigationScheduler.ts
 * Types + pure computation for auto-irrigation scheduling.
 * No Firebase, no HA imports — fully testable in isolation.
 */

export interface AutoIrrigationConfig {
  enabled: boolean;
  lastError?: string | null;
  lastErrorAt?: string | null;
  /** Rain threshold in mm: if measured rain >= this today, skip irrigation */
  rainThresholdMm: number;
  /** Target daily irrigation in mm (maximum, without any rain) */
  targetMm: number;
  /** Application rate reference in mm/h (informational; duration driven by zone config) */
  mmPerHour: number;
  /** Zone-specific settings */
  zones: ZoneConfig[];
  /** Window start hour (local time), e.g. 22 for 22:00 */
  windowStartHour: number;
  /** Window end hour (local time), e.g. 6 for 06:00 */
  windowEndHour: number;
}

export interface ZoneConfig {
  zone: 1 | 2;
  enabled: boolean;
  /** Max duration in minutes when there is zero rain; scales down proportionally with deficit */
  maxDurationMinutes: number;
}

export type PlanStatus = "scheduled" | "skipped" | "executing" | "done" | "error";

export interface ScheduledZone {
  zone: 1 | 2;
  durationMinutes: number;
  startAt: string;  // ISO
  endAt: string;    // ISO
  status?: "pending" | "executing" | "done" | "error";
  doneAt?: string;
}

export interface IrrigationPlan {
  planId: string;              // YYYY-MM-DD (morning date = end of window)
  date: string;
  status: PlanStatus;
  reason: string;
  rainMeasuredMm: number;
  rainThresholdMm: number;
  startAt: string;             // ISO — empty string when skipped/error
  endAt: string;               // ISO — empty string when skipped/error
  totalDurationMinutes: number;
  zones: ScheduledZone[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export const DEFAULT_AUTO_IRRIGATION_CONFIG: AutoIrrigationConfig = {
  enabled: false,
  rainThresholdMm: 15,
  targetMm: 20,
  mmPerHour: 5,
  zones: [
    { zone: 1, enabled: true, maxDurationMinutes: 120 },
    { zone: 2, enabled: true, maxDurationMinutes: 120 },
  ],
  windowStartHour: 22,
  windowEndHour: 6,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns YYYY-MM-DD in local timezone */
export function localDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Determine the "morning date" (YYYY-MM-DD) for the next irrigation window end.
 * - If current hour < windowEndHour (06): the window ends this morning → today's date.
 * - Otherwise: the window ends tomorrow morning → tomorrow's date.
 */
export function getNextMorningDate(now: Date, windowEndHour: number): string {
  if (now.getHours() < windowEndHour) {
    return localDateString(now);
  }
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return localDateString(tomorrow);
}

/**
 * Compute today's rain total (mm) from a list of weather readings.
 * Uses max(rainTotalMm) for the given date (station cumulative counter).
 */
export function computeTodayRain(
  readings: Array<{ date?: string; timestamp?: string; rainTotalMm?: number | null }>,
  todayStr: string,
): number {
  let maxRain = 0;
  for (const r of readings) {
    const date = r.date ?? r.timestamp?.slice(0, 10);
    if (date === todayStr && r.rainTotalMm != null && Number.isFinite(r.rainTotalMm)) {
      maxRain = Math.max(maxRain, r.rainTotalMm as number);
    }
  }
  return maxRain;
}

// ---------------------------------------------------------------------------
// Core scheduling computation
// ---------------------------------------------------------------------------

/**
 * Compute the irrigation plan for a given morning date, working backwards from
 * windowEndHour (06:00) to determine the latest possible start time.
 *
 * @param config          - Auto irrigation configuration
 * @param rainMeasuredMm  - Rain measured today in mm
 * @param morningDateLocal - YYYY-MM-DD of the morning (window end), in local timezone
 * @param nowIso          - Current time ISO string (used for createdAt)
 * @returns IrrigationPlan with status: "scheduled" | "skipped" | "error"
 */
export function computeIrrigationPlan(
  config: AutoIrrigationConfig,
  rainMeasuredMm: number,
  morningDateLocal: string,
  nowIso: string,
): IrrigationPlan {
  const planId = morningDateLocal;

  const base = {
    planId,
    date: morningDateLocal,
    rainMeasuredMm,
    rainThresholdMm: config.rainThresholdMm,
    createdAt: nowIso,
  };

  // ── Skip: sufficient rain ──────────────────────────────────────────────────
  if (rainMeasuredMm >= config.rainThresholdMm) {
    return {
      ...base,
      status: "skipped",
      reason: `Pluie suffisante (${rainMeasuredMm.toFixed(1)} mm ≥ seuil ${config.rainThresholdMm} mm) — arrosage non nécessaire`,
      startAt: "",
      endAt: "",
      totalDurationMinutes: 0,
      zones: [],
    };
  }

  // ── Skip: no zones active ─────────────────────────────────────────────────
  const enabledZones = config.zones.filter((z) => z.enabled);
  if (enabledZones.length === 0) {
    return {
      ...base,
      status: "skipped",
      reason: "Aucune zone activée dans la configuration",
      startAt: "",
      endAt: "",
      totalDurationMinutes: 0,
      zones: [],
    };
  }

  // ── Compute durations (proportional to deficit) ────────────────────────────
  const deficit = Math.max(0, config.targetMm - rainMeasuredMm);
  const scale = config.targetMm > 0 ? Math.min(1, deficit / config.targetMm) : 1;

  const zoneDurations = enabledZones.map((z) => ({
    zone: z.zone as 1 | 2,
    durationMinutes: Math.max(1, Math.round(z.maxDurationMinutes * scale)),
  }));
  const totalMinutes = zoneDurations.reduce((sum, z) => sum + z.durationMinutes, 0);

  // ── Validate window capacity ──────────────────────────────────────────────
  const windowMaxMinutes = (config.windowEndHour + 24 - config.windowStartHour) * 60; // 480 min for 22→06
  if (totalMinutes > windowMaxMinutes) {
    return {
      ...base,
      status: "error",
      reason: `Durée totale (${totalMinutes} min) dépasse la fenêtre ${config.windowStartHour}h–${config.windowEndHour}h (max ${windowMaxMinutes} min). Réduire les durées max des zones.`,
      startAt: "",
      endAt: "",
      totalDurationMinutes: totalMinutes,
      zones: [],
    };
  }

  // ── Compute start time (backwards from 06:00) ─────────────────────────────
  // "2026-07-28T06:00:00" is parsed as LOCAL time (no Z suffix) in modern JS
  const hEnd = String(config.windowEndHour).padStart(2, "0");
  const endLocal = new Date(`${morningDateLocal}T${hEnd}:00:00`);
  const startLocal = new Date(endLocal.getTime() - totalMinutes * 60 * 1000);

  // Evening boundary: day before morning at windowStartHour (22:00)
  const dayBefore = new Date(endLocal.getTime() - 24 * 60 * 60 * 1000);
  dayBefore.setHours(config.windowStartHour, 0, 0, 0);

  if (startLocal < dayBefore) {
    return {
      ...base,
      status: "error",
      reason: `Heure de démarrage calculée (${startLocal.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}) est antérieure à ${config.windowStartHour}h00 — fenêtre insuffisante.`,
      startAt: "",
      endAt: "",
      totalDurationMinutes: totalMinutes,
      zones: [],
    };
  }

  // ── Build sequential zone schedule ────────────────────────────────────────
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
    reason: `Déficit: ${deficit.toFixed(1)} mm (mesuré ${rainMeasuredMm.toFixed(1)} mm, cible ${config.targetMm} mm)`,
    startAt: startLocal.toISOString(),
    endAt: endLocal.toISOString(),
    totalDurationMinutes: totalMinutes,
    zones: scheduledZones,
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers (used by UI)
// ---------------------------------------------------------------------------

export function formatPlanStatus(status: PlanStatus): string {
  switch (status) {
    case "scheduled": return "Programmé";
    case "skipped": return "Ignoré";
    case "executing": return "En cours";
    case "done": return "Terminé";
    case "error": return "Erreur";
    default: return status;
  }
}

export function formatLocalTime(isoString: string | undefined): string {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
