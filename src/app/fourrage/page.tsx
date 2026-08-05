"use client";

import React, { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { useAppStore } from "@/store/store";
import KpiCard from "@/components/KpiCard";
import Modal, { ConfirmModal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import type { ActiviteFourrage, Partiel } from "@/types/fourrage";
import {
  origineActivite,
  estAchat,
  recoltesDeType,
  totalTonnes,
  totalBottes,
  stockFoin,
  surfaceRecolteeParType,
  rendementMoyen,
  rendementParParcelle,
  donneesMensuellesRecoltes,
  type OrigineFourrage,
} from "@/lib/fourrage-calculs";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";

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
  origine: OrigineFourrage;
  dateActivite: string;
  parcelIds: string[];
  nombreBottes: string;
  poidsBotteKg: string;
  fournisseur: string;
  prixTotal: string;
  notes: string;
}

interface BottesFormData {
  nombreBottes: string;
  poidsBotteKg: string;
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

const ORIGINE_LABELS: Record<OrigineFourrage, string> = {
  recolte: "🌾 Récolté",
  achat: "🛒 Acheté",
};

const ORIGINE_COLORS: Record<OrigineFourrage, string> = {
  recolte: "bg-stone-100 text-stone-600",
  achat: "bg-sky-100 text-sky-800",
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
    origine: initial?.origine ?? "recolte",
    dateActivite: initial?.dateActivite ?? today,
    parcelIds: initial?.parcelIds ?? [],
    nombreBottes: initial?.nombreBottes ?? "",
    poidsBotteKg: initial?.poidsBotteKg ?? "16.5",
    fournisseur: initial?.fournisseur ?? "",
    prixTotal: initial?.prixTotal ?? "",
    notes: initial?.notes ?? "",
  });

  const achat = form.origine === "achat";

  const poidsTotalT = form.nombreBottes && form.poidsBotteKg
    ? (parseInt(form.nombreBottes) * parseFloat(form.poidsBotteKg)) / 1000
    : null;

  /** Passer en achat vide les parcelles : un achat n'est rattaché à aucune parcelle. */
  const setOrigine = (origine: OrigineFourrage) =>
    setForm((p) => (origine === "achat" ? { ...p, origine, parcelIds: [] } : { ...p, origine }));

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
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Origine *</label>
        <div className="grid grid-cols-2 gap-2">
          {(["recolte", "achat"] as OrigineFourrage[]).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOrigine(o)}
              aria-pressed={form.origine === o}
              className={`px-3 py-2.5 text-sm font-semibold rounded-lg border transition-colors cursor-pointer ${
                form.origine === o
                  ? "bg-brand-50 border-brand-500 text-brand-700"
                  : "bg-white border-stone-300 text-stone-600 hover:bg-stone-50"
              }`}
            >
              {o === "recolte" ? "🌾 Récolté sur la ferme" : "🛒 Acheté"}
            </button>
          ))}
        </div>
        <p className="text-xs text-stone-400 mt-1">
          {achat
            ? "Les bottes achetées comptent dans le stock et l'objectif foin, mais jamais dans les rendements."
            : "Les récoltes alimentent les rendements et les analytics par parcelle."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Type d&apos;activité *</label>
          <select
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={form.typeActivite}
            onChange={(e) => setForm((p) => ({ ...p, typeActivite: e.target.value as TypeActivite }))}
            required
          >
            <option value="foin">Foin</option>
            <option value="regain">Regain</option>
            <option value="ensilage">Ensilage</option>
            {!achat && <option value="fauche">Fauche</option>}
            {!achat && <option value="paturage">Pâturage</option>}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Date *</label>
          <input
            type="date"
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={form.dateActivite}
            onChange={(e) => setForm((p) => ({ ...p, dateActivite: e.target.value }))}
            required
          />
        </div>
      </div>

      {!achat && (
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">Parcelles concernées</label>
          {partiels.length === 0 ? (
            <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Aucune parcelle créée — allez dans <strong>Parcellaire</strong> pour en ajouter.
            </p>
          ) : (
            <ParcelSelectorMap
              partiels={partiels}
              selectedIds={form.parcelIds}
              onToggle={togglePartiel}
            />
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Nombre de bottes</label>
          <input
            type="number"
            min="0"
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={form.nombreBottes}
            onChange={(e) => setForm((p) => ({ ...p, nombreBottes: e.target.value }))}
            placeholder="Ex : 120"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Poids par botte (kg)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={form.poidsBotteKg}
            onChange={(e) => setForm((p) => ({ ...p, poidsBotteKg: e.target.value }))}
            placeholder="Ex : 16.05"
          />
        </div>
      </div>
      {poidsTotalT !== null && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2.5 text-sm flex items-center justify-between">
          <span className="text-stone-600">Poids total calculé</span>
          <span className="font-bold text-stone-900">{poidsTotalT.toFixed(3)} t</span>
        </div>
      )}

      {achat && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Fournisseur</label>
            <input
              type="text"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={form.fournisseur}
              onChange={(e) => setForm((p) => ({ ...p, fournisseur: e.target.value }))}
              placeholder="Ex : GAEC des Prés"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Prix total (€)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={form.prixTotal}
              onChange={(e) => setForm((p) => ({ ...p, prixTotal: e.target.value }))}
              placeholder="Ex : 450"
            />
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Notes</label>
        <textarea
          rows={3}
          className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
          value={form.notes}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          placeholder={achat ? "Qualité, transport, conditions..." : "Observations, conditions météo..."}
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium bg-stone-100 text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-200 cursor-pointer"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 text-sm font-semibold text-white rounded-lg bg-brand-600 hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50"
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
  const [form, setForm] = useState<BottesFormData>({ nombreBottes: "", poidsBotteKg: "16.5" });

  const poidsTotalT = form.nombreBottes && form.poidsBotteKg
    ? (parseInt(form.nombreBottes) * parseFloat(form.poidsBotteKg)) / 1000
    : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Nombre de bottes *</label>
        <input
          type="number"
          min="0"
          className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          value={form.nombreBottes}
          onChange={(e) => setForm((p) => ({ ...p, nombreBottes: e.target.value }))}
          placeholder="Ex : 120"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Poids par botte (kg)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          value={form.poidsBotteKg}
          onChange={(e) => setForm((p) => ({ ...p, poidsBotteKg: e.target.value }))}
          placeholder="Ex : 16.05"
        />
      </div>
      {poidsTotalT !== null && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2.5 text-sm flex items-center justify-between">
          <span className="text-stone-600">Poids total calculé</span>
          <span className="font-bold text-stone-900">{poidsTotalT.toFixed(3)} t</span>
        </div>
      )}
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium bg-stone-100 text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-200 cursor-pointer"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 text-sm font-semibold text-white rounded-lg bg-brand-600 hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50"
        >
          {loading ? "Enregistrement..." : "Confirmer"}
        </button>
      </div>
    </form>
  );
}

// ==================== Page principale ====================

const DUREE_STABULATION = 120; // mi-novembre à mi-mars (~120 jours, variable selon neige)
const MOIS_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

/**
 * Consommation de foin en kg/jour selon l'espèce et l'âge en mois à la stabulation.
 * Tranches calibrées sur conso réelle (10t pour 6 bovins + 2 équins + 10 ovins sur 120j).
 */
function getConsoKgJour(type: string, ageMois: number | null): number {
  switch (type) {
    case "bovin":
      if (ageMois === null) return 9;
      if (ageMois < 3)  return 1;   // veau sous la mère, mange peu
      if (ageMois < 9)  return 3;   // veau sevré
      if (ageMois < 18) return 5;   // jeune bovin
      return 9;                     // adulte — calibré sur données réelles (10t pour l'ancienne composition)
    case "ovin":
      if (ageMois === null) return 2;
      if (ageMois < 3)  return 0.4; // agneau sous la mère
      if (ageMois < 9)  return 1;   // agneau sevré
      return 2;                     // adulte
    case "caprin":
      if (ageMois === null) return 1.8;
      if (ageMois < 3)  return 0.4;
      if (ageMois < 9)  return 0.9;
      return 1.8;
    case "equin":
      if (ageMois === null) return 10;
      if (ageMois < 6)  return 2;
      if (ageMois < 18) return 5;
      return 10;                    // adulte (calibré sur données réelles)
    case "porcin":
      return 0;
    default:
      return 0;
  }
}

/** Âge en mois à la date de début de la PROCHAINE stabulation (15 novembre).
 *  Si on est déjà en novembre ou après → on planifie pour l'année suivante.
 *  Ainsi les veaux nés cette année sont évalués avec leur âge réel à la mise en stabulation.
 */
function ageMoisAStabulation(dateNaissance: string | undefined): number | null {
  if (!dateNaissance) return null;
  const naissance = new Date(dateNaissance);
  if (isNaN(naissance.getTime())) return null;
  const now = new Date();
  // Prochaine stabulation : 15 novembre de cette année si on est avant nov, sinon l'an prochain
  const debutStab = new Date(now.getMonth() < 10 ? now.getFullYear() : now.getFullYear() + 1, 10, 15);
  const diffMs = debutStab.getTime() - naissance.getTime();
  if (diffMs < 0) return 0; // animal pas encore né à la stabulation → veau sous la mère
  return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44));
}

export default function FourragePage() {
  const { state } = useAppStore();
  const { showToast } = useToast();
  const { partiels, activitesFourrage } = state;

  const [modalOpen, setModalOpen] = useState<OrigineFourrage | null>(null);
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

  const bottesCeMois = totalBottes(activitesCeMois);
  const bottesRecolteesCeMois = totalBottes(activitesCeMois.filter((a) => !estAchat(a)));
  const bottesAcheteesCeMois = totalBottes(activitesCeMois.filter(estAchat));
  const surfaceTotale = partiels.reduce((sum, p) => sum + (p.surface ?? 0), 0);

  // Objectif foin basé sur les animaux actifs
  const animauxActifs = state.animaux.filter((a) => a.statut === "actif");
  const objectifFoinKg = animauxActifs.reduce((sum, a) => {
    const age = ageMoisAStabulation(a.dateNaissance);
    return sum + getConsoKgJour(a.type, age) * DUREE_STABULATION;
  }, 0);
  const objectifFoinT = objectifFoinKg / 1000;

  // Stock foin = récoltes + achats (les achats comptent pour l'objectif, pas pour les rendements)
  const stock = stockFoin(activitesFourrage);

  const progressPct = objectifFoinT > 0 ? Math.min(100, (stock.totalT / objectifFoinT) * 100) : 0;
  const manquantT = Math.max(0, objectifFoinT - stock.totalT);

  type AnimalType = "bovin" | "ovin" | "caprin" | "equin" | "porcin";
  const detailParType = (["bovin", "ovin", "caprin", "equin"] as AnimalType[]).map((type) => {
    const animauxDuType = animauxActifs.filter((a) => a.type === type);
    const consoMoyenne = animauxDuType.length > 0
      ? animauxDuType.reduce((s, a) => s + getConsoKgJour(a.type, ageMoisAStabulation(a.dateNaissance)), 0) / animauxDuType.length
      : getConsoKgJour(type, null);
    return { type, count: animauxDuType.length, conso: consoMoyenne };
  }).filter((d) => d.count > 0);

  const activitesTri = [...activitesFourrage].sort(
    (a, b) => new Date(b.dateActivite).getTime() - new Date(a.dateActivite).getTime()
  );

  // Analytics foin / regain — récoltes uniquement, les achats en sont exclus
  const totalFoinT = totalTonnes(recoltesDeType(activitesFourrage, "foin"));
  const totalRegainT = totalTonnes(recoltesDeType(activitesFourrage, "regain"));
  const surfaceFoin = surfaceRecolteeParType(partiels, activitesFourrage, "foin");
  const surfaceRegain = surfaceRecolteeParType(partiels, activitesFourrage, "regain");
  const rdtFoin = rendementMoyen(partiels, activitesFourrage, "foin");
  const rdtRegain = rendementMoyen(partiels, activitesFourrage, "regain");

  // Rendement par parcelle (récoltes à 1 seule parcelle uniquement)
  const rdtParParcelle = useMemo(
    () => rendementParParcelle<Partiel>(partiels, activitesFourrage),
    [partiels, activitesFourrage]
  );

  // Données mensuelles pour la courbe annuelle (récoltes uniquement)
  const donneesMensuelles = useMemo(
    () => donneesMensuellesRecoltes(activitesFourrage, thisYear, MOIS_LABELS),
    [activitesFourrage, thisYear]
  );

  const getPartielsNoms = (ids: string[] | null | undefined) =>
    (ids ?? [])
      .map((id) => partiels.find((p) => p.id === id)?.nom ?? id)
      .join(", ") || "—";

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

  // Handlers
  /** Champs communs création/édition — un achat n'a jamais de parcelle. */
  const buildPayload = (data: ActiviteFormData) => {
    const achat = data.origine === "achat";
    const nbBottes = data.nombreBottes ? parseInt(data.nombreBottes) : undefined;
    const poidsBotteKg = data.poidsBotteKg ? parseFloat(data.poidsBotteKg) : undefined;
    const poidsTonne = nbBottes && poidsBotteKg ? (nbBottes * poidsBotteKg) / 1000 : undefined;
    const prixTotal = achat && data.prixTotal ? parseFloat(data.prixTotal) : undefined;
    return {
      typeActivite: data.typeActivite,
      origine: data.origine,
      dateActivite: data.dateActivite,
      parcelIds: achat ? [] : data.parcelIds,
      nombreBottes: nbBottes,
      poidsBotteKg,
      poidsTonne,
      fournisseur: achat ? data.fournisseur || undefined : undefined,
      prixTotal,
      notes: data.notes || undefined,
      statut: (nbBottes ? "terminee" : "en_cours") as "terminee" | "en_cours",
    };
  };

  const handleCreate = async (data: ActiviteFormData) => {
    setSaving(true);
    try {
      const result = await createActivite(buildPayload(data));
      if (result.success) {
        showToast({ type: "success", title: data.origine === "achat" ? "Achat enregistré" : "Activité créée" });
        setModalOpen(null);
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
      const payload = buildPayload(data);
      // `null` supprime le champ côté Firebase (passage achat ↔ récolte)
      const result = await updateActivite(editActivite.id, {
        ...payload,
        parcelIds: payload.parcelIds.length ? payload.parcelIds : null,
        fournisseur: payload.fournisseur ?? null,
        prixTotal: payload.prixTotal ?? null,
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
      const poidsBotteKg = data.poidsBotteKg ? parseFloat(data.poidsBotteKg) : undefined;
      const result = await addBottesActivite(bottesModal.id, nbBottes, poidsBotteKg);
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
    <div>
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Fourrage</h1>
          <p className="text-stone-500 mt-1">Gestion des activités de coupe, de récolte et des achats de bottes</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:shrink-0">
          <button
            onClick={() => setModalOpen("achat")}
            className="w-full sm:w-auto whitespace-nowrap px-4 py-2 text-sm font-semibold text-sky-700 bg-sky-50 border border-sky-200 hover:bg-sky-100 rounded-lg transition-colors cursor-pointer"
          >
            🛒 Achat de bottes
          </button>
          <button
            onClick={() => setModalOpen("recolte")}
            className="w-full sm:w-auto whitespace-nowrap px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors cursor-pointer"
          >
            + Nouvelle activité
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard
          label="Parcellaire"
          value={partiels.length}
          subtitle="parcelles gérées"
          borderColorClass="border-l-brand-600"
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
          subtitle={`${bottesRecolteesCeMois} récoltées · ${bottesAcheteesCeMois} achetées`}
          borderColorClass="border-l-yellow-500"
          valueColorClass="text-yellow-600"
        />
        <KpiCard
          label="Surface totale"
          value={surfaceTotale > 0 ? `${surfaceTotale.toFixed(1)} ha` : "—"}
          subtitle="prairies gérées"
          borderColorClass="border-l-purple-500"
          valueColorClass="text-purple-600"
        />
      </div>

      {/* Objectif foin */}
      {objectifFoinT > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-5 mb-8">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-semibold text-stone-800">🎯 Objectif foin — saison</h2>
              <p className="text-xs text-stone-400 mt-0.5">{DUREE_STABULATION} jours de stabulation · {animauxActifs.length} animaux actifs</p>
            </div>
            <div className="text-right">
              <span className={`text-2xl font-bold ${progressPct >= 100 ? "text-green-600" : progressPct >= 60 ? "text-yellow-600" : "text-red-500"}`}>
                {progressPct.toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Barre de progression */}
          <div className="w-full bg-stone-100 rounded-full h-3 mb-3">
            <div
              className={`h-3 rounded-full transition-all ${progressPct >= 100 ? "bg-green-500" : progressPct >= 60 ? "bg-yellow-400" : "bg-red-400"}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* Chiffres */}
          <div className="flex items-center justify-between text-sm mb-4">
            <span className="text-stone-600">
              <span className="font-semibold text-stone-800">{stock.totalT.toFixed(1)} t</span> en stock
            </span>
            <span className="text-stone-400">sur</span>
            <span className="text-stone-600">
              objectif <span className="font-semibold text-stone-800">{objectifFoinT.toFixed(1)} t</span>
            </span>
            {manquantT > 0 && (
              <span className="text-red-500 font-medium">−{manquantT.toFixed(1)} t restantes</span>
            )}
            {manquantT === 0 && (
              <span className="text-green-600 font-medium">✓ Objectif atteint</span>
            )}
          </div>

          {/* Répartition stock : récolté vs acheté */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-stone-50 rounded-lg px-3 py-2">
              <p className="text-xs text-stone-400">Stock total</p>
              <p className="text-sm font-bold text-stone-800">{stock.totalT.toFixed(1)} t</p>
            </div>
            <div className="bg-yellow-50 rounded-lg px-3 py-2">
              <p className="text-xs text-stone-400">🌾 Récolté</p>
              <p className="text-sm font-bold text-yellow-700">{stock.recolteT.toFixed(1)} t</p>
              <p className="text-[11px] text-stone-400">{stock.bottesRecoltees} bottes</p>
            </div>
            <div className="bg-sky-50 rounded-lg px-3 py-2">
              <p className="text-xs text-stone-400">🛒 Acheté</p>
              <p className="text-sm font-bold text-sky-700">{stock.acheteT.toFixed(1)} t</p>
              <p className="text-[11px] text-stone-400">{stock.bottesAchetees} bottes</p>
            </div>
          </div>

          {/* Détail par type */}
          {detailParType.length > 0 && (
            <div className="border-t border-stone-100 pt-3">
              <p className="text-xs text-stone-400 mb-2">Détail par type</p>
              <div className="flex flex-wrap gap-2">
                {detailParType.map((d) => (
                  <div key={d.type} className="bg-stone-50 rounded-lg px-3 py-1.5 text-xs text-stone-600">
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
        <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-5 mb-8">
          <h2 className="text-base font-semibold text-stone-800">Analytics récoltes</h2>
          <p className="text-xs text-stone-400 mb-4">Récoltes de la ferme uniquement — les bottes achetées sont exclues.</p>

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

          {/* Courbe annuelle */}
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">Récoltes {thisYear} — par mois (tonnes)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={donneesMensuelles} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit=" t" />
              <Tooltip formatter={(v: number | undefined) => v != null ? `${v.toFixed(2)} t` : "—"} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="foin" name="Foin" fill="#eab308" radius={[3, 3, 0, 0]} />
              <Bar dataKey="regain" name="Regain" fill="#f59e0b" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>

          {rdtParParcelle.length > 0 && (
            <>
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mt-5 mb-2">Rendement par parcelle</p>
              <div className="overflow-x-auto overflow-x-auto rounded-lg border border-stone-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-stone-50 text-xs text-stone-500 font-semibold">
                      <th className="text-left px-4 py-2.5">Parcelle</th>
                      <th className="text-right px-4 py-2.5">Surface</th>
                      <th className="text-right px-4 py-2.5">Foin récolté</th>
                      <th className="text-right px-4 py-2.5">Regain récolté</th>
                      <th className="text-right px-4 py-2.5">Rdt t/ha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-50">
                    {rdtParParcelle.map((r) => (
                      <tr key={r.parcelle.id} className="hover:bg-stone-50">
                        <td className="px-4 py-2.5 font-medium text-stone-900">{r.parcelle.nom}</td>
                        <td className="px-4 py-2.5 text-right text-stone-500">{r.parcelle.surface} ha</td>
                        <td className="px-4 py-2.5 text-right text-yellow-700">
                          {r.foinT > 0 ? `${r.foinT.toFixed(2)} t` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right text-amber-700">
                          {r.regainT > 0 ? `${r.regainT.toFixed(2)} t` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-stone-800">
                          {r.rdt.toFixed(2)} t/ha
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-stone-400 mt-1.5">* Uniquement les chantiers avec une seule parcelle sélectionnée</p>
            </>
          )}
        </div>
      )}

      {/* Liste activités */}
      <div className="space-y-3">
        {activitesTri.length === 0 && (
          <div className="text-center py-16 text-stone-400">
            <div className="text-5xl mb-3">🌾</div>
            <p className="text-lg font-medium">Aucune activité enregistrée</p>
            <p className="text-sm mt-1">Cliquez sur &quot;+ Nouvelle activité&quot; pour commencer.</p>
          </div>
        )}
        {activitesTri.map((activite) => (
          <div
            key={activite.id}
            className="bg-white rounded-xl shadow-sm border border-stone-100 p-4 flex items-center gap-4"
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
                <span
                  className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${ORIGINE_COLORS[origineActivite(activite)]}`}
                >
                  {ORIGINE_LABELS[origineActivite(activite)]}
                </span>
                <span className="text-sm text-stone-500">{formatDate(activite.dateActivite)}</span>
              </div>
              {estAchat(activite) ? (
                <div className="mt-1 text-sm text-stone-700">
                  <span className="font-medium">Fournisseur :</span> {activite.fournisseur || "—"}
                  {activite.prixTotal != null && (
                    <span className="text-stone-500"> · {activite.prixTotal.toFixed(2)} €</span>
                  )}
                </div>
              ) : (
                <div className="mt-1 text-sm text-stone-700">
                  <span className="font-medium">Parcelles :</span> {getPartielsNoms(activite.parcelIds)}
                </div>
              )}
              <div className="mt-0.5 text-sm text-stone-600">
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
                <div className="mt-0.5 text-xs text-stone-400 italic truncate">{activite.notes}</div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {activite.statut === "en_cours" && (
                <button
                  onClick={() => setBottesModal(activite)}
                  className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg bg-amber-500 hover:bg-amber-600 transition-colors cursor-pointer"
                >
                  + Bottes
                </button>
              )}
              <button
                onClick={() => setEditActivite(activite)}
                className="p-2 text-stone-400 hover:text-brand-600 hover:bg-stone-100 rounded-lg cursor-pointer transition-colors"
                title="Modifier"
              >
                ✏️
              </button>
              <button
                onClick={() => setDeleteTarget(activite)}
                className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                title="Supprimer"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal création */}
      <Modal
        isOpen={!!modalOpen}
        onClose={() => setModalOpen(null)}
        title={modalOpen === "achat" ? "Achat de bottes" : "Nouvelle activité fourrage"}
      >
        {modalOpen && (
          <ActiviteForm
            key={modalOpen}
            partiels={partiels}
            initial={{ origine: modalOpen }}
            onSubmit={handleCreate}
            onCancel={() => setModalOpen(null)}
            loading={saving}
          />
        )}
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
              origine: origineActivite(editActivite),
              dateActivite: editActivite.dateActivite,
              parcelIds: editActivite.parcelIds ?? [],
              nombreBottes: editActivite.nombreBottes?.toString() ?? "",
              poidsBotteKg: editActivite.poidsBotteKg?.toString() ?? "16.5",
              fournisseur: editActivite.fournisseur ?? "",
              prixTotal: editActivite.prixTotal?.toString() ?? "",
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