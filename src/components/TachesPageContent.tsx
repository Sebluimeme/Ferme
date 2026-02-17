"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { useAppStore } from "@/store/store";
import { useToast } from "@/components/Toast";
import Modal, { ConfirmModal } from "@/components/Modal";
import TaskForm from "@/components/TaskForm";
import TaskNotificationBanner from "@/components/TaskNotificationBanner";
import KpiCard from "@/components/KpiCard";
import { scheduleTaskNotifications, isNotificationSupported, getNotificationPermission } from "@/services/notification-service";
import { formatDate } from "@/lib/utils";
import { getAnimalIcon } from "@/lib/utils";
import { getVehicleIcon } from "@/lib/vehicle-utils";
import {
  createTask,
  updateTask,
  deleteTask as deleteTaskService,
  toggleTaskStatus,
  uploadTaskPhoto,
  deleteTaskPhoto,
  searchTasks,
  sortTasksByEcheance,
  getTaskStats,
  isTaskOverdue,
  isTaskDueSoon,
  getDaysUntilDue,
  validateTaskData,
} from "@/services/task-service";
import type { Task, TaskFormData, TaskStatus } from "@/types/task";

function getPrioriteLabel(priorite: string): string {
  const labels: Record<string, string> = { haute: "🔴 Haute", moyenne: "🟡 Moyenne", basse: "🟢 Basse" };
  return labels[priorite] || priorite;
}

function getStatutLabel(statut: string): string {
  const labels: Record<string, string> = { a_faire: "A faire", en_cours: "En cours", terminee: "Terminée" };
  return labels[statut] || statut;
}

function getStatutBadgeClass(statut: string): string {
  const classes: Record<string, string> = {
    a_faire: "bg-gray-100 text-gray-700",
    en_cours: "bg-blue-100 text-blue-700",
    terminee: "bg-green-100 text-green-700",
  };
  return classes[statut] || "bg-gray-100 text-gray-700";
}

function getEcheanceBadge(task: Task): { label: string; className: string } | null {
  if (!task.dateEcheance || task.statut === "terminee") return null;
  const days = getDaysUntilDue(task);
  if (days === null) return null;

  if (days < 0) {
    return {
      label: `En retard (${Math.abs(days)}j)`,
      className: "bg-red-100 text-red-700",
    };
  }
  if (days === 0) {
    return { label: "Aujourd'hui", className: "bg-red-100 text-red-700" };
  }
  if (days <= 3) {
    return { label: `Dans ${days}j`, className: "bg-amber-100 text-amber-700" };
  }
  return { label: `Dans ${days}j`, className: "bg-gray-100 text-gray-600" };
}

export default function TachesPageContent() {
  const { state } = useAppStore();
  const { showToast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const photoFileRef = useRef<File | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);

  const [statusFilter, setStatusFilter] = useState<TaskStatus | "toutes">("a_faire");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Task | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [saving, setSaving] = useState(false);

  const taches = state.taches;
  const stats = useMemo(() => getTaskStats(taches), [taches]);

  // Programmer les notifications pour les tâches
  useEffect(() => {
    if (!isNotificationSupported()) return;
    if (getNotificationPermission() !== "granted") return;

    const cleanup = scheduleTaskNotifications(taches);
    return cleanup;
  }, [taches]);

  const filteredTaches = useMemo(() => {
    let filtered = taches;
    if (statusFilter !== "toutes") {
      filtered = filtered.filter((t) => t.statut === statusFilter);
    }
    if (searchQuery) {
      filtered = searchTasks(filtered, searchQuery);
    }
    return sortTasksByEcheance(filtered);
  }, [taches, statusFilter, searchQuery]);

  const handleSave = async () => {
    if (!formRef.current || saving) return;
    const formData = new FormData(formRef.current);
    const data = Object.fromEntries(formData.entries()) as unknown as TaskFormData;

    const validation = validateTaskData(data);
    if (!validation.valid) {
      showToast({ type: "error", title: "Erreur de validation", message: validation.errors.join(", ") });
      return;
    }

    setSaving(true);
    try {
      if (editTarget) {
        const result = await updateTask(editTarget.id, data);
        if (result.success) {
          // Supprimer l'ancienne photo si demandé
          if (photoRemoved && editTarget.photoStoragePath) {
            await deleteTaskPhoto(editTarget.id, editTarget.photoStoragePath);
          }
          // Upload nouvelle photo si sélectionnée
          if (photoFileRef.current) {
            // Supprimer l'ancienne photo si une nouvelle est ajoutée
            if (editTarget.photoStoragePath && !photoRemoved) {
              await deleteTaskPhoto(editTarget.id, editTarget.photoStoragePath);
            }
            await uploadTaskPhoto(editTarget.id, photoFileRef.current);
            photoFileRef.current = null;
          }
          setPhotoRemoved(false);
          showToast({ type: "success", title: "Succès", message: "Tâche modifiée avec succès" });
          setEditTarget(null);
        } else {
          showToast({ type: "error", title: "Erreur", message: result.error || "Une erreur est survenue" });
        }
      } else {
        const result = await createTask(data);
        if (result.success) {
          // Upload photo si sélectionnée
          if (photoFileRef.current && result.id) {
            await uploadTaskPhoto(result.id, photoFileRef.current);
            photoFileRef.current = null;
          }
          showToast({ type: "success", title: "Succès", message: "Tâche ajoutée avec succès" });
          setShowAddModal(false);
        } else {
          showToast({ type: "error", title: "Erreur", message: result.error || "Une erreur est survenue" });
        }
      }
    } catch {
      showToast({ type: "error", title: "Erreur", message: "Impossible de contacter la base de données." });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (task: Task) => {
    const nextStatut: TaskStatus = task.statut === "terminee" ? "a_faire" : "terminee";
    const result = await toggleTaskStatus(task, nextStatut);
    if (result.success) {
      showToast({
        type: "success",
        title: nextStatut === "terminee" ? "Tâche terminée !" : "Tâche réouverte",
      });
    } else {
      showToast({ type: "error", title: "Erreur", message: result.error || "Erreur lors de la mise à jour" });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    // Supprimer la photo associée si elle existe
    if (deleteTarget.photoStoragePath) {
      await deleteTaskPhoto(deleteTarget.id, deleteTarget.photoStoragePath);
    }
    const result = await deleteTaskService(deleteTarget.id);
    if (result.success) {
      showToast({ type: "success", title: "Succès", message: "Tâche supprimée" });
    } else {
      showToast({ type: "error", title: "Erreur", message: result.error || "Erreur lors de la suppression" });
    }
    setDeleteTarget(null);
  };

  return (
    <div className="fade-in">
      {/* Notification Banner */}
      <TaskNotificationBanner />

      {/* Header */}
      <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold m-0">📋 Tâches</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-primary to-secondary rounded-lg hover:from-primary-dark hover:to-secondary-dark transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
        >
          + Nouvelle tâche
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <KpiCard
          label="Total"
          value={stats.total}
          borderColorClass="border-l-primary"
          onClick={() => setStatusFilter("toutes")}
        />
        <KpiCard
          label="A faire"
          value={stats.aFaire}
          borderColorClass="border-l-gray-400"
          valueColorClass="text-gray-600"
          onClick={() => setStatusFilter("a_faire")}
        />
        <KpiCard
          label="En cours"
          value={stats.enCours}
          borderColorClass="border-l-blue-500"
          valueColorClass="text-blue-500"
          onClick={() => setStatusFilter("en_cours")}
        />
        <KpiCard
          label="Terminées"
          value={stats.terminees}
          borderColorClass="border-l-green-500"
          valueColorClass="text-green-500"
          onClick={() => setStatusFilter("terminee")}
        />
        <KpiCard
          label="En retard"
          value={stats.enRetard}
          borderColorClass="border-l-red-500"
          valueColorClass="text-red-500"
        />
      </div>

      {/* Filtres par statut */}
      <div className="flex gap-2 flex-wrap mb-4">
        {([
          { key: "toutes" as const, label: "Toutes", count: stats.total },
          { key: "a_faire" as const, label: "A faire", count: stats.aFaire },
          { key: "en_cours" as const, label: "En cours", count: stats.enCours },
          { key: "terminee" as const, label: "Terminées", count: stats.terminees },
        ]).map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all cursor-pointer border ${
              statusFilter === key
                ? "bg-primary text-white border-primary"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:bg-gray-50"
            }`}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      {/* Barre de recherche */}
      <div className="bg-white rounded-lg shadow-sm p-3 mb-6">
        <input
          type="text"
          placeholder="🔍 Rechercher par titre, description, catégorie..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
      </div>

      {/* Liste des tâches */}
      {filteredTaches.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">📋</div>
          <h3 className="text-2xl font-semibold mb-2">Aucune tâche</h3>
          <p className="text-gray-600 mb-6">
            {searchQuery ? "Aucune tâche trouvée pour cette recherche" : "Commencez par ajouter votre première tâche"}
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-primary to-secondary rounded-lg hover:from-primary-dark hover:to-secondary-dark cursor-pointer"
          >
            + Nouvelle tâche
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTaches.map((task) => {
            const overdue = isTaskOverdue(task);
            const dueSoon = isTaskDueSoon(task);
            const echeanceBadge = getEcheanceBadge(task);
            const isDone = task.statut === "terminee";

            return (
              <div
                key={task.id}
                className={`bg-white rounded-lg shadow-sm border-l-4 transition-all hover:shadow-md ${
                  isDone
                    ? "border-l-green-400 opacity-70"
                    : overdue
                    ? "border-l-red-500"
                    : dueSoon
                    ? "border-l-amber-500"
                    : task.priorite === "haute"
                    ? "border-l-red-400"
                    : task.priorite === "moyenne"
                    ? "border-l-amber-400"
                    : "border-l-green-400"
                }`}
              >
                <div className="px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    {/* Checkbox */}
                    <button
                      onClick={() => handleToggleStatus(task)}
                      className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 cursor-pointer transition-all ${
                        isDone
                          ? "bg-green-500 border-green-500 text-white"
                          : "border-gray-300 hover:border-primary bg-white"
                      }`}
                    >
                      {isDone && <span className="text-xs">✓</span>}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className={`text-sm font-semibold m-0 ${isDone ? "line-through text-gray-400" : "text-gray-900"}`}>
                          {task.titre}
                        </h3>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getStatutBadgeClass(task.statut)}`}>
                          {getStatutLabel(task.statut)}
                        </span>
                        {echeanceBadge && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${echeanceBadge.className}`}>
                            {echeanceBadge.label}
                          </span>
                        )}
                      </div>

                      {task.description && (
                        <p className={`text-xs mb-1.5 ${isDone ? "text-gray-300" : "text-gray-600"}`}>
                          {task.description}
                        </p>
                      )}

                      {task.photoUrl && (
                        <div className="mb-1.5">
                          <img
                            src={task.photoUrl}
                            alt="Photo jointe"
                            className="w-16 h-16 object-cover rounded-md border border-gray-200"
                          />
                        </div>
                      )}

                      <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500">
                        <span>{getPrioriteLabel(task.priorite)}</span>
                        {task.dateEcheance && (
                          <span>📅 {formatDate(task.dateEcheance)}</span>
                        )}
                        {task.categorie && (
                          <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
                            {task.categorie}
                          </span>
                        )}
                        {task.assigneA && (
                          <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                            👤 {task.assigneA}
                          </span>
                        )}
                        {task.animalId && task.animalNom && (
                          <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                            {getAnimalIcon("")} {task.animalNom}
                          </span>
                        )}
                        {task.vehiculeId && task.vehiculeNom && (
                          <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                            {getVehicleIcon("voiture")} {task.vehiculeNom}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setEditTarget(task)}
                        className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all cursor-pointer"
                        title="Modifier"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => setDeleteTarget(task)}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                        title="Supprimer"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal ajout */}
      <Modal
        isOpen={showAddModal}
        onClose={() => { setShowAddModal(false); photoFileRef.current = null; }}
        title="+ Nouvelle tâche"
        size="large"
      >
        <TaskForm formRef={formRef} photoFileRef={photoFileRef} />
        <div className="flex gap-3 justify-end mt-6">
          <button
            onClick={() => setShowAddModal(false)}
            className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 cursor-pointer"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-primary to-secondary rounded-lg hover:from-primary-dark hover:to-secondary-dark cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Enregistrement..." : "Ajouter"}
          </button>
        </div>
      </Modal>

      {/* Modal édition */}
      <Modal
        isOpen={!!editTarget}
        onClose={() => { setEditTarget(null); photoFileRef.current = null; }}
        title="Modifier la tâche"
        size="large"
      >
        {editTarget && <TaskForm task={editTarget} formRef={formRef} photoFileRef={photoFileRef} onPhotoRemoved={() => setPhotoRemoved(true)} />}
        <div className="flex gap-3 justify-end mt-6">
          <button
            onClick={() => setEditTarget(null)}
            className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 cursor-pointer"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-primary to-secondary rounded-lg hover:from-primary-dark hover:to-secondary-dark cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </Modal>

      {/* Modal suppression */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Supprimer la tâche"
        message={`Voulez-vous vraiment supprimer la tâche <strong>${deleteTarget?.titre || "cette tâche"}</strong> ?<br><br>Cette action est irréversible.`}
        confirmText="Supprimer"
        cancelText="Annuler"
        danger
      />
    </div>
  );
}
