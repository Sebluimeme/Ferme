#!/usr/bin/env node
/**
 * Test logique pure de la barrière de sécurité arrosage (fail-closed).
 * Usage: node --experimental-strip-types scripts/test-irrigation-safety.mjs
 *
 * Importe directement src/lib/irrigationSafety.ts (pas de miroir dupliqué).
 */

import {
  canStartIrrigation,
  metersToCentimeters,
  DEFAULT_IRRIGATION_GATE_THRESHOLDS,
} from "../src/lib/irrigationSafety.ts";

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

const OK_C1 = { value: 80, freshness: "fresh" };
const OK_C2 = { value: 15, freshness: "fresh" };

console.log("\n── canStartIrrigation: seuil Citerne 2 (10 cm) ──────────────────────────\n");

test("Citerne 2 = 9.99 cm → refusé", () => {
  const r = canStartIrrigation(OK_C1, { value: 9.99, freshness: "fresh" });
  assertEqual(r.allowed, false);
  assert(r.reasons.some((m) => m.includes("Citerne 2")), "reason mentions Citerne 2");
});

test("Citerne 2 = 10 cm exactement → autorisé (égalité)", () => {
  const r = canStartIrrigation(OK_C1, { value: 10, freshness: "fresh" });
  assertEqual(r.allowed, true);
});

test("Citerne 2 = 10.01 cm → autorisé", () => {
  const r = canStartIrrigation(OK_C1, { value: 10.01, freshness: "fresh" });
  assertEqual(r.allowed, true);
});

console.log("\n── canStartIrrigation: seuil Citerne 1 (75 %) ────────────────────────────\n");

test("Citerne 1 = 74.99 % → refusé", () => {
  const r = canStartIrrigation({ value: 74.99, freshness: "fresh" }, OK_C2);
  assertEqual(r.allowed, false);
  assert(r.reasons.some((m) => m.includes("Citerne 1")), "reason mentions Citerne 1");
});

test("Citerne 1 = 75 % exactement → autorisé (égalité)", () => {
  const r = canStartIrrigation({ value: 75, freshness: "fresh" }, OK_C2);
  assertEqual(r.allowed, true);
});

test("Citerne 1 = 75.01 % → autorisé", () => {
  const r = canStartIrrigation({ value: 75.01, freshness: "fresh" }, OK_C2);
  assertEqual(r.allowed, true);
});

console.log("\n── canStartIrrigation: données absentes/invalides/stale/aging ───────────\n");

test("Citerne 1 valeur null → refusé", () => {
  const r = canStartIrrigation({ value: null, freshness: "fresh" }, OK_C2);
  assertEqual(r.allowed, false);
});

test("Citerne 1 freshness unknown → refusé", () => {
  const r = canStartIrrigation({ value: 80, freshness: "unknown" }, OK_C2);
  assertEqual(r.allowed, false);
  assert(r.reasons.some((m) => m.includes("inconnue") || m.includes("absente/inconnue")), "reason mentions unknown data");
});

test("Citerne 2 freshness stale (> 48h) → refusé", () => {
  const r = canStartIrrigation(OK_C1, { value: 15, freshness: "stale" });
  assertEqual(r.allowed, false);
  assert(r.reasons.some((m) => m.includes("obsolète")), "reason mentions stale data");
});

test("Citerne 1 freshness aging (< 48h) mais valeur OK → autorisé avec avertissement", () => {
  const r = canStartIrrigation({ value: 80, freshness: "aging" }, OK_C2);
  assertEqual(r.allowed, true);
  assertEqual(r.reasons.length, 0);
  assert(r.warnings.some((m) => m.includes("vieillissante")), "warning mentions aging data");
});

test("Citerne 2 freshness aging mais valeur sous le seuil → refusé (la valeur prime)", () => {
  const r = canStartIrrigation(OK_C1, { value: 5, freshness: "aging" });
  assertEqual(r.allowed, false);
  assert(r.reasons.some((m) => m.includes("Citerne 2")), "reason mentions Citerne 2");
});

console.log("\n── canStartIrrigation: deux raisons à la fois ────────────────────────────\n");

test("Citerne 1 ET Citerne 2 sous le seuil → deux raisons listées", () => {
  const r = canStartIrrigation({ value: 50, freshness: "fresh" }, { value: 3, freshness: "fresh" });
  assertEqual(r.allowed, false);
  assertEqual(r.reasons.length, 2, "les deux causes doivent apparaître, pas seulement la première");
  assert(r.reasons.some((m) => m.includes("Citerne 1")));
  assert(r.reasons.some((m) => m.includes("Citerne 2")));
});

console.log("\n── canStartIrrigation: seuils personnalisés ──────────────────────────────\n");

test("Seuils personnalisés respectés", () => {
  const thresholds = { citerne1MinPct: 50, citerne2MinCm: 5 };
  const r = canStartIrrigation({ value: 60, freshness: "fresh" }, { value: 6, freshness: "fresh" }, thresholds);
  assertEqual(r.allowed, true);
});

test("Seuils par défaut exportés = 75% / 10cm", () => {
  assertEqual(DEFAULT_IRRIGATION_GATE_THRESHOLDS.citerne1MinPct, 75);
  assertEqual(DEFAULT_IRRIGATION_GATE_THRESHOLDS.citerne2MinCm, 10);
});

console.log("\n── metersToCentimeters ────────────────────────────────────────────────────\n");

test("Convertit mètres en centimètres", () => {
  assertEqual(metersToCentimeters(0.1), 10);
  assertEqual(metersToCentimeters(0.0999), 9.99);
});

test("null → null", () => {
  assertEqual(metersToCentimeters(null), null);
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
