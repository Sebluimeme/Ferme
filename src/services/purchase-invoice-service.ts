import { FARM_CREDITORS, creditorLabel, getDebtImpact, type Transaction } from "@/types/comptabilite";
import {
  buildPurchaseInvoice, invoiceToDraft, isPurchaseInvoice, validatePurchaseInvoice,
  type PurchaseInvoice, type PurchaseInvoiceDraft,
} from "@/types/purchase-invoice";

export interface PurchaseInvoiceResult {
  success: boolean;
  data?: PurchaseInvoice;
  error?: string;
  warning?: string;
}

export interface SavePurchaseInvoiceOptions {
  pieceJointe?: File;
  expectedVersion?: number;
}

interface AtomicResult {
  committed: boolean;
  value: Transaction | null;
}

/** Injection pour tester les garanties sans connecter Firebase ni toucher aux données réelles. */
export interface PurchaseInvoiceGateway {
  read: (id: string) => Promise<Transaction | null>;
  readTransactions: () => Promise<Transaction[]>;
  compareAndSet: (id: string, change: (current: Transaction | null) => Transaction | null | undefined) => Promise<AtomicResult>;
  upload: (path: string, file: File) => Promise<{ success: boolean; url?: string; error?: string }>;
  deleteFile: (path: string) => Promise<{ success: boolean; error?: string }>;
  now?: () => string;
}

const CONFLICT = "Cette facture a été modifiée sur un autre appareil. Fermez puis rouvrez-la pour retrouver la dernière version avant de modifier.";
const OFFLINE = "La connexion est nécessaire pour enregistrer la facture. Votre brouillon reste disponible sur cet appareil.";
const MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Impossible d’enregistrer la facture. Réessayez sans fermer le brouillon.";
}

export function validateInvoiceAttachment(file: File): string | null {
  if (file.size <= 0) return "Le justificatif est vide.";
  if (file.size > 10 * 1024 * 1024) return "Le justificatif dépasse la limite de 10 Mo.";
  // Certains iPhone ne renseignent pas le type MIME des fichiers HEIC.
  const extensionAllowed = /\.(pdf|jpe?g|png|webp|heic|heif)$/i.test(file.name);
  if (!(MIME_TYPES.has(file.type) || (!file.type && extensionAllowed))) return "Choisissez un PDF ou une photo (JPEG, PNG, WEBP ou HEIC).";
  return null;
}

function comparableInvoice(invoice: PurchaseInvoice): string {
  const draft = invoiceToDraft(invoice);
  // La version et les dates techniques ne participent pas à la déduplication d’une même demande.
  const { version: _version, ...content } = draft;
  void _version;
  return JSON.stringify({ ...content, pieceJointe: invoice.pieceJointe || null });
}

export function validateInvoiceDebtChange(existing: Transaction[], id: string, replacement: Transaction | null): string | null {
  for (const creditor of FARM_CREDITORS) {
    const before = existing.filter((transaction) => transaction.payeur === creditor)
      .reduce((sum, transaction) => sum + Math.round(getDebtImpact(transaction) * 100), 0);
    const prior = existing.find((transaction) => transaction.id === id);
    const removedImpact = prior?.payeur === creditor ? Math.round(getDebtImpact(prior) * 100) : 0;
    const newImpact = replacement?.payeur === creditor ? Math.round(getDebtImpact(replacement) * 100) : 0;
    const after = before - removedImpact + newImpact;
    if (after < 0 && after < before) {
      return `Cette modification ferait passer la dette de ${creditorLabel(creditor)} sous zéro. Vérifiez les remboursements et le payeur avant de modifier cette facture.`;
    }
  }
  return null;
}

async function attachmentPath(invoiceId: string, version: number, file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "justificatif";
  // Préfixe et profondeur déjà utilisés par les justificatifs historiques (règles Storage déployées).
  return `transactions/invoice_${invoiceId}_v${version}_${hash}-${safeName}`;
}

export function createPurchaseInvoiceService(gateway: PurchaseInvoiceGateway) {
  return {
    async get(id: string): Promise<PurchaseInvoiceResult> {
      try {
        const invoice = await gateway.read(id);
        return isPurchaseInvoice(invoice) ? { success: true, data: invoice } : { success: false, error: "Facture d’achat introuvable." };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },

    async save(draft: PurchaseInvoiceDraft, options: SavePurchaseInvoiceOptions = {}): Promise<PurchaseInvoiceResult> {
      const validation = validatePurchaseInvoice(draft);
      if (!validation.valid) return { success: false, error: validation.errors.join(" ") };
      const expectedVersion = options.expectedVersion ?? draft.version ?? 0;
      if (!Number.isInteger(expectedVersion) || expectedVersion < 0) return { success: false, error: "La version de la facture est invalide." };
      if (options.pieceJointe) {
        const attachmentError = validateInvoiceAttachment(options.pieceJointe);
        if (attachmentError) return { success: false, error: attachmentError };
      }
      try {
        const previous = await gateway.read(draft.id);
        if (previous && !isPurchaseInvoice(previous)) return { success: false, error: "Cet identifiant appartient à une écriture historique. Elle n’a pas été modifiée." };
        // Pas d’édition aveugle ni de résurrection d’une facture supprimée avec une ancienne version.
        if (!previous && expectedVersion !== 0) return { success: false, error: "Cette facture n’existe plus. Rechargez la liste des dépenses." };
        let pieceJointe = previous?.pieceJointe;
        if (options.pieceJointe) {
          const path = await attachmentPath(draft.id, expectedVersion + 1, options.pieceJointe);
          // Un nouvel essai du même fichier réutilise sa pièce jointe déjà confirmée.
          if (previous?.pieceJointe?.storagePath !== path) {
            if (previous && previous.factureVersion !== expectedVersion) return { success: false, error: CONFLICT };
            const uploaded = await gateway.upload(path, options.pieceJointe);
            if (!uploaded.success || !uploaded.url) return { success: false, error: `Justificatif non envoyé. La facture n’a pas été enregistrée. ${uploaded.error || "Réessayez lorsque la connexion sera rétablie."}` };
            pieceJointe = { url: uploaded.url, storagePath: path, nom: options.pieceJointe.name };
          }
        }
        const candidate = buildPurchaseInvoice(draft, { previous: previous || undefined, pieceJointe, now: gateway.now?.() });
        if (previous && comparableInvoice(previous) === comparableInvoice(candidate)) return { success: true, data: previous };
        if (previous && previous.factureVersion !== expectedVersion) return { success: false, error: CONFLICT };
        // Contrôle identique au principe existant : lecture des écritures avant changement de dette.
        // Les autres écritures historiques ne sont pas verrouillées globalement.
        const existing = await gateway.readTransactions();
        const debtError = validateInvoiceDebtChange(existing, draft.id, candidate);
        if (debtError) return { success: false, error: debtError };
        let conflictError = CONFLICT;
        const result = await gateway.compareAndSet(draft.id, (current) => {
          if (isPurchaseInvoice(current) && comparableInvoice(current) === comparableInvoice(candidate)) return current;
          if (current && (!isPurchaseInvoice(current) || current.factureVersion !== expectedVersion)) return undefined;
          if (!current && expectedVersion !== 0) {
            conflictError = "Cette facture a été supprimée sur un autre appareil.";
            return undefined;
          }
          return candidate;
        });
        if (!result.committed || !isPurchaseInvoice(result.value)) return { success: false, error: conflictError };
        let warning: string | undefined;
        if (previous?.pieceJointe && pieceJointe && previous.pieceJointe.storagePath !== pieceJointe.storagePath) {
          // L’ancien justificatif est conservé tant que l’écriture de la nouvelle facture n’est pas confirmée.
          try {
            const removed = await gateway.deleteFile(previous.pieceJointe.storagePath);
            if (!removed.success) warning = "La facture est enregistrée. L’ancien justificatif a été conservé par précaution.";
          } catch {
            warning = "La facture est enregistrée. L’ancien justificatif a été conservé par précaution.";
          }
        }
        return { success: true, data: result.value, ...(warning ? { warning } : {}) };
      } catch (error) {
        // En cas de réponse réseau ambiguë, conserver fichier et brouillon : le même identifiant rend le nouvel essai idempotent.
        return { success: false, error: errorMessage(error) };
      }
    },

    async delete(id: string, expectedVersion: number): Promise<PurchaseInvoiceResult> {
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return { success: false, error: "La version de la facture est invalide." };
      try {
        const previous = await gateway.read(id);
        if (!previous) return { success: true };
        if (!isPurchaseInvoice(previous) || previous.factureVersion !== expectedVersion) return { success: false, error: CONFLICT };
        const existing = await gateway.readTransactions();
        const debtError = validateInvoiceDebtChange(existing, id, null);
        if (debtError) return { success: false, error: debtError };
        const result = await gateway.compareAndSet(id, (current) => {
          if (!current) return null;
          return isPurchaseInvoice(current) && current.factureVersion === expectedVersion ? null : undefined;
        });
        if (!result.committed) return { success: false, error: CONFLICT };
        let warning: string | undefined;
        if (previous.pieceJointe) {
          try {
            const removed = await gateway.deleteFile(previous.pieceJointe.storagePath);
            if (!removed.success) warning = "La facture est supprimée. Son justificatif a été conservé par précaution.";
          } catch {
            warning = "La facture est supprimée. Son justificatif a été conservé par précaution.";
          }
        }
        return { success: true, ...(warning ? { warning } : {}) };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
  };
}

let servicePromise: Promise<ReturnType<typeof createPurchaseInvoiceService>> | undefined;

async function getService() {
  if (!servicePromise) {
    servicePromise = (async () => {
      const [{ database, auth }, firebase, storage] = await Promise.all([
        import("@/lib/firebase"), import("firebase/database"), import("@/lib/firebase-storage"),
      ]);
      async function readOnline(path: string) {
        if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error(OFFLINE);
        const user = auth.currentUser;
        if (!user) throw new Error("Reconnectez-vous avant d’enregistrer une facture.");
        const token = await user.getIdToken();
        const base = database.app.options.databaseURL;
        if (!base) throw new Error("Configuration de la base indisponible.");
        const projectId = database.app.options.projectId || "";
        const localEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true"
          && projectId.startsWith("demo-") && typeof window !== "undefined"
          && ["localhost", "127.0.0.1", "[::1]", "::1"].includes(window.location.hostname);
        const endpoint = localEmulator
          ? `http://127.0.0.1:9000/${path}.json?ns=${encodeURIComponent(`${projectId}-default-rtdb`)}&auth=${encodeURIComponent(token)}`
          : `${base.replace(/\/$/, "")}/${path}.json?auth=${encodeURIComponent(token)}`;
        // GET REST avec cache interdit : une lecture Firebase get() peut sinon servir des données anciennes hors ligne.
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20_000);
        try {
          const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
          if (!response.ok) throw new Error("Impossible de vérifier les dernières données. Réessayez lorsque la connexion sera rétablie.");
          return await response.json();
        } catch (error) {
          if (controller.signal.aborted) throw new Error("Le réseau répond trop lentement. Votre brouillon est conservé ; réessayez avec une meilleure connexion.");
          throw error;
        } finally {
          clearTimeout(timeout);
        }
      }
      return createPurchaseInvoiceService({
        read: (id) => readOnline(`transactions/${encodeURIComponent(id)}`),
        readTransactions: async () => Object.values((await readOnline("transactions")) || {}) as Transaction[],
        compareAndSet: async (id, change) => {
          if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error(OFFLINE);
          const invoiceRef = firebase.ref(database, `transactions/${id}`);
          // Garder CE nœud en cache jusqu'à la fin : get() seul peut évacuer son cache avant la transaction.
          let unsubscribe = () => {};
          try {
            await new Promise<void>((resolve, reject) => {
              unsubscribe = firebase.onValue(invoiceRef, () => resolve(), reject);
            });
            const result = await firebase.runTransaction(invoiceRef, change, { applyLocally: false });
            return { committed: result.committed, value: result.snapshot.exists() ? result.snapshot.val() as Transaction : null };
          } finally {
            unsubscribe();
          }
        },
        upload: storage.uploadFile,
        deleteFile: storage.deleteFile,
      });
    })();
  }
  return servicePromise;
}

export async function getPurchaseInvoice(id: string): Promise<PurchaseInvoiceResult> {
  try { return await (await getService()).get(id); } catch (error) { return { success: false, error: errorMessage(error) }; }
}

export async function savePurchaseInvoice(draft: PurchaseInvoiceDraft, options: SavePurchaseInvoiceOptions = {}): Promise<PurchaseInvoiceResult> {
  try { return await (await getService()).save(draft, options); } catch (error) { return { success: false, error: errorMessage(error) }; }
}

export async function deletePurchaseInvoice(id: string, expectedVersion: number): Promise<PurchaseInvoiceResult> {
  try { return await (await getService()).delete(id, expectedVersion); } catch (error) { return { success: false, error: errorMessage(error) }; }
}
