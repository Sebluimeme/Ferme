/**
 * Types pour la comptabilité de la ferme
 */

// ==================== Opérations ====================

export type OperationType = "Dépenses" | "Revenus";

// ==================== Transaction ====================

export interface Transaction {
  id: string;
  date: string; // ISO date (YYYY-MM-DD)
  operation: OperationType;
  production: string; // Ex: "Bovins", "Moutons", "Équipement"
  categorie: string; // Ex: "Animaux", "Charges", "Immobilisation", "Engins"
  sousCategorie: string; // Ex: "Cheptel", "Nourritures", "Parc"
  produit: string; // Description du produit/service
  remarque?: string;
  fournisseur?: string;
  quantite?: number;
  payeur: string; // Ex: "SY", "BY", "revolut"
  montant: number; // Toujours positif — operation détermine le sens
  dateCreation?: string;
  derniereMAJ?: string;
}

export interface TransactionFormData {
  date: string;
  operation: OperationType;
  production: string;
  categorie: string;
  sousCategorie: string;
  produit: string;
  remarque: string;
  fournisseur: string;
  quantite: string;
  payeur: string;
  montant: string;
}

export const EMPTY_TRANSACTION_FORM: TransactionFormData = {
  date: new Date().toISOString().split("T")[0],
  operation: "Dépenses",
  production: "",
  categorie: "",
  sousCategorie: "",
  produit: "",
  remarque: "",
  fournisseur: "",
  quantite: "",
  payeur: "SY",
  montant: "",
};

// ==================== Stats ====================

export interface ComptabiliteStats {
  totalDepenses: number;
  totalRevenus: number;
  balance: number;
  nbTransactions: number;
}

// ==================== Utilitaires ====================

export function computeStats(transactions: Transaction[]): ComptabiliteStats {
  const totalDepenses = transactions
    .filter((t) => t.operation === "Dépenses")
    .reduce((sum, t) => sum + t.montant, 0);
  const totalRevenus = transactions
    .filter((t) => t.operation === "Revenus")
    .reduce((sum, t) => sum + t.montant, 0);
  return {
    totalDepenses,
    totalRevenus,
    balance: totalRevenus - totalDepenses,
    nbTransactions: transactions.length,
  };
}

export function formatMontant(montant: number, operation?: OperationType): string {
  const prefix = operation === "Revenus" ? "+" : operation === "Dépenses" ? "-" : "";
  return `${prefix}${montant.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
