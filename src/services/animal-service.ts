import firebaseService from "@/lib/firebase-service";
import { calculateAge } from "@/lib/utils";
import type { Animal } from "@/store/store";

const PATH = "animaux";

export interface AnimalFormData {
  type: string;
  numeroBoucle?: string;
  nom?: string;
  sexe: string;
  race?: string;
  dateNaissance?: string;
  statut?: string;
  commentaire?: string;
  numeroBouclePere?: string;
  numeroBoucleMere?: string;
}

export function validateAnimalData(data: AnimalFormData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const hasNom = data.nom && data.nom.trim() !== "";
  const hasNumeroBoucle = data.numeroBoucle && data.numeroBoucle.trim() !== "";
  if (!hasNom && !hasNumeroBoucle) errors.push("Un nom ou un numéro de boucle est requis (au moins un des deux)");
  if (!data.type) errors.push("Le type d'animal est obligatoire");
  if (!["ovin", "bovin", "caprin", "porcin"].includes(data.type)) errors.push("Type d'animal invalide");
  if (!data.sexe || !["M", "F"].includes(data.sexe)) errors.push("Le sexe est obligatoire (M ou F)");
  if (data.dateNaissance) {
    const date = new Date(data.dateNaissance);
    if (isNaN(date.getTime())) errors.push("Date de naissance invalide");
    if (date > new Date()) errors.push("La date de naissance ne peut pas être dans le futur");
  }
  return { valid: errors.length === 0, errors };
}

export async function createAnimal(data: AnimalFormData) {
  const validation = validateAnimalData(data);
  if (!validation.valid) return { success: false, error: validation.errors.join(", ") };

  if (data.numeroBoucle && data.numeroBoucle.trim() !== "") {
    const existing = await firebaseService.getWhere<Animal>(PATH, "numeroBoucle", data.numeroBoucle);
    if (existing.success && existing.data && existing.data.length > 0) {
      return { success: false, error: "Ce numéro de boucle existe déjà" };
    }
  }

  const animalData: Record<string, unknown> = { ...data };
  if (data.dateNaissance) animalData.ageMois = calculateAge(data.dateNaissance);
  if (!data.statut) animalData.statut = "actif";

  return firebaseService.create(PATH, animalData);
}

export async function updateAnimal(id: string, data: AnimalFormData) {
  const updates: Record<string, unknown> = { ...data };
  if (data.dateNaissance) updates.ageMois = calculateAge(data.dateNaissance);
  return firebaseService.update(PATH, id, updates);
}

export async function deleteAnimal(id: string) {
  return firebaseService.delete(PATH, id);
}

export async function getAnimal(id: string) {
  return firebaseService.getById<Animal>(PATH, id);
}

export function searchAnimaux(animaux: Animal[], query: string): Animal[] {
  const lower = query.toLowerCase();
  return animaux.filter(
    (a) =>
      a.numeroBoucle?.toLowerCase().includes(lower) ||
      a.nom?.toLowerCase().includes(lower) ||
      a.race?.toLowerCase().includes(lower)
  );
}

export function getAnimalStats(animaux: Animal[]) {
  return {
    total: animaux.length,
    actifs: animaux.filter((a) => a.statut === "actif").length,
    parType: {
      ovins: animaux.filter((a) => a.type === "ovin" && a.statut === "actif").length,
      bovins: animaux.filter((a) => a.type === "bovin" && a.statut === "actif").length,
      caprins: animaux.filter((a) => a.type === "caprin" && a.statut === "actif").length,
      porcins: animaux.filter((a) => a.type === "porcin" && a.statut === "actif").length,
    },
  };
}
