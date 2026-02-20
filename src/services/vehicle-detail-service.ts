/**
 * Service de gestion des détails des véhicules
 * Maintenance, Photos, Documents, Consommation
 */

import { firebaseService, FirebaseResult } from "@/lib/firebase-service";
import { uploadFile, deleteFile, StorageResult } from "@/lib/firebase-storage";
import type {
  MaintenanceEntry,
  MaintenanceFormData,
  VehiclePhoto,
  VehicleDocument,
  FuelEntry,
  FuelFormData,
  MaintenanceAlert,
  Vehicle,
  PartUsed,
  MeterReading,
  MeterReadingFormData,
} from "@/types/vehicle";
import type { Unsubscribe } from "firebase/database";

// ==================== MAINTENANCE / ENTRETIEN ====================

const MAINTENANCE_PATH = "vehicules-maintenance";

export function validateMaintenanceData(data: MaintenanceFormData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validation numérique (aucun champ n'est obligatoire)
  if (data.kilometrageEffectue && isNaN(Number(data.kilometrageEffectue))) {
    errors.push("Le kilométrage doit être un nombre valide");
  }
  if (data.heuresEffectuees && isNaN(Number(data.heuresEffectuees))) {
    errors.push("Les heures doivent être un nombre valide");
  }
  if (data.prochainKm && isNaN(Number(data.prochainKm))) {
    errors.push("Le prochain kilométrage doit être un nombre valide");
  }
  if (data.prochainesHeures && isNaN(Number(data.prochainesHeures))) {
    errors.push("Les prochaines heures doivent être un nombre valide");
  }
  if (data.coutTotal && isNaN(Number(data.coutTotal))) {
    errors.push("Le coût doit être un nombre valide");
  }

  return { valid: errors.length === 0, errors };
}

function formDataToMaintenance(
  vehicleId: string,
  formData: MaintenanceFormData,
  pieces?: PartUsed[]
): Omit<MaintenanceEntry, "id" | "dateCreation" | "derniereMAJ"> {
  const coutTotal = formData.coutTotal ? Number(formData.coutTotal) : undefined;

  return {
    vehicleId,
    type: formData.type || undefined,
    titre: formData.titre?.trim() || undefined,
    description: formData.description?.trim() || undefined,
    statut: formData.statut || "termine",

    dateEffectuee: formData.dateEffectuee || undefined,
    kilometrageEffectue: formData.kilometrageEffectue ? Number(formData.kilometrageEffectue) : undefined,
    heuresEffectuees: formData.heuresEffectuees ? Number(formData.heuresEffectuees) : undefined,

    prochainKm: formData.prochainKm ? Number(formData.prochainKm) : undefined,
    prochaineDate: formData.prochaineDate || undefined,
    prochainesHeures: formData.prochainesHeures ? Number(formData.prochainesHeures) : undefined,

    garage: formData.garage?.trim() || undefined,

    pieces: pieces || undefined,
    coutTotal,
  };
}

export async function addMaintenance(
  vehicleId: string,
  formData: MaintenanceFormData,
  pieces?: PartUsed[]
): Promise<FirebaseResult> {
  const validation = validateMaintenanceData(formData);
  if (!validation.valid) {
    return { success: false, error: validation.errors.join(", ") };
  }

  const maintenanceData = formDataToMaintenance(vehicleId, formData, pieces);
  const now = new Date().toISOString();

  return await firebaseService.create(MAINTENANCE_PATH, {
    ...maintenanceData,
    dateCreation: now,
    derniereMAJ: now,
  });
}

export async function updateMaintenance(
  maintenanceId: string,
  vehicleId: string,
  formData: MaintenanceFormData,
  pieces?: PartUsed[]
): Promise<FirebaseResult> {
  const validation = validateMaintenanceData(formData);
  if (!validation.valid) {
    return { success: false, error: validation.errors.join(", ") };
  }

  const maintenanceData = formDataToMaintenance(vehicleId, formData, pieces);

  return await firebaseService.update(MAINTENANCE_PATH, maintenanceId, {
    ...maintenanceData,
    derniereMAJ: new Date().toISOString(),
  });
}

export async function deleteMaintenance(maintenanceId: string): Promise<FirebaseResult> {
  return await firebaseService.delete(MAINTENANCE_PATH, maintenanceId);
}

export async function uploadMaintenanceFacture(maintenanceId: string, vehicleId: string, file: File): Promise<FirebaseResult> {
  const storagePath = `vehicules/${vehicleId}/factures/${Date.now()}_${file.name}`;
  const uploadResult: StorageResult = await uploadFile(storagePath, file);
  if (!uploadResult.success) return { success: false, error: uploadResult.error };

  return firebaseService.update(MAINTENANCE_PATH, maintenanceId, {
    facture: uploadResult.url,
    factureStoragePath: storagePath,
  });
}

export async function deleteMaintenanceFacture(maintenanceId: string, storagePath: string): Promise<FirebaseResult> {
  await deleteFile(storagePath);
  return firebaseService.update(MAINTENANCE_PATH, maintenanceId, {
    facture: null,
    factureStoragePath: null,
  });
}

export function listenMaintenanceEntries(
  vehicleId: string,
  callback: (entries: MaintenanceEntry[]) => void
): Unsubscribe {
  return firebaseService.listenWhere<MaintenanceEntry>(MAINTENANCE_PATH, "vehicleId", vehicleId, callback);
}

// ==================== CALCUL DES ALERTES MAINTENANCE ====================

export function calculateMaintenanceAlerts(
  vehicles: Vehicle[],
  allMaintenance: MaintenanceEntry[],
  allReadings?: MeterReading[]
): MaintenanceAlert[] {
  const alerts: MaintenanceAlert[] = [];
  const now = new Date();

  vehicles.forEach((vehicle) => {
    if (vehicle.statut !== "actif") return;

    const vehicleMaintenance = allMaintenance.filter((m) => m.vehicleId === vehicle.id);

    vehicleMaintenance.forEach((maintenance) => {
      if (maintenance.statut !== "planifie" && maintenance.statut !== "termine") return;

      // Alerte basée sur la date
      if (maintenance.prochaineDate) {
        const targetDate = new Date(maintenance.prochaineDate);
        const diffTime = targetDate.getTime() - now.getTime();
        const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (daysRemaining <= 30) {
          alerts.push({
            vehicleId: vehicle.id,
            vehicleNom: vehicle.plaqueImmatriculation || (vehicle.marque && vehicle.modele ? `${vehicle.marque} ${vehicle.modele}` : `Véhicule ${vehicle.id}`),
            maintenanceId: maintenance.id,
            type: maintenance.type,
            titre: maintenance.titre,
            raison: "date",
            dateCible: maintenance.prochaineDate,
            joursRestants: daysRemaining,
            urgent: daysRemaining <= 7 || daysRemaining < 0,
          });
        }
      }

      // Alerte basée sur le kilométrage
      if (maintenance.prochainKm && vehicle.kilometrage) {
        const kmRemaining = maintenance.prochainKm - vehicle.kilometrage;
        if (kmRemaining <= 1000) {
          alerts.push({
            vehicleId: vehicle.id,
            vehicleNom: vehicle.plaqueImmatriculation || (vehicle.marque && vehicle.modele ? `${vehicle.marque} ${vehicle.modele}` : `Véhicule ${vehicle.id}`),
            maintenanceId: maintenance.id,
            type: maintenance.type,
            titre: maintenance.titre,
            raison: "kilometrage",
            valeurActuelle: vehicle.kilometrage,
            valeurCible: maintenance.prochainKm,
            urgent: kmRemaining <= 0,
          });
        }
      }

      // Alerte basée sur les heures
      if (maintenance.prochainesHeures && vehicle.heuresUtilisation) {
        const heuresRemaining = maintenance.prochainesHeures - vehicle.heuresUtilisation;
        if (heuresRemaining <= 50) {
          alerts.push({
            vehicleId: vehicle.id,
            vehicleNom: vehicle.plaqueImmatriculation || (vehicle.marque && vehicle.modele ? `${vehicle.marque} ${vehicle.modele}` : `Véhicule ${vehicle.id}`),
            maintenanceId: maintenance.id,
            type: maintenance.type,
            titre: maintenance.titre,
            raison: "heures",
            valeurActuelle: vehicle.heuresUtilisation,
            valeurCible: maintenance.prochainesHeures,
            urgent: heuresRemaining <= 0,
          });
        }
      }
    });

    if (vehicle.dateProchainCT) {
      const ctDate = new Date(vehicle.dateProchainCT);
      const diffTime = ctDate.getTime() - now.getTime();
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (daysRemaining <= 60) {
        alerts.push({
          vehicleId: vehicle.id,
          vehicleNom: vehicle.plaqueImmatriculation || (vehicle.marque && vehicle.modele ? `${vehicle.marque} ${vehicle.modele}` : `Véhicule ${vehicle.id}`),
          type: "controle_technique",
          titre: "Contrôle technique",
          raison: "date",
          dateCible: vehicle.dateProchainCT,
          joursRestants: daysRemaining,
          urgent: daysRemaining <= 14 || daysRemaining < 0,
        });
      }
    }

    // Alerte rappel de relevé compteur (2x par an = tous les 6 mois)
    if (allReadings) {
      const vehicleReadings = allReadings
        .filter((r) => r.vehicleId === vehicle.id)
        .sort((a, b) => b.date.localeCompare(a.date));

      const lastReading = vehicleReadings[0];
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const needsReading = !lastReading || new Date(lastReading.date) < sixMonthsAgo;

      if (needsReading) {
        const hasKm = vehicle.kilometrage !== undefined && vehicle.kilometrage !== null;
        const hasHeures = vehicle.heuresUtilisation !== undefined && vehicle.heuresUtilisation !== null;
        const label = hasKm && hasHeures ? "km/heures" : hasKm ? "kilométrage" : hasHeures ? "heures" : "km/heures";

        let daysSinceLastReading: number | undefined;
        if (lastReading) {
          const lastDate = new Date(lastReading.date);
          daysSinceLastReading = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        }

        alerts.push({
          vehicleId: vehicle.id,
          vehicleNom: vehicle.plaqueImmatriculation || (vehicle.marque && vehicle.modele ? `${vehicle.marque} ${vehicle.modele}` : `Véhicule ${vehicle.id}`),
          type: "autre",
          titre: `Relevé ${label} à faire`,
          raison: "date",
          joursRestants: lastReading ? -(daysSinceLastReading! - 182) : -182,
          urgent: !lastReading || daysSinceLastReading! > 210,
        });
      }
    }
  });

  // Trier par urgence et date
  return alerts.sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    if (a.joursRestants !== undefined && b.joursRestants !== undefined) {
      return a.joursRestants - b.joursRestants;
    }
    return 0;
  });
}

// ==================== PHOTOS ====================

const PHOTOS_PATH = "vehicules-photos";

export async function addPhoto(
  vehicleId: string,
  file: File,
  description?: string,
  typePhoto?: VehiclePhoto["typePhoto"],
  maintenanceId?: string
): Promise<FirebaseResult> {
  // Upload vers Firebase Storage
  const storagePath = `vehicules/${vehicleId}/photos/${Date.now()}_${file.name}`;
  const uploadResult: StorageResult = await uploadFile(storagePath, file);

  if (!uploadResult.success) {
    return { success: false, error: uploadResult.error };
  }

  // Créer l'entrée dans la DB
  const photoData: Omit<VehiclePhoto, "id"> = {
    vehicleId,
    url: uploadResult.url!,
    storagePath: uploadResult.storagePath!,
    description: description?.trim() || undefined,
    typePhoto: typePhoto || "generale",
    maintenanceId: maintenanceId || undefined,
    dateCreation: new Date().toISOString(),
  };

  return await firebaseService.create(PHOTOS_PATH, photoData);
}

export async function deletePhoto(photoId: string, storagePath: string): Promise<FirebaseResult> {
  // Supprimer du Storage
  await deleteFile(storagePath);

  // Supprimer de la DB
  return await firebaseService.delete(PHOTOS_PATH, photoId);
}

export function listenPhotos(vehicleId: string, callback: (photos: VehiclePhoto[]) => void): Unsubscribe {
  return firebaseService.listenWhere<VehiclePhoto>(PHOTOS_PATH, "vehicleId", vehicleId, callback);
}

// ==================== DOCUMENTS ====================

const DOCUMENTS_PATH = "vehicules-documents";

export async function addDocument(
  vehicleId: string,
  file: File,
  nom: string,
  type: VehicleDocument["type"],
  dateDocument?: string,
  dateExpiration?: string,
  description?: string
): Promise<FirebaseResult> {
  // Upload vers Firebase Storage
  const storagePath = `vehicules/${vehicleId}/documents/${Date.now()}_${file.name}`;
  const uploadResult: StorageResult = await uploadFile(storagePath, file);

  if (!uploadResult.success) {
    return { success: false, error: uploadResult.error };
  }

  // Créer l'entrée dans la DB
  const docData: Omit<VehicleDocument, "id"> = {
    vehicleId,
    nom: nom.trim(),
    type,
    url: uploadResult.url!,
    storagePath: uploadResult.storagePath!,
    dateDocument: dateDocument || undefined,
    dateExpiration: dateExpiration || undefined,
    description: description?.trim() || undefined,
    dateCreation: new Date().toISOString(),
  };

  return await firebaseService.create(DOCUMENTS_PATH, docData);
}

export async function deleteDocument(docId: string, storagePath: string): Promise<FirebaseResult> {
  // Supprimer du Storage
  await deleteFile(storagePath);

  // Supprimer de la DB
  return await firebaseService.delete(DOCUMENTS_PATH, docId);
}

export function listenDocuments(vehicleId: string, callback: (docs: VehicleDocument[]) => void): Unsubscribe {
  return firebaseService.listenWhere<VehicleDocument>(DOCUMENTS_PATH, "vehicleId", vehicleId, callback);
}

// ==================== CONSOMMATION CARBURANT ====================

const FUEL_PATH = "vehicules-carburant";

export function validateFuelData(data: FuelFormData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data.date) errors.push("La date est obligatoire");
  if (!data.litres || isNaN(Number(data.litres)) || Number(data.litres) <= 0) {
    errors.push("Les litres doivent être un nombre positif");
  }
  if (!data.prixLitre || isNaN(Number(data.prixLitre)) || Number(data.prixLitre) <= 0) {
    errors.push("Le prix au litre doit être un nombre positif");
  }
  if (data.kilometrage && isNaN(Number(data.kilometrage))) {
    errors.push("Le kilométrage doit être un nombre valide");
  }
  if (data.heures && isNaN(Number(data.heures))) {
    errors.push("Les heures doivent être un nombre valide");
  }

  return { valid: errors.length === 0, errors };
}

export async function addFuelEntry(vehicleId: string, formData: FuelFormData): Promise<FirebaseResult> {
  const validation = validateFuelData(formData);
  if (!validation.valid) {
    return { success: false, error: validation.errors.join(", ") };
  }

  const litres = Number(formData.litres);
  const prixLitre = Number(formData.prixLitre);

  const fuelData: Omit<FuelEntry, "id"> = {
    vehicleId,
    date: formData.date,
    litres,
    prixLitre,
    coutTotal: litres * prixLitre,
    kilometrage: formData.kilometrage ? Number(formData.kilometrage) : undefined,
    heures: formData.heures ? Number(formData.heures) : undefined,
    stationService: formData.stationService?.trim() || undefined,
    pleinComplet: formData.pleinComplet,
    dateCreation: new Date().toISOString(),
  };

  return await firebaseService.create(FUEL_PATH, fuelData);
}

export async function deleteFuelEntry(fuelId: string): Promise<FirebaseResult> {
  return await firebaseService.delete(FUEL_PATH, fuelId);
}

export function listenFuelEntries(vehicleId: string, callback: (entries: FuelEntry[]) => void): Unsubscribe {
  return firebaseService.listenWhere<FuelEntry>(FUEL_PATH, "vehicleId", vehicleId, callback);
}

// ==================== RELEVÉS COMPTEURS ====================

const METER_READINGS_PATH = "vehicules-releves";

export function validateMeterReadingData(data: MeterReadingFormData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data.type) errors.push("Le type de relevé est obligatoire");
  if (!data.valeur || isNaN(Number(data.valeur)) || Number(data.valeur) < 0) {
    errors.push("La valeur doit être un nombre positif");
  }
  if (!data.date) errors.push("La date est obligatoire");
  return { valid: errors.length === 0, errors };
}

export async function addMeterReading(
  vehicleId: string,
  formData: MeterReadingFormData
): Promise<FirebaseResult> {
  const validation = validateMeterReadingData(formData);
  if (!validation.valid) {
    return { success: false, error: validation.errors.join(", ") };
  }

  const valeur = Number(formData.valeur);

  const readingData: Omit<MeterReading, "id" | "dateCreation"> = {
    vehicleId,
    type: formData.type,
    valeur,
    date: formData.date,
    commentaire: formData.commentaire?.trim() || undefined,
  };

  // Créer le relevé
  const result = await firebaseService.create(METER_READINGS_PATH, readingData);

  if (result.success) {
    // Mettre à jour le compteur du véhicule
    const vehicleUpdate: Record<string, unknown> = {};
    if (formData.type === "kilometrage") {
      vehicleUpdate.kilometrage = valeur;
    } else {
      vehicleUpdate.heuresUtilisation = valeur;
    }
    await firebaseService.update("vehicules", vehicleId, vehicleUpdate);
  }

  return result;
}

export async function deleteMeterReading(readingId: string): Promise<FirebaseResult> {
  return await firebaseService.delete(METER_READINGS_PATH, readingId);
}

export function listenMeterReadings(
  vehicleId: string,
  callback: (readings: MeterReading[]) => void
): Unsubscribe {
  return firebaseService.listenWhere<MeterReading>(METER_READINGS_PATH, "vehicleId", vehicleId, callback);
}

export function listenAllMeterReadings(
  callback: (readings: MeterReading[]) => void
): Unsubscribe {
  return firebaseService.listen<MeterReading>(METER_READINGS_PATH, callback);
}

// Calcul de la consommation moyenne
export function calculateAverageConsumption(fuelEntries: FuelEntry[]): number | null {
  const completeFills = fuelEntries.filter((e) => e.pleinComplet && e.consommation).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (completeFills.length < 2) return null;

  const totalConsumption = completeFills.reduce((sum, entry) => sum + (entry.consommation || 0), 0);
  return totalConsumption / completeFills.length;
}
