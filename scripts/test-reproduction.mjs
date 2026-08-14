#!/usr/bin/env node
/**
 * Test logique du suivi de reproduction (chaleurs, gestation, alertes J-3).
 * Usage: node scripts/test-reproduction.mjs
 *
 * Ce script est autonome (pas de Firebase) et teste la logique pure,
 * miroir exact de src/lib/reproduction.ts et src/lib/reproduction-notifications.ts.
 */

// ─── Constantes (miroir de src/lib/reproduction.ts) ───────────────────────────

const GESTATION_DAYS_DEFAULT = {
  ovin: 152,
  caprin: 150,
  porcin: 114,
  bovin: 283,
  equin: 340,
};

const GESTATION_ALERT_WINDOW_DAYS = 15;
const GESTATION_OVERDUE_GRACE_DAYS = 10;

const CYCLE_DAYS_DEFAULT = {
  ovin: 17,
  caprin: 21,
  bovin: 21,
  porcin: 21,
  equin: 21,
};

const HEAT_ALERT_WINDOW_DAYS = 7;
const NOTIFY_DUE_DAYS = 3;

// ─── Helpers (miroir exact de reproduction.ts / irrigationScheduler.ts) ───────

function localDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function midnight(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function getGestationDurationDays(animal) {
  if (animal.dureeGestationJours && animal.dureeGestationJours > 0) return animal.dureeGestationJours;
  return GESTATION_DAYS_DEFAULT[animal.type] || 150;
}

function calculateEstimatedBirthDate(dateSaillie, gestationDays) {
  const start = new Date(dateSaillie);
  if (isNaN(start.getTime())) return null;
  const result = new Date(start);
  result.setDate(result.getDate() + gestationDays);
  return result;
}

function getGestationAlert(animal, todayInput = new Date()) {
  if (!animal.dateSaillie) return null;
  if (animal.sexe !== "F") return null;
  if (animal.statut !== "actif") return null;

  const gestationDays = getGestationDurationDays(animal);
  const dateEstimee = calculateEstimatedBirthDate(animal.dateSaillie, gestationDays);
  if (!dateEstimee) return null;

  const today = new Date(todayInput);
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateEstimee);
  target.setHours(0, 0, 0, 0);
  const joursRestants = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (joursRestants > GESTATION_ALERT_WINDOW_DAYS) return null;
  if (joursRestants < -GESTATION_OVERDUE_GRACE_DAYS) return null;

  return { dateEstimee, joursRestants, enRetard: joursRestants < 0 };
}

function isEnGestation(animal, today) {
  if (!animal.dateSaillie) return false;
  const gestationDays = getGestationDurationDays(animal);
  const birthDate = calculateEstimatedBirthDate(animal.dateSaillie, gestationDays);
  if (!birthDate) return false;
  return midnight(birthDate).getTime() >= midnight(today).getTime();
}

function getNextHeatDate(animal, chaleurs, today = new Date()) {
  const validDates = (chaleurs || [])
    .map((c) => new Date(c.date))
    .filter((d) => !isNaN(d.getTime()));
  if (validDates.length === 0) return null;

  const lastObserved = midnight(new Date(Math.max(...validDates.map((d) => d.getTime()))));
  const cycleDays = CYCLE_DAYS_DEFAULT[animal.type] || 21;
  const todayMidnight = midnight(today);

  const next = new Date(lastObserved);
  while (next.getTime() < todayMidnight.getTime()) {
    next.setDate(next.getDate() + cycleDays);
  }
  return next;
}

function calculatePostServiceHeatDate(animal) {
  if (!animal.dateSaillie) return null;
  const serviceDate = new Date(animal.dateSaillie);
  if (isNaN(serviceDate.getTime())) return null;
  const result = new Date(serviceDate);
  result.setDate(result.getDate() + (CYCLE_DAYS_DEFAULT[animal.type] || 21));
  return result;
}

function getHeatAlert(animal, chaleurs, today = new Date()) {
  if (animal.sexe !== "F") return null;
  if (animal.statut !== "actif") return null;
  if (!chaleurs || chaleurs.length === 0) return null;
  if (isEnGestation(animal, today)) return null;

  const dateEstimee = getNextHeatDate(animal, chaleurs, today);
  if (!dateEstimee) return null;

  const joursRestants = Math.round((dateEstimee.getTime() - midnight(today).getTime()) / 86400000);
  if (joursRestants > HEAT_ALERT_WINDOW_DAYS) return null;

  return { dateEstimee, joursRestants };
}

function animalLabel(animal) {
  return animal.nom || animal.numeroBoucle || "Animal";
}

function selectDueNotifications(animaux, chaleursByAnimal, today = new Date()) {
  const notifications = [];

  for (const animal of animaux) {
    if (animal.sexe === "F" && animal.statut === "actif" && animal.dateSaillie) {
      const postServiceHeatDate = calculatePostServiceHeatDate(animal);
      if (postServiceHeatDate) {
        const target = midnight(postServiceHeatDate);
        const joursRestants = Math.round((target.getTime() - midnight(today).getTime()) / 86400000);
        if (joursRestants === NOTIFY_DUE_DAYS) {
          const dateEvenement = localDateString(postServiceHeatDate);
          notifications.push({
            type: "controle_retour_chaleur",
            animalId: animal.id,
            animalLabel: animalLabel(animal),
            dateEvenement,
            dedupKey: `controle-retour-chaleur-${animal.id}-${dateEvenement}`,
          });
        }
      }
    }

    const heatAlert = getHeatAlert(animal, chaleursByAnimal[animal.id] || [], today);
    if (heatAlert && heatAlert.joursRestants === NOTIFY_DUE_DAYS) {
      const dateEvenement = localDateString(heatAlert.dateEstimee);
      notifications.push({
        type: "chaleur",
        animalId: animal.id,
        animalLabel: animalLabel(animal),
        dateEvenement,
        dedupKey: `chaleur-${animal.id}-${dateEvenement}`,
      });
    }

    const gestationAlert = getGestationAlert(animal, today);
    if (gestationAlert && !gestationAlert.enRetard && gestationAlert.joursRestants === NOTIFY_DUE_DAYS) {
      const dateEvenement = localDateString(gestationAlert.dateEstimee);
      notifications.push({
        type: "mise_bas",
        animalId: animal.id,
        animalLabel: animalLabel(animal),
        dateEvenement,
        dedupKey: `mise_bas-${animal.id}-${dateEvenement}`,
      });
    }
  }

  return notifications;
}

// ─── Infrastructure de test ───────────────────────────────────────────────────

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message ?? "assertion failed");
}

function assertEqual(actual, expected, label = "") {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function makeAnimal(overrides = {}) {
  return {
    id: "a1",
    type: "ovin",
    sexe: "F",
    statut: "actif",
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── getNextHeatDate : projection sur plusieurs cycles ────────────────────────\n");

test("Une seule chaleur ancienne (ovin, cycle 17j) → projette au prochain cycle >= aujourd'hui", () => {
  const animal = makeAnimal({ type: "ovin" });
  const today = new Date("2026-08-12T10:00:00");
  const chaleurs = [{ date: "2026-07-01" }]; // 42 jours avant aujourd'hui
  const next = getNextHeatDate(animal, chaleurs, today);
  assert(next !== null, "date non nulle");
  // 2026-07-01 + 3*17j = 2026-08-04 (< today), +4*17j = 2026-08-21 (>= today)
  assertEqual(localDateString(next), "2026-08-21", "date projetée");
  assert(next.getTime() >= midnight(today).getTime(), "date >= aujourd'hui");
});

test("Chaleur observée exactement aujourd'hui → prochaine chaleur = aujourd'hui", () => {
  const animal = makeAnimal({ type: "caprin" });
  const today = new Date("2026-08-12T10:00:00");
  const chaleurs = [{ date: "2026-08-12" }];
  const next = getNextHeatDate(animal, chaleurs, today);
  assertEqual(localDateString(next), "2026-08-12");
});

test("Plusieurs observations → part de la plus récente", () => {
  const animal = makeAnimal({ type: "bovin" });
  const today = new Date("2026-08-12T10:00:00");
  const chaleurs = [{ date: "2026-01-01" }, { date: "2026-08-05" }, { date: "2026-03-15" }];
  const next = getNextHeatDate(animal, chaleurs, today);
  // Plus récente = 2026-08-05, cycle bovin 21j → 2026-08-26
  assertEqual(localDateString(next), "2026-08-26");
});

test("Aucune observation → null", () => {
  const animal = makeAnimal();
  assertEqual(getNextHeatDate(animal, []), null);
});

console.log("\n── getHeatAlert : exclusions ─────────────────────────────────────────────────\n");

test("Femelle gestante (terme non dépassé) → aucune alerte de chaleur", () => {
  const today = new Date("2026-08-12T10:00:00");
  const animal = makeAnimal({
    type: "ovin",
    dateSaillie: "2026-07-01", // terme estimé ~2026-11-30, pas encore atteint
    dureeGestationJours: 152,
  });
  const chaleurs = [{ date: "2026-08-09" }]; // aurait dû déclencher une alerte proche
  assertEqual(getHeatAlert(animal, chaleurs, today), null, "gestante → pas de chaleur");
});

test("Femelle dont le terme de gestation est dépassé → chaleurs de nouveau possibles", () => {
  const today = new Date("2026-08-12T10:00:00");
  const animal = makeAnimal({
    type: "ovin",
    dateSaillie: "2026-01-01",
    dureeGestationJours: 30, // terme largement dépassé
  });
  const chaleurs = [{ date: "2026-08-02" }]; // +17j = 2026-08-19 → dans la fenêtre de 7j
  const alert = getHeatAlert(animal, chaleurs, today);
  assert(alert !== null, "terme dépassé → alerte de chaleur possible");
});

test("Mâle → aucune alerte de chaleur", () => {
  const today = new Date("2026-08-12T10:00:00");
  const animal = makeAnimal({ sexe: "M" });
  const chaleurs = [{ date: "2026-08-09" }];
  assertEqual(getHeatAlert(animal, chaleurs, today), null);
});

test("Animal non actif (vendu/mort/réformé) → aucune alerte de chaleur", () => {
  const today = new Date("2026-08-12T10:00:00");
  const chaleurs = [{ date: "2026-08-09" }];
  for (const statut of ["vendu", "mort", "reforme"]) {
    const animal = makeAnimal({ statut });
    assertEqual(getHeatAlert(animal, chaleurs, today), null, `statut=${statut}`);
  }
});

test("Aucune chaleur observée → aucune alerte", () => {
  const today = new Date("2026-08-12T10:00:00");
  const animal = makeAnimal();
  assertEqual(getHeatAlert(animal, [], today), null);
});

test("Prochaine chaleur hors fenêtre (> 7 j) → aucune alerte", () => {
  const today = new Date("2026-08-12T10:00:00");
  const animal = makeAnimal({ type: "bovin" }); // cycle 21j
  const chaleurs = [{ date: "2026-08-01" }]; // prochaine chaleur ~2026-08-22, soit 10j
  const alert = getHeatAlert(animal, chaleurs, today);
  assertEqual(alert, null, "hors fenêtre 7j");
});

test("Prochaine chaleur dans la fenêtre (<= 7 j) → alerte présente", () => {
  const today = new Date("2026-08-12T10:00:00");
  const animal = makeAnimal({ type: "ovin" }); // cycle 17j
  const chaleurs = [{ date: "2026-07-26" }]; // +17j = 2026-08-12 (aujourd'hui, 0j restant)
  const alert = getHeatAlert(animal, chaleurs, today);
  assert(alert !== null, "alerte présente");
  assert(alert.joursRestants <= HEAT_ALERT_WINDOW_DAYS, "dans la fenêtre");
});

console.log("\n── selectDueNotifications : sélection J-3 exacte ─────────────────────────────\n");

test("Saillie ovine → contrôle du retour en chaleur 17 jours après, notifié à J-3", () => {
  const today = new Date("2026-08-12T10:00:00");
  const animal = makeAnimal({ id: "a-saillie", type: "ovin", dateSaillie: "2026-07-29" });
  const notifications = selectDueNotifications([animal], {}, today);
  const found = notifications.find((n) => n.type === "controle_retour_chaleur");
  assert(found !== undefined, "notification de contrôle après saillie trouvée");
  assertEqual(found.dateEvenement, "2026-08-15");
  assertEqual(found.dedupKey, "controle-retour-chaleur-a-saillie-2026-08-15");
});

test("Saillie caprine → contrôle calculé sur le cycle de 21 jours", () => {
  const today = new Date("2026-08-12T10:00:00");
  const animal = makeAnimal({ id: "a-caprine", type: "caprin", dateSaillie: "2026-07-25" });
  const notifications = selectDueNotifications([animal], {}, today);
  const found = notifications.find((n) => n.type === "controle_retour_chaleur");
  assert(found !== undefined, "notification caprine trouvée");
  assertEqual(found.dateEvenement, "2026-08-15");
});

test("Contrôle après saillie à J-2, animal mâle ou inactif → aucune notification", () => {
  const today = new Date("2026-08-12T10:00:00");
  const j2 = makeAnimal({ id: "a-j2-saillie", type: "ovin", dateSaillie: "2026-07-28" });
  const male = makeAnimal({ id: "a-male-saillie", sexe: "M", dateSaillie: "2026-07-29" });
  const inactive = makeAnimal({ id: "a-inactive-saillie", statut: "vendu", dateSaillie: "2026-07-29" });
  const notifications = selectDueNotifications([j2, male, inactive], {}, today);
  assertEqual(notifications.filter((n) => n.type === "controle_retour_chaleur").length, 0);
});

test("Chaleur estimée exactement dans 3 jours → notification sélectionnée", () => {
  const today = new Date("2026-08-12T10:00:00");
  // Ovin, cycle 17j. Chaleur observée il y a 14j → prochaine dans 3j (2026-08-15).
  const animal = makeAnimal({ id: "a-chaleur", type: "ovin" });
  const chaleurs = [{ date: "2026-07-29" }]; // +17j = 2026-08-15 → 3j à partir du 12/08
  const notifications = selectDueNotifications([animal], { "a-chaleur": chaleurs }, today);
  const found = notifications.find((n) => n.type === "chaleur" && n.animalId === "a-chaleur");
  assert(found !== undefined, "notification chaleur J-3 trouvée");
  assertEqual(found.dateEvenement, "2026-08-15");
});

test("Chaleur dans 2 jours (J-2) → aucune notification", () => {
  const today = new Date("2026-08-12T10:00:00");
  const animal = makeAnimal({ id: "a-j2", type: "ovin" });
  const chaleurs = [{ date: "2026-07-28" }]; // +17j = 2026-08-14 → J-2
  const notifications = selectDueNotifications([animal], { "a-j2": chaleurs }, today);
  assertEqual(notifications.filter((n) => n.animalId === "a-j2").length, 0, "J-2 ne déclenche rien");
});

test("Chaleur dans 4 jours (J-4) → aucune notification", () => {
  const today = new Date("2026-08-12T10:00:00");
  const animal = makeAnimal({ id: "a-j4", type: "ovin" });
  const chaleurs = [{ date: "2026-07-30" }]; // +17j = 2026-08-16 → J-4
  const notifications = selectDueNotifications([animal], { "a-j4": chaleurs }, today);
  assertEqual(notifications.filter((n) => n.animalId === "a-j4").length, 0, "J-4 ne déclenche rien");
});

test("Mise bas estimée exactement dans 3 jours → notification sélectionnée", () => {
  const today = new Date("2026-08-12T10:00:00");
  const animal = makeAnimal({
    id: "a-misebas",
    dureeGestationJours: 30,
    dateSaillie: localDateString(new Date(today.getTime() - 27 * 86400000)), // terme dans 3j
  });
  const notifications = selectDueNotifications([animal], {}, today);
  const found = notifications.find((n) => n.type === "mise_bas" && n.animalId === "a-misebas");
  assert(found !== undefined, "notification mise bas J-3 trouvée");
});

test("Mise bas dans 2 jours (J-2) et 4 jours (J-4) → aucune notification", () => {
  const today = new Date("2026-08-12T10:00:00");
  const animalJ2 = makeAnimal({
    id: "a-mb-j2",
    dureeGestationJours: 30,
    dateSaillie: localDateString(new Date(today.getTime() - 28 * 86400000)),
  });
  const animalJ4 = makeAnimal({
    id: "a-mb-j4",
    dureeGestationJours: 30,
    dateSaillie: localDateString(new Date(today.getTime() - 26 * 86400000)),
  });
  const notifications = selectDueNotifications([animalJ2, animalJ4], {}, today);
  assertEqual(notifications.filter((n) => n.animalId === "a-mb-j2").length, 0, "J-2 mise bas");
  assertEqual(notifications.filter((n) => n.animalId === "a-mb-j4").length, 0, "J-4 mise bas");
});

test("Mâle avec suivi de gestation incohérent → jamais de notification mise bas (garde sexe=F)", () => {
  const today = new Date("2026-08-12T10:00:00");
  const animal = makeAnimal({
    id: "a-male",
    sexe: "M",
    dureeGestationJours: 30,
    dateSaillie: localDateString(new Date(today.getTime() - 27 * 86400000)),
  });
  const notifications = selectDueNotifications([animal], {}, today);
  assertEqual(notifications.filter((n) => n.animalId === "a-male").length, 0);
});

test("Animal non actif → aucune notification (chaleur ou mise bas)", () => {
  const today = new Date("2026-08-12T10:00:00");
  const animal = makeAnimal({
    id: "a-inactif",
    statut: "vendu",
    dureeGestationJours: 30,
    dateSaillie: localDateString(new Date(today.getTime() - 27 * 86400000)),
  });
  const chaleurs = [{ date: "2026-07-29" }];
  const notifications = selectDueNotifications([animal], { "a-inactif": chaleurs }, today);
  assertEqual(notifications.filter((n) => n.animalId === "a-inactif").length, 0);
});

console.log("\n── dedupKey : stabilité ───────────────────────────────────────────────────────\n");

test("dedupKey identique pour la même échéance recalculée deux fois", () => {
  const today = new Date("2026-08-12T10:00:00");
  const animal = makeAnimal({ id: "a-stable", type: "ovin" });
  const chaleurs = [{ date: "2026-07-29" }];
  const n1 = selectDueNotifications([animal], { "a-stable": chaleurs }, today);
  const n2 = selectDueNotifications([animal], { "a-stable": chaleurs }, new Date(today));
  assertEqual(n1[0].dedupKey, n2[0].dedupKey, "dedupKey stable entre deux calculs");
});

test("dedupKey suit le format type-animalId-dateEvenement", () => {
  const today = new Date("2026-08-12T10:00:00");
  const animal = makeAnimal({ id: "a-format", type: "ovin" });
  const chaleurs = [{ date: "2026-07-29" }];
  const notifications = selectDueNotifications([animal], { "a-format": chaleurs }, today);
  assertEqual(notifications[0].dedupKey, `chaleur-a-format-${notifications[0].dateEvenement}`);
});

test("dedupKey différent pour deux animaux distincts à la même date", () => {
  const today = new Date("2026-08-12T10:00:00");
  const a1 = makeAnimal({ id: "a-x", type: "ovin" });
  const a2 = makeAnimal({ id: "a-y", type: "ovin" });
  const chaleurs = [{ date: "2026-07-29" }];
  const notifications = selectDueNotifications([a1, a2], { "a-x": chaleurs, "a-y": chaleurs }, today);
  const keys = notifications.map((n) => n.dedupKey);
  assertEqual(new Set(keys).size, keys.length, "dedupKeys uniques par animal");
});

// ─── Résumé ─────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(60)}`);
console.log(`Résultats : ${passed} passés, ${failed} échoués`);
if (failed > 0) {
  console.error("❌ Certains tests ont échoué !");
  process.exit(1);
} else {
  console.log("✅ Tous les tests passent.");
}
