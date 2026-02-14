"use client";

import { useState, useRef, useMemo } from "react";
import { useAppStore } from "@/store/store";
import { useToast } from "@/components/Toast";
import Modal, { ConfirmModal } from "@/components/Modal";
import AnimalCard from "@/components/AnimalCard";
import AnimalForm from "@/components/AnimalForm";
import KpiCard from "@/components/KpiCard";
import { getAnimalIcon, formatAge, formatNumber } from "@/lib/utils";
import {
  createAnimal,
  updateAnimal,
  deleteAnimal as deleteAnimalService,
  getAnimal,
  searchAnimaux,
  getAnimalStats,
  validateAnimalData,
  type AnimalFormData,
} from "@/services/animal-service";
import type { Animal } from "@/store/store";

export default function AnimauxPage() {
  const { state } = useAppStore();
  const { showToast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);

  const [currentFilter, setCurrentFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editAnimal, setEditAnimal] = useState<Animal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Animal | null>(null);
  const [detailAnimal, setDetailAnimal] = useState<Animal | null>(null);
  const [saving, setSaving] = useState(false);

  const animaux = state.animaux;
  const stats = useMemo(() => getAnimalStats(animaux), [animaux]);

  const filteredAnimaux = useMemo(() => {
    let filtered = animaux.filter((a) => a.statut === "actif");
    if (currentFilter) filtered = filtered.filter((a) => a.type === currentFilter);
    if (searchQuery) filtered = searchAnimaux(filtered, searchQuery);
    return filtered;
  }, [animaux, currentFilter, searchQuery]);

  const handleSave = async (isEdit: boolean) => {
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
      const result = isEdit && editAnimal
        ? await updateAnimal(editAnimal.id, data)
        : await createAnimal(data);

      if (result.success) {
        showToast({ type: "success", title: "Succès", message: isEdit ? "Animal modifié avec succès" : "Animal ajouté avec succès" });
        setShowAddModal(false);
        setEditAnimal(null);
      } else {
        showToast({ type: "error", title: "Erreur", message: result.error || "Une erreur est survenue" });
      }
    } catch {
      showToast({ type: "error", title: "Erreur", message: "Impossible de contacter la base de données. Vérifiez votre connexion." });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (id: string) => {
    const result = await getAnimal(id);
    if (result.success && result.data) {
      setEditAnimal(result.data);
    } else {
      showToast({ type: "error", title: "Erreur", message: "Animal introuvable" });
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
        <KpiCard label="Total" value={stats.actifs} onClick={() => setCurrentFilter(null)} />
        <KpiCard label={`${getAnimalIcon("ovin")} Ovins`} value={stats.parType.ovins} borderColorClass="border-l-ovin" valueColorClass="text-ovin" onClick={() => setCurrentFilter("ovin")} />
        <KpiCard label={`${getAnimalIcon("bovin")} Bovins`} value={stats.parType.bovins} borderColorClass="border-l-bovin" valueColorClass="text-bovin" onClick={() => setCurrentFilter("bovin")} />
        <KpiCard label={`${getAnimalIcon("caprin")} Caprins`} value={stats.parType.caprins} borderColorClass="border-l-caprin" valueColorClass="text-caprin" onClick={() => setCurrentFilter("caprin")} />
        <KpiCard label={`${getAnimalIcon("porcin")} Porcins`} value={stats.parType.porcins} borderColorClass="border-l-porcin" valueColorClass="text-porcin" onClick={() => setCurrentFilter("porcin")} />
      </div>

      {/* Barre de recherche et filtres */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-8">
        <div className="flex gap-4 flex-wrap">
          <input
            type="text"
            placeholder="🔍 Rechercher par numéro, nom ou race..."
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
            <option value="ovin">🐑 Ovins</option>
            <option value="bovin">🐄 Bovins</option>
            <option value="caprin">🐐 Caprins</option>
            <option value="porcin">🐷 Porcins</option>
          </select>
        </div>
      </div>

      {/* Liste des animaux */}
      {filteredAnimaux.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🐾</div>
          <h3 className="text-2xl font-semibold mb-2">Aucun animal</h3>
          <p className="text-gray-600 mb-6">Commencez par ajouter votre premier animal</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-primary to-secondary rounded-lg hover:from-primary-dark hover:to-secondary-dark cursor-pointer"
          >
            + Ajouter un animal
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredAnimaux.map((animal) => (
            <AnimalCard key={animal.id} animal={animal} onEdit={handleEdit} onDelete={handleDelete} onClick={setDetailAnimal} />
          ))}
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
            onClick={() => handleSave(false)}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-primary to-secondary rounded-lg hover:from-primary-dark hover:to-secondary-dark cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Enregistrement..." : "Ajouter"}
          </button>
        </div>
      </Modal>

      {/* Modal édition */}
      <Modal
        isOpen={!!editAnimal}
        onClose={() => setEditAnimal(null)}
        title="✏️ Modifier l'animal"
        size="large"
      >
        <AnimalForm animal={editAnimal} formRef={formRef} />
        <div className="flex gap-3 justify-end mt-6">
          <button
            onClick={() => setEditAnimal(null)}
            className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 cursor-pointer"
          >
            Annuler
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-primary to-secondary rounded-lg hover:from-primary-dark hover:to-secondary-dark cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </Modal>

      {/* Modal détail */}
      <Modal
        isOpen={!!detailAnimal}
        onClose={() => setDetailAnimal(null)}
        title={`${detailAnimal ? getAnimalIcon(detailAnimal.type) : ""} ${detailAnimal?.nom || detailAnimal?.numeroBoucle || ""}`}
        size="large"
      >
        {detailAnimal && (
          <div className="grid gap-6">
            {/* Infos principales */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-gray-500 mb-0.5">Numéro de boucle</div>
                <div className="font-medium">{detailAnimal.numeroBoucle}</div>
              </div>
              <div>
                <div className="text-gray-500 mb-0.5">Type</div>
                <div className="font-medium">{getAnimalIcon(detailAnimal.type)} {detailAnimal.type}</div>
              </div>
              <div>
                <div className="text-gray-500 mb-0.5">Sexe</div>
                <div className="font-medium">{detailAnimal.sexe === "M" ? "♂ Mâle" : "♀ Femelle"}</div>
              </div>
              <div>
                <div className="text-gray-500 mb-0.5">Race</div>
                <div className="font-medium">{detailAnimal.race || "-"}</div>
              </div>
              <div>
                <div className="text-gray-500 mb-0.5">Âge</div>
                <div className="font-medium">{detailAnimal.ageMois ? formatAge(detailAnimal.ageMois) : "-"}</div>
              </div>
              <div>
                <div className="text-gray-500 mb-0.5">Poids</div>
                <div className="font-medium">{detailAnimal.poids ? formatNumber(detailAnimal.poids) + " kg" : "-"}</div>
              </div>
              {detailAnimal.commentaire && (
                <div className="col-span-full">
                  <div className="text-gray-500 mb-0.5">Commentaire</div>
                  <div className="font-medium">{detailAnimal.commentaire}</div>
                </div>
              )}
            </div>

            {/* Filiation */}
            {(detailAnimal.numeroBouclePere || detailAnimal.numeroBoucleMere) && (
              <div>
                <h3 className="text-lg font-semibold mb-3">Filiation</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Père */}
                  {detailAnimal.numeroBouclePere && (() => {
                    const pere = animaux.find((a) => a.numeroBoucle === detailAnimal.numeroBouclePere);
                    return (
                      <div className="border border-gray-200 rounded-lg p-4 bg-blue-50/50">
                        <div className="text-xs font-semibold text-blue-600 uppercase mb-2">♂ Père</div>
                        {pere ? (
                          <div>
                            <button
                              onClick={() => setDetailAnimal(pere)}
                              className="text-base font-semibold text-blue-700 hover:underline cursor-pointer bg-transparent border-none p-0"
                            >
                              {pere.nom || pere.numeroBoucle}
                            </button>
                            <div className="text-sm text-gray-600 mt-1">{pere.numeroBoucle}</div>
                            <div className="text-sm text-gray-600">{pere.race || "-"} · {pere.ageMois ? formatAge(pere.ageMois) : "-"}</div>
                          </div>
                        ) : (
                          <div>
                            <div className="text-sm font-medium text-gray-700">{detailAnimal.numeroBouclePere}</div>
                            <div className="text-xs text-gray-400 mt-1">Non trouvé dans le troupeau</div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Mère */}
                  {detailAnimal.numeroBoucleMere && (() => {
                    const mere = animaux.find((a) => a.numeroBoucle === detailAnimal.numeroBoucleMere);
                    return (
                      <div className="border border-gray-200 rounded-lg p-4 bg-pink-50/50">
                        <div className="text-xs font-semibold text-pink-600 uppercase mb-2">♀ Mère</div>
                        {mere ? (
                          <div>
                            <button
                              onClick={() => setDetailAnimal(mere)}
                              className="text-base font-semibold text-pink-700 hover:underline cursor-pointer bg-transparent border-none p-0"
                            >
                              {mere.nom || mere.numeroBoucle}
                            </button>
                            <div className="text-sm text-gray-600 mt-1">{mere.numeroBoucle}</div>
                            <div className="text-sm text-gray-600">{mere.race || "-"} · {mere.ageMois ? formatAge(mere.ageMois) : "-"}</div>
                          </div>
                        ) : (
                          <div>
                            <div className="text-sm font-medium text-gray-700">{detailAnimal.numeroBoucleMere}</div>
                            <div className="text-xs text-gray-400 mt-1">Non trouvé dans le troupeau</div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal suppression */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Supprimer l'animal"
        message={`Voulez-vous vraiment supprimer l'animal <strong>${deleteTarget?.nom || deleteTarget?.numeroBoucle}</strong> ?<br><br>Cette action est irréversible.`}
        confirmText="Supprimer"
        cancelText="Annuler"
        danger
      />
    </div>
  );
}
