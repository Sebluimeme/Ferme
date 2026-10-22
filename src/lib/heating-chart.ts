import type { HeatingHistoryPoint } from "./chauffage-history.ts";

export interface HeatingChartRange { start: number; end: number }
export type HeatingChartSample = HeatingHistoryPoint & { value: number; kind: "measurement" };
export const HEATING_CHART_MIN_SPAN = 15 * 60_000;
export const HEATING_CHART_MAX_SPAN = 30 * 86_400_000;

/** Keep navigation finite, bounded, and out of the future without changing its duration. */
export function boundHeatingRange(range: HeatingChartRange, nowMs = Date.now()): HeatingChartRange {
  const requested = range.end - range.start;
  const span = Number.isFinite(requested) ? Math.max(HEATING_CHART_MIN_SPAN, Math.min(HEATING_CHART_MAX_SPAN, requested)) : 86_400_000;
  const end = Math.min(nowMs, Math.max(span, Number.isFinite(range.end) ? range.end : nowMs));
  return { start: end - span, end };
}

export function zoomHeatingRange(range: HeatingChartRange, factor: number, anchor = .5, nowMs = Date.now()): HeatingChartRange {
  const bounded = boundHeatingRange(range, nowMs);
  const span = bounded.end - bounded.start;
  const nextSpan = Math.max(HEATING_CHART_MIN_SPAN, Math.min(HEATING_CHART_MAX_SPAN, span * (Number.isFinite(factor) && factor > 0 ? factor : 1)));
  const position = Math.max(0, Math.min(1, anchor));
  const pivot = bounded.start + span * position;
  return boundHeatingRange({ start: pivot - nextSpan * position, end: pivot + nextSpan * (1 - position) }, nowMs);
}

export function panHeatingRange(range: HeatingChartRange, deltaMs: number, nowMs = Date.now()): HeatingChartRange {
  return boundHeatingRange({ start: range.start + deltaMs, end: range.end + deltaMs }, nowMs);
}

/** A missing observation never becomes a zero or a line through an outage. */
export function heatingChartSegments(points: readonly HeatingHistoryPoint[], range: HeatingChartRange, persistent = false, alreadyOrdered = false): HeatingChartSample[][] {
  const ordered = alreadyOrdered ? points : [...points].filter(point => Number.isFinite(point.at)).sort((a, b) => a.at - b.at || (a.kind === "gap" ? -1 : 1));
  const segments: HeatingChartSample[][] = [];
  let segment: HeatingChartSample[] = [];
  const flush = () => { if (segment.length) segments.push(segment); segment = []; };
  for (const point of ordered) {
    if (!Number.isFinite(point.at)) continue;
    if (point.at < range.start || point.at > range.end) continue;
    if (point.kind !== "measurement" || point.value === null || !Number.isFinite(point.value)) { flush(); continue; }
    const previous = segment[segment.length - 1];
    if (previous && !persistent && point.at - previous.at > 10 * 60_000) flush();
    segment.push(point as HeatingChartSample);
  }
  flush();
  return segments;
}

/** Preserve extrema and temporal endpoints in each bucket, retaining the original gaps. */
export function reduceHeatingSegments(segments: readonly HeatingChartSample[][], maximum = 600): HeatingChartSample[][] {
  const samples = segments.flat();
  const limit = Math.max(8, Math.floor(maximum));
  if (samples.length <= limit) return segments.map(segment => [...segment]);
  const bucketSize = Math.ceil(samples.length / Math.floor(limit / 4));
  const kept = new Set<HeatingChartSample>();
  for (let offset = 0; offset < samples.length; offset += bucketSize) {
    const bucket = samples.slice(offset, offset + bucketSize);
    let minimum = bucket[0], maximumPoint = bucket[0];
    for (const point of bucket) {
      if (point.value < minimum.value) minimum = point;
      if (point.value > maximumPoint.value) maximumPoint = point;
    }
    kept.add(bucket[0]); kept.add(bucket[bucket.length - 1]); kept.add(minimum); kept.add(maximumPoint);
  }
  return segments.map(segment => segment.filter(point => kept.has(point))).filter(segment => segment.length > 0);
}

export function nearestHeatingSample(samples: readonly HeatingChartSample[], at: number): HeatingChartSample | null {
  if (!samples.length || !Number.isFinite(at)) return null;
  let low = 0, high = samples.length - 1;
  while (low < high) { const middle = Math.floor((low + high) / 2); if (samples[middle].at < at) low = middle + 1; else high = middle; }
  const next = samples[low], previous = samples[low - 1];
  return previous && at - previous.at <= next.at - at ? previous : next;
}

export function heatingValueAxis(samples: readonly HeatingChartSample[]): { min: number; max: number; ticks: number[] } {
  if (!samples.length) return { min: 0, max: 1, ticks: [] };
  let smallest = Infinity, largest = -Infinity;
  for (const point of samples) { smallest = Math.min(smallest, point.value); largest = Math.max(largest, point.value); }
  const padding = Math.max(1, (largest - smallest) * .1);
  const rawStep = (largest - smallest + padding * 2) / 4;
  const power = 10 ** Math.floor(Math.log10(rawStep));
  const ratio = rawStep / power;
  const step = (ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10) * power;
  const min = Math.floor((smallest - padding) / step) * step;
  const max = Math.ceil((largest + padding) / step) * step;
  const ticks = Array.from({ length: Math.min(12, Math.round((max - min) / step) + 1) }, (_, index) => Number((min + index * step).toPrecision(10)));
  return { min, max, ticks };
}
