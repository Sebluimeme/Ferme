import firebaseService from "@/lib/firebase-service";
import { uploadFile, deleteFile, compressImage } from "@/lib/firebase-storage";
import { calculateAge } from "@/lib/utils";
import { GESTATION_DAYS_MIN, GESTATION_DAYS_MAX } from "@/lib/reproduction";
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
  dateSaillie?: string;
  dureeGestationJours?: string | number;
  poidsSortieKg?: string | number;
  poidsCarcasseKg?: string | number;
}

type NormalizedAnimalData = Omit<AnimalFormData, "poidsSortieKg" | "poidsCarcasseKg" | "dureeGestationJours" | "dateSaillie"> & {
  poidsSortieKg?: number | null;
  poidsCarcasseKg?: number | null;
  dureeGestationJours?: number | null;
  dateSaillie?: string | null;
};

function parseOptionalWeight(value: string | number | undefined): number | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  const normalized = typeof value === "string" ? value.replace(",", ".").trim() : value;
  if (normalized === "") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalGestationDays(value: string | number | undefined): number | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  const normalized = typeof value === "string" ? value.trim() : value;
  if (normalized === "") return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.round(parsed);
}

function normalizeAnimalData(data: AnimalFormData): NormalizedAnimalData {
  const statut = data.statut || "actif";
  const normalized: NormalizedAnimalData = {
    type: data.type,
    sexe: data.sexe,
    numeroBoucle: data.numeroBoucle?.trim() || undefined,
    nom: data.nom?.trim() || undefined,
    race: data.race?.trim() || undefined,
    dateNaissance: data.dateNaissance || undefined,
    statut,
    commentaire: data.commentaire?.trim() || undefined,
    numeroBouclePere: data.numeroBouclePere || undefined,
    numeroBoucleMere: data.numeroBoucleMere || undefined,
    // `null` est volontaire : Firebase doit réellement effacer une ancienne
    // saillie quand le champ est vidé dans le formulaire de modification.
    dateSaillie: data.sexe === "F" ? data.dateSaillie || null : null,
  };

  normalized.poidsSortieKg = statut === "vendu" ? parseOptionalWeight(data.poidsSortieKg) ?? null : null;
  normalized.poidsCarcasseKg = statut === "vendu" ? parseOptionalWeight(data.poidsCarcasseKg) ?? null : null;
  normalized.dureeGestationJours = data.sexe === "F" ? parseOptionalGestationDays(data.dureeGestationJours) ?? null : null;
  return normalized;
}

export function validateAnimalData(data: AnimalFormData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const hasNom = data.nom && data.nom.trim() !== "";
  const hasNumeroBoucle = data.numeroBoucle && data.numeroBoucle.trim() !== "";
  if (!hasNom && !hasNumeroBoucle) errors.push("Un nom ou un numéro de boucle est requis (au moins un des deux)");
  if (!data.type) errors.push("Le type d'animal est obligatoire");
  if (!["ovin", "bovin", "caprin", "porcin", "equin"].includes(data.type)) errors.push("Type d'animal invalide");
  if (!data.sexe || !["M", "F"].includes(data.sexe)) errors.push("Le sexe est obligatoire (M ou F)");
  if (data.dateNaissance) {
    const date = new Date(data.dateNaissance);
    if (isNaN(date.getTime())) errors.push("Date de naissance invalide");
    if (date > new Date()) errors.push("La date de naissance ne peut pas être dans le futur");
  }
  if (data.dateSaillie) {
    const date = new Date(data.dateSaillie);
    if (isNaN(date.getTime())) errors.push("Date d'insémination / saillie invalide");
    else if (date > new Date()) errors.push("La date d'insémination / saillie ne peut pas être dans le futur");
  }
  const dureeGestation = parseOptionalGestationDays(data.dureeGestationJours);
  if (dureeGestation === undefined) errors.push("La durée de gestation doit être un nombre valide");
  if (typeof dureeGestation === "number" && (dureeGestation < GESTATION_DAYS_MIN || dureeGestation > GESTATION_DAYS_MAX)) {
    errors.push(`La durée de gestation doit être comprise entre ${GESTATION_DAYS_MIN} et ${GESTATION_DAYS_MAX} jours`);
  }
  const poidsSortie = parseOptionalWeight(data.poidsSortieKg);
  const poidsCarcasse = parseOptionalWeight(data.poidsCarcasseKg);
  if (poidsSortie === undefined) errors.push("Le poids de sortie doit être un nombre valide");
  if (poidsCarcasse === undefined) errors.push("Le poids carcasse doit être un nombre valide");
  if (typeof poidsSortie === "number" && poidsSortie < 0) errors.push("Le poids de sortie ne peut pas être négatif");
  if (typeof poidsCarcasse === "number" && poidsCarcasse < 0) errors.push("Le poids carcasse ne peut pas être négatif");
  return { valid: errors.length === 0, errors };
}

export async function createAnimal(data: AnimalFormData) {
  const validation = validateAnimalData(data);
  if (!validation.valid) return { success: false, error: validation.errors.join(", ") };

  const normalized = normalizeAnimalData(data);
  if (normalized.numeroBoucle && normalized.numeroBoucle.trim() !== "") {
    const existing = await firebaseService.getWhere<Animal>(PATH, "numeroBoucle", normalized.numeroBoucle);
    if (existing.success && existing.data && existing.data.length > 0) {
      return { success: false, error: "Ce numéro de boucle existe déjà" };
    }
  }

  const animalData: Record<string, unknown> = { ...normalized };
  if (normalized.dateNaissance) animalData.ageMois = calculateAge(normalized.dateNaissance);
  if (!normalized.statut) animalData.statut = "actif";

  return firebaseService.create(PATH, animalData);
}

export async function updateAnimal(id: string, data: AnimalFormData) {
  const validation = validateAnimalData(data);
  if (!validation.valid) return { success: false, error: validation.errors.join(", ") };

  const normalized = normalizeAnimalData(data);
  if (normalized.numeroBoucle && normalized.numeroBoucle.trim() !== "") {
    const existing = await firebaseService.getWhere<Animal>(PATH, "numeroBoucle", normalized.numeroBoucle);
    const duplicate = existing.data?.find((animal) => animal.id !== id);
    if (existing.success && duplicate) {
      return { success: false, error: "Ce numéro de boucle existe déjà sur un autre animal" };
    }
  }

  const updates: Record<string, unknown> = { ...normalized };
  if (normalized.dateNaissance) {
    updates.ageMois = calculateAge(normalized.dateNaissance);
  } else {
    updates.ageMois = null;
  }
  return firebaseService.update(PATH, id, updates);
}

export async function deleteAnimal(id: string) {
  return firebaseService.delete(PATH, id);
}

/**
 * Efface le suivi de gestation d'un animal (à utiliser une fois la mise bas constatée).
 */
export async function clearGestationSuivi(animalId: string) {
  const animalResult = await firebaseService.getById<Animal>(PATH, animalId);
  if (!animalResult.success || !animalResult.data) {
    return { success: false, error: animalResult.error || "Animal introuvable" };
  }
  const animal = animalResult.data;
  if (!animal.dateSaillie) {
    return { success: false, error: "Aucune saillie active à clôturer" };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const miseBasDate = nowIso.slice(0, 10);
  const historyPath = `animaux-historique/${animalId}`;
  const eventKey = `${animal.dateSaillie}-${miseBasDate}`.replace(/[^0-9-]/g, "");
  const saillieId = `${eventKey}-saillie`;
  const miseBasId = `${eventKey}-mise-bas`;

  return firebaseService.updatePaths({
    [`${historyPath}/${saillieId}`]: {
      id: saillieId,
      animalId,
      date: animal.dateSaillie,
      sujet: "Saillie / insémination",
      description: "Saillie archivée lors de la mise bas constatée.",
      categorie: "reproduction",
      dateCreation: nowIso,
      derniereMAJ: nowIso,
    },
    [`${historyPath}/${miseBasId}`]: {
      id: miseBasId,
      animalId,
      date: miseBasDate,
      sujet: "Mise bas constatée",
      categorie: "reproduction",
      dateCreation: nowIso,
      derniereMAJ: nowIso,
    },
    [`${PATH}/${animalId}/dateSaillie`]: null,
    [`${PATH}/${animalId}/dureeGestationJours`]: null,
    [`${PATH}/${animalId}/derniereMAJ`]: nowIso,
  });
}

/**
 * Enregistre ou modifie la saillie/insémination d'un animal depuis l'onglet Repro.
 */
export async function updateGestationSuivi(
  animalId: string,
  data: { dateSaillie: string; dureeGestationJours?: string | number }
) {
  const date = new Date(data.dateSaillie);
  if (!data.dateSaillie || isNaN(date.getTime())) {
    return { success: false, error: "Date d'insémination / saillie invalide" };
  }
  if (date > new Date()) {
    return { success: false, error: "La date d'insémination / saillie ne peut pas être dans le futur" };
  }

  const updates: Record<string, unknown> = { dateSaillie: data.dateSaillie };
  const dureeGestation = parseOptionalGestationDays(data.dureeGestationJours);
  if (dureeGestation === undefined) {
    return { success: false, error: "La durée de gestation doit être un nombre valide" };
  }
  if (dureeGestation !== null && (dureeGestation < GESTATION_DAYS_MIN || dureeGestation > GESTATION_DAYS_MAX)) {
    return { success: false, error: `La durée de gestation doit être comprise entre ${GESTATION_DAYS_MIN} et ${GESTATION_DAYS_MAX} jours` };
  }
  updates.dureeGestationJours = dureeGestation;

  return firebaseService.update(PATH, animalId, updates);
}

/**
 * Upload ou remplace la photo principale d'un animal.
 * Compresse l'image côté client avant envoi (max 800px, JPEG 78%).
 */
export async function uploadAnimalPhoto(
  animalId: string,
  file: File,
  oldStoragePath?: string
) {
  // Supprime l'ancienne photo si elle existe
  if (oldStoragePath) await deleteFile(oldStoragePath);

  // Compression canvas
  const compressed = await compressImage(file, 800, 0.78);

  const path = `animaux/${animalId}/photo_principale/${Date.now()}_${compressed.name}`;
  const result = await uploadFile(path, compressed);
  if (!result.success) return result;

  return firebaseService.update(PATH, animalId, {
    photoUrl: result.url,
    photoStoragePath: result.storagePath,
  });
}

/**
 * Supprime la photo principale d'un animal et efface les champs en base.
 */
export async function deleteAnimalPhoto(animalId: string, storagePath: string) {
  await deleteFile(storagePath);
  return firebaseService.update(PATH, animalId, {
    photoUrl: null,
    photoStoragePath: null,
  });
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
    morts: animaux.filter((a) => a.statut === "mort").length,
    parType: {
      ovins: animaux.filter((a) => a.type === "ovin" && a.statut === "actif").length,
      bovins: animaux.filter((a) => a.type === "bovin" && a.statut === "actif").length,
      caprins: animaux.filter((a) => a.type === "caprin" && a.statut === "actif").length,
      porcins: animaux.filter((a) => a.type === "porcin" && a.statut === "actif").length,
      equins: animaux.filter((a) => a.type === "equin" && a.statut === "actif").length,
    },
  };
}
