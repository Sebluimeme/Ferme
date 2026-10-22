/**
 * Experimental, pure heating policy. No device, network, storage or HA calls.
 * All timestamps use UTC Unix seconds. A returned temperature is a proposal,
 * never evidence that a servo moved. Commissioning and delivery belong outside
 * this module. The default 70 °C cap and timing constants are provisional.
 */
export const DEFAULT_HEATING_POLICY = Object.freeze({
  minimumD: 57,
  targetD: 58.5,
  restAtD: 60,
  restingFuel: 50,
  maximumFuel: 70,
  usefulMargin: 2,
  sampleMaxAgeSeconds: 180,
  increaseIntervalSeconds: 600,
  decreaseIntervalSeconds: 300,
  proposalLifetimeSeconds: 90,
  responseWindowSeconds: 1800,
  responseRise: 0.3,
});

const finite = (n) => typeof n === "number" && Number.isFinite(n);
const clamp = (n, lower, upper) => Math.min(upper, Math.max(lower, n));
const round = (n) => Math.round(n * 1000) / 1000;

export function validateHeatingPolicy(input = {}) {
  const config = { ...DEFAULT_HEATING_POLICY, ...input };
  if (input.targetD === undefined) config.targetD = (config.minimumD + config.restAtD) / 2;
  const invalid = Object.entries(config).some(([, value]) => !finite(value))
    || config.minimumD < 40 || config.minimumD > 75
    || config.targetD < config.minimumD + 0.5
    || config.restAtD < config.targetD + 0.5 || config.restAtD > 80
    || config.restingFuel !== 50
    || !Number.isInteger(config.maximumFuel)
    || config.maximumFuel < 50 || config.maximumFuel > 80
    || config.usefulMargin < 1 || config.usefulMargin > 5
    || config.sampleMaxAgeSeconds < 30 || config.sampleMaxAgeSeconds > 300
    || config.increaseIntervalSeconds < 300 || config.increaseIntervalSeconds > 1800
    || config.decreaseIntervalSeconds < 180 || config.decreaseIntervalSeconds > 900
    || config.proposalLifetimeSeconds < 10 || config.proposalLifetimeSeconds > 120
    || config.responseWindowSeconds < 900 || config.responseWindowSeconds > 3600
    || config.responseRise < 0.1 || config.responseRise > 2;
  if (invalid) throw new RangeError("Invalid experimental heating policy");
  return config;
}

function sampleProblem(sample, now, maximumAge) {
  if (!sample || sample.available !== true) return "unavailable";
  if (!finite(sample.value) || sample.value < 0 || sample.value > 110
      || !["°C", "C"].includes(sample.unit) || sample.restored === true) return "invalid";
  if (!finite(sample.reportedAt) || sample.reportedAt > now
      || now - sample.reportedAt > maximumAge) return "stale";
  return null;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// Median pairwise slope avoids making a long-lived decision from one noisy point.
function trend(points, minimumSpan, minimumCount) {
  if (points.length < minimumCount || points.at(-1).at - points[0].at < minimumSpan) return null;
  const slopes = [];
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const elapsed = points[j].at - points[i].at;
      if (elapsed >= 60) slopes.push((points[j].value - points[i].value) / (elapsed / 60));
    }
  }
  return slopes.length ? round(clamp(median(slopes), -0.5, 0.5)) : null;
}

export function heatingTrends(history, current, now, maximumGap = 180) {
  const minutePoints = new Map();
  for (const point of [...(Array.isArray(history) ? history : []), { at: current.reportedAt, value: current.value }]) {
    if (!point || !finite(point.at) || !finite(point.value) || point.value < 0 || point.value > 110
        || point.at > now || point.at < current.reportedAt - 900) continue;
    const minute = Math.floor(point.at / 60);
    if (!minutePoints.has(minute) || minutePoints.get(minute).at <= point.at) minutePoints.set(minute, point);
  }
  const sorted = [...minutePoints.values()].sort((a, b) => a.at - b.at);
  let continuous = [];
  for (const point of sorted) {
    if (continuous.length && point.at - continuous.at(-1).at > maximumGap) continuous = [];
    continuous.push(point);
  }
  // A history newer than the current source is inconsistent; do not infer a trend.
  if (!continuous.length || continuous.at(-1).at !== current.reportedAt) return { recent: null, slow: null, tip: null, count: 0 };
  const recent = continuous.filter((point) => point.at >= current.reportedAt - 300);
  const tipStart = continuous.findLast((point) => current.reportedAt - point.at >= 120);
  const tip = tipStart && current.reportedAt - tipStart.at <= 360
    ? round(clamp((current.value - tipStart.value) / ((current.reportedAt - tipStart.at) / 60), -0.5, 0.5)) : null;
  return {
    recent: trend(recent, 120, 3),
    slow: trend(continuous, 600, 6),
    tip,
    count: continuous.length,
  };
}

function previousState(raw) {
  if (!raw || raw.version !== 1) return { version: 1, support: false, responseAt: null, responseD: null };
  return {
    version: 1,
    support: raw.support === true,
    responseAt: finite(raw.responseAt) ? raw.responseAt : null,
    responseD: finite(raw.responseD) ? raw.responseD : null,
  };
}

/**
 * @param {object} input
 * @param {number} input.now UTC Unix seconds
 * @param {object} input.tankD { value, reportedAt, unit:'°C', available:true }
 * @param {object} input.tankB Optional refinement for initial support; offline samples are ignored.
 * @param {{at:number,value:number}[]} [input.historyD]
 * @param {{temperature:number,at:number}|null} [input.lastTransmitted]
 *   Last setpoint whose Home Assistant API call returned without error, not a draft or
 *   a remembered climate attribute. This is not an ESPHome acknowledgement or a mechanical position measurement.
 * @param {object|null} [input.state] Previous nextState, with no transmission clock.
 * @param {object} [input.config] Provisional policy overrides.
 */
export function evaluateHeatingRegulation(input) {
  const config = validateHeatingPolicy(input.config);
  if (!finite(input.now) || input.now <= 0) throw new RangeError("Invalid evaluation time");
  const now = input.now;
  const state = previousState(input.state);
  const transmitted = input.lastTransmitted;
  const hasTransmitted = transmitted && finite(transmitted.temperature) && Number.isInteger(transmitted.temperature)
    && transmitted.temperature >= 50 && transmitted.temperature <= 90
    && finite(transmitted.at) && transmitted.at <= now;
  const current = hasTransmitted ? transmitted.temperature : config.restingFuel;
  const elapsed = hasTransmitted ? now - transmitted.at : Infinity;
  const diagnostics = { currentTransmitted: hasTransmitted ? current : null, provisional: true };
  const finish = (temperature, action, reason, nextState = state, extra = {}) => ({
    temperature,
    action,
    reason,
    nextState,
    diagnostics: { ...diagnostics, ...extra },
    evaluatedAt: now,
    validUntil: temperature === null ? now : now + config.proposalLifetimeSeconds,
    recalculateOnRecovery: true,
    // This policy has no authority to commission equipment or bypass the caller.
    authorizesActuation: false,
  });

  for (const [key, sample] of [["tank_d", input.tankD]]) {
    const problem = sampleProblem(sample, now, config.sampleMaxAgeSeconds);
    if (problem) return finish(null, "suspend", `${key}_${problem}`, { ...state, responseAt: null, responseD: null });
  }
  const d = input.tankD.value;
  const bUsable = !sampleProblem(input.tankB, now, config.sampleMaxAgeSeconds);
  const b = bUsable ? input.tankB.value : config.targetD;
  const slopes = heatingTrends(input.historyD, input.tankD, now, config.sampleMaxAgeSeconds);
  const ready = finite(slopes.recent) && finite(slopes.slow);
  const conservativeSlope = ready ? Math.min(slopes.recent, slopes.slow, finite(slopes.tip) ? slopes.tip : slopes.recent) : null;
  const forecast5 = finite(slopes.recent) ? d + Math.min(slopes.recent, finite(slopes.tip) ? slopes.tip : slopes.recent) * 5 : null;
  const forecast10 = ready ? d + conservativeSlope * 10 : null;
  Object.assign(diagnostics, { tankD: d, tankB: b, recentTrend: slopes.recent, slowTrend: slopes.slow, latestTrend: slopes.tip,
    forecast5: forecast5 === null ? null : round(forecast5), forecast10: forecast10 === null ? null : round(forecast10) });
  const restState = { ...state, support: false, responseAt: null, responseD: null };

  // Absolute upper threshold has priority over cooldown, history and alarms.
  if (d >= config.restAtD) return finish(config.restingFuel, current > 50 ? "reduce" : "hold", "rest_hot", restState);
  if (current > config.maximumFuel) return finish(config.maximumFuel, "reduce", "maximum_reduced", state);

  // Below the minimum, fresh temperatures alone can justify an initial useful
  // proposal. Within the band, a gap must not be interpreted as "no demand".
  if (!ready && d > config.minimumD) {
    return finish(hasTransmitted ? current : null, hasTransmitted ? "hold" : "suspend", "insufficient_history", state);
  }
  const recovering = finite(slopes.tip) && slopes.tip > 0.03
    && d + slopes.tip * 5 >= config.targetD;
  const risk = d <= config.minimumD || (ready && forecast10 < config.minimumD);
  const belowTarget = ready && d < config.targetD - 0.5 && Math.min(slopes.recent, slopes.tip ?? slopes.recent) <= 0.03;
  const wantsSupport = state.support || ((risk || belowTarget) && (!recovering || d < config.minimumD - 1));

  // Reduce even on a warm plateau: the purpose is the smallest useful fuel input,
  // rather than indefinitely keeping an old high setpoint once D is warm enough.
  const recentCooling = (finite(slopes.recent) && slopes.recent < -0.03) || (finite(slopes.tip) && slopes.tip < -0.03);
  const reductionZone = ready && d >= config.targetD - 0.1 && !recentCooling;
  if (reductionZone) {
    if (current <= 50) return finish(50, "hold", "rest_in_band", restState);
    if (elapsed < config.decreaseIntervalSeconds) return finish(current, "hold", "decrease_cooldown", state);
    const step = d >= config.targetD + 0.5 || forecast5 >= config.restAtD ? 4 : 2;
    const temperature = Math.max(50, current - step);
    return finish(temperature, "reduce", "release_support",
      { ...state, support: temperature > 50, responseAt: null, responseD: null });
  }
  if (!wantsSupport) {
    if (current <= 50) return finish(50, "hold", "rest", restState);
    if (elapsed < config.decreaseIntervalSeconds) return finish(current, "hold", "decrease_cooldown", state);
    const temperature = Math.max(50, current - 2);
    return finish(temperature, "reduce", "release_support", { ...restState, support: temperature > 50 });
  }

  let nextState = { ...state, support: true };
  const useful = Math.ceil(Math.max(config.targetD + config.usefulMargin, b + config.usefulMargin));
  diagnostics.usefulFuel = useful;
  diagnostics.usefulAboveCap = useful > config.maximumFuel;

  // No response clock starts for an untransmitted proposal or a setpoint too low
  // to heat B/D. A rapid return to 50 above the upper threshold remains possible.
  const responseEligible = bUsable && hasTransmitted && current >= Math.max(d, b) + config.usefulMargin;
  if (!responseEligible || (finite(state.responseD) && d >= state.responseD + config.responseRise)) {
    nextState = { ...nextState, responseAt: null, responseD: null };
  } else if (!finite(state.responseAt) || !finite(state.responseD) || state.responseAt > now) {
    nextState = { ...nextState, responseAt: now, responseD: d };
  } else if (now - state.responseAt >= config.responseWindowSeconds) {
    return finish(current, "hold", "response_not_observed", nextState);
  }

  // A recent recovery vetoes an increase even if the longer trend still falls.
  if (recovering && d >= config.minimumD) return finish(current, "hold", "recent_recovery", nextState);
  if (current <= config.restingFuel) {
    if (elapsed < config.decreaseIntervalSeconds && d > config.minimumD - 1) {
      return finish(current, "hold", "restart_cooldown", nextState);
    }
    const temperature = clamp(useful, 50, config.maximumFuel);
    return finish(temperature, temperature > current ? "raise" : "hold",
      temperature > current ? "support_start" : "at_maximum", nextState);
  }

  const needsIncrease = d < config.minimumD || (ready && forecast10 < config.targetD - 0.25);
  if (!needsIncrease) return finish(current, "hold", "support_stable", nextState);
  if (elapsed < config.increaseIntervalSeconds) return finish(current, "hold", "increase_cooldown", nextState);
  const step = d < config.minimumD || (ready && forecast10 < config.minimumD - 0.5) ? 2 : 1;
  const temperature = clamp(current + step, 50, config.maximumFuel);
  return finish(temperature, temperature > current ? "raise" : "hold",
    temperature > current ? "support_increase" : "at_maximum", nextState);
}
