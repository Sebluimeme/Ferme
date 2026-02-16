"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppStore } from "@/store/store";
import { useToast } from "@/components/Toast";
import Modal, { ConfirmModal } from "@/components/Modal";
import AnimalCard from "@/components/AnimalCard";
import AnimalForm from "@/components/AnimalForm";
import KpiCard from "@/components/KpiCard";
import { getAnimalIcon, getAnimalLabel, getAnimalBgColor } from "@/lib/utils";
import {
  createAnimal,
  deleteAnimal as deleteAnimalService,
  searchAnimaux,
  getAnimalStats,
  validateAnimalData,
  type AnimalFormData,
} from "@/services/animal-service";
import type { Animal } from "@/store/store";

function groupByBirthYear(animaux: Animal[]): { year: string; animals: Animal[] }[] {
  const groups: Record<string, Animal[]> = {};

  for (const animal of animaux) {
    let year = "Non renseigné";
    if (animal.dateNaissance) {
      const date = new Date(animal.dateNaissance);
      if (!isNaN(date.getTime())) {
        year = date.getFullYear().toString();
      }
    }
    if (!groups[year]) groups[year] = [];
    groups[year].push(animal);
  }

  // Trier par année décroissante, "Non renseigné" à la fin
  return Object.entries(groups)
    .sort(([a], [b]) => {
      if (a === "Non renseigné") return 1;
      if (b === "Non renseigné") return -1;
      return parseInt(b) - parseInt(a);
    })
    .map(([year, animals]) => ({ year, animals }));
}

export default function AnimauxPageContent() {
  const { state } = useAppStore();
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);

  const [currentFilter, setCurrentFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Animal | null>(null);
  const [saving, setSaving] = useState(false);

  // Appliquer le filtre depuis l'URL au chargement
  useEffect(() => {
    const typeParam = searchParams.get("type");
    if (typeParam && ["ovin", "bovin", "caprin", "porcin"].includes(typeParam)) {
      setCurrentFilter(typeParam);
    }
  }, [searchParams]);

  const animaux = state.animaux;
  const stats = useMemo(() => getAnimalStats(animaux), [animaux]);

  const filteredAnimaux = useMemo(() => {
    let filtered = animaux.filter((a) => a.statut === "actif");
    if (currentFilter) filtered = filtered.filter((a) => a.type === currentFilter);
    if (searchQuery) filtered = searchAnimaux(filtered, searchQuery);
    return filtered;
  }, [animaux, currentFilter, searchQuery]);

  const groupedAnimaux = useMemo(() => {
    if (!currentFilter) return null;
    return groupByBirthYear(filteredAnimaux);
  }, [filteredAnimaux, currentFilter]);

  const handleSave = async () => {
    if (!formRef.current || saving) return;
    const formData = new FormData(formRef.current);
    const data = Object.fromEntries(formData.entries()) as unknown as AnimalFormData;

    const validation = validateAnimalData(data);
    if (!validation.valid) {
      showToast({ type: "error", title: "Erreur de validation", message: validation.errors.join(", ") });
      return;
    }

    setSaving(true);
    try {
      const result = await createAnimal(data);
      if (result.success) {
        showToast({ type: "success", title: "Succès", message: "Animal ajouté avec succès" });
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
    const animal = animaux.find((a) => a.id === id);
    if (animal) setDeleteTarget(animal);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteAnimalService(deleteTarget.id);
    if (result.success) {
      showToast({ type: "success", title: "Succès", message: "Animal supprimé avec succès" });
    } else {
      showToast({ type: "error", title: "Erreur", message: result.error || "Erreur lors de la suppression" });
    }
    setDeleteTarget(null);
  };

  const renderAnimalCard = (animal: Animal) => (
    <AnimalCard
      key={animal.id}
      animal={animal}
      onEdit={() => router.push(`/animaux/${animal.id}`)}
      onDelete={handleDelete}
      onClick={(a) => router.push(`/animaux/${a.id}`)}
    />
  );

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
        <h1 className="text-3xl font-bold m-0">🐾 Mes Animaux</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-primary to-secondary rounded-lg hover:from-primary-dark hover:to-secondary-dark transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
        >
          + Ajouter un animal
        </button>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        <KpiCard
          label="Total"
          value={stats.actifs}
          onClick={() => setCurrentFilter(null)}
          borderColorClass={!currentFilter ? "border-l-primary" : undefined}
        />
        <KpiCard
          label={`${getAnimalIcon("ovin")} Ovins`}
          value={stats.parType.ovins}
          borderColorClass="border-l-ovin"
          valueColorClass="text-ovin"
          onClick={() => setCurrentFilter(currentFilter === "ovin" ? null : "ovin")}
        />
        <KpiCard
          label={`${getAnimalIcon("bovin")} Bovins`}
          value={stats.parType.bovins}
          borderColorClass="border-l-bovin"
          valueColorClass="text-bovin"
          onClick={() => setCurrentFilter(currentFilter === "bovin" ? null : "bovin")}
        />
        <KpiCard
          label={`${getAnimalIcon("caprin")} Caprins`}
          value={stats.parType.caprins}
          borderColorClass="border-l-caprin"
          valueColorClass="text-caprin"
          onClick={() => setCurrentFilter(currentFilter === "caprin" ? null : "caprin")}
        />
        <KpiCard
          label={`${getAnimalIcon("porcin")} Porcins`}
          value={stats.parType.porcins}
          borderColorClass="border-l-porcin"
          valueColorClass="text-porcin"
          onClick={() => setCurrentFilter(currentFilter === "porcin" ? null : "porcin")}
        />
      </div>

      {/* Titre de la vue filtrée par espèce */}
      {currentFilter && (
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setCurrentFilter(null)}
            className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-all cursor-pointer"
            title="Retour à tous les animaux"
          >
            ←
          </button>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{getAnimalIcon(currentFilter)}</span>
            <h2 className="text-xl sm:text-2xl font-bold m-0">
              {getAnimalLabel(currentFilter)}s
            </h2>
            <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${getAnimalBgColor(currentFilter)}`}>
              {filteredAnimaux.length}
            </span>
          </div>
        </div>
      )}

      {/* Barre de recherche */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-8">
        <div className="flex gap-4 flex-wrap">
          <input
            type="text"
            placeholder="🔍 Rechercher par numéro, nom ou race..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
          {!currentFilter && (
            <select
              value={currentFilter || ""}
              onChange={(e) => setCurrentFilter(e.target.value || null)}
              className="w-[150px] px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 cursor-pointer"
            >
              <option value="">Tous les types</option>
              <option value="ovin">🐑 Ovins</option>
              <option value="bovin">🐄 Bovins</option>
              <option value="caprin">🐐 Caprins</option>
              <option value="porcin">🐷 Porcins</option>
            </select>
          )}
        </div>
      </div>

      {/* Liste des animaux */}
      {filteredAnimaux.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🐾</div>
          <h3 className="text-2xl font-semibold mb-2">Aucun animal</h3>
          <p className="text-gray-600 mb-6">
            {currentFilter
              ? `Aucun ${getAnimalLabel(currentFilter).toLowerCase()} trouvé`
              : "Commencez par ajouter votre premier animal"}
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-primary to-secondary rounded-lg hover:from-primary-dark hover:to-secondary-dark cursor-pointer"
          >
            + Ajouter un animal
          </button>
        </div>
      ) : currentFilter && groupedAnimaux ? (
        /* Vue par espèce : groupé par année de naissance */
        <div className="space-y-8">
          {groupedAnimaux.map(({ year, animals }) => (
            <div key={year}>
              {/* Séparateur année */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg shadow-sm">
                  <span className="text-lg">📅</span>
                  <span className="font-bold text-lg">
                    {year === "Non renseigné" ? year : `Nés en ${year}`}
                  </span>
                  <span className="text-sm text-gray-500">
                    ({animals.length} {animals.length > 1 ? "animaux" : "animal"})
                  </span>
                </div>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              {/* Grille des animaux de cette année */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {animals.map(renderAnimalCard)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Vue normale : tous les animaux */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredAnimaux.map(renderAnimalCard)}
        </div>
      )}

      {/* Modal ajout */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="+ Ajouter un animal"
        size="large"
      >
        <AnimalForm formRef={formRef} />
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
        title="Supprimer l'animal"
        message={`Voulez-vous vraiment supprimer l'animal <strong>${deleteTarget?.nom || deleteTarget?.numeroBoucle || "cet animal"}</strong> ?<br><br>Cette action est irréversible.`}
        confirmText="Supprimer"
        cancelText="Annuler"
        danger
      />
    </div>
  );
}
