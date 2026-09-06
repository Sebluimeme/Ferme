import firebaseService from "@/lib/firebase-service";
import { validateNoNegativeDebt, type Transaction, type TransactionFormData } from "@/types/comptabilite";

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
  payeurs: ["SY", "BY", "revolut"],
};

function mergeUnique(existing: string[] | undefined, defaults: string[]): string[] {
  return Array.from(new Set([...(existing || []), ...defaults])).sort();
}

function normalizeConfig(config: CategoriesConfig): CategoriesConfig {
  return {
    productions: mergeUnique(config.productions, DEFAULT_CONFIG.productions),
    categories: mergeUnique(config.categories, DEFAULT_CONFIG.categories),
    sousCategories: mergeUnique(config.sousCategories, DEFAULT_CONFIG.sousCategories),
    payeurs: mergeUnique(config.payeurs, DEFAULT_CONFIG.payeurs),
  };
}

export async function getCategoriesConfig(): Promise<CategoriesConfig> {
  const result = await firebaseService.getById<CategoriesConfig>(CONFIG_PATH, "categories");
  if (result.success && result.data) return normalizeConfig(result.data);
  // Initialiser avec les valeurs par défaut
  await firebaseService.create(CONFIG_PATH, { ...DEFAULT_CONFIG, id: "categories" } as unknown as Record<string, unknown>);
  return DEFAULT_CONFIG;
}

export async function updateCategoriesConfig(config: CategoriesConfig) {
  return firebaseService.update(CONFIG_PATH, "categories", config as unknown as Record<string, unknown>);
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
    ...(data.quantite ? { quantite: parseFloat(data.quantite) } : {}),
    payeur: data.payeur,
    montant: Math.abs(parseFloat(data.montant)),
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
  if (!data.montant || isNaN(parseFloat(data.montant)) || parseFloat(data.montant) <= 0)
    errors.push("Le montant doit être un nombre positif");
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

export async function createTransaction(data: TransactionFormData, pieceJointe?: File, existingTransactions?: Transaction[]) {
  const validation = validateTransactionData(data);
  if (!validation.valid) return { success: false, error: validation.errors.join(", ") };
  const parsed = parseFormData(data);
  const debtValidation = validateNoNegativeDebt({ ...parsed, id: "" }, await getDebtReferenceTransactions(existingTransactions));
  if (!debtValidation.valid) return { success: false, error: debtValidation.error };
  if (pieceJointe) {
    const { uploadFile } = await import("@/lib/firebase-storage");
    const path = `transactions/${Date.now()}_${pieceJointe.name}`;
    const res = await uploadFile(path, pieceJointe);
    if (res.success && res.url) {
      parsed.pieceJointe = { url: res.url, storagePath: path, nom: pieceJointe.name };
    }
  }
  return firebaseService.create(PATH, parsed as unknown as Record<string, unknown>);
}

export async function updateTransaction(id: string, data: TransactionFormData, pieceJointe?: File, ancienStoragePath?: string, existingTransactions?: Transaction[]) {
  const validation = validateTransactionData(data);
  if (!validation.valid) return { success: false, error: validation.errors.join(", ") };
  const parsed = { ...parseFormData(data), id };
  const debtValidation = validateNoNegativeDebt(parsed as Transaction, await getDebtReferenceTransactions(existingTransactions));
  if (!debtValidation.valid) return { success: false, error: debtValidation.error };
  if (pieceJointe) {
    const { uploadFile, deleteFile } = await import("@/lib/firebase-storage");
    // Supprimer l'ancienne pièce jointe si elle existe
    if (ancienStoragePath) await deleteFile(ancienStoragePath);
    const path = `transactions/${Date.now()}_${pieceJointe.name}`;
    const res = await uploadFile(path, pieceJointe);
    if (res.success && res.url) {
      parsed.pieceJointe = { url: res.url, storagePath: path, nom: pieceJointe.name };
    }
  }
  return firebaseService.update(PATH, id, parsed as unknown as Record<string, unknown>);
}

export async function deleteTransaction(id: string, storagePath?: string) {
  if (storagePath) {
    const { deleteFile } = await import("@/lib/firebase-storage");
    await deleteFile(storagePath);
  }
  return firebaseService.delete(PATH, id);
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
    if (payeur && t.payeur !== payeur) return false;
    if (annee && !t.date.startsWith(annee)) return false;
    return true;
  });
}
