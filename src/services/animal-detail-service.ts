import firebaseService from "@/lib/firebase-service";
import { uploadFile, deleteFile } from "@/lib/firebase-storage";

import type { FicheSoin } from "@/store/store";

// ============ Interfaces ============

export interface WeightEntry {
  id: string;
  animalId: string;
  poids: number;
  date: string;
  note?: string;
  dateCreation?: string;
  derniereMAJ?: string;
}

export interface AnimalPhoto {
  id: string;
  animalId: string;
  url: string;
  storagePath: string;
  nom: string;
  description?: string;
  dateCreation?: string;
  derniereMAJ?: string;
}

export interface AnimalDocument {
  id: string;
  animalId: string;
  url: string;
  storagePath: string;
  nom: string;
  type: string;
  taille: number;
  description?: string;
  dateCreation?: string;
  derniereMAJ?: string;
}

export interface HistoryEntry {
  id: string;
  animalId: string;
  date: string;
  sujet: string;
  description?: string;
  categorie?: "reproduction" | string;
  dateCreation?: string;
  derniereMAJ?: string;
}

export interface ChaleurEntry {
  id: string;
  animalId: string;
  date: string;
  note?: string;
  dateCreation?: string;
  derniereMAJ?: string;
}

// ============ Poids ============

const WEIGHTS_PATH = (animalId: string) => `animaux-poids/${animalId}`;

// Helper pour récupérer le dernier poids (pesée la plus récente)
async function updateAnimalLatestWeight(animalId: string) {
  const weightsResult = await firebaseService.getAll<WeightEntry>(WEIGHTS_PATH(animalId));
  if (!weightsResult.success || !weightsResult.data || weightsResult.data.length === 0) {
    // Pas de pesées, on met le poids à undefined
    await firebaseService.update("animaux", animalId, { poids: null });
    return;
  }

  // Trouver la pesée la plus récente
  const sortedWeights = weightsResult.data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const latestWeight = sortedWeights[0];

  // Mettre à jour le poids de l'animal avec la pesée la plus récente
  await firebaseService.update("animaux", animalId, { poids: latestWeight.poids });
}

export async function addWeight(animalId: string, data: { poids: number; date: string; note?: string }) {
  const payload: Record<string, unknown> = { poids: data.poids, date: data.date, animalId };
  if (data.note) payload.note = data.note;
  const result = await firebaseService.create(WEIGHTS_PATH(animalId), payload);
  if (result.success) {
    // Mettre à jour le poids de l'animal avec le dernier poids
    await updateAnimalLatestWeight(animalId);
  }
  return result;
}

export async function updateWeight(animalId: string, weightId: string, data: Record<string, unknown>) {
  const result = await firebaseService.update(WEIGHTS_PATH(animalId), weightId, data);
  if (result.success) {
    // Après modification, recalculer le dernier poids
    await updateAnimalLatestWeight(animalId);
  }
  return result;
}

export async function deleteWeight(animalId: string, weightId: string) {
  const result = await firebaseService.delete(WEIGHTS_PATH(animalId), weightId);
  if (result.success) {
    // Après suppression, recalculer le dernier poids
    await updateAnimalLatestWeight(animalId);
  }
  return result;
}

export function listenWeights(animalId: string, callback: (data: WeightEntry[]) => void) {
  return firebaseService.listen<WeightEntry>(WEIGHTS_PATH(animalId), callback);
}

// ============ Photos ============

const PHOTOS_PATH = (animalId: string) => `animaux-photos/${animalId}`;

export async function addPhoto(animalId: string, file: File, description?: string) {
  const storagePath = `animaux/${animalId}/photos/${Date.now()}_${file.name}`;
  const uploadResult = await uploadFile(storagePath, file);
  if (!uploadResult.success) return uploadResult;

  const payload: Record<string, unknown> = {
    animalId,
    url: uploadResult.url!,
    storagePath,
    nom: file.name,
  };
  if (description) payload.description = description;
  return firebaseService.create(PHOTOS_PATH(animalId), payload);
}

export async function deletePhoto(animalId: string, photoId: string, storagePath: string) {
  await deleteFile(storagePath);
  return firebaseService.delete(PHOTOS_PATH(animalId), photoId);
}

export function listenPhotos(animalId: string, callback: (data: AnimalPhoto[]) => void) {
  return firebaseService.listen<AnimalPhoto>(PHOTOS_PATH(animalId), callback);
}

// ============ Documents ============

const DOCUMENTS_PATH = (animalId: string) => `animaux-documents/${animalId}`;

export async function addDocument(animalId: string, file: File, description?: string) {
  const storagePath = `animaux/${animalId}/documents/${Date.now()}_${file.name}`;
  const uploadResult = await uploadFile(storagePath, file);
  if (!uploadResult.success) return uploadResult;

  const payload: Record<string, unknown> = {
    animalId,
    url: uploadResult.url!,
    storagePath,
    nom: file.name,
    type: file.type,
    taille: file.size,
  };
  if (description) payload.description = description;
  return firebaseService.create(DOCUMENTS_PATH(animalId), payload);
}

export async function deleteDocument(animalId: string, docId: string, storagePath: string) {
  await deleteFile(storagePath);
  return firebaseService.delete(DOCUMENTS_PATH(animalId), docId);
}

export function listenDocuments(animalId: string, callback: (data: AnimalDocument[]) => void) {
  return firebaseService.listen<AnimalDocument>(DOCUMENTS_PATH(animalId), callback);
}

// ============ Historique ============

const HISTORY_PATH = (animalId: string) => `animaux-historique/${animalId}`;

export async function addHistoryEntry(animalId: string, data: { date: string; sujet: string; description?: string }) {
  const payload: Record<string, unknown> = { date: data.date, sujet: data.sujet, animalId };
  if (data.description) payload.description = data.description;
  return firebaseService.create(HISTORY_PATH(animalId), payload);
}

export async function updateHistoryEntry(animalId: string, entryId: string, data: Record<string, unknown>) {
  return firebaseService.update(HISTORY_PATH(animalId), entryId, data);
}

export async function deleteHistoryEntry(animalId: string, entryId: string) {
  return firebaseService.delete(HISTORY_PATH(animalId), entryId);
}

export function listenHistory(animalId: string, callback: (data: HistoryEntry[]) => void) {
  return firebaseService.listen<HistoryEntry>(HISTORY_PATH(animalId), callback);
}

// ============ Fiches Soins (Traitements) ============

const SOINS_PATH = "traitements";

export async function addSoin(
  animalId: string,
  data: { titre: string; description?: string; dateDebut: string },
  file?: File
) {
  const payload: Record<string, unknown> = {
    animalId,
    titre: data.titre,
    dateDebut: data.dateDebut,
    statut: "en_cours",
  };
  if (data.description) payload.description = data.description;

  if (file) {
    const storagePath = `animaux/${animalId}/soins/${Date.now()}_${file.name}`;
    const uploadResult = await uploadFile(storagePath, file);
    if (!uploadResult.success) return uploadResult;
    payload.photoUrl = uploadResult.url!;
    payload.photoStoragePath = storagePath;
    payload.photoNom = file.name;
  }

  return firebaseService.create(SOINS_PATH, payload);
}

export async function updateSoin(
  soinId: string,
  data: Record<string, unknown>,
  file?: File,
  oldStoragePath?: string
) {
  // If a new file is uploaded, handle storage
  if (file) {
    const animalId = data.animalId as string;
    const storagePath = `animaux/${animalId}/soins/${Date.now()}_${file.name}`;
    const uploadResult = await uploadFile(storagePath, file);
    if (!uploadResult.success) return uploadResult;
    // Delete old file if exists
    if (oldStoragePath) {
      await deleteFile(oldStoragePath);
    }
    data.photoUrl = uploadResult.url!;
    data.photoStoragePath = storagePath;
    data.photoNom = file.name;
  }

  return firebaseService.update(SOINS_PATH, soinId, data);
}

export async function cloturerSoin(soinId: string) {
  return firebaseService.update(SOINS_PATH, soinId, {
    statut: "cloture",
    dateFin: new Date().toISOString().split("T")[0],
  });
}

export async function rouvrirSoin(soinId: string) {
  return firebaseService.update(SOINS_PATH, soinId, {
    statut: "en_cours",
    dateFin: null,
  });
}

export async function deleteSoin(soinId: string, storagePath?: string) {
  if (storagePath) {
    await deleteFile(storagePath);
  }
  return firebaseService.delete(SOINS_PATH, soinId);
}

export function listenSoins(animalId: string, callback: (data: FicheSoin[]) => void) {
  return firebaseService.listenWhere<FicheSoin>(SOINS_PATH, "animalId", animalId, callback);
}

// ============ Chaleurs ============

const CHALEURS_PATH = (animalId: string) => `animaux-chaleurs/${animalId}`;

export async function addChaleur(animalId: string, data: { date: string; note?: string }) {
  const payload: Record<string, unknown> = { date: data.date, animalId };
  if (data.note) payload.note = data.note;
  return firebaseService.create(CHALEURS_PATH(animalId), payload);
}

export async function deleteChaleur(animalId: string, chaleurId: string) {
  return firebaseService.delete(CHALEURS_PATH(animalId), chaleurId);
}

export function listenChaleurs(animalId: string, callback: (data: ChaleurEntry[]) => void) {
  return firebaseService.listen<ChaleurEntry>(CHALEURS_PATH(animalId), callback);
}
