#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  HEATING_ENTITY_IDS, HEATING_STATUS_PATH, buildHeatingSnapshot, heatingFailureSnapshot,
  normalizeHeatingSnapshot, classifyHeatingFreshness, selectHeatingEntities, formatHeatingValue,
  mergeHeatingLastValid,
} from "../src/lib/chauffage.ts";
import {
  createHeatingHaReader, createHeatingFirebaseClient, collectHeatingSnapshot,
  restoreHeatingSnapshot, heatingBackoffMs,
  createHeatingHaHistoryReader, parseHeatingRelayArgs,
  publishHeatingCycle,
} from "./home-assistant-chauffage-bridge.mjs";
import {
  HEATING_HISTORY_PATH, heatingHistoryUpdates, heatingHistoryPointPath, normalizeHeatingHistory,
  heatingHistoryDays, mergeHeatingHistoryUpdates, validateHeatingHistoryUpdates, importHeatingRecorderHistory,
} from "../src/lib/chauffage-history.ts";

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
  for (const date of [iso(-10 * 60_000), "1960-01-01T00:00:00Z", "wrong-date", null]) {
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

await test("Date de mesure future rejetée même après une relève récente du relais", () => {
  const status = normalizeHeatingSnapshot(snapshot([sensor("tankA", "41", -10 * 60_000)]), now);
  assert.equal(status.measurements.tankA.value, null);
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

await test("Une sonde indisponible conserve sa dernière température sans rajeunir sa date", () => {
  const good = snapshot([sensor("tankB", "59.8", 2 * 60 * 60_000)]);
  const outage = buildHeatingSnapshot([sensor("tankB", "unavailable", 60_000)], iso(), good);
  const value = normalizeHeatingSnapshot(outage, now).measurements.tankB;
  assert.equal(value.value, 59.8);
  assert.equal(value.isFallback, true);
  assert.equal(value.availability, "unavailable");
  assert.equal(value.reportedAt, iso(2 * 60 * 60_000));
  assert.equal(value.sourceStateAt, iso(60_000));
  assert.equal(value.freshness, "stale");
  assert.equal(outage.lastValid.tankB.state, "59.8");
});

await test("Redémarrer pendant une panne conserve lastValid puis accepte la reprise du capteur", () => {
  const good = snapshot([sensor("tankA", "43", 2 * 60 * 60_000)]);
  const unavailable = buildHeatingSnapshot([sensor("tankA", "unavailable")], iso(), good);
  const restored = restoreHeatingSnapshot(JSON.parse(JSON.stringify(unavailable)), now);
  const failed = heatingFailureSnapshot(restored, iso(), "ha-unreachable");
  assert.equal(normalizeHeatingSnapshot(failed, now).measurements.tankA.value, 43);
  const recovered = buildHeatingSnapshot([sensor("tankA", "44", 0)], iso(), failed);
  const value = normalizeHeatingSnapshot(recovered, now).measurements.tankA;
  assert.equal(value.value, 44);
  assert.equal(value.isFallback, false);
  assert.equal(value.reportedAt, iso());
});

await test("Unités invalides et dates futures ne remplacent jamais une dernière valeur valide ; zéro est valide", () => {
  const good = snapshot([sensor("tankA", "0", 120_000)]);
  for (const invalid of [sensor("tankA", "100", 0, {unit_of_measurement: "°F"}), sensor("tankA", "42", -120_000)]) {
    const retained = buildHeatingSnapshot([invalid], iso(), good);
    const value = normalizeHeatingSnapshot(retained, now).measurements.tankA;
    assert.equal(value.value, 0);
    assert.equal(value.isFallback, true);
    assert.equal(value.reportedAt, iso(120_000));
    assert.equal(value.availability, "invalid");
  }
});

await test("Un ancien import n'écrase pas une observation plus récente", () => {
  const newer = sensor("tankA", "43", 60_000);
  const older = sensor("tankA", "40", 120_000);
  const merged = mergeHeatingLastValid({tankA:newer}, {}, {tankA:older}, now);
  assert.equal(merged.tankA.state, "43");
  const status = normalizeHeatingSnapshot({ version:1, connected:true, checkedAt:iso(), lastSuccessfulAt:iso(), entities:{tankA:older}, lastValid:merged }, now);
  assert.equal(status.measurements.tankA.value,43);
  assert.equal(status.measurements.tankA.isFallback,true);
});

await test("Sans dernière valeur, la date de l'état indisponible n'est pas une date de mesure", () => {
  const value = normalizeHeatingSnapshot(snapshot([sensor("tankA", "unavailable")]), now).measurements.tankA;
  assert.equal(value.value, null);
  assert.equal(value.reportedAt, null);
  assert.equal(value.sourceStateAt, iso(60_000));
});

await test("L'historique utilise la date réelle de mesure et ne réarchive pas les polls identiques", () => {
  const first = snapshot([sensor("tankA", "41", 120_000)]);
  const points = Object.values(heatingHistoryUpdates(first)).filter((point) => point.kind === "measurement");
  assert.deepEqual(points, [{at: now - 120_000, value: 41, kind: "measurement"}]);
  const next = buildHeatingSnapshot(Object.values(first.entities), iso(-30_000), first);
  assert.equal(Object.keys(heatingHistoryUpdates(next, first)).length, 0);
});

await test("Une coupure produit un gap, pas des températures maintenues artificiellement", () => {
  const first = snapshot([sensor("tankA", "41", 120_000)]);
  const outage = buildHeatingSnapshot([sensor("tankA", "unavailable", 60_000)], iso(), first);
  const changes = heatingHistoryUpdates(outage, first);
  const points = Object.entries(changes).filter(([key]) => key.startsWith("tankA/"));
  assert.equal(points.length, 1);
  assert.equal(points[0][1].kind, "gap");
  assert.equal(points[0][1].at, now - 60_000);
  assert.equal(points[0][1].value, null);
  assert.equal(Object.keys(heatingHistoryUpdates(outage, outage)).length, 0);
});

await test("Coupure réseau globale : un gap par série, une seule fois", () => {
  const first = snapshot([sensor("tankA", "41")]);
  const outage = heatingFailureSnapshot(first, iso(), "ha-unreachable");
  assert.equal(Object.values(heatingHistoryUpdates(outage, first)).length, 6);
  const again = heatingFailureSnapshot(outage, iso(-30_000), "ha-unreachable");
  assert.equal(Object.keys(heatingHistoryUpdates(again, outage)).length, 0);
});

await test("Mesure, panne et reprise dans une même minute conservent la rupture", () => {
  const minute = Math.floor(now / 60_000) * 60_000;
  const a = {at:minute + 1000, value:41, kind:"measurement"};
  const gap = {at:minute + 2000, value:null, kind:"gap"};
  const b = {at:minute + 3000, value:42, kind:"measurement"};
  const updates = {};
  for (const point of [a, gap, b, a]) mergeHeatingHistoryUpdates(updates, {[heatingHistoryPointPath("tankA", point)]:point});
  assert.equal(Object.keys(updates).length, 2);
  assert.deepEqual(normalizeHeatingHistory(updates), [gap, b]);
});

await test("Décodage d'archives multi-jours, tri, déduplication et rejet des points invalides", () => {
  const valid = {at:now, value:42, kind:"measurement"};
  const gap = {at:now-1000, value:null, kind:"gap"};
  assert.deepEqual(normalizeHeatingHistory({"2026-10-22":{a:valid,b:valid,c:gap,d:{at:"wrong",value:1,kind:"measurement"}}}), [gap,valid]);
  assert.deepEqual(heatingHistoryDays(Date.parse("2026-10-21T23:00:00Z"), now), ["2026-10-21","2026-10-22"]);
});

await test("Un import Recorder retrouve une température antérieure à une panne avec ses dates originales", () => {
  const from = now - 86_400_000;
  const good = sensor("tankB", "59.8", 2 * 60 * 60_000);
  const outage = sensor("tankB", "unavailable", 60_000);
  const imported = importHeatingRecorderHistory([[good,outage]], from, now);
  assert.equal(imported.lastValid.tankB.state, "59.8");
  assert.equal(imported.lastValid.tankB.last_reported, good.last_updated);
  assert.deepEqual(normalizeHeatingHistory(imported.updates).map((p)=>p.kind), ["measurement","gap"]);
});

await test("Le point initial synthétique Recorder ne rajeunit pas la dernière valeur", () => {
  const from = now - 86_400_000;
  const originalAt = now - 3 * 86_400_000;
  const synthetic = {...sensor("tankB","55"),last_updated:new Date(from).toISOString(),last_changed:new Date(originalAt).toISOString()};
  const imported = importHeatingRecorderHistory([[synthetic]],from,now);
  assert.equal(imported.lastValid.tankB.last_reported,new Date(originalAt).toISOString());
  assert.equal(Object.keys(imported.updates).length,0);
  const uncertain = {...synthetic,last_changed:new Date(from).toISOString()};
  assert.equal(Object.keys(importHeatingRecorderHistory([[uncertain]],from,now).lastValid).length,0);
});

await test("Recorder refuse une unité incorrecte et une observation postérieure à la requête", () => {
  const imported = importHeatingRecorderHistory([[sensor("tankA","100",0,{unit_of_measurement:"°F"}),sensor("tankB","50",-120_000)]],now-86_400_000,now);
  assert.equal(Object.keys(imported.lastValid).length,0);
  assert.equal(Object.values(imported.updates).some((p)=>p.kind==="measurement"),false);
});

await test("Historique Home Assistant : GET seulement, six entités ciblées et sept jours maximum", async () => {
  const calls=[];
  const read = createHeatingHaHistoryReader({baseUrl:"http://ha.test:8123",token:"test",fetchImpl:async(url,init)=>{calls.push({url:new URL(url),init});return ok([]);}});
  await read(now-86_400_000,now);
  assert.equal(calls[0].init.method,"GET");
  assert.equal(calls[0].init.body,undefined);
  assert.equal(calls[0].url.searchParams.get("filter_entity_id").split(",").length,6);
  assert.equal(calls[0].url.searchParams.has("minimal_response"),false);
  await assert.rejects(read(now-8*86_400_000,now),/invalid-history-range/);
  assert.deepEqual(parseHeatingRelayArgs(["--once","--backfill-days","7"]),{once:true,backfillDays:7});
  assert.throws(()=>parseHeatingRelayArgs(["--backfill-days","30"]),/usage/);
});

await test("Firebase historique : PATCH limité au nœud dédié, clé idempotente, aucune suppression", async () => {
  const calls=[];
  const firebase=createHeatingFirebaseClient({databaseUrl:"https://db.test",apiKey:"test",email:"x@example.invalid",password:"test",now:()=>now,fetchImpl:async(url,init)=>{
    calls.push({url:String(url),init});return String(url).includes("signInWithPassword")?ok({idToken:"test",expiresIn:"3600"}):ok(null);
  }});
  const point={at:now,value:41,kind:"measurement"};
  const updates={[heatingHistoryPointPath("tankA",point)]:point};
  await firebase.writeHistory(updates);
  await firebase.writeHistory(updates);
  assert.equal(calls.length,3);
  for (const call of calls.slice(1)) {
    assert.equal(new URL(call.url).pathname,`/${HEATING_HISTORY_PATH}.json`);
    assert.equal(call.init.method,"PATCH");
    assert.deepEqual(JSON.parse(call.init.body),updates);
  }
  for (const malicious of [{"../finance":point},{"tankA/2026-10-22/x":null},{"woodFault/2026-10-22/1":point}]) {
    assert.throws(()=>validateHeatingHistoryUpdates(malicious),/invalid-history-updates/);
    assert.throws(()=>firebase.writeHistory(malicious),/invalid-history-updates/);
  }
  assert.equal(calls.length,3);
});

await test("Un échec d'archive ne bloque pas le statut ; le lot en attente est réessayé sans nouvelles dates", async () => {
  const current=snapshot([sensor("tankA","42")]);
  const writes=[];
  let fail=true;
  const firebase={write:async(value)=>writes.push(value),writeHistory:async()=>{if(fail)throw new Error("offline");}};
  const result=await publishHeatingCycle({firebase,current});
  assert.equal(writes.length,1);
  assert.equal(result.historyError,"unexpected-failure");
  const firstPayload=JSON.stringify(result.pendingHistory);
  fail=false;
  const next=await publishHeatingCycle({firebase,current,previous:current,pendingHistory:result.pendingHistory});
  assert.equal(writes.length,2);
  assert.equal(next.historyError,null);
  assert.deepEqual(next.pendingHistory,{});
  assert.equal(JSON.stringify(result.pendingHistory),firstPayload);
});

console.log(`\n${passed} tests chauffage réussis.`);
