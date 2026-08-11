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
export function getGestationAlert(animal: Animal): GestationAlert | null {
  if (!animal.dateSaillie) return null;
  if (animal.sexe !== "F") return null;
  if (animal.statut !== "actif") return null;

  const gestationDays = getGestationDurationDays(animal);
  const dateEstimee = calculateEstimatedBirthDate(animal.dateSaillie, gestationDays);
  if (!dateEstimee) return null;

  const today = new Date();
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
