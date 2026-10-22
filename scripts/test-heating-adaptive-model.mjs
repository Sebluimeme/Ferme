import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_HEATING_POLICY, evaluateHeatingRegulation, heatingTrends } from "../integrations/home-assistant/heating-regulation-model.mjs";

const NOW = 1_792_690_000;
const sample = (value, now = NOW, patch = {}) => ({ value, reportedAt: now, unit: "°C", available: true, ...patch });
function history(value, slope = 0, now = NOW) {
  return Array.from({ length: 16 }, (_, index) => ({ at: now - (15 - index) * 60, value: value - slope * (15 - index) }));
}
function input(patch = {}) {
  return { now: NOW, tankD: sample(59), tankB: sample(60), historyD: history(59),
    lastTransmitted: { temperature: 50, at: NOW - 3600 }, state: null, ...patch };
}
const evaluate = (patch) => evaluateHeatingRegulation(input(patch));

test("default policy is provisional, capped at 70 and has no actuation authority", () => {
  assert.equal(DEFAULT_HEATING_POLICY.maximumFuel, 70);
  const result = evaluate();
  assert.equal(result.authorizesActuation, false);
  assert.equal(result.diagnostics.provisional, true);
  assert.equal(result.recalculateOnRecovery, true);
  assert.equal(result.validUntil, NOW + 90);
});

test("hot D returns 50 immediately despite cooldown, missing history and response alarm", () => {
  const result = evaluate({ tankD: sample(60), historyD: [], lastTransmitted: { temperature: 70, at: NOW - 2 },
    state: { version: 1, support: true, responseAt: NOW - 3600, responseD: 60 } });
  assert.equal(result.temperature, 50);
  assert.equal(result.reason, "rest_hot");
  assert.equal(result.nextState.support, false);
});

test("there is no wait until 62 degrees to disengage", () => {
  for (const value of [60, 60.1, 61, 62, 70]) {
    assert.equal(evaluate({ tankD: sample(value), historyD: [] }).temperature, 50);
  }
});

test("fresh temperatures below minimum can produce an immediately useful first proposal", () => {
  const result = evaluate({ tankD: sample(56.5), tankB: sample(60), historyD: [] });
  assert.equal(result.temperature, 62);
  assert.equal(result.reason, "support_start");
  assert.equal(result.nextState.responseAt, null);
});

test("first useful proposal respects cap even when B requires more", () => {
  const result = evaluate({ tankD: sample(56), tankB: sample(75), historyD: [] });
  assert.equal(result.temperature, 70);
  assert.equal(result.diagnostics.usefulAboveCap, true);
});

test("predictive support starts before D reaches the minimum", () => {
  const result = evaluate({ tankD: sample(59), historyD: history(59, -0.25) });
  assert.equal(result.temperature, 62);
  assert.equal(result.reason, "support_start");
  assert.equal(result.diagnostics.forecast10, 56.5);
});

test("stable below-target D can initiate support without waiting for 57", () => {
  const result = evaluate({ tankD: sample(57.8), historyD: history(57.8) });
  assert.equal(result.temperature, 62);
});

test("a warm plateau progressively releases the old high setting", () => {
  let state = null;
  let transmitted = { temperature: 70, at: NOW - 3600 };
  const temperatures = [];
  for (let step = 0; step < 10; step += 1) {
    const now = NOW + step * 300;
    const result = evaluate({ now, tankD: sample(59, now), tankB: sample(60, now), historyD: history(59, 0, now), lastTransmitted: transmitted, state });
    temperatures.push(result.temperature);
    state = result.nextState;
    if (result.temperature !== transmitted.temperature) transmitted = { temperature: result.temperature, at: now };
  }
  assert.deepEqual(temperatures.slice(0, 5), [66, 62, 58, 54, 50]);
  assert.equal(temperatures.at(-1), 50);
  assert.equal(state.support, false);
});

test("modest warmth uses 2 degree reductions and observes five minute spacing", () => {
  const result = evaluate({ tankD: sample(58.5), historyD: history(58.5), lastTransmitted: { temperature: 64, at: NOW - 600 }, state: { version: 1, support: true } });
  assert.equal(result.temperature, 62);
  const next = evaluate({ tankD: sample(58.5), historyD: history(58.5), lastTransmitted: { temperature: 62, at: NOW - 60 }, state: result.nextState });
  assert.equal(next.temperature, 62);
  assert.equal(next.reason, "decrease_cooldown");
});

test("a recent cooling reversal must not cause a release based on older warming", () => {
  const points = history(59.5).map((point, index) => ({ ...point,
    value: index <= 10 ? 55 + index * 0.5 : 60 - (index - 10) * 0.1 }));
  const result = evaluate({ tankD: sample(59.5), historyD: points, lastTransmitted: { temperature: 64, at: NOW - 1200 }, state: { version: 1, support: true } });
  assert.ok(result.diagnostics.slowTrend > 0);
  assert.ok(result.diagnostics.recentTrend < 0);
  assert.ok(result.temperature >= 64);
});

test("recent recovery vetoes increases based on the old falling trend", () => {
  const points = history(59).map((point, index) => ({ ...point,
    value: index <= 10 ? 62 - index * 0.4 : 58 + (index - 10) * 0.2 }));
  const result = evaluate({ tankD: sample(59), historyD: points, lastTransmitted: { temperature: 64, at: NOW - 1200 }, state: { version: 1, support: true } });
  assert.ok(result.diagnostics.slowTrend < 0);
  assert.ok(result.diagnostics.recentTrend > 0);
  assert.ok(result.temperature <= 64);
});

test("a reversal in the last two minutes overrides an older positive median trend", () => {
  const values = [54,54.5,55,55.5,56,56.5,57,57.5,58,58.5,59,59.3,59.6,59.8,59.6,59.4];
  const points = values.map((value, index) => ({ at: NOW-(15-index)*60, value }));
  const result = evaluate({ tankD: sample(59.4), historyD: points, lastTransmitted: { temperature: 64, at: NOW - 1200 }, state: { version: 1, support: true } });
  assert.ok(result.diagnostics.recentTrend > 0);
  assert.ok(result.diagnostics.latestTrend < 0);
  assert.ok(result.temperature >= 64);
});

test("a recovery in the last two minutes prevents a raise despite an older negative median", () => {
  const values = [62,61.7,61.4,61.1,60.8,60.5,60.2,59.9,59.6,59.3,59,58.7,58.4,58.2,58.4,58.6];
  const points = values.map((value, index) => ({ at: NOW-(15-index)*60, value }));
  const result = evaluate({ tankD: sample(58.6), historyD: points, lastTransmitted: { temperature: 64, at: NOW - 1200 }, state: { version: 1, support: true } });
  assert.ok(result.diagnostics.recentTrend < 0);
  assert.ok(result.diagnostics.latestTrend > 0);
  assert.equal(result.temperature,64);
  assert.equal(result.reason,"recent_recovery");
});

test("continued support increases at most two degrees and respects ten minute delivery cooldown", () => {
  const patch = { tankD: sample(56), historyD: history(56), lastTransmitted: { temperature: 62, at: NOW - 600 }, state: { version: 1, support: true } };
  assert.equal(evaluate(patch).temperature, 64);
  const waiting = evaluate({ ...patch, lastTransmitted: { temperature: 62, at: NOW - 599 } });
  assert.equal(waiting.temperature, 62);
  assert.equal(waiting.reason, "increase_cooldown");
});

test("untransmitted proposals neither stair-step nor consume a delivery cooldown", () => {
  const patch = { tankD: sample(56), historyD: [] };
  let state = null;
  for (let minute = 0; minute < 60; minute += 1) {
    const now = NOW + minute * 60;
    const result = evaluate({ ...patch, now, tankD: sample(56, now), tankB: sample(60, now), state });
    assert.equal(result.temperature, 62);
    assert.equal(result.nextState.responseAt, null);
    state = result.nextState;
  }
});

test("B disconnect keeps a theoretical proposal without granting dispatch authority", () => {
  const result = evaluate({ tankD: sample(56), historyD: [], tankB: sample(60, NOW, { available: false }) });
  assert.equal(result.temperature, 61);
  assert.equal(result.reason, "support_start");
  assert.equal(result.authorizesActuation, false);
  assert.equal(result.nextState.responseAt, null);
  assert.equal(evaluate({ tankD: sample(61), tankB: null }).temperature, 50);
});

test("reconnection reevaluates current temperatures and replaces pending support with 50", () => {
  const pending = evaluate({ tankD: sample(56), historyD: [] });
  assert.equal(pending.temperature, 62);
  const disconnected = evaluate({ tankB: sample(60, NOW, { available: false }), state: pending.nextState });
  const resumed = evaluate({ tankD: sample(61), historyD: [], state: disconnected.nextState });
  assert.equal(resumed.temperature, 50);
  assert.equal(resumed.reason, "rest_hot");
});

test("incomplete history within the band holds the transmitted setting, not an old pending request", () => {
  const result = evaluate({ tankD: sample(59), historyD: [], lastTransmitted: { temperature: 64, at: NOW - 3600 }, state: { version: 1, support: true } });
  assert.equal(result.temperature, 64);
  assert.equal(result.reason, "insufficient_history");
  const unknown = evaluate({ tankD: sample(59), historyD: [], lastTransmitted: null });
  assert.equal(unknown.temperature, null);
});

test("invalid, stale, future, restored and Fahrenheit samples cannot control", () => {
  for (const patch of [{ value: NaN }, { value: Infinity }, { value: "60" }, { value: -1 }, { value: 111 },
    { reportedAt: NOW + 1 }, { reportedAt: NOW - 181 }, { available: false }, { restored: true }, { unit: "°F" }]) {
    for (const key of ["tankD"]) {
      const result = evaluate({ [key]: sample(60, NOW, patch) });
      assert.equal(result.temperature, null, `${key} ${JSON.stringify(patch)}`);
      assert.equal(result.action, "suspend");
    }
  }
});

test("zero is valid and does not stand for unavailable", () => {
  assert.equal(evaluate({ tankD: sample(0), historyD: [] }).temperature, 62);
  assert.equal(evaluate({ tankD: sample(0, NOW, { available: false }), historyD: [] }).temperature, null);
});

test("history does not bridge a communication gap or accept a future source", () => {
  const points = history(59).filter((point) => point.at <= NOW - 600);
  assert.equal(heatingTrends(points, sample(59), NOW).slow, null);
  assert.equal(heatingTrends([...history(59), { at: NOW + 60, value: 99 }], sample(59), NOW).slow, 0);
});

test("response monitoring starts only after a sufficiently high transmitted setting", () => {
  const first = evaluate({ tankD: sample(56), historyD: history(56), lastTransmitted: { temperature: 53, at: NOW - 3600 } });
  assert.equal(first.nextState.responseAt, null);
  const transmitted = evaluate({ tankD: sample(56), historyD: history(56), lastTransmitted: { temperature: 62, at: NOW - 1 } });
  assert.equal(transmitted.nextState.responseAt, NOW);
  const later = evaluate({ tankD: sample(56), historyD: history(56), lastTransmitted: { temperature: 64, at: NOW - 600 },
    state: { version: 1, support: true, responseAt: NOW - 1800, responseD: 56 } });
  assert.equal(later.reason, "response_not_observed");
  assert.equal(later.temperature, 64);
});

test("default cap is respected across temperatures and valid transmitted settings", () => {
  for (const d of [0, 54, 56, 57, 58, 58.5, 59, 59.5, 60, 61, 70]) {
    for (const b of [45, 50, 60, 69, 80]) {
      for (const current of [50, 60, 68, 70, 80]) {
        const result = evaluate({ tankD: sample(d), tankB: sample(b), historyD: history(d),
          lastTransmitted: { temperature: current, at: NOW - 1200 }, state: { version: 1, support: true } });
        assert.ok(Number.isInteger(result.temperature));
        assert.ok(result.temperature >= 50 && result.temperature <= 70, JSON.stringify({ d, b, current, result }));
        assert.equal(result.authorizesActuation, false);
      }
    }
  }
});

test("invalid policy fails instead of widening physical limits silently", () => {
  for (const config of [{ maximumFuel: 100 }, { maximumFuel: NaN }, { restingFuel: 45 },
    { minimumD: 59, targetD: 58.5 }, { restAtD: 57.5 }, { sampleMaxAgeSeconds: 7200 },
    { increaseIntervalSeconds: 1 }]) assert.throws(() => evaluate({ config }), RangeError);
});

test("the evaluator never mutates inputs or treats its own previous proposal as delivery", () => {
  const request = input({ tankD: sample(56), historyD: [], lastTransmitted: null });
  const original = structuredClone(request);
  const first = evaluateHeatingRegulation(request);
  assert.deepEqual(request, original);
  assert.equal(first.temperature, 62);
  const again = evaluateHeatingRegulation({ ...request, state: first.nextState });
  assert.equal(again.temperature, 62);
  assert.equal(again.diagnostics.currentTransmitted, null);
});
