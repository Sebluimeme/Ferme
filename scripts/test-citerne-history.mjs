#!/usr/bin/env node
import { computeEstimatedFlows } from "../src/lib/citerneHistory.ts";

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: attendu ${expected}, reçu ${actual}`);
  }
}

const liveHistory = [
  { niveauPct: 89.4, receivedAt: "2026-08-14T19:28:08.206Z", volumeLitres: 39523 },
  { niveauPct: 95.5, receivedAt: "2026-08-15T02:00:02.824Z", volumeLitres: 42192 },
];

const estimates = computeEstimatedFlows(liveHistory);
assertEqual(estimates.length, 1, "une estimation avec deux mesures");
assertEqual(estimates[0].debitLitresPerHour, 408.61, "débit net live");
assertEqual(estimates[0].receivedAt, "2026-08-15T02:00:02.824Z", "horodatage du second relevé");

assertEqual(computeEstimatedFlows([liveHistory[0]]).length, 0, "aucune estimation avec une seule mesure");

console.log("✅ citerne history: 4 assertions passées — débit net 408,61 L/h");
