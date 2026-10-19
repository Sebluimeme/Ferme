#!/usr/bin/env node
/** Régression des imports RTDB sans id : lecture locale uniquement, aucun accès Firebase. */
import assert from "node:assert/strict";
import { readTransactionRecords } from "../src/lib/transaction-records.ts";
import { computeStats } from "../src/types/comptabilite.ts";

const entry = (montant, overrides = {}) => ({
  date: "2026-10-19", operation: "Dépenses", production: "Porcs", categorie: "Charges",
  sousCategorie: "Nourritures", produit: "Aliment", payeur: "BY", montant, ...overrides,
});
let passed = 0;
function test(name, run) {
  run();
  passed++;
  console.log(`  ✅ ${name}`);
}

test("deux écritures sans champ id restent deux transactions distinctes", () => {
  const records = { "import-a": entry(12.25), "import-b": entry(20.5) };
  const original = structuredClone(records);
  const transactions = readTransactionRecords(records);
  assert.deepEqual(transactions.map(({ id }) => id), ["import-a", "import-b"]);
  assert.equal(new Set(transactions.map(({ id, factureId }) => factureId || id)).size, 2);
  assert.deepEqual(records, original, "La lecture ne complète pas les objets stockés en place");
});

test("la clé RTDB prévaut sur un id embarqué dupliqué ou obsolète", () => {
  const transactions = readTransactionRecords({
    "key-a": entry(25, { id: "same-import-id" }),
    "key-b": entry(50, { id: "same-import-id" }),
    "key-c": entry(10, { id: "key-c" }),
  });
  assert.deepEqual(transactions.map(({ id }) => id), ["key-a", "key-b", "key-c"]);
  assert.equal(new Set(transactions.map(({ id }) => id)).size, 3);
});

test("hydrater les identifiants conserve tous les montants et leur somme", () => {
  const records = {
    "import-a": entry(12.25),
    "import-b": entry(20.5),
    "existing-c": entry(7.75, { id: "existing-c" }),
    "sale-d": entry(9.5, { operation: "Revenus", categorie: "Ventes" }),
  };
  const before = computeStats(Object.values(records));
  const after = computeStats(readTransactionRecords(records));
  assert.deepEqual(after, before);
  assert.deepEqual(after, { totalDepenses: 40.5, totalRevenus: 9.5, balance: -31, nbTransactions: 4 });
});

test("une collection absente ou vide fournit une liste vide", () => {
  for (const records of [null, undefined, {}]) assert.deepEqual(readTransactionRecords(records), []);
});

console.log(`✅ ${passed} tests identifiants des écritures OK`);
