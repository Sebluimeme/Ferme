#!/usr/bin/env node
/**
 * Tests des calculs purs du fourrage (récolte vs achat de bottes).
 * Usage: node scripts/test-fourrage-calculs.mjs
 *
 * Autonome : importe directement src/lib/fourrage-calculs.ts (type stripping Node).
 */

import { fileURLToPath } from "node:url";
import path from "node:path";

const CALCULS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "lib",
  "fourrage-calculs.ts"
);

const {
  origineActivite,
  estAchat,
  estRecolte,
  filtrerRecoltes,
  filtrerAchats,
  totalTonnes,
  totalBottes,
  recoltesDeType,
  stockFoin,
  surfaceRecolteeParType,
  rendementMoyen,
  rendementParParcelle,
  donneesMensuellesRecoltes,
  distributionDuJour,
  derniereUniteCheptel,
  totalDistribueCheptel,
  totalDistribuePeriode,
} = await import(CALCULS);

// ─── Infrastructure de test ──────────────────────────────────────────────────

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`      ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion échouée");
}

function assertClose(actual, expected, msg, eps = 1e-9) {
  if (Math.abs(actual - expected) > eps) {
    throw new Error(`${msg || "valeur"} : attendu ${expected}, obtenu ${actual}`);
  }
}

// ─── Jeu de données ──────────────────────────────────────────────────────────

const PARTIELS = [
  { id: "p1", nom: "Grand pré", surface: 2 },
  { id: "p2", nom: "Bas du village", surface: 4 },
  { id: "p3", nom: "Sans surface", surface: 0 },
];

// Ancienne donnée sans champ `origine` → doit être traitée comme une récolte
const RECOLTE_LEGACY = {
  typeActivite: "foin",
  dateActivite: "2026-06-15",
  parcelIds: ["p1"],
  nombreBottes: 100,
  poidsTonne: 1.65,
};

const RECOLTE_EXPLICITE = {
  typeActivite: "foin",
  dateActivite: "2026-07-02",
  origine: "recolte",
  parcelIds: ["p2"],
  nombreBottes: 200,
  poidsTonne: 3.3,
};

const REGAIN = {
  typeActivite: "regain",
  dateActivite: "2026-09-10",
  origine: "recolte",
  parcelIds: ["p1"],
  nombreBottes: 50,
  poidsTonne: 0.825,
};

// Les 6 bottes achetées (cas réel à corriger en base)
const ACHAT = {
  typeActivite: "foin",
  dateActivite: "2026-07-20",
  origine: "achat",
  nombreBottes: 6,
  poidsTonne: 0.099,
  fournisseur: "GAEC voisin",
  prixTotal: 120,
};

// Achat mal saisi avec une parcelle résiduelle : ne doit rien polluer
const ACHAT_AVEC_PARCELLE = {
  typeActivite: "foin",
  dateActivite: "2026-08-01",
  origine: "achat",
  parcelIds: ["p1"],
  nombreBottes: 10,
  poidsTonne: 0.165,
};

const TOUTES = [RECOLTE_LEGACY, RECOLTE_EXPLICITE, REGAIN, ACHAT, ACHAT_AVEC_PARCELLE];

const MOIS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

// ─── Origine ─────────────────────────────────────────────────────────────────

console.log("\n── Origine (compat ancienne données) ──");

test("une activité sans origine est une récolte", () => {
  assert(origineActivite(RECOLTE_LEGACY) === "recolte");
  assert(estRecolte(RECOLTE_LEGACY));
  assert(!estAchat(RECOLTE_LEGACY));
});

test("origine null ou inconnue retombe sur récolte", () => {
  assert(origineActivite({ ...RECOLTE_LEGACY, origine: null }) === "recolte");
  assert(origineActivite({ ...RECOLTE_LEGACY, origine: "" }) === "recolte");
  assert(origineActivite({ ...RECOLTE_LEGACY, origine: "bidon" }) === "recolte");
});

test("origine achat est reconnue", () => {
  assert(origineActivite(ACHAT) === "achat");
  assert(estAchat(ACHAT));
  assert(!estRecolte(ACHAT));
});

test("filtrerRecoltes / filtrerAchats partitionnent la liste", () => {
  assert(filtrerRecoltes(TOUTES).length === 3, "3 récoltes attendues");
  assert(filtrerAchats(TOUTES).length === 2, "2 achats attendus");
  assert(filtrerRecoltes(TOUTES).length + filtrerAchats(TOUTES).length === TOUTES.length);
});

// ─── Stock foin ──────────────────────────────────────────────────────────────

console.log("\n── Stock foin (objectif) ──");

test("le stock foin additionne récoltes et achats", () => {
  const s = stockFoin(TOUTES);
  assertClose(s.recolteT, 1.65 + 3.3, "récolté");
  assertClose(s.acheteT, 0.099 + 0.165, "acheté");
  assertClose(s.totalT, 1.65 + 3.3 + 0.099 + 0.165, "total");
  assert(s.bottesRecoltees === 300, "bottes récoltées");
  assert(s.bottesAchetees === 16, "bottes achetées");
});

test("le regain n'entre pas dans le stock foin", () => {
  const s = stockFoin([REGAIN]);
  assertClose(s.totalT, 0, "total");
});

test("le stock foin peut être filtré par année", () => {
  const anciens = [{ ...RECOLTE_LEGACY, dateActivite: "2025-06-15" }, ACHAT];
  const s = stockFoin(anciens, 2026);
  assertClose(s.recolteT, 0, "récolté 2026");
  assertClose(s.acheteT, 0.099, "acheté 2026");
});

test("les 6 bottes achetées comptent dans le stock mais pas dans le récolté", () => {
  const s = stockFoin([ACHAT]);
  assertClose(s.totalT, 0.099, "total");
  assertClose(s.recolteT, 0, "récolté");
  assert(s.bottesAchetees === 6);
});

// ─── Rendements ──────────────────────────────────────────────────────────────

console.log("\n── Rendements (achats exclus) ──");

test("recoltesDeType exclut les achats du même type", () => {
  const foins = recoltesDeType(TOUTES, "foin");
  assert(foins.length === 2, `2 récoltes de foin attendues, obtenu ${foins.length}`);
  assert(foins.every((a) => !estAchat(a)));
});

test("totalFoinT / totalRegainT ignorent les achats", () => {
  assertClose(totalTonnes(recoltesDeType(TOUTES, "foin")), 4.95, "foin récolté");
  assertClose(totalTonnes(recoltesDeType(TOUTES, "regain")), 0.825, "regain récolté");
});

test("la surface récoltée ignore la parcelle d'un achat mal saisi", () => {
  // p1 (2 ha) via RECOLTE_LEGACY, p2 (4 ha) via RECOLTE_EXPLICITE ; ACHAT_AVEC_PARCELLE n'ajoute rien
  assertClose(surfaceRecolteeParType(PARTIELS, TOUTES, "foin"), 6, "surface foin");
  assertClose(surfaceRecolteeParType(PARTIELS, [ACHAT_AVEC_PARCELLE], "foin"), 0, "surface achat seul");
});

test("le rendement moyen est calculé sur les seules récoltes", () => {
  assertClose(rendementMoyen(PARTIELS, TOUTES, "foin"), 4.95 / 6, "rdt foin");
  assert(rendementMoyen(PARTIELS, [ACHAT, ACHAT_AVEC_PARCELLE], "foin") === null, "rdt achat seul = null");
});

test("un achat n'apparaît jamais dans le rendement par parcelle", () => {
  const rdt = rendementParParcelle(PARTIELS, TOUTES);
  const p1 = rdt.find((r) => r.parcelle.id === "p1");
  assertClose(p1.foinT, 1.65, "foin p1 (sans les 10 bottes achetées)");
  assertClose(p1.regainT, 0.825, "regain p1");
  assertClose(p1.rdt, (1.65 + 0.825) / 2, "rdt p1");
  const p2 = rdt.find((r) => r.parcelle.id === "p2");
  assertClose(p2.foinT, 3.3, "foin p2");
});

test("les parcelles sans récolte ou sans surface sont exclues", () => {
  const rdt = rendementParParcelle(PARTIELS, [ACHAT_AVEC_PARCELLE]);
  assert(rdt.length === 0, "aucune ligne pour un achat seul");
  assert(!rendementParParcelle(PARTIELS, TOUTES).some((r) => r.parcelle.id === "p3"), "p3 sans surface exclue");
});

test("les récoltes multi-parcelles restent exclues du rendement par parcelle", () => {
  const multi = { typeActivite: "foin", dateActivite: "2026-06-20", parcelIds: ["p1", "p2"], poidsTonne: 10 };
  const rdt = rendementParParcelle(PARTIELS, [multi]);
  assert(rdt.length === 0, "chantier multi-parcelles ignoré");
});

// ─── Courbe mensuelle ────────────────────────────────────────────────────────

console.log("\n── Courbe mensuelle des récoltes ──");

test("les achats n'apparaissent pas dans les données mensuelles", () => {
  const data = donneesMensuellesRecoltes(TOUTES, 2026, MOIS);
  assertClose(data[5].foin, 1.65, "juin");        // RECOLTE_LEGACY
  assertClose(data[6].foin, 3.3, "juillet");      // RECOLTE_EXPLICITE, sans l'ACHAT du 20/07
  assert(data[7].foin === null, "août sans récolte malgré l'achat du 01/08");
  assertClose(data[8].regain, 0.825, "septembre");
});

test("une autre année ne remonte rien", () => {
  const data = donneesMensuellesRecoltes(TOUTES, 2025, MOIS);
  assert(data.every((d) => d.foin === null && d.regain === null), "2025 vide");
});

test("totalBottes tolère les champs absents", () => {
  assert(totalBottes([{ typeActivite: "foin", dateActivite: "2026-01-01" }]) === 0);
  assertClose(totalTonnes([{ typeActivite: "foin", dateActivite: "2026-01-01" }]), 0);
});

// ─── Distribution quotidienne ─────────────────────────────────────────────────

console.log("\n── Distribution quotidienne ──");

const DISTRIBUTIONS = [
  { id: "d1", dateDistribution: "2026-08-15", cheptel: "ovin", unite: "botte", quantite: 3 },
  { id: "d2", dateDistribution: "2026-08-16", cheptel: "ovin", unite: "balle", quantite: 2 },
  { id: "d3", dateDistribution: "2026-08-16", cheptel: "bovin", unite: "botte", quantite: 4 },
];

test("la distribution du jour reste séparée par cheptel", () => {
  assert(distributionDuJour(DISTRIBUTIONS, "ovin", "2026-08-16")?.id === "d2");
  assert(distributionDuJour(DISTRIBUTIONS, "bovin", "2026-08-16")?.id === "d3");
  assert(distributionDuJour(DISTRIBUTIONS, "ovin", "2026-08-17") === undefined);
});

test("la dernière unité est conservée indépendamment par cheptel", () => {
  assert(derniereUniteCheptel(DISTRIBUTIONS, "ovin") === "balle");
  assert(derniereUniteCheptel(DISTRIBUTIONS, "bovin") === "botte");
  assert(derniereUniteCheptel(DISTRIBUTIONS, "caprin") === null);
});

test("les totaux de distribution filtrent le cheptel et la période", () => {
  assert(totalDistribueCheptel(DISTRIBUTIONS, "ovin") === 5);
  assert(totalDistribuePeriode(DISTRIBUTIONS, "ovin", "2026-08-16", "2026-08-16") === 2);
});

// ─── Résultat ────────────────────────────────────────────────────────────────

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} test(s) réussi(s), ${failed} échec(s)\n`);
process.exit(failed === 0 ? 0 : 1);
