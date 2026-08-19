/**
 * Calculs purs du fourrage — sans Firebase ni React, testables via
 * `node scripts/test-fourrage-calculs.mjs`.
 *
 * Règle centrale : une activité peut être une récolte (fauchée sur la ferme)
 * ou un achat (bottes achetées à l'extérieur). Les achats entrent dans le
 * stock et l'objectif foin, mais JAMAIS dans les rendements, les analytics
 * par parcelle ou les courbes de récolte.
 *
 * Compatibilité ancienne données : une activité sans champ `origine` est
 * considérée comme une récolte.
 */

export type OrigineFourrage = "recolte" | "achat";

/** Forme minimale d'activité attendue par les calculs (structurelle, pas d'import). */
export interface ActiviteCalc {
  typeActivite: string;
  dateActivite: string;
  parcelIds?: string[] | null;
  nombreBottes?: number | null;
  poidsTonne?: number | null;
  origine?: string | null;
}

/** Forme minimale de parcelle attendue par les calculs. */
export interface PartielCalc {
  id: string;
  surface?: number | null;
}

// ==================== Origine ====================

/** Origine effective : tout ce qui n'est pas explicitement "achat" est une récolte. */
export function origineActivite(activite: ActiviteCalc): OrigineFourrage {
  return activite.origine === "achat" ? "achat" : "recolte";
}

export function estAchat(activite: ActiviteCalc): boolean {
  return origineActivite(activite) === "achat";
}

export function estRecolte(activite: ActiviteCalc): boolean {
  return origineActivite(activite) === "recolte";
}

/** Les seules activités autorisées dans les rendements et courbes de récolte. */
export function filtrerRecoltes<T extends ActiviteCalc>(activites: T[]): T[] {
  return activites.filter(estRecolte);
}

export function filtrerAchats<T extends ActiviteCalc>(activites: T[]): T[] {
  return activites.filter(estAchat);
}

// ==================== Agrégats simples ====================

export function totalTonnes(activites: ActiviteCalc[]): number {
  return activites.reduce((sum, a) => sum + (a.poidsTonne ?? 0), 0);
}

export function totalBottes(activites: ActiviteCalc[]): number {
  return activites.reduce((sum, a) => sum + (a.nombreBottes ?? 0), 0);
}

export function anneeActivite(activite: ActiviteCalc): number | null {
  const annee = Number.parseInt((activite.dateActivite ?? "").slice(0, 4), 10);
  return Number.isNaN(annee) ? null : annee;
}

/** Récoltes d'un type donné (foin, regain, ...) — achats exclus par construction. */
export function recoltesDeType<T extends ActiviteCalc>(activites: T[], type: string): T[] {
  return activites.filter((a) => a.typeActivite === type && estRecolte(a));
}

// ==================== Stock foin (récolté + acheté) ====================

export interface StockFoin {
  recolteT: number;
  acheteT: number;
  totalT: number;
  bottesRecoltees: number;
  bottesAchetees: number;
}

/**
 * Stock de foin disponible : récoltes + achats.
 * `annee` optionnelle pour ne compter que la saison en cours.
 */
export function stockFoin(activites: ActiviteCalc[], annee?: number): StockFoin {
  const foins = activites.filter(
    (a) => a.typeActivite === "foin" && (annee === undefined || anneeActivite(a) === annee)
  );
  const recoltes = filtrerRecoltes(foins);
  const achats = filtrerAchats(foins);
  const recolteT = totalTonnes(recoltes);
  const acheteT = totalTonnes(achats);
  return {
    recolteT,
    acheteT,
    totalT: recolteT + acheteT,
    bottesRecoltees: totalBottes(recoltes),
    bottesAchetees: totalBottes(achats),
  };
}

// ==================== Rendements ====================

/** Surface cumulée des parcelles ayant reçu une récolte du type donné. */
export function surfaceRecolteeParType(partiels: PartielCalc[], activites: ActiviteCalc[], type: string): number {
  const ids = new Set(recoltesDeType(activites, type).flatMap((a) => a.parcelIds ?? []));
  return partiels
    .filter((p) => ids.has(p.id) && p.surface != null)
    .reduce((sum, p) => sum + (p.surface ?? 0), 0);
}

/** Rendement moyen t/ha d'un type de récolte, ou null si non calculable. */
export function rendementMoyen(partiels: PartielCalc[], activites: ActiviteCalc[], type: string): number | null {
  const totalT = totalTonnes(recoltesDeType(activites, type));
  const surface = surfaceRecolteeParType(partiels, activites, type);
  return surface > 0 && totalT > 0 ? totalT / surface : null;
}

export interface RendementParcelle<P extends PartielCalc> {
  parcelle: P;
  totalT: number;
  foinT: number;
  regainT: number;
  rdt: number;
}

/**
 * Rendement par parcelle — uniquement les récoltes rattachées à une seule
 * parcelle. Les achats n'ont pas de parcelle et sont exclus deux fois.
 */
export function rendementParParcelle<P extends PartielCalc>(
  partiels: P[],
  activites: ActiviteCalc[]
): RendementParcelle<P>[] {
  const foins = recoltesDeType(activites, "foin");
  const regains = recoltesDeType(activites, "regain");

  const surParcelle = (list: ActiviteCalc[], id: string) =>
    list.filter((a) => a.parcelIds?.length === 1 && a.parcelIds[0] === id);

  return partiels
    .filter((p) => p.surface != null && p.surface > 0)
    .map((p) => {
      const foinT = totalTonnes(surParcelle(foins, p.id));
      const regainT = totalTonnes(surParcelle(regains, p.id));
      const totalT = foinT + regainT;
      if (totalT <= 0) return null;
      return { parcelle: p, totalT, foinT, regainT, rdt: totalT / p.surface! };
    })
    .filter((r): r is RendementParcelle<P> => r !== null);
}

// ==================== Courbe mensuelle des récoltes ====================

export interface PointMensuel {
  mois: string;
  foin: number | null;
  regain: number | null;
}

/** Tonnages récoltés par mois pour une année — achats exclus. */
export function donneesMensuellesRecoltes(
  activites: ActiviteCalc[],
  annee: number,
  moisLabels: string[]
): PointMensuel[] {
  const foins = recoltesDeType(activites, "foin");
  const regains = recoltesDeType(activites, "regain");

  const cumulMois = (list: ActiviteCalc[], idx: number) =>
    totalTonnes(
      list.filter((a) => {
        const d = new Date(a.dateActivite);
        return !Number.isNaN(d.getTime()) && d.getMonth() === idx && d.getFullYear() === annee;
      })
    );

  return moisLabels.map((mois, idx) => {
    const foin = cumulMois(foins, idx);
    const regain = cumulMois(regains, idx);
    return { mois, foin: foin || null, regain: regain || null };
  });
}

// ==================== Distribution quotidienne (consommation) ====================

/**
 * Forme minimale d'une entrée de distribution attendue par les calculs
 * (structurelle, pas d'import — même logique que ActiviteCalc ci-dessus).
 */
export interface DistributionCalc {
  dateDistribution: string; // ISO date (YYYY-MM-DD)
  cheptel: string;
  unite: string;
  quantite: number;
}

export function distributionsDuCheptel<T extends DistributionCalc>(distributions: T[], cheptel: string): T[] {
  return distributions.filter((d) => d.cheptel === cheptel);
}

/** Entrée existante pour un cheptel à une date donnée (une seule par jour). */
export function distributionDuJour<T extends DistributionCalc>(
  distributions: T[],
  cheptel: string,
  date: string
): T | undefined {
  return distributions.find((d) => d.cheptel === cheptel && d.dateDistribution === date);
}

/**
 * Dernière unité (balle/botte) choisie pour ce cheptel — la plus récente par
 * date de distribution, puis par date de dernière MAJ en cas d'égalité.
 * `null` si aucune distribution enregistrée pour ce cheptel (l'appelant retombe
 * alors sur une unité par défaut).
 */
export function derniereUniteCheptel<T extends DistributionCalc>(distributions: T[], cheptel: string): string | null {
  const du = distributionsDuCheptel(distributions, cheptel);
  if (du.length === 0) return null;
  const plusRecente = [...du].sort((a, b) => b.dateDistribution.localeCompare(a.dateDistribution))[0];
  return plusRecente.unite;
}

/** Total distribué pour un cheptel, toutes unités confondues (unités mélangées si l'éleveur en change). */
export function totalDistribueCheptel<T extends DistributionCalc>(distributions: T[], cheptel: string): number {
  return distributionsDuCheptel(distributions, cheptel).reduce((sum, d) => sum + (d.quantite ?? 0), 0);
}

/** Total distribué pour un cheptel sur une période [depuis, jusque] incluse (dates ISO). */
export function totalDistribuePeriode<T extends DistributionCalc>(
  distributions: T[],
  cheptel: string,
  depuis: string,
  jusque: string
): number {
  return distributionsDuCheptel(distributions, cheptel)
    .filter((d) => d.dateDistribution >= depuis && d.dateDistribution <= jusque)
    .reduce((sum, d) => sum + (d.quantite ?? 0), 0);
}
