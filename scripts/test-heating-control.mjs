import test from "node:test";
import assert from "node:assert/strict";
import { normalizeHeatingControl, controlStatusFromHa, validateHeatingControlRequest, parseHaHeatingConfiguration } from "../src/lib/heating-control.ts";
import { createHeatingConfigurationHaClient, createHeatingControlFirebase, processHeatingControlRequests } from "./home-assistant-heating-control-bridge.mjs";

const now = Date.now();
const id = `${now}-0123456789abcdef0123456789abcdef`;
const request = () => ({ version: 1, id, mode: "automatic", manualTemperature: 60, minimumD: 58, requestedBy: "user_test", createdAt: now, expiresAt: now + 90_000, expectedRevision: 0, status: "pending" });
function states(revision = 0, requestId = "") {
  return [{ entity_id: "sensor.ferme_chauffage_controle", state: "observation", attributes: {
    schema_version: 1, revision, request_id: requestId, mode: "automatic", manual_temperature: 60, minimum_d: 58,
    phase: "observation", reason: "warming_up", recommended_temperature: 60, updated_at: new Date(now).toISOString(),
    calibration_valid: false, actuation_enabled: false, observed_temperature_d: 57, observed_temperature_b: 60,
  } }, { entity_id: "input_text.ferme_chauffage_configuration", state: JSON.stringify({ v: 1, r: revision, id: requestId, m: "automatic", t: 60, d: 58 }) }];
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

test("only a recent, observation-only HA status authorizes saving settings", () => {
  const good = controlStatusFromHa(states(), now);
  assert.equal(good.available, true); assert.equal(good.fresh, true);
  assert.equal(normalizeHeatingControl(good, now + 91_000).fresh, false);
  assert.equal(normalizeHeatingControl({ ...good, actuationEnabled: true }, now).available, false);
  assert.equal(normalizeHeatingControl({ ...good, calibrationValid: true }, now).available, false);
  assert.equal(normalizeHeatingControl({ ...good, version: 2 }, now).available, false);
});
test("an absent controller cannot be mistaken for an available manual mode", () => {
  assert.equal(controlStatusFromHa([], now).available, false);
  assert.equal(parseHaHeatingConfiguration([]), null);
  assert.equal(controlStatusFromHa([{ entity_id: "sensor.ferme_chauffage_controle", state: "unavailable" }], now).fresh, false);
});
test("request validation rejects expiry, replay keys, out-of-range and hidden payloads", () => {
  assert.deepEqual(validateHeatingControlRequest(request(), id, now), request());
  for (const change of [{ expiresAt: now }, { createdAt: now + 31_000 }, { expiresAt: now + 91_000 }, { manualTemperature: 91 }, { manualTemperature: "60" }, { minimumD: 39 }, { expectedRevision: -1 }, { expectedRevision: 0.5 }, { expectedRevision: 999999999 }, { status: "accepted" }, { actuator: true }, { entity_id: "switch.any" }, { mode: "off" }, { mode: ["manual"] }]) {
    assert.throws(() => validateHeatingControlRequest({ ...request(), ...change }, id, now));
  }
  assert.throws(() => validateHeatingControlRequest(request(), "different-key", now));
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
