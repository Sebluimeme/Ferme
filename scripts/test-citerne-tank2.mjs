#!/usr/bin/env node
/**
 * Test logique de la citerne 2 (relais LoRa) et de l'isolation entre citernes.
 * Usage: node --experimental-strip-types scripts/test-citerne-tank2.mjs
 *
 * Importe directement src/lib/citerneEau.ts et src/lib/citerneHistory.ts
 * (pas de mirroring) pour rester couplé au vrai comportement de production.
 */
import {
  CITERNE_ENTITY_IDS,
  CITERNE_ENTITY_ID_LIST,
  getCiterneEntityIds,
  getCiterneEntityIdList,
  normalizeCiterneStatus,
  normalizeCiternePayload,
} from "../src/lib/citerneEau.ts";
import { normalizeCiterneHistory, computeEstimatedFlows } from "../src/lib/citerneHistory.ts";

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
  if (actual !== expected) throw new Error(`${label}: attendu ${JSON.stringify(expected)}, reçu ${JSON.stringify(actual)}`);
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

console.log("\n── getCiterneEntityIds — convention par citerne ─────────────────────────\n");

test("Citerne 1 : entity_id historiques inchangés (non-régression)", () => {
  assertEqual(getCiterneEntityIds(1).niveau, "sensor.citerne_1_eau_potable_niveau");
  assertEqual(getCiterneEntityIds(1).debit, "sensor.citerne_1_eau_potable_debit");
  assertEqual(JSON.stringify(getCiterneEntityIds(1)), JSON.stringify(CITERNE_ENTITY_IDS));
  assertEqual(JSON.stringify(getCiterneEntityIdList(1)), JSON.stringify(CITERNE_ENTITY_ID_LIST));
});

test("Citerne 2 : suit la même convention avec citerne_2", () => {
  assertEqual(getCiterneEntityIds(2).niveau, "sensor.citerne_2_eau_potable_niveau");
  assertEqual(getCiterneEntityIds(2).volumeDisponible, "sensor.citerne_2_eau_potable_volume_disponible");
  assertEqual(getCiterneEntityIds(2).batterie, "sensor.citerne_2_eau_potable_batterie");
  assertEqual(getCiterneEntityIds(2).tensionBatterie, "sensor.citerne_2_eau_potable_tension_batterie");
});

test("Aucun chevauchement d'entity_id entre citerne 1 et citerne 2", () => {
  const list1 = getCiterneEntityIdList(1);
  const list2 = getCiterneEntityIdList(2);
  assertEqual(list2.length, 9);
  assertEqual(list2.filter((id) => list1.includes(id)).length, 0);
});

console.log("\n── normalizeCiternePayload(tankId=2) — payload MQTT complet valide ──────\n");

test("Payload complet valide pour la citerne 2", () => {
  const now = Date.now();
  const receivedAt = new Date(now - 60_000).toISOString();
  const status = normalizeCiternePayload({
    distance: 88, hauteur: 1.8, volume: 21000, niveau: 62,
    debit: 4.2, batterie: 71, batterie_voltage: 3.7, rssi: -70, snr: 9.1,
  }, receivedAt, now, 2);

  assertEqual(status.niveau.value, 62);
  assertEqual(status.volumeDisponible.value, 21000);
  assertEqual(status.hauteurEau.value, 1.8);
  assertEqual(status.distanceCapteur.value, 88);
  assertEqual(status.debit.value, 4.2);
  assertEqual(status.batterie.value, 71);
  assertEqual(status.tensionBatterie.value, 3.7);
  assertEqual(status.rssi.value, -70);
  assertEqual(status.snr.value, 9.1);
  assertEqual(status.hasData, true);
  assertEqual(status.freshness, "fresh");
});

console.log("\n── normalizeCiternePayload(tankId=2) — clamp batterie 0–100 ─────────────\n");

test("Batterie > 100 (bruit capteur) → clampée à 100", () => {
  const status = normalizeCiternePayload({ batterie: 143 }, new Date().toISOString(), Date.now(), 2);
  assertEqual(status.batterie.value, 100);
});

test("Batterie négative (bruit capteur) → clampée à 0", () => {
  const status = normalizeCiternePayload({ batterie: -12 }, new Date().toISOString(), Date.now(), 2);
  assertEqual(status.batterie.value, 0);
});

console.log("\n── normalizeCiternePayload(tankId=2) — debit = -1 (sentinelle) ──────────\n");

test("debit = -1 → non mesuré (null), jamais affiché comme -1", () => {
  const status = normalizeCiternePayload({ debit: -1 }, new Date().toISOString(), Date.now(), 2);
  assertEqual(status.debit.value, null);
  assert(status.debit.value !== -1, "ne doit jamais exposer -1");
});

test("debit = 6.4 (mesure valide) → conservé", () => {
  const status = normalizeCiternePayload({ debit: 6.4 }, new Date().toISOString(), Date.now(), 2);
  assertEqual(status.debit.value, 6.4);
});

console.log("\n── Absence totale de données citerne 2 (discovery pas encore vue) ───────\n");

test("Aucune entité HA pour citerne 2 → hasData=false, aucune valeur inventée", () => {
  const status = normalizeCiterneStatus({}, Date.now(), 2);
  assertEqual(status.hasData, false);
  assertEqual(status.niveau.value, null);
  assertEqual(status.volumeDisponible.value, null);
  assertEqual(status.debit.value, null);
  assertEqual(status.lastUpdated, null);
  assertEqual(status.freshness, "unknown");
});

test("Les entités de citerne 1 ne fuient jamais vers le statut de citerne 2", () => {
  const entities = { [CITERNE_ENTITY_IDS.niveau]: haEntity("99") };
  const status2 = normalizeCiterneStatus(entities, Date.now(), 2);
  assertEqual(status2.hasData, false, "citerne 1 ne doit pas alimenter citerne 2");
  assertEqual(status2.niveau.value, null);
});

test("Entité isolée présente pour citerne 2 → sa métrique seule est renseignée", () => {
  const entities = { [getCiterneEntityIds(2).batterie]: haEntity("64") };
  const status2 = normalizeCiterneStatus(entities, Date.now(), 2);
  assertEqual(status2.batterie.value, 64);
  assertEqual(status2.niveau.value, null);
  assertEqual(status2.hasData, true);
});

console.log("\n── Historique citerne 2 vide (pas de graphique trompeur) ────────────────\n");

test("normalizeCiterneHistory(undefined) → tableau vide, pas d'exception", () => {
  assertEqual(normalizeCiterneHistory(undefined).length, 0);
});

test("normalizeCiterneHistory(null) → tableau vide", () => {
  assertEqual(normalizeCiterneHistory(null).length, 0);
});

test("computeEstimatedFlows([]) → aucune estimation, pas de point de débit inventé", () => {
  assertEqual(computeEstimatedFlows([]).length, 0);
  assertEqual(computeEstimatedFlows([]).at(-1), undefined);
});

console.log("\n── normalizeCiterneStatus sans tankId reste équivalent à tankId=1 ───────\n");

test("Appel sans 3e argument (non-régression citerne 1)", () => {
  const entities = { [CITERNE_ENTITY_IDS.niveau]: haEntity("75") };
  const withoutArg = normalizeCiterneStatus(entities, Date.now());
  const withTank1 = normalizeCiterneStatus(entities, Date.now(), 1);
  assertEqual(withoutArg.niveau.value, 75);
  assertEqual(withTank1.niveau.value, 75);
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
