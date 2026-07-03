import firebaseService from "@/lib/firebase-service";
import type { PleinCarburant, PleinCarburantFormData } from "@/types/carburant";

const PATH = "carburant-pleins";

function parseFormData(
  data: PleinCarburantFormData
): Omit<PleinCarburant, "id" | "dateCreation" | "derniereMAJ"> {
  return {
    date: data.date.trim(),
    litres: parseFloat(data.litres),
    ...(data.remarque.trim() ? { remarque: data.remarque.trim() } : {}),
  };
}

function validate(data: PleinCarburantFormData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data.date) errors.push("La date est requise");
  if (!data.litres || isNaN(parseFloat(data.litres)) || parseFloat(data.litres) <= 0) {
    errors.push("Le nombre de litres doit être un nombre positif");
  }
  return { valid: errors.length === 0, errors };
}

export async function createPlein(data: PleinCarburantFormData) {
  const check = validate(data);
  if (!check.valid) return { success: false, error: check.errors.join(", ") };
  return firebaseService.create<Record<string, unknown>>(PATH, parseFormData(data));
}

export async function updatePlein(id: string, data: PleinCarburantFormData) {
  const check = validate(data);
  if (!check.valid) return { success: false, error: check.errors.join(", ") };
  return firebaseService.update(PATH, id, parseFormData(data));
}

export async function deletePlein(id: string) {
  return firebaseService.delete(PATH, id);
}
