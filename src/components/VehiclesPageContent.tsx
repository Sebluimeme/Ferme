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
  updateVehicleMainPhoto,
  deleteVehicleMainPhoto,
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
  const [statusFilter, setStatusFilter] = useState("actif");

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
    const photoFile = formData.get("photo") as File | null;

    const result = await createVehicle(data);

    if (result.success) {
      // Upload photo principale si fournie
      if (result.id && photoFile && photoFile.size > 0) {
        await updateVehicleMainPhoto(result.id, photoFile);
      }
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
    const photoFile = formData.get("photo") as File | null;
    const clearPhoto = formData.get("clearPhoto") === "1";

    const result = await updateVehicle(editVehicle.id, data);

    if (result.success) {
      if (photoFile && photoFile.size > 0) {
        // Nouvelle photo sélectionnée → upload (et suppression de l'ancienne)
        await updateVehicleMainPhoto(editVehicle.id, photoFile, editVehicle.photoStoragePath);
      } else if (clearPhoto && editVehicle.photoStoragePath) {
        // Utilisateur a supprimé la photo existante
        await deleteVehicleMainPhoto(editVehicle.id, editVehicle.photoStoragePath);
      }
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
    // Supprimer la photo principale si elle existe
    const vehicle = state.vehicles.find((v) => v.id === deleteTarget.id);
    if (vehicle?.photoStoragePath) {
      await deleteVehicleMainPhoto(deleteTarget.id, vehicle.photoStoragePath);
    }

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
    <div className="fade-in">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">🚜 Parc de véhicules</h1>
          <p className="text-stone-400 text-sm mt-0.5">Gérez vos véhicules et leur maintenance</p>
        </div>
      </div>

      {/* Recherche et filtres */}
      <div className="mb-6 space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="🔍 Rechercher par nom, plaque, marque, modèle..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as VehicleType | "")}
              className="px-4 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10 flex-1 md:flex-none min-w-0"
            >
              <option value="">Tous les types</option>
              <option value="voiture">🚗 {getVehicleTypeLabel("voiture")}</option>
              <option value="moto">🏍️ {getVehicleTypeLabel("moto")}</option>
              <option value="quad">🛺 {getVehicleTypeLabel("quad")}</option>
              <option value="tracteur">🚜 {getVehicleTypeLabel("tracteur")}</option>
              <option value="utilitaire">🚐 {getVehicleTypeLabel("utilitaire")}</option>
              <option value="remorque">🚚 {getVehicleTypeLabel("remorque")}</option>
              <option value="engin_tp">🦾 {getVehicleTypeLabel("engin_tp")}</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10 flex-1 md:flex-none min-w-0"
            >
              <option value="">Tous les statuts</option>
              <option value="actif">Actif</option>
              <option value="en_reparation">En réparation</option>
              <option value="stocke">Stocké</option>
              <option value="vendu">Vendu</option>
              <option value="reforme">Réformé</option>
            </select>
            {/* Bouton ajouter */}
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors whitespace-nowrap cursor-pointer"
            >
              + Ajouter un véhicule
            </button>
          </div>
        </div>
      </div>

      {/* Bouton flottant "Ajouter" sur mobile */}
      <button
        onClick={() => setShowAddModal(true)}
        className="md:hidden fixed bottom-6 right-6 z-50 w-14 h-14 bg-brand-600 text-white rounded-full shadow-lg hover:bg-brand-700 transition-colors flex items-center justify-center text-2xl"
        aria-label="Ajouter un véhicule"
      >
        +
      </button>

      {/* Grille de cartes — groupées par catégorie */}
      {filteredVehicles.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🚗</div>
          <p className="text-stone-500 mb-6">
            {searchQuery || typeFilter || statusFilter
              ? "Aucun véhicule ne correspond à votre recherche"
              : "Aucun véhicule enregistré"}
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-6 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
          >
            + Ajouter votre premier véhicule
          </button>
        </div>
      ) : (() => {
        // Ordre d'affichage des catégories
        const categoryOrder: VehicleType[] = ["tracteur", "engin_tp", "utilitaire", "quad", "voiture", "moto", "remorque"];
        const categoryLabels: Record<VehicleType, string> = {
          tracteur: "🚜 Tracteurs",
          engin_tp: "🦾 Engins TP",
          utilitaire: "🚐 Utilitaires",
          quad: "🛺 Quads & SSV",
          voiture: "🚗 Voitures",
          moto: "🏍️ Motos",
          remorque: "🚚 Remorques",
        };

        // Grouper les véhicules par type, en respectant l'ordre
        const grouped = categoryOrder
          .map((type) => ({
            type,
            label: categoryLabels[type],
            vehicles: filteredVehicles.filter((v) => v.type === type),
          }))
          .filter((g) => g.vehicles.length > 0);

        // Véhicules avec type inconnu (sécurité)
        const knownTypes = new Set(categoryOrder);
        const others = filteredVehicles.filter((v) => !knownTypes.has(v.type as VehicleType));
        if (others.length > 0) grouped.push({ type: "utilitaire", label: "Autres", vehicles: others });

        return (
          <div className="flex flex-col gap-8">
            {grouped.map((group) => (
              <div key={group.type}>
                <h2 className="text-sm font-bold text-stone-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                  {group.label}
                  <span className="text-xs font-normal text-stone-400 normal-case tracking-normal">
                    ({group.vehicles.length})
                  </span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {group.vehicles.map((vehicle) => (
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
                            nom: v.plaqueImmatriculation || (v.marque && v.modele ? `${v.marque} ${v.modele}` : `Véhicule ${v.id}`),
                          });
                      }}
                      onClick={handleVehicleClick}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

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
            className="px-4 py-2 bg-stone-100 text-stone-700 rounded-lg hover:bg-stone-200 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleAddVehicle}
            disabled={loading}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
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
            className="px-4 py-2 bg-stone-100 text-stone-700 rounded-lg hover:bg-stone-200 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleEditVehicle}
            disabled={loading}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
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
    </div>
  );
}