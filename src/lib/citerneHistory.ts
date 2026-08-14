export interface CiterneHistoryPoint {
  receivedAt: string;
  volumeLitres: number;
  niveauPct: number | null;
}

export interface EstimatedFlowPoint {
  receivedAt: string;
  debitLitresPerHour: number;
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
    (point.niveauPct === null || (typeof point.niveauPct === "number" && Number.isFinite(point.niveauPct)))
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
