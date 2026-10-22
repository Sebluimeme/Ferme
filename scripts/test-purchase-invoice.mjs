#!/usr/bin/env node
/** Tests locaux : modèle réel et service injecté, aucun accès réseau/Firebase. */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const temporaryDirectory = await mkdtemp(join(tmpdir(), "ferme-invoice-tests-"));
let passed = 0;

try {
  // Compiler les vrais fichiers en modules isolés permet d'injecter le transport sans initialiser Firebase.
  const modules = [
    ["../src/lib/comptabilite-payers.ts", "comptabilite-payers.mjs"],
    ["../src/types/comptabilite.ts", "comptabilite.mjs"],
    ["../src/types/purchase-invoice.ts", "purchase-invoice.mjs"],
    ["../src/services/purchase-invoice-service.ts", "service.mjs"],
  ];
  for (const [source, destination] of modules) {
    let compiled = ts.transpileModule(await readFile(new URL(source, import.meta.url), "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    compiled = compiled.replaceAll('"@/types/comptabilite"', '"./comptabilite.mjs"')
      .replaceAll('"@/lib/comptabilite-payers"', '"./comptabilite-payers.mjs"')
      .replaceAll('"@/types/purchase-invoice"', '"./purchase-invoice.mjs"');
    await writeFile(join(temporaryDirectory, destination), compiled);
  }
  const model = await import(pathToFileURL(join(temporaryDirectory, "purchase-invoice.mjs")));
  const finance = await import(pathToFileURL(join(temporaryDirectory, "comptabilite.mjs")));
  const { createPurchaseInvoiceService, validateInvoiceAttachment } = await import(pathToFileURL(join(temporaryDirectory, "service.mjs")));

  async function test(name, fn) {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  }

  function draft(overrides = {}) {
    return {
      id: "invoice-fixed", date: "2026-10-19", fournisseur: "Fournisseur test", reference: "TEST-001", payeur: "SY",
      montant: "350,00", remarque: "", version: 0,
      allocations: [
        { id: "line-1", production: "Porcs", typeAchat: "alimentation", description: "", quantite: "", montant: "120" },
        { id: "line-2", production: "Bovins", typeAchat: "alimentation", description: "", quantite: "", montant: "80" },
        { id: "line-3", production: "Fourrage", vehicleId: "aebi-1", vehicleLabel: "Aebi", typeAchat: "reparation", description: "", quantite: "", montant: "150" },
      ], ...overrides,
    };
  }

  function environment(initial = []) {
    const store = new Map(initial.map((transaction) => [transaction.id, structuredClone(transaction)]));
    const calls = [];
    const hooks = {};
    const gateway = {
      read: async (id) => structuredClone(store.get(id) || null),
      readTransactions: async () => structuredClone([...store.values()]),
      compareAndSet: async (id, callback) => {
        calls.push(["atomic", id]);
        if (hooks.beforeAtomic) await hooks.beforeAtomic(store, id);
        const value = callback(structuredClone(store.get(id) || null));
        if (value === undefined) return { committed: false, value: structuredClone(store.get(id) || null) };
        if (hooks.rejectBeforeCommit) throw new Error("Écriture refusée");
        if (value === null) store.delete(id); else store.set(id, structuredClone(value));
        if (hooks.loseAcknowledgement) { hooks.loseAcknowledgement = false; throw new Error("Connexion interrompue après l’écriture"); }
        return { committed: true, value: structuredClone(value) };
      },
      upload: async (path) => {
        calls.push(["upload", path]);
        return hooks.rejectUpload ? { success: false, error: "Réseau indisponible" } : { success: true, url: `https://example.test/${path}` };
      },
      deleteFile: async (path) => { calls.push(["deleteFile", path]); return { success: !hooks.rejectFileDeletion }; },
      now: () => "2026-10-19T12:00:00.000Z",
    };
    return { store, calls, hooks, service: createPurchaseInvoiceService(gateway) };
  }

  await test("décimaux exacts et virgule ; rejette nombres tronqués, négatifs, exposants et 3 décimales", () => {
    assert.equal(model.parseMoneyCents("120,03"), 12003);
    assert.equal(model.parseMoneyCents("0.10"), 10);
    assert.equal(model.parseMoneyCents(" 80 "), 8000);
    for (const input of ["", "-1", "1e3", "12 euros", "1.999", "NaN", "Infinity", "1,2,3", "99999999999999999999", "1 000"]) {
      assert.equal(model.parseMoneyCents(input), null, input);
    }
  });

  await test("350 € = 120 + 80 + 150 et validation au centime", () => {
    const validation = model.validatePurchaseInvoice(draft());
    assert.equal(validation.valid, true);
    assert.equal(validation.totalCentimes, 35000);
    assert.equal(validation.allocatedCentimes, 35000);
    assert.equal(validation.remainingCentimes, 0);
    assert.equal(model.validatePurchaseInvoice(draft({ montant: "350.01" })).valid, false);
  });

  await test("rejette date impossible, mauvais payeur, type inconnu et identifiants/entrées malformés", () => {
    const unknownType = draft(); unknownType.allocations[0].typeAchat = "inconnu";
    const duplicate = draft(); duplicate.allocations[1].id = duplicate.allocations[0].id;
    const badQuantity = draft(); badQuantity.allocations[0].quantite = "12abc";
    for (const input of [draft({ date: "2026-02-30" }), draft({ payeur: "nobody" }), draft({ id: "bad/path" }), draft({ allocations: [] }), unknownType, duplicate, badQuantity, {}, null, draft({ allocations: [null] })]) {
      assert.equal(model.validatePurchaseInvoice(input).valid, false);
    }
  });

  await test("description et fournisseur facultatifs ; frais communs acceptés", () => {
    const input = draft({ fournisseur: "", montant: "25", allocations: [{ ...draft().allocations[0], production: "Frais communs", montant: "25" }] });
    const invoice = model.buildPurchaseInvoice(input);
    assert.equal(invoice.produit, "Alimentation · Frais communs");
    assert.equal(invoice.fournisseur, undefined);
  });

  await test("l’intitulé saisi identifie la facture, avec ou sans fournisseur", () => {
    const input = draft({ montant: "23", allocations: [{ ...draft().allocations[2], description: "Boule de direction", montant: "23" }] });
    const invoice = model.buildPurchaseInvoice(input);
    assert.equal(model.purchaseInvoiceTitle(invoice), "Boule de direction");
    assert.equal(model.purchaseInvoiceTitle({ ...invoice, fournisseur: undefined }), "Boule de direction");
    assert.equal(invoice.fournisseur, "Fournisseur test");
    assert.equal(invoice.produit, "Boule de direction");
  });

  await test("facture répartie : aperçu des achats, toutes les descriptions conservées pour le détail et la recherche", () => {
    const input = draft();
    input.allocations[0].description = "Aliment porcs";
    input.allocations[1].description = "Aliment bovins";
    input.allocations[2].description = "Réparation Aebi";
    const invoice = model.buildPurchaseInvoice(input);
    const original = structuredClone(invoice);
    assert.equal(model.purchaseInvoiceTitle(invoice), "Aliment porcs · Aliment bovins · …");
    const rows = model.expandPurchaseAllocations([invoice]);
    assert.ok(rows.some(row => row.produit === "Réparation Aebi" && row.fournisseur === "Fournisseur test"));
    assert.deepEqual(invoice, original);
    const repeated = { ...invoice, allocations: invoice.allocations.map(line => ({ ...line, description: "Achat partagé" })) };
    assert.equal(model.purchaseInvoiceTitle(repeated), "Achat partagé");
  });

  await test("anciennes factures sans description : repli sur le produit, puis le fournisseur", () => {
    const invoice = model.buildPurchaseInvoice(draft());
    const withoutDescriptions = { ...invoice, allocations: invoice.allocations.map(line => ({ ...line, description: "  " })), produit: "Ancien achat" };
    assert.equal(model.purchaseInvoiceTitle(withoutDescriptions), "Ancien achat");
    assert.equal(model.purchaseInvoiceTitle({ ...withoutDescriptions, produit: " " }), "Fournisseur test");
    assert.equal(model.purchaseInvoiceTitle({ ...withoutDescriptions, produit: "", fournisseur: "" }), "Facture d’achat");
  });

  await test("ancienne graphie Revolut acceptée en brouillon et enregistrée sous une seule identité", () => {
    for (const payeur of ["Revolut", "revolut", " REVOLUT "]) {
      const input = draft({ payeur });
      assert.equal(model.validatePurchaseInvoice(input).valid, true);
      const invoice = model.buildPurchaseInvoice(input);
      assert.equal(invoice.payeur, "revolut");
      const historical = { ...invoice, payeur };
      assert.equal(model.invoiceToDraft(historical).payeur, "revolut");
      assert.equal(historical.payeur, payeur);
      assert.deepEqual(finance.computeCreditorBalances([invoice]), { SY: 0, BY: 0 });
    }
  });

  await test("une écriture canonique : 350 € de dépenses et dette, pas 700 €", async () => {
    const env = environment();
    const result = await env.service.save(draft());
    assert.equal(result.success, true);
    assert.equal(env.store.size, 1);
    assert.equal(result.data.factureVersion, 1);
    assert.equal(finance.computeStats([...env.store.values()]).totalDepenses, 350);
    assert.deepEqual(finance.computeCreditorBalances([...env.store.values()]), { SY: 350, BY: 0 });
    assert.equal(env.calls.filter(([kind]) => kind === "atomic").length, 1);
  });

  await test("production et matériel restent deux axes de la même affectation ; expansion idempotente", () => {
    const invoice = model.buildPurchaseInvoice(draft());
    const rows = model.expandPurchaseAllocations([invoice]);
    assert.equal(rows.length, 3);
    assert.equal(rows[2].production, "Fourrage");
    assert.equal(rows[2].vehicleId, "aebi-1");
    assert.equal(rows[2].vehicleLabel, "Aebi");
    assert.equal(rows[2].montant, 150);
    assert.equal(rows[2].reference, "TEST-001");
    assert.ok(rows.every((row) => row.factureId === invoice.id));
    assert.equal(finance.computeStats(rows).totalDepenses, 350);
    assert.deepEqual(model.expandPurchaseAllocations(rows), rows);
  });

  await test("avances et remboursements restent exclus des dépenses ; lignes historiques conservées", () => {
    const invoice = model.buildPurchaseInvoice(draft());
    const advance = { ...invoice, id: "legacy-advance", typeFacture: undefined, allocations: undefined, nature: "avance", montant: 100 };
    const repayment = { ...advance, id: "legacy-repayment", nature: "remboursement", operation: "Revenus", montant: 50 };
    const rows = [invoice, advance, repayment];
    assert.equal(finance.computeStats(rows).totalDepenses, 350);
    assert.equal(finance.computeCreditorBalances(rows).SY, 400);
    assert.equal(model.expandPurchaseAllocations(rows).at(-1), repayment);
  });

  await test("nouvel essai après accusé de réception perdu : même facture, pas de doublon", async () => {
    const env = environment(); env.hooks.loseAcknowledgement = true;
    assert.equal((await env.service.save(draft())).success, false);
    assert.equal(env.store.size, 1);
    const retry = await env.service.save(draft());
    assert.equal(retry.success, true);
    assert.equal(env.store.size, 1);
    assert.equal(retry.data.factureVersion, 1);
    assert.equal(finance.computeStats([...env.store.values()]).totalDepenses, 350);
  });

  await test("édition entière avec suppression d’affectations sans lignes orphelines", async () => {
    const env = environment();
    const original = (await env.service.save(draft())).data;
    const edit = model.invoiceToDraft(original);
    edit.montant = "120"; edit.allocations = [edit.allocations[0]];
    const saved = await env.service.save(edit);
    assert.equal(saved.success, true);
    assert.equal(saved.data.factureVersion, 2);
    assert.equal(saved.data.allocations.length, 1);
    assert.equal(env.store.size, 1);
    assert.equal(finance.computeStats([...env.store.values()]).totalDepenses, 120);
  });

  await test("édition concurrente refusée, version et données de l’autre appareil conservées", async () => {
    const original = model.buildPurchaseInvoice(draft());
    const env = environment([original]);
    const edit = model.invoiceToDraft(original); edit.reference = "MON-EDITION";
    env.hooks.beforeAtomic = (store, id) => store.set(id, { ...original, factureVersion: 2, reference: "AUTRE-APPAREIL" });
    const result = await env.service.save(edit);
    assert.equal(result.success, false);
    assert.match(result.error, /autre appareil/);
    assert.equal(env.store.get(original.id).reference, "AUTRE-APPAREIL");
  });

  await test("une facture supprimée ne peut pas être recréée par une édition périmée", async () => {
    const env = environment();
    const result = await env.service.save(model.invoiceToDraft(model.buildPurchaseInvoice(draft())));
    assert.equal(result.success, false);
    assert.equal(env.store.size, 0);
  });

  await test("réduction, suppression et changement de payeur refusés si remboursement déjà effectué", async () => {
    const invoice = model.buildPurchaseInvoice(draft());
    const reimbursement = { ...invoice, id: "repayment", typeFacture: undefined, nature: "remboursement", operation: "Revenus", montant: 300 };
    const env = environment([invoice, reimbursement]);
    const edit = model.invoiceToDraft(invoice); edit.montant = "120"; edit.allocations = [edit.allocations[0]];
    assert.equal((await env.service.save(edit)).success, false);
    const otherPayer = model.invoiceToDraft(invoice); otherPayer.payeur = "revolut";
    assert.equal((await env.service.save(otherPayer)).success, false);
    assert.equal((await env.service.delete(invoice.id, 1)).success, false);
    assert.equal(env.store.get(invoice.id).totalCentimes, 35000);
  });

  await test("échec d’envoi justificatif : aucune facture écrite, ancien fichier intact", async () => {
    const invoice = model.buildPurchaseInvoice(draft(), { pieceJointe: { url: "https://example.test/old", storagePath: "old.pdf", nom: "old.pdf" } });
    const env = environment([invoice]); env.hooks.rejectUpload = true;
    const result = await env.service.save(model.invoiceToDraft(invoice), { pieceJointe: new File(["new receipt"], "new.pdf", { type: "application/pdf" }) });
    assert.equal(result.success, false);
    assert.match(result.error, /non envoyé/);
    assert.equal(env.calls.filter(([kind]) => kind === "atomic" || kind === "deleteFile").length, 0);
    assert.equal(env.store.get(invoice.id).pieceJointe.storagePath, "old.pdf");
  });

  await test("remplacement justificatif : upload puis commit puis nettoyage, jamais avant", async () => {
    const invoice = model.buildPurchaseInvoice(draft(), { pieceJointe: { url: "https://example.test/old", storagePath: "old.pdf", nom: "old.pdf" } });
    const env = environment([invoice]);
    const result = await env.service.save(model.invoiceToDraft(invoice), { pieceJointe: new File(["new receipt"], "new.pdf", { type: "application/pdf" }) });
    assert.equal(result.success, true);
    assert.deepEqual(env.calls.map(([kind]) => kind), ["upload", "atomic", "deleteFile"]);
    assert.notEqual(result.data.pieceJointe.storagePath, "old.pdf");
    assert.match(result.data.pieceJointe.storagePath, /^transactions\/invoice_invoice-fixed_v2_[a-f0-9]{64}-new\.pdf$/);
  });

  await test("réponse réseau perdue après upload/commit : réessai réutilise fichier et facture", async () => {
    const env = environment(); env.hooks.loseAcknowledgement = true;
    const pieceJointe = new File(["receipt"], "receipt.pdf", { type: "application/pdf" });
    assert.equal((await env.service.save(draft(), { pieceJointe })).success, false);
    const result = await env.service.save(draft(), { pieceJointe });
    assert.equal(result.success, true);
    assert.equal(result.data.factureVersion, 1);
    assert.equal(env.calls.filter(([kind]) => kind === "upload").length, 1);
  });

  await test("échec écriture après upload : aucun succès trompeur et ancien justificatif préservé", async () => {
    const invoice = model.buildPurchaseInvoice(draft(), { pieceJointe: { url: "https://example.test/old", storagePath: "old.pdf", nom: "old.pdf" } });
    const env = environment([invoice]); env.hooks.rejectBeforeCommit = true;
    const result = await env.service.save(model.invoiceToDraft(invoice), { pieceJointe: new File(["receipt"], "receipt.pdf", { type: "application/pdf" }) });
    assert.equal(result.success, false);
    assert.equal(env.calls.some(([kind]) => kind === "deleteFile"), false);
    assert.equal(env.store.get(invoice.id).pieceJointe.storagePath, "old.pdf");
  });

  await test("suppression de facture atomique, nouvelle tentative sans effet et fichier supprimé après", async () => {
    const invoice = model.buildPurchaseInvoice(draft(), { pieceJointe: { url: "https://example.test/file", storagePath: "file.pdf", nom: "file.pdf" } });
    const env = environment([invoice]);
    assert.equal((await env.service.delete(invoice.id, 1)).success, true);
    assert.equal(env.store.size, 0);
    assert.deepEqual(env.calls.map(([kind]) => kind), ["atomic", "deleteFile"]);
    assert.equal((await env.service.delete(invoice.id, 1)).success, true);
  });

  await test("pièces jointes limitées à 10 Mo et formats document/photo", () => {
    assert.ok(validateInvoiceAttachment(new File(["x"], "script.html", { type: "text/html" })));
    assert.ok(validateInvoiceAttachment(new File([], "empty.pdf", { type: "application/pdf" })));
    assert.ok(validateInvoiceAttachment({ size: 10 * 1024 * 1024 + 1, type: "application/pdf", name: "large.pdf" }));
    assert.equal(validateInvoiceAttachment(new File(["x"], "photo.HEIC")), null);
  });

  console.log(`\n${passed} tests factures d’achat réussis (aucun accès réseau).`);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
