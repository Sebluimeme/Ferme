/**
 * Types pour la comptabilité de la ferme
 */

// ==================== Opérations ====================

export type OperationType = "Dépenses" | "Revenus";
export type TransactionNature = "exploitation" | "avance" | "remboursement";

export const FARM_CREDITORS = ["SY", "BY"] as const;
export type FarmCreditor = (typeof FARM_CREDITORS)[number];

export const CREDITOR_LABELS: Record<FarmCreditor, string> = {
  SY: "Sébastien",
  BY: "Benjamin",
};

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
  nature?: TransactionNature; // Compatibilité : absent = exploitation, sauf remboursements historiques détectés
  pieceJointe?: {
    url: string;
    storagePath: string;
    nom: string;
  };
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
  nature?: TransactionNature;
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
  nature: "exploitation",
};

// ==================== Stats ====================

export interface ComptabiliteStats {
  totalDepenses: number;
  totalRevenus: number;
  balance: number;
  nbTransactions: number;
}

export type CreditorBalances = Record<FarmCreditor, number>;

function normalize(value?: string): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

export function isFarmCreditor(payeur?: string): payeur is FarmCreditor {
  return FARM_CREDITORS.includes(payeur as FarmCreditor);
}

export function creditorLabel(payeur: FarmCreditor): string {
  return CREDITOR_LABELS[payeur];
}

export function getTransactionNature(transaction: Pick<Transaction, "nature" | "categorie" | "sousCategorie" | "produit">): TransactionNature {
  if (transaction.nature) return transaction.nature;

  // Compatibilité données existantes : les remboursements créés avant le champ `nature`
  // étaient des revenus catégorisés/libellés "Remboursement".
  const marker = [transaction.categorie, transaction.sousCategorie, transaction.produit]
    .map(normalize)
    .join(" ");
  if (marker.includes("remboursement") || marker.includes("rembourser")) return "remboursement";
  if (marker.includes("avance")) return "avance";
  return "exploitation";
}

export function isOperatingTransaction(transaction: Pick<Transaction, "nature" | "categorie" | "sousCategorie" | "produit">): boolean {
  return getTransactionNature(transaction) === "exploitation";
}

export function getDebtImpact(transaction: Pick<Transaction, "operation" | "payeur" | "montant" | "nature" | "categorie" | "sousCategorie" | "produit">): number {
  if (!isFarmCreditor(transaction.payeur)) return 0;
  const nature = getTransactionNature(transaction);
  if (nature === "avance") return transaction.montant;
  if (nature === "remboursement") return -transaction.montant;
  if (transaction.operation === "Dépenses") return transaction.montant;
  if (transaction.operation === "Revenus") return -transaction.montant;
  return 0;
}

export function computeCreditorBalances(transactions: Array<Pick<Transaction, "operation" | "payeur" | "montant" | "nature" | "categorie" | "sousCategorie" | "produit">>): CreditorBalances {
  const balances: CreditorBalances = { SY: 0, BY: 0 };
  for (const transaction of transactions) {
    if (!isFarmCreditor(transaction.payeur)) continue;
    balances[transaction.payeur] += getDebtImpact(transaction);
  }
  return {
    SY: Math.max(0, roundCurrency(balances.SY)),
    BY: Math.max(0, roundCurrency(balances.BY)),
  };
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function validateNoNegativeDebt(
  transaction: Pick<Transaction, "id" | "operation" | "payeur" | "montant" | "nature" | "categorie" | "sousCategorie" | "produit">,
  existingTransactions: Transaction[] = []
): { valid: boolean; error?: string } {
  const impact = getDebtImpact(transaction);
  if (impact >= 0 || !isFarmCreditor(transaction.payeur)) return { valid: true };

  const previousDebt = computeCreditorBalances(existingTransactions.filter((t) => t.id !== transaction.id))[transaction.payeur];
  if (roundCurrency(previousDebt + impact) < 0) {
    return {
      valid: false,
      error: `Cette écriture dépasserait la dette de ${creditorLabel(transaction.payeur)} (${previousDebt.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € disponible). Corrigez le montant ou le payeur.`,
    };
  }
  return { valid: true };
}

// ==================== Utilitaires ====================

export function computeStats(transactions: Transaction[]): ComptabiliteStats {
  const operatingTransactions = transactions.filter(isOperatingTransaction);
  const totalDepenses = operatingTransactions
    .filter((t) => t.operation === "Dépenses")
    .reduce((sum, t) => sum + t.montant, 0);
  const totalRevenus = operatingTransactions
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
