#!/usr/bin/env node
/**
 * Test logique pure de normalisation Citerne 1 / Citerne 2 eau potable (HA/MQTT).
 * Usage: node --experimental-strip-types scripts/test-citerne-eau.mjs
 *
 * Importe directement src/lib/citerneEau.ts (pas de miroir dupliqué).
 */

import {
  getCiterneEntityIds,
  parseHaNumber,
  clampPct,
  classifyFreshness,
  normalizeCiterneStatus,
  normalizeCiternePayload,
  getBatteryAlert,
  formatRelativeAge,
} from "../src/lib/citerneEau.ts";

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

function haEntity(state, opts = {}) {
  return {
    entity_id: opts.entity_id ?? "sensor.test",
    state: String(state),
    attributes: opts.attributes,
    last_changed: opts.last_changed,
    last_updated: opts.last_updated,
  };
}

const CITERNE_1_ENTITY_IDS = getCiterneEntityIds(1);
const CITERNE_2_ENTITY_IDS = getCiterneEntityIds(2);

// ─────────────────────────────────────────────────────────────────────────────

console.log("\n── parseHaNumber ─────────────────────────────────────────────────────────\n");

test("Parse un nombre décimal", () => {
  assertEqual(parseHaNumber("89.3"), 89.3);
});

test("Parse un entier", () => {
  assertEqual(parseHaNumber("39466"), 39466);
});

test("Parse un nombre négatif", () => {
  assertEqual(parseHaNumber("-62"), -62);
});

test('"unavailable" → null', () => {
  assertEqual(parseHaNumber("unavailable"), null);
});

test('"unknown" → null', () => {
  assertEqual(parseHaNumber("unknown"), null);
});

test("chaîne vide → null", () => {
  assertEqual(parseHaNumber(""), null);
});

test("null/undefined → null", () => {
  assertEqual(parseHaNumber(null), null);
  assertEqual(parseHaNumber(undefined), null);
});

test("texte non numérique → null", () => {
  assertEqual(parseHaNumber("erreur_capteur"), null);
});

console.log("\n── clampPct ──────────────────────────────────────────────────────────────\n");

test("Valeur dans la plage → inchangée", () => {
  assertEqual(clampPct(50), 50);
});

test("Valeur > 100 → clampée à 100", () => {
  assertEqual(clampPct(142), 100);
});

test("Valeur < 0 → clampée à 0", () => {
  assertEqual(clampPct(-5), 0);
});

test("null → null", () => {
  assertEqual(clampPct(null), null);
});

console.log("\n── classifyFreshness ─────────────────────────────────────────────────────\n");

const NOW = new Date("2026-08-14T12:00:00Z").getTime();

test("Pas de timestamp → unknown", () => {
  assertEqual(classifyFreshness(null, NOW), "unknown");
  assertEqual(classifyFreshness(undefined, NOW), "unknown");
});

test("Timestamp invalide → unknown", () => {
  assertEqual(classifyFreshness("pas-une-date", NOW), "unknown");
});

test("Il y a 2h (capteur quotidien) → fresh", () => {
  const ts = new Date(NOW - 2 * 3600 * 1000).toISOString();
  assertEqual(classifyFreshness(ts, NOW), "fresh");
});

test("Il y a 26h → fresh (marge quotidienne)", () => {
  const ts = new Date(NOW - 26 * 3600 * 1000).toISOString();
  assertEqual(classifyFreshness(ts, NOW), "fresh");
});

test("Il y a 30h → aging", () => {
  const ts = new Date(NOW - 30 * 3600 * 1000).toISOString();
  assertEqual(classifyFreshness(ts, NOW), "aging");
});

test("Il y a 60h → stale", () => {
  const ts = new Date(NOW - 60 * 3600 * 1000).toISOString();
  assertEqual(classifyFreshness(ts, NOW), "stale");
});

console.log("\n── normalizeCiterneStatus — cas nominal (Citerne 1, non-régression) ────\n");

test("Toutes les valeurs réelles vérifiées se parsent correctement", () => {
  const now = new Date("2026-08-14T10:00:00Z").getTime();
  const updated = new Date(now - 3600 * 1000).toISOString();
  const entities = {
    [CITERNE_1_ENTITY_IDS.niveau]: haEntity("89.3", { last_updated: updated }),
    [CITERNE_1_ENTITY_IDS.volumeDisponible]: haEntity("39466", { last_updated: updated }),
    [CITERNE_1_ENTITY_IDS.hauteurEau]: haEntity("2.44", { last_updated: updated }),
    [CITERNE_1_ENTITY_IDS.distanceCapteur]: haEntity("47.9", { last_updated: updated }),
    [CITERNE_1_ENTITY_IDS.debit]: haEntity("-1", { last_updated: updated }),
    [CITERNE_1_ENTITY_IDS.batterie]: haEntity("50", { last_updated: updated }),
    [CITERNE_1_ENTITY_IDS.tensionBatterie]: haEntity("3.82", { last_updated: updated }),
    [CITERNE_1_ENTITY_IDS.rssi]: haEntity("-62", { last_updated: updated }),
    [CITERNE_1_ENTITY_IDS.snr]: haEntity("10.5", { last_updated: updated }),
  };
  // tankId omitted on purpose: must default to 1 for existing callers.
  const status = normalizeCiterneStatus(entities, now);

  assertEqual(status.niveau.value, 89.3, "niveau");
  assertEqual(status.volumeDisponible.value, 39466, "volume");
  assertEqual(status.hauteurEau.value, 2.44, "hauteur");
  assertEqual(status.distanceCapteur.value, 47.9, "distance");
  assertEqual(status.debit.value, null, "débit -1 → non mesuré");
  assertEqual(status.batterie.value, 50, "batterie");
  assertEqual(status.tensionBatterie.value, 3.82, "tension");
  assertEqual(status.rssi.value, -62, "rssi");
  assertEqual(status.snr.value, 10.5, "snr");
  assertEqual(status.hasData, true, "hasData");
  assertEqual(status.freshness, "fresh", "fraîcheur 1h");
});

test("Payload MQTT relayé (citerne/1/etat) → mêmes valeurs et horodatage", () => {
  const receivedAt = new Date(NOW - 10 * 60 * 1000).toISOString();
  const status = normalizeCiternePayload({
    niveau: 86, volume: 38013, hauteur: 2.34, distance: 57.7,
    debit: -1, batterie: 54, batterie_voltage: 3.84, rssi: -108, snr: -13.8,
  }, receivedAt, NOW);
  assertEqual(status.niveau.value, 86);
  assertEqual(status.volumeDisponible.value, 38013);
  assertEqual(status.debit.value, null);
  assertEqual(status.rssi.value, -108);
  assertEqual(status.lastUpdated, receivedAt);
  assertEqual(status.freshness, "fresh");
});

console.log("\n── normalizeCiternePayload — Citerne 1 et 2 partagent la même convention ─\n");

test("Citerne 1 et Citerne 2 utilisent des entity_ids distincts", () => {
  assertEqual(CITERNE_1_ENTITY_IDS.niveau, "sensor.citerne_1_eau_potable_niveau");
  assertEqual(CITERNE_2_ENTITY_IDS.niveau, "sensor.citerne_2_eau_potable_niveau");
  assert(CITERNE_1_ENTITY_IDS.niveau !== CITERNE_2_ENTITY_IDS.niveau, "entity_ids ne doivent jamais se recouper");
});

// Voir scripts/test-citerne-tank2.mjs pour la couverture dédiée Citerne 2
// (payload complet, clamp batterie, debit=-1, absence de discovery, historique vide).

console.log("\n── normalizeCiterneStatus — cas débit indisponible ──────────────────────\n");

test('debit = "unavailable" → value null (jamais -1 affiché)', () => {
  const entities = { [CITERNE_1_ENTITY_IDS.debit]: haEntity("unavailable") };
  const status = normalizeCiterneStatus(entities, NOW);
  assertEqual(status.debit.value, null);
});

test("debit = -1 (sentinelle) → value null, pas -1", () => {
  const entities = { [CITERNE_1_ENTITY_IDS.debit]: haEntity("-1") };
  const status = normalizeCiterneStatus(entities, NOW);
  assertEqual(status.debit.value, null);
  assert(status.debit.value !== -1, "ne doit jamais exposer -1");
});

test("debit = 12.5 (mesure valide) → value 12.5, pas traité comme non mesuré", () => {
  const entities = { [CITERNE_1_ENTITY_IDS.debit]: haEntity("12.5") };
  const status = normalizeCiterneStatus(entities, NOW);
  assertEqual(status.debit.value, 12.5);
});

test("distance = -1 (mesure physique invalide) → value null", () => {
  const entities = { [CITERNE_1_ENTITY_IDS.distanceCapteur]: haEntity("-1") };
  const status = normalizeCiterneStatus(entities, NOW);
  assertEqual(status.distanceCapteur.value, null);
});

console.log("\n── normalizeCiterneStatus — clamp niveau/batterie ───────────────────────\n");

test("niveau > 100 (bruit capteur) → clampé à 100", () => {
  const entities = { [CITERNE_1_ENTITY_IDS.niveau]: haEntity("104.2") };
  const status = normalizeCiterneStatus(entities, NOW);
  assertEqual(status.niveau.value, 100);
});

test("batterie négative (bruit capteur) → clampée à 0", () => {
  const entities = { [CITERNE_1_ENTITY_IDS.batterie]: haEntity("-3") };
  const status = normalizeCiterneStatus(entities, NOW);
  assertEqual(status.batterie.value, 0);
});

test("hauteurEau n'est pas clampée à 100 (pas un pourcentage)", () => {
  const entities = { [CITERNE_1_ENTITY_IDS.hauteurEau]: haEntity("142.7") };
  const status = normalizeCiterneStatus(entities, NOW);
  assertEqual(status.hauteurEau.value, 142.7);
});

console.log("\n── normalizeCiterneStatus — absence de données ──────────────────────────\n");

test("Payload HA vide → toutes les valeurs null, hasData=false, freshness=unknown", () => {
  const status = normalizeCiterneStatus({}, NOW);
  assertEqual(status.niveau.value, null);
  assertEqual(status.debit.value, null);
  assertEqual(status.hasData, false);
  assertEqual(status.freshness, "unknown");
  assertEqual(status.lastUpdated, null);
});

test("Entité isolée manquante → sa métrique est null sans casser les autres", () => {
  const entities = { [CITERNE_1_ENTITY_IDS.niveau]: haEntity("75") };
  const status = normalizeCiterneStatus(entities, NOW);
  assertEqual(status.niveau.value, 75);
  assertEqual(status.volumeDisponible.value, null);
  assertEqual(status.hasData, true);
});

console.log("\n── normalizeCiterneStatus — unité depuis les attributs HA ───────────────\n");

test("Utilise unit_of_measurement de HA si présent", () => {
  const entities = {
    [CITERNE_1_ENTITY_IDS.volumeDisponible]: haEntity("39466", { attributes: { unit_of_measurement: "L" } }),
  };
  const status = normalizeCiterneStatus(entities, NOW);
  assertEqual(status.volumeDisponible.unit, "L");
});

test("Retombe sur l'unité par défaut si absente des attributs", () => {
  const entities = { [CITERNE_1_ENTITY_IDS.rssi]: haEntity("-62") };
  const status = normalizeCiterneStatus(entities, NOW);
  assertEqual(status.rssi.unit, "dBm");
});

console.log("\n── normalizeCiterneStatus — lastUpdated global ──────────────────────────\n");

test("lastUpdated = timestamp le plus récent parmi les entités présentes", () => {
  const older = new Date(NOW - 5 * 3600 * 1000).toISOString();
  const newer = new Date(NOW - 1 * 3600 * 1000).toISOString();
  const entities = {
    [CITERNE_1_ENTITY_IDS.niveau]: haEntity("89.3", { last_updated: older }),
    [CITERNE_1_ENTITY_IDS.batterie]: haEntity("50", { last_updated: newer }),
  };
  const status = normalizeCiterneStatus(entities, NOW);
  assertEqual(status.lastUpdated, newer);
});

console.log("\n── formatRelativeAge ─────────────────────────────────────────────────────\n");

test("null → tiret", () => {
  assertEqual(formatRelativeAge(null, NOW), "—");
});

test("il y a 5 minutes → 'il y a 5 min'", () => {
  const ts = new Date(NOW - 5 * 60 * 1000).toISOString();
  assertEqual(formatRelativeAge(ts, NOW), "il y a 5 min");
});

test("il y a 3 heures → 'il y a 3 h'", () => {
  const ts = new Date(NOW - 3 * 3600 * 1000).toISOString();
  assertEqual(formatRelativeAge(ts, NOW), "il y a 3 h");
});

test("il y a 2 jours → 'il y a 2 j'", () => {
  const ts = new Date(NOW - 2 * 24 * 3600 * 1000).toISOString();
  assertEqual(formatRelativeAge(ts, NOW), "il y a 2 j");
});

console.log("\n── getBatteryAlert — seuils 15 % / 10 % / 5 %, sans doublon ─────────────\n");

test("null → aucune alerte", () => {
  assertEqual(getBatteryAlert(null), null);
});

test("50 % → aucune alerte", () => {
  assertEqual(getBatteryAlert(50), null);
});

test("16 % → aucune alerte (juste au-dessus du premier seuil)", () => {
  assertEqual(getBatteryAlert(16), null);
});

test("15 % → alerte amber, seuil 15", () => {
  const alert = getBatteryAlert(15);
  assertEqual(alert.threshold, 15);
  assertEqual(alert.tone, "amber");
});

test("12 % → toujours seuil 15 (pas de doublon avec 10)", () => {
  const alert = getBatteryAlert(12);
  assertEqual(alert.threshold, 15);
});

test("10 % → alerte red, seuil 10 (un seul niveau, pas 15 et 10 cumulés)", () => {
  const alert = getBatteryAlert(10);
  assertEqual(alert.threshold, 10);
  assertEqual(alert.tone, "red");
});

test("7 % → toujours seuil 10 (pas de doublon avec 5)", () => {
  const alert = getBatteryAlert(7);
  assertEqual(alert.threshold, 10);
});

test("5 % → alerte red, seuil 5", () => {
  const alert = getBatteryAlert(5);
  assertEqual(alert.threshold, 5);
  assertEqual(alert.tone, "red");
});

test("0 % → toujours seuil 5 (un seul niveau retourné, jamais 15+10+5 empilés)", () => {
  const alert = getBatteryAlert(0);
  assertEqual(alert.threshold, 5);
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
