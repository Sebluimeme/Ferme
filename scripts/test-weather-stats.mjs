#!/usr/bin/env node
/**
 * Test logique des statistiques météo — distinction "0 mm mesuré" vs "aucune
 * donnée". Usage: npm run test:weather
 * (requires node --experimental-strip-types to import the .ts source directly)
 *
 * Ce script est autonome (pas de Firebase, pas de réseau) et importe les
 * fonctions PURES réellement utilisées par l'app depuis src/types/weather.ts
 * — pas de copie miroir.
 *
 * Contexte (carte t_3ea79289) : l'app affichait "0 mm" quand aucun relevé
 * n'avait été collecté, confondant "pas de pluie" avec "pas de mesure". Ces
 * tests couvrent les DEUX cas séparément pour ne jamais régresser :
 * - une vraie mesure à zéro doit continuer d'afficher 0 mm ;
 * - une absence de relevé ne doit jamais afficher 0 mm (valeur null → "—").
 */

import {
  computeWeatherStats,
  aggregateWeatherByDay,
  formatWeatherValue,
} from "../src/types/weather.ts";

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

function reading(overrides = {}) {
  return {
    id: overrides.id ?? "STATION_TEST",
    stationId: "STATION_TEST",
    timestamp: overrides.timestamp ?? "2026-08-24T10:00:00.000Z",
    date: overrides.date ?? "2026-08-24",
    temperatureC: 18,
    humidityPct: 60,
    dewPointC: 10,
    heatIndexC: null,
    windChillC: null,
    windSpeedKmh: 5,
    windGustKmh: 8,
    windDirectionDeg: 180,
    pressureHpa: 1015,
    rainRateMmH: 0,
    rainTotalMm: overrides.rainTotalMm,
    solarRadiationWm2: null,
    uvIndex: null,
    source: "weather-underground",
    ...overrides,
  };
}

console.log("\n── computeWeatherStats — pluie: 0 mm réel vs aucune donnée ────────────────\n");

test("Aucun relevé du tout → rainTodayMm est null (jamais 0)", () => {
  const now = new Date("2026-08-24T12:00:00.000Z");
  const stats = computeWeatherStats([], now);
  assertEqual(stats.rainTodayMm, null, "rainTodayMm");
  assertEqual(stats.rain7DaysMm, null, "rain7DaysMm");
  assertEqual(formatWeatherValue(stats.rainTodayMm, "mm"), "—", "affichage");
});

test("Relevés présents mais rainTotalMm absent (null) → toujours pas de 0 mm inventé", () => {
  const now = new Date("2026-08-24T12:00:00.000Z");
  const readings = [
    reading({ id: "a", timestamp: "2026-08-24T08:00:00.000Z", date: "2026-08-24", rainTotalMm: null }),
    reading({ id: "b", timestamp: "2026-08-24T09:00:00.000Z", date: "2026-08-24", rainTotalMm: null }),
  ];
  const stats = computeWeatherStats(readings, now);
  assertEqual(stats.rainTodayMm, null, "rainTodayMm avec relevés non-pluie");
  assertEqual(formatWeatherValue(stats.rainTodayMm, "mm"), "—", "affichage");
});

test("Relevé réel à 0 mm → reste bien 0 mm affiché, pas '—'", () => {
  const now = new Date("2026-08-24T12:00:00.000Z");
  const readings = [
    reading({ id: "a", timestamp: "2026-08-24T08:00:00.000Z", date: "2026-08-24", rainTotalMm: 0 }),
  ];
  const stats = computeWeatherStats(readings, now);
  assertEqual(stats.rainTodayMm, 0, "rainTodayMm mesuré à 0");
  assertEqual(formatWeatherValue(stats.rainTodayMm, "mm"), "0 mm", "affichage");
});

test("Relevé réel avec pluie mesurée → somme correcte, distincte de 0/null", () => {
  const now = new Date("2026-08-24T12:00:00.000Z");
  const readings = [
    reading({ id: "a", timestamp: "2026-08-24T08:00:00.000Z", date: "2026-08-24", rainTotalMm: 1.4 }),
    reading({ id: "b", timestamp: "2026-08-24T11:00:00.000Z", date: "2026-08-24", rainTotalMm: 3.2 }),
  ];
  const stats = computeWeatherStats(readings, now);
  // max par jour (compteur cumulatif de la station), pas une somme des relevés.
  assertEqual(stats.rainTodayMm, 3.2, "rainTodayMm cumul du jour");
});

console.log("\n── aggregateWeatherByDay — même distinction, par jour ─────────────────────\n");

test("Jour sans relevé de pluie exploitable → rainMm null, pas 0", () => {
  const readings = [
    reading({ id: "a", timestamp: "2026-08-24T08:00:00.000Z", date: "2026-08-24", rainTotalMm: null }),
  ];
  const daily = aggregateWeatherByDay(readings);
  assertEqual(daily.length, 1, "un seul jour agrégé");
  assertEqual(daily[0].rainMm, null, "rainMm du jour");
});

test("Jour avec une vraie mesure à 0 mm → rainMm reste 0", () => {
  const readings = [
    reading({ id: "a", timestamp: "2026-08-24T08:00:00.000Z", date: "2026-08-24", rainTotalMm: 0 }),
  ];
  const daily = aggregateWeatherByDay(readings);
  assertEqual(daily[0].rainMm, 0, "rainMm du jour mesuré à 0");
});

console.log("\n── dryDays — ne doit jamais compter un jour sans donnée comme sec ─────────\n");

test("Un jour sans relevé de pluie interrompt la série de jours secs (ne la prolonge pas en silence)", () => {
  const now = new Date("2026-08-24T12:00:00.000Z");
  const readings = [
    // Hier : relevé sans donnée de pluie exploitable → jour inconnu.
    reading({ id: "y", timestamp: "2026-08-23T10:00:00.000Z", date: "2026-08-23", rainTotalMm: null }),
    // Aujourd'hui : vraie mesure sèche.
    reading({ id: "t", timestamp: "2026-08-24T10:00:00.000Z", date: "2026-08-24", rainTotalMm: 0 }),
  ];
  const stats = computeWeatherStats(readings, now);
  // Aujourd'hui compte (mesuré sec), hier ne compte pas (inconnu) → 1, pas 2.
  assertEqual(stats.dryDays, 1, "dryDays");
});

test("Des jours réellement mesurés secs à la suite s'accumulent normalement", () => {
  const now = new Date("2026-08-24T12:00:00.000Z");
  const readings = [
    reading({ id: "a", timestamp: "2026-08-22T10:00:00.000Z", date: "2026-08-22", rainTotalMm: 0 }),
    reading({ id: "b", timestamp: "2026-08-23T10:00:00.000Z", date: "2026-08-23", rainTotalMm: 0 }),
    reading({ id: "c", timestamp: "2026-08-24T10:00:00.000Z", date: "2026-08-24", rainTotalMm: 0 }),
  ];
  const stats = computeWeatherStats(readings, now);
  assertEqual(stats.dryDays, 3, "dryDays");
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
