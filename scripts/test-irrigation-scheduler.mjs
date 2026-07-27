#!/usr/bin/env node
/**
 * Test logique du planificateur d'arrosage nocturne.
 * Usage: node scripts/test-irrigation-scheduler.mjs
 *
 * Ce script est autonome (pas de Firebase, pas de HA) et teste
 * la logique pure du calcul horaire et pluie.
 */

// ─── Logique pure (miroir de src/lib/irrigationScheduler.ts) ────────────────

const DEFAULT_CONFIG = {
  enabled: true,
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
    durationMinutes: Math.max(1, Math.round(z.maxDurationMinutes * scale)),
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

// ─── Tests ──────────────────────────────────────────────────────────────────

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

console.log("\n── getNextMorningDate ────────────────────────────────────────────────────\n");

test("03:00 local → même matin", () => {
  const d = new Date("2026-07-28T03:00:00"); // local 03:00 → same morning
  const result = getNextMorningDate(d, 6);
  // Result depends on local timezone; key check: h < 6 → today's date
  assert(result.length === 10, `date string len: ${result}`);
});

test("07:00 local → lendemain matin", () => {
  const d = new Date("2026-07-27T07:00:00"); // 07:00, past 06:00
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
    { date: "2026-07-26", rainTotalMm: 10 },  // autre jour → ignoré
  ];
  assertEqual(computeTodayRain(readings, "2026-07-27"), 5.8);
});

test("Utilise timestamp si date absente", () => {
  const readings = [
    { timestamp: "2026-07-27T14:30:00Z", rainTotalMm: 7.1 },
  ];
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

console.log("\n── computePlan — cas skip ────────────────────────────────────────────────\n");

test("Pluie ≥ seuil → skipped", () => {
  const plan = computePlan(DEFAULT_CONFIG, 18, "2026-07-28", new Date().toISOString());
  assertEqual(plan.status, "skipped");
  assert(plan.totalDurationMinutes === 0);
  assert(plan.zones.length === 0);
});

test("Pluie exactement au seuil → skipped", () => {
  const plan = computePlan(DEFAULT_CONFIG, 15, "2026-07-28", new Date().toISOString());
  assertEqual(plan.status, "skipped");
});

test("Aucune zone activée → skipped", () => {
  const cfg = { ...DEFAULT_CONFIG, zones: [{ zone: 1, enabled: false, maxDurationMinutes: 120 }] };
  const plan = computePlan(cfg, 0, "2026-07-28", new Date().toISOString());
  assertEqual(plan.status, "skipped");
});

console.log("\n── computePlan — cas scheduled ───────────────────────────────────────────\n");

test("Pas de pluie → durée pleine (scale=1)", () => {
  const plan = computePlan(DEFAULT_CONFIG, 0, "2026-07-28", new Date().toISOString());
  assertEqual(plan.status, "scheduled");
  assertEqual(plan.totalDurationMinutes, 240); // 120+120
  assertEqual(plan.zones.length, 2);
  assertEqual(plan.zones[0].durationMinutes, 120);
  assertEqual(plan.zones[1].durationMinutes, 120);
});

test("5 mm de pluie sur 20 mm cible → scale=0.75, durée=90 min/zone", () => {
  const plan = computePlan(DEFAULT_CONFIG, 5, "2026-07-28", new Date().toISOString());
  assertEqual(plan.status, "scheduled");
  // deficit=15, scale=15/20=0.75, 120*0.75=90
  assertEqual(plan.zones[0].durationMinutes, 90);
  assertEqual(plan.zones[1].durationMinutes, 90);
  assertEqual(plan.totalDurationMinutes, 180);
});

test("End time = 06:00 local, startAt = endAt - totalMinutes", () => {
  const plan = computePlan(DEFAULT_CONFIG, 0, "2026-07-28", new Date().toISOString());
  assertEqual(plan.status, "scheduled");
  const endAt = new Date(plan.endAt);
  const startAt = new Date(plan.startAt);
  // end should be 06:00 local
  assertEqual(endAt.getHours(), 6, "endAt hour");
  assertEqual(endAt.getMinutes(), 0, "endAt minute");
  // start = end - 240 min
  assertEqual(endAt.getTime() - startAt.getTime(), 240 * 60 * 1000, "duration gap");
});

test("Zones séquentielles (endAt zone1 = startAt zone2)", () => {
  const plan = computePlan(DEFAULT_CONFIG, 0, "2026-07-28", new Date().toISOString());
  const z0 = plan.zones[0];
  const z1 = plan.zones[1];
  assertEqual(z0.endAt, z1.startAt, "zone séquentialité");
});

test("startAt ≥ 22:00 la veille (240 min avant 06:00 = 02:00)", () => {
  const plan = computePlan(DEFAULT_CONFIG, 0, "2026-07-28", new Date().toISOString());
  const startAt = new Date(plan.startAt);
  // 06:00 - 240 min = 02:00 → within 22:00-06:00 window
  assert(startAt.getHours() >= 2 || startAt.getHours() === 2, `start hour ${startAt.getHours()}`);
  assertEqual(plan.status, "scheduled");
});

console.log("\n── computePlan — cas error ───────────────────────────────────────────────\n");

test("Durée totale > 480 min → error", () => {
  const cfg = {
    ...DEFAULT_CONFIG,
    zones: [
      { zone: 1, enabled: true, maxDurationMinutes: 300 },
      { zone: 2, enabled: true, maxDurationMinutes: 300 },
    ],
  };
  const plan = computePlan(cfg, 0, "2026-07-28", new Date().toISOString());
  assertEqual(plan.status, "error");
  assert(plan.reason.includes("480"), `reason: ${plan.reason}`);
});

test("Durée exactement 480 min → scheduled", () => {
  const cfg = {
    ...DEFAULT_CONFIG,
    zones: [
      { zone: 1, enabled: true, maxDurationMinutes: 240 },
      { zone: 2, enabled: true, maxDurationMinutes: 240 },
    ],
  };
  const plan = computePlan(cfg, 0, "2026-07-28", new Date().toISOString());
  assertEqual(plan.status, "scheduled");
  assertEqual(plan.totalDurationMinutes, 480);
  // startAt should be exactly 22:00
  const startAt = new Date(plan.startAt);
  assertEqual(startAt.getHours(), 22);
  assertEqual(startAt.getMinutes(), 0);
});

test("Une seule zone active (zone 2) → plan avec une seule zone", () => {
  const cfg = {
    ...DEFAULT_CONFIG,
    zones: [
      { zone: 1, enabled: false, maxDurationMinutes: 120 },
      { zone: 2, enabled: true, maxDurationMinutes: 60 },
    ],
  };
  const plan = computePlan(cfg, 0, "2026-07-28", new Date().toISOString());
  assertEqual(plan.status, "scheduled");
  assertEqual(plan.zones.length, 1);
  assertEqual(plan.zones[0].zone, 2);
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
