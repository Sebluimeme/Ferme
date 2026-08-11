import firebaseService from "@/lib/firebase-service";
import type { Partiel, ActiviteFourrage } from "@/types/fourrage";

const PATH_PARTIELS = "partiels";
const PATH_ACTIVITES = "activites-fourrage";

// ==================== Partiels ====================

export async function createPartiel(data: Omit<Partiel, "id" | "dateCreation" | "derniereMAJ">) {
  const payload: Record<string, unknown> = { ...data };
  return firebaseService.create<Record<string, unknown>>(PATH_PARTIELS, payload);
}

export async function updatePartiel(id: string, data: Partial<Omit<Partiel, "id" | "dateCreation" | "derniereMAJ">>) {
  const updates: Record<string, unknown> = { ...data };
  return firebaseService.update(PATH_PARTIELS, id, updates);
}

export async function deletePartiel(id: string) {
  return firebaseService.delete(PATH_PARTIELS, id);
}

export async function getPartiel(id: string) {
  return firebaseService.getById<Partiel>(PATH_PARTIELS, id);
}

// ==================== Activités Fourrage ====================

export async function createActivite(data: Omit<ActiviteFourrage, "id" | "dateCreation" | "derniereMAJ">) {
  const payload: Record<string, unknown> = {
    ...data,
    origine: data.origine ?? "recolte",
    statut: data.statut ?? "en_cours",
  };
  return firebaseService.create<Record<string, unknown>>(PATH_ACTIVITES, payload);
}

/** `null` sur un champ le supprime côté Firebase (utile en passant récolte → achat). */
export type ActiviteUpdate = {
  [K in keyof Omit<ActiviteFourrage, "id" | "dateCreation" | "derniereMAJ">]?:
    ActiviteFourrage[K] | null;
};

export async function updateActivite(id: string, data: ActiviteUpdate) {
  const updates: Record<string, unknown> = { ...data };
  return firebaseService.update(PATH_ACTIVITES, id, updates);
}

export async function deleteActivite(id: string) {
  return firebaseService.delete(PATH_ACTIVITES, id);
}

export async function addBottesActivite(id: string, nombreBottes: number, poidsBotteKg?: number) {
  const updates: Record<string, unknown> = {
    nombreBottes,
    statut: "terminee",
  };
  if (poidsBotteKg !== undefined) {
    updates.poidsBotteKg = poidsBotteKg;
    updates.poidsTonne = (nombreBottes * poidsBotteKg) / 1000;
  }
  return firebaseService.update(PATH_ACTIVITES, id, updates);
}
