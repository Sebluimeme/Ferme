// Suivi débit de la source

export type UniteDebit = "L/min" | "L/s" | "m³/h";

export interface ReleverSource {
  id: string;
  date: string;             // YYYY-MM-DD
  debit: number;            // valeur numérique
  unite: UniteDebit;        // unité de mesure
  remarque?: string;
  dateCreation?: string;
  derniereMAJ?: string;
}

export interface ReleverSourceFormData {
  date: string;
  debit: string;
  unite: UniteDebit;
  remarque: string;
}

export const EMPTY_FORM: ReleverSourceFormData = {
  date: new Date().toISOString().split("T")[0],
  debit: "",
  unite: "L/min",
  remarque: "",
};

export function fmtDebit(debit: number, unite: UniteDebit): string {
  return `${debit.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${unite}`;
}

export function computeSourceStats(releves: ReleverSource[]) {
  if (releves.length === 0) {
    return { count: 0, dernierDebit: null, moyenne: 0, min: 0, max: 0 };
  }
  const debits = releves.map((r) => r.debit);
  const sorted = [...releves].sort((a, b) => a.date.localeCompare(b.date));
  return {
    count: releves.length,
    dernierDebit: sorted[sorted.length - 1],
    moyenne: debits.reduce((s, v) => s + v, 0) / debits.length,
    min: Math.min(...debits),
    max: Math.max(...debits),
  };
}
