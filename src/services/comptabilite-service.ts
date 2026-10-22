import firebaseService from "@/lib/firebase-service";
import { KNOWN_PAYERS, normalizePayer, samePayer, uniquePayers } from "@/lib/comptabilite-payers";
import { validateNoNegativeDebt, type Transaction, type TransactionFormData } from "@/types/comptabilite";
import {
  clearedOptionalFields,
  deleteTransactionWithAttachment,
  parsePositiveDecimal,
  requiresInvoiceService,
  requiresSubsidyService,
  saveTransactionWithAttachment,
  type TransactionMutationResult,
} from "./comptabilite-write-safety";

const PATH = "transactions";
type TransactionPayload = Omit<Transaction, "id" | "dateCreation" | "derniereMAJ">;

// ==================== Catégories dynamiques dans Firebase ====================
// Stockées sous "comptabilite-config/categories" comme un objet { productions: [], categories: [], sousCategories: [] }

const CONFIG_PATH = "comptabilite-config";

export interface CategoriesConfig {
  productions: string[];
  categories: string[];
  sousCategories: string[];
  payeurs: string[];
}

const DEFAULT_CONFIG: CategoriesConfig = {
  productions: [
    "Bovins",
    "Moutons",
    "Porcs",
    "Équipement",
    "Poule pondeuse",
    "Canard",
    "Chien",
    "Abeille",
    "Poulet de chair",
    "Fourrage",
  ],
  categories: [
    "Animaux",
    "Avance",
    "Charges",
    "Immobilisation",
    "Engins",
    "Remboursement",
    "Ventes",
  ],
  sousCategories: [
    "SY",
    "BY",
    "Cheptel",
    "Nourritures",
    "Parc",
    "Vétérinaire",
    "Viande",
    "Tracteur",
    "Faucheuse",
    "Faneuse",
    "Broyeur",
    "Presse",
    "Andaineur",
    "Rateau faneur",
    "Rouleau",
    "Treuil",
    "Gator",
    "Lampe",
    "Fournitures",
    "CAC",
    "Semences",
    "Cotisation",
    "Avance personnelle vers Revolut",
    "Remboursement personnel depuis Revolut",
  ],
  payeurs: [...KNOWN_PAYERS],
};

function mergeUnique(existing: string[] | undefined, defaults: string[]): string[] {
  const values = Array.isArray(existing) ? existing.filter((value) => typeof value === "string") : [];
  return Array.from(new Set([...values, ...defaults])).sort();
}

function normalizeConfig(config: CategoriesConfig): CategoriesConfig {
  return {
    productions: mergeUnique(config.productions, DEFAULT_CONFIG.productions),
    categories: mergeUnique(config.categories, DEFAULT_CONFIG.categories),
    sousCategories: mergeUnique(config.sousCategories, DEFAULT_CONFIG.sousCategories),
    payeurs: uniquePayers(mergeUnique(config.payeurs, DEFAULT_CONFIG.payeurs)).sort(),
  };
}

export async function getCategoriesConfig(): Promise<CategoriesConfig> {
  const result = await firebaseService.getById<CategoriesConfig>(CONFIG_PATH, "categories");
  if (result.success && result.data) return normalizeConfig(result.data);
  // Consulter cette page ne doit jamais initialiser ou modifier la base.
  // Les valeurs proposées restent locales tant que l'utilisateur ne les édite pas.
  return normalizeConfig(DEFAULT_CONFIG);
}

export async function updateCategoriesConfig(config: CategoriesConfig) {
  const normalized = { ...config, payeurs: uniquePayers(config.payeurs) };
  return firebaseService.update(CONFIG_PATH, "categories", normalized as unknown as Record<string, unknown>);
}

export async function addProduction(production: string, currentConfig: CategoriesConfig) {
  const trimmed = production.trim();
  if (!trimmed || currentConfig.productions.includes(trimmed)) return { success: false, error: "Déjà existant ou vide" };
  const updated = { ...currentConfig, productions: [...currentConfig.productions, trimmed].sort() };
  return updateCategoriesConfig(updated);
}

export async function addCategorie(categorie: string, currentConfig: CategoriesConfig) {
  const trimmed = categorie.trim();
  if (!trimmed || currentConfig.categories.includes(trimmed)) return { success: false, error: "Déjà existant ou vide" };
  const updated = { ...currentConfig, categories: [...currentConfig.categories, trimmed].sort() };
  return updateCategoriesConfig(updated);
}

export async function addSousCategorie(sousCategorie: string, currentConfig: CategoriesConfig) {
  const trimmed = sousCategorie.trim();
  if (!trimmed || currentConfig.sousCategories.includes(trimmed)) return { success: false, error: "Déjà existant ou vide" };
  const updated = { ...currentConfig, sousCategories: [...currentConfig.sousCategories, trimmed].sort() };
  return updateCategoriesConfig(updated);
}

// ==================== CRUD Transactions ====================

function parseFormData(data: TransactionFormData): TransactionPayload {
  const nature = data.nature || "exploitation";
  return {
    date: data.date,
    operation: nature === "avance" ? "Dépenses" : nature === "remboursement" ? "Revenus" : data.operation,
    production: data.production.trim(),
    categorie: data.categorie.trim(),
    sousCategorie: data.sousCategorie.trim(),
    produit: data.produit.trim(),
    ...(data.remarque.trim() ? { remarque: data.remarque.trim() } : {}),
    ...(data.fournisseur.trim() ? { fournisseur: data.fournisseur.trim() } : {}),
    ...(data.quantite.trim() ? { quantite: parsePositiveDecimal(data.quantite)! } : {}),
    payeur: normalizePayer(data.payeur),
    montant: parsePositiveDecimal(data.montant, 2)!,
    nature,
  };
}

export function validateTransactionData(data: TransactionFormData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data.date) errors.push("La date est obligatoire");
  if (!data.operation) errors.push("L'opération est obligatoire");
  if (!data.production.trim()) errors.push("La production est obligatoire");
  if (!data.categorie.trim()) errors.push("La catégorie est obligatoire");
  if (!data.sousCategorie.trim()) errors.push("La sous-catégorie est obligatoire");
  if (!data.produit.trim()) errors.push("Le produit/description est obligatoire");
  if (parsePositiveDecimal(data.montant, 2) === null)
    errors.push("Le montant doit être positif, avec deux décimales maximum (ex. 12,50)");
  if (data.quantite.trim() && parsePositiveDecimal(data.quantite) === null)
    errors.push("La quantité doit être un nombre positif, ou rester vide");
  if ((data.nature === "avance" || data.nature === "remboursement") && !["SY", "BY"].includes(data.payeur)) {
    errors.push("Seuls Sébastien (SY) et Benjamin (BY) peuvent être avanceurs ou remboursés ; Revolut est le compte de la ferme.");
  }
  return { valid: errors.length === 0, errors };
}

async function getDebtReferenceTransactions(existingTransactions?: Transaction[]): Promise<Transaction[]> {
  if (existingTransactions) return existingTransactions;
  const result = await firebaseService.getAll<Transaction>(PATH);
  return result.success && result.data ? result.data : [];
}

function attachmentStoragePath(file: File): string {
  return `transactions/${crypto.randomUUID()}_${file.name}`;
}

export async function createTransaction(data: TransactionFormData, pieceJointe?: File, existingTransactions?: Transaction[]): Promise<TransactionMutationResult> {
  const validation = validateTransactionData(data);
  if (!validation.valid) return { success: false, error: validation.errors.join(", ") };
  const parsed = parseFormData(data);
  const debtValidation = validateNoNegativeDebt({ ...parsed, id: "" }, await getDebtReferenceTransactions(existingTransactions));
  if (!debtValidation.valid) return { success: false, error: debtValidation.error };
  return saveTransactionWithAttachment({
    file: pieceJointe,
    loadStorage: () => import("@/lib/firebase-storage"),
    storagePath: attachmentStoragePath,
    save: (attachment) => firebaseService.create(PATH, {
      ...parsed,
      ...(attachment ? { pieceJointe: attachment } : {}),
    } as unknown as Record<string, unknown>),
  });
}

export async function updateTransaction(id: string, data: TransactionFormData, pieceJointe?: File, _ancienStoragePath?: string, existingTransactions?: Transaction[]): Promise<TransactionMutationResult> {
  const validation = validateTransactionData(data);
  if (!validation.valid) return { success: false, error: validation.errors.join(", ") };
  const current = await firebaseService.getById<Transaction>(PATH, id);
  if (!current.success || !current.data) return { success: false, error: current.error || "Impossible de vérifier l'écriture avant modification" };
  if (requiresSubsidyService(current.data)) return { success: false, error: "Ce versement d’aide doit être modifié depuis le formulaire d’aide pour conserver son dispositif et sa campagne." };
  if (requiresInvoiceService(current.data)) return { success: false, error: "Cette facture d'achat doit être modifiée depuis son formulaire de facture pour préserver ses affectations." };
  const parsed = { ...parseFormData(data), id };
  const debtValidation = validateNoNegativeDebt(parsed as Transaction, await getDebtReferenceTransactions(existingTransactions));
  if (!debtValidation.valid) return { success: false, error: debtValidation.error };
  return saveTransactionWithAttachment({
    file: pieceJointe,
    // La valeur relue fait autorité : le formulaire peut dater d'avant une
    // modification réalisée sur un autre téléphone.
    previousStoragePath: current.data.pieceJointe?.storagePath,
    loadStorage: () => import("@/lib/firebase-storage"),
    storagePath: attachmentStoragePath,
    save: (attachment) => firebaseService.update(PATH, id, {
      ...parsed,
      // Firebase ignore les clés absentes. null supprime réellement un champ vidé.
      ...clearedOptionalFields(data),
      ...(attachment ? { pieceJointe: attachment } : {}),
    }),
  });
}

export async function deleteTransaction(id: string, _storagePath?: string): Promise<TransactionMutationResult> {
  const current = await firebaseService.getById<Transaction>(PATH, id);
  if (!current.success || !current.data) return { success: false, error: current.error || "Impossible de vérifier l'écriture avant suppression" };
  if (requiresSubsidyService(current.data)) return { success: false, error: "Ce versement d’aide doit être supprimé depuis le formulaire d’aide." };
  if (requiresInvoiceService(current.data)) return { success: false, error: "Cette facture d'achat doit être supprimée depuis son formulaire de facture pour préserver ses affectations." };
  return deleteTransactionWithAttachment({
    storagePath: current.data.pieceJointe?.storagePath,
    remove: () => firebaseService.delete(PATH, id),
    loadStorage: () => import("@/lib/firebase-storage"),
  });
}

export function searchTransactions(transactions: Transaction[], query: string): Transaction[] {
  const lower = query.toLowerCase();
  return transactions.filter(
    (t) =>
      t.produit?.toLowerCase().includes(lower) ||
      t.production?.toLowerCase().includes(lower) ||
      t.categorie?.toLowerCase().includes(lower) ||
      t.sousCategorie?.toLowerCase().includes(lower) ||
      t.fournisseur?.toLowerCase().includes(lower) ||
      t.remarque?.toLowerCase().includes(lower)
  );
}

export function filterTransactions(
  transactions: Transaction[],
  {
    operation,
    production,
    categorie,
    payeur,
    annee,
  }: { operation?: string; production?: string; categorie?: string; payeur?: string; annee?: string }
): Transaction[] {
  return transactions.filter((t) => {
    if (operation && t.operation !== operation) return false;
    if (production && t.production !== production) return false;
    if (categorie && t.categorie !== categorie) return false;
    if (payeur && !samePayer(t.payeur, payeur)) return false;
    if (annee && !t.date.startsWith(annee)) return false;
    return true;
  });
}
