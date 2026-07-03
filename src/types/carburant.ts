// Suivi carburant Ecobloc

export interface PleinCarburant {
  id: string;
  date: string;        // YYYY-MM-DD
  litres: number;
  remarque?: string;
  dateCreation?: string;
  derniereMAJ?: string;
}

export interface PleinCarburantFormData {
  date: string;
  litres: string;
  remarque: string;
}

export const EMPTY_FORM: PleinCarburantFormData = {
  date: new Date().toISOString().split("T")[0],
  litres: "",
  remarque: "",
};

export function computeCarburantStats(pleins: PleinCarburant[]) {
  if (pleins.length === 0) {
    return { count: 0, totalLitres: 0, moyenne: 0, dernierPlein: null };
  }
  const sorted = [...pleins].sort((a, b) => a.date.localeCompare(b.date));
  const total = pleins.reduce((s, p) => s + p.litres, 0);
  return {
    count: pleins.length,
    totalLitres: total,
    moyenne: total / pleins.length,
    dernierPlein: sorted[sorted.length - 1],
  };
}

const MOIS_FR = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

// Agrège les litres par mois sur les 12 derniers mois (ou filtrés par année)
export function aggregateByMonth(
  pleins: PleinCarburant[],
  year?: number
): { month: string; label: string; litres: number }[] {
  const targetYear = year ?? new Date().getFullYear();
  const map = new Map<string, number>();

  for (const p of pleins) {
    if (!p.date.startsWith(String(targetYear))) continue;
    const key = p.date.slice(0, 7); // YYYY-MM
    map.set(key, (map.get(key) ?? 0) + p.litres);
  }

  const result: { month: string; label: string; litres: number }[] = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${targetYear}-${String(m).padStart(2, "0")}`;
    result.push({
      month: key,
      label: MOIS_FR[m - 1],
      litres: map.get(key) ?? 0,
    });
  }
  return result;
}
