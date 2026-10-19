/** Une seule identité pour le compte de la ferme, y compris dans les anciennes écritures. */
export const FARM_ACCOUNT_PAYER = "revolut";
export const KNOWN_PAYERS = ["SY", "BY", FARM_ACCOUNT_PAYER] as const;

/** Les autres identités restent inchangées : aucun rapprochement de personne implicite. */
export function normalizePayer(value: string): string {
  return value.trim().toLowerCase() === FARM_ACCOUNT_PAYER ? FARM_ACCOUNT_PAYER : value;
}

export function samePayer(first: string, second: string): boolean {
  return normalizePayer(first) === normalizePayer(second);
}

/** Déduplique les options, jamais les transactions ni leurs montants. */
export function uniquePayers(values: readonly string[]): string[] {
  return [...new Set(values.filter(value => typeof value === "string" && value.trim()).map(normalizePayer))];
}

export function payerLabel(value: string): string {
  const payer = normalizePayer(value);
  if (payer === "SY") return "Sébastien";
  if (payer === "BY") return "Benjamin";
  if (payer === FARM_ACCOUNT_PAYER) return "Ferme · Revolut";
  return payer;
}
