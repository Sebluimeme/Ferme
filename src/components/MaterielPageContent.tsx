"use client";

import { useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/store";
import { useToast } from "@/components/Toast";
import Modal, { ConfirmModal } from "@/components/Modal";
import MaterielCard from "@/components/MaterielCard";
import MaterielForm from "@/components/MaterielForm";
import KpiCard from "@/components/KpiCard";
import {
  createMateriel,
  deleteMateriel as deleteMaterielService,
  searchMateriels,
  getMaterielStats,
  validateMaterielData,
  type MaterielFormData,
} from "@/services/materiel-service";
import type { Materiel } from "@/store/store";

export default function MaterielPageContent() {
  const { state } = useAppStore();
  const { showToast } = useToast();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const [currentFilter, setCurrentFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Materiel | null>(null);
  const [saving, setSaving] = useState(false);

  const materiels = state.materiels;
  const stats = useMemo(() => getMaterielStats(materiels), [materiels]);

  const filteredMateriels = useMemo(() => {
    let filtered = materiels;
    if (currentFilter) filtered = filtered.filter((m) => m.type === currentFilter);
    if (searchQuery) filtered = searchMateriels(filtered, searchQuery);
    return filtered;
  }, [materiels, currentFilter, searchQuery]);

  const handleSave = async () => {
    if (!formRef.current || saving) return;
    const formData = new FormData(formRef.current);
    const data = Object.fromEntries(formData.entries()) as unknown as MaterielFormData;

    const validation = validateMaterielData(data);
    if (!validation.valid) {
      showToast({ type: "error", title: "Erreur de validation", message: validation.errors.join(", ") });
      return;
    }

    setSaving(true);
    try {
      const result = await createMateriel(data);
      if (result.success) {
        showToast({ type: "success", title: "Succès", message: "Matériel ajouté avec succès" });
        setShowAddModal(false);
      } else {
        showToast({ type: "error", title: "Erreur", message: result.error || "Une erreur est survenue" });
      }
    } catch {
      showToast({ type: "error", title: "Erreur", message: "Impossible de contacter la base de données. Vérifiez votre connexion." });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    const materiel = materiels.find((m) => m.id === id);
    if (materiel) setDeleteTarget(materiel);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteMaterielService(deleteTarget.id);
    if (result.success) {
      showToast({ type: "success", title: "Succès", message: "Matériel supprimé avec succès" });
    } else {
      showToast({ type: "error", title: "Erreur", message: result.error || "Erreur lors de la suppression" });
    }
    setDeleteTarget(null);
  };

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
        <h1 className="text-3xl font-bold m-0">🚜 Mon Matériel</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-primary to-secondary rounded-lg hover:from-primary-dark hover:to-secondary-dark transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
        >
          + Ajouter du matériel
        </button>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <KpiCard label="Total" value={stats.actifs} onClick={() => setCurrentFilter(null)} />
        <KpiCard label="🚜 Véhicules" value={stats.parType.vehicules} borderColorClass="border-l-blue-500" valueColorClass="text-blue-500" onClick={() => setCurrentFilter("vehicule")} />
        <KpiCard label="🔧 Outils" value={stats.parType.outils} borderColorClass="border-l-amber-500" valueColorClass="text-amber-500" onClick={() => setCurrentFilter("outil")} />
        <KpiCard label="⚙️ Machines" value={stats.parType.machines} borderColorClass="border-l-purple-500" valueColorClass="text-purple-500" onClick={() => setCurrentFilter("machine")} />
        <KpiCard label="🧰 Autres" value={stats.parType.autres} borderColorClass="border-l-gray-500" valueColorClass="text-gray-500" onClick={() => setCurrentFilter("autre")} />
        <KpiCard label="🔴 En panne" value={stats.enPanne} borderColorClass="border-l-red-500" valueColorClass="text-red-500" />
      </div>

      {/* Barre de recherche et filtres */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-8">
        <div className="flex gap-4 flex-wrap">
          <input
            type="text"
            placeholder="🔍 Rechercher par nom, marque, modèle..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 min-w-[250px] px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
          <select
            value={currentFilter || ""}
            onChange={(e) => setCurrentFilter(e.target.value || null)}
            className="w-[150px] px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 cursor-pointer"
          >
            <option value="">Tous les types</option>
            <option value="vehicule">🚜 Véhicules</option>
            <option value="outil">🔧 Outils</option>
            <option value="machine">⚙️ Machines</option>
            <option value="autre">🧰 Autres</option>
          </select>
        </div>
      </div>

      {/* Liste du matériel */}
      {filteredMateriels.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🚜</div>
          <h3 className="text-2xl font-semibold mb-2">Aucun matériel</h3>
          <p className="text-gray-600 mb-6">Commencez par ajouter votre premier équipement</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-primary to-secondary rounded-lg hover:from-primary-dark hover:to-secondary-dark cursor-pointer"
          >
            + Ajouter du matériel
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredMateriels.map((materiel) => (
            <MaterielCard
              key={materiel.id}
              materiel={materiel}
              onEdit={() => router.push(`/materiel/${materiel.id}`)}
              onDelete={handleDelete}
              onClick={(m) => router.push(`/materiel/${m.id}`)}
            />
          ))}
        </div>
      )}

      {/* Modal ajout */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="+ Ajouter du matériel"
        size="large"
      >
        <MaterielForm formRef={formRef} />
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

      {/* Modal suppression */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Supprimer le matériel"
        message={`Voulez-vous vraiment supprimer <strong>${deleteTarget?.nom}</strong> ?<br><br>Cette action est irréversible.`}
        confirmText="Supprimer"
        cancelText="Annuler"
        danger
      />
    </div>
  );
}
