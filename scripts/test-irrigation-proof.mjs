#!/usr/bin/env node
/**
 * Tests de la preuve d'état Home Assistant pour l'arrosage.
 * Usage: node scripts/test-irrigation-proof.mjs
 *
 * Autonome : aucune connexion HA ni Firebase. Le temps et les lectures HA
 * sont injectés (horloge virtuelle), les tests sont donc instantanés.
 */

import {
  PUMP_ENTITY_ID,
  valveEntityId,
  otherValveEntityId,
  indexStates,
  evaluateIrrigationProof,
  waitForIrrigationProof,
  monitorIrrigationProof,
  runIrrigationWithProof,
  confirmedMinutes,
  confirmedMm,
  proofSnapshot,
} from "./lib/ha-irrigation-proof.mjs";

// ─── Infrastructure de test ──────────────────────────────────────────────────

let passed = 0, failed = 0;
const pending = [];

function test(name, fn) {
  pending.push(async () => {
    try {
      await fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ ${name}: ${err.message}`);
      failed++;
    }
  });
}

/** Titre de section — mis en file avec les tests pour garder l'ordre d'affichage. */
function section(title) {
  pending.push(async () => console.log(`\n── ${title} ${"─".repeat(Math.max(3, 72 - title.length))}\n`));
}

function assert(condition, message) {
  if (!condition) throw new Error(message ?? "assertion failed");
}

function assertEqual(actual, expected, label = "") {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ─── Helpers de fixtures ─────────────────────────────────────────────────────

/** Construit une réponse /api/states à partir de 3 états. */
function states({ pump = "on", valve1 = "off", valve2 = "off" }) {
  return [
    { entity_id: PUMP_ENTITY_ID, state: pump },
    { entity_id: "switch.sous_station_bat_a_electrovanne_1", state: valve1 },
    { entity_id: "switch.sous_station_bat_a_electrovanne_2", state: valve2 },
    { entity_id: "sensor.sous_station_bat_a_pression_reseau", state: "2.4" },
  ];
}

const RUNNING_Z1 = states({ pump: "on", valve1: "on", valve2: "off" });

/** Horloge virtuelle : sleep avance le temps sans attendre réellement. */
function virtualClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms) => { t += ms; },
    get elapsed() { return t; },
  };
}

/** readStates qui renvoie une réponse différente par appel. */
function scriptedReader(sequence) {
  let i = 0;
  const calls = { count: 0 };
  const read = async () => {
    calls.count++;
    const step = sequence[Math.min(i, sequence.length - 1)];
    i++;
    if (step instanceof Error) throw step;
    return typeof step === "function" ? step() : step;
  };
  return { read, calls };
}

// ═════════════════════════════════════════════════════════════════════════════

section("entity ids & indexStates");

test("valveEntityId / otherValveEntityId", () => {
  assertEqual(valveEntityId(1), "switch.sous_station_bat_a_electrovanne_1");
  assertEqual(valveEntityId(2), "switch.sous_station_bat_a_electrovanne_2");
  assertEqual(otherValveEntityId(1), "switch.sous_station_bat_a_electrovanne_2");
  assertEqual(otherValveEntityId(2), "switch.sous_station_bat_a_electrovanne_1");
  assertEqual(valveEntityId("2"), "switch.sous_station_bat_a_electrovanne_2", "zone en string");
  assertEqual(valveEntityId(undefined), "switch.sous_station_bat_a_electrovanne_1", "défaut zone 1");
});

test("indexStates accepte tableau et objet, normalise en minuscules", () => {
  const fromArray = indexStates([{ entity_id: "a", state: "ON" }]);
  assertEqual(fromArray.get("a"), "on");
  const fromObject = indexStates({ k: { entity_id: "a", state: "Off" } });
  assertEqual(fromObject.get("a"), "off");
  assertEqual(indexStates(null).size, 0, "null → map vide");
});

section("evaluateIrrigationProof — succès");

test("Pompe on + vanne 1 on + vanne 2 off → preuve OK (zone 1)", () => {
  const proof = evaluateIrrigationProof(RUNNING_Z1, 1);
  assertEqual(proof.ok, true, proof.reason);
  assertEqual(proof.zone, 1);
  assertEqual(proof.problems.length, 0);
  assert(proof.reason.includes("Preuve OK"), proof.reason);
});

test("Pompe on + vanne 2 on + vanne 1 off → preuve OK (zone 2)", () => {
  const proof = evaluateIrrigationProof(states({ pump: "on", valve1: "off", valve2: "on" }), 2);
  assertEqual(proof.ok, true, proof.reason);
  assertEqual(proof.zone, 2);
});

test("Preuve OK zone 1 n'est PAS une preuve OK pour la zone 2", () => {
  assertEqual(evaluateIrrigationProof(RUNNING_Z1, 2).ok, false);
});

section("evaluateIrrigationProof — pompe OFF");

test("Pompe off alors que la vanne est ouverte → refusé, message explicite", () => {
  const proof = evaluateIrrigationProof(states({ pump: "off", valve1: "on", valve2: "off" }), 1);
  assertEqual(proof.ok, false);
  assert(proof.reason.includes(PUMP_ENTITY_ID), `entité pompe citée: ${proof.reason}`);
  assert(proof.reason.includes('"off"'), `état cité: ${proof.reason}`);
  assertEqual(proof.pumpState, "off");
  assertEqual(proof.problems.length, 1, "seule la pompe est en cause");
});

test("Pompe absente des états → refusé (absent)", () => {
  const proof = evaluateIrrigationProof(
    [
      { entity_id: "switch.sous_station_bat_a_electrovanne_1", state: "on" },
      { entity_id: "switch.sous_station_bat_a_electrovanne_2", state: "off" },
    ],
    1,
  );
  assertEqual(proof.ok, false);
  assertEqual(proof.pumpState, null);
  assert(proof.reason.includes("absent"), proof.reason);
});

section("evaluateIrrigationProof — vanne unavailable");

test("Vanne demandée unavailable → refusé, message explicite", () => {
  const proof = evaluateIrrigationProof(states({ pump: "on", valve1: "unavailable", valve2: "off" }), 1);
  assertEqual(proof.ok, false);
  assertEqual(proof.valveState, "unavailable");
  assert(proof.reason.includes("electrovanne_1"), proof.reason);
  assert(proof.reason.includes("unavailable"), proof.reason);
});

test("Vanne demandée unknown → refusé", () => {
  const proof = evaluateIrrigationProof(states({ pump: "on", valve1: "unknown", valve2: "off" }), 1);
  assertEqual(proof.ok, false);
  assert(proof.reason.includes("unknown"), proof.reason);
});

test("Autre vanne unavailable → refusé (on n'a pas la preuve qu'elle est fermée)", () => {
  const proof = evaluateIrrigationProof(states({ pump: "on", valve1: "on", valve2: "unavailable" }), 1);
  assertEqual(proof.ok, false);
  assert(proof.reason.includes("electrovanne_2"), proof.reason);
  assert(proof.reason.includes('attendu "off"'), proof.reason);
});

section("evaluateIrrigationProof — mauvaise vanne");

test("Zone 1 demandée mais c'est la vanne 2 qui est ouverte → refusé", () => {
  const proof = evaluateIrrigationProof(states({ pump: "on", valve1: "off", valve2: "on" }), 1);
  assertEqual(proof.ok, false);
  assertEqual(proof.problems.length, 2, "vanne 1 fermée + vanne 2 ouverte");
  assert(proof.reason.includes("electrovanne_1"), proof.reason);
  assert(proof.reason.includes("electrovanne_2"), proof.reason);
});

test("Les deux vannes ouvertes → refusé (autre vanne doit être off)", () => {
  const proof = evaluateIrrigationProof(states({ pump: "on", valve1: "on", valve2: "on" }), 1);
  assertEqual(proof.ok, false);
  assertEqual(proof.otherValveState, "on");
});

test("Tout est off (le script HA n'a rien fait) → refusé, 2 problèmes", () => {
  const proof = evaluateIrrigationProof(states({ pump: "off", valve1: "off", valve2: "off" }), 1);
  assertEqual(proof.ok, false);
  assertEqual(proof.problems.length, 2, "pompe off + vanne demandée off");
});

section("waitForIrrigationProof — délai borné");

test("Preuve immédiate → ok au 1er essai, aucune attente", async () => {
  const clock = virtualClock();
  const reader = scriptedReader([RUNNING_Z1]);
  const proof = await waitForIrrigationProof({
    zone: 1, readStates: reader.read, sleep: clock.sleep, now: clock.now,
    timeoutMs: 45000, intervalMs: 3000,
  });
  assertEqual(proof.ok, true, proof.reason);
  assertEqual(proof.attempts, 1);
  assertEqual(proof.elapsedMs, 0);
  assertEqual(proof.timedOut, false);
});

test("Vanne lente (on au 3e essai) → ok, dans le délai", async () => {
  const clock = virtualClock();
  const reader = scriptedReader([
    states({ pump: "off", valve1: "off", valve2: "off" }),
    states({ pump: "off", valve1: "on", valve2: "off" }),
    RUNNING_Z1,
  ]);
  const proof = await waitForIrrigationProof({
    zone: 1, readStates: reader.read, sleep: clock.sleep, now: clock.now,
    timeoutMs: 45000, intervalMs: 3000,
  });
  assertEqual(proof.ok, true, proof.reason);
  assertEqual(proof.attempts, 3);
  assertEqual(proof.elapsedMs, 6000, "2 attentes de 3 s");
});

test("Pompe OFF jusqu'au bout → timeout, ok=false, message explicite", async () => {
  const clock = virtualClock();
  const reader = scriptedReader([states({ pump: "off", valve1: "on", valve2: "off" })]);
  const proof = await waitForIrrigationProof({
    zone: 1, readStates: reader.read, sleep: clock.sleep, now: clock.now,
    timeoutMs: 12000, intervalMs: 3000,
  });
  assertEqual(proof.ok, false);
  assertEqual(proof.timedOut, true);
  assert(proof.reason.includes(PUMP_ENTITY_ID), proof.reason);
  assert(proof.reason.includes("aucune confirmation après 12 s"), proof.reason);
  assert(clock.elapsed <= 12000, `délai borné: ${clock.elapsed} ms`);
});

test("Vanne unavailable jusqu'au bout → timeout, ok=false", async () => {
  const clock = virtualClock();
  const reader = scriptedReader([states({ pump: "on", valve1: "unavailable", valve2: "off" })]);
  const proof = await waitForIrrigationProof({
    zone: 1, readStates: reader.read, sleep: clock.sleep, now: clock.now,
    timeoutMs: 9000, intervalMs: 3000,
  });
  assertEqual(proof.ok, false);
  assert(proof.reason.includes("unavailable"), proof.reason);
  assertEqual(proof.attempts, 4, "lectures à t=0, 3, 6 et 9 s");
  assertEqual(clock.elapsed, 9000, "jamais au-delà du délai borné");
});

test("Mauvaise vanne ouverte jusqu'au bout → timeout, ok=false", async () => {
  const clock = virtualClock();
  const reader = scriptedReader([states({ pump: "on", valve1: "off", valve2: "on" })]);
  const proof = await waitForIrrigationProof({
    zone: 1, readStates: reader.read, sleep: clock.sleep, now: clock.now,
    timeoutMs: 9000, intervalMs: 3000,
  });
  assertEqual(proof.ok, false);
  assert(proof.reason.includes("electrovanne_2"), proof.reason);
});

test("HA injoignable → ok=false avec l'erreur réseau dans le message", async () => {
  const clock = virtualClock();
  const reader = scriptedReader([new Error("Home Assistant 502: bad gateway")]);
  const proof = await waitForIrrigationProof({
    zone: 1, readStates: reader.read, sleep: clock.sleep, now: clock.now,
    timeoutMs: 6000, intervalMs: 3000,
  });
  assertEqual(proof.ok, false);
  assert(proof.reason.includes("Lecture Home Assistant impossible"), proof.reason);
  assert(proof.reason.includes("502"), proof.reason);
});

test("HA injoignable puis rétabli → ok", async () => {
  const clock = virtualClock();
  const reader = scriptedReader([new Error("ECONNREFUSED"), RUNNING_Z1]);
  const proof = await waitForIrrigationProof({
    zone: 1, readStates: reader.read, sleep: clock.sleep, now: clock.now,
    timeoutMs: 30000, intervalMs: 3000,
  });
  assertEqual(proof.ok, true, proof.reason);
  assertEqual(proof.attempts, 2);
});

section("monitorIrrigationProof — minutes confirmées");

test("Preuve maintenue toute la durée → ok, 100% des minutes confirmées", async () => {
  const clock = virtualClock();
  const reader = scriptedReader([RUNNING_Z1]);
  const run = await monitorIrrigationProof({
    zone: 1, durationMs: 45 * 60000, readStates: reader.read,
    sleep: clock.sleep, now: clock.now, checkIntervalMs: 30000,
  });
  assertEqual(run.ok, true, run.reason);
  assertEqual(run.confirmedMs, 45 * 60000);
  assertEqual(confirmedMinutes(run.confirmedMs), 45);
});

test("Pompe qui tombe après 2 min → interruption, 2 min confirmées seulement", async () => {
  const clock = virtualClock();
  // checks à 60s, 120s, 180s… : les 2 premiers OK, le 3e pompe off
  const reader = scriptedReader([
    RUNNING_Z1,
    RUNNING_Z1,
    states({ pump: "off", valve1: "on", valve2: "off" }),
  ]);
  const run = await monitorIrrigationProof({
    zone: 1, durationMs: 45 * 60000, readStates: reader.read,
    sleep: clock.sleep, now: clock.now, checkIntervalMs: 60000,
  });
  assertEqual(run.ok, false);
  assertEqual(confirmedMinutes(run.confirmedMs), 2, "2 min confirmées");
  assert(run.reason.includes(PUMP_ENTITY_ID), run.reason);
  assertEqual(run.proof.pumpState, "off");
});

test("Vanne qui passe unavailable dès le 1er check → 0 minute confirmée", async () => {
  const clock = virtualClock();
  const reader = scriptedReader([states({ pump: "on", valve1: "unavailable", valve2: "off" })]);
  const run = await monitorIrrigationProof({
    zone: 1, durationMs: 45 * 60000, readStates: reader.read,
    sleep: clock.sleep, now: clock.now, checkIntervalMs: 30000,
  });
  assertEqual(run.ok, false);
  assertEqual(run.confirmedMs, 0, "aucune minute comptabilisée");
  assert(run.reason.includes("unavailable"), run.reason);
});

test("Bascule sur la mauvaise vanne en cours de route → interruption", async () => {
  const clock = virtualClock();
  const reader = scriptedReader([
    RUNNING_Z1,
    states({ pump: "on", valve1: "off", valve2: "on" }),
  ]);
  const run = await monitorIrrigationProof({
    zone: 1, durationMs: 60 * 60000, readStates: reader.read,
    sleep: clock.sleep, now: clock.now, checkIntervalMs: 60000,
  });
  assertEqual(run.ok, false);
  assertEqual(confirmedMinutes(run.confirmedMs), 1);
  assert(run.reason.includes("electrovanne_1"), run.reason);
});

test("HA injoignable pendant l'arrosage → interruption, minutes déjà confirmées gardées", async () => {
  const clock = virtualClock();
  const reader = scriptedReader([RUNNING_Z1, RUNNING_Z1, new Error("ETIMEDOUT")]);
  const run = await monitorIrrigationProof({
    zone: 1, durationMs: 45 * 60000, readStates: reader.read,
    sleep: clock.sleep, now: clock.now, checkIntervalMs: 60000,
  });
  assertEqual(run.ok, false);
  assertEqual(confirmedMinutes(run.confirmedMs), 2);
  assert(run.reason.includes("Lecture Home Assistant impossible"), run.reason);
});

test("Dernière tranche partielle : durée non multiple de l'intervalle", async () => {
  const clock = virtualClock();
  const reader = scriptedReader([RUNNING_Z1]);
  const run = await monitorIrrigationProof({
    zone: 1, durationMs: 50 * 60000, readStates: reader.read,
    sleep: clock.sleep, now: clock.now, checkIntervalMs: 3 * 60000,
  });
  assertEqual(run.ok, true, run.reason);
  assertEqual(confirmedMinutes(run.confirmedMs), 50, "pas de sur-comptage au-delà de la durée");
  assertEqual(clock.elapsed, 50 * 60000, "pas d'attente au-delà de la durée");
});

test("Durée nulle (confirmation plus longue que la durée) → 0 minute, ok", async () => {
  const clock = virtualClock();
  const reader = scriptedReader([RUNNING_Z1]);
  const run = await monitorIrrigationProof({
    zone: 1, durationMs: 0, readStates: reader.read,
    sleep: clock.sleep, now: clock.now, checkIntervalMs: 30000,
  });
  assertEqual(run.ok, true);
  assertEqual(run.confirmedMs, 0);
});

section("runIrrigationWithProof — cycle complet (manuel & auto)");

/** Options communes : 10 min demandées, confirmation par pas de 60 s, check 60 s. */
function runOptions(clock, reader, extra = {}) {
  return {
    zone: 1,
    durationMs: 10 * 60000,
    mmPerHour: 5,
    readStates: reader.read,
    sleep: clock.sleep,
    now: clock.now,
    proofTimeoutMs: 45000,
    proofIntervalMs: 60000,
    monitorIntervalMs: 60000,
    ...extra,
  };
}

test("Preuve maintenue toute la durée → started+ok, minutes et mm complets", async () => {
  const clock = virtualClock();
  const reader = scriptedReader([RUNNING_Z1]);
  const run = await runIrrigationWithProof(runOptions(clock, reader));
  assertEqual(run.started, true, run.reason);
  assertEqual(run.ok, true, run.reason);
  assertEqual(run.minutes, 10);
  assertEqual(run.mm, confirmedMm(10, 5));
  assertEqual(clock.elapsed, 10 * 60000, "jamais au-delà de la durée demandée");
});

test("Démarrage jamais confirmé → started=false, 0 min, 0 mm, aucun crédit", async () => {
  const clock = virtualClock();
  const reader = scriptedReader([states({ pump: "off", valve1: "off", valve2: "off" })]);
  let confirmedCalls = 0;
  const run = await runIrrigationWithProof(
    runOptions(clock, reader, { proofTimeoutMs: 120000, onConfirmed: async () => { confirmedCalls++; } }),
  );
  assertEqual(run.started, false);
  assertEqual(run.ok, false);
  assertEqual(run.minutes, 0);
  assertEqual(run.mm, 0);
  assertEqual(confirmedCalls, 0, "onConfirmed ne doit pas être appelé sans preuve");
  assert(run.reason.includes(PUMP_ENTITY_ID), run.reason);
});

test("Démarrage confirmé puis preuve perdue → started=true, minutes partielles créditées", async () => {
  const clock = virtualClock();
  const reader = scriptedReader([
    RUNNING_Z1,  // preuve de démarrage
    RUNNING_Z1,  // check 1 min
    RUNNING_Z1,  // check 2 min
    states({ pump: "off", valve1: "on", valve2: "off" }), // pompe tombée
  ]);
  const run = await runIrrigationWithProof(runOptions(clock, reader));
  assertEqual(run.started, true);
  assertEqual(run.ok, false, "la preuve a disparu → échec");
  assertEqual(run.minutes, 2, "seules les 2 min confirmées comptent");
  assertEqual(run.mm, confirmedMm(2, 5), "mm proportionnels aux minutes confirmées");
  assert(run.reason.includes(PUMP_ENTITY_ID), run.reason);
  assertEqual(run.proof.pumpState, "off", "la preuve d'échec est exploitable");
});

test("Vanne refermée juste après le démarrage → 0 min confirmée malgré la confirmation", async () => {
  const clock = virtualClock();
  const reader = scriptedReader([
    RUNNING_Z1,
    states({ pump: "on", valve1: "off", valve2: "off" }),
  ]);
  const run = await runIrrigationWithProof(runOptions(clock, reader));
  assertEqual(run.started, true, "le démarrage était bien prouvé");
  assertEqual(run.ok, false);
  assertEqual(run.minutes, 0, "une confirmation de démarrage ne crédite rien");
  assertEqual(run.mm, 0);
});

test("Le délai de confirmation est déduit de la durée (pas de dépassement)", async () => {
  const clock = virtualClock();
  const reader = scriptedReader([
    states({ pump: "on", valve1: "off", valve2: "off" }), // pas encore ouverte
    RUNNING_Z1,                                          // confirmée à t=60 s
  ]);
  const run = await runIrrigationWithProof(runOptions(clock, reader, { proofTimeoutMs: 120000 }));
  assertEqual(run.started, true, run.reason);
  assertEqual(run.startProof.elapsedMs, 60000);
  assertEqual(run.ok, true, run.reason);
  assertEqual(run.minutes, 9, "10 min demandées − 1 min de confirmation");
  assertEqual(clock.elapsed, 10 * 60000, "durée totale bornée à ce qui a été demandé");
});

test("onConfirmed reçoit la preuve de démarrage, une seule fois, avant la surveillance", async () => {
  const clock = virtualClock();
  const reader = scriptedReader([RUNNING_Z1]);
  const seen = [];
  const run = await runIrrigationWithProof(
    runOptions(clock, reader, {
      onConfirmed: async (proof) => seen.push({ ok: proof.ok, at: clock.elapsed }),
    }),
  );
  assertEqual(seen.length, 1, "appelé exactement une fois");
  assertEqual(seen[0].ok, true);
  assertEqual(seen[0].at, 0, "appelé avant d'attendre la durée");
  assertEqual(run.minutes, 10);
});

test("HA injoignable au démarrage → started=false, rien comptabilisé", async () => {
  const clock = virtualClock();
  const reader = scriptedReader([new Error("ECONNREFUSED")]);
  const run = await runIrrigationWithProof(runOptions(clock, reader, { proofTimeoutMs: 120000 }));
  assertEqual(run.started, false);
  assertEqual(run.minutes, 0);
  assert(run.reason.includes("Lecture Home Assistant impossible"), run.reason);
});

test("HA injoignable en cours d'arrosage → minutes déjà confirmées gardées", async () => {
  const clock = virtualClock();
  const reader = scriptedReader([RUNNING_Z1, RUNNING_Z1, RUNNING_Z1, new Error("ETIMEDOUT")]);
  const run = await runIrrigationWithProof(runOptions(clock, reader));
  assertEqual(run.started, true);
  assertEqual(run.ok, false);
  assertEqual(run.minutes, 2);
  assertEqual(run.mm, confirmedMm(2, 5));
});

test("Débit mm/h absent → minutes confirmées mais 0 mm (jamais NaN)", async () => {
  const clock = virtualClock();
  const reader = scriptedReader([RUNNING_Z1]);
  const run = await runIrrigationWithProof(runOptions(clock, reader, { mmPerHour: undefined }));
  assertEqual(run.minutes, 10);
  assertEqual(run.mm, 0);
});

test("Résultat sérialisable Firebase : aucun champ undefined", async () => {
  const clock = virtualClock();
  const reader = scriptedReader([states({ pump: "off", valve1: "off", valve2: "off" })]);
  const run = await runIrrigationWithProof(runOptions(clock, reader, { proofTimeoutMs: 120000 }));
  for (const key of ["started", "ok", "confirmedMs", "minutes", "mm", "reason", "proof", "startProof"]) {
    assert(run[key] !== undefined, `${key} ne doit pas être undefined`);
  }
  assert(proofSnapshot(run.proof) !== null, "la preuve d'échec reste écrivable");
});

section("comptabilisation");

test("confirmedMinutes arrondit à 0,1 min et n'est jamais négatif", () => {
  assertEqual(confirmedMinutes(90000), 1.5);
  assertEqual(confirmedMinutes(0), 0);
  assertEqual(confirmedMinutes(-5000), 0);
});

test("confirmedMm = minutes × mm/h, 0 si débit invalide", () => {
  assertEqual(confirmedMm(60, 5), 5);
  assertEqual(confirmedMm(30, 5), 2.5);
  assertEqual(confirmedMm(45, 5), 3.75);
  assertEqual(confirmedMm(45, 0), 0);
  assertEqual(confirmedMm(45, undefined), 0);
});

test("Arrosage interrompu à mi-parcours → mm proportionnels aux minutes confirmées", () => {
  const full = confirmedMm(confirmedMinutes(60 * 60000), 5);
  const partial = confirmedMm(confirmedMinutes(30 * 60000), 5);
  assertEqual(full, 5);
  assertEqual(partial, 2.5, "moitié de la durée → moitié des mm");
});

test("proofSnapshot est sérialisable Firebase (aucun undefined)", () => {
  const snap = proofSnapshot(evaluateIrrigationProof(RUNNING_Z1, 1));
  for (const [key, value] of Object.entries(snap)) {
    assert(value !== undefined, `${key} ne doit pas être undefined`);
  }
  assertEqual(snap.pumpState, "on");
  assertEqual(snap.valveState, "on");
  assertEqual(snap.otherValveState, "off");
  assertEqual(proofSnapshot(null), null);
});

test("proofSnapshot d'une preuve incomplète → null, pas undefined", () => {
  const snap = proofSnapshot(evaluateIrrigationProof([], 1));
  assertEqual(snap.pumpState, null);
  assertEqual(snap.valveState, null);
  assertEqual(snap.otherValveState, null);
});

// ─── Exécution & résumé ─────────────────────────────────────────────────────

for (const run of pending) await run();

console.log(`\n${"─".repeat(60)}`);
console.log(`Résultats : ${passed} passés, ${failed} échoués`);
if (failed > 0) {
  console.error("❌ Certains tests ont échoué !");
  process.exit(1);
} else {
  console.log("✅ Tous les tests passent.");
}
