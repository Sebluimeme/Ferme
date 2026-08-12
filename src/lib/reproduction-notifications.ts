import type { Animal } from "@/store/store";
import { localDateString } from "./irrigationScheduler";
import { getGestationAlert, getHeatAlert, type ChaleurObservation } from "./reproduction";

/** Nombre de jours avant l'échéance déclenchant l'alerte e-mail. */
export const NOTIFY_DUE_DAYS = 3;

export type ReproNotificationType = "chaleur" | "mise_bas";

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

/**
 * Sélectionne les échéances de reproduction (chaleur ou mise bas) tombant exactement
 * dans NOTIFY_DUE_DAYS jours, tous animaux confondus — pour l'alerte e-mail J-3.
 */
export function selectDueNotifications(
  animaux: Animal[],
  chaleursByAnimal: Record<string, ChaleurObservation[]>,
  today: Date = new Date()
): ReproNotification[] {
  const notifications: ReproNotification[] = [];

  for (const animal of animaux) {
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
