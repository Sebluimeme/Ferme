#!/usr/bin/env node
/** Vrais modèles/services, transport simulé : aucun accès à Firebase ni aux données de ferme. */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { createHash } from "node:crypto";

const directory = await mkdtemp(join(tmpdir(), "ferme-subsidy-tests-"));
let passed = 0;
try {
  const modules = [
    ["../src/lib/comptabilite-payers.ts", "payers.mjs"],
    ["../src/types/comptabilite.ts", "finance.mjs"],
    ["../src/types/purchase-invoice.ts", "invoice.mjs"],
    ["../src/types/subsidy.ts", "subsidy.mjs"],
    ["../src/services/subsidy-service.ts", "service.mjs"],
    ["../src/services/comptabilite-write-safety.ts", "safety.mjs"],
  ];
  for (const [source, destination] of modules) {
    let compiled = ts.transpileModule(await readFile(new URL(source, import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    for (const [path, target] of [["@/lib/comptabilite-payers", "payers"], ["@/types/comptabilite", "finance"], ["@/types/purchase-invoice", "invoice"], ["@/types/subsidy", "subsidy"]]) compiled = compiled.replaceAll(`"${path}"`, `"./${target}.mjs"`);
    await writeFile(join(directory, destination), compiled);
  }
  const model = await import(pathToFileURL(join(directory, "subsidy.mjs")));
  const finance = await import(pathToFileURL(join(directory, "finance.mjs")));
  const { createSubsidyPaymentService, validateSubsidyAttachment, createSubsidyRestCompareAndSet, requestSubsidyJson } = await import(pathToFileURL(join(directory, "service.mjs")));
  const { requiresSubsidyService } = await import(pathToFileURL(join(directory, "safety.mjs")));
  const draft = (values = {}) => ({ id: "subsidy-test", date: "2025-10-16", montant: "700,00", payeur: "revolut", production: "Ferme", dispositif: "pac_base", campagne: "2025", tranche: "avance", organisme: "Organisme test", reference: "TEST-REF", remarque: "", montantReferenceAnnuel: "1000", documentDate: "2025-10-14", engagementDebut: "", engagementFin: "", version: 0, ...values });
  const payment = (values = {}, options = {}) => model.buildSubsidyPayment(draft(values), { now: "2025-10-19T12:00:00Z", ...options });
  const oldFile = { url: "https://example.test/old.pdf", storagePath: "transactions/old.pdf", nom: "old.pdf" };
  const newFile = () => new File(["test PDF content"], "new.pdf", { type: "application/pdf" });
  const expense = { id: "expense", date: "2025-01-01", operation: "Dépenses", nature: "exploitation", payeur: "SY", montant: 2000, production: "Ferme", categorie: "Charges", sousCategorie: "Autre", produit: "Dépense test" };
  function environment(initial = []) {
    const store = new Map(initial.map(row => [row.id, structuredClone(row)]));
    const calls = [];
    const hooks = {};
    const gateway = {
      read: async id => structuredClone(store.get(id) || null),
      readTransactions: async () => structuredClone([...store.values()]),
      compareAndSet: async (id, fn) => {
        calls.push(["atomic", id]);
        if (hooks.beforeAtomic) hooks.beforeAtomic(store, id);
        const value = fn(structuredClone(store.get(id) || null));
        if (value === undefined) return { committed: false, value: store.get(id) || null };
        if (hooks.rejectCommit) throw new Error("Écriture refusée");
        if (value === null) store.delete(id); else store.set(id, structuredClone(value));
        if (hooks.loseAcknowledgement) { hooks.loseAcknowledgement = false; throw new Error("Réponse perdue après écriture"); }
        return { committed: true, value: structuredClone(value) };
      },
      upload: async path => { calls.push(["upload", path]); return hooks.rejectUpload ? { success: false, error: "Échec réseau" } : { success: true, url: `https://example.test/${path}` }; },
      deleteFile: async path => { calls.push(["deleteFile", path]); return { success: !hooks.rejectDelete }; },
      now: () => "2025-10-19T12:00:00Z",
    };
    return { store, calls, hooks, service: createSubsidyPaymentService(gateway) };
  }
  async function test(name, run) { await run(); passed++; console.log(`  ✅ ${name}`); }

  await test("le formulaire neuf exige un montant reçu, une date et un compte explicites", () => {
    const empty = model.makeEmptySubsidyDraft();
    assert.equal(empty.payeur, ""); assert.equal(empty.date, ""); assert.equal(empty.montant, "");
    assert.equal(empty.production, "Ferme"); assert.equal(model.validateSubsidyDraft(empty).valid, false);
  });
  await test("les montants reçus sont positifs et exacts au centime", () => {
    assert.equal(model.validateSubsidyDraft(draft({ montant: "123,45" })).montantCentimes, 12345);
    for (const montant of ["", "0", "-5", "1e3", "10 euros", "1.111", "Infinity"]) assert.equal(model.validateSubsidyDraft(draft({ montant })).valid, false, montant);
  });
  await test("dates impossibles ou futures, campagne incorrecte et compte inconnu refusés", () => {
    for (const patch of [{ date: "2025-02-29" }, { date: "2099-12-31" }, { campagne: "25" }, { campagne: "1800" }, { payeur: "inconnu" }, { dispositif: "inconnu" }, { tranche: "annoncé" }]) assert.equal(model.validateSubsidyDraft(draft(patch)).valid, false);
    assert.equal(payment({ payeur: "Revolut" }).payeur, "revolut");
  });
  await test("l’avance PAC est une recette d’exploitation, sans toucher les dettes Revolut", () => {
    const row = payment();
    assert.match(row.produit, /Avance/); assert.equal(finance.isOperatingTransaction(row), true);
    assert.equal(finance.computeStats([row]).totalRevenus, 700);
    assert.deepEqual(finance.computeCreditorBalances([row]), { SY: 0, BY: 0 });
  });
  await test("avance et solde additionnent seulement les sommes reçues", () => {
    const rows = [payment(), payment({ id: "solde", montant: "300", tranche: "solde" })];
    assert.equal(finance.computeStats(rows).totalRevenus, 1000);
    assert.equal(rows[0].subvention.montantReferenceAnnuelCentimes, 100000);
  });
  await test("campagne et date d’encaissement sont indépendantes", () => {
    const row = payment({ date: "2026-02-01", campagne: "2025" });
    assert.equal(row.date, "2026-02-01"); assert.equal(row.subvention.campagne, 2025);
  });
  await test("engagement sur cinq ans ne multiplie jamais une recette", () => {
    const row = payment({ dispositif: "cab", engagementDebut: "2025-01-01", engagementFin: "2029-12-31" });
    assert.equal(finance.computeStats([row]).totalRevenus, 700);
    assert.equal(model.validateSubsidyDraft(draft({ engagementDebut: "2029-01-01", engagementFin: "2025-01-01" })).valid, false);
  });
  await test("valeurs facultatives inconnues absentes, garde d’import conservée en édition", () => {
    const row = payment({ montantReferenceAnnuel: "", documentDate: "" }, { sourceDocumentSha256: "a".repeat(64) });
    assert.equal(row.subvention.montantReferenceAnnuelCentimes, undefined);
    assert.equal(row.subvention.documentDate, undefined);
    const edited = model.buildSubsidyPayment(model.subsidyToDraft(row), { previous: row });
    assert.equal(edited.subvention.sourceDocumentSha256, "a".repeat(64));
    assert.throws(() => payment({}, { sourceDocumentSha256: "invalid" }));
  });
  await test("les versements structurés ou incomplets sont protégés du CRUD historique", () => {
    assert.equal(requiresSubsidyService(payment()), true);
    assert.equal(requiresSubsidyService({ subvention: {} }), true);
    assert.equal(requiresSubsidyService({ versionSubvention: 1 }), true);
    assert.equal(requiresSubsidyService(expense), false);
  });
  await test("enregistrer deux fois la même demande ne crée ni doublon ni version", async () => {
    const env = environment();
    const first = await env.service.save(draft()); const retry = await env.service.save(draft());
    assert.equal(first.success, true); assert.equal(retry.success, true);
    assert.equal(env.store.size, 1); assert.equal(retry.data.versionSubvention, 1);
    assert.equal(env.calls.filter(([name]) => name === "atomic").length, 1);
  });
  await test("une réponse réseau perdue se réessaie avec le même identifiant", async () => {
    const env = environment(); env.hooks.loseAcknowledgement = true;
    assert.equal((await env.service.save(draft())).success, false);
    assert.equal((await env.service.save(draft())).success, true); assert.equal(env.store.size, 1);
  });
  await test("un identifiant historique ne peut pas devenir une aide", async () => {
    const env = environment([{ ...expense, id: "subsidy-test" }]);
    assert.equal((await env.service.save(draft())).success, false);
    assert.deepEqual(env.store.get("subsidy-test"), { ...expense, id: "subsidy-test" });
  });
  await test("mise à jour incrémentée et champs facultatifs vidés réellement retirés", async () => {
    const row = payment(); const env = environment([row]);
    const result = await env.service.save({ ...model.subsidyToDraft(row), montant: "800", montantReferenceAnnuel: "", reference: "", organisme: "" });
    assert.equal(result.success, true); assert.equal(result.data.versionSubvention, 2);
    assert.equal(result.data.montant, 800); assert.equal(result.data.reference, undefined);
    assert.equal(result.data.subvention.montantReferenceAnnuelCentimes, undefined);
    assert.equal(result.data.dateCreation, row.dateCreation);
  });
  await test("édition obsolète refusée sans écraser la dernière version", async () => {
    const row = payment(); const env = environment([row]);
    const saved = await env.service.save({ ...model.subsidyToDraft(row), montant: "800" });
    assert.equal(saved.success, true);
    assert.equal((await env.service.save({ ...model.subsidyToDraft(row), montant: "900" })).success, false);
    assert.equal(env.store.get(row.id).montant, 800);
  });
  await test("modification concurrente après lecture détectée dans le CAS", async () => {
    const row = payment(); const env = environment([row]);
    env.hooks.beforeAtomic = (store, id) => store.set(id, { ...row, versionSubvention: 2, montant: 900 });
    assert.equal((await env.service.save({ ...model.subsidyToDraft(row), montant: "800" })).success, false);
    assert.equal(env.store.get(row.id).montant, 900);
  });
  await test("versement supprimé non recréé depuis un vieux brouillon", async () => {
    const env = environment();
    assert.equal((await env.service.save(draft({ version: 1 }))).success, false); assert.equal(env.store.size, 0);
  });
  await test("encaissement personnel confirmé suit la dette mais aucun autre créditeur", async () => {
    const env = environment([expense]);
    const result = await env.service.save(draft({ payeur: "SY" }));
    assert.equal(result.success, true);
    assert.deepEqual(finance.computeCreditorBalances([...env.store.values()]), { SY: 1300, BY: 0 });
    assert.equal((await env.service.save(draft({ id: "too-much", payeur: "BY" }))).success, false);
  });
  await test("justificatif invalide rejeté avant tout envoi", async () => {
    const env = environment();
    assert.equal((await env.service.save(draft(), { pieceJointe: new File(["bad"], "code.js", { type: "application/javascript" }) })).success, false);
    assert.equal(env.calls.length, 0);
    assert.match(validateSubsidyAttachment(new File([], "empty.pdf", { type: "application/pdf" })), /vide/);
  });
  await test("échec de téléversement conserve l’ancienne écriture et son fichier", async () => {
    const row = payment({}, { pieceJointe: oldFile }); const env = environment([row]); env.hooks.rejectUpload = true;
    assert.equal((await env.service.save({ ...model.subsidyToDraft(row), montant: "800" }, { pieceJointe: newFile() })).success, false);
    assert.deepEqual(env.store.get(row.id), row); assert.equal(env.calls.some(([name]) => name === "deleteFile"), false);
  });
  await test("nouveau fichier confirmé avant nettoyage de l’ancien", async () => {
    const row = payment({}, { pieceJointe: oldFile, sourceDocumentSha256: "a".repeat(64) }); const env = environment([row]);
    const result = await env.service.save(model.subsidyToDraft(row), { pieceJointe: newFile() });
    assert.equal(result.success, true);
    assert.match(result.data.pieceJointe.storagePath, /^transactions\/subsidy_subsidy-test_v2_[a-f0-9]{64}-new\.pdf$/);
    assert.equal(result.data.subvention.sourceDocumentSha256, createHash("sha256").update("test PDF content").digest("hex"));
    assert.deepEqual(env.calls.map(([name]) => name), ["upload", "atomic", "deleteFile"]);
  });
  await test("édition sans nouveau PDF conserve l’empreinte et le justificatif", async () => {
    const row = payment({}, { pieceJointe: oldFile, sourceDocumentSha256: "a".repeat(64) }); const env = environment([row]);
    const result = await env.service.save({ ...model.subsidyToDraft(row), remarque: "Note corrigée" });
    assert.equal(result.success, true); assert.deepEqual(result.data.pieceJointe, oldFile);
    assert.equal(result.data.subvention.sourceDocumentSha256, "a".repeat(64));
  });
  await test("le modèle ne rattache jamais une ancienne empreinte à un nouveau justificatif", () => {
    const row = payment({}, { pieceJointe: oldFile, sourceDocumentSha256: "a".repeat(64) });
    const edited = model.buildSubsidyPayment(model.subsidyToDraft(row), { previous: row, pieceJointe: { ...oldFile, storagePath: "transactions/different.pdf" } });
    assert.equal(edited.subvention.sourceDocumentSha256, undefined);
  });
  await test("réponse perdue avec justificatif : retry réutilise le fichier confirmé", async () => {
    const env = environment(); env.hooks.loseAcknowledgement = true;
    const file = newFile();
    assert.equal((await env.service.save(draft(), { pieceJointe: file })).success, false);
    assert.equal((await env.service.save(draft(), { pieceJointe: file })).success, true);
    assert.equal(env.calls.filter(([name]) => name === "upload").length, 1); assert.equal(env.store.size, 1);
  });
  await test("suppression obsolète refusée, suppression valide atomique puis fichier", async () => {
    const row = payment({}, { pieceJointe: oldFile }); const env = environment([row]);
    assert.equal((await env.service.delete(row.id, 2)).success, false); assert.equal(env.store.size, 1);
    assert.equal((await env.service.delete(row.id, 1)).success, true); assert.equal(env.store.size, 0);
    assert.deepEqual(env.calls.map(([name]) => name), ["atomic", "deleteFile"]);
    assert.equal((await env.service.delete(row.id, 1)).success, true);
  });
  await test("échec de nettoyage affiche un avertissement sans annuler l’écriture", async () => {
    const row = payment({}, { pieceJointe: oldFile }); const env = environment([row]); env.hooks.rejectDelete = true;
    const result = await env.service.delete(row.id, 1);
    assert.equal(result.success, true); assert.ok(result.warning); assert.equal(env.store.size, 0);
  });
  await test("CAS REST crée seulement le nœud demandé avec son ETag puis supprime conditionnellement", async () => {
    let current = null; let version = 0; const calls = [];
    const cas = createSubsidyRestCompareAndSet(async (path, init = {}) => {
      calls.push({ path, ...init });
      if (init.method === "PUT") {
        assert.equal(init.headers["If-Match"], `"v${version}"`);
        current = JSON.parse(init.body); version++;
      } else assert.equal(init.headers["X-Firebase-ETag"], "true");
      return { ok: true, status: 200, etag: `"v${version}"`, data: structuredClone(current) };
    });
    const row = payment();
    assert.deepEqual(await cas(row.id, () => row), { committed: true, value: row });
    assert.equal((await cas(row.id, value => value)).committed, true);
    assert.equal(calls.filter(call => call.method === "PUT").length, 1);
    assert.deepEqual(await cas(row.id, () => null), { committed: true, value: null });
    assert.equal(calls.every(call => call.path === `transactions/${row.id}`), true);
  });
  await test("CAS REST relit après 412 et refuse une version devenue concurrente", async () => {
    const row = payment(); let state = row; let writes = 0;
    const cas = createSubsidyRestCompareAndSet(async (_path, init = {}) => {
      if (init.method === "PUT") { writes++; state = { ...row, versionSubvention: 2, remarque: "Autre appareil" }; return { ok: false, status: 412, etag: '"v2"', data: state }; }
      return { ok: true, status: 200, etag: `"v${state.versionSubvention}"`, data: structuredClone(state) };
    });
    const result = await cas(row.id, value => value.versionSubvention === 1 ? { ...value, versionSubvention: 2, remarque: "Mon brouillon" } : undefined);
    assert.equal(result.committed, false); assert.equal(result.value.remarque, "Autre appareil"); assert.equal(writes, 1);
  });
  await test("CAS REST borne les conflits répétés et refuse un ETag absent sans écrire", async () => {
    let calls = 0;
    const cas = createSubsidyRestCompareAndSet(async (_path, init = {}) => {
      calls++;
      return { ok: init.method !== "PUT", status: init.method === "PUT" ? 412 : 200, etag: '"v0"', data: null };
    });
    assert.equal((await cas("subsidy-test", () => payment())).committed, false); assert.equal(calls, 6);
    let missingCalls = 0;
    const missing = createSubsidyRestCompareAndSet(async () => { missingCalls++; return { ok: true, status: 200, etag: null, data: null }; });
    await assert.rejects(() => missing("subsidy-test", () => payment()), /Aucun changement/); assert.equal(missingCalls, 1);
  });
  await test("timeout REST interrompt l’envoi et annonce un résultat incertain, sans retry automatique", async () => {
    let calls = 0; let aborted = false;
    const fetcher = async (_url, init) => {
      calls++;
      return new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); }, { once: true }));
    };
    await assert.rejects(() => requestSubsidyJson("https://example.test/node.json", { method: "PUT", body: "null" }, fetcher, 5), /pas confirmé.*même brouillon/);
    assert.equal(calls, 1); assert.equal(aborted, true);
  });
  await test("le délai REST couvre aussi un corps de réponse qui reste bloqué", async () => {
    let aborted = false;
    const fetcher = async (_url, init) => ({
      ok: true, status: 200, headers: new Headers(),
      json: () => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => { aborted = true; reject(new Error("body aborted")); }, { once: true })),
    });
    await assert.rejects(() => requestSubsidyJson("https://example.test/node.json", {}, fetcher, 5), /pas confirmé/);
    assert.equal(aborted, true);
  });
  console.log(`✅ ${passed} tests aides OK`);
} finally { await rm(directory, { recursive: true, force: true }); }
