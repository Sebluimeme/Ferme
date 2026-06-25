export interface SejourPaturage {
  id: string;
  parcelIds: string[];         // IDs des partiels (un parc peut couvrir plusieurs parcelles)
  typeAnimal: "ovin" | "bovin" | "caprin" | "porcin" | "equin";
  animalIds: string[];        // IDs des animaux individuels (optionnel)
  nombreAnimaux: number;      // nombre total
  dateEntree: string;         // ISO date
  dateSortie?: string;        // ISO date, null si encore en cours
  notes?: string;
  dateCreation?: string;
  derniereMAJ?: string;
}
