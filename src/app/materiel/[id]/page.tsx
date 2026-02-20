"use client";

import { useState, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/store";
import { useToast } from "@/components/Toast";
import Modal, { ConfirmModal } from "@/components/Modal";
import MaterielForm from "@/components/MaterielForm";
import MaterielHeader from "@/components/materiel-detail/MaterielHeader";
import MaterielInfoGrid from "@/components/materiel-detail/MaterielInfoGrid";
import ComposantsTab from "@/components/materiel-detail/ComposantsTab";
import { updateMateriel, deleteMateriel as deleteMaterielService, validateMaterielData, type MaterielFormData } from "@/services/materiel-service";

const TABS = [
  { id: "info", label: "Infos" },
  { id: "composants", label: "Composants" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function MaterielDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { state } = useAppStore();
  const { showToast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);

  const [activeTab, setActiveTab] = useState<TabId>("info");
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const materiel = state.materiels.find((m) => m.id === id) || null;

  const handleSave = async () => {
    if (!formRef.current || !materiel || saving) return;
    const formData = new FormData(formRef.current);
    const data = Object.fromEntries(formData.entries()) as unknown as MaterielFormData;

    const validation = validateMaterielData(data);
    if (!validation.valid) {
      showToast({ type: "error", title: "Erreur de validation", message: validation.errors.join(", ") });
      return;
    }

    setSaving(true);
    try {
      const result = await updateMateriel(materiel.id, data);
      if (result.success) {
        showToast({ type: "success", title: "Succès", message: "Matériel modifié avec succès" });
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
    if (!materiel) return;
    const result = await deleteMaterielService(materiel.id);
    if (result.success) {
      showToast({ type: "success", title: "Succès", message: "Matériel supprimé" });
      router.push("/materiel");
    } else {
      showToast({ type: "error", title: "Erreur", message: result.error || "Erreur" });
    }
  };

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400 text-lg">Chargement...</div>
      </div>
    );
  }

  if (!materiel) {
    return (
      <div className="text-center py-20">
        <div className="text-6xl mb-4">🔍</div>
        <h2 className="text-2xl font-semibold mb-2">Matériel introuvable</h2>
        <p className="text-gray-600 mb-6">Cet équipement n&apos;existe pas ou a été supprimé.</p>
        <button
          onClick={() => router.push("/materiel")}
          className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-primary to-secondary rounded-lg cursor-pointer"
        >
          Retour au matériel
        </button>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <MaterielHeader
        materiel={materiel}
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
      {activeTab === "info" && <MaterielInfoGrid materiel={materiel} />}
      {activeTab === "composants" && (
        <ComposantsTab materielId={id} initialComposants={materiel.composants || []} />
      )}

      {/* Edit modal */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Modifier le matériel" size="large">
        <MaterielForm materiel={materiel} formRef={formRef} />
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
        title="Supprimer le matériel"
        message={`Voulez-vous vraiment supprimer <strong>${materiel.nom}</strong> ?<br><br>Cette action est irréversible.`}
        confirmText="Supprimer"
        cancelText="Annuler"
        danger
      />
    </div>
  );
}
