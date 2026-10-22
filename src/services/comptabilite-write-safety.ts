/**
 * Séquences de sauvegarde testables sans connexion Firebase.
 * Une pièce jointe déjà référencée reste disponible jusqu'à la confirmation
 * de la modification ou de la suppression de l'écriture.
 */
export interface TransactionMutationResult {
  success: boolean;
  id?: string;
  data?: unknown;
  error?: string;
  warning?: string;
}

export interface TransactionAttachment {
  url: string;
  storagePath: string;
  nom: string;
}

interface AttachmentStorage {
  uploadFile(path: string, file: File): Promise<{ success: boolean; url?: string; error?: string }>;
  deleteFile(path: string): Promise<{ success: boolean; error?: string }>;
}

/** Accepte la virgule française, jamais les suffixes, exposants ou valeurs infinies. */
export function parsePositiveDecimal(value: string, maximumDecimals?: number): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const fraction = normalized.split(".")[1] || "";
  if (maximumDecimals !== undefined && fraction.length > maximumDecimals) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > Number.MAX_SAFE_INTEGER) return null;
  if (maximumDecimals !== undefined && !Number.isSafeInteger(Math.round(parsed * 10 ** maximumDecimals))) return null;
  return parsed;
}

export function clearedOptionalFields(data: { remarque: string; fournisseur: string; quantite: string }) {
  return {
    remarque: data.remarque.trim() || null,
    fournisseur: data.fournisseur.trim() || null,
    quantite: data.quantite.trim() ? parsePositiveDecimal(data.quantite) : null,
  };
}

export function requiresInvoiceService(transaction: unknown): boolean {
  // Protéger également une facture partiellement renseignée : le formulaire
  // historique ne peut pas garantir l'équilibre de ses affectations.
  if (!transaction || typeof transaction !== "object") return false;
  const entry = transaction as { typeFacture?: unknown; factureVersion?: unknown; allocations?: unknown };
  return entry.typeFacture === "achat" || entry.factureVersion !== undefined || entry.allocations !== undefined;
}

export function requiresSubsidyService(transaction: unknown): boolean {
  if (!transaction || typeof transaction !== "object") return false;
  const entry = transaction as { subvention?: unknown; versionSubvention?: unknown };
  return entry.subvention !== undefined || entry.versionSubvention !== undefined;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Connexion indisponible";
}

async function cleanup(storage: AttachmentStorage, path: string): Promise<boolean> {
  try {
    return (await storage.deleteFile(path)).success;
  } catch {
    return false;
  }
}

export async function saveTransactionWithAttachment(options: {
  file?: File;
  previousStoragePath?: string;
  loadStorage: () => Promise<AttachmentStorage>;
  storagePath: (file: File) => string;
  save: (attachment?: TransactionAttachment) => Promise<TransactionMutationResult>;
}): Promise<TransactionMutationResult> {
  let storage: AttachmentStorage | undefined;
  let attachment: TransactionAttachment | undefined;
  if (options.file) {
    try {
      storage = await options.loadStorage();
      const storagePath = options.storagePath(options.file);
      const uploaded = await storage.uploadFile(storagePath, options.file);
      if (!uploaded.success || !uploaded.url) {
        return { success: false, error: `Le justificatif n'a pas pu être envoyé. L'écriture n'a pas été enregistrée. ${uploaded.error || "Réessayez avec une connexion disponible."}` };
      }
      attachment = { url: uploaded.url, storagePath, nom: options.file.name };
    } catch (error) {
      return { success: false, error: `Le justificatif n'a pas pu être envoyé. L'écriture n'a pas été enregistrée. ${message(error)}` };
    }
  }

  let saved: TransactionMutationResult;
  try {
    saved = await options.save(attachment);
  } catch (error) {
    // Un résultat indéterminé ne justifie pas de supprimer un document qui
    // pourrait déjà être référencé. La relecture permettra de réconcilier.
    return {
      success: false,
      error: `Impossible de confirmer l'enregistrement. Vérifiez la liste avant de réessayer. ${message(error)}`,
      ...(attachment ? { warning: "Le justificatif envoyé a été conservé par précaution." } : {}),
    };
  }

  if (!saved.success) {
    if (attachment && storage && !(await cleanup(storage, attachment.storagePath))) {
      return { ...saved, warning: "L'écriture n'a pas été enregistrée. Le nouveau fichier envoyé n'a pas pu être nettoyé ; l'ancien justificatif est conservé." };
    }
    return saved;
  }

  if (attachment && storage && options.previousStoragePath && options.previousStoragePath !== attachment.storagePath) {
    if (!(await cleanup(storage, options.previousStoragePath))) {
      return { ...saved, warning: "L'écriture et le nouveau justificatif sont enregistrés. L'ancienne copie du fichier n'a pas pu être supprimée." };
    }
  }
  return saved;
}

export async function deleteTransactionWithAttachment(options: {
  storagePath?: string;
  remove: () => Promise<TransactionMutationResult>;
  loadStorage: () => Promise<AttachmentStorage>;
}): Promise<TransactionMutationResult> {
  let removed: TransactionMutationResult;
  try {
    removed = await options.remove();
  } catch (error) {
    return { success: false, error: `Impossible de confirmer la suppression. Le justificatif est conservé. ${message(error)}` };
  }
  if (!removed.success || !options.storagePath) return removed;
  try {
    const storage = await options.loadStorage();
    if (await cleanup(storage, options.storagePath)) return removed;
  } catch {
    // La suppression de l'écriture est confirmée ; seul le nettoyage reste.
  }
  return { ...removed, warning: "L'écriture est supprimée. Son fichier justificatif n'a pas pu être nettoyé." };
}
