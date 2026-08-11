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

export interface ActiviteFourrage {
  id: string;
  typeActivite: "foin" | "ensilage" | "fauche" | "paturage" | "regain";
  dateActivite: string; // ISO date string
  /** Absent sur les anciennes données = récolte (voir origineActivite()). */
  origine?: OrigineFourrage;
  parcelIds?: string[]; // IDs des partiels concernés (peut être absent si tableau vide en DB)
  nombreBottes?: number;
  poidsBotteKg?: number;   // poids unitaire en kg (stocké pour traçabilité)
  poidsTonne?: number;
  fournisseur?: string;    // achats uniquement
  prixTotal?: number;      // achats uniquement, en euros
  notes?: string;
  statut: "en_cours" | "terminee";
  dateCreation?: string;
  derniereMAJ?: string;
}
