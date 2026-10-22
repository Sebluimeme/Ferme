#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  HEATING_ENTITY_IDS, HEATING_STATUS_PATH, buildHeatingSnapshot, heatingFailureSnapshot,
  normalizeHeatingSnapshot, classifyHeatingFreshness, selectHeatingEntities, formatHeatingValue,
} from "../src/lib/chauffage.ts";
import {
  createHeatingHaReader, createHeatingFirebaseClient, collectHeatingSnapshot,
  restoreHeatingSnapshot, heatingBackoffMs,
} from "./home-assistant-chauffage-bridge.mjs";

const now = Date.parse("2026-10-22T12:00:00Z");
const iso = (ageMs = 0) => new Date(now - ageMs).toISOString();
const sensor = (key, state, ageMs = 60_000, attributes = { unit_of_measurement: "°C" }) => ({
  entity_id: HEATING_ENTITY_IDS[key], state, attributes,
  last_reported: iso(ageMs), last_updated: iso(ageMs), last_changed: iso(ageMs),
});
const snapshot = (states) => buildHeatingSnapshot(states, iso());
let passed = 0;
async function test(name, action) {
  await action();
  passed += 1;
  console.log(`✓ ${name}`);
}
const ok = (value) => ({ ok: true, json: async () => value });

await test("Sans données, les quatre températures et la consigne sont absentes", () => {
  const status = normalizeHeatingSnapshot(null, now);
  assert.equal(status.hasData, false);
  assert.equal(status.connected, false);
  for (const metric of [...Object.values(status.measurements), status.fuel.setpoint]) {
    assert.equal(metric.value, null);
    assert.equal(metric.availability, "missing");
    assert.equal(formatHeatingValue(metric), "—");
  }
});

await test("Mapping A/B/D exact, y compris température bois distincte du ballon D", () => {
  const status = normalizeHeatingSnapshot(snapshot([
    sensor("tankA", "41.2"), sensor("tankB", "52.3"), sensor("tankD", "63.4"), sensor("woodBoiler", "74.5"),
  ]), now);
  assert.deepEqual(Object.values(status.measurements).map((metric) => metric.value), [41.2, 52.3, 63.4, 74.5]);
  assert.equal(formatHeatingValue(status.measurements.tankA), "41,2 °C");
});

await test("Unavailable n'est jamais transformé en zéro ni en ancienne température courante", () => {
  const status = normalizeHeatingSnapshot(snapshot([sensor("tankD", "unavailable", 8 * 24 * 60 * 60_000)]), now);
  assert.equal(status.measurements.tankD.value, null);
  assert.equal(status.measurements.tankD.availability, "unavailable");
  assert.equal(status.measurements.tankD.freshness, "stale");
});

await test("Valeurs inconnues, vides et non finies sont rejetées", () => {
  for (const value of ["unknown", "", " ", "NaN", "Infinity", "-Infinity", "not-a-temperature"]) {
    assert.equal(normalizeHeatingSnapshot(snapshot([sensor("tankA", value)]), now).measurements.tankA.value, null);
  }
});

await test("Une mesure Fahrenheit n'est pas affichée comme Celsius", () => {
  const status = normalizeHeatingSnapshot(snapshot([sensor("tankA", "104", 0, { unit_of_measurement: "°F" })]), now);
  assert.equal(status.measurements.tankA.value, null);
  assert.equal(status.measurements.tankA.availability, "invalid");
});

await test("Une température sans unité n'est pas inventée", () => {
  assert.equal(normalizeHeatingSnapshot(snapshot([sensor("tankA", "41", 0, {})]), now).measurements.tankA.availability, "invalid");
});

await test("Seuils physiques : cinq minutes puis trente minutes", () => {
  assert.equal(classifyHeatingFreshness(iso(5 * 60_000), now), "fresh");
  assert.equal(classifyHeatingFreshness(iso(5 * 60_000 + 1), now), "aging");
  assert.equal(classifyHeatingFreshness(iso(30 * 60_000), now), "aging");
  assert.equal(classifyHeatingFreshness(iso(30 * 60_000 + 1), now), "stale");
});

await test("Date future ou illisible ne donne jamais un indicateur frais", () => {
  for (const date of [iso(-10 * 60_000), "wrong-date", null]) {
    assert.equal(classifyHeatingFreshness(date, now), "unknown");
  }
});

await test("Nouvel envoi identique : last_reported prévaut sur last_updated ancien", () => {
  const entity = sensor("tankA", "41", 60_000);
  entity.last_updated = iso(3 * 24 * 60 * 60_000);
  const value = normalizeHeatingSnapshot(snapshot([entity]), now).measurements.tankA;
  assert.equal(value.freshness, "fresh");
  assert.equal(value.reportedAt, iso(60_000));
});

await test("Ancien HA : last_updated est conservé sans utiliser l'heure du relais", () => {
  const entity = sensor("tankA", "41", 3 * 24 * 60 * 60_000);
  delete entity.last_reported;
  const value = normalizeHeatingSnapshot(snapshot([entity]), now).measurements.tankA;
  assert.equal(value.freshness, "stale");
  assert.equal(value.reportedAt, entity.last_updated);
});

await test("Date de mesure future conservée comme inconnue malgré une relève récente du relais", () => {
  const status = normalizeHeatingSnapshot(snapshot([sensor("tankA", "41", -10 * 60_000)]), now);
  assert.equal(status.measurements.tankA.value, 41);
  assert.equal(status.measurements.tankA.reportedAt, null);
  assert.equal(status.measurements.tankA.freshness, "unknown");
});

await test("Consigne à 60 °C avec climate off : réglage visible sans prétendre que la chaudière chauffe", () => {
  const status = normalizeHeatingSnapshot(snapshot([
    sensor("fuelSetpoint", "off", 40 * 24 * 60 * 60_000, { temperature: 60 }),
  ]), now);
  assert.equal(status.fuel.setpoint.value, 60);
  assert.equal(status.fuel.setpoint.freshness, "fresh");
  assert.equal(status.fuel.mode, "off");
  assert.equal("currentTemperature" in status.fuel, false);
  assert.equal(status.measurements.woodBoiler.value, null);
});

await test("Une consigne indisponible reste absente même si un attribut ancien subsiste", () => {
  const status = normalizeHeatingSnapshot(snapshot([sensor("fuelSetpoint", "unavailable", 0, { temperature: 60 })]), now);
  assert.equal(status.fuel.setpoint.value, null);
  assert.equal(status.fuel.mode, null);
});

await test("Consigne Fahrenheit et température réelle à sa place sont refusées", () => {
  assert.equal(normalizeHeatingSnapshot(snapshot([sensor("fuelSetpoint", "off", 0, { temperature: 140, temperature_unit: "°F" })]), now).fuel.setpoint.value, null);
  assert.equal(normalizeHeatingSnapshot(snapshot([sensor("fuelSetpoint", "off", 0, { current_temperature: 40 })]), now).fuel.setpoint.value, null);
});

await test("Échec réseau : dernier relevé conservé avec ses dates, liaison déconnectée", () => {
  const previous = buildHeatingSnapshot([sensor("tankA", "41", 45 * 60_000)], iso(40 * 60_000));
  const status = normalizeHeatingSnapshot(heatingFailureSnapshot(previous, iso(), "ha-unreachable"), now);
  assert.equal(status.connected, false);
  assert.equal(status.measurements.tankA.value, 41);
  assert.equal(status.measurements.tankA.reportedAt, iso(45 * 60_000));
  assert.equal(status.measurements.tankA.freshness, "stale");
  assert.equal(status.lastSuccessfulAt, iso(40 * 60_000));
  assert.equal(status.relayFreshness, "stale");
  assert.equal(status.checkedAt, iso());
});

await test("Payload minimisé, pas d'entité étrangère ni d'attribut privé dans Firebase", () => {
  const states = [
    { ...sensor("tankA", "41"), attributes: { unit_of_measurement: "°C", friendly_name: "private", access_token: "secret" }, context: "private" },
    { entity_id: "camera.private", state: "on", attributes: { access_token: "secret" } },
  ];
  const selected = selectHeatingEntities(states);
  assert.deepEqual(Object.keys(selected), ["tankA"]);
  assert.equal(JSON.stringify(selected).includes("secret"), false);
  assert.equal(JSON.stringify(selected).includes("private"), false);
  assert.equal(Object.keys(selected).some((key) => /[.#$\[\]/]/.test(key)), false);
});

await test("Versions inconnues et identifiants falsifiés ne produisent pas de mesures", () => {
  assert.equal(normalizeHeatingSnapshot({ version: 2, entities: { tankA: sensor("tankA", "41") } }, now).hasData, false);
  assert.equal(normalizeHeatingSnapshot({ version: 1, entities: { tankA: { entity_id: "sensor.other", state: "99" } } }, now).hasData, false);
});

await test("Défaut bois et servo optionnels : inconnus ne deviennent pas des valeurs rassurantes", () => {
  const status = normalizeHeatingSnapshot(snapshot([sensor("woodFault", "unavailable"), sensor("servo", "unavailable", 0, { unit_of_measurement: "%" })]), now);
  assert.equal(status.diagnostics.woodFault, null);
  assert.equal(status.diagnostics.servo.value, null);
  assert.equal(normalizeHeatingSnapshot(snapshot([sensor("woodFault", "on")]), now).diagnostics.woodFault, true);
  assert.equal(normalizeHeatingSnapshot(snapshot([sensor("servo", "120", 0, { unit_of_measurement: "%" })]), now).diagnostics.servo.value, null);
});

await test("Collecteur HA fait uniquement GET /api/states et garde un timeout", async () => {
  const calls = [];
  const readStates = createHeatingHaReader({ baseUrl: "http://ha.test:8123/", token: "test-token", fetchImpl: async (url, init) => {
    calls.push({ url, init }); return ok([sensor("tankA", "41")]);
  } });
  const result = await collectHeatingSnapshot({ readStates, now: () => now });
  assert.equal(result.connected, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://ha.test:8123/api/states");
  assert.equal(calls[0].init.method, "GET");
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  assert.equal(calls[0].init.body, undefined);
});

await test("HA 401/500 : message codifié, aucun corps contenant un secret", async () => {
  const readStates = createHeatingHaReader({ baseUrl: "http://ha.test:8123", token: "secret-token", fetchImpl: async () => ({ ok: false, status: 401, text: async () => "secret-body" }) });
  const result = await collectHeatingSnapshot({ readStates, previous: snapshot([sensor("tankA", "41")]), now: () => now });
  assert.equal(result.errorCode, "ha-http-error");
  assert.equal(result.connected, false);
  assert.equal(result.entities.tankA.state, "41");
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

await test("HA réponse malformée : ancien état gardé et erreur explicite", async () => {
  const result = await collectHeatingSnapshot({ readStates: async () => ({ unexpected: true }), previous: snapshot([sensor("tankA", "41")]), now: () => now });
  assert.equal(result.errorCode, "invalid-response");
  assert.equal(result.entities.tankA.state, "41");
});

await test("HA suspendu : annulation bornée et publication de la perte de liaison", async () => {
  const readStates = createHeatingHaReader({ baseUrl: "http://ha.test:8123", token: "test", timeoutMs: 15, fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  }) });
  const result = await collectHeatingSnapshot({ readStates, now: () => now });
  assert.equal(result.connected, false);
  assert.equal(result.errorCode, "ha-unreachable");
});

await test("Firebase n'écrit que le nœud chauffage et réutilise son jeton temporaire", async () => {
  const calls = [];
  const firebase = createHeatingFirebaseClient({ databaseUrl: "https://db.test", apiKey: "test-key", email: "test@example.invalid", password: "test-password", now: () => now, fetchImpl: async (url, init) => {
    calls.push({ url: String(url), init });
    return String(url).includes("signInWithPassword") ? ok({ idToken: "test-id-token", expiresIn: "3600" }) : ok(null);
  } });
  await firebase.read();
  const payload = snapshot([sensor("tankA", "41")]);
  await firebase.write(payload);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[1].init.method, "GET");
  assert.equal(calls[2].init.method, "PUT");
  assert.equal(new URL(calls[2].url).pathname, `/${HEATING_STATUS_PATH}.json`);
  assert.deepEqual(JSON.parse(calls[2].init.body), payload);
});

await test("Firebase timeout n'entraîne pas de nouvelle tentative d'écriture cachée", async () => {
  let writes = 0;
  const firebase = createHeatingFirebaseClient({ databaseUrl: "https://db.test", apiKey: "test", email: "test@example.invalid", password: "test", timeoutMs: 15, now: () => now, fetchImpl: async (url, init) => {
    if (String(url).includes("signInWithPassword")) return ok({ idToken: "test-id-token", expiresIn: "3600" });
    writes += 1;
    return new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
  } });
  await assert.rejects(firebase.write(snapshot([])), /firebase-unreachable/);
  assert.equal(writes, 1);
});

await test("Reprise après redémarrage et backoff plafonné à cinq minutes", () => {
  const old = snapshot([sensor("tankA", "41")]);
  assert.equal(restoreHeatingSnapshot(old).entities.tankA.state, "41");
  assert.equal(restoreHeatingSnapshot({ version: 2 }), null);
  assert.equal(heatingBackoffMs(0), 30_000);
  assert.equal(heatingBackoffMs(1), 60_000);
  assert.equal(heatingBackoffMs(10), 300_000);
});

console.log(`\n${passed} tests chauffage réussis.`);
