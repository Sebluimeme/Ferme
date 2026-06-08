export interface Ruche {
  id: string;
  nom: string;
  emplacement?: string;
  dateInstallation?: string;
  notes?: string;
  statut: "active" | "inactive" | "perdue";
  dateCreation?: string;
  derniereMAJ?: string;
}

export interface RecolteMiel {
  id: string;
  rucheId?: string;
  dateRecolte: string;
  poidsKg: number;
  type?: "printemps" | "ete" | "automne" | "hiver" | "toutes_fleurs" | "acacia" | "lavande" | "tilleul" | "autre";
  notes?: string;
  dateCreation?: string;
  derniereMAJ?: string;
}
