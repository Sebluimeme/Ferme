export interface Partiel {
  id: string;
  nom: string;
  surface?: number; // hectares
  description?: string;
  dateCreation?: string;
  derniereMAJ?: string;
  cadastreRef?: string;      // ex: "67001/ZD/0042"
  codeInsee?: string;        // code commune INSEE
  section?: string;          // section cadastrale
  numeroParcelle?: string;   // numéro de parcelle
  geometry?: object;         // GeoJSON polygon (pour affichage futur)
}

export interface ActiviteFourrage {
  id: string;
  typeActivite: "foin" | "ensilage" | "fauche" | "paturage";
  dateActivite: string; // ISO date string
  parcelIds?: string[]; // IDs des partiels concernés (peut être absent si tableau vide en DB)
  nombreBottes?: number;
  poidsTonne?: number;
  notes?: string;
  statut: "en_cours" | "terminee";
  dateCreation?: string;
  derniereMAJ?: string;
}
