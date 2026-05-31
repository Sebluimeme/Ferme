"use client";

import React, { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { useAppStore } from "@/store/store";
import KpiCard from "@/components/KpiCard";
import Modal, { ConfirmModal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import type { ActiviteFourrage, Partiel } from "@/types/fourrage";

const ParcelSelectorMap = dynamic(() => import("@/components/ParcelSelectorMap"), { ssr: false });
const WeatherWidget = dynamic(() => import("@/components/WeatherWidget"), { ssr: false });
import {
  createActivite,
  updateActivite,
  deleteActivite,
  addBottesActivite,
} from "@/services/fourrage-service";

// ==================== Types internes ====================

type TypeActivite = "foin" | "ensilage" | "fauche" | "paturage" | "regain";

interface ActiviteFormData {
  typeActivite: TypeActivite;
  dateActivite: string;
  parcelIds: string[];
  nombreBottes: string;
  poidsParBotte: string;
  notes: string;
}

interface BottesFormData {
  nombreBottes: string;
  poidsParBotte: string;
}

const TYPE_LABELS: Record<TypeActivite, string> = {
  foin: "Foin",
  ensilage: "Ensilage",
  fauche: "Fauche",
  paturage: "Pâturage",
  regain: "Regain",
};

const TYPE_COLORS: Record<TypeActivite, string> = {
  foin: "bg-yellow-100 text-yellow-800",
  ensilage: "bg-green-100 text-green-800",
  fauche: "bg-blue-100 text-blue-800",
  paturage: "bg-emerald-100 text-emerald-800",
  regain: "bg-amber-100 text-amber-800",
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
  partiels: Partiel[];
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
    poidsParBotte: initial?.poidsParBotte ?? "",
    notes: initial?.notes ?? "",
  });

  const poidsTotalT = form.nombreBottes && form.poidsParBotte
    ? (parseInt(form.nombreBottes) * parseFloat(form.poidsParBotte)) / 1000
    : null;
  const [viewMode, setViewMode] = useState<"list" | "map">("list");

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
            <option value="regain">Regain</option>
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
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">Parcelles concernées</label>
          {partiels.length > 0 && (
            <div className="flex rounded-lg overflow-hidden border border-gray-300 text-xs">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`px-3 py-1 font-medium cursor-pointer transition-colors ${
                  viewMode === "list" ? "bg-primary text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                Liste
              </button>
              <button
                type="button"
                onClick={() => setViewMode("map")}
                className={`px-3 py-1 font-medium cursor-pointer border-l border-gray-300 transition-colors ${
                  viewMode === "map" ? "bg-primary text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                🗺️ Carte
              </button>
            </div>
          )}
        </div>
        {partiels.length === 0 ? (
          <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Aucune parcelle créée — allez dans <strong>Parcellaire</strong> pour en ajouter.
          </p>
        ) : viewMode === "map" ? (
          <ParcelSelectorMap
            partiels={partiels}
            selectedIds={form.parcelIds}
            onToggle={togglePartiel}
          />
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Poids par botte (kg)</label>
          <input
            type="number"
            min="0"
            step="1"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={form.poidsParBotte}
            onChange={(e) => setForm((p) => ({ ...p, poidsParBotte: e.target.value }))}
            placeholder="Ex : 300"
          />
        </div>
      </div>
      {poidsTotalT !== null && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2.5 text-sm flex items-center justify-between">
          <span className="text-gray-600">Poids total calculé</span>
          <span className="font-bold text-gray-900">{poidsTotalT.toFixed(3)} t</span>
        </div>
      )}

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
  const [form, setForm] = useState<BottesFormData>({ nombreBottes: "", poidsParBotte: "" });

  const poidsTotalT = form.nombreBottes && form.poidsParBotte
    ? (parseInt(form.nombreBottes) * parseFloat(form.poidsParBotte)) / 1000
    : null;

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
        <label className="block text-sm font-medium text-gray-700 mb-1">Poids par botte (kg)</label>
        <input
          type="number"
          min="0"
          step="1"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          value={form.poidsParBotte}
          onChange={(e) => setForm((p) => ({ ...p, poidsParBotte: e.target.value }))}
          placeholder="Ex : 300"
        />
      </div>
      {poidsTotalT !== null && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2.5 text-sm flex items-center justify-between">
          <span className="text-gray-600">Poids total calculé</span>
          <span className="font-bold text-gray-900">{poidsTotalT.toFixed(3)} t</span>
        </div>
      )}
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

const DUREE_STABULATION = 180;
const CONSO_KG_JOUR: Record<string, number> = {
  bovin: 9,
  ovin: 2,
  caprin: 1.8,
  porcin: 0,
  equin: 10,
};

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

  // Objectif foin basé sur les animaux actifs
  const animauxActifs = state.animaux.filter((a) => a.statut === "actif");
  const objectifFoinKg = animauxActifs.reduce((sum, a) => sum + (CONSO_KG_JOUR[a.type] ?? 0) * DUREE_STABULATION, 0);
  const objectifFoinT = objectifFoinKg / 1000;

  const foinsRecoltesT = activitesFourrage
    .filter((a) => a.typeActivite === "foin" && a.poidsTonne != null)
    .reduce((sum, a) => sum + (a.poidsTonne ?? 0), 0);

  const progressPct = objectifFoinT > 0 ? Math.min(100, (foinsRecoltesT / objectifFoinT) * 100) : 0;
  const manquantT = Math.max(0, objectifFoinT - foinsRecoltesT);

  type AnimalType = "bovin" | "ovin" | "caprin" | "equin" | "porcin";
  const detailParType = (["bovin", "ovin", "caprin", "equin"] as AnimalType[]).map((type) => ({
    type,
    count: animauxActifs.filter((a) => a.type === type).length,
    conso: CONSO_KG_JOUR[type],
  })).filter((d) => d.count > 0);

  const activitesTri = [...activitesFourrage].sort(
    (a, b) => new Date(b.dateActivite).getTime() - new Date(a.dateActivite).getTime()
  );

  // Analytics foin / regain
  const activitesFoin = activitesFourrage.filter((a) => a.typeActivite === "foin");
  const activitesRegain = activitesFourrage.filter((a) => a.typeActivite === "regain");
  const totalFoinT = activitesFoin.reduce((s, a) => s + (a.poidsTonne ?? 0), 0);
  const totalRegainT = activitesRegain.reduce((s, a) => s + (a.poidsTonne ?? 0), 0);
  const parcellesFoinIds = new Set(activitesFoin.flatMap((a) => a.parcelIds ?? []));
  const parcellesRegainIds = new Set(activitesRegain.flatMap((a) => a.parcelIds ?? []));
  const surfaceFoin = partiels.filter((p) => parcellesFoinIds.has(p.id) && p.surface != null).reduce((s, p) => s + (p.surface ?? 0), 0);
  const surfaceRegain = partiels.filter((p) => parcellesRegainIds.has(p.id) && p.surface != null).reduce((s, p) => s + (p.surface ?? 0), 0);
  const rdtFoin = surfaceFoin > 0 && totalFoinT > 0 ? totalFoinT / surfaceFoin : null;
  const rdtRegain = surfaceRegain > 0 && totalRegainT > 0 ? totalRegainT / surfaceRegain : null;

  // Rendement par parcelle (activités à 1 seule parcelle uniquement)
  const rdtParParcelle = useMemo(() =>
    partiels
      .filter((p) => p.surface && p.surface > 0)
      .map((p) => {
        const acts = [...activitesFoin, ...activitesRegain].filter(
          (a) => a.parcelIds?.length === 1 && a.parcelIds[0] === p.id && a.poidsTonne
        );
        if (!acts.length) return null;
        const totalT = acts.reduce((s, a) => s + (a.poidsTonne ?? 0), 0);
        const foinT = activitesFoin.filter((a) => a.parcelIds?.length === 1 && a.parcelIds[0] === p.id).reduce((s, a) => s + (a.poidsTonne ?? 0), 0);
        const regainT = activitesRegain.filter((a) => a.parcelIds?.length === 1 && a.parcelIds[0] === p.id).reduce((s, a) => s + (a.poidsTonne ?? 0), 0);
        return { parcelle: p, totalT, foinT, regainT, rdt: totalT / p.surface! };
      })
      .filter(Boolean) as { parcelle: Partiel; totalT: number; foinT: number; regainT: number; rdt: number }[],
  [partiels, activitesFoin, activitesRegain]);

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
      const nbBottes = data.nombreBottes ? parseInt(data.nombreBottes) : undefined;
      const poidsTonne = nbBottes && data.poidsParBotte
        ? (nbBottes * parseFloat(data.poidsParBotte)) / 1000
        : undefined;
      const result = await createActivite({
        typeActivite: data.typeActivite,
        dateActivite: data.dateActivite,
        parcelIds: data.parcelIds,
        nombreBottes: nbBottes,
        poidsTonne,
        notes: data.notes || undefined,
        statut: nbBottes ? "terminee" : "en_cours",
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
      const nbBottes = data.nombreBottes ? parseInt(data.nombreBottes) : undefined;
      const poidsTonne = nbBottes && data.poidsParBotte
        ? (nbBottes * parseFloat(data.poidsParBotte)) / 1000
        : undefined;
      const result = await updateActivite(editActivite.id, {
        typeActivite: data.typeActivite,
        dateActivite: data.dateActivite,
        parcelIds: data.parcelIds,
        nombreBottes: nbBottes,
        poidsTonne,
        notes: data.notes || undefined,
        statut: nbBottes ? "terminee" : "en_cours",
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
      const nbBottes = parseInt(data.nombreBottes);
      const poidsTonne = data.poidsParBotte
        ? (nbBottes * parseFloat(data.poidsParBotte)) / 1000
        : undefined;
      const result = await addBottesActivite(bottesModal.id, nbBottes, poidsTonne);
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
          label="Parcellaire"
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

      {/* Objectif foin */}
      {objectifFoinT > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-8">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-semibold text-gray-800">🎯 Objectif foin — saison</h2>
              <p className="text-xs text-gray-400 mt-0.5">{DUREE_STABULATION} jours de stabulation · {animauxActifs.length} animaux actifs</p>
            </div>
            <div className="text-right">
              <span className={`text-2xl font-bold ${progressPct >= 100 ? "text-green-600" : progressPct >= 60 ? "text-yellow-600" : "text-red-500"}`}>
                {progressPct.toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Barre de progression */}
          <div className="w-full bg-gray-100 rounded-full h-3 mb-3">
            <div
              className={`h-3 rounded-full transition-all ${progressPct >= 100 ? "bg-green-500" : progressPct >= 60 ? "bg-yellow-400" : "bg-red-400"}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* Chiffres */}
          <div className="flex items-center justify-between text-sm mb-4">
            <span className="text-gray-600">
              <span className="font-semibold text-gray-800">{foinsRecoltesT.toFixed(1)} t</span> récoltées
            </span>
            <span className="text-gray-400">sur</span>
            <span className="text-gray-600">
              objectif <span className="font-semibold text-gray-800">{objectifFoinT.toFixed(1)} t</span>
            </span>
            {manquantT > 0 && (
              <span className="text-red-500 font-medium">−{manquantT.toFixed(1)} t restantes</span>
            )}
            {manquantT === 0 && (
              <span className="text-green-600 font-medium">✓ Objectif atteint</span>
            )}
          </div>

          {/* Détail par type */}
          {detailParType.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-400 mb-2">Détail par type</p>
              <div className="flex flex-wrap gap-2">
                {detailParType.map((d) => (
                  <div key={d.type} className="bg-gray-50 rounded-lg px-3 py-1.5 text-xs text-gray-600">
                    <span className="font-medium capitalize">{d.type}</span>
                    {" · "}{d.count} têtes{" · "}
                    {((d.count * d.conso * DUREE_STABULATION) / 1000).toFixed(1)} t
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Widget météo */}
      <WeatherWidget partiels={partiels} />

      {/* Analytics récoltes foin / regain */}
      {(totalFoinT > 0 || totalRegainT > 0) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-8">
          <h2 className="text-base font-semibold text-gray-800 mb-4">📊 Analytics récoltes</h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
            <KpiCard
              label="Foin total"
              value={totalFoinT > 0 ? `${totalFoinT.toFixed(1)} t` : "—"}
              subtitle="toutes saisons"
              borderColorClass="border-l-yellow-500"
              valueColorClass="text-yellow-600"
            />
            <KpiCard
              label="Regain total"
              value={totalRegainT > 0 ? `${totalRegainT.toFixed(1)} t` : "—"}
              subtitle="toutes saisons"
              borderColorClass="border-l-amber-500"
              valueColorClass="text-amber-600"
            />
            <KpiCard
              label="Rdt foin moyen"
              value={rdtFoin != null ? `${rdtFoin.toFixed(2)} t/ha` : "—"}
              subtitle={surfaceFoin > 0 ? `${surfaceFoin.toFixed(1)} ha en fauche` : "surface non définie"}
              borderColorClass="border-l-green-500"
              valueColorClass="text-green-600"
            />
            <KpiCard
              label="Rdt regain moyen"
              value={rdtRegain != null ? `${rdtRegain.toFixed(2)} t/ha` : "—"}
              subtitle={surfaceRegain > 0 ? `${surfaceRegain.toFixed(1)} ha en regain` : "surface non définie"}
              borderColorClass="border-l-orange-500"
              valueColorClass="text-orange-600"
            />
          </div>

          {rdtParParcelle.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Rendement par parcelle</p>
              <div className="overflow-x-auto rounded-lg border border-gray-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 font-semibold">
                      <th className="text-left px-4 py-2.5">Parcelle</th>
                      <th className="text-right px-4 py-2.5">Surface</th>
                      <th className="text-right px-4 py-2.5">Foin récolté</th>
                      <th className="text-right px-4 py-2.5">Regain récolté</th>
                      <th className="text-right px-4 py-2.5">Rdt t/ha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rdtParParcelle.map((r) => (
                      <tr key={r.parcelle.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-900">{r.parcelle.nom}</td>
                        <td className="px-4 py-2.5 text-right text-gray-500">{r.parcelle.surface} ha</td>
                        <td className="px-4 py-2.5 text-right text-yellow-700">
                          {r.foinT > 0 ? `${r.foinT.toFixed(2)} t` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right text-amber-700">
                          {r.regainT > 0 ? `${r.regainT.toFixed(2)} t` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-gray-800">
                          {r.rdt.toFixed(2)} t/ha
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">* Uniquement les chantiers avec une seule parcelle sélectionnée</p>
            </>
          )}
        </div>
      )}

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
                <span className="font-medium">Parcelles :</span> {getPartielsNoms(activite.parcelIds)}
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
              poidsParBotte: editActivite.nombreBottes && editActivite.poidsTonne
                ? Math.round((editActivite.poidsTonne * 1000) / editActivite.nombreBottes).toString()
                : "",
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
