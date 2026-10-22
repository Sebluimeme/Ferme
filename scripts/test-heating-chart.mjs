import test from "node:test";
import assert from "node:assert/strict";
import {
  boundHeatingRange, zoomHeatingRange, panHeatingRange, heatingChartSegments,
  reduceHeatingSegments, nearestHeatingSample, heatingValueAxis,
  HEATING_CHART_MIN_SPAN, HEATING_CHART_MAX_SPAN,
} from "../src/lib/heating-chart.ts";

const now = Date.UTC(2026, 9, 22, 12);
const minute = 60_000;
const point = (at, value) => ({ at, value, kind: "measurement" });

test("chart navigation preserves duration and never shifts beyond the present", () => {
  const range = { start: now - 6 * 3_600_000, end: now };
  assert.deepEqual(panHeatingRange(range, 3_600_000, now), range);
  assert.deepEqual(panHeatingRange(range, -3_600_000, now), { start: range.start - 3_600_000, end: now - 3_600_000 });
  const bounded = boundHeatingRange({ start: now - 60 * 86_400_000, end: now }, now);
  assert.equal(bounded.end - bounded.start, HEATING_CHART_MAX_SPAN);
});

test("zoom keeps the chosen pivot and reaches a finite minimum detail", () => {
  const range = { start: now - 6 * 3_600_000, end: now };
  assert.deepEqual(zoomHeatingRange(range, .5, .5, now), { start: now - 4.5 * 3_600_000, end: now - 1.5 * 3_600_000 });
  const smallest = zoomHeatingRange(range, 1e-8, 1, now);
  assert.equal(smallest.end - smallest.start, HEATING_CHART_MIN_SPAN);
  assert.equal(smallest.end, now);
});

test("temperature curves break at explicit outages and at gaps longer than ten minutes", () => {
  const range = { start: now - 120 * minute, end: now };
  const samples = [point(now - 60 * minute, 50), { at: now - 59 * minute, kind: "gap", value: null }, point(now - 58 * minute, 55), point(now - 30 * minute, 62), point(now - 29 * minute, 63)];
  assert.deepEqual(heatingChartSegments(samples, range).map(segment => segment.map(p => p.value)), [[50], [55], [62, 63]]);
  assert.deepEqual(heatingChartSegments(samples, range, true).map(segment => segment.map(p => p.value)), [[50], [55, 62, 63]]);
});

test("invalid samples break the line and empty periods remain empty", () => {
  const range = { start: now - 60 * minute, end: now };
  assert.deepEqual(heatingChartSegments([point(now - 70 * minute, 20)], range), []);
  assert.deepEqual(heatingChartSegments([point(now - 5 * minute, 0), point(now - 4 * minute, NaN), point(now - 3 * minute, 2)], range).map(segment => segment.map(p => p.value)), [[0], [2]]);
});

test("chart reduction retains spikes, troughs, boundaries and separate outages", () => {
  const first = Array.from({ length: 2000 }, (_, i) => point(now - (5000 - i) * minute, i === 1251 ? 98 : 50));
  const second = Array.from({ length: 2000 }, (_, i) => point(now - (2000 - i) * minute, i === 991 ? -6 : 52));
  const reduced = reduceHeatingSegments([first, second], 600);
  const flat = reduced.flat();
  assert.ok(flat.length <= 600);
  assert.equal(reduced.length, 2);
  assert.ok(flat.includes(first[0]));
  assert.ok(flat.includes(second.at(-1)));
  assert.ok(flat.some(p => p.value === 98));
  assert.ok(flat.some(p => p.value === -6));
  assert.ok(reduced[0].every(p => first.includes(p)));
  assert.ok(reduced[1].every(p => second.includes(p)));
});

test("point inspection returns a genuine observation and a constant series has a usable scale", () => {
  const samples = [point(now - 5 * minute, 60), point(now - minute, 60)];
  assert.equal(nearestHeatingSample(samples, now - 4 * minute), samples[0]);
  assert.equal(nearestHeatingSample(samples, now), samples[1]);
  assert.equal(nearestHeatingSample([], now), null);
  const axis = heatingValueAxis(samples);
  assert.ok(axis.min < 60 && axis.max > 60);
  assert.ok(axis.ticks.every(Number.isFinite));
});
