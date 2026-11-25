import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCleaning, buildReminder, cancelReminder, normalizeCendres, rescheduleAfterCleaning, addCendresInterval, markSent, isReminderActive } from "../src/lib/cendres.ts";
import { dispatchCendresReminder } from "../src/lib/cendres-mail.ts";

const D = 86_400_000, T = (s) => Date.parse(s);
let n = 0; const tests = [];
const test = (name, fn) => tests.push([name, fn]);
function makeDb(file) {
  const load = () => normalizeCendres(JSON.parse(readFileSync(file, "utf8")));
  const save = (raw) => writeFileSync(file, JSON.stringify(raw));
  const raw = () => JSON.parse(readFileSync(file, "utf8"));
  return {
    state: load,
    clean(now, at) {
      const st = load(), c = buildCleaning(`c${++n}`, now, at);
      const cyc = rescheduleAfterCleaning(st.reminder, c, st.cleanings[0]?.at ?? null, `r${++n}`, now);
      const r = raw(); r.cleanings = { ...(r.cleanings ?? {}), [c.id]: c };
      if (cyc.outcome === "rescheduled") r.reminder = cyc.reminder;
      save(r); return cyc;
    },
    setReminder(now, input) { const r = raw(); r.reminder = buildReminder(`r${++n}`, now, input); save(r); },
    cancel() { const r = raw(); r.reminder = cancelReminder(load().reminder); save(r); },
    patchReminder(p) { const r = raw(); r.reminder = { ...r.reminder, ...p }; save(r); },
  };
}
const fresh = () => makeDb((() => { const f = join(mkdtempSync(join(tmpdir(), "cendres-")), "db.json"); writeFileSync(f, "{}"); return f; })());

test("plusieurs cycles : 7 jours après CHAQUE validation", () => {
  const db = fresh(); const t0 = T("2026-11-01T08:00:00Z"); db.setReminder(t0, { delayMinutes: 7 * 1440 });
  let now = T("2026-11-05T10:00:00Z");
  for (let i = 0; i < 4; i++) { const cyc = db.clean(now); assert.equal(cyc.outcome, "rescheduled"); const r = db.state().reminder; assert.equal(r.status, "scheduled"); assert.equal(r.intervalMinutes, 7 * 1440); assert.equal(Date.parse(r.dueAt), addCendresInterval(now, 7 * 1440)); now += 3 * D; }
});
test("identifiant renouvelé et nouveau délai conservé", () => {
  const db = fresh(); db.setReminder(T("2026-11-01T08:00:00Z"), { delayMinutes: 1440 }); const a = db.state().reminder.id; db.clean(T("2026-11-01T09:00:00Z")); assert.notEqual(db.state().reminder.id, a);
  db.setReminder(T("2026-11-03T08:00:00Z"), { delayMinutes: 14 * 1440 }); db.clean(T("2026-11-04T08:00:00Z")); assert.equal(db.state().reminder.dueAt, "2026-11-18T08:00:00.000Z");
});
test("annulation, absence et délai inconnu ne créent rien", () => {
  let db = fresh(); assert.equal(db.clean(T("2026-11-02T08:00:00Z")).outcome, "no_reminder");
  db = fresh(); db.setReminder(T("2026-11-01T08:00:00Z"), { delayMinutes: 7 * 1440 }); db.cancel(); assert.equal(db.clean(T("2026-11-02T08:00:00Z")).outcome, "cancelled"); assert.equal(isReminderActive(db.state().reminder), false);
  db = fresh(); db.setReminder(T("2026-11-01T08:00:00Z"), { dueAt: "2026-11-10T08:00:00Z" }); const before = db.state().reminder; const cyc = db.clean(T("2026-11-02T08:00:00Z")); assert.equal(cyc.outcome, "unknown_interval"); assert.match(cyc.message, /inconnu/); assert.deepEqual(db.state().reminder, before);
});
test("délai corrompu, envoi en cours et nettoyage antérieur restent inchangés", () => {
  for (const bad of [0, -5, 1.5, "7", 1e12]) assert.equal(normalizeCendres({ reminder: { id: "x", dueAt: "2026-11-09T08:00:00Z", status: "scheduled", intervalMinutes: bad } }).reminder.intervalMinutes, null);
  for (const status of ["sending", "failed", "unconfirmed"]) { const db = fresh(); db.setReminder(T("2026-11-01T08:00:00Z"), { delayMinutes: 1440 }); db.patchReminder({ status }); assert.notEqual(db.clean(T("2026-11-01T12:00:00Z")).outcome, "rescheduled"); }
  const db = fresh(); db.setReminder(T("2026-11-01T08:00:00Z"), { delayMinutes: 7 * 1440 }); db.clean(T("2026-11-05T08:00:00Z")); assert.equal(db.clean(T("2026-11-06T08:00:00Z"), "2026-11-03T08:00:00Z").outcome, "not_latest");
});
test("rappel envoyé repart avec le même délai", () => {
  const db = fresh(); db.setReminder(T("2026-11-01T08:00:00Z"), { delayMinutes: 7 * 1440 }); db.patchReminder(markSent(db.state().reminder, T("2026-11-08T08:01:00Z"))); assert.equal(db.clean(T("2026-11-09T08:00:00Z")).outcome, "rescheduled");
});
test("heure locale de Paris conservée pour les jours entiers", () => {
  assert.equal(new Date(addCendresInterval(T("2027-03-25T18:30:00+01:00"), 7 * 1440)).toISOString(), "2027-04-01T16:30:00.000Z");
  assert.equal(new Date(addCendresInterval(T("2026-10-22T18:30:00+02:00"), 7 * 1440)).toISOString(), "2026-10-29T17:30:00.000Z");
  assert.equal(addCendresInterval(T("2027-03-27T12:00:00Z"), 36 * 60), T("2027-03-27T12:00:00Z") + 36 * 3600_000);
});
test("persistance après relecture", () => { const db = fresh(); db.setReminder(T("2026-11-01T08:00:00Z"), { delayMinutes: 3 * 1440 }); db.clean(T("2026-11-02T08:00:00Z")); assert.equal(db.state().reminder.dueAt, "2026-11-05T08:00:00.000Z"); });
test("e-mails désactivés : aucune émission ni écriture serveur", async () => {
  const db = fresh(); db.setReminder(T("2026-11-01T08:00:00Z"), { delayMinutes: 1440 }); db.clean(T("2026-11-01T09:00:00Z")); let sent = 0, writes = 0;
  const store = { read: async () => ({ reminder: db.state().reminder, lastCleaningAt: db.state().cleanings[0]?.at ?? null, version: "v" }), writeIfUnchanged: async () => { writes++; return true; } };
  const out = await dispatchCendresReminder({ store, transport: { send: async () => { sent++; } }, config: null, now: T("2026-12-31T00:00:00Z") }); assert.equal(out, "disabled"); assert.equal(sent, 0); assert.equal(writes, 0);
});
test("échéance initiale et intervalle persisté", () => {
  const db = fresh(); db.setReminder(T("2026-11-01T08:00:00Z"), { delayMinutes: 7 * 1440 });
  assert.equal(db.state().reminder.dueAt, "2026-11-08T08:00:00.000Z"); assert.equal(db.state().reminder.intervalMinutes, 7 * 1440);
});
test("rappel hérité sans intervalle : inconnu", () => {
  const legacy = normalizeCendres({ reminder: { id: "x", dueAt: "2026-11-09T08:00:00Z", createdAt: "2026-11-02T08:00:00Z", status: "scheduled" } });
  assert.equal(legacy.reminder.intervalMinutes, null);
});
test("échéance recalculée déjà passée : rappel inchangé", () => {
  const db = fresh(); db.setReminder(T("2026-11-01T08:00:00Z"), { delayMinutes: 1440 });
  const before = db.state().reminder; assert.equal(db.clean(T("2026-11-20T08:00:00Z"), "2026-11-10T08:00:00Z").outcome, "in_past"); assert.deepEqual(db.state().reminder, before);
});
test("nettoyage futur refusé", () => {
  assert.throws(() => buildCleaning("a", T("2026-11-01T08:00:00Z"), "2026-12-01T00:00:00Z"), /futur/);
});
test("durée exacte hors changement d'heure", () => {
  assert.equal(addCendresInterval(T("2026-11-01T08:00:00Z"), 7 * 1440), T("2026-11-08T08:00:00Z"));
});
test("heure absente et année bissextile", () => {
  assert.equal(new Date(addCendresInterval(T("2027-03-27T02:30:00+01:00"), 1440)).toISOString(), "2027-03-28T01:30:00.000Z");
  assert.equal(new Date(addCendresInterval(T("2028-02-25T10:00:00Z"), 7 * 1440)).toISOString(), "2028-03-03T10:00:00.000Z");
});
test("deuxième cycle après relecture", () => {
  const db = fresh(); db.setReminder(T("2026-11-01T08:00:00Z"), { delayMinutes: 3 * 1440 }); db.clean(T("2026-11-02T08:00:00Z")); db.clean(T("2026-11-04T08:00:00Z"));
  assert.equal(db.state().reminder.dueAt, "2026-11-07T08:00:00.000Z");
});
test("une seule clé d'idempotence par rappel", async () => {
  const db = fresh(); db.setReminder(T("2026-11-01T08:00:00Z"), { delayMinutes: 1440 });
  const keys = []; const cfg = { enabled: true, to: "a@b.c", from: "x@y.z", approval: "t" };
  const store = { read: async () => ({ reminder: db.state().reminder, lastCleaningAt: null, version: "v" }), writeIfUnchanged: async () => true };
  await dispatchCendresReminder({ store, transport: { send: async (m) => { keys.push(m.idempotencyKey); } }, config: cfg, now: T("2026-11-02T08:00:01Z") });
  assert.equal(keys.length, 1);
});

let fail = 0;
for (const [name, fn] of tests) { try { await fn(); console.log("ok  ", name); } catch (e) { fail++; console.log("FAIL", name, "\n    ", e.message); } }
console.log(`${tests.length - fail}/${tests.length} tests réussis`); process.exit(fail ? 1 : 0);
