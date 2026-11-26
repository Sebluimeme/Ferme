export interface Partiel {
  id: string;
  nom: string;
  type?: "pature" | "fauche"; // classification usage
  surface?: number; // hectares
  description?: string;
  dateCreation?: string;
  derniereMAJ?: string;
  cadastreRef?: string;      // ex: "67001/ZD/0042"
  codeInsee?: string;        // code commune INSEE
  section?: string;          // section cadastrale
  numeroParcelle?: string;   // numéro de parcelle
  geometry?: object;         // GeoJSON polygon
}

export type { OrigineFourrage } from "@/lib/fourrage-calculs";

import type { OrigineFourrage } from "@/lib/fourrage-calculs";

export type FormatBotte = "petite" | "grande";

export interface ActiviteFourrage {
  id: string;
  typeActivite: "foin" | "paille" | "fauche" | "paturage" | "regain";
  dateActivite: string; // ISO date string
  /** Absent sur les anciennes données = récolte (voir origineActivite()). */
  origine?: OrigineFourrage;
  parcelIds?: string[]; // IDs des partiels concernés (peut être absent si tableau vide en DB)
  nombreBottes?: number;
  formatBotte?: FormatBotte; // achats uniquement ; aucune distinction ronde/carrée
  poidsBotteKg?: number;   // poids unitaire en kg (stocké pour traçabilité)
  poidsTonne?: number;
  fournisseur?: string;    // achats uniquement
  prixTotal?: number;      // achats uniquement, en euros
  notes?: string;
  statut: "en_cours" | "terminee";
  dateCreation?: string;
  derniereMAJ?: string;
}

/** Cheptels suivis séparément pour la distribution quotidienne de fourrage. */
export type CheptelDistribution = "ovin" | "bovin";

/** Unité choisie par l'éleveur pour compter ce qui est distribué. */
export type UniteDistribution = "balle" | "botte";

/** Fourrage réellement donné lors d'une distribution. */
export type TypeFourrageDistribution = "foin" | "paille";

/**
 * Une action de distribution indépendante. Plusieurs entrées peuvent concerner
 * le même cheptel le même jour afin de conserver chaque passage dans l'historique.
 */
export interface DistributionFourrage {
  id: string;
  dateDistribution: string; // ISO date (YYYY-MM-DD)
  cheptel: CheptelDistribution;
  unite: UniteDistribution;
  /** Absent sur les anciennes données = foin. */
  typeFourrage?: TypeFourrageDistribution;
  quantite: number;
  notes?: string;
  dateCreation?: string;
  derniereMAJ?: string;
}
