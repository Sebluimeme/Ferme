import test from "node:test";
import assert from "node:assert/strict";
import { normalizeHeatingControl, controlStatusFromHa, validateHeatingControlRequest, parseHaHeatingConfiguration, validHeatingSettings, heatingConfigurationReceiptState, heatingSettingsFromDraft, heatingDisplayedTarget } from "../src/lib/heating-control.ts";
import { createHeatingConfigurationHaClient, createHeatingControlFirebase, processHeatingControlRequests } from "./home-assistant-heating-control-bridge.mjs";

const now = Date.now();
const id = `${now}-0123456789abcdef0123456789abcdef`;
const request = () => ({ version: 2, id, mode: "automatic", manualTemperature: 60, minimumD: 57, requestedBy: "user_test", createdAt: now, expiresAt: now + 90_000, expectedRevision: 0, status: "pending" });
function states(revision = 0, requestId = "") {
  return [{ entity_id: "sensor.ferme_chauffage_controle", state: "active", attributes: {
    schema_version: 2, revision, request_id: requestId, mode: "automatic", manual_temperature: 60, minimum_d: 57,
    phase: "active", reason: "warming_up", recommended_temperature: 60, updated_at: new Date(now).toISOString(),
    calibration_valid: true, actuation_enabled: true, observed_temperature_d: 57, observed_temperature_b: 60,
    fuel_minimum: 50, fuel_maximum: 70, release_temperature_d: 60,
    module_online: true, module_last_seen_at: new Date(now).toISOString(),
    delivery_state: "pending", desired_temperature: 60, last_transmitted_temperature: null,
    last_transmitted_at: null, position_feedback: "unmeasured",
  } }, { entity_id: "input_text.ferme_chauffage_configuration", state: JSON.stringify({ v: 1, r: revision, id: requestId, m: "automatic", t: 60, d: 57 }) }];
}
function fixture(value = request(), options = {}) {
  const calls = []; let current = states();
  const firebase = {
    requests: async () => ({ [id]: value }),
    readRequest: async () => ({ data: value, etag: '"old"' }),
    claim: async () => { calls.push("claim"); return options.claim !== false; },
    finish: async (key, state) => { calls.push(state); },
    writeStatus: async () => calls.push("status"),
  };
  const ha = {
    configure: async v => { calls.push("configure"); if (options.applied !== false) current = states(1, v.id); if (options.lostReply) throw new Error("timeout"); },
    readStates: async () => current,
  };
  return { calls, firebase, ha, states: states(), now: () => now };
}

test("only a valid recent v2 status authorizes saving configuration; v1 never enables the actuator", () => {
  const good = controlStatusFromHa(states(), now);
  assert.equal(good.available, true); assert.equal(good.fresh, true);
  assert.equal(good.version, 2); assert.equal(good.actuationEnabled, true);
  assert.equal(normalizeHeatingControl(good, now + 91_000).fresh, false);
  const disabled = normalizeHeatingControl({ ...good, actuationEnabled: false, calibrationValid: false, deliveryState: "disabled" }, now);
  assert.equal(disabled.available, true); assert.equal(disabled.actuationEnabled, false);
  for (const version of [1, "2", true, 3]) {
    const old = normalizeHeatingControl({ ...good, version }, now);
    assert.equal(old.available, false); assert.equal(old.actuationEnabled, false);
    assert.equal(old.desiredTemperature, null);
  }
});
test("strict v2 status rejects fake booleans, numeric strings, invalid limits and feedback claims", () => {
  const good = controlStatusFromHa(states(), now);
  for (const change of [
    { actuationEnabled: "true" }, { calibrationValid: "true" }, { moduleOnline: 1 }, { moduleOnline: "false" },
    { calibrationValid: false }, { available: "true" }, { revision: true }, { phase: "observation" },
    { fuelMinimum: "50" }, { fuelMaximum: 90 }, { releaseTemperatureD: 59 }, { positionFeedback: "measured" },
    { desiredTemperature: "60" }, { desiredTemperature: true }, { desiredTemperature: Number.NaN }, { desiredTemperature: 71 },
    { lastTransmittedTemperature: Infinity }, { deliveryState: ["pending"] }, { moduleLastSeenAt: "bad-date" },
    { lastTransmittedAt: new Date(now + 31_000).toISOString() }, { deliveryState: "transmitted" },
  ]) {
    const value = normalizeHeatingControl({ ...good, ...change }, now);
    assert.equal(value.available, false, JSON.stringify(change));
    assert.equal(value.actuationEnabled, false);
  }
  const badMeasurements = normalizeHeatingControl({ ...good, temperatureD: true, temperatureB: "60", recommendedTemperature: 85, nextAdjustmentAt: "wrong" }, now);
  assert.equal(badMeasurements.temperatureD, null); assert.equal(badMeasurements.temperatureB, null);
  assert.equal(badMeasurements.recommendedTemperature, null); assert.equal(badMeasurements.nextAdjustmentAt, null);
});
test("incomplete HA calibration remains readable with configuration available and physical delivery blocked", () => {
  const raw = states();
  Object.assign(raw[0].attributes, {
    phase: "suspended", reason: "calibration_required", calibration_valid: false,
    actuation_enabled: false, delivery_state: "disabled", desired_temperature: null,
  });
  const status = controlStatusFromHa(raw, now);
  assert.equal(status.available, true); assert.equal(status.fresh, true);
  assert.equal(status.phase, "suspended"); assert.equal(status.reason, "calibration_required");
  assert.equal(status.calibrationValid, false); assert.equal(status.actuationEnabled, false);
  assert.equal(status.deliveryState, "disabled"); assert.equal(status.desiredTemperature, null);
  assert.equal(status.positionFeedback, "unmeasured");
  raw[0].attributes.actuation_enabled = true;
  const invalid = controlStatusFromHa(raw, now);
  assert.equal(invalid.available, false); assert.equal(invalid.actuationEnabled, false);
});
test("waiting desired temperature stays separate from the previous API transmission", () => {
  const raw = states();
  const sentAt = new Date(now - 3_600_000).toISOString();
  Object.assign(raw[0].attributes, {
    module_online: false, phase: "suspended", reason: "sensor_b_unavailable", delivery_state: "waiting_module",
    desired_temperature: 62, last_transmitted_temperature: 55, last_transmitted_at: sentAt,
  });
  const status = controlStatusFromHa(raw, now);
  assert.equal(status.available, true); assert.equal(status.fresh, true);
  assert.equal(status.desiredTemperature, 62); assert.equal(status.deliveryState, "waiting_module");
  assert.equal(status.lastTransmittedTemperature, 55); assert.equal(status.lastTransmittedAt, sentAt);
  assert.equal(status.moduleOnline, false); assert.equal(status.positionFeedback, "unmeasured");
  assert.equal("appliedTemperature" in status, false); assert.equal("servoPosition" in status, false);
});
test("nullable Firebase fields are optional but a transmitted state requires a dated API record", () => {
  const raw = states();
  delete raw[0].attributes.last_transmitted_at; delete raw[0].attributes.last_transmitted_temperature;
  delete raw[0].attributes.module_last_seen_at; delete raw[0].attributes.desired_temperature;
  assert.equal(controlStatusFromHa(raw, now).available, true);
  raw[0].attributes.delivery_state = "transmitted";
  assert.equal(controlStatusFromHa(raw, now).available, false);
  Object.assign(raw[0].attributes, { last_transmitted_temperature: 60, last_transmitted_at: new Date(now).toISOString() });
  assert.equal(controlStatusFromHa(raw, now).available, true);
  raw[0].attributes.next_adjustment_at = Number.MAX_VALUE;
  assert.equal(controlStatusFromHa(raw, now).nextAdjustmentAt, null);
});
test("an absent controller cannot be mistaken for an available manual mode", () => {
  assert.equal(controlStatusFromHa([], now).available, false);
  assert.equal(parseHaHeatingConfiguration([]), null);
  assert.equal(controlStatusFromHa([{ entity_id: "sensor.ferme_chauffage_controle", state: "unavailable" }], now).fresh, false);
});
test("request validation rejects expiry, replay keys, out-of-range and hidden payloads", () => {
  assert.deepEqual(validateHeatingControlRequest(request(), id, now), request());
  for (const change of [{ version: 1 }, { version: "2" }, { expiresAt: now }, { createdAt: now + 31_000 }, { expiresAt: now + 91_000 }, { manualTemperature: 71 }, { manualTemperature: 49 }, { manualTemperature: "60" }, { manualTemperature: true }, { manualTemperature: Number.NaN }, { minimumD: 54 }, { minimumD: 60 }, { minimumD: "57" }, { minimumD: true }, { minimumD: Number.NaN }, { expectedRevision: -1 }, { expectedRevision: 0.5 }, { expectedRevision: 999999999 }, { status: "accepted" }, { actuator: true }, { entity_id: "switch.any" }, { mode: "off" }, { mode: ["manual"] }]) {
    assert.throws(() => validateHeatingControlRequest({ ...request(), ...change }, id, now));
  }
  assert.throws(() => validateHeatingControlRequest(request(), "different-key", now));
  const oldKey = `${now - 60_000}-0123456789abcdef0123456789abcdef`;
  assert.throws(() => validateHeatingControlRequest({ ...request(), id: oldKey }, oldKey, now));
  assert.throws(() => validateHeatingControlRequest({ ...request(), createdAt: now - 1000, expiresAt: now + 1000 }, id, now));
});
test("manual and automatic settings enforce commissioned bounds and preserve internal helper v1", () => {
  for (const manualTemperature of [50, 70]) for (const minimumD of [55, 59]) {
    assert.equal(validHeatingSettings({ mode: "manual", manualTemperature, minimumD }), true);
  }
  assert.deepEqual(parseHaHeatingConfiguration(states(5, id)), { revision: 5, requestId: id });
  const malformed = states();
  for (const change of [{ v: 2 }, { t: 90 }, { d: 60 }, { r: true }, { d: "57" }]) {
    malformed[1].state = JSON.stringify({ v: 1, r: 5, id, m: "automatic", t: 60, d: 57, ...change });
    assert.equal(parseHaHeatingConfiguration(malformed), null);
  }
});
test("configuration receipts validate identity and v2 without claiming physical transmission", () => {
  const receipt = { ...request(), status: "accepted", processedAt: now + 1000 };
  assert.equal(heatingConfigurationReceiptState(receipt, id, "user_test"), "accepted");
  for (const change of [{ version: 1 }, { requestedBy: "other-user" }, { id: "wrong" }, { status: "transmitted" }, { status: ["accepted"] }, { manualTemperature: 90 }, { expectedRevision: true }]) {
    assert.equal(heatingConfigurationReceiptState({ ...receipt, ...change }, id, "user_test"), null);
  }
});
test("switching mode can save its valid field without silently submitting an invalid hidden draft", () => {
  const confirmed = { mode: "manual", manualTemperature: 60, minimumD: 57 };
  assert.equal(heatingSettingsFromDraft("manual", 71, 57, confirmed), null);
  assert.deepEqual(heatingSettingsFromDraft("automatic", 71, 57, confirmed), { mode: "automatic", manualTemperature: 60, minimumD: 57 });
  assert.equal(heatingSettingsFromDraft("automatic", 60, 60, confirmed), null);
  assert.deepEqual(heatingSettingsFromDraft("manual", 62, 60, confirmed), { mode: "manual", manualTemperature: 62, minimumD: 57 });
  assert.deepEqual(heatingSettingsFromDraft("automatic", Number.NaN, 56, confirmed), { mode: "automatic", manualTemperature: 60, minimumD: 56 });
  assert.deepEqual(heatingSettingsFromDraft("manual", 61, Number.NaN, confirmed), { mode: "manual", manualTemperature: 61, minimumD: 57 });
  assert.deepEqual(heatingSettingsFromDraft("automatic", 62, 58, confirmed), { mode: "automatic", manualTemperature: 62, minimumD: 58 });
  assert.deepEqual(confirmed, { mode: "manual", manualTemperature: 60, minimumD: 57 });
});

test("Firebase queries omit ETag while single-request reads obtain it for CAS", async () => {
  const calls = [];
  const firebase = createHeatingControlFirebase({ url: "https://demo.test", apiKey: "test", email: "test", password: "test", now: () => now,
    fetchImpl: async (url, init) => {
      const parsed = new URL(url);
      if (parsed.hostname === "identitytoolkit.googleapis.com") return new Response(JSON.stringify({ idToken: "test-token", expiresIn: "3600" }));
      calls.push({ url: parsed, init });
      if (parsed.searchParams.has("orderBy") && init.headers["X-Firebase-ETag"]) return new Response("unsupported", { status: 400 });
      return new Response(JSON.stringify({}), { headers: { etag: '"revision"' } });
    },
  });
  await firebase.requests();
  const single = await firebase.readRequest(id);
  assert.equal(calls[0].url.searchParams.get("limitToLast"), "30");
  assert.equal(calls[0].init.headers["X-Firebase-ETag"], undefined);
  assert.equal(calls[1].init.headers["X-Firebase-ETag"], "true");
  assert.equal(single.etag, '"revision"');
});
test("accepted receipt requires authoritative HA revision and request id", async () => {
  const f = fixture(); await processHeatingControlRequests(f);
  assert.deepEqual(f.calls, ["claim", "configure", "status", "accepted"]);
});
test("lost HTTP reply is resolved by readback, never by repeating the command", async () => {
  const f = fixture(request(), { lostReply: true }); await processHeatingControlRequests(f);
  assert.equal(f.calls.filter(x => x === "configure").length, 1);
  assert.equal(f.calls.at(-1), "accepted");
});
test("an unconfirmed action is never labelled accepted", async () => {
  const f = fixture(request(), { lostReply: true, applied: false }); await processHeatingControlRequests(f);
  assert.equal(f.calls.at(-1), "uncertain");
});
test("conflicting revision and stale controller prevent a call to HA", async () => {
  for (const stale of [false, true]) {
    const f = fixture(stale ? request() : { ...request(), expectedRevision: 1 });
    if (stale) f.states[0].attributes.updated_at = new Date(now - 91_000).toISOString();
    await processHeatingControlRequests(f); assert.deepEqual(f.calls, ["rejected"]);
  }
});
test("failed CAS claim cannot execute a request owned by another process", async () => {
  const f = fixture(request(), { claim: false }); await processHeatingControlRequests(f);
  assert.deepEqual(f.calls, ["claim"]);
});
test("requests marked processing on restart are reconciled without replay", async () => {
  for (const applied of [false, true]) {
    const f = fixture({ ...request(), status: "processing", expiresAt: now - 1, claimedAt: now - 100_000 });
    if (applied) f.states = states(1, id);
    await processHeatingControlRequests(f);
    assert.deepEqual(f.calls, [applied ? "accepted" : "uncertain"]);
  }
});
test("a second worker leaves a still-processing recent request alone", async () => {
  const f = fixture({ ...request(), status: "processing", claimedAt: now });
  await processHeatingControlRequests(f); assert.deepEqual(f.calls, []);
});
test("expired pending requests never enter the HA script", async () => {
  const f = fixture({ ...request(), expiresAt: now - 1 });
  await processHeatingControlRequests(f); assert.deepEqual(f.calls, ["rejected"]);
});
test("the HA client has exactly one configuration service and sends no physical target", async () => {
  const calls = [];
  const client = createHeatingConfigurationHaClient({ url: "http://ha.local:8123", token: "test-only", fetchImpl: async (url, init) => {
    calls.push({ url, init }); return new Response(JSON.stringify([]), { status: 200 });
  } });
  await client.configure(request());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://ha.local:8123/api/services/script/ferme_chauffage_configurer");
  assert.deepEqual(Object.keys(JSON.parse(calls[0].init.body)).sort(), ["mode", "manual_temperature", "minimum_d", "request_id", "expires_at", "expected_revision"].sort());
  assert.equal(JSON.parse(calls[0].init.body).expires_at, Math.floor((now + 90_000) / 1000));
});

test("offline module keeps a dated API setting visible without inventing an automatic decision", () => {
  const status = { ...controlStatusFromHa(states(), now), mode: "automatic", phase: "suspended", reason: "sensor_b_unavailable", moduleOnline: false, deliveryState: "waiting_module", desiredTemperature: null, recommendedTemperature: null, lastTransmittedTemperature: 61, lastTransmittedAt: new Date(now - 600_000).toISOString() };
  const original = structuredClone(status);
  assert.deepEqual(heatingDisplayedTarget(status), { value: 61, label: "Consigne conservée", detail: "Calcul suspendu" });
  assert.deepEqual(status, original);
  assert.equal(heatingDisplayedTarget({ ...status, desiredTemperature: 50 }).value, 50);
  assert.equal(heatingDisplayedTarget({ ...status, desiredTemperature: 50 }).label, "Consigne théorique");
  assert.equal(heatingDisplayedTarget({ ...status, mode: "manual", manualTemperature: 55 }).value, 55);
  assert.equal(heatingDisplayedTarget({ ...status, lastTransmittedAt: null }).value, null);
  assert.equal(heatingDisplayedTarget({ ...status, lastTransmittedTemperature: null }).value, null);
  assert.equal(heatingDisplayedTarget({ ...status, available: false }).value, null);
});

test("an old displayed calculation is labelled as old even if it has a numeric value", () => {
  const status = { ...controlStatusFromHa(states(), now), mode: "automatic", desiredTemperature: 63 };
  for (const [value, offline] of [[status, true], [{ ...status, fresh: false }, false]]) {
    assert.deepEqual(heatingDisplayedTarget(value, offline), { value: 63, label: "Dernière consigne calculée", detail: "Calcul ancien" });
  }
});
