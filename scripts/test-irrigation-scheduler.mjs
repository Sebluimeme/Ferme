#!/usr/bin/env node
/**
 * Test logique du planificateur d'arrosage nocturne — V2/V3.
 * Usage: npm run test:irrigation
 * (requires node --experimental-strip-types to import the .ts source directly)
 *
 * Ce script est autonome (pas de Firebase, pas de HA) et importe les
 * fonctions PURES réellement utilisées par l'app et le bridge depuis
 * src/lib/irrigationScheduler.ts — pas de copie miroir.
 */

import {
  QUALITY_THRESHOLDS,
  localDateString,
  getNextMorningDate,
  computeTodayRain,
  computeRecentRainMm,
  estimateZoneMoisture,
  computeZoneDecision,
  computeIrrigationPlanV2,
  computeIrrigationPlan,
  buildDailyRainTotals,
  initWaterBalanceState,
  consolidateWaterBalance,
  humidityPctFromBalance,
  canExecutePlan,
  isPlanStale,
  PLAN_FRESH_WINDOW_MS,
  computeManualConfirmationDelayMs,
  estimateLiveHumidityPct,
  computePartialAppliedMm,
  resumeStuckExecutingPlan,
} from "../src/lib/irrigationScheduler.ts";

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

function assertClose(actual, expected, tolerance, label = "") {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ~${expected} (±${tolerance}), got ${actual}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests V1 — conservés (fonctions réellement importées)
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
  const r2 = localDateString(tomorrow);
  assertEqual(r1, r2, "tomorrow date");
});

test("22:00 local → lendemain matin", () => {
  const d = new Date("2026-07-27T22:00:00");
  const r = getNextMorningDate(d, 6);
  const tomorrow = new Date(d.getTime() + 86400000);
  assertEqual(r, localDateString(tomorrow));
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

console.log("\n── computeIrrigationPlan V1 (déprécié, conservé) — cas skip ─────────────\n");

test("Pluie ≥ seuil → skipped", () => {
  const plan = computeIrrigationPlan(V1_CONFIG, 18, "2026-07-28", new Date().toISOString());
  assertEqual(plan.status, "skipped");
  assert(plan.totalDurationMinutes === 0);
  assert(plan.zones.length === 0);
});

test("Aucune zone activée → skipped", () => {
  const cfg = { ...V1_CONFIG, zones: [{ zone: 1, enabled: false, maxDurationMinutes: 120 }] };
  const plan = computeIrrigationPlan(cfg, 0, "2026-07-28", new Date().toISOString());
  assertEqual(plan.status, "skipped");
});

test("Pas de pluie → durée pleine (scale=1)", () => {
  const plan = computeIrrigationPlan(V1_CONFIG, 0, "2026-07-28", new Date().toISOString());
  assertEqual(plan.status, "scheduled");
  assertEqual(plan.totalDurationMinutes, 240);
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests V2 — humidité estimée (legacy, dépréciée) & décision de zone
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n── V2: estimateZoneMoisture (déprécié) ───────────────────────────────────\n");

const NOW_MS = new Date("2026-07-28T10:00:00").getTime();

test("Sans historique → 40% de base + pluie", () => {
  const zone = { zone: 1, enabled: true, qualityMode: "passable", soilCapacityMm: 35, dailyLossMm: 3 };
  const pct = estimateZoneMoisture(zone, 0, NOW_MS);
  assertEqual(pct, 40, "40% sans historique");
});

console.log("\n── V2: computeZoneDecision ───────────────────────────────────────────────\n");

test("humidityPct > triggerPct → decision=wait, plannedDuration=0", () => {
  const zone = { zone: 1, enabled: true, qualityMode: "passable", soilCapacityMm: 35, irrigationDepthMmPerHour: 5, minRunMinutes: 45, maxRunMinutes: 240 };
  const state = computeZoneDecision(zone, 50);
  assertEqual(state.decision, "wait");
  assertEqual(state.plannedDurationMinutes, 0);
});

test("humidityPct ≤ triggerPct → decision=irrigate, duration ≥ minRunMinutes", () => {
  const zone = { zone: 1, enabled: true, qualityMode: "passable", soilCapacityMm: 35, irrigationDepthMmPerHour: 5, minRunMinutes: 45, maxRunMinutes: 240 };
  const state = computeZoneDecision(zone, 25);
  assertEqual(state.decision, "irrigate");
  assert(state.plannedDurationMinutes >= 45, `durée min 45min: got ${state.plannedDurationMinutes}`);
});

test("Zone désactivée → decision=disabled, duration=0", () => {
  const zone = { zone: 2, enabled: false, qualityMode: "passable", soilCapacityMm: 35, irrigationDepthMmPerHour: 5, minRunMinutes: 45, maxRunMinutes: 240 };
  const state = computeZoneDecision(zone, 10);
  assertEqual(state.decision, "disabled");
  assertEqual(state.plannedDurationMinutes, 0);
});

console.log("\n── V2: computeIrrigationPlanV2 (mode requis) ─────────────────────────────\n");

test("Toutes zones au-dessus du seuil → skipped", () => {
  const z1 = computeZoneDecision(DEFAULT_CONFIG.zones[0], 55);
  const z2 = computeZoneDecision(DEFAULT_CONFIG.zones[1], 60);
  const plan = computeIrrigationPlanV2(DEFAULT_CONFIG, [z1, z2], 0, "2026-07-29", new Date().toISOString(), "executable");
  assertEqual(plan.status, "skipped");
  assertEqual(plan.mode, "executable");
});

test("Zones en-dessous du seuil → scheduled avec durée ≥ 45min/zone", () => {
  const z1 = computeZoneDecision(DEFAULT_CONFIG.zones[0], 15);
  const z2 = computeZoneDecision(DEFAULT_CONFIG.zones[1], 20);
  const plan = computeIrrigationPlanV2(DEFAULT_CONFIG, [z1, z2], 0, "2026-07-29", new Date().toISOString(), "advisory");
  assertEqual(plan.status, "scheduled");
  assertEqual(plan.mode, "advisory");
  assert(plan.zones[0].durationMinutes >= 45, `Z1 min 45min: ${plan.zones[0].durationMinutes}`);
});

test("Total > 8h (480 min) → error", () => {
  const z1 = { zone: 1, decision: "irrigate", plannedDurationMinutes: 300, estimatedHumidityPct: 5, triggerPct: 30, targetPct: 65, debugInfo: "" };
  const z2 = { zone: 2, decision: "irrigate", plannedDurationMinutes: 300, estimatedHumidityPct: 5, triggerPct: 30, targetPct: 65, debugInfo: "" };
  const plan = computeIrrigationPlanV2(DEFAULT_CONFIG, [z1, z2], 0, "2026-07-29", new Date().toISOString(), "executable");
  assertEqual(plan.status, "error");
  assert(plan.reason.includes("8h"), `reason doit mentionner 8h: ${plan.reason}`);
});

test("computeRecentRainMm calcule une pluie utile pondérée sur 7 jours", () => {
  const readings = [
    { date: "2026-07-28", rainTotalMm: 5.0 },
    { date: "2026-07-27", rainTotalMm: 3.0 },
    { date: "2026-07-26", rainTotalMm: 10.0 },
    { date: "2026-07-21", rainTotalMm: 100.0 },
  ];
  const nowMs = new Date("2026-07-28T12:00:00").getTime();
  const rain = computeRecentRainMm(readings, nowMs);
  assertEqual(rain, 14.55, "5 + 3×0.85 + 10×0.7 = 14.55mm utiles");
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests V3 — bilan hydrique (water balance) : requêtes FERME-EAU-002
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n── V3: buildDailyRainTotals ──────────────────────────────────────────────\n");

test("Construit une map date → max du jour", () => {
  const totals = buildDailyRainTotals([
    { date: "2026-07-28", rainTotalMm: 3.2 },
    { date: "2026-07-28", rainTotalMm: 5.8 },
    { date: "2026-07-27", rainTotalMm: 1.0 },
  ]);
  assertEqual(totals["2026-07-28"], 5.8);
  assertEqual(totals["2026-07-27"], 1.0);
});

console.log("\n── V3: initWaterBalanceState (migration prudente) ────────────────────────\n");

test("Sans seedPct connu → 40% par défaut, seeded=true", () => {
  const s = initWaterBalanceState({ zone: 1, capacityMm: 35, seedPct: null, nowIso: "2026-07-28T20:00:00", knownRainByDate: {} });
  assertClose(s.reserveMm, 14, 0.01, "40% de 35mm = 14mm");
  assertEqual(s.seeded, true);
});

test("Avec seedPct connu (dernier plan/estimation) → utilisé tel quel", () => {
  const s = initWaterBalanceState({ zone: 1, capacityMm: 35, seedPct: 65, nowIso: "2026-07-28T20:00:00", knownRainByDate: {} });
  assertClose(s.reserveMm, 22.75, 0.01, "65% de 35mm = 22.75mm");
});

test("Marque les totaux pluie connus comme déjà comptés (pas de replay 7j)", () => {
  const knownRain = { "2026-07-28": 5, "2026-07-27": 3 };
  const s = initWaterBalanceState({ zone: 1, capacityMm: 35, seedPct: 50, nowIso: "2026-07-28T20:00:00", knownRainByDate: knownRain });
  assertEqual(s.countedRainByDate["2026-07-28"], 5);
  assertEqual(s.countedRainByDate["2026-07-27"], 3);
  // Rejouer consolidateWaterBalance avec les mêmes totaux ne doit rien ajouter.
  const after = consolidateWaterBalance({ state: s, capacityMm: 35, dailyLossMm: 0, rainByDate: knownRain, events: [], nowIso: "2026-07-28T20:00:00" });
  assertEqual(after.reserveMm, s.reserveMm, "pas de replay de la pluie déjà connue au moment du seed");
});

console.log("\n── V3: consolidateWaterBalance ───────────────────────────────────────────\n");

test("Pluie seule → delta positif idempotent (rejouer n'ajoute rien)", () => {
  const seed = initWaterBalanceState({ zone: 1, capacityMm: 35, seedPct: 40, nowIso: "2026-07-28T20:00:00", knownRainByDate: {} });
  const rainByDate = { "2026-07-28": 5 };
  const once = consolidateWaterBalance({ state: seed, capacityMm: 35, dailyLossMm: 0, rainByDate, events: [], nowIso: "2026-07-28T22:00:00" });
  assertClose(once.reserveMm, 19, 0.01, "14 + 5mm de pluie");
  const twice = consolidateWaterBalance({ state: once, capacityMm: 35, dailyLossMm: 0, rainByDate, events: [], nowIso: "2026-07-28T23:00:00" });
  assertEqual(twice.reserveMm, once.reserveMm, "même pluie déjà comptée → aucun changement de réserve");
});

test("Arrosage 1mm vs 10mm → écart de 9mm avant saturation", () => {
  const seed = initWaterBalanceState({ zone: 1, capacityMm: 35, seedPct: 30, nowIso: "2026-07-28T20:00:00", knownRainByDate: {} });
  const s1mm = consolidateWaterBalance({
    state: seed, capacityMm: 35, dailyLossMm: 0, rainByDate: {},
    events: [{ id: "e-1mm", zone: 1, appliedMm: 1, at: "2026-07-28T21:00:00", source: "manual", confirmed: true }],
    nowIso: "2026-07-28T21:00:00",
  });
  const s10mm = consolidateWaterBalance({
    state: seed, capacityMm: 35, dailyLossMm: 0, rainByDate: {},
    events: [{ id: "e-10mm", zone: 1, appliedMm: 10, at: "2026-07-28T21:00:00", source: "manual", confirmed: true }],
    nowIso: "2026-07-28T21:00:00",
  });
  assertClose(s10mm.reserveMm - s1mm.reserveMm, 9, 0.01, "10mm - 1mm = 9mm d'écart");
});

test("Pluie + arrosage la même nuit → les deux s'appliquent, aucun écrasement", () => {
  const seed = initWaterBalanceState({ zone: 1, capacityMm: 35, seedPct: null, nowIso: "2026-07-29T20:00:00", knownRainByDate: {} });
  const result = consolidateWaterBalance({
    state: seed, capacityMm: 35, dailyLossMm: 0,
    rainByDate: { "2026-07-29": 5 },
    events: [{ id: "auto-2026-07-30-zone1", zone: 1, appliedMm: 8, at: "2026-07-30T02:00:00", source: "auto", confirmed: true }],
    nowIso: "2026-07-30T04:00:00",
  });
  // seed 40% de 35 = 14mm, + 5mm pluie + 8mm arrosage = 27mm (sous 35mm, pas de saturation)
  assertClose(result.reserveMm, 27, 0.01, "14 + 5 + 8 = 27mm");
  assertEqual(result.countedRainByDate["2026-07-29"], 5, "pluie comptée");
  assertEqual(result.appliedEventIds["auto-2026-07-30-zone1"], true, "arrosage appliqué");
});

test("Apports multiples sur plusieurs cycles → cumul correct", () => {
  let state = initWaterBalanceState({ zone: 1, capacityMm: 50, seedPct: 20, nowIso: "2026-07-01T20:00:00", knownRainByDate: {} });
  // cycle 1 : pluie jour 1
  state = consolidateWaterBalance({ state, capacityMm: 50, dailyLossMm: 0, rainByDate: { "2026-07-01": 3 }, events: [], nowIso: "2026-07-02T06:00:00" });
  // cycle 2 : arrosage auto + pluie jour 2
  state = consolidateWaterBalance({
    state, capacityMm: 50, dailyLossMm: 0,
    rainByDate: { "2026-07-01": 3, "2026-07-02": 2 },
    events: [{ id: "auto-2026-07-03-zone1", zone: 1, appliedMm: 6, at: "2026-07-03T02:00:00", source: "auto", confirmed: true }],
    nowIso: "2026-07-03T06:00:00",
  });
  // cycle 3 : arrosage manuel
  state = consolidateWaterBalance({
    state, capacityMm: 50, dailyLossMm: 0,
    rainByDate: { "2026-07-01": 3, "2026-07-02": 2 },
    events: [
      { id: "auto-2026-07-03-zone1", zone: 1, appliedMm: 6, at: "2026-07-03T02:00:00", source: "auto", confirmed: true },
      { id: "manual-cmd-42", zone: 1, appliedMm: 4, at: "2026-07-03T15:00:00", source: "manual", confirmed: true },
    ],
    nowIso: "2026-07-03T16:00:00",
  });
  // seed 10 (20% de 50) + 3 + 2 + 6 + 4 = 25mm
  assertClose(state.reserveMm, 25, 0.01, "cumul de 4 apports sur 3 cycles");
  assertEqual(Object.keys(state.appliedEventIds).length, 2, "2 événements appliqués, sans doublon");
});

test("Bornes 0..capacity respectées à chaque apport", () => {
  const seed = initWaterBalanceState({ zone: 1, capacityMm: 35, seedPct: 90, nowIso: "2026-07-28T20:00:00", knownRainByDate: {} });
  const saturated = consolidateWaterBalance({
    state: seed, capacityMm: 35, dailyLossMm: 0, rainByDate: {},
    events: [{ id: "e-big", zone: 1, appliedMm: 1000, at: "2026-07-28T21:00:00", source: "manual", confirmed: true }],
    nowIso: "2026-07-28T21:00:00",
  });
  assert(saturated.reserveMm <= 35, `borné à capacityMm: ${saturated.reserveMm}`);

  const drained = consolidateWaterBalance({
    state: seed, capacityMm: 35, dailyLossMm: 1000, rainByDate: {}, events: [],
    nowIso: "2026-07-29T20:00:00",
  });
  assert(drained.reserveMm >= 0, `borné à 0: ${drained.reserveMm}`);
});

test("Replay no-op : rejouer avec le même nowIso et les mêmes entrées ne change rien", () => {
  const seed = initWaterBalanceState({ zone: 1, capacityMm: 35, seedPct: 40, nowIso: "2026-07-28T20:00:00", knownRainByDate: {} });
  const rainByDate = { "2026-07-28": 5 };
  const events = [{ id: "e1", zone: 1, appliedMm: 3, at: "2026-07-28T21:00:00", source: "manual", confirmed: true }];
  const once = consolidateWaterBalance({ state: seed, capacityMm: 35, dailyLossMm: 3, rainByDate, events, nowIso: "2026-07-28T22:00:00" });
  const replay = consolidateWaterBalance({ state: once, capacityMm: 35, dailyLossMm: 3, rainByDate, events, nowIso: "2026-07-28T22:00:00" });
  assertEqual(replay.reserveMm, once.reserveMm, "replay strictement no-op (même nowIso)");
});

test("Arrosage non confirmé → ignoré (aucun effet sur la réserve ni le ledger)", () => {
  const seed = initWaterBalanceState({ zone: 1, capacityMm: 35, seedPct: 40, nowIso: "2026-07-28T20:00:00", knownRainByDate: {} });
  const result = consolidateWaterBalance({
    state: seed, capacityMm: 35, dailyLossMm: 0, rainByDate: {},
    events: [{ id: "e-unconfirmed", zone: 1, appliedMm: 20, at: "2026-07-28T21:00:00", source: "manual", confirmed: false }],
    nowIso: "2026-07-28T21:00:00",
  });
  assertEqual(result.reserveMm, seed.reserveMm, "réserve inchangée");
  assertEqual(result.appliedEventIds["e-unconfirmed"], undefined, "événement non confirmé absent du ledger");
});

console.log("\n── V3: humidityPctFromBalance ────────────────────────────────────────────\n");

test("Convertit reserveMm/capacityMm en %", () => {
  const s = { zone: 1, reserveMm: 17.5, capacityMm: 35, updatedAt: "", countedRainByDate: {}, appliedEventIds: {}, seeded: false };
  assertEqual(humidityPctFromBalance(s), 50);
});

console.log("\n── V3: séparation analyse/exécution ──────────────────────────────────────\n");

test("Auto OFF → analyse produit un plan (humidité visible) mais aucune exécution possible", () => {
  const zone = DEFAULT_CONFIG.zones[0];
  const balance = consolidateWaterBalance({
    state: initWaterBalanceState({ zone: 1, capacityMm: 35, seedPct: 10, nowIso: "2026-07-28T20:00:00", knownRainByDate: {} }),
    capacityMm: 35, dailyLossMm: 0, rainByDate: {}, events: [], nowIso: "2026-07-29T20:00:00",
  });
  const humidity = humidityPctFromBalance(balance);
  const zoneState = computeZoneDecision(zone, humidity);
  const offConfig = { ...DEFAULT_CONFIG, enabled: false };
  const plan = computeIrrigationPlanV2(offConfig, [zoneState], 0, "2026-07-30", "2026-07-29T20:00:00", "advisory");
  assert(plan.zoneStates.length === 1, "humidité/décision toujours présente");
  assertEqual(plan.mode, "advisory");
  const gate = canExecutePlan(offConfig, plan);
  assertEqual(gate.allowed, false, "exécution interdite en mode conseil/off");
});

test("Auto ON avec la même humidité → même décision, exécution autorisée si scheduled", () => {
  const zone = DEFAULT_CONFIG.zones[1];
  const balance = consolidateWaterBalance({
    state: initWaterBalanceState({ zone: 2, capacityMm: 35, seedPct: 10, nowIso: "2026-07-28T20:00:00", knownRainByDate: {} }),
    capacityMm: 35, dailyLossMm: 0, rainByDate: {}, events: [], nowIso: "2026-07-29T20:00:00",
  });
  const humidity = humidityPctFromBalance(balance);

  const offConfig = { ...DEFAULT_CONFIG, enabled: false };
  const onConfig = { ...DEFAULT_CONFIG, enabled: true };
  const zoneStateOff = computeZoneDecision(zone, humidity);
  const zoneStateOn = computeZoneDecision(zone, humidity);
  assertEqual(zoneStateOff.estimatedHumidityPct, zoneStateOn.estimatedHumidityPct, "humidité identique, indépendante de enabled");
  assertEqual(zoneStateOff.decision, zoneStateOn.decision, "décision identique, indépendante de enabled");

  const planOff = computeIrrigationPlanV2(offConfig, [zoneStateOff], 0, "2026-07-30", "2026-07-29T20:00:00", "advisory");
  const planOn = computeIrrigationPlanV2(onConfig, [zoneStateOn], 0, "2026-07-30", "2026-07-29T20:00:00", "executable");
  assertEqual(planOff.status, planOn.status, "même statut de plan, humidité identique");
  assertEqual(canExecutePlan(offConfig, planOff).allowed, false);
  if (planOn.status === "scheduled") {
    assertEqual(canExecutePlan(onConfig, planOn).allowed, true);
  }
});

test("canExecutePlan : défense contre un plan advisory même si enabled=true (état incohérent)", () => {
  const advisoryPlan = { status: "scheduled", mode: "advisory" };
  assertEqual(canExecutePlan({ enabled: true }, advisoryPlan).allowed, false, "mode conseil bloque même avec enabled=true");
});

test("canExecutePlan : absence de plan → non exécutable", () => {
  assertEqual(canExecutePlan({ enabled: true }, null).allowed, false);
  assertEqual(canExecutePlan({ enabled: true }, undefined).allowed, false);
});

test("OFF→ON : le bilan hydrique (réserve) n'est jamais affecté par enabled — seule l'exécutabilité change", () => {
  const state = { zone: 1, reserveMm: 12.3, capacityMm: 35, updatedAt: "2026-07-29T20:00:00", countedRainByDate: {}, appliedEventIds: {}, seeded: false };
  const consolidatedOff = consolidateWaterBalance({ state, capacityMm: 35, dailyLossMm: 3, rainByDate: {}, events: [], nowIso: "2026-07-30T08:00:00" });
  const consolidatedOn = consolidateWaterBalance({ state, capacityMm: 35, dailyLossMm: 3, rainByDate: {}, events: [], nowIso: "2026-07-30T08:00:00" });
  assertEqual(consolidatedOff.reserveMm, consolidatedOn.reserveMm, "la réserve ne dépend d'aucun paramètre 'enabled'");
});

console.log("\n── V3: isPlanStale / fraîcheur ────────────────────────────────────────────\n");

test("Plan récent (< fenêtre fraîcheur) → non périmé", () => {
  const createdAt = "2026-07-29T20:00:00Z";
  const nowMs = new Date(createdAt).getTime() + PLAN_FRESH_WINDOW_MS - 1000;
  assertEqual(isPlanStale(createdAt, nowMs), false);
});

test("Plan ancien (> fenêtre fraîcheur) → périmé", () => {
  const createdAt = "2026-07-29T20:00:00Z";
  const nowMs = new Date(createdAt).getTime() + PLAN_FRESH_WINDOW_MS + 1000;
  assertEqual(isPlanStale(createdAt, nowMs), true);
});

test("Pas de createdAt → considéré périmé par prudence", () => {
  assertEqual(isPlanStale(undefined, Date.now()), true);
});

console.log("\n── V3: computeManualConfirmationDelayMs / reprise après redémarrage ────────\n");

test("Confirmation encore à venir → délai positif exact", () => {
  const nowMs = new Date("2026-07-29T21:00:00Z").getTime();
  const expectedConfirmAt = "2026-07-29T21:30:00Z";
  assertEqual(computeManualConfirmationDelayMs(expectedConfirmAt, nowMs), 30 * 60 * 1000, "30 min restantes");
});

test("Bridge redémarré après la fin de l'arrosage → délai nul (confirmation immédiate)", () => {
  const nowMs = new Date("2026-07-29T22:00:00Z").getTime();
  const expectedConfirmAt = "2026-07-29T21:30:00Z"; // dans le passé : arrosage déjà terminé pendant l'arrêt du bridge
  assertEqual(computeManualConfirmationDelayMs(expectedConfirmAt, nowMs), 0, "jamais négatif — confirmation immédiate, pas de setTimeout négatif");
});

test("Bridge redémarré pile à l'heure de fin prévue → délai nul", () => {
  const at = "2026-07-29T21:30:00Z";
  assertEqual(computeManualConfirmationDelayMs(at, new Date(at).getTime()), 0);
});

console.log("\n── V3.1: estimateLiveHumidityPct (estimation pendant l'arrosage) ────────────\n");

test("Aucun temps écoulé → pas de projection, pct = état confirmé", () => {
  const confirmedState = { reserveMm: 14, capacityMm: 35 }; // 40%
  const r = estimateLiveHumidityPct({
    confirmedState, mmPerHour: 5, startedAtIso: "2026-07-29T22:00:00",
    plannedDurationMinutes: 60, nowMs: new Date("2026-07-29T22:00:00").getTime(),
  });
  assertEqual(r.pct, 40);
  assertEqual(r.projectedMm, 0);
});

test("Moitié du cycle écoulée → moitié de l'apport projeté (ne touche jamais le ledger confirmé)", () => {
  const confirmedState = { reserveMm: 14, capacityMm: 35 }; // 40%
  const r = estimateLiveHumidityPct({
    confirmedState, mmPerHour: 5, startedAtIso: "2026-07-29T22:00:00",
    plannedDurationMinutes: 60, nowMs: new Date("2026-07-29T22:30:00").getTime(),
  });
  assertClose(r.projectedMm, 2.5, 0.01, "30min à 5mm/h = 2.5mm");
  assert(r.pct > 40, `pct doit progresser visiblement: ${r.pct}`);
});

test("Temps écoulé au-delà de la durée prévue → plafonné à la durée planifiée", () => {
  const confirmedState = { reserveMm: 14, capacityMm: 35 };
  const r = estimateLiveHumidityPct({
    confirmedState, mmPerHour: 5, startedAtIso: "2026-07-29T22:00:00",
    plannedDurationMinutes: 60, nowMs: new Date("2026-07-29T23:30:00").getTime(),
  });
  assertClose(r.projectedMm, 5 * (60 / 60), 0.01, "plafonné à 60min");
});

test("Projection bornée à capacityMm (jamais > 100%)", () => {
  const confirmedState = { reserveMm: 34, capacityMm: 35 };
  const r = estimateLiveHumidityPct({
    confirmedState, mmPerHour: 20, startedAtIso: "2026-07-29T22:00:00",
    plannedDurationMinutes: 240, nowMs: new Date("2026-07-30T00:00:00").getTime(),
  });
  assert(r.pct <= 100, `pct borné: ${r.pct}`);
});

console.log("\n── V3.1: computePartialAppliedMm (stop_all — crédit partiel) ────────────────\n");

test("Arrêté à mi-cycle → crédite seulement la moitié, jamais le plein tarif", () => {
  const mm = computePartialAppliedMm({
    mmPerHour: 5, startedAtIso: "2026-07-29T22:00:00", stoppedAtIso: "2026-07-29T22:30:00",
    plannedDurationMinutes: 60,
  });
  assertClose(mm, 2.5, 0.01, "30min à 5mm/h = 2.5mm, pas 5mm");
});

test("Arrêté immédiatement (0s écoulée) → 0mm crédité", () => {
  const mm = computePartialAppliedMm({
    mmPerHour: 5, startedAtIso: "2026-07-29T22:00:00", stoppedAtIso: "2026-07-29T22:00:00",
    plannedDurationMinutes: 60,
  });
  assertEqual(mm, 0);
});

test("Arrêté après la fin prévue → plafonné à la durée planifiée, jamais plus", () => {
  const mm = computePartialAppliedMm({
    mmPerHour: 5, startedAtIso: "2026-07-29T22:00:00", stoppedAtIso: "2026-07-29T23:30:00",
    plannedDurationMinutes: 60,
  });
  assertClose(mm, 5, 0.01, "plafonné à 60min = 5mm");
});

console.log("\n── V3.1: resumeStuckExecutingPlan (reprise après crash) ─────────────────────\n");

test("Plan bloqué en executing → sortie sûre en erreur motivée", () => {
  const r = resumeStuckExecutingPlan("2026-07-30T03:00:00Z");
  assertEqual(r.status, "error");
  assert(r.reason.length > 0, "raison non vide");
  assertEqual(r.errorAt, "2026-07-30T03:00:00Z");
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
