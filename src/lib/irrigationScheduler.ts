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

/**
 * "advisory": produced while auto-schedule is OFF (or before re-validation) — a
 * recommendation only, must never be executed.
 * "executable": produced while auto-schedule is ON — eligible for execution.
 */
export type PlanMode = "advisory" | "executable";

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
  // V3 addition: advisory (auto OFF) vs executable (auto ON) — see PlanMode.
  mode?: PlanMode;
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
 * Compute useful recent rain over 7 days with decay.
 * This is still an estimate: older rain has less remaining value in the root zone.
 */
export function computeRecentRainMm(
  readings: WeatherReading[],
  nowMs: number,
): number {
  const weights = [1, 0.85, 0.7, 0.5, 0.35, 0.2, 0.1];
  return Number(weights.reduce((sum, weight, daysAgo) => {
    const day = new Date(nowMs - daysAgo * 24 * 60 * 60 * 1000);
    return sum + computeTodayRain(readings, localDateString(day)) * weight;
  }, 0).toFixed(2));
}

// ── V2: moisture estimation ───────────────────────────────────────────────────

/**
 * @deprecated Superseded by the water-balance model (consolidateWaterBalance +
 * humidityPctFromBalance below). This always resets to targetPct after any
 * irrigation and re-adds the full 7-day weighted rain on every call, which
 * double-counts rain/irrigation across cycles. Kept only for the legacy V1
 * test suite / retro-compat — no longer wired into the bridge or the UI.
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
  mode: PlanMode,
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
    mode,
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

// ── V3: water balance (permanent analysis, idempotent ledger) ─────────────────
//
// Replaces the age-weighted estimate above. A per-zone reserve (mm, 0..capacity)
// is advanced from its last `updatedAt`: soil-loss is applied continuously,
// measured rain and confirmed irrigation are applied as bounded, idempotent
// deltas in chronological order. Forecast rain never enters this reserve —
// only measured daily totals coming from weather-readings.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface IrrigationEvent {
  /** Deterministic idempotency key — e.g. "2026-07-29-zone1" (auto) or the manual command id. */
  id: string;
  zone: 1 | 2;
  appliedMm: number;
  /** ISO timestamp of actual completion — not the command's send time. */
  at: string;
  source: "manual" | "auto";
  /** Only confirmed events are integrated into the balance; unconfirmed ones are ignored. */
  confirmed: boolean;
}

export interface WaterBalanceState {
  zone: 1 | 2;
  reserveMm: number;
  capacityMm: number;
  /** ISO timestamp up to which losses/rain/irrigation have already been consolidated. */
  updatedAt: string;
  /** Cumulative daily rain total (mm) already counted, per YYYY-MM-DD — prevents replay. */
  countedRainByDate: Record<string, number>;
  /** Irrigation event IDs already applied — idempotency guard against double counting. */
  appliedEventIds: Record<string, true>;
  /** True while the reserve traces back to the migration seed rather than fully-tracked inputs. */
  seeded: boolean;
}

function clampMm(value: number, capacityMm: number): number {
  return Math.max(0, Math.min(capacityMm, value));
}

/**
 * Build a YYYY-MM-DD → cumulative daily rain total (mm) map from raw weather readings.
 * Same max-of-day logic as computeTodayRain, but across every date present in the readings.
 */
export function buildDailyRainTotals(readings: WeatherReading[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const r of readings) {
    const date = r.date ?? r.timestamp?.slice(0, 10);
    if (!date || r.rainTotalMm == null || !Number.isFinite(r.rainTotalMm as number)) continue;
    const value = r.rainTotalMm as number;
    totals[date] = totals[date] != null ? Math.max(totals[date], value) : value;
  }
  return totals;
}

/**
 * Prudent migration seed for a zone with no prior ledger.
 * Starting point = current/last-known estimate (%) if available, else 40%.
 * Marks every currently-known daily rain total as already counted so the new
 * ledger doesn't replay the old model's 7-day weighted rain on first run.
 */
export function initWaterBalanceState(params: {
  zone: 1 | 2;
  capacityMm: number;
  seedPct: number | null;
  nowIso: string;
  knownRainByDate: Record<string, number>;
}): WaterBalanceState {
  const seedPct = params.seedPct != null && Number.isFinite(params.seedPct) ? params.seedPct : 40;
  return {
    zone: params.zone,
    reserveMm: clampMm((seedPct / 100) * params.capacityMm, params.capacityMm),
    capacityMm: params.capacityMm,
    updatedAt: params.nowIso,
    countedRainByDate: { ...params.knownRainByDate },
    appliedEventIds: {},
    seeded: true,
  };
}

interface BalanceDelta {
  atMs: number;
  deltaMm: number;
  commit: (draft: { countedRainByDate: Record<string, number>; appliedEventIds: Record<string, true> }) => void;
}

/**
 * Consolidate a zone's water balance:
 * - advance soil-loss continuously since `state.updatedAt`;
 * - integrate only unrecorded POSITIVE rain deltas (per date, vs. countedRainByDate);
 * - integrate confirmed irrigation events not yet in appliedEventIds;
 * - apply all of the above chronologically (by their own timestamp, day-granularity
 *   for rain via local noon), bounding the reserve to [0, capacity] after every step.
 * Idempotent: replaying with identical inputs and the same `nowIso` changes nothing.
 */
export function consolidateWaterBalance(params: {
  state: WaterBalanceState;
  capacityMm: number;
  dailyLossMm: number;
  rainByDate: Record<string, number>;
  events: IrrigationEvent[];
  nowIso: string;
}): WaterBalanceState {
  const { state, capacityMm, dailyLossMm } = params;
  const nowMs = new Date(params.nowIso).getTime();
  const updatedAtMs = new Date(state.updatedAt).getTime();

  const deltas: BalanceDelta[] = [];

  for (const [date, total] of Object.entries(params.rainByDate)) {
    const already = state.countedRainByDate[date] ?? 0;
    const delta = total - already;
    if (delta <= 0) continue;
    deltas.push({
      atMs: new Date(`${date}T12:00:00`).getTime(),
      deltaMm: delta,
      commit: (draft) => { draft.countedRainByDate[date] = total; },
    });
  }

  for (const event of params.events) {
    if (!event.confirmed) continue;
    if (event.zone !== state.zone) continue;
    if (state.appliedEventIds[event.id]) continue;
    deltas.push({
      atMs: new Date(event.at).getTime(),
      deltaMm: event.appliedMm,
      commit: (draft) => { draft.appliedEventIds[event.id] = true; },
    });
  }

  deltas.sort((a, b) => a.atMs - b.atMs);

  let reserve = state.reserveMm;
  let cursorMs = updatedAtMs;
  const countedRainByDate = { ...state.countedRainByDate };
  const appliedEventIds = { ...state.appliedEventIds };

  for (const delta of deltas) {
    // Clamp into [cursor, now]: day-granularity rain timestamps can fall before the
    // last consolidation or, for "today", before the precise current instant.
    const atMs = Math.min(Math.max(delta.atMs, cursorMs), nowMs);
    const elapsedDays = Math.max(0, (atMs - cursorMs) / MS_PER_DAY);
    reserve = clampMm(reserve - elapsedDays * dailyLossMm, capacityMm);
    reserve = clampMm(reserve + delta.deltaMm, capacityMm);
    delta.commit({ countedRainByDate, appliedEventIds });
    cursorMs = atMs;
  }

  const tailDays = Math.max(0, (nowMs - cursorMs) / MS_PER_DAY);
  reserve = clampMm(reserve - tailDays * dailyLossMm, capacityMm);

  return {
    zone: state.zone,
    reserveMm: Number(reserve.toFixed(2)),
    capacityMm,
    updatedAt: params.nowIso,
    countedRainByDate,
    appliedEventIds,
    seeded: state.seeded,
  };
}

/** Humidity % (0–100) derived from the water balance reserve. */
export function humidityPctFromBalance(state: WaterBalanceState): number {
  if (state.capacityMm <= 0) return 0;
  return Math.round((state.reserveMm / state.capacityMm) * 100);
}

// ── V3: analysis vs execution separation ───────────────────────────────────────

/** A plan is considered fresh for this long after createdAt before the UI flags it as stale. */
export const PLAN_FRESH_WINDOW_MS = 6 * 60 * 1000; // analysis cadence (5 min) + margin

export function isPlanStale(createdAtIso: string | undefined, nowMs: number, maxAgeMs: number = PLAN_FRESH_WINDOW_MS): boolean {
  if (!createdAtIso) return true;
  const createdMs = new Date(createdAtIso).getTime();
  if (!Number.isFinite(createdMs)) return true;
  return nowMs - createdMs > maxAgeMs;
}

/**
 * Defense-in-depth gate before any real execution: even if the caller forgot to
 * check config.enabled, a plan computed while auto-schedule was OFF (mode !==
 * "executable") — or an absent/non-scheduled plan — must never be run.
 */
export function canExecutePlan(
  config: Pick<AutoIrrigationConfig, "enabled"> | null | undefined,
  plan: IrrigationPlan | null | undefined,
): { allowed: boolean; reason: string } {
  if (!config?.enabled) {
    return { allowed: false, reason: "Automatique désactivé" };
  }
  if (!plan) {
    return { allowed: false, reason: "Aucun plan" };
  }
  if (plan.mode !== "executable") {
    return { allowed: false, reason: "Plan calculé en mode conseil — exécution refusée" };
  }
  if (plan.status !== "scheduled") {
    return { allowed: false, reason: `Statut du plan (${plan.status}) non exécutable` };
  }
  return { allowed: true, reason: "" };
}

/**
 * Délai (ms, jamais négatif) avant qu'une confirmation d'arrosage manuel en
 * attente doive être écrite dans le bilan hydrique. Utilisé au démarrage du
 * bridge pour reprendre les confirmations persistées
 * (irrigation-ha/water-balance/pending-manual) après un redémarrage : un délai
 * nul signifie que l'arrosage physique s'est déjà terminé pendant que le
 * bridge était hors ligne, donc la confirmation doit être écrite immédiatement
 * plutôt que d'être reprogrammée.
 */
export function computeManualConfirmationDelayMs(expectedConfirmAtIso: string, nowMs: number): number {
  return Math.max(0, new Date(expectedConfirmAtIso).getTime() - nowMs);
}

// ── V3.1: humidité honnête pendant un cycle en cours (jamais écrite au ledger) ─

/**
 * Projette l'humidité pendant un arrosage (manuel ou auto) en cours, à partir
 * de la part déjà écoulée de l'apport prévu. Cette projection n'est JAMAIS
 * écrite dans le bilan hydrique confirmé (WaterBalanceState) — elle sert
 * uniquement à l'affichage ("estimation pendant l'arrosage"). Le ledger reste
 * conservateur : seul le vrai événement confirmé à la fin du cycle fait foi.
 */
export function estimateLiveHumidityPct(params: {
  confirmedState: Pick<WaterBalanceState, "reserveMm" | "capacityMm">;
  mmPerHour: number;
  startedAtIso: string;
  plannedDurationMinutes: number;
  nowMs: number;
}): { pct: number; projectedMm: number } {
  const { confirmedState, mmPerHour, startedAtIso, plannedDurationMinutes, nowMs } = params;
  const startedMs = new Date(startedAtIso).getTime();
  const elapsedMinutes = Math.max(0, Math.min(plannedDurationMinutes, (nowMs - startedMs) / 60000));
  const projectedMm = (elapsedMinutes / 60) * mmPerHour;
  const projectedReserve = clampMm(confirmedState.reserveMm + projectedMm, confirmedState.capacityMm);
  const pct = confirmedState.capacityMm <= 0 ? 0 : Math.round((projectedReserve / confirmedState.capacityMm) * 100);
  return { pct, projectedMm: Number(projectedMm.toFixed(2)) };
}

// ── V3.1: arrêt total — crédit partiel au lieu du plein tarif ─────────────────

/**
 * mm réellement délivrés par un arrosage manuel interrompu avant son terme
 * (stop_all) : proportionnel au temps écoulé, jamais la durée complète
 * planifiée. Utilisé pour ne jamais créditer de l'eau qui n'a pas coulé.
 */
export function computePartialAppliedMm(params: {
  mmPerHour: number;
  startedAtIso: string;
  stoppedAtIso: string;
  plannedDurationMinutes: number;
}): number {
  const { mmPerHour, startedAtIso, stoppedAtIso, plannedDurationMinutes } = params;
  const startedMs = new Date(startedAtIso).getTime();
  const stoppedMs = new Date(stoppedAtIso).getTime();
  const elapsedMinutes = Math.max(0, Math.min(plannedDurationMinutes, (stoppedMs - startedMs) / 60000));
  return Number(((elapsedMinutes / 60) * mmPerHour).toFixed(2));
}

// ── V3.1: reprise sûre après redémarrage du bridge ────────────────────────────

export interface StuckPlanRecovery {
  status: "error";
  reason: string;
  error: string;
  errorAt: string;
}

/**
 * Un plan trouvé encore au statut "executing" au démarrage du bridge signifie
 * que le bridge a redémarré (crash/déploiement) pendant une exécution auto :
 * l'état réel des vannes côté Home Assistant n'est plus fiable. Sortie sûre
 * minimale : basculer le plan en erreur motivée pour qu'il ne reste jamais
 * bloqué, et laisser le prochain cycle d'analyse (checkAndPlanSchedule)
 * reprendre normalement — il n'écrase jamais un plan "executing"/"done" mais
 * réécrit librement un plan "error".
 */
export function resumeStuckExecutingPlan(nowIso: string): StuckPlanRecovery {
  const reason = "Plan interrompu par un redémarrage du bridge — état des vannes non fiable, arrêt de sécurité.";
  return { status: "error", reason, error: reason, errorAt: nowIso };
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
