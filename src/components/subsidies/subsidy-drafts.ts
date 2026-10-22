import type { SubsidyDraft } from "@/types/subsidy";

export type SavedSubsidyDraft = { schema: 1; draft: SubsidyDraft; file: File | null; updatedAt: string };

/** The attachment stays with the draft on this device; nothing is sent automatically. */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error("Stockage local indisponible")); return; }
    const request = indexedDB.open("ferme-subsidy-drafts", 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("drafts")) request.result.createObjectStore("drafts"); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Stockage local temporairement indisponible"));
  });
}

export function isRestorableSubsidyDraft(record: SavedSubsidyDraft | undefined): record is SavedSubsidyDraft {
  const draft = record?.draft;
  return record?.schema === 1 && !!draft
    && [draft.id, draft.date, draft.montant, draft.payeur, draft.production, draft.dispositif, draft.campagne,
      draft.tranche, draft.organisme, draft.reference, draft.remarque, draft.montantReferenceAnnuel,
      draft.documentDate, draft.engagementDebut, draft.engagementFin].every(value => typeof value === "string")
    && (!record.file || record.file instanceof File);
}

export async function readSubsidyDraft(key: string): Promise<SavedSubsidyDraft | undefined> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("drafts", "readonly").objectStore("drafts").get(key);
      request.onsuccess = () => resolve(request.result as SavedSubsidyDraft | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export async function writeSubsidyDraft(key: string, record: SavedSubsidyDraft | null) {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("drafts", "readwrite");
      if (record) transaction.objectStore("drafts").put(record, key);
      else transaction.objectStore("drafts").delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
