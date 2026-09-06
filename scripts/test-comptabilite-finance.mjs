#!/usr/bin/env node
/**
 * Tests du modèle finances comptabilité : exploitation séparée des avances/remboursements.
 */
import assert from "node:assert/strict";
import {
  computeCreditorBalances,
  computeStats,
  getDebtImpact,
  isOperatingTransaction,
  validateNoNegativeDebt,
} from "../src/types/comptabilite.ts";

function tx(overrides) {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    date: overrides.date ?? "2026-09-06",
    operation: overrides.operation ?? "Dépenses",
    production: overrides.production ?? "Bovins",
    categorie: overrides.categorie ?? "Charges",
    sousCategorie: overrides.sousCategorie ?? "Nourritures",
    produit: overrides.produit ?? "Transaction test",
    payeur: overrides.payeur ?? "SY",
    montant: overrides.montant ?? 0,
    ...overrides,
  };
}

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✅ ${name}`);
}

console.log("🧪 Comptabilité finances/dettes");

test("dépense payée par Sébastien augmente seulement sa dette", () => {
  const balances = computeCreditorBalances([
    tx({ id: "a", operation: "Dépenses", payeur: "SY", montant: 120 }),
  ]);
  assert.equal(balances.SY, 120);
  assert.equal(balances.BY, 0);
});

test("recette encaissée par Sébastien diminue seulement sa dette", () => {
  const balances = computeCreditorBalances([
    tx({ id: "a", operation: "Dépenses", payeur: "SY", montant: 120 }),
    tx({ id: "b", operation: "Revenus", payeur: "SY", montant: 50, categorie: "Ventes" }),
    tx({ id: "c", operation: "Dépenses", payeur: "BY", montant: 80 }),
  ]);
  assert.equal(balances.SY, 70);
  assert.equal(balances.BY, 80);
});

test("Revolut est le compte ferme, jamais un créditeur", () => {
  const balances = computeCreditorBalances([
    tx({ id: "a", operation: "Dépenses", payeur: "revolut", montant: 99 }),
    tx({ id: "b", operation: "Revenus", payeur: "revolut", montant: 130 }),
  ]);
  assert.deepEqual(balances, { SY: 0, BY: 0 });
});

test("avance personnelle vers Revolut augmente la dette sans résultat d'exploitation", () => {
  const avance = tx({ id: "a", nature: "avance", operation: "Dépenses", payeur: "SY", montant: 400, categorie: "Avance" });
  assert.equal(getDebtImpact(avance), 400);
  assert.equal(isOperatingTransaction(avance), false);
  const stats = computeStats([avance]);
  assert.equal(stats.totalDepenses, 0);
  assert.equal(stats.totalRevenus, 0);
  assert.equal(computeCreditorBalances([avance]).SY, 400);
});

test("remboursement depuis Revolut diminue la dette sans résultat d'exploitation", () => {
  const transactions = [
    tx({ id: "a", nature: "avance", operation: "Dépenses", payeur: "SY", montant: 400, categorie: "Avance" }),
    tx({ id: "b", nature: "remboursement", operation: "Revenus", payeur: "SY", montant: 200, categorie: "Remboursement" }),
  ];
  assert.equal(computeCreditorBalances(transactions).SY, 200);
  const stats = computeStats(transactions);
  assert.equal(stats.totalDepenses, 0);
  assert.equal(stats.totalRevenus, 0);
});

test("bloque un remboursement supérieur à la dette de la même personne", () => {
  const validation = validateNoNegativeDebt(
    tx({ id: "r", nature: "remboursement", operation: "Revenus", payeur: "SY", montant: 201, categorie: "Remboursement" }),
    [tx({ id: "a", operation: "Dépenses", payeur: "SY", montant: 200 })]
  );
  assert.equal(validation.valid, false);
  assert.match(validation.error, /dette de Sébastien/i);
});

test("autorise un remboursement égal à la dette sans toucher l'autre personne", () => {
  const transactions = [
    tx({ id: "a", operation: "Dépenses", payeur: "SY", montant: 200 }),
    tx({ id: "b", operation: "Dépenses", payeur: "BY", montant: 80 }),
    tx({ id: "r", nature: "remboursement", operation: "Revenus", payeur: "SY", montant: 200, categorie: "Remboursement" }),
  ];
  assert.equal(validateNoNegativeDebt(transactions[2], transactions.slice(0, 2)).valid, true);
  assert.deepEqual(computeCreditorBalances(transactions), { SY: 0, BY: 80 });
});

console.log(`✅ ${passed} tests comptabilité finances OK`);
