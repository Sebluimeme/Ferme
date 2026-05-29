export interface Partiel {
  id: string;
  nom: string;
  surface?: number; // hectares
  description?: string;
  dateCreation?: string;
  derniereMAJ?: string;
}

export interface ActiviteFourrage {
  id: string;
  typeActivite: "foin" | "ensilage" | "fauche" | "paturage";
  dateActivite: string; // ISO date string
  parcelIds: string[]; // IDs des partiels concernés
  nombreBottes?: number;
  poidsTonne?: number;
  notes?: string;
  statut: "en_cours" | "terminee";
  dateCreation?: string;
  derniereMAJ?: string;
}
