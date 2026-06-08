import firebaseService from "@/lib/firebase-service";
import type { Ruche, RecolteMiel, VenteMiel } from "@/types/apiculture";

const PATH_RUCHES = "ruches";
const PATH_RECOLTES = "recoltes-miel";
const PATH_VENTES = "ventes-miel";

// ==================== Ruches ====================

export async function createRuche(data: Omit<Ruche, "id" | "dateCreation" | "derniereMAJ">) {
  return firebaseService.create<Record<string, unknown>>(PATH_RUCHES, { ...data });
}

export async function updateRuche(id: string, data: Partial<Omit<Ruche, "id" | "dateCreation" | "derniereMAJ">>) {
  return firebaseService.update(PATH_RUCHES, id, { ...data });
}

export async function deleteRuche(id: string) {
  return firebaseService.delete(PATH_RUCHES, id);
}

// ==================== Récoltes miel ====================

export async function createRecolte(data: Omit<RecolteMiel, "id" | "dateCreation" | "derniereMAJ">) {
  return firebaseService.create<Record<string, unknown>>(PATH_RECOLTES, { ...data });
}

export async function updateRecolte(id: string, data: Partial<Omit<RecolteMiel, "id" | "dateCreation" | "derniereMAJ">>) {
  return firebaseService.update(PATH_RECOLTES, id, { ...data });
}

export async function deleteRecolte(id: string) {
  return firebaseService.delete(PATH_RECOLTES, id);
}

// ==================== Ventes miel ====================

export async function createVente(data: Omit<VenteMiel, "id" | "dateCreation" | "derniereMAJ">) {
  return firebaseService.create<Record<string, unknown>>(PATH_VENTES, { ...data });
}

export async function updateVente(id: string, data: Partial<Omit<VenteMiel, "id" | "dateCreation" | "derniereMAJ">>) {
  return firebaseService.update(PATH_VENTES, id, { ...data });
}

export async function deleteVente(id: string) {
  return firebaseService.delete(PATH_VENTES, id);
}
