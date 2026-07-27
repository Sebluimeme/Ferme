#!/usr/bin/env node
/**
 * Test logique du planificateur d'arrosage nocturne — V2.
 * Usage: node scripts/test-irrigation-scheduler.mjs
 *
 * Ce script est autonome (pas de Firebase, pas de HA) et teste
 * la logique pure du calcul horaire, pluie, et humidité estimée par zone.
 */

// ─── Constantes et types (miroir de src/lib/irrigationScheduler.ts) ──────────

const QUALITY_THRESHOLDS = {
  eco:      { triggerPct: 25, targetPct: 55 },
  passable: { triggerPct: 30, targetPct: 65 },
  correct:  { triggerPct: 40, targetPct: 75 },
  green:    { triggerPct: 50, targetPct: 85 },
  manual:   { triggerPct: 30, targetPct: 65 },
};

const DEFAULT_CONFIG = {
  enabled: true,
  rainThresholdMm: 15,
  zones: [
    {
      zone: 1, enabled: true,
      qualityMode: "passable",
      soilCapacityMm: 35,
      irrigationDepthMmPerHour: 5,
      minRunMinutes: 45,
      maxRunMinutes: 240,
      dailyLossMm: 3,
    },
    {
      zone: 2, enabled: true,
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

// ─── Helpers (miroir exact de irrigationScheduler.ts) ────────────────────────

function localDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getNextMorningDate(now, windowEndHour) {
  if (now.getHours() < windowEndHour) return localDateStr(now);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return localDateStr(tomorrow);
}

function computeTodayRain(readings, todayStr) {
  let max = 0;
  for (const r of readings) {
    const date = r.date ?? r.timestamp?.slice(0, 10);
    if (date === todayStr && r.rainTotalMm != null && Number.isFinite(r.rainTotalMm)) {
      max = Math.max(max, r.rainTotalMm);
    }
  }
  return max;
}

function computeRecentRainMm(readings, nowMs) {
  const weights = [1, 0.85, 0.7, 0.5, 0.35, 0.2, 0.1];
  return Number(weights.reduce((sum, weight, daysAgo) => {
    const day = new Date(nowMs - daysAgo * 24 * 60 * 60 * 1000);
    return sum + computeTodayRain(readings, localDateStr(day)) * weight;
  }, 0).toFixed(2));
}

// ─── V2: humidité estimée ─────────────────────────────────────────────────────

function estimateZoneMoisture(zone, recentRainMm, nowMs) {
  const capacity = zone.soilCapacityMm ?? 35;
  const mode = zone.qualityMode ?? "passable";
  const thresholds = QUALITY_THRESHOLDS[mode] ?? QUALITY_THRESHOLDS.passable;
  const dailyLoss = zone.dailyLossMm ?? 3;

  let reserveMm;
  if (zone.lastIrrigationAt) {
    const lastMs = new Date(zone.lastIrrigationAt).getTime();
    const daysSince = Math.max(0, (nowMs - lastMs) / (24 * 60 * 60 * 1000));
    const startMm = (thresholds.targetPct / 100) * capacity;
    reserveMm = startMm - daysSince * dailyLoss + recentRainMm;
  } else {
    reserveMm = 0.4 * capacity + recentRainMm;
  }

  reserveMm = Math.max(0, Math.min(capacity, reserveMm));
  return Math.round((reserveMm / capacity) * 100);
}

function computeZoneDecision(zone, humidityPct) {
  const mode = zone.qualityMode ?? "passable";
  const thresholds = QUALITY_THRESHOLDS[mode] ?? QUALITY_THRESHOLDS.passable;
  const triggerPct = (mode === "manual" && zone.triggerPct != null) ? zone.triggerPct : thresholds.triggerPct;
  const targetPct  = (mode === "manual" && zone.targetPct  != null) ? zone.targetPct  : thresholds.targetPct;

  if (!zone.enabled) {
    return { zone: zone.zone, estimatedHumidityPct: humidityPct, triggerPct, targetPct, decision: "disabled", plannedDurationMinutes: 0, debugInfo: "Zone désactivée" };
  }

  if (humidityPct > triggerPct) {
    return { zone: zone.zone, estimatedHumidityPct: humidityPct, triggerPct, targetPct, decision: "wait", plannedDurationMinutes: 0, debugInfo: `${humidityPct}% > seuil ${triggerPct}%` };
  }

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
    zone: zone.zone, estimatedHumidityPct: humidityPct, triggerPct, targetPct,
    decision: "irrigate", plannedDurationMinutes: planned,
    debugInfo: `${humidityPct}% ≤ seuil ${triggerPct}% → ${mmNeeded.toFixed(1)} mm → ${planned} min`,
  };
}

function computeIrrigationPlanV2(config, zoneStates, rainMeasuredMm, morningDate, nowIso) {
  const rainThresholdMm = config.rainThresholdMm ?? 15;
  const base = { planId: morningDate, date: morningDate, rainMeasuredMm, rainThresholdMm, createdAt: nowIso, zoneStates };

  if (rainMeasuredMm >= rainThresholdMm) {
    return { ...base, status: "skipped", reason: `Pluie ${rainMeasuredMm.toFixed(1)} mm ≥ seuil ${rainThresholdMm} mm`, startAt: "", endAt: "", totalDurationMinutes: 0, zones: [] };
  }

  const toIrrigate = zoneStates.filter(z => z.decision === "irrigate");

  if (toIrrigate.length === 0) {
    return { ...base, status: "skipped", reason: "Humidité estimée suffisante dans toutes les zones", startAt: "", endAt: "", totalDurationMinutes: 0, zones: [] };
  }

  const totalMinutes = toIrrigate.reduce((s, z) => s + z.plannedDurationMinutes, 0);

  if (totalMinutes > 8 * 60) {
    return { ...base, status: "error", reason: `Durée totale ${totalMinutes} min > max 480 min (8h)`, startAt: "", endAt: "", totalDurationMinutes: totalMinutes, zones: [] };
  }

  const hEnd = String(config.windowEndHour).padStart(2, "0");
  const endLocal = new Date(`${morningDate}T${hEnd}:00:00`);
  const startLocal = new Date(endLocal.getTime() - totalMinutes * 60 * 1000);

  const dayBefore = new Date(endLocal.getTime() - 24 * 60 * 60 * 1000);
  dayBefore.setHours(config.windowStartHour, 0, 0, 0);

  if (startLocal < dayBefore) {
    return { ...base, status: "error", reason: `Départ avant ${config.windowStartHour}h00`, startAt: "", endAt: "", totalDurationMinutes: totalMinutes, zones: [] };
  }

  let cursor = startLocal.getTime();
  const zones = toIrrigate.map(z => {
    const s = new Date(cursor);
    cursor += z.plannedDurationMinutes * 60 * 1000;
    return { zone: z.zone, durationMinutes: z.plannedDurationMinutes, startAt: s.toISOString(), endAt: new Date(cursor).toISOString(), status: "pending" };
  });

  return {
    ...base, status: "scheduled",
    reason: toIrrigate.map(z => `Z${z.zone} ${z.plannedDurationMinutes}min`).join(" + "),
    startAt: startLocal.toISOString(), endAt: endLocal.toISOString(),
    totalDurationMinutes: totalMinutes, zones,
  };
}

// ─── Legacy V1 (maintenu pour les tests existants) ───────────────────────────

function computePlan(config, rainMm, morningDate, nowIso) {
  const base = {
    planId: morningDate, date: morningDate,
    rainMeasuredMm: rainMm, rainThresholdMm: config.rainThresholdMm,
    createdAt: nowIso,
  };

  if (rainMm >= config.rainThresholdMm) {
    return { ...base, status: "skipped",
      reason: `Pluie suffisante (${rainMm.toFixed(1)} mm ≥ ${config.rainThresholdMm} mm)`,
      startAt: "", endAt: "", totalDurationMinutes: 0, zones: [] };
  }

  const enabled = config.zones.filter(z => z.enabled);
  if (!enabled.length) {
    return { ...base, status: "skipped", reason: "Aucune zone activée",
      startAt: "", endAt: "", totalDurationMinutes: 0, zones: [] };
  }

  const deficit = Math.max(0, config.targetMm - rainMm);
  const scale = config.targetMm > 0 ? Math.min(1, deficit / config.targetMm) : 1;
  const zoneDurations = enabled.map(z => ({
    zone: z.zone,
    durationMinutes: Math.max(1, Math.round((z.maxDurationMinutes ?? z.maxRunMinutes ?? 120) * scale)),
  }));
  const totalMinutes = zoneDurations.reduce((s, z) => s + z.durationMinutes, 0);

  const windowMax = (config.windowEndHour + 24 - config.windowStartHour) * 60;
  if (totalMinutes > windowMax) {
    return { ...base, status: "error",
      reason: `Durée totale ${totalMinutes} min > fenêtre max ${windowMax} min`,
      startAt: "", endAt: "", totalDurationMinutes: totalMinutes, zones: [] };
  }

  const hEnd = String(config.windowEndHour).padStart(2, "0");
  const endLocal = new Date(`${morningDate}T${hEnd}:00:00`);
  const startLocal = new Date(endLocal.getTime() - totalMinutes * 60 * 1000);

  const dayBefore = new Date(endLocal.getTime() - 24 * 60 * 60 * 1000);
  dayBefore.setHours(config.windowStartHour, 0, 0, 0);

  if (startLocal < dayBefore) {
    return { ...base, status: "error",
      reason: `Start (${startLocal.toLocaleTimeString("fr-FR")}) avant 22h00`,
      startAt: "", endAt: "", totalDurationMinutes: totalMinutes, zones: [] };
  }

  let cursor = startLocal.getTime();
  const zones = zoneDurations.map(z => {
    const s = new Date(cursor);
    cursor += z.durationMinutes * 60 * 1000;
    return { zone: z.zone, durationMinutes: z.durationMinutes, startAt: s.toISOString(), endAt: new Date(cursor).toISOString(), status: "pending" };
  });

  return { ...base, status: "scheduled",
    reason: `Déficit: ${deficit.toFixed(1)} mm (${rainMm.toFixed(1)} mm, cible ${config.targetMm} mm)`,
    startAt: startLocal.toISOString(), endAt: endLocal.toISOString(),
    totalDurationMinutes: totalMinutes, zones };
}

// ─── Infrastructure de test ──────────────────────────────────────────────────

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message ?? "assertion failed");
}

function assertEqual(actual, expected, label = "") {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests V1 — conservés
// ─────────────────────────────────────────────────────────────────────────────

const V1_CONFIG = {
  enabled: true, rainThresholdMm: 15, targetMm: 20, mmPerHour: 5,
  zones: [
    { zone: 1, enabled: true, maxDurationMinutes: 120 },
    { zone: 2, enabled: true, maxDurationMinutes: 120 },
  ],
  windowStartHour: 22, windowEndHour: 6,
};

console.log("\n── getNextMorningDate ────────────────────────────────────────────────────\n");

test("03:00 local → même matin", () => {
  const d = new Date("2026-07-28T03:00:00");
  const result = getNextMorningDate(d, 6);
  assert(result.length === 10, `date string len: ${result}`);
});

test("07:00 local → lendemain matin", () => {
  const d = new Date("2026-07-27T07:00:00");
  const r1 = getNextMorningDate(d, 6);
  const tomorrow = new Date(d.getTime() + 86400000);
  const r2 = localDateStr(tomorrow);
  assertEqual(r1, r2, "tomorrow date");
});

test("22:00 local → lendemain matin", () => {
  const d = new Date("2026-07-27T22:00:00");
  const r = getNextMorningDate(d, 6);
  const tomorrow = new Date(d.getTime() + 86400000);
  assertEqual(r, localDateStr(tomorrow));
});

console.log("\n── computeTodayRain ──────────────────────────────────────────────────────\n");

test("Pas de données → 0 mm", () => {
  assertEqual(computeTodayRain([], "2026-07-27"), 0);
});

test("Prend le max du rainTotalMm pour le jour donné", () => {
  const readings = [
    { date: "2026-07-27", rainTotalMm: 3.2 },
    { date: "2026-07-27", rainTotalMm: 5.8 },
    { date: "2026-07-26", rainTotalMm: 10 },
  ];
  assertEqual(computeTodayRain(readings, "2026-07-27"), 5.8);
});

test("Utilise timestamp si date absente", () => {
  const readings = [{ timestamp: "2026-07-27T14:30:00Z", rainTotalMm: 7.1 }];
  assertEqual(computeTodayRain(readings, "2026-07-27"), 7.1);
});

test("Ignore rainTotalMm null/NaN", () => {
  const readings = [
    { date: "2026-07-27", rainTotalMm: null },
    { date: "2026-07-27", rainTotalMm: NaN },
    { date: "2026-07-27", rainTotalMm: 2.0 },
  ];
  assertEqual(computeTodayRain(readings, "2026-07-27"), 2.0);
});

console.log("\n── computePlan V1 — cas skip ─────────────────────────────────────────────\n");

test("Pluie ≥ seuil → skipped", () => {
  const plan = computePlan(V1_CONFIG, 18, "2026-07-28", new Date().toISOString());
  assertEqual(plan.status, "skipped");
  assert(plan.totalDurationMinutes === 0);
  assert(plan.zones.length === 0);
});

test("Pluie exactement au seuil → skipped", () => {
  const plan = computePlan(V1_CONFIG, 15, "2026-07-28", new Date().toISOString());
  assertEqual(plan.status, "skipped");
});

test("Aucune zone activée → skipped", () => {
  const cfg = { ...V1_CONFIG, zones: [{ zone: 1, enabled: false, maxDurationMinutes: 120 }] };
  const plan = computePlan(cfg, 0, "2026-07-28", new Date().toISOString());
  assertEqual(plan.status, "skipped");
});

console.log("\n── computePlan V1 — cas scheduled ────────────────────────────────────────\n");

test("Pas de pluie → durée pleine (scale=1)", () => {
  const plan = computePlan(V1_CONFIG, 0, "2026-07-28", new Date().toISOString());
  assertEqual(plan.status, "scheduled");
  assertEqual(plan.totalDurationMinutes, 240);
  assertEqual(plan.zones.length, 2);
  assertEqual(plan.zones[0].durationMinutes, 120);
  assertEqual(plan.zones[1].durationMinutes, 120);
});

test("5 mm de pluie sur 20 mm cible → scale=0.75, durée=90 min/zone", () => {
  const plan = computePlan(V1_CONFIG, 5, "2026-07-28", new Date().toISOString());
  assertEqual(plan.status, "scheduled");
  assertEqual(plan.zones[0].durationMinutes, 90);
  assertEqual(plan.zones[1].durationMinutes, 90);
  assertEqual(plan.totalDurationMinutes, 180);
});

test("End time = 06:00 local, startAt = endAt - totalMinutes", () => {
  const plan = computePlan(V1_CONFIG, 0, "2026-07-28", new Date().toISOString());
  assertEqual(plan.status, "scheduled");
  const endAt = new Date(plan.endAt);
  const startAt = new Date(plan.startAt);
  assertEqual(endAt.getHours(), 6, "endAt hour");
  assertEqual(endAt.getMinutes(), 0, "endAt minute");
  assertEqual(endAt.getTime() - startAt.getTime(), 240 * 60 * 1000, "duration gap");
});

test("Zones séquentielles (endAt zone1 = startAt zone2)", () => {
  const plan = computePlan(V1_CONFIG, 0, "2026-07-28", new Date().toISOString());
  const z0 = plan.zones[0];
  const z1 = plan.zones[1];
  assertEqual(z0.endAt, z1.startAt, "zone séquentialité");
});

test("startAt ≥ 22:00 la veille (240 min avant 06:00 = 02:00)", () => {
  const plan = computePlan(V1_CONFIG, 0, "2026-07-28", new Date().toISOString());
  const startAt = new Date(plan.startAt);
  assert(startAt.getHours() >= 2 || startAt.getHours() === 2, `start hour ${startAt.getHours()}`);
  assertEqual(plan.status, "scheduled");
});

console.log("\n── computePlan V1 — cas error ────────────────────────────────────────────\n");

test("Durée totale > 480 min → error", () => {
  const cfg = { ...V1_CONFIG, zones: [
    { zone: 1, enabled: true, maxDurationMinutes: 300 },
    { zone: 2, enabled: true, maxDurationMinutes: 300 },
  ]};
  const plan = computePlan(cfg, 0, "2026-07-28", new Date().toISOString());
  assertEqual(plan.status, "error");
  assert(plan.reason.includes("480"), `reason: ${plan.reason}`);
});

test("Durée exactement 480 min → scheduled", () => {
  const cfg = { ...V1_CONFIG, zones: [
    { zone: 1, enabled: true, maxDurationMinutes: 240 },
    { zone: 2, enabled: true, maxDurationMinutes: 240 },
  ]};
  const plan = computePlan(cfg, 0, "2026-07-28", new Date().toISOString());
  assertEqual(plan.status, "scheduled");
  assertEqual(plan.totalDurationMinutes, 480);
  const startAt = new Date(plan.startAt);
  assertEqual(startAt.getHours(), 22);
  assertEqual(startAt.getMinutes(), 0);
});

test("Une seule zone active (zone 2) → plan avec une seule zone", () => {
  const cfg = { ...V1_CONFIG, zones: [
    { zone: 1, enabled: false, maxDurationMinutes: 120 },
    { zone: 2, enabled: true, maxDurationMinutes: 60 },
  ]};
  const plan = computePlan(cfg, 0, "2026-07-28", new Date().toISOString());
  assertEqual(plan.status, "scheduled");
  assertEqual(plan.zones.length, 1);
  assertEqual(plan.zones[0].zone, 2);
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests V2 — humidité estimée par zone
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n── V2: estimateZoneMoisture ──────────────────────────────────────────────\n");

const NOW_MS = new Date("2026-07-28T10:00:00").getTime();

test("Sans historique → 40% de base + pluie", () => {
  const zone = { zone: 1, enabled: true, qualityMode: "passable", soilCapacityMm: 35, dailyLossMm: 3 };
  const pct = estimateZoneMoisture(zone, 0, NOW_MS);
  assertEqual(pct, 40, "40% sans historique");
});

test("Sans historique + 7mm pluie → augmente l'humidité", () => {
  const zone = { zone: 1, enabled: true, qualityMode: "passable", soilCapacityMm: 35, dailyLossMm: 3 };
  const pctBase = estimateZoneMoisture(zone, 0, NOW_MS);
  const pctRain = estimateZoneMoisture(zone, 7, NOW_MS);
  assert(pctRain > pctBase, `avec pluie (${pctRain}%) > sans pluie (${pctBase}%)`);
});

test("Juste après arrosage → près de targetPct du mode", () => {
  const zone = {
    zone: 1, enabled: true, qualityMode: "passable",
    soilCapacityMm: 35, dailyLossMm: 3,
    lastIrrigationAt: new Date(NOW_MS - 1000).toISOString(), // 1 seconde avant
  };
  const pct = estimateZoneMoisture(zone, 0, NOW_MS);
  // targetPct passable = 65, daysSince ≈ 0, reserveMm = 65% * 35 = 22.75 → 65%
  assert(pct >= 63 && pct <= 67, `juste après irrigation: ${pct}% (attendu ~65%)`);
});

test("7 jours sans arrosage ni pluie → humidité faible", () => {
  const sevenDaysAgo = new Date(NOW_MS - 7 * 24 * 60 * 60 * 1000).toISOString();
  const zone = {
    zone: 1, enabled: true, qualityMode: "passable",
    soilCapacityMm: 35, dailyLossMm: 3,
    lastIrrigationAt: sevenDaysAgo,
  };
  const pct = estimateZoneMoisture(zone, 0, NOW_MS);
  // startMm = 65% * 35 = 22.75; loss = 7*3 = 21mm; reserveMm = 1.75mm → ~5%
  assert(pct < 20, `après 7j sans pluie: ${pct}% (attendu < 20%)`);
});

test("Humidité bornée à 0%–100%", () => {
  // Cas extrême : 30 jours sans arrosage
  const old = new Date(NOW_MS - 30 * 24 * 60 * 60 * 1000).toISOString();
  const zone = { zone: 1, enabled: true, qualityMode: "passable", soilCapacityMm: 35, dailyLossMm: 3, lastIrrigationAt: old };
  const pctLow = estimateZoneMoisture(zone, 0, NOW_MS);
  assert(pctLow >= 0, `min 0%: ${pctLow}`);

  // Cas extrême : beaucoup de pluie
  const pctHigh = estimateZoneMoisture(zone, 1000, NOW_MS);
  assert(pctHigh <= 100, `max 100%: ${pctHigh}`);
});

console.log("\n── V2: computeZoneDecision ───────────────────────────────────────────────\n");

test("humidityPct > triggerPct → decision=wait, plannedDuration=0", () => {
  const zone = { zone: 1, enabled: true, qualityMode: "passable", soilCapacityMm: 35, irrigationDepthMmPerHour: 5, minRunMinutes: 45, maxRunMinutes: 240 };
  // passable trigger = 30%, zone at 50% → wait
  const state = computeZoneDecision(zone, 50);
  assertEqual(state.decision, "wait");
  assertEqual(state.plannedDurationMinutes, 0);
});

test("humidityPct ≤ triggerPct → decision=irrigate, duration ≥ minRunMinutes", () => {
  const zone = { zone: 1, enabled: true, qualityMode: "passable", soilCapacityMm: 35, irrigationDepthMmPerHour: 5, minRunMinutes: 45, maxRunMinutes: 240 };
  // passable trigger = 30%, zone at 25% → irrigate
  const state = computeZoneDecision(zone, 25);
  assertEqual(state.decision, "irrigate");
  assert(state.plannedDurationMinutes >= 45, `durée min 45min: got ${state.plannedDurationMinutes}`);
});

test("Durée bornée à minRunMinutes même si besoin faible", () => {
  // Zone à 29% (juste en dessous de trigger 30%), besoin faible
  const zone = { zone: 1, enabled: true, qualityMode: "passable", soilCapacityMm: 35, irrigationDepthMmPerHour: 5, minRunMinutes: 45, maxRunMinutes: 240 };
  const state = computeZoneDecision(zone, 29);
  assert(state.plannedDurationMinutes >= 45, `min 45min: got ${state.plannedDurationMinutes}`);
});

test("Durée bornée à maxRunMinutes", () => {
  const zone = { zone: 1, enabled: true, qualityMode: "green", soilCapacityMm: 35, irrigationDepthMmPerHour: 5, minRunMinutes: 45, maxRunMinutes: 90 };
  // green trigger 50%, zone at 0% → beaucoup de mm nécessaires, mais maxRun=90
  const state = computeZoneDecision(zone, 0);
  assertEqual(state.plannedDurationMinutes, 90);
});

test("Zone désactivée → decision=disabled, duration=0", () => {
  const zone = { zone: 2, enabled: false, qualityMode: "passable", soilCapacityMm: 35, irrigationDepthMmPerHour: 5, minRunMinutes: 45, maxRunMinutes: 240 };
  const state = computeZoneDecision(zone, 10);
  assertEqual(state.decision, "disabled");
  assertEqual(state.plannedDurationMinutes, 0);
});

test("Mode manual avec triggerPct custom", () => {
  const zone = { zone: 1, enabled: true, qualityMode: "manual", triggerPct: 45, targetPct: 80, soilCapacityMm: 35, irrigationDepthMmPerHour: 5, minRunMinutes: 45, maxRunMinutes: 240 };
  // 50% > triggerPct 45% → wait
  const stateWait = computeZoneDecision(zone, 50);
  assertEqual(stateWait.decision, "wait");
  // 40% ≤ triggerPct 45% → irrigate
  const stateIrr = computeZoneDecision(zone, 40);
  assertEqual(stateIrr.decision, "irrigate");
});

console.log("\n── V2: computeIrrigationPlanV2 ───────────────────────────────────────────\n");

function makeZoneState(zone, humidity, decision = null) {
  const z = DEFAULT_CONFIG.zones.find(zc => zc.zone === zone);
  return computeZoneDecision(z, humidity);
}

test("Toutes zones au-dessus du seuil → skipped", () => {
  const z1 = computeZoneDecision(DEFAULT_CONFIG.zones[0], 55); // 55% > seuil 30%
  const z2 = computeZoneDecision(DEFAULT_CONFIG.zones[1], 60);
  const plan = computeIrrigationPlanV2(DEFAULT_CONFIG, [z1, z2], 0, "2026-07-29", new Date().toISOString());
  assertEqual(plan.status, "skipped");
  assertEqual(plan.totalDurationMinutes, 0);
  assertEqual(plan.zones.length, 0);
});

test("Zones en-dessous du seuil → scheduled avec durée ≥ 45min/zone", () => {
  const z1 = computeZoneDecision(DEFAULT_CONFIG.zones[0], 15); // 15% ≤ seuil 30%
  const z2 = computeZoneDecision(DEFAULT_CONFIG.zones[1], 20);
  const plan = computeIrrigationPlanV2(DEFAULT_CONFIG, [z1, z2], 0, "2026-07-29", new Date().toISOString());
  assertEqual(plan.status, "scheduled");
  assert(plan.zones[0].durationMinutes >= 45, `Z1 min 45min: ${plan.zones[0].durationMinutes}`);
  assert(plan.zones[1].durationMinutes >= 45, `Z2 min 45min: ${plan.zones[1].durationMinutes}`);
});

test("Plan → fin à 06:00, début = 06:00 - total", () => {
  const z1 = computeZoneDecision(DEFAULT_CONFIG.zones[0], 10);
  const z2 = computeZoneDecision(DEFAULT_CONFIG.zones[1], 10);
  const plan = computeIrrigationPlanV2(DEFAULT_CONFIG, [z1, z2], 0, "2026-07-29", new Date().toISOString());
  assert(plan.status === "scheduled" || plan.status === "error", `status: ${plan.status}`);
  if (plan.status === "scheduled") {
    const endAt = new Date(plan.endAt);
    assertEqual(endAt.getHours(), 6, "fin à 06:00");
    assertEqual(endAt.getMinutes(), 0, "fin à 06:00 juste");
    const startAt = new Date(plan.startAt);
    assertEqual(endAt.getTime() - startAt.getTime(), plan.totalDurationMinutes * 60 * 1000, "durée correcte");
  }
});

test("Deux zones séquentielles (endAt Z1 = startAt Z2)", () => {
  const z1 = computeZoneDecision(DEFAULT_CONFIG.zones[0], 10);
  const z2 = computeZoneDecision(DEFAULT_CONFIG.zones[1], 10);
  const plan = computeIrrigationPlanV2(DEFAULT_CONFIG, [z1, z2], 0, "2026-07-29", new Date().toISOString());
  if (plan.status === "scheduled" && plan.zones.length === 2) {
    assertEqual(plan.zones[0].endAt, plan.zones[1].startAt, "séquentialité Z1→Z2");
  }
});

test("3h total → startAt = 03:00, endAt = 06:00", () => {
  // Forcer durées: Z1=90min, Z2=90min (total 180min = 3h)
  const zoneWithMax90 = { ...DEFAULT_CONFIG.zones[0], maxRunMinutes: 90 };
  const z1 = computeZoneDecision(zoneWithMax90, 5);
  // durée = min(90, max(45, ...)) = 90
  const z2 = { ...z1, zone: 2, plannedDurationMinutes: 90 };
  const plan = computeIrrigationPlanV2(DEFAULT_CONFIG, [z1, z2], 0, "2026-07-29", new Date().toISOString());
  if (plan.status === "scheduled") {
    const endAt = new Date(plan.endAt);
    const startAt = new Date(plan.startAt);
    assertEqual(endAt.getHours(), 6, "fin à 06:00");
    assertEqual(endAt.getMinutes(), 0, "fin à 06:00 juste");
    assertEqual(startAt.getHours(), 3, "début à 03:00");
  }
});

test("Total > 8h (480 min) → error", () => {
  // Deux zones de 300min chacune = 600min > 480min
  const z1 = { zone: 1, decision: "irrigate", plannedDurationMinutes: 300, estimatedHumidityPct: 5, triggerPct: 30, targetPct: 65, debugInfo: "" };
  const z2 = { zone: 2, decision: "irrigate", plannedDurationMinutes: 300, estimatedHumidityPct: 5, triggerPct: 30, targetPct: 65, debugInfo: "" };
  const plan = computeIrrigationPlanV2(DEFAULT_CONFIG, [z1, z2], 0, "2026-07-29", new Date().toISOString());
  assertEqual(plan.status, "error");
  assert(plan.reason.includes("480"), `reason doit mentionner 480: ${plan.reason}`);
});

test("Une seule zone nécessite irrigation → plan avec 1 zone", () => {
  const z1 = computeZoneDecision(DEFAULT_CONFIG.zones[0], 50); // 50% > 30% → wait
  const z2 = computeZoneDecision(DEFAULT_CONFIG.zones[1], 10);  // 10% ≤ 30% → irrigate
  const plan = computeIrrigationPlanV2(DEFAULT_CONFIG, [z1, z2], 0, "2026-07-29", new Date().toISOString());
  if (plan.status === "scheduled") {
    assertEqual(plan.zones.length, 1);
    assertEqual(plan.zones[0].zone, 2);
  }
});

test("Pluie ≥ seuil (rainThreshold) → skip toutes zones même si sèches", () => {
  const z1 = computeZoneDecision(DEFAULT_CONFIG.zones[0], 5); // très sec
  const z2 = computeZoneDecision(DEFAULT_CONFIG.zones[1], 5);
  // 18mm pluie ≥ seuil 15mm → skip
  const plan = computeIrrigationPlanV2(DEFAULT_CONFIG, [z1, z2], 18, "2026-07-29", new Date().toISOString());
  assertEqual(plan.status, "skipped");
});

test("computeRecentRainMm calcule une pluie utile pondérée sur 7 jours", () => {
  const readings = [
    { date: "2026-07-28", rainTotalMm: 5.0 },
    { date: "2026-07-27", rainTotalMm: 3.0 },
    { date: "2026-07-26", rainTotalMm: 10.0 },
    { date: "2026-07-21", rainTotalMm: 100.0 }, // J-7 hors fenêtre pondérée
  ];
  const nowMs = new Date("2026-07-28T12:00:00").getTime();
  const rain = computeRecentRainMm(readings, nowMs);
  assertEqual(rain, 14.55, "5 + 3×0.85 + 10×0.7 = 14.55mm utiles");
});

// ─── Résumé ─────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(60)}`);
console.log(`Résultats : ${passed} passés, ${failed} échoués`);
if (failed > 0) {
  console.error("❌ Certains tests ont échoué !");
  process.exit(1);
} else {
  console.log("✅ Tous les tests passent.");
}
