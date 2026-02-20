/**
 * Service de gestion des véhicules
 * CRUD operations et validation
 */

import { firebaseService, FirebaseResult } from "@/lib/firebase-service";
import type { Vehicle, VehicleFormData, VehicleStats, VehicleType } from "@/types/vehicle";
import type { Composant } from "@/store/store";

const COLLECTION_PATH = "vehicules";

// ==================== Validation ====================

export function validateVehicleData(data: VehicleFormData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validation champs obligatoires
  if (!data.type) {
    errors.push("Le type de véhicule est obligatoire");
  }

  if (!data.statut) {
    errors.push("Le statut est obligatoire");
  }

  // Validation formats numériques
  if (data.kilometrage && isNaN(Number(data.kilometrage))) {
    errors.push("Le kilométrage doit être un nombre valide");
  }

  if (data.heuresUtilisation && isNaN(Number(data.heuresUtilisation))) {
    errors.push("Les heures d'utilisation doivent être un nombre valide");
  }

  if (data.valeurAchat && isNaN(Number(data.valeurAchat))) {
    errors.push("La valeur d'achat doit être un nombre valide");
  }

  if (data.puissance && isNaN(Number(data.puissance))) {
    errors.push("La puissance doit être un nombre valide");
  }

  // Validation dates
  if (data.dateAchat && isNaN(Date.parse(data.dateAchat))) {
    errors.push("La date d'achat n'est pas valide");
  }

  if (data.dateMiseEnCirculation && isNaN(Date.parse(data.dateMiseEnCirculation))) {
    errors.push("La date de mise en circulation n'est pas valide");
  }

  if (data.dateProchainCT && isNaN(Date.parse(data.dateProchainCT))) {
    errors.push("La date du prochain contrôle technique n'est pas valide");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ==================== Transformation des données ====================

/**
 * Supprime les propriétés undefined/null d'un objet
 * Firebase Realtime Database n'accepte pas les valeurs undefined
 */
function removeUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)
  ) as Partial<T>;
}

function formDataToVehicle(formData: VehicleFormData): Partial<Omit<Vehicle, "id" | "dateCreation" | "derniereMAJ">> {
  const raw = {
    type: formData.type,
    marque: formData.marque?.trim() || undefined,
    modele: formData.modele?.trim() || undefined,
    dateMiseEnCirculation: formData.dateMiseEnCirculation || undefined,

    plaqueImmatriculation: formData.plaqueImmatriculation?.trim().toUpperCase() || undefined,

    statut: formData.statut,
    heuresUtilisation: formData.heuresUtilisation ? Number(formData.heuresUtilisation) : undefined,
    kilometrage: formData.kilometrage ? Number(formData.kilometrage) : undefined,

    puissance: formData.puissance ? Number(formData.puissance) : undefined,

    valeurAchat: formData.valeurAchat ? Number(formData.valeurAchat) : undefined,
    dateAchat: formData.dateAchat || undefined,

    dateProchainCT: formData.dateProchainCT || undefined,

    commentaire: formData.commentaire?.trim() || undefined,
  };

  return removeUndefined(raw);
}

// ==================== CRUD Operations ====================

export async function createVehicle(formData: VehicleFormData): Promise<FirebaseResult> {
  // Validation
  const validation = validateVehicleData(formData);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.errors.join(", "),
    };
  }

  // Vérifier unicité de la plaque d'immatriculation si fournie
  if (formData.plaqueImmatriculation) {
    const existing = await firebaseService.getWhere<Vehicle>(
      COLLECTION_PATH,
      "plaqueImmatriculation",
      formData.plaqueImmatriculation.trim().toUpperCase()
    );

    if (existing.success && existing.data && existing.data.length > 0) {
      return {
        success: false,
        error: `Un véhicule avec la plaque ${formData.plaqueImmatriculation} existe déjà`,
      };
    }
  }

  // Transformation des données
  const vehicleData = formDataToVehicle(formData);

  // Ajout timestamps
  const now = new Date().toISOString();
  const dataWithTimestamps = {
    ...vehicleData,
    dateCreation: now,
    derniereMAJ: now,
  };

  // Création dans Firebase
  return await firebaseService.create(COLLECTION_PATH, dataWithTimestamps);
}

export async function updateVehicle(id: string, formData: VehicleFormData): Promise<FirebaseResult> {
  // Validation
  const validation = validateVehicleData(formData);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.errors.join(", "),
    };
  }

  // Vérifier unicité de la plaque si modifiée
  if (formData.plaqueImmatriculation) {
    const existing = await firebaseService.getWhere<Vehicle>(
      COLLECTION_PATH,
      "plaqueImmatriculation",
      formData.plaqueImmatriculation.trim().toUpperCase()
    );

    if (existing.success && existing.data && existing.data.length > 0) {
      // Vérifier que ce n'est pas le même véhicule
      const isDifferentVehicle = existing.data.some((v) => v.id !== id);
      if (isDifferentVehicle) {
        return {
          success: false,
          error: `Un autre véhicule avec la plaque ${formData.plaqueImmatriculation} existe déjà`,
        };
      }
    }
  }

  // Transformation
  const vehicleData = formDataToVehicle(formData);

  // Mise à jour timestamp
  const updates = {
    ...vehicleData,
    derniereMAJ: new Date().toISOString(),
  };

  return await firebaseService.update(COLLECTION_PATH, id, updates);
}

export async function deleteVehicle(id: string): Promise<FirebaseResult> {
  return await firebaseService.delete(COLLECTION_PATH, id);
}

export async function getVehicleById(id: string): Promise<FirebaseResult<Vehicle>> {
  return await firebaseService.getById<Vehicle>(COLLECTION_PATH, id);
}

export async function getAllVehicles(): Promise<FirebaseResult<Vehicle[]>> {
  return await firebaseService.getAll<Vehicle>(COLLECTION_PATH);
}

// ==================== Composants ====================

export async function updateVehicleComposants(vehicleId: string, composants: Composant[]): Promise<FirebaseResult> {
  return await firebaseService.update(COLLECTION_PATH, vehicleId, {
    composants,
    derniereMAJ: new Date().toISOString(),
  });
}

// ==================== Recherche et Filtrage ====================

export function searchVehicles(vehicles: Vehicle[], query: string): Vehicle[] {
  const lowerQuery = query.toLowerCase().trim();

  if (!lowerQuery) return vehicles;

  return vehicles.filter((vehicle) => {
    return (
      vehicle.plaqueImmatriculation?.toLowerCase().includes(lowerQuery) ||
      vehicle.marque?.toLowerCase().includes(lowerQuery) ||
      vehicle.modele?.toLowerCase().includes(lowerQuery) ||
      vehicle.type?.toLowerCase().includes(lowerQuery)
    );
  });
}

export function filterVehiclesByType(vehicles: Vehicle[], type: VehicleType | ""): Vehicle[] {
  if (!type) return vehicles;
  return vehicles.filter((v) => v.type === type);
}

export function filterVehiclesByStatus(vehicles: Vehicle[], status: string): Vehicle[] {
  if (!status) return vehicles;
  return vehicles.filter((v) => v.statut === status);
}

// ==================== Statistiques ====================

export function getVehicleStats(vehicles: Vehicle[]): VehicleStats {
  const actifs = vehicles.filter((v) => v.statut === "actif");

  const parType: Record<VehicleType, number> = {
    voiture: 0,
    moto: 0,
    quad: 0,
    tracteur: 0,
    utilitaire: 0,
    remorque: 0,
  };

  const parStatut: Record<string, number> = {
    actif: 0,
    en_reparation: 0,
    stocke: 0,
    vendu: 0,
    reforme: 0,
  };

  let valeurTotale = 0;

  actifs.forEach((vehicle) => {
    if (vehicle.type) {
      parType[vehicle.type] = (parType[vehicle.type] || 0) + 1;
    }
    if (vehicle.statut) {
      parStatut[vehicle.statut] = (parStatut[vehicle.statut] || 0) + 1;
    }
    if (vehicle.valeurAchat) {
      valeurTotale += vehicle.valeurAchat;
    }
  });

  return {
    totalVehicules: actifs.length,
    parType,
    parStatut,
    valeurTotale,
    prochainEntretiens: 0, // Sera calculé avec les données de maintenance
  };
}

// ==================== Helpers ====================

export function getVehicleDisplayName(vehicle: Vehicle): string {
  if (vehicle.plaqueImmatriculation) return vehicle.plaqueImmatriculation;
  if (vehicle.marque && vehicle.modele) return `${vehicle.marque} ${vehicle.modele}`;
  if (vehicle.marque) return vehicle.marque;
  return `Véhicule #${vehicle.id.substring(0, 6)}`;
}

export function isCTExpired(vehicle: Vehicle): boolean {
  if (!vehicle.dateProchainCT) return false;
  return new Date(vehicle.dateProchainCT) < new Date();
}

export function getDaysUntilExpiration(dateString: string): number {
  const expDate = new Date(dateString);
  const now = new Date();
  const diffTime = expDate.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
