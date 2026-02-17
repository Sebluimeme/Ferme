import firebaseService from "@/lib/firebase-service";
import { uploadFile, deleteFile } from "@/lib/firebase-storage";
import type { Task, TaskFormData, TaskStatus } from "@/types/task";

const PATH = "taches";

export function validateTaskData(data: TaskFormData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data.titre || data.titre.trim() === "") errors.push("Le titre est obligatoire");
  if (!data.priorite || !["haute", "moyenne", "basse"].includes(data.priorite)) {
    errors.push("La priorité est obligatoire");
  }
  if (!data.statut || !["a_faire", "en_cours", "terminee"].includes(data.statut)) {
    errors.push("Le statut est obligatoire");
  }
  if (data.dateEcheance) {
    const date = new Date(data.dateEcheance);
    if (isNaN(date.getTime())) errors.push("Date d'échéance invalide");
  }
  return { valid: errors.length === 0, errors };
}

export async function createTask(data: TaskFormData) {
  const validation = validateTaskData(data);
  if (!validation.valid) return { success: false, error: validation.errors.join(", ") };

  const taskData: Record<string, unknown> = { ...data };
  // Nettoyer les champs vides
  if (!taskData.description) delete taskData.description;
  if (!taskData.categorie) delete taskData.categorie;
  if (!taskData.assigneA) delete taskData.assigneA;
  if (!taskData.dateEcheance) delete taskData.dateEcheance;
  if (!taskData.animalId) {
    delete taskData.animalId;
    delete taskData.animalNom;
  }
  if (!taskData.vehiculeId) {
    delete taskData.vehiculeId;
    delete taskData.vehiculeNom;
  }

  return firebaseService.create(PATH, taskData);
}

export async function updateTask(id: string, data: Partial<TaskFormData>) {
  const updates: Record<string, unknown> = { ...data };
  if (data.statut === "terminee") {
    updates.dateTerminee = new Date().toISOString();
  }
  return firebaseService.update(PATH, id, updates);
}

export async function toggleTaskStatus(task: Task, newStatut: TaskStatus) {
  const updates: Record<string, unknown> = { statut: newStatut };
  if (newStatut === "terminee") {
    updates.dateTerminee = new Date().toISOString();
  } else {
    updates.dateTerminee = null;
  }
  return firebaseService.update(PATH, task.id, updates);
}

export async function uploadTaskPhoto(taskId: string, file: File) {
  const storagePath = `taches/${taskId}/photos/${Date.now()}_${file.name}`;
  const uploadResult = await uploadFile(storagePath, file);
  if (!uploadResult.success) return uploadResult;

  return firebaseService.update(PATH, taskId, {
    photoUrl: uploadResult.url,
    photoStoragePath: storagePath,
  });
}

export async function deleteTaskPhoto(taskId: string, storagePath: string) {
  await deleteFile(storagePath);
  return firebaseService.update(PATH, taskId, {
    photoUrl: null,
    photoStoragePath: null,
  });
}

export async function deleteTask(id: string) {
  return firebaseService.delete(PATH, id);
}

export function searchTasks(tasks: Task[], query: string): Task[] {
  const lower = query.toLowerCase();
  return tasks.filter(
    (t) =>
      t.titre.toLowerCase().includes(lower) ||
      t.description?.toLowerCase().includes(lower) ||
      t.categorie?.toLowerCase().includes(lower) ||
      t.assigneA?.toLowerCase().includes(lower) ||
      t.animalNom?.toLowerCase().includes(lower) ||
      t.vehiculeNom?.toLowerCase().includes(lower)
  );
}

/**
 * Trie les tâches : échéance la plus proche en premier, sans échéance à la fin
 */
export function sortTasksByEcheance(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    // Tâches terminées toujours à la fin
    if (a.statut === "terminee" && b.statut !== "terminee") return 1;
    if (b.statut === "terminee" && a.statut !== "terminee") return -1;

    // Priorité haute en premier si pas de date d'échéance
    const dateA = a.dateEcheance ? new Date(a.dateEcheance).getTime() : Infinity;
    const dateB = b.dateEcheance ? new Date(b.dateEcheance).getTime() : Infinity;

    if (dateA !== dateB) return dateA - dateB;

    // À échéance égale, priorité haute d'abord
    const prioriteOrder = { haute: 0, moyenne: 1, basse: 2 };
    return prioriteOrder[a.priorite] - prioriteOrder[b.priorite];
  });
}

/**
 * Retourne les tâches urgentes pour le dashboard
 * (non terminées, triées par échéance)
 */
export function getUrgentTasks(tasks: Task[], limit = 5): Task[] {
  const activeTasks = tasks.filter((t) => t.statut !== "terminee");
  return sortTasksByEcheance(activeTasks).slice(0, limit);
}

/**
 * Calcule si une tâche est en retard
 */
export function isTaskOverdue(task: Task): boolean {
  if (!task.dateEcheance || task.statut === "terminee") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const echeance = new Date(task.dateEcheance);
  echeance.setHours(0, 0, 0, 0);
  return echeance < today;
}

/**
 * Calcule si une tâche arrive à échéance bientôt (dans les 3 jours)
 */
export function isTaskDueSoon(task: Task): boolean {
  if (!task.dateEcheance || task.statut === "terminee") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const echeance = new Date(task.dateEcheance);
  echeance.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((echeance.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= 3;
}

/**
 * Retourne les jours restants avant l'échéance
 */
export function getDaysUntilDue(task: Task): number | null {
  if (!task.dateEcheance) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const echeance = new Date(task.dateEcheance);
  echeance.setHours(0, 0, 0, 0);
  return Math.ceil((echeance.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function getTaskStats(tasks: Task[]) {
  return {
    total: tasks.length,
    aFaire: tasks.filter((t) => t.statut === "a_faire").length,
    enCours: tasks.filter((t) => t.statut === "en_cours").length,
    terminees: tasks.filter((t) => t.statut === "terminee").length,
    enRetard: tasks.filter((t) => isTaskOverdue(t)).length,
  };
}
