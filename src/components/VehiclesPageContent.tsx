"use client";

import { useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/store";
import VehicleCard from "./VehicleCard";
import VehicleForm from "./VehicleForm";
import Modal, { ConfirmModal } from "./Modal";
import { useToast } from "./Toast";
import {
  createVehicle,
  updateVehicle,
  deleteVehicle,
  searchVehicles,
  filterVehiclesByType,
  filterVehiclesByStatus,
} from "@/services/vehicle-service";
import type { Vehicle, VehicleType, VehicleFormData } from "@/types/vehicle";
import { getVehicleTypeLabel } from "@/lib/vehicle-utils";

export default function VehiclesPageContent() {
  const router = useRouter();
  const { state } = useAppStore();
  const { showToast } = useToast();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; nom: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<VehicleType | "">("");
  const [statusFilter, setStatusFilter] = useState("");

  const formRef = useRef<HTMLFormElement | null>(null);

  // Filtrage des véhicules
  const filteredVehicles = useMemo(() => {
    let filtered = state.vehicles || [];

    // Filtre par type
    filtered = filterVehiclesByType(filtered, typeFilter);

    // Filtre par statut
    filtered = filterVehiclesByStatus(filtered, statusFilter);

    // Recherche
    filtered = searchVehicles(filtered, searchQuery);

    return filtered;
  }, [state.vehicles, typeFilter, statusFilter, searchQuery]);

  const handleAddVehicle = async () => {
    if (!formRef.current) return;

    setLoading(true);
    const formData = new FormData(formRef.current);
    const data = Object.fromEntries(formData.entries()) as unknown as VehicleFormData;

    const result = await createVehicle(data);

    if (result.success) {
      showToast({ type: "success", title: "Véhicule ajouté", message: "Le véhicule a été créé avec succès" });
      setShowAddModal(false);
      formRef.current.reset();
    } else {
      showToast({ type: "error", title: "Erreur", message: result.error || "Impossible de créer le véhicule" });
    }
    setLoading(false);
  };

  const handleEditVehicle = async () => {
    if (!formRef.current || !editVehicle) return;

    setLoading(true);
    const formData = new FormData(formRef.current);
    const data = Object.fromEntries(formData.entries()) as unknown as VehicleFormData;

    const result = await updateVehicle(editVehicle.id, data);

    if (result.success) {
      showToast({ type: "success", title: "Véhicule modifié", message: "Les modifications ont été enregistrées" });
      setEditVehicle(null);
      formRef.current.reset();
    } else {
      showToast({ type: "error", title: "Erreur", message: result.error || "Impossible de modifier le véhicule" });
    }
    setLoading(false);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;

    setLoading(true);
    const result = await deleteVehicle(deleteTarget.id);

    if (result.success) {
      showToast({ type: "success", title: "Véhicule supprimé", message: "Le véhicule a été supprimé avec succès" });
      setDeleteTarget(null);
    } else {
      showToast({ type: "error", title: "Erreur", message: result.error || "Impossible de supprimer le véhicule" });
    }
    setLoading(false);
  };

  const handleVehicleClick = (vehicle: Vehicle) => {
    router.push(`/vehicules/${vehicle.id}`);
  };

  return (
    <>
      {/* En-tête avec recherche et filtres */}
      <div className="mb-6 space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="🔍 Rechercher par nom, plaque, marque, modèle..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as VehicleType | "")}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            >
              <option value="">Tous les types</option>
              <option value="voiture">🚗 {getVehicleTypeLabel("voiture")}</option>
              <option value="moto">🏍️ {getVehicleTypeLabel("moto")}</option>
              <option value="quad">🛺 {getVehicleTypeLabel("quad")}</option>
              <option value="tracteur">🚜 {getVehicleTypeLabel("tracteur")}</option>
              <option value="utilitaire">🚐 {getVehicleTypeLabel("utilitaire")}</option>
              <option value="remorque">🚚 {getVehicleTypeLabel("remorque")}</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            >
              <option value="">Tous les statuts</option>
              <option value="actif">Actif</option>
              <option value="en_reparation">En réparation</option>
              <option value="stocke">Stocké</option>
              <option value="vendu">Vendu</option>
              <option value="reforme">Réformé</option>
            </select>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors whitespace-nowrap"
            >
              + Ajouter un véhicule
            </button>
          </div>
        </div>
      </div>

      {/* Grille de cartes */}
      {filteredVehicles.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🚗</div>
          <p className="text-gray-500 mb-6">
            {searchQuery || typeFilter || statusFilter
              ? "Aucun véhicule ne correspond à votre recherche"
              : "Aucun véhicule enregistré"}
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
          >
            + Ajouter votre premier véhicule
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filteredVehicles.map((vehicle) => (
            <VehicleCard
              key={vehicle.id}
              vehicle={vehicle}
              onEdit={(id) => {
                const v = state.vehicles.find((v) => v.id === id);
                if (v) setEditVehicle(v);
              }}
              onDelete={(id) => {
                const v = state.vehicles.find((v) => v.id === id);
                if (v)
                  setDeleteTarget({
                    id: v.id,
                    nom: v.nom || v.plaqueImmatriculation || `Véhicule ${v.id}`,
                  });
              }}
              onClick={handleVehicleClick}
            />
          ))}
        </div>
      )}

      {/* Modal d'ajout */}
      <Modal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          formRef.current?.reset();
        }}
        title="Ajouter un véhicule"
        size="large"
      >
        <VehicleForm formRef={formRef} />
        <div className="flex gap-2 justify-end mt-6">
          <button
            onClick={() => {
              setShowAddModal(false);
              formRef.current?.reset();
            }}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleAddVehicle}
            disabled={loading}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {loading ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </Modal>

      {/* Modal d'édition */}
      <Modal
        isOpen={!!editVehicle}
        onClose={() => {
          setEditVehicle(null);
          formRef.current?.reset();
        }}
        title="Modifier le véhicule"
        size="large"
      >
        <VehicleForm vehicle={editVehicle} formRef={formRef} />
        <div className="flex gap-2 justify-end mt-6">
          <button
            onClick={() => {
              setEditVehicle(null);
              formRef.current?.reset();
            }}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleEditVehicle}
            disabled={loading}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {loading ? "Enregistrement..." : "Enregistrer les modifications"}
          </button>
        </div>
      </Modal>

      {/* Modal de confirmation de suppression */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        danger
        message={`Êtes-vous sûr de vouloir supprimer le véhicule <strong>${deleteTarget?.nom}</strong> ? Cette action est irréversible.`}
      />
    </>
  );
}
