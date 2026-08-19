export interface CiterneHistoryPoint {
  receivedAt: string;
  volumeLitres: number;
  niveauPct: number | null;
  /** Water height for Citerne 2, persisted in centimetres when available. */
  hauteurCm?: number | null;
}

export interface EstimatedFlowPoint {
  receivedAt: string;
  debitLitresPerHour: number;
}

/** Maximum daily readings returned to the browser from either citerne history. */
export const CITERNE_HISTORY_MAX_POINTS = 180;

/** Firebase query used by the API to keep browser history bounded. */
export const CITERNE_HISTORY_READ_QUERY = {
  orderBy: '"$key"',
  limitToLast: String(CITERNE_HISTORY_MAX_POINTS),
} as const;

export interface WaterLevelChartPoint {
  dateFull: string;
  citerne1?: number;
  citerne2?: number;
}

/** Groups daily readings for the dual-axis water-level chart. */
export function buildWaterLevelChartData(
  tank1History: CiterneHistoryPoint[],
  tank2History: CiterneHistoryPoint[],
): WaterLevelChartPoint[] {
  const byDay = new Map<string, WaterLevelChartPoint>();
  const ensureDay = (receivedAt: string) => {
    const dateFull = receivedAt.slice(0, 10);
    const existing = byDay.get(dateFull);
    if (existing) return existing;
    const next: WaterLevelChartPoint = { dateFull };
    byDay.set(dateFull, next);
    return next;
  };

  for (const point of tank1History) {
    if (point.niveauPct !== null) ensureDay(point.receivedAt).citerne1 = point.niveauPct;
  }
  for (const point of tank2History) {
    if (point.hauteurCm !== null && point.hauteurCm !== undefined) ensureDay(point.receivedAt).citerne2 = point.hauteurCm;
  }

  return [...byDay.values()].sort((a, b) => a.dateFull.localeCompare(b.dateFull));
}

/** A trend requires two distinct daily readings from at least one tank. */
export function hasTraceableWaterLevelHistory(data: WaterLevelChartPoint[]): boolean {
  return data.filter((point) => point.citerne1 !== undefined).length >= 2
    || data.filter((point) => point.citerne2 !== undefined).length >= 2;
}

/** Formats the history payload persisted after an authenticated citerne update. */
export function buildCiterneHistoryRecord(
  tankId: 1 | 2,
  status: {
    volumeDisponible: { value: number | null };
    niveau: { value: number | null };
    hauteurEau: { value: number | null };
  },
) {
  if (status.volumeDisponible.value === null) return null;
  return {
    volumeLitres: status.volumeDisponible.value,
    niveauPct: status.niveau.value,
    hauteurCm: tankId === 2 && status.hauteurEau.value !== null
      ? status.hauteurEau.value * 100
      : null,
  };
}

export function isCiterneHistoryPoint(value: unknown): value is CiterneHistoryPoint {
  if (!value || typeof value !== "object") return false;
  const point = value as Partial<CiterneHistoryPoint>;
  return (
    typeof point.receivedAt === "string" &&
    Number.isFinite(new Date(point.receivedAt).getTime()) &&
    typeof point.volumeLitres === "number" &&
    Number.isFinite(point.volumeLitres) &&
    point.volumeLitres >= 0 &&
    (point.niveauPct === null || (typeof point.niveauPct === "number" && Number.isFinite(point.niveauPct))) &&
    (point.hauteurCm === undefined || point.hauteurCm === null || (typeof point.hauteurCm === "number" && Number.isFinite(point.hauteurCm) && point.hauteurCm >= 0))
  );
}

export function normalizeCiterneHistory(value: unknown): CiterneHistoryPoint[] {
  if (!value || typeof value !== "object") return [];
  const candidates = Array.isArray(value) ? value : Object.values(value);
  return candidates
    .filter(isCiterneHistoryPoint)
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
}

/**
 * Net tank-volume variation between two sensor reports, expressed in L/h.
 * It is not a direct source-flow measurement: household consumption can distort it.
 */
export function computeEstimatedFlows(points: CiterneHistoryPoint[]): EstimatedFlowPoint[] {
  const sorted = [...points].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  const estimates: EstimatedFlowPoint[] = [];

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const elapsedHours = (new Date(current.receivedAt).getTime() - new Date(previous.receivedAt).getTime()) / 3_600_000;
    if (!Number.isFinite(elapsedHours) || elapsedHours <= 0) continue;

    const debitLitresPerHour = (current.volumeLitres - previous.volumeLitres) / elapsedHours;
    if (!Number.isFinite(debitLitresPerHour)) continue;
    estimates.push({
      receivedAt: current.receivedAt,
      debitLitresPerHour: Math.round(debitLitresPerHour * 100) / 100,
    });
  }

  return estimates;
}
