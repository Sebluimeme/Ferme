import { FARM_CREDITORS, creditorLabel, getDebtImpact, type Transaction } from "@/types/comptabilite";
import {
  buildSubsidyPayment, subsidyToDraft, isSubsidyPayment, validateSubsidyDraft,
  type SubsidyPayment, type SubsidyDraft,
} from "@/types/subsidy";

export interface SubsidyPaymentResult {
  success: boolean;
  data?: SubsidyPayment;
  error?: string;
  warning?: string;
}

export interface SaveSubsidyPaymentOptions {
  pieceJointe?: File;
  expectedVersion?: number;
}

interface AtomicResult {
  committed: boolean;
  value: Transaction | null;
}

/** Injection pour tester les garanties sans connecter Firebase ni toucher aux données réelles. */
export interface SubsidyPaymentGateway {
  read: (id: string) => Promise<Transaction | null>;
  readTransactions: () => Promise<Transaction[]>;
  compareAndSet: (id: string, change: (current: Transaction | null) => Transaction | null | undefined) => Promise<AtomicResult>;
  upload: (path: string, file: File) => Promise<{ success: boolean; url?: string; error?: string }>;
  deleteFile: (path: string) => Promise<{ success: boolean; error?: string }>;
  now?: () => string;
}

const CONFLICT = "Ce versement a été modifié sur un autre appareil. Fermez puis rouvrez-le pour retrouver la dernière version avant de modifier.";
const OFFLINE = "La connexion est nécessaire pour enregistrer le versement. Votre brouillon reste disponible sur cet appareil.";
const MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Impossible d’enregistrer le versement. Réessayez sans fermer le brouillon.";
}

export function validateSubsidyAttachment(file: File): string | null {
  if (file.size <= 0) return "Le justificatif est vide.";
  if (file.size > 10 * 1024 * 1024) return "Le justificatif dépasse la limite de 10 Mo.";
  // Certains iPhone ne renseignent pas le type MIME des fichiers HEIC.
  const extensionAllowed = /\.(pdf|jpe?g|png|webp|heic|heif)$/i.test(file.name);
  if (!(MIME_TYPES.has(file.type) || (!file.type && extensionAllowed))) return "Choisissez un PDF ou une photo (JPEG, PNG, WEBP ou HEIC).";
  return null;
}

function comparableSubsidy(payment: SubsidyPayment): string {
  const draft = subsidyToDraft(payment);
  // La version et les dates techniques ne participent pas à la déduplication d’une même demande.
  const { version: _version, ...content } = draft;
  void _version;
  return JSON.stringify({ ...content, pieceJointe: payment.pieceJointe || null, sourceDocumentSha256: payment.subvention.sourceDocumentSha256 || null });
}

export function validateSubsidyDebtChange(existing: Transaction[], id: string, replacement: Transaction | null): string | null {
  for (const creditor of FARM_CREDITORS) {
    const before = existing.filter((transaction) => transaction.payeur === creditor)
      .reduce((sum, transaction) => sum + Math.round(getDebtImpact(transaction) * 100), 0);
    const prior = existing.find((transaction) => transaction.id === id);
    const removedImpact = prior?.payeur === creditor ? Math.round(getDebtImpact(prior) * 100) : 0;
    const newImpact = replacement?.payeur === creditor ? Math.round(getDebtImpact(replacement) * 100) : 0;
    const after = before - removedImpact + newImpact;
    if (after < 0 && after < before) {
      return `Cette modification ferait passer la dette de ${creditorLabel(creditor)} sous zéro. Vérifiez les remboursements et le payeur avant de modifier ce versement.`;
    }
  }
  return null;
}

async function attachmentPath(paymentId: string, version: number, file: File): Promise<{ path: string; sha256: string }> {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "justificatif";
  // Préfixe et profondeur déjà utilisés par les justificatifs historiques (règles Storage déployées).
  return { path: `transactions/subsidy_${paymentId}_v${version}_${hash}-${safeName}`, sha256: hash };
}

export function createSubsidyPaymentService(gateway: SubsidyPaymentGateway) {
  return {
    async get(id: string): Promise<SubsidyPaymentResult> {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return { success: false, error: "L’identifiant du versement est invalide." };
      try {
        const payment = await gateway.read(id);
        return isSubsidyPayment(payment) ? { success: true, data: payment } : { success: false, error: "Aide introuvable." };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },

    async save(draft: SubsidyDraft, options: SaveSubsidyPaymentOptions = {}): Promise<SubsidyPaymentResult> {
      const validation = validateSubsidyDraft(draft);
      if (!validation.valid) return { success: false, error: validation.errors.join(" ") };
      const expectedVersion = options.expectedVersion ?? draft.version ?? 0;
      if (!Number.isInteger(expectedVersion) || expectedVersion < 0) return { success: false, error: "La version du versement est invalide." };
      if (options.pieceJointe) {
        const attachmentError = validateSubsidyAttachment(options.pieceJointe);
        if (attachmentError) return { success: false, error: attachmentError };
      }
      try {
        const previous = await gateway.read(draft.id);
        if (previous && !isSubsidyPayment(previous)) return { success: false, error: "Cet identifiant appartient à une écriture historique. Elle n’a pas été modifiée." };
        // Pas d’édition aveugle ni de résurrection d’un versement supprimé avec une ancienne version.
        if (!previous && expectedVersion !== 0) return { success: false, error: "Ce versement n’existe plus. Rechargez la liste des aides." };
        let pieceJointe = previous?.pieceJointe;
        let sourceDocumentSha256: string | undefined;
        if (options.pieceJointe) {
          const { path, sha256 } = await attachmentPath(draft.id, expectedVersion + 1, options.pieceJointe);
          sourceDocumentSha256 = sha256;
          // Un nouvel essai du même fichier réutilise sa pièce jointe déjà confirmée.
          if (previous?.pieceJointe?.storagePath !== path) {
            if (previous && previous.versionSubvention !== expectedVersion) return { success: false, error: CONFLICT };
            const uploaded = await gateway.upload(path, options.pieceJointe);
            if (!uploaded.success || !uploaded.url) return { success: false, error: `Justificatif non envoyé. Le versement n’a pas été enregistré. ${uploaded.error || "Réessayez lorsque la connexion sera rétablie."}` };
            pieceJointe = { url: uploaded.url, storagePath: path, nom: options.pieceJointe.name };
          }
        }
        const candidate = buildSubsidyPayment(draft, { previous: previous || undefined, pieceJointe, sourceDocumentSha256, now: gateway.now?.() });
        if (previous && comparableSubsidy(previous) === comparableSubsidy(candidate)) return { success: true, data: previous };
        if (previous && previous.versionSubvention !== expectedVersion) return { success: false, error: CONFLICT };
        // Contrôle identique au principe existant : lecture des écritures avant changement de dette.
        // Les autres écritures historiques ne sont pas verrouillées globalement.
        const existing = await gateway.readTransactions();
        const debtError = validateSubsidyDebtChange(existing, draft.id, candidate);
        if (debtError) return { success: false, error: debtError };
        let conflictError = CONFLICT;
        const result = await gateway.compareAndSet(draft.id, (current) => {
          if (isSubsidyPayment(current) && comparableSubsidy(current) === comparableSubsidy(candidate)) return current;
          if (current && (!isSubsidyPayment(current) || current.versionSubvention !== expectedVersion)) return undefined;
          if (!current && expectedVersion !== 0) {
            conflictError = "Ce versement a été supprimé sur un autre appareil.";
            return undefined;
          }
          return candidate;
        });
        if (!result.committed || !isSubsidyPayment(result.value)) return { success: false, error: conflictError };
        let warning: string | undefined;
        if (previous?.pieceJointe && pieceJointe && previous.pieceJointe.storagePath !== pieceJointe.storagePath) {
          // L’ancien justificatif est conservé jusqu’à la confirmation du nouveau versement.
          try {
            const removed = await gateway.deleteFile(previous.pieceJointe.storagePath);
            if (!removed.success) warning = "Le versement est enregistré. L’ancien justificatif a été conservé par précaution.";
          } catch {
            warning = "Le versement est enregistré. L’ancien justificatif a été conservé par précaution.";
          }
        }
        return { success: true, data: result.value, ...(warning ? { warning } : {}) };
      } catch (error) {
        // En cas de réponse réseau ambiguë, conserver fichier et brouillon : le même identifiant rend le nouvel essai idempotent.
        return { success: false, error: errorMessage(error) };
      }
    },

    async delete(id: string, expectedVersion: number): Promise<SubsidyPaymentResult> {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return { success: false, error: "L’identifiant du versement est invalide." };
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return { success: false, error: "La version du versement est invalide." };
      try {
        const previous = await gateway.read(id);
        if (!previous) return { success: true };
        if (!isSubsidyPayment(previous) || previous.versionSubvention !== expectedVersion) return { success: false, error: CONFLICT };
        const existing = await gateway.readTransactions();
        const debtError = validateSubsidyDebtChange(existing, id, null);
        if (debtError) return { success: false, error: debtError };
        const result = await gateway.compareAndSet(id, (current) => {
          if (!current) return null;
          return isSubsidyPayment(current) && current.versionSubvention === expectedVersion ? null : undefined;
        });
        if (!result.committed) return { success: false, error: CONFLICT };
        let warning: string | undefined;
        if (previous.pieceJointe) {
          try {
            const removed = await gateway.deleteFile(previous.pieceJointe.storagePath);
            if (!removed.success) warning = "Le versement est supprimé. Son justificatif a été conservé par précaution.";
          } catch {
            warning = "Le versement est supprimé. Son justificatif a été conservé par précaution.";
          }
        }
        return { success: true, ...(warning ? { warning } : {}) };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
  };
}

interface RestResult {
  ok: boolean;
  status: number;
  etag: string | null;
  data: unknown;
}
type RestRequest = (path: string, init?: RequestInit) => Promise<RestResult>;
const AMBIGUOUS = "Le serveur n’a pas confirmé l’enregistrement. Le brouillon est conservé : réessayez avec le même brouillon pour vérifier le résultat sans créer de doublon.";

/** Requête bornée, y compris la réception du corps. Aucun envoi différé en file SDK. */
export async function requestSubsidyJson(endpoint: string, init: RequestInit = {}, fetcher: typeof fetch = fetch, timeoutMs = 20_000): Promise<RestResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(endpoint, { ...init, cache: "no-store", signal: controller.signal });
    const data: unknown = await response.json();
    return { ok: response.ok, status: response.status, etag: response.headers.get("ETag"), data };
  } catch {
    // Un PUT peut avoir été accepté avant une réponse perdue ou une interruption.
    throw new Error(AMBIGUOUS);
  } finally {
    clearTimeout(timeout);
  }
}

/** GET ETag / PUT If-Match : transaction REST sur le seul nœud du versement.
 * https://firebase.google.com/docs/reference/rest/database#section-conditional-requests
 */
export function createSubsidyRestCompareAndSet(request: RestRequest): SubsidyPaymentGateway["compareAndSet"] {
  return async (id, change) => {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error("L’identifiant du versement est invalide.");
    const path = `transactions/${id}`;
    let latest: Transaction | null = null;
    // Un conflit 412 est relu, mais jamais réessayé indéfiniment.
    for (let attempt = 0; attempt < 3; attempt++) {
      const read = await request(path, { headers: { "X-Firebase-ETag": "true" } });
      if (!read.ok) throw new Error("Impossible de vérifier la dernière version du versement.");
      if (!read.etag) throw new Error("La version du versement n’a pas pu être vérifiée. Aucun changement n’a été envoyé.");
      latest = read.data === null ? null : { ...(read.data as Transaction), id };
      const next = change(latest);
      if (next === undefined) return { committed: false, value: latest };
      if (JSON.stringify(next) === JSON.stringify(latest)) return { committed: true, value: latest };
      const written = await request(path, { method: "PUT", headers: { "Content-Type": "application/json", "If-Match": read.etag }, body: JSON.stringify(next) });
      if (written.status === 412) continue;
      if (!written.ok) throw new Error(AMBIGUOUS);
      return { committed: true, value: written.data === null ? null : { ...(written.data as Transaction), id } };
    }
    return { committed: false, value: latest };
  };
}

let servicePromise: Promise<ReturnType<typeof createSubsidyPaymentService>> | undefined;

async function getService() {
  if (!servicePromise) {
    servicePromise = (async () => {
      const [{ database, auth }, storage] = await Promise.all([
        import("@/lib/firebase"), import("@/lib/firebase-storage"),
      ]);
      const request: RestRequest = async (path, init = {}) => {
        if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error(OFFLINE);
        const user = auth.currentUser;
        if (!user) throw new Error("Reconnectez-vous avant d’enregistrer un versement.");
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
        return requestSubsidyJson(endpoint, init);
      };
      async function readOnline(path: string) {
        const response = await request(path);
        if (!response.ok) throw new Error("Impossible de vérifier les dernières données. Réessayez lorsque la connexion sera rétablie.");
        return response.data;
      }
      return createSubsidyPaymentService({
        read: async (id) => {
          const value = await readOnline(`transactions/${encodeURIComponent(id)}`);
          return value ? { ...(value as Transaction), id } : null;
        },
        readTransactions: async () => Object.entries((await readOnline("transactions")) || {}).map(([id, value]) => ({ ...(value as Transaction), id })),
        compareAndSet: createSubsidyRestCompareAndSet(request),
        upload: storage.uploadFile,
        deleteFile: storage.deleteFile,
      });
    })();
  }
  return servicePromise;
}

export async function getSubsidyPayment(id: string): Promise<SubsidyPaymentResult> {
  try { return await (await getService()).get(id); } catch (error) { return { success: false, error: errorMessage(error) }; }
}

export async function saveSubsidyPayment(draft: SubsidyDraft, options: SaveSubsidyPaymentOptions = {}): Promise<SubsidyPaymentResult> {
  try { return await (await getService()).save(draft, options); } catch (error) { return { success: false, error: errorMessage(error) }; }
}

export async function deleteSubsidyPayment(id: string, expectedVersion: number): Promise<SubsidyPaymentResult> {
  try { return await (await getService()).delete(id, expectedVersion); } catch (error) { return { success: false, error: errorMessage(error) }; }
}
