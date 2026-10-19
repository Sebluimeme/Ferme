#!/usr/bin/env node
/** Régressions réelles lecture/filtre/saisie ; transport mémoire, aucun réseau ni Firebase. */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const directory = await mkdtemp(join(tmpdir(), "ferme-payers-tests-"));
let passed = 0;

try {
  const modules = [
    ["../src/lib/comptabilite-payers.ts", "payers.mjs"],
    ["../src/types/comptabilite.ts", "finance.mjs"],
    ["../src/services/comptabilite-write-safety.ts", "safety.mjs"],
    ["../src/services/comptabilite-service.ts", "accounting.mjs"],
    ["../src/services/apiculture-service.ts", "apiculture.mjs"],
  ];
  for (const [source, destination] of modules) {
    const compiled = ts.transpileModule(await readFile(new URL(source, import.meta.url), "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText
      .replaceAll('"@/lib/comptabilite-payers"', '"./payers.mjs"')
      .replaceAll('"@/types/comptabilite"', '"./finance.mjs"')
      .replaceAll('"./comptabilite-write-safety"', '"./safety.mjs"')
      .replaceAll('"@/lib/firebase-service"', '"./memory.mjs"');
    await writeFile(join(directory, destination), compiled);
  }
  await writeFile(join(directory, "memory.mjs"), `
    export const records = new Map();
    export const writes = [];
    export const failures = new Set();
    export default {
      async getById(path, id) { return { success: records.has(path + "/" + id), data: structuredClone(records.get(path + "/" + id)) }; },
      async getAll() { throw new Error("Toute lecture doit être explicitement injectée par le test"); },
      async create(path, data) {
        const id = "entry-" + writes.length;
        writes.push({ path, id, data: structuredClone(data) });
        records.set(path + "/" + id, structuredClone({ ...data, id }));
        return { success: true, id, data: { ...data, id } };
      },
      async update(path, id, data) {
        writes.push({ path, id, data: structuredClone(data) });
        if (failures.has(path)) return { success: false, error: "Écriture refusée" };
        records.set(path + "/" + id, structuredClone({ ...records.get(path + "/" + id), ...data }));
        return { success: true };
      },
    };
  `);
  const load = (name) => import(pathToFileURL(join(directory, name)));
  const payers = await load("payers.mjs");
  const finance = await load("finance.mjs");
  const accounting = await load("accounting.mjs");
  const apiculture = await load("apiculture.mjs");
  const { records, writes, failures } = await load("memory.mjs");

  async function test(name, fn) {
    records.clear(); writes.length = 0; failures.clear();
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  }
  const transaction = (id, payeur, montant, overrides = {}) => ({
    id, payeur, montant, date: "2026-10-19", operation: "Dépenses", nature: "exploitation",
    production: "Abeille", categorie: "Charges", sousCategorie: "Nourritures", produit: "Achat test", ...overrides,
  });

  await test("un compte Revolut, trois graphies ; les personnes et libellés inconnus restent distincts", () => {
    assert.deepEqual(payers.uniquePayers(["SY", "BY", "Revolut", "revolut", " REVOLUT ", "Autre", "autre", ""]), ["SY", "BY", "revolut", "Autre", "autre"]);
    assert.equal(payers.payerLabel(" REVOLUT "), "Ferme · Revolut");
    assert.equal(payers.samePayer("Revolut", "revolut"), true);
    assert.equal(payers.samePayer("SY", "BY"), false);
    assert.equal(payers.normalizePayer("sy"), "sy");
  });

  await test("le filtre regroupe les écritures Revolut sans les dédupliquer ni changer leurs montants", () => {
    const entries = [transaction("a", "Revolut", 40), transaction("b", "revolut", 40), transaction("c", " REVOLUT ", 8.25), transaction("d", "BY", 50)];
    const before = structuredClone(entries);
    for (const payeur of ["revolut", "Revolut", " REVOLUT "]) {
      const selected = accounting.filterTransactions(entries, { payeur });
      assert.deepEqual(selected.map(entry => entry.id), ["a", "b", "c"]);
      assert.equal(finance.computeStats(selected).totalDepenses, 88.25);
    }
    assert.deepEqual(entries, before);
    assert.deepEqual(finance.computeCreditorBalances(entries), { SY: 0, BY: 50 });
    assert.deepEqual(accounting.filterTransactions(entries, { payeur: "revolut", production: "Porcs" }), []);
  });

  await test("la configuration lue présente un seul compte sans aucune écriture automatique", async () => {
    const config = { productions: [], categories: [], sousCategories: [], payeurs: ["Revolut", "revolut", "SY", "BY", " REVOLUT "] };
    records.set("comptabilite-config/categories", structuredClone(config));
    const read = await accounting.getCategoriesConfig();
    assert.deepEqual(read.payeurs, ["BY", "SY", "revolut"]);
    assert.equal(writes.length, 0);
    assert.deepEqual(records.get("comptabilite-config/categories"), config);
  });

  await test("une configuration explicitement enregistrée ne recrée pas les doublons Revolut", async () => {
    await accounting.updateCategoriesConfig({ productions: ["Porcs"], categories: [], sousCategories: [], payeurs: ["Revolut", "revolut", "BY"] });
    assert.deepEqual(writes[0].data.payeurs, ["revolut", "BY"]);
    assert.deepEqual(writes[0].data.productions, ["Porcs"]);
  });

  await test("les nouvelles écritures historiques normalisent le compte sans changer le montant", async () => {
    const form = { ...finance.EMPTY_TRANSACTION_FORM, date: "2026-10-19", production: "Porcs", categorie: "Charges", sousCategorie: "Nourritures", produit: "Aliment", montant: "12,34", payeur: " Revolut " };
    const result = await accounting.createTransaction(form, undefined, []);
    assert.equal(result.success, true);
    assert.equal(writes[0].data.payeur, "revolut");
    assert.equal(writes[0].data.montant, 12.34);
    assert.equal(form.payeur, " Revolut ");
  });

  await test("modifier une écriture existante normalise uniquement le compte soumis", async () => {
    records.set("transactions/old", transaction("old", "Revolut", 12.34));
    const form = { ...finance.EMPTY_TRANSACTION_FORM, date: "2026-10-19", production: "Abeille", categorie: "Charges", sousCategorie: "Nourritures", produit: "Achat test", montant: "12,34", payeur: "Revolut" };
    assert.equal((await accounting.updateTransaction("old", form, undefined, undefined, [])).success, true);
    assert.equal(writes[0].data.payeur, "revolut");
    assert.equal(writes[0].data.montant, 12.34);
    assert.equal(writes.length, 1);
  });

  await test("vente de miel et écriture miroir utilisent désormais le même compte ferme", async () => {
    await apiculture.createVente({ dateVente: "2026-10-19", nbPots500g: 1, nbPots1kg: 0, prixTotal: 6, beneficiaire: "Revolut" });
    assert.equal(writes.length, 2);
    assert.equal(writes[0].path, "transactions");
    assert.equal(writes[0].data.payeur, "revolut");
    assert.equal(writes[0].data.montant, 6);
    assert.equal(writes[1].path, "ventes-miel");
    assert.equal(writes[1].data.beneficiaire, "revolut");
    assert.equal(writes[1].data.transactionId, writes[0].id);
  });

  await test("changer uniquement le bénéficiaire actualise le miroir et conserve montant, date et type de miel", async () => {
    const sale = { id: "sale", transactionId: "mirror", dateVente: "2026-07-04", nbPots500g: 2, nbPots1kg: 3, prixTotal: 42, typeMiel: "Acacia", beneficiaire: "BY", notes: "Vente test" };
    records.set("ventes-miel/sale", structuredClone(sale));
    const result = await apiculture.updateVente("sale", { beneficiaire: " Revolut " }, sale);
    assert.equal(result.success, true);
    assert.equal(writes.length, 2);
    const mirror = records.get("transactions/mirror");
    assert.equal(mirror.payeur, "revolut");
    assert.equal(mirror.montant, 42);
    assert.equal(mirror.date, "2026-07-04");
    assert.equal(mirror.produit, "Vente miel (2×½kg, 3×1kg, Acacia)");
    assert.equal(mirror.remarque, "Vente test");
    assert.deepEqual(records.get("ventes-miel/sale"), { ...sale, beneficiaire: "revolut" });
    assert.equal(sale.beneficiaire, "BY");
  });

  await test("modifier le type de miel conserve Benjamin comme bénéficiaire", async () => {
    const sale = { id: "sale", transactionId: "mirror", dateVente: "2026-07-04", nbPots500g: 1, nbPots1kg: 0, prixTotal: 6, typeMiel: "Acacia", beneficiaire: "BY" };
    records.set("ventes-miel/sale", structuredClone(sale));
    assert.equal((await apiculture.updateVente("sale", { typeMiel: "Tilleul" }, sale)).success, true);
    assert.equal(records.get("transactions/mirror").payeur, "BY");
    assert.equal(records.get("ventes-miel/sale").beneficiaire, "BY");
    assert.match(records.get("transactions/mirror").produit, /Tilleul/);
  });

  await test("un refus de mise à jour du miroir ne modifie pas la vente ni son bénéficiaire", async () => {
    const sale = { id: "sale", transactionId: "mirror", dateVente: "2026-07-04", nbPots500g: 1, nbPots1kg: 0, prixTotal: 6, beneficiaire: "BY" };
    records.set("ventes-miel/sale", structuredClone(sale));
    failures.add("transactions");
    const result = await apiculture.updateVente("sale", { beneficiaire: "revolut" }, sale);
    assert.equal(result.success, false);
    assert.equal(writes.length, 1);
    assert.deepEqual(records.get("ventes-miel/sale"), sale);
  });

  await test("Revolut reste un compte et ne peut pas recevoir une avance ou un remboursement personnel", () => {
    const form = { ...finance.EMPTY_TRANSACTION_FORM, date: "2026-10-19", production: "Ferme", categorie: "Avance", sousCategorie: "Avance personnelle vers Revolut", produit: "Avance", nature: "avance", montant: "100", payeur: "Revolut" };
    assert.equal(accounting.validateTransactionData(form).valid, false);
    assert.deepEqual(finance.computeCreditorBalances([transaction("a", "Revolut", 100), transaction("b", "revolut", 100)]), { SY: 0, BY: 0 });
  });

  console.log(`\n${passed} tests payeurs réussis (aucun accès réseau).`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
