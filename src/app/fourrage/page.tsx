"use client";

import React, { useState } from "react";
import { useAppStore } from "@/store/store";
import KpiCard from "@/components/KpiCard";
import Modal, { ConfirmModal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import type { ActiviteFourrage } from "@/types/fourrage";
import {
  createActivite,
  updateActivite,
  deleteActivite,
  addBottesActivite,
} from "@/services/fourrage-service";

// ==================== Types internes ====================

type TypeActivite = "foin" | "ensilage" | "fauche" | "paturage";

interface ActiviteFormData {
  typeActivite: TypeActivite;
  dateActivite: string;
  parcelIds: string[];
  nombreBottes: string;
  poidsTonne: string;
  notes: string;
}

interface BottesFormData {
  nombreBottes: string;
  poidsTonne: string;
}

const TYPE_LABELS: Record<TypeActivite, string> = {
  foin: "Foin",
  ensilage: "Ensilage",
  fauche: "Fauche",
  paturage: "Pâturage",
};

const TYPE_COLORS: Record<TypeActivite, string> = {
  foin: "bg-yellow-100 text-yellow-800",
  ensilage: "bg-green-100 text-green-800",
  fauche: "bg-blue-100 text-blue-800",
  paturage: "bg-emerald-100 text-emerald-800",
};

// ==================== Formulaire activité ====================

function ActiviteForm({
  initial,
  partiels,
  onSubmit,
  onCancel,
  loading,
}: {
  initial?: Partial<ActiviteFormData>;
  partiels: { id: string; nom: string }[];
  onSubmit: (data: ActiviteFormData) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState<ActiviteFormData>({
    typeActivite: initial?.typeActivite ?? "foin",
    dateActivite: initial?.dateActivite ?? today,
    parcelIds: initial?.parcelIds ?? [],
    nombreBottes: initial?.nombreBottes ?? "",
    poidsTonne: initial?.poidsTonne ?? "",
    notes: initial?.notes ?? "",
  });

  const togglePartiel = (id: string) => {
    setForm((prev) => ({
      ...prev,
      parcelIds: prev.parcelIds.includes(id)
        ? prev.parcelIds.filter((p) => p !== id)
        : [...prev.parcelIds, id],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type d&apos;activité *</label>
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={form.typeActivite}
            onChange={(e) => setForm((p) => ({ ...p, typeActivite: e.target.value as TypeActivite }))}
            required
          >
            <option value="foin">Foin</option>
            <option value="ensilage">Ensilage</option>
            <option value="fauche">Fauche</option>
            <option value="paturage">Pâturage</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
          <input
            type="date"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={form.dateActivite}
            onChange={(e) => setForm((p) => ({ ...p, dateActivite: e.target.value }))}
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Partiels concernés</label>
        {partiels.length === 0 ? (
          <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Aucun partiel créé — allez dans <strong>Partiels</strong> pour en ajouter.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {partiels.map((p) => (
              <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.parcelIds.includes(p.id)}
                  onChange={() => togglePartiel(p.id)}
                  className="accent-primary"
                />
                <span className="text-sm text-gray-700">{p.nom}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de bottes</label>
          <input
            type="number"
            min="0"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={form.nombreBottes}
            onChange={(e) => setForm((p) => ({ ...p, nombreBottes: e.target.value }))}
            placeholder="Ex : 120"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Poids (tonnes)</label>
          <input
            type="number"
            min="0"
            step="0.1"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={form.poidsTonne}
            onChange={(e) => setForm((p) => ({ ...p, poidsTonne: e.target.value }))}
            placeholder="Ex : 4.5"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
        <textarea
          rows={3}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          value={form.notes}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          placeholder="Observations, conditions météo..."
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 cursor-pointer"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 text-sm font-semibold text-white rounded-lg bg-gradient-to-br from-primary to-secondary hover:from-primary-dark hover:to-secondary-dark cursor-pointer disabled:opacity-50"
        >
          {loading ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}

// ==================== Formulaire bottes ====================

function BottesForm({
  onSubmit,
  onCancel,
  loading,
}: {
  onSubmit: (data: BottesFormData) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<BottesFormData>({ nombreBottes: "", poidsTonne: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de bottes *</label>
        <input
          type="number"
          min="0"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          value={form.nombreBottes}
          onChange={(e) => setForm((p) => ({ ...p, nombreBottes: e.target.value }))}
          placeholder="Ex : 120"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Poids (tonnes)</label>
        <input
          type="number"
          min="0"
          step="0.1"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          value={form.poidsTonne}
          onChange={(e) => setForm((p) => ({ ...p, poidsTonne: e.target.value }))}
          placeholder="Ex : 4.5"
        />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 cursor-pointer"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 text-sm font-semibold text-white rounded-lg bg-gradient-to-br from-primary to-secondary hover:from-primary-dark hover:to-secondary-dark cursor-pointer disabled:opacity-50"
        >
          {loading ? "Enregistrement..." : "Confirmer"}
        </button>
      </div>
    </form>
  );
}

// ==================== Page principale ====================

export default function FourragePage() {
  const { state } = useAppStore();
  const { showToast } = useToast();
  const { partiels, activitesFourrage } = state;

  const [modalOpen, setModalOpen] = useState(false);
  const [editActivite, setEditActivite] = useState<ActiviteFourrage | null>(null);
  const [bottesModal, setBottesModal] = useState<ActiviteFourrage | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ActiviteFourrage | null>(null);
  const [saving, setSaving] = useState(false);

  // KPIs
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  const activitesCeMois = activitesFourrage.filter((a) => {
    const d = new Date(a.dateActivite);
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  });

  const bottesCeMois = activitesCeMois.reduce((sum, a) => sum + (a.nombreBottes ?? 0), 0);
  const surfaceTotale = partiels.reduce((sum, p) => sum + (p.surface ?? 0), 0);

  const activitesTri = [...activitesFourrage].sort(
    (a, b) => new Date(b.dateActivite).getTime() - new Date(a.dateActivite).getTime()
  );

  const getPartielsNoms = (ids: string[] | null | undefined) =>
    (ids ?? [])
      .map((id) => partiels.find((p) => p.id === id)?.nom ?? id)
      .join(", ") || "—";

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

  // Handlers
  const handleCreate = async (data: ActiviteFormData) => {
    setSaving(true);
    try {
      const result = await createActivite({
        typeActivite: data.typeActivite,
        dateActivite: data.dateActivite,
        parcelIds: data.parcelIds,
        nombreBottes: data.nombreBottes ? parseInt(data.nombreBottes) : undefined,
        poidsTonne: data.poidsTonne ? parseFloat(data.poidsTonne) : undefined,
        notes: data.notes || undefined,
        statut: data.nombreBottes ? "terminee" : "en_cours",
      });
      if (result.success) {
        showToast({ type: "success", title: "Activité créée" });
        setModalOpen(false);
      } else {
        showToast({ type: "error", title: "Erreur", message: result.error });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (data: ActiviteFormData) => {
    if (!editActivite) return;
    setSaving(true);
    try {
      const result = await updateActivite(editActivite.id, {
        typeActivite: data.typeActivite,
        dateActivite: data.dateActivite,
        parcelIds: data.parcelIds,
        nombreBottes: data.nombreBottes ? parseInt(data.nombreBottes) : undefined,
        poidsTonne: data.poidsTonne ? parseFloat(data.poidsTonne) : undefined,
        notes: data.notes || undefined,
        statut: data.nombreBottes ? "terminee" : "en_cours",
      });
      if (result.success) {
        showToast({ type: "success", title: "Activité mise à jour" });
        setEditActivite(null);
      } else {
        showToast({ type: "error", title: "Erreur", message: result.error });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteActivite(deleteTarget.id);
    if (result.success) {
      showToast({ type: "success", title: "Activité supprimée" });
    } else {
      showToast({ type: "error", title: "Erreur", message: result.error });
    }
    setDeleteTarget(null);
  };

  const handleAddBottes = async (data: BottesFormData) => {
    if (!bottesModal) return;
    setSaving(true);
    try {
      const result = await addBottesActivite(
        bottesModal.id,
        parseInt(data.nombreBottes),
        data.poidsTonne ? parseFloat(data.poidsTonne) : undefined
      );
      if (result.success) {
        showToast({ type: "success", title: "Bottes enregistrées" });
        setBottesModal(null);
      } else {
        showToast({ type: "error", title: "Erreur", message: result.error });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* En-tête */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">🌾 Fourrage</h1>
          <p className="text-gray-500 mt-1">Gestion des activités de coupe et de récolte</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="px-5 py-2.5 text-sm font-semibold text-white rounded-xl bg-gradient-to-br from-primary to-secondary hover:from-primary-dark hover:to-secondary-dark cursor-pointer shadow-md"
        >
          + Nouvelle activité
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard
          label="Partiels"
          value={partiels.length}
          subtitle="parcelles gérées"
          borderColorClass="border-l-primary"
        />
        <KpiCard
          label="Activités ce mois"
          value={activitesCeMois.length}
          borderColorClass="border-l-green-500"
          valueColorClass="text-green-600"
        />
        <KpiCard
          label="Bottes ce mois"
          value={bottesCeMois}
          borderColorClass="border-l-yellow-500"
          valueColorClass="text-yellow-600"
        />
        <KpiCard
          label="Surface totale"
          value={surfaceTotale > 0 ? `${surfaceTotale.toFixed(1)} ha` : "—"}
          subtitle="tous partiels"
          borderColorClass="border-l-purple-500"
          valueColorClass="text-purple-600"
        />
      </div>

      {/* Liste activités */}
      <div className="space-y-3">
        {activitesTri.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <div className="text-5xl mb-3">🌾</div>
            <p className="text-lg font-medium">Aucune activité enregistrée</p>
            <p className="text-sm mt-1">Cliquez sur &quot;+ Nouvelle activité&quot; pour commencer.</p>
          </div>
        )}
        {activitesTri.map((activite) => (
          <div
            key={activite.id}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${TYPE_COLORS[activite.typeActivite]}`}
                >
                  {TYPE_LABELS[activite.typeActivite]}
                </span>
                {activite.statut === "en_cours" && (
                  <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full bg-orange-100 text-orange-700">
                    En cours
                  </span>
                )}
                <span className="text-sm text-gray-500">{formatDate(activite.dateActivite)}</span>
              </div>
              <div className="mt-1 text-sm text-gray-700">
                <span className="font-medium">Partiels :</span> {getPartielsNoms(activite.parcelIds)}
              </div>
              <div className="mt-0.5 text-sm text-gray-600">
                {activite.nombreBottes != null ? (
                  <>
                    <span className="font-medium">{activite.nombreBottes} bottes</span>
                    {activite.poidsTonne != null && ` — ${activite.poidsTonne} t`}
                  </>
                ) : (
                  <span className="text-amber-600 font-medium">À compléter</span>
                )}
              </div>
              {activite.notes && (
                <div className="mt-0.5 text-xs text-gray-400 italic truncate">{activite.notes}</div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {activite.statut === "en_cours" && (
                <button
                  onClick={() => setBottesModal(activite)}
                  className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg bg-gradient-to-br from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 cursor-pointer"
                >
                  + Bottes
                </button>
              )}
              <button
                onClick={() => setEditActivite(activite)}
                className="p-2 text-gray-400 hover:text-primary hover:bg-gray-100 rounded-lg cursor-pointer transition-colors"
                title="Modifier"
              >
                ✏️
              </button>
              <button
                onClick={() => setDeleteTarget(activite)}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                title="Supprimer"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal création */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nouvelle activité fourrage">
        <ActiviteForm
          partiels={partiels}
          onSubmit={handleCreate}
          onCancel={() => setModalOpen(false)}
          loading={saving}
        />
      </Modal>

      {/* Modal édition */}
      <Modal
        isOpen={!!editActivite}
        onClose={() => setEditActivite(null)}
        title="Modifier l'activité"
      >
        {editActivite && (
          <ActiviteForm
            partiels={partiels}
            initial={{
              typeActivite: editActivite.typeActivite,
              dateActivite: editActivite.dateActivite,
              parcelIds: editActivite.parcelIds ?? [],
              nombreBottes: editActivite.nombreBottes?.toString() ?? "",
              poidsTonne: editActivite.poidsTonne?.toString() ?? "",
              notes: editActivite.notes ?? "",
            }}
            onSubmit={handleUpdate}
            onCancel={() => setEditActivite(null)}
            loading={saving}
          />
        )}
      </Modal>

      {/* Modal ajout bottes */}
      <Modal
        isOpen={!!bottesModal}
        onClose={() => setBottesModal(null)}
        title="Ajouter les bottes"
        size="small"
      >
        {bottesModal && (
          <BottesForm
            onSubmit={handleAddBottes}
            onCancel={() => setBottesModal(null)}
            loading={saving}
          />
        )}
      </Modal>

      {/* Modal suppression */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Supprimer l'activité"
        message={`Êtes-vous sûr de vouloir supprimer cette activité <strong>${deleteTarget ? TYPE_LABELS[deleteTarget.typeActivite] : ""}</strong> du ${deleteTarget ? formatDate(deleteTarget.dateActivite) : ""} ?`}
        confirmText="Supprimer"
        danger
      />
    </div>
  );
}
