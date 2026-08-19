import firebaseService from "@/lib/firebase-service";
import type { Partiel, ActiviteFourrage, DistributionFourrage, CheptelDistribution, UniteDistribution } from "@/types/fourrage";
import { distributionDuJour } from "@/lib/fourrage-calculs";

const PATH_PARTIELS = "partiels";
const PATH_ACTIVITES = "activites-fourrage";
const PATH_DISTRIBUTIONS = "distributions-fourrage";

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

// ==================== Distribution quotidienne (fourrage donné aux animaux) ====================

export async function createDistribution(
  data: Omit<DistributionFourrage, "id" | "dateCreation" | "derniereMAJ">
) {
  const payload: Record<string, unknown> = { ...data };
  return firebaseService.create<Record<string, unknown>>(PATH_DISTRIBUTIONS, payload);
}

export async function updateDistribution(
  id: string,
  data: Partial<Omit<DistributionFourrage, "id" | "dateCreation" | "derniereMAJ">>
) {
  const updates: Record<string, unknown> = { ...data };
  return firebaseService.update(PATH_DISTRIBUTIONS, id, updates);
}

export async function deleteDistribution(id: string) {
  return firebaseService.delete(PATH_DISTRIBUTIONS, id);
}

/**
 * Raccourci « +1 balle/botte » : incrémente l'entrée du jour pour ce cheptel
 * si elle existe déjà (l'unité de l'entrée existante prime), sinon la crée
 * avec `uniteSiNouvelle` (unité actuellement sélectionnée dans l'UI, qui
 * retombe elle-même sur la dernière unité utilisée pour ce cheptel).
 */
export async function incrementerDistributionJour(
  cheptel: CheptelDistribution,
  uniteSiNouvelle: UniteDistribution,
  distributionsExistantes: DistributionFourrage[],
  date: string = new Date().toISOString().split("T")[0]
) {
  const existante = distributionDuJour(distributionsExistantes, cheptel, date);
  if (existante) {
    return firebaseService.update(PATH_DISTRIBUTIONS, existante.id, {
      quantite: existante.quantite + 1,
    });
  }
  return createDistribution({
    dateDistribution: date,
    cheptel,
    unite: uniteSiNouvelle,
    quantite: 1,
  });
}

/**
 * Fixe la quantité du jour pour un cheptel (saisie manuelle) — crée l'entrée
 * si elle n'existe pas encore, sinon met à jour quantité et/ou unité.
 */
export async function definirDistributionJour(
  cheptel: CheptelDistribution,
  quantite: number,
  unite: UniteDistribution,
  distributionsExistantes: DistributionFourrage[],
  date: string = new Date().toISOString().split("T")[0]
) {
  const existante = distributionDuJour(distributionsExistantes, cheptel, date);
  if (existante) {
    return firebaseService.update(PATH_DISTRIBUTIONS, existante.id, { quantite, unite });
  }
  return createDistribution({ dateDistribution: date, cheptel, unite, quantite });
}
