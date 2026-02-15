"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { useAppStore, type Animal } from "@/store/store";
import { useToast } from "@/components/Toast";
import Modal, { ConfirmModal } from "@/components/Modal";
import AnimalForm from "@/components/AnimalForm";
import AnimalHeader from "@/components/animal-detail/AnimalHeader";
import AnimalInfoGrid from "@/components/animal-detail/AnimalInfoGrid";
import ParentCards from "@/components/animal-detail/ParentCards";
import PhotoGallery from "@/components/animal-detail/PhotoGallery";
import WeightChart from "@/components/animal-detail/WeightChart";
import VetDocuments from "@/components/animal-detail/VetDocuments";
import HistoryTimeline from "@/components/animal-detail/HistoryTimeline";
import { updateAnimal, deleteAnimal as deleteAnimalService, validateAnimalData, type AnimalFormData } from "@/services/animal-service";
import {
  listenWeights, listenPhotos, listenDocuments, listenHistory,
  type WeightEntry, type AnimalPhoto, type AnimalDocument, type HistoryEntry,
} from "@/services/animal-detail-service";

const TABS = [
  { id: "info", label: "Infos" },
  { id: "photos", label: "Photos" },
  { id: "poids", label: "Poids" },
  { id: "documents", label: "Documents" },
  { id: "historique", label: "Historique" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AnimalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { state } = useAppStore();
  const { showToast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);

  const [activeTab, setActiveTab] = useState<TabId>("info");
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sub-data
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [photos, setPhotos] = useState<AnimalPhoto[]>([]);
  const [documents, setDocuments] = useState<AnimalDocument[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const animal = state.animaux.find((a) => a.id === id) || null;

  // Real-time listeners for sub-data
  useEffect(() => {
    if (!id) return;
    const unsubs = [
      listenWeights(id, setWeights),
      listenPhotos(id, setPhotos),
      listenDocuments(id, setDocuments),
      listenHistory(id, setHistory),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, [id]);

  const handleSave = async () => {
    if (!formRef.current || !animal || saving) return;
    const formData = new FormData(formRef.current);
    const data = Object.fromEntries(formData.entries()) as unknown as AnimalFormData;

    const validation = validateAnimalData(data);
    if (!validation.valid) {
      showToast({ type: "error", title: "Erreur de validation", message: validation.errors.join(", ") });
      return;
    }

    setSaving(true);
    try {
      const result = await updateAnimal(animal.id, data);
      if (result.success) {
        showToast({ type: "success", title: "Succès", message: "Animal modifié avec succès" });
        setShowEditModal(false);
      } else {
        showToast({ type: "error", title: "Erreur", message: result.error || "Erreur" });
      }
    } catch {
      showToast({ type: "error", title: "Erreur", message: "Impossible de contacter la base de données" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!animal) return;
    const result = await deleteAnimalService(animal.id);
    if (result.success) {
      showToast({ type: "success", title: "Succès", message: "Animal supprimé" });
      router.push("/animaux");
    } else {
      showToast({ type: "error", title: "Erreur", message: result.error || "Erreur" });
    }
  };

  // Loading
  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400 text-lg">Chargement...</div>
      </div>
    );
  }

  // Not found
  if (!animal) {
    return (
      <div className="text-center py-20">
        <div className="text-6xl mb-4">🔍</div>
        <h2 className="text-2xl font-semibold mb-2">Animal introuvable</h2>
        <p className="text-gray-600 mb-6">Cet animal n&apos;existe pas ou a été supprimé.</p>
        <button
          onClick={() => router.push("/animaux")}
          className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-primary to-secondary rounded-lg cursor-pointer"
        >
          Retour aux animaux
        </button>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <AnimalHeader
        animal={animal}
        onEdit={() => setShowEditModal(true)}
        onDelete={() => setShowDeleteConfirm(true)}
      />

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm mb-6 overflow-x-auto">
        <div className="flex border-b border-gray-200 min-w-max">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-sm font-medium transition-colors cursor-pointer border-b-2 ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "info" && (
        <div className="grid gap-6">
          <AnimalInfoGrid animal={animal} />
          <ParentCards animal={animal} animaux={state.animaux} />
        </div>
      )}
      {activeTab === "photos" && <PhotoGallery animalId={id} photos={photos} />}
      {activeTab === "poids" && <WeightChart animalId={id} animalType={animal.type} weights={weights} />}
      {activeTab === "documents" && <VetDocuments animalId={id} documents={documents} />}
      {activeTab === "historique" && <HistoryTimeline animalId={id} history={history} />}

      {/* Edit modal */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Modifier l'animal" size="large">
        <AnimalForm animal={animal} formRef={formRef} />
        <div className="flex gap-3 justify-end mt-6">
          <button onClick={() => setShowEditModal(false)} className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 cursor-pointer">
            Annuler
          </button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-primary to-secondary rounded-lg hover:from-primary-dark hover:to-secondary-dark cursor-pointer disabled:opacity-50">
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </Modal>

      {/* Delete confirm */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Supprimer l'animal"
        message={`Voulez-vous vraiment supprimer <strong>${animal.nom || animal.numeroBoucle || "cet animal"}</strong> ?<br><br>Cette action est irréversible.`}
        confirmText="Supprimer"
        cancelText="Annuler"
        danger
      />
    </div>
  );
}
