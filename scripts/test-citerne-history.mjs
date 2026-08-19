#!/usr/bin/env node
import {
  buildCiterneHistoryRecord,
  buildWaterLevelChartData,
  CITERNE_HISTORY_MAX_POINTS,
  CITERNE_HISTORY_READ_QUERY,
  computeEstimatedFlows,
  hasTraceableWaterLevelHistory,
  normalizeCiterneHistory,
} from "../src/lib/citerneHistory.ts";

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

// Citerne 2 : discovery pas encore vue par HA → RTDB n'a jamais reçu d'historique.
assertEqual(normalizeCiterneHistory(null).length, 0, "historique citerne 2 absent (null) → tableau vide");
assertEqual(normalizeCiterneHistory(undefined).length, 0, "historique citerne 2 absent (undefined) → tableau vide");
assertEqual(normalizeCiterneHistory({}).length, 0, "historique citerne 2 absent (objet vide RTDB) → tableau vide");
assertEqual(computeEstimatedFlows(normalizeCiterneHistory(null)).length, 0, "aucune estimation de débit sans historique citerne 2");

const tank2History = normalizeCiterneHistory([
  { niveauPct: null, hauteurCm: 18.5, receivedAt: "2026-08-14T19:28:08.206Z", volumeLitres: 39523 },
]);
assertEqual(tank2History.length, 1, "hauteur en cm de la citerne 2 conservée");
assertEqual(tank2History[0].hauteurCm, 18.5, "valeur de hauteur en cm inchangée");
assertEqual(normalizeCiterneHistory([
  { niveauPct: null, hauteurCm: -1, receivedAt: "2026-08-14T19:28:08.206Z", volumeLitres: 39523 },
]).length, 0, "hauteur négative rejetée");

const persistedTank2Record = buildCiterneHistoryRecord(2, {
  volumeDisponible: { value: 39523 },
  niveau: { value: 89.4 },
  hauteurEau: { value: 1.85 },
});
assertEqual(persistedTank2Record?.volumeLitres, 39523, "volume conservé dans l'historique");
assertEqual(persistedTank2Record?.niveauPct, 89.4, "niveau conservé dans l'historique");
assertEqual(persistedTank2Record?.hauteurCm, 185, "hauteurEau en mètres persistée en cm");

assertEqual(CITERNE_HISTORY_MAX_POINTS, 180, "limite d'historique à 180 points");
assertEqual(CITERNE_HISTORY_READ_QUERY.limitToLast, "180", "requête Firebase bornée à 180 points");

const singleDateChart = buildWaterLevelChartData(
  [{ niveauPct: 89.4, receivedAt: "2026-08-14T19:28:08.206Z", volumeLitres: 39523 }],
  [{ niveauPct: null, hauteurCm: 185, receivedAt: "2026-08-14T20:00:00.000Z", volumeLitres: 40000 }],
);
assertEqual(singleDateChart.length, 1, "deux relevés le même jour forment une seule date de graphique");
assertEqual(hasTraceableWaterLevelHistory(singleDateChart), false, "une seule date conserve l'état vide du graphique");
assertEqual(hasTraceableWaterLevelHistory(buildWaterLevelChartData([], [
  { niveauPct: null, hauteurCm: 185, receivedAt: "2026-08-14T20:00:00.000Z", volumeLitres: 40000 },
  { niveauPct: null, hauteurCm: 180, receivedAt: "2026-08-15T20:00:00.000Z", volumeLitres: 39000 },
])), true, "deux dates distinctes pour une citerne rendent le graphique traçable");

console.log("✅ citerne history: 19 assertions passées — débit net, persistance Citerne 2, limite 180 et seuil de graphique vérifiés");
