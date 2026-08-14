import type { Animal } from "@/store/store";

/**
 * Durées de gestation par défaut (en jours), par espèce.
 * Valeurs moyennes usuelles en élevage — modifiables par animal via `dureeGestationJours`.
 */
export const GESTATION_DAYS_DEFAULT: Record<Animal["type"], number> = {
  ovin: 152,   // ~5 mois (brebis)
  caprin: 150, // ~5 mois (chèvre)
  porcin: 114, // règle des « 3-3-3 » (truie)
  bovin: 283,  // ~9,5 mois (vache)
  equin: 340,  // ~11,5 mois (jument)
};

export const GESTATION_DAYS_MIN = 30;
export const GESTATION_DAYS_MAX = 400;

/** Fenêtre d'affichage de l'alerte avant le terme estimé (en jours). */
export const GESTATION_ALERT_WINDOW_DAYS = 15;
/** Délai de tolérance après le terme avant de masquer l'alerte (mise bas non renseignée). */
export const GESTATION_OVERDUE_GRACE_DAYS = 10;

export function getGestationDurationDays(animal: Pick<Animal, "type" | "dureeGestationJours">): number {
  if (animal.dureeGestationJours && animal.dureeGestationJours > 0) return animal.dureeGestationJours;
  return GESTATION_DAYS_DEFAULT[animal.type] || 150;
}

export function calculateEstimatedBirthDate(dateSaillie: string, gestationDays: number): Date | null {
  const start = new Date(dateSaillie);
  if (isNaN(start.getTime())) return null;
  const result = new Date(start);
  result.setDate(result.getDate() + gestationDays);
  return result;
}

export interface GestationAlert {
  dateEstimee: Date;
  joursRestants: number; // négatif = dépassé le terme
  enRetard: boolean;
}

/**
 * Retourne l'alerte de mise bas active pour un animal, ou null si aucune n'est pertinente
 * (pas de suivi renseigné, mâle, animal inactif, ou hors fenêtre d'affichage).
 */
export function getGestationAlert(animal: Animal, todayInput: Date = new Date()): GestationAlert | null {
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

export function formatGestationDate(date: Date): string {
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatGestationMessage(alert: GestationAlert): string {
  const dateStr = formatGestationDate(alert.dateEstimee);
  if (alert.enRetard) {
    const jours = Math.abs(alert.joursRestants);
    return `Naissance prévue le ${dateStr} — en retard de ${jours} j`;
  }
  if (alert.joursRestants === 0) return `Naissance prévue aujourd'hui (${dateStr})`;
  if (alert.joursRestants === 1) return `Naissance prévue demain (${dateStr})`;
  return `Naissance prévue le ${dateStr} — dans ${alert.joursRestants} j`;
}

// ============ Chaleurs (cycle œstral) ============

/** Durées de cycle par défaut (en jours), par espèce — utilisées pour projeter la prochaine chaleur. */
export const CYCLE_DAYS_DEFAULT: Record<Animal["type"], number> = {
  ovin: 17,
  caprin: 21,
  bovin: 21,
  porcin: 21,
  equin: 21,
};

/**
 * Première date théorique de retour en chaleur après une saillie.
 * Elle sert à vérifier une éventuelle non-gestation : date de saillie + un cycle de l'espèce.
 */
export function calculatePostServiceHeatDate(
  animal: Pick<Animal, "type" | "dateSaillie">
): Date | null {
  if (!animal.dateSaillie) return null;
  const serviceDate = new Date(animal.dateSaillie);
  if (isNaN(serviceDate.getTime())) return null;

  const result = new Date(serviceDate);
  result.setDate(result.getDate() + (CYCLE_DAYS_DEFAULT[animal.type] || 21));
  return result;
}

/** Fenêtre d'affichage de l'alerte de chaleur avant la date estimée (en jours). */
export const HEAT_ALERT_WINDOW_DAYS = 7;

export interface ChaleurObservation {
  date: string;
}

function midnight(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Indique si une femelle est actuellement en gestation à la date `today` (terme estimé pas encore atteint).
 */
function isEnGestation(animal: Pick<Animal, "type" | "dateSaillie" | "dureeGestationJours">, today: Date): boolean {
  if (!animal.dateSaillie) return false;
  const gestationDays = getGestationDurationDays(animal);
  const birthDate = calculateEstimatedBirthDate(animal.dateSaillie, gestationDays);
  if (!birthDate) return false;
  return midnight(birthDate).getTime() >= midnight(today).getTime();
}

/**
 * Projette la prochaine date de chaleur à partir de l'observation la plus récente, en ajoutant
 * des cycles entiers jusqu'à obtenir une date >= aujourd'hui. Retourne null si aucune observation.
 */
export function getNextHeatDate(
  animal: Pick<Animal, "type">,
  chaleurs: ChaleurObservation[],
  today: Date = new Date()
): Date | null {
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

export interface HeatAlert {
  dateEstimee: Date;
  joursRestants: number;
}

/**
 * Retourne l'alerte de chaleur active pour un animal, ou null si aucune n'est pertinente
 * (mâle, animal inactif, aucune chaleur observée, hors fenêtre d'affichage, ou femelle gestante).
 */
export function getHeatAlert(
  animal: Animal,
  chaleurs: ChaleurObservation[],
  today: Date = new Date()
): HeatAlert | null {
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

export function formatHeatMessage(alert: HeatAlert): string {
  const dateStr = formatGestationDate(alert.dateEstimee);
  if (alert.joursRestants === 0) return `Chaleur prévue aujourd'hui (${dateStr})`;
  if (alert.joursRestants === 1) return `Chaleur prévue demain (${dateStr})`;
  return `Chaleur prévue le ${dateStr} — dans ${alert.joursRestants} j`;
}
