import type { Animal } from "@/store/store";
import { localDateString } from "./irrigationScheduler";
import {
  calculatePostServiceHeatDate,
  getGestationAlert,
  getHeatAlert,
  type ChaleurObservation,
} from "./reproduction";

/** Nombre de jours avant l'échéance déclenchant l'alerte e-mail. */
export const NOTIFY_DUE_DAYS = 3;

export type ReproNotificationType = "chaleur" | "controle_retour_chaleur" | "mise_bas";

export interface ReproNotification {
  type: ReproNotificationType;
  animalId: string;
  animalLabel: string;
  dateEvenement: string; // YYYY-MM-DD
  dedupKey: string;
}

function animalLabel(animal: Pick<Animal, "nom" | "numeroBoucle">): string {
  return animal.nom || animal.numeroBoucle || "Animal";
}

function daysUntil(date: Date, today: Date): number {
  const todayMidnight = new Date(today);
  todayMidnight.setHours(0, 0, 0, 0);
  const targetMidnight = new Date(date);
  targetMidnight.setHours(0, 0, 0, 0);
  return Math.round((targetMidnight.getTime() - todayMidnight.getTime()) / 86400000);
}

/**
 * Sélectionne les échéances de reproduction tombant exactement dans
 * NOTIFY_DUE_DAYS jours — contrôle après saillie, chaleur ou mise bas.
 */
export function selectDueNotifications(
  animaux: Animal[],
  chaleursByAnimal: Record<string, ChaleurObservation[]>,
  today: Date = new Date()
): ReproNotification[] {
  const notifications: ReproNotification[] = [];

  for (const animal of animaux) {
    if (animal.sexe === "F" && animal.statut === "actif" && animal.dateSaillie) {
      const postServiceHeatDate = calculatePostServiceHeatDate(animal);
      if (postServiceHeatDate && daysUntil(postServiceHeatDate, today) === NOTIFY_DUE_DAYS) {
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
