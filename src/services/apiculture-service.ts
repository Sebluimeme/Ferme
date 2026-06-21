import firebaseService from "@/lib/firebase-service";
import type { Ruche, RecolteMiel, VenteMiel } from "@/types/apiculture";

const PATH_RUCHES = "ruches";
const PATH_RECOLTES = "recoltes-miel";
const PATH_VENTES = "ventes-miel";
const PATH_TRANSACTIONS = "transactions";

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
// Chaque vente crée/met à jour/supprime une Transaction miroir dans "transactions"
// pour que la balance globale (module Coûts) la prenne en compte automatiquement.

function buildTransactionPayload(data: {
  dateVente: string;
  nbPots500g: number;
  nbPots1kg: number;
  typeMiel?: string;
  prixTotal: number;
  notes?: string;
}): Record<string, unknown> {
  const detail: string[] = [];
  if (data.nbPots500g > 0) detail.push(`${data.nbPots500g}×½kg`);
  if (data.nbPots1kg > 0) detail.push(`${data.nbPots1kg}×1kg`);
  if (data.typeMiel) detail.push(data.typeMiel);
  const produit = `Vente miel${detail.length ? ` (${detail.join(", ")})` : ""}`;
  return {
    date: data.dateVente,
    operation: "Revenus",
    production: "Abeille",
    categorie: "Ventes",
    sousCategorie: "Miel",
    produit,
    remarque: data.notes ?? "",
    fournisseur: "",
    quantite: data.nbPots500g + data.nbPots1kg,
    payeur: "Ferme",
    montant: data.prixTotal,
  };
}

export async function createVente(data: Omit<VenteMiel, "id" | "dateCreation" | "derniereMAJ" | "transactionId">) {
  // 1. Créer la transaction miroir
  const txRes = await firebaseService.create<Record<string, unknown>>(
    PATH_TRANSACTIONS,
    buildTransactionPayload(data)
  );
  const transactionId = txRes.success ? (txRes.id as string | undefined) : undefined;

  // 2. Créer la vente avec le lien
  return firebaseService.create<Record<string, unknown>>(PATH_VENTES, {
    ...data,
    ...(transactionId ? { transactionId } : {}),
  });
}

export async function updateVente(
  id: string,
  data: Partial<Omit<VenteMiel, "id" | "dateCreation" | "derniereMAJ">>,
  currentVente?: VenteMiel
) {
  // Mettre à jour la transaction miroir si elle existe et qu'on a les données complètes
  if (currentVente?.transactionId && data.dateVente !== undefined || data.prixTotal !== undefined) {
    const merged = { ...currentVente, ...data } as VenteMiel;
    if (merged.dateVente && merged.prixTotal != null) {
      await firebaseService.update(PATH_TRANSACTIONS, currentVente!.transactionId!, buildTransactionPayload({
        dateVente: merged.dateVente,
        nbPots500g: merged.nbPots500g ?? 0,
        nbPots1kg: merged.nbPots1kg ?? 0,
        prixTotal: merged.prixTotal,
        notes: merged.notes,
      }));
    }
  }
  return firebaseService.update(PATH_VENTES, id, { ...data });
}

export async function deleteVente(id: string, transactionId?: string) {
  // Supprimer la transaction miroir
  if (transactionId) {
    await firebaseService.delete(PATH_TRANSACTIONS, transactionId);
  }
  return firebaseService.delete(PATH_VENTES, id);
}
