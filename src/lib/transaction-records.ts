import type { Transaction } from "@/types/comptabilite";

type StoredTransaction = Omit<Transaction, "id"> & { id?: string };

/** La clé RTDB identifie l’écriture, même si un ancien import omet ou répète son champ id. */
export function readTransactionRecords(records: Record<string, StoredTransaction> | null | undefined): Transaction[] {
  return Object.entries(records || {}).map(([id, transaction]) => ({ ...transaction, id }));
}
