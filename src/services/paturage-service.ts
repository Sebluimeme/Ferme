import firebaseService from "@/lib/firebase-service";
import type { SejourPaturage } from "@/types/paturage";

const PATH = "sejours-paturage";

export async function createSejour(
  data: Omit<SejourPaturage, "id" | "dateCreation" | "derniereMAJ">
) {
  const payload: Record<string, unknown> = { ...data };
  return firebaseService.create<Record<string, unknown>>(PATH, payload);
}

export async function updateSejour(
  id: string,
  data: Partial<Omit<SejourPaturage, "id" | "dateCreation" | "derniereMAJ">>
) {
  return firebaseService.update(PATH, id, data as Record<string, unknown>);
}

export async function deleteSejour(id: string) {
  return firebaseService.delete(PATH, id);
}

/** Clore un séjour en cours : renseigne la date de sortie */
export async function cloreSejour(id: string, dateSortie: string) {
  return firebaseService.update(PATH, id, { dateSortie });
}
