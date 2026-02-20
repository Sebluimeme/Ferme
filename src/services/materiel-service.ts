import firebaseService from "@/lib/firebase-service";
import type { Materiel, Composant } from "@/store/store";

const PATH = "materiels";

export interface MaterielFormData {
  nom: string;
  type: string;
  marque?: string;
  modele?: string;
  annee?: string | number;
  immatriculation?: string;
  statut?: string;
  commentaire?: string;
}

export function validateMaterielData(data: MaterielFormData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data.nom || data.nom.trim() === "") errors.push("Le nom est obligatoire");
  if (!data.type) errors.push("Le type est obligatoire");
  if (!["vehicule", "outil", "machine", "autre"].includes(data.type)) errors.push("Type invalide");
  if (data.annee && (isNaN(Number(data.annee)) || Number(data.annee) < 1900)) errors.push("Année invalide");
  return { valid: errors.length === 0, errors };
}

export async function createMateriel(data: MaterielFormData) {
  const validation = validateMaterielData(data);
  if (!validation.valid) return { success: false, error: validation.errors.join(", ") };

  const materielData: Record<string, unknown> = { ...data, composants: [] };
  if (data.annee) materielData.annee = Number(data.annee);
  if (!data.statut) materielData.statut = "actif";

  return firebaseService.create(PATH, materielData);
}

export async function updateMateriel(id: string, data: Partial<MaterielFormData>) {
  const updates: Record<string, unknown> = { ...data };
  if (data.annee) updates.annee = Number(data.annee);
  return firebaseService.update(PATH, id, updates);
}

export async function deleteMateriel(id: string) {
  return firebaseService.delete(PATH, id);
}

export async function getMateriel(id: string) {
  return firebaseService.getById<Materiel>(PATH, id);
}

export async function updateComposants(materielId: string, composants: Composant[]) {
  return firebaseService.update(PATH, materielId, { composants });
}

export function searchMateriels(materiels: Materiel[], query: string): Materiel[] {
  const lower = query.toLowerCase();
  return materiels.filter(
    (m) =>
      m.nom?.toLowerCase().includes(lower) ||
      m.marque?.toLowerCase().includes(lower) ||
      m.modele?.toLowerCase().includes(lower) ||
      m.immatriculation?.toLowerCase().includes(lower)
  );
}

export function getMaterielStats(materiels: Materiel[]) {
  const actifs = materiels.filter((m) => m.statut === "actif");
  return {
    total: materiels.length,
    actifs: actifs.length,
    parType: {
      vehicules: actifs.filter((m) => m.type === "vehicule").length,
      outils: actifs.filter((m) => m.type === "outil").length,
      machines: actifs.filter((m) => m.type === "machine").length,
      autres: actifs.filter((m) => m.type === "autre").length,
    },
    enPanne: materiels.filter((m) => m.statut === "en_panne").length,
  };
}

export function getMaterielIcon(type: string): string {
  switch (type) {
    case "vehicule": return "🚜";
    case "outil": return "🔧";
    case "machine": return "⚙️";
    default: return "🧰";
  }
}

export function getMaterielLabel(type: string): string {
  switch (type) {
    case "vehicule": return "Véhicule";
    case "outil": return "Outil";
    case "machine": return "Machine";
    default: return "Autre";
  }
}

export function getStatutLabel(statut: string): string {
  switch (statut) {
    case "actif": return "Actif";
    case "en_panne": return "En panne";
    case "vendu": return "Vendu";
    case "reforme": return "Réformé";
    default: return statut;
  }
}

export function getStatutColor(statut: string): string {
  switch (statut) {
    case "actif": return "bg-green-100 text-green-800";
    case "en_panne": return "bg-red-100 text-red-800";
    case "vendu": return "bg-gray-100 text-gray-800";
    case "reforme": return "bg-amber-100 text-amber-800";
    default: return "bg-gray-100 text-gray-800";
  }
}
