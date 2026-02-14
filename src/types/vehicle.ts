/**
 * Types pour la gestion des véhicules et de leur maintenance
 */

// ==================== Types de Véhicules ====================

export type VehicleType = "voiture" | "moto" | "quad" | "tracteur" | "utilitaire" | "remorque";

export type VehicleStatus = "actif" | "en_reparation" | "stocke" | "vendu" | "reforme";

export type FuelType = "essence" | "diesel" | "electrique" | "hybride" | "gpl";

// ==================== Interface Véhicule Principal ====================

export interface Vehicle {
  id: string;                          // ID Firebase auto-généré

  // Identification
  nom?: string;                        // Nom personnalisé (ex: "Tracteur rouge")
  type: VehicleType;                   // Type de véhicule
  marque?: string;                     // Marque (Renault, John Deere, etc.)
  modele?: string;                     // Modèle
  annee?: number;                      // Année de fabrication

  // Immatriculation et numéros
  plaqueImmatriculation?: string;      // Plaque d'immatriculation
  numeroSerie?: string;                // Numéro de série / VIN

  // État et statut
  statut: VehicleStatus;               // État actuel
  heuresUtilisation?: number;          // Heures de fonctionnement (tracteurs, etc.)
  kilometrage?: number;                // Kilométrage actuel

  // Spécifications techniques
  typeCarburant?: FuelType;            // Type de carburant
  capaciteReservoir?: number;          // Capacité en litres
  puissance?: number;                  // Puissance (CV ou kW)

  // Financier
  valeurAchat?: number;                // Prix d'achat
  dateAchat?: string;                  // Date d'achat (ISO format)
  valeurActuelle?: number;             // Valeur estimée actuelle

  // Assurance et documents
  numeroPoliceAssurance?: string;      // Numéro de police d'assurance
  dateExpAssurance?: string;           // Date d'expiration assurance
  dateProchainCT?: string;             // Date prochain contrôle technique

  // Notes
  commentaire?: string;                // Notes diverses

  // Méta-données (auto-générées)
  dateCreation?: string;               // Date de création de la fiche
  derniereMAJ?: string;                // Dernière mise à jour
}

// ==================== Interface Entretien ====================

export type MaintenanceType =
  | "vidange"
  | "filtres"
  | "freins"
  | "pneus"
  | "batterie"
  | "courroie"
  | "climatisation"
  | "controle_technique"
  | "revision"
  | "reparation"
  | "autre";

export type MaintenanceStatus = "planifie" | "en_cours" | "termine" | "annule";

export interface MaintenanceEntry {
  id: string;                          // ID Firebase
  vehicleId: string;                   // Référence au véhicule

  // Informations de base
  type: MaintenanceType;               // Type d'entretien
  titre: string;                       // Titre court (ex: "Vidange moteur")
  description?: string;                // Description détaillée
  statut: MaintenanceStatus;           // État de l'entretien

  // Dates et déclencheurs
  dateEffectuee?: string;              // Date de réalisation (ISO format)
  datePlanifiee?: string;              // Date planifiée
  kilometrageEffectue?: number;        // Km au moment de l'entretien
  heuresEffectuees?: number;           // Heures au moment de l'entretien

  // Prochaine échéance (alertes)
  prochainKm?: number;                 // Prochain entretien à X km
  prochaineDate?: string;              // Prochain entretien à telle date
  prochainesHeures?: number;           // Prochain entretien à X heures

  // Intervalle recommandé
  intervalKm?: number;                 // Intervalle en km (ex: tous les 10000 km)
  intervalMois?: number;               // Intervalle en mois (ex: tous les 12 mois)
  intervalHeures?: number;             // Intervalle en heures (ex: tous les 100h)

  // Prestataire
  garage?: string;                     // Nom du garage/mécanicien

  // Pièces et coûts
  pieces?: PartUsed[];                 // Pièces utilisées
  coutMain?: number;                  // Coût main d'œuvre
  coutPieces?: number;                 // Coût des pièces
  coutTotal?: number;                  // Coût total

  // Documents
  facture?: string;                    // URL de la facture (Firebase Storage)

  // Méta-données
  dateCreation?: string;
  derniereMAJ?: string;
}

// ==================== Pièces détachées ====================

export interface PartUsed {
  nom: string;                         // Nom de la pièce (ex: "Filtre à huile")
  reference?: string;                  // Référence constructeur
  quantite: number;                    // Quantité
  prixUnitaire?: number;               // Prix unitaire
}

// ==================== Consommation Carburant ====================

export interface FuelEntry {
  id: string;
  vehicleId: string;

  date: string;                        // Date du plein (ISO format)
  litres: number;                      // Litres ajoutés
  prixLitre: number;                   // Prix au litre
  coutTotal: number;                   // Coût total

  kilometrage?: number;                // Km au moment du plein
  heures?: number;                     // Heures au moment du plein

  consommation?: number;               // L/100km ou L/h (calculé)

  stationService?: string;             // Nom de la station
  pleinComplet: boolean;               // Plein complet ou partiel

  dateCreation?: string;
}

// ==================== Photos ====================

export interface VehiclePhoto {
  id: string;
  vehicleId: string;

  url: string;                         // URL Firebase Storage
  storagePath: string;                 // Chemin dans Storage (pour suppression)

  description?: string;                // Description de la photo
  typePhoto?: "generale" | "avant_entretien" | "apres_entretien" | "dommage" | "autre";
  maintenanceId?: string;              // Lien vers un entretien si applicable

  dateCreation?: string;
}

// ==================== Documents ====================

export type DocumentType =
  | "carte_grise"
  | "assurance"
  | "controle_technique"
  | "facture_achat"
  | "facture_entretien"
  | "manuel"
  | "autre";

export interface VehicleDocument {
  id: string;
  vehicleId: string;

  nom: string;                         // Nom du document
  type: DocumentType;                  // Type de document

  url: string;                         // URL Firebase Storage
  storagePath: string;                 // Chemin dans Storage

  dateDocument?: string;               // Date du document
  dateExpiration?: string;             // Date d'expiration (assurance, CT)

  description?: string;

  dateCreation?: string;
}

// ==================== Templates d'Entretien ====================

export interface MaintenanceTemplate {
  id: string;
  nom: string;                         // Ex: "Vidange moteur essence"
  type: MaintenanceType;
  description?: string;

  // Intervalles recommandés
  intervalKm?: number;
  intervalMois?: number;
  intervalHeures?: number;

  // Applicable à quels types de véhicules
  applicableTo: VehicleType[];

  // Pièces typiques nécessaires
  piecesTypiques?: string[];           // Liste de noms de pièces
}

// ==================== Formulaires ====================

export interface VehicleFormData {
  nom?: string;
  type: VehicleType;
  marque?: string;
  modele?: string;
  annee?: string;                      // String car vient d'un input

  plaqueImmatriculation?: string;
  numeroSerie?: string;

  statut: VehicleStatus;
  heuresUtilisation?: string;          // String car vient d'un input
  kilometrage?: string;

  typeCarburant?: FuelType;
  capaciteReservoir?: string;
  puissance?: string;

  valeurAchat?: string;
  dateAchat?: string;
  valeurActuelle?: string;

  numeroPoliceAssurance?: string;
  dateExpAssurance?: string;
  dateProchainCT?: string;

  commentaire?: string;
}

export interface MaintenanceFormData {
  type: MaintenanceType;
  titre: string;
  description?: string;
  statut: MaintenanceStatus;

  dateEffectuee?: string;
  datePlanifiee?: string;
  kilometrageEffectue?: string;
  heuresEffectuees?: string;

  prochainKm?: string;
  prochaineDate?: string;
  prochainesHeures?: string;

  intervalKm?: string;
  intervalMois?: string;
  intervalHeures?: string;

  garage?: string;

  coutMain?: string;
  coutPieces?: string;
  coutTotal?: string;
}

export interface FuelFormData {
  date: string;
  litres: string;
  prixLitre: string;
  kilometrage?: string;
  heures?: string;
  stationService?: string;
  pleinComplet: boolean;
}

// ==================== Stats et Dashboard ====================

export interface VehicleStats {
  totalVehicules: number;
  parType: Record<VehicleType, number>;
  parStatut: Record<VehicleStatus, number>;
  valeurTotale: number;
  prochainEntretiens: number;          // Nombre d'entretiens à venir dans les 30 jours
}

export interface MaintenanceAlert {
  vehicleId: string;
  vehicleNom: string;
  maintenanceId?: string;
  type: MaintenanceType;
  titre: string;
  raison: "date" | "kilometrage" | "heures";
  valeurActuelle?: number;             // Km ou heures actuels
  valeurCible?: number;                // Km ou heures du prochain entretien
  dateCible?: string;                  // Date du prochain entretien
  joursRestants?: number;              // Jours avant échéance
  urgent: boolean;                     // Si moins de 7 jours ou dépassé
}
