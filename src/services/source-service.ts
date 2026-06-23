import firebaseService from "@/lib/firebase-service";
import type { ReleverSource, ReleverSourceFormData } from "@/types/source";

const PATH = "releves-source";

function parseFormData(data: ReleverSourceFormData): Omit<ReleverSource, "id" | "dateCreation" | "derniereMAJ"> {
  return {
    date: data.date.trim(),
    debit: parseFloat(data.debit),
    unite: data.unite,
    ...(data.remarque.trim() ? { remarque: data.remarque.trim() } : {}),
  };
}

function validate(data: ReleverSourceFormData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data.date) errors.push("La date est requise");
  if (!data.debit || isNaN(parseFloat(data.debit)) || parseFloat(data.debit) < 0) {
    errors.push("Le débit doit être un nombre positif");
  }
  return { valid: errors.length === 0, errors };
}

export async function createReleve(data: ReleverSourceFormData) {
  const check = validate(data);
  if (!check.valid) return { success: false, error: check.errors.join(", ") };
  return firebaseService.create<Record<string, unknown>>(PATH, parseFormData(data));
}

export async function updateReleve(id: string, data: ReleverSourceFormData) {
  const check = validate(data);
  if (!check.valid) return { success: false, error: check.errors.join(", ") };
  return firebaseService.update(PATH, id, parseFormData(data));
}

export async function deleteReleve(id: string) {
  return firebaseService.delete(PATH, id);
}
