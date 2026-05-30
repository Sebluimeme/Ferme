"use client";

import React, { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { useAppStore } from "@/store/store";
import Modal, { ConfirmModal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import type { Partiel } from "@/types/fourrage";
import { createPartiel, updatePartiel, deletePartiel } from "@/services/fourrage-service";
import type { CadastreSelectData } from "@/components/CadastreMap";

const CadastreMap = dynamic(() => import("@/components/CadastreMap"), { ssr: false });
const ParcelSplitEditor = dynamic(() => import("@/components/ParcelSplitEditor"), { ssr: false });
const ParcelOverviewMap = dynamic(() => import("@/components/ParcelOverviewMap"), { ssr: false });

// ==================== Types internes ====================

interface ParcellaireFD {
  nom: string;
  type: "pature" | "fauche" | "";
  surface: string;
  description: string;
}

// ==================== Formulaire ====================

function ParcellaireForm({
  initial,
  onSubmit,
  onCancel,
  loading,
}: {
  initial?: Partial<ParcellaireFD>;
  onSubmit: (data: ParcellaireFD) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<ParcellaireFD>({
    nom: initial?.nom ?? "",
    type: initial?.type ?? "",
    surface: initial?.surface ?? "",
    description: initial?.description ?? "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Nom de la parcelle *</label>
        <input
          type="text"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          value={form.nom}
          onChange={(e) => setForm((p) => ({ ...p, nom: e.target.value }))}
          placeholder="Ex : Pré du bas, Champ nord..."
          required
          autoFocus
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Usage</label>
        <div className="flex gap-2">
          {(["", "pature", "fauche"] as const).map((v) => {
            const label = v === "" ? "Non défini" : v === "pature" ? "🐄 Pâture" : "🌾 Fauche";
            return (
              <button
                key={v}
                type="button"
                onClick={() => setForm((p) => ({ ...p, type: v }))}
                className={`flex-1 py-2 px-3 text-sm rounded-lg border transition-colors cursor-pointer ${
                  form.type === v
                    ? v === "pature"
                      ? "bg-green-100 border-green-500 text-green-800 font-semibold"
                      : v === "fauche"
                      ? "bg-yellow-100 border-yellow-500 text-yellow-800 font-semibold"
                      : "bg-gray-200 border-gray-500 text-gray-800 font-semibold"
                    : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Surface (hectares)</label>
        <input
          type="text"
          inputMode="decimal"
          pattern="[0-9]*[.,]?[0-9]{0,4}"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          value={form.surface}
          onChange={(e) => {
            const v = e.target.value.replace(",", ".");
            if (/^(\d+\.?\d{0,4})?$/.test(v)) setForm((p) => ({ ...p, surface: v }));
          }}
          placeholder="Ex : 2.5 ou 1.2345"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          rows={3}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          placeholder="Type de sol, exposition, notes..."
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

// ==================== Badges ====================

function TypeBadge({ type }: { type?: string }) {
  if (!type) return null;
  if (type === "pature")
    return (
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
        🐄 Pâture
      </span>
    );
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
      🌾 Fauche
    </span>
  );
}

type FilterType = "tous" | "pature" | "fauche";

// ==================== Page ====================

export default function ParcellairePage() {
  const { state } = useAppStore();
  const { showToast } = useToast();
  const { partiels, activitesFourrage } = state;

  const [modalOpen, setModalOpen] = useState(false);
  const [editPartiel, setEditPartiel] = useState<Partiel | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Partiel | null>(null);
  const [saving, setSaving] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [filter, setFilter] = useState<FilterType>("tous");
  const [showOverviewMap, setShowOverviewMap] = useState(true);
  const [splitTarget, setSplitTarget] = useState<Partiel | null>(null);
  const [splitSaving, setSplitSaving] = useState(false);

  const [cadastrePrefill, setCadastrePrefill] = useState<{
    nom: string;
    surface: string;
    cadastreRef?: string;
    codeInsee?: string;
    section?: string;
    numeroParcelle?: string;
    geometry?: object;
  } | null>(null);

  const getActivitesCount = (partielId: string) =>
    activitesFourrage.filter((a) => a.parcelIds?.includes(partielId)).length;

  const filteredPartiels = useMemo(() => {
    if (filter === "tous") return partiels;
    return partiels.filter((p) => p.type === filter);
  }, [partiels, filter]);

  // Stats par type
  const nbPature = partiels.filter((p) => p.type === "pature").length;
  const nbFauche = partiels.filter((p) => p.type === "fauche").length;

  const handleCadastreSelect = (data: CadastreSelectData) => {
    setShowMap(false);
    setCadastrePrefill({
      nom: data.nom,
      surface: data.surface.toString(),
      cadastreRef: data.cadastreRef,
      codeInsee: data.codeInsee,
      section: data.section,
      numeroParcelle: data.numeroParcelle,
      geometry: data.geometry,
    });
    setModalOpen(true);
  };

  const handleCreate = async (data: ParcellaireFD) => {
    setSaving(true);
    try {
      const payload: Omit<Partiel, "id" | "dateCreation" | "derniereMAJ"> = {
        nom: data.nom.trim(),
        surface: data.surface ? parseFloat(data.surface) : undefined,
        description: data.description.trim() || undefined,
        type: data.type || undefined,
      };
      if (cadastrePrefill) {
        if (cadastrePrefill.cadastreRef) payload.cadastreRef = cadastrePrefill.cadastreRef;
        if (cadastrePrefill.codeInsee) payload.codeInsee = cadastrePrefill.codeInsee;
        if (cadastrePrefill.section) payload.section = cadastrePrefill.section;
        if (cadastrePrefill.numeroParcelle) payload.numeroParcelle = cadastrePrefill.numeroParcelle;
        if (cadastrePrefill.geometry) payload.geometry = cadastrePrefill.geometry;
      }
      const result = await createPartiel(payload);
      if (result.success) {
        showToast({ type: "success", title: "Parcelle créée" });
        setModalOpen(false);
        setCadastrePrefill(null);
      } else {
        showToast({ type: "error", title: "Erreur", message: result.error });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (data: ParcellaireFD) => {
    if (!editPartiel) return;
    setSaving(true);
    try {
      const result = await updatePartiel(editPartiel.id, {
        nom: data.nom.trim(),
        surface: data.surface ? parseFloat(data.surface) : undefined,
        description: data.description.trim() || undefined,
        type: data.type || undefined,
      });
      if (result.success) {
        showToast({ type: "success", title: "Parcelle mise à jour" });
        setEditPartiel(null);
      } else {
        showToast({ type: "error", title: "Erreur", message: result.error });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const result = await deletePartiel(deleteTarget.id);
    if (result.success) {
      showToast({ type: "success", title: "Parcelle supprimée" });
    } else {
      showToast({ type: "error", title: "Erreur", message: result.error });
    }
    setDeleteTarget(null);
  };

  const handleSplit = async (
    r1: number[][], r2: number[][], n1: string, n2: string, s1?: number, s2?: number
  ) => {
    if (!splitTarget) return;
    setSplitSaving(true);
    try {
      const base = {
        type: splitTarget.type,
        description: splitTarget.description,
        codeInsee: splitTarget.codeInsee,
        section: splitTarget.section,
      };
      const [res1, res2] = await Promise.all([
        createPartiel({ ...base, nom: n1, surface: s1, geometry: { type: "Polygon", coordinates: [r1] } }),
        createPartiel({ ...base, nom: n2, surface: s2, geometry: { type: "Polygon", coordinates: [r2] } }),
      ]);
      if (res1.success && res2.success) {
        await deletePartiel(splitTarget.id);
        showToast({ type: "success", title: `"${splitTarget.nom}" divisée en 2 parcelles` });
        setSplitTarget(null);
      } else {
        showToast({ type: "error", title: "Erreur lors de la division" });
      }
    } finally {
      setSplitSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* En-tête */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">🗺️ Parcellaire</h1>
          <p className="text-gray-500 mt-1">Gérez vos parcelles fourragères</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowMap(true)}
            className="px-4 py-2.5 text-sm font-semibold text-primary border border-primary rounded-xl hover:bg-primary/5 cursor-pointer"
          >
            📍 Cadastre
          </button>
          <button
            onClick={() => { setCadastrePrefill(null); setModalOpen(true); }}
            className="px-5 py-2.5 text-sm font-semibold text-white rounded-xl bg-gradient-to-br from-primary to-secondary hover:from-primary-dark hover:to-secondary-dark cursor-pointer shadow-md"
          >
            + Nouvelle parcelle
          </button>
        </div>
      </div>

      {/* Filtres */}
      {partiels.length > 0 && (
        <div className="flex gap-2 mb-5">
          {(["tous", "pature", "fauche"] as const).map((f) => {
            const label =
              f === "tous"
                ? `Toutes (${partiels.length})`
                : f === "pature"
                ? `🐄 Pâture (${nbPature})`
                : `🌾 Fauche (${nbFauche})`;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 text-sm rounded-full font-medium transition-colors cursor-pointer ${
                  filter === f
                    ? "bg-primary text-white shadow-sm"
                    : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Vue carte générale */}
      {partiels.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => setShowOverviewMap((v) => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-primary transition-colors mb-3 cursor-pointer"
          >
            <span>{showOverviewMap ? "▾" : "▸"}</span>
            <span>🗺️ Vue générale des terres</span>
            {partiels.filter((p) => p.geometry).length > 0 && (
              <span className="text-xs font-normal text-gray-400">
                {partiels.filter((p) => p.geometry).length} parcelle{partiels.filter((p) => p.geometry).length > 1 ? "s" : ""} sur la carte
              </span>
            )}
          </button>
          {showOverviewMap && <ParcelOverviewMap partiels={partiels} />}
        </div>
      )}

      {/* Grille parcelles */}
      {filteredPartiels.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">🗺️</div>
          <p className="text-lg font-medium">
            {partiels.length === 0 ? "Aucune parcelle créée" : "Aucune parcelle dans cette catégorie"}
          </p>
          {partiels.length === 0 && (
            <p className="text-sm mt-1">Cliquez sur &quot;+ Nouvelle parcelle&quot; pour commencer.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPartiels.map((partiel) => {
            const nbActivites = getActivitesCount(partiel.id);
            return (
              <div
                key={partiel.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-gray-900 truncate">{partiel.nom}</h3>
                      <TypeBadge type={partiel.type} />
                    </div>
                    {partiel.surface != null && (
                      <p className="text-sm text-primary font-semibold mt-0.5">
                        {partiel.surface} ha
                      </p>
                    )}
                    {partiel.cadastreRef && (
                      <p className="text-xs text-gray-400 mt-0.5 font-mono">{partiel.cadastreRef}</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0 ml-2">
                    {partiel.geometry && (
                      <button
                        onClick={() => setSplitTarget(partiel)}
                        className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg cursor-pointer transition-colors"
                        title="Diviser la parcelle"
                      >
                        ✂️
                      </button>
                    )}
                    <button
                      onClick={() => setEditPartiel(partiel)}
                      className="p-2 text-gray-400 hover:text-primary hover:bg-gray-100 rounded-lg cursor-pointer transition-colors"
                      title="Modifier"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => setDeleteTarget(partiel)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                      title="Supprimer"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {partiel.description && (
                  <p className="text-sm text-gray-500 line-clamp-2">{partiel.description}</p>
                )}

                <div className="pt-2 border-t border-gray-100">
                  <span className="text-xs font-medium text-gray-500">
                    {nbActivites} activité{nbActivites !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal carte cadastrale */}
      <Modal
        isOpen={showMap}
        onClose={() => setShowMap(false)}
        title="Sélectionner une parcelle cadastrale"
        size="large"
      >
        <div style={{ height: "600px" }} className="flex flex-col">
          <CadastreMap
            onSelect={handleCadastreSelect}
            onClose={() => setShowMap(false)}
          />
        </div>
      </Modal>

      {/* Modal création */}
      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setCadastrePrefill(null); }}
        title="Nouvelle parcelle"
        size="small"
      >
        {cadastrePrefill && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4 text-xs text-green-700">
            Données pré-remplies depuis le cadastre — {cadastrePrefill.cadastreRef}
          </div>
        )}
        <ParcellaireForm
          initial={cadastrePrefill ?? undefined}
          onSubmit={handleCreate}
          onCancel={() => { setModalOpen(false); setCadastrePrefill(null); }}
          loading={saving}
        />
      </Modal>

      {/* Modal édition */}
      <Modal
        isOpen={!!editPartiel}
        onClose={() => setEditPartiel(null)}
        title="Modifier la parcelle"
        size="small"
      >
        {editPartiel && (
          <ParcellaireForm
            initial={{
              nom: editPartiel.nom,
              type: editPartiel.type ?? "",
              surface: editPartiel.surface?.toString() ?? "",
              description: editPartiel.description ?? "",
            }}
            onSubmit={handleUpdate}
            onCancel={() => setEditPartiel(null)}
            loading={saving}
          />
        )}
      </Modal>

      {/* Modal suppression */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Supprimer la parcelle"
        message={`Êtes-vous sûr de vouloir supprimer la parcelle <strong>${deleteTarget?.nom ?? ""}</strong> ? Les activités associées ne seront pas supprimées.`}
        confirmText="Supprimer"
        danger
      />

      {/* Modal division */}
      <Modal
        isOpen={!!splitTarget}
        onClose={() => setSplitTarget(null)}
        title={`✂️ Diviser "${splitTarget?.nom ?? ""}"`}
        size="large"
      >
        {splitTarget && (
          <ParcelSplitEditor
            parcelle={splitTarget}
            onClose={() => setSplitTarget(null)}
            onConfirm={handleSplit}
            saving={splitSaving}
          />
        )}
      </Modal>
    </div>
  );
}
