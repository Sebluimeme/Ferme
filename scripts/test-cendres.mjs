import assert from "node:assert/strict";
import {
  CENDRES_MAX_ATTEMPTS, buildCleaning, buildReminder, cancelReminder, normalizeCendres, isDue, isReminderActive, cendresEmailText,
} from "../src/lib/cendres.ts";
import { cendresApprovalFingerprint, dispatchCendresReminder, readCendresMailConfig, ResendTransport } from "../src/lib/cendres-mail.ts";
import { createRestCendresStore } from "../src/lib/cendres-store-server.ts";

const T0 = Date.parse("2026-11-13T10:00:00Z"), MIN = 60_000;
let n = 0; const tests = [];
const test = (name, fn) => tests.push([name, fn]);

/** Base mémoire à version (ETag) : toute écriture change la version, comme Firebase REST. */
function memoryDb(initial = {}) {
  const db = { data: { cleanings: {}, reminder: null, ...initial }, v: 1 };
  db.write = (reminder) => { db.data.reminder = reminder; db.v += 1; };
  db.store = {
    async read() { const s = normalizeCendres(db.data); return { reminder: s.reminder, lastCleaningAt: s.cleanings[0]?.at ?? null, version: String(db.v) }; },
    async writeIfUnchanged(reminder, version) { if (version !== String(db.v)) return false; db.write(reminder); return true; },
  };
  return db;
}
class FakeTransport { sent = []; failures = 0; keys = new Set(); hook = null;
  async send(m) { if (this.hook) await this.hook(m); if (this.failures > 0) { this.failures--; throw new Error("Échec simulé du transport"); }
    if (this.keys.has(m.idempotencyKey)) return; this.keys.add(m.idempotencyKey); this.sent.push(m); } }
const CONFIG = (() => { const to = "test@example.org", from = "Ferme <ferme@example.org>"; return { enabled: true, to, from, approval: cendresApprovalFingerprint(to, from) }; })();
const reminderIn = (min, now = T0) => buildReminder(`r${++n}`, now, { delayMinutes: min });
const run = (db, tr, now, config = CONFIG) => dispatchCendresReminder({ store: db.store, transport: tr, config, now });

test("historique : tri, dates invalides et futures refusées, données corrompues ignorées", () => {
  const a = buildCleaning("a", T0, "2026-11-01T08:00:00Z"), b = buildCleaning("b", T0);
  const s = normalizeCendres({ cleanings: { a, b, x: { at: "n'importe quoi" }, y: 5 }, reminder: { id: 1 } });
  assert.deepEqual(s.cleanings.map(c => c.id), ["b", "a"]); assert.equal(s.reminder, null);
  assert.throws(() => buildCleaning("c", T0, "2027-01-01T00:00:00Z"), /futur/); assert.throws(() => buildCleaning("c", T0, "zzz"), /invalide/);
});
test("rappel : délai ou date, passé / trop lointain / vide refusés, annulation", () => {
  assert.equal(reminderIn(90).dueAt, "2026-11-13T11:30:00.000Z");
  assert.equal(buildReminder("r", T0, { dueAt: "2026-12-01T07:00:00Z" }).dueAt, "2026-12-01T07:00:00.000Z");
  assert.throws(() => buildReminder("r", T0, { dueAt: "2026-11-01T00:00:00Z" }), /futur/); assert.throws(() => buildReminder("r", T0, {}), /Choisis/);
  assert.throws(() => buildReminder("r", T0, { delayMinutes: 1e8 }), /lointaine/); assert.throws(() => buildReminder("r", T0, { delayMinutes: 0 }), /futur/);
  const r = reminderIn(5); assert.equal(isReminderActive(r), true); assert.equal(cancelReminder(r).status, "cancelled");
  assert.throws(() => cancelReminder(cancelReminder(r)), /Aucun rappel actif/); assert.equal(isDue(r, T0 + 4 * MIN), false); assert.equal(isDue(r, T0 + 5 * MIN), true);
});
test("échéance : rien avant l'heure, un seul envoi, jamais répété ; contenu correct", async () => {
  const db = memoryDb({ reminder: reminderIn(60), cleanings: { a: buildCleaning("a", T0, "2026-11-01T08:00:00Z") } }), tr = new FakeTransport();
  assert.equal(await run(db, tr, T0 + 59 * MIN), "not_due");
  assert.equal(await run(db, tr, T0 + 61 * MIN), "sent");
  for (let i = 0; i < 4; i++) assert.equal(await run(db, tr, T0 + (62 + i) * MIN), "none");
  assert.equal(tr.sent.length, 1); assert.equal(tr.sent[0].to, "test@example.org"); assert.match(tr.sent[0].text, /Dernier nettoyage enregistré/);
  assert.equal(db.data.reminder.status, "sent"); assert.match(tr.sent[0].idempotencyKey, /^cendres-r\d+$/);
});
test("annulation puis reprogrammation : l'annulé n'est jamais envoyé", async () => {
  const db = memoryDb({ reminder: reminderIn(10) }), tr = new FakeTransport();
  db.write(cancelReminder(db.data.reminder)); assert.equal(await run(db, tr, T0 + 20 * MIN), "none"); assert.equal(tr.sent.length, 0);
  db.write(reminderIn(30, T0 + 20 * MIN)); assert.equal(await run(db, tr, T0 + 40 * MIN), "not_due"); assert.equal(await run(db, tr, T0 + 51 * MIN), "sent"); assert.equal(tr.sent.length, 1);
});
test("doublons : deux exécutions simultanées = un seul e-mail", async () => {
  const db = memoryDb({ reminder: reminderIn(1) }), tr = new FakeTransport();
  const out = await Promise.all([run(db, tr, T0 + 2 * MIN), run(db, tr, T0 + 2 * MIN), run(db, tr, T0 + 2 * MIN)]);
  assert.equal(tr.sent.length, 1); assert.deepEqual(out.sort(), ["lost_race", "lost_race", "sent"]);
});
test("modification pendant l'envoi : le nouveau rappel n'est pas écrasé", async () => {
  const db = memoryDb({ reminder: reminderIn(1) }), tr = new FakeTransport(); const fresh = reminderIn(500, T0 + 2 * MIN);
  tr.hook = async () => { db.write(fresh); }; // l'utilisateur reprogramme pendant l'appel au fournisseur
  await run(db, tr, T0 + 2 * MIN); assert.deepEqual(db.data.reminder, fresh);
});
test("modification juste avant le claim : aucun envoi de l'ancien rappel", async () => {
  const db = memoryDb({ reminder: reminderIn(1) }), tr = new FakeTransport(); const read = db.store.read;
  db.store.read = async () => { const r = await read(); db.write(reminderIn(900, T0 + 2 * MIN)); return r; }; // changement entre lecture et claim
  assert.equal(await run(db, tr, T0 + 2 * MIN), "lost_race"); assert.equal(tr.sent.length, 0);
});
test("erreurs : essais espacés (5 min, 30 min, 2 h) puis arrêt visible ; reprise réussie", async () => {
  const db = memoryDb({ reminder: reminderIn(1) }), tr = new FakeTransport(); tr.failures = 99; let t = T0 + MIN;
  assert.equal(await run(db, tr, t), "retry"); assert.equal(db.data.reminder.nextAttemptAt, new Date(t + 5 * MIN).toISOString()); assert.equal(await run(db, tr, t + MIN), "not_due");
  t += 5 * MIN; assert.equal(await run(db, tr, t), "retry"); t += 30 * MIN; assert.equal(await run(db, tr, t), "retry"); t += 120 * MIN; assert.equal(await run(db, tr, t), "failed");
  assert.equal(db.data.reminder.attempts, CENDRES_MAX_ATTEMPTS); assert.equal(db.data.reminder.status, "failed"); assert.match(db.data.reminder.lastError, /simulé/); assert.equal(await run(db, tr, t + 9e9), "none");
  const d2 = memoryDb({ reminder: reminderIn(1) }), t2 = new FakeTransport(); t2.failures = 1;
  assert.equal(await run(d2, t2, T0 + 2 * MIN), "retry"); assert.equal(await run(d2, t2, T0 + 8 * MIN), "sent"); assert.equal(t2.sent.length, 1);
});
test("reprise : échéance dépassée pendant l'arrêt = un envoi ; envoi interrompu = jamais renvoyé seul", async () => {
  const db = memoryDb({ reminder: reminderIn(5) }), tr = new FakeTransport();
  assert.equal(await run(db, tr, T0 + 3 * 86_400_000), "sent"); assert.equal(tr.sent.length, 1);
  const d2 = memoryDb({ reminder: reminderIn(1) }), t2 = new FakeTransport(); t2.hook = () => new Promise(() => {});
  void run(d2, t2, T0 + 2 * MIN); await new Promise(r => setTimeout(r, 10)); assert.equal(d2.data.reminder.status, "sending");
  const fresh = new FakeTransport();
  assert.equal(await run(d2, fresh, T0 + 5 * MIN), "none"); assert.equal(d2.data.reminder.status, "sending"); // envoi probablement en cours : on attend
  assert.equal(await run(d2, fresh, T0 + 20 * MIN), "none"); assert.equal(d2.data.reminder.status, "unconfirmed"); // interrompu : signalé
  assert.equal(await run(d2, fresh, T0 + 9e9), "none"); assert.equal(fresh.sent.length, 0);
});
test("envois désactivés par défaut : échéance visible, aucun envoi, rien d'écrit", async () => {
  const db = memoryDb({ reminder: reminderIn(1) }), tr = new FakeTransport(), before = JSON.stringify(db.data);
  assert.equal(await run(db, tr, T0 + 2 * MIN, null), "disabled"); assert.equal(tr.sent.length, 0); assert.equal(JSON.stringify(db.data), before);
});
test("configuration d'envoi : activation seulement avec validation exacte ; adresse dictée refusée", () => {
  const ok = { CENDRES_EMAIL_ENABLED: "true", CENDRES_EMAIL_TO: "bmsyoder@gmail.com", CENDRES_EMAIL_FROM: "Ferme <ferme@example.org>" };
  const approval = cendresApprovalFingerprint(ok.CENDRES_EMAIL_TO, ok.CENDRES_EMAIL_FROM);
  assert.equal(readCendresMailConfig({}).config, null); assert.equal(readCendresMailConfig({ ...ok }).config, null); assert.match(readCendresMailConfig({ ...ok }).reason, /Validation/);
  assert.equal(readCendresMailConfig({ ...ok, CENDRES_EMAIL_APPROVAL: approval }).config?.enabled, true);
  assert.equal(readCendresMailConfig({ ...ok, CENDRES_EMAIL_APPROVAL: approval, CENDRES_EMAIL_ENABLED: "1" }).config, null);
  assert.equal(readCendresMailConfig({ ...ok, CENDRES_EMAIL_TO: "BMS. Yoder@Gmail.com", CENDRES_EMAIL_APPROVAL: approval }).config, null);
  assert.equal(readCendresMailConfig({ ...ok, CENDRES_EMAIL_TO: "autre@example.org", CENDRES_EMAIL_APPROVAL: approval }).config, null); // destinataire changé = validation périmée
  assert.equal(readCendresMailConfig({ ...ok, CENDRES_EMAIL_FROM: "x@y.fr", CENDRES_EMAIL_APPROVAL: approval }).config, null);
});
test("Resend : requête conforme (clé d'idempotence), erreurs HTTP remontées, sans appel réseau réel", async () => {
  const calls = []; const fake = async (url, init) => { calls.push({ url, init }); return { ok: calls.length > 1, status: 422 }; };
  const t = new ResendTransport("cle-factice", fake), msg = { to: "a@b.fr", from: "f@b.fr", subject: "s", text: "t", idempotencyKey: "cendres-1" };
  await assert.rejects(() => t.send(msg), /HTTP 422/); await t.send(msg);
  assert.equal(calls[0].url, "https://api.resend.com/emails"); assert.equal(calls[0].init.headers["Idempotency-Key"], "cendres-1");
  assert.deepEqual(JSON.parse(calls[0].init.body), { from: "f@b.fr", to: ["a@b.fr"], subject: "s", text: "t" }); assert.doesNotMatch(JSON.stringify(calls[0].init.body), /cle-factice/);
});
test("stockage REST : ETag lu, écriture conditionnelle, 412 = perdu, erreur = exception", async () => {
  let etag = "E1", body = null; const log = [];
  const fake = async (url, init = {}) => { const u = new URL(url); log.push([init.method ?? "GET", u.pathname]);
    if (u.hostname === "identitytoolkit.googleapis.com") return { ok: true, status: 200, json: async () => ({ idToken: "jeton" }) };
    if (u.pathname.endsWith("/cleanings.json")) return { ok: true, status: 200, json: async () => ({}) , headers: new Headers() };
    if (init.method === "PUT") { if (init.headers["if-match"] !== etag) return { ok: false, status: 412 }; body = JSON.parse(init.body); etag = "E2"; return { ok: true, status: 200 }; }
    return { ok: true, status: 200, json: async () => body, headers: new Headers({ etag }) }; };
  const env = { NEXT_PUBLIC_FIREBASE_DATABASE_URL: "https://db.example.test/", NEXT_PUBLIC_FIREBASE_API_KEY: "api", FIREBASE_EMAIL: "serveur@example.test", FIREBASE_PASSWORD: "secret-factice" };
  const store = createRestCendresStore(env, fake), r = reminderIn(5);
  const s1 = await store.read(); assert.equal(s1.version, "E1"); assert.equal(await store.writeIfUnchanged(r, "E1"), true);
  assert.equal(await store.writeIfUnchanged(r, "E1"), false); assert.equal((await store.read()).reminder.id, r.id);
  const bad = createRestCendresStore(env, async (url) => new URL(url).hostname === "identitytoolkit.googleapis.com"
    ? { ok: true, status: 200, json: async () => ({ idToken: "jeton" }) }
    : { ok: false, status: 500 });
  await assert.rejects(() => bad.read(), /HTTP 500/);
});
test("texte de l'e-mail", () => { const t = cendresEmailText("2026-12-01T07:00:00Z", null); assert.match(t, /Aucun nettoyage enregistré/); assert.match(t, /Échéance : /); });

let failed = 0;
for (const [name, fn] of tests) { try { await fn(); console.log("ok  -", name); } catch (e) { failed++; console.log("KO  -", name, "\n", e.message); } }
console.log(`${tests.length - failed}/${tests.length} tests Cendres OK`); process.exit(failed ? 1 : 0);
