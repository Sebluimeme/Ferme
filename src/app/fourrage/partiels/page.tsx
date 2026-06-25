"use client";

import React, { useState } from "react";
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
const ParcelGeometryEditor = dynamic(() => import("@/components/ParcelGeometryEditor"), { ssr: false });

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
        <label className="block text-sm font-medium text-stone-700 mb-1">Nom de la parcelle *</label>
        <input
          type="text"
          className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          value={form.nom}
          onChange={(e) => setForm((p) => ({ ...p, nom: e.target.value }))}
          placeholder="Ex : Pré du bas, Champ nord..."
          required
          autoFocus
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-2">Usage</label>
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
                      : "bg-stone-200 border-stone-500 text-stone-800 font-semibold"
                    : "bg-white border-stone-200 text-stone-500 hover:bg-stone-50"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Surface (hectares)</label>
        <input
          type="text"
          inputMode="decimal"
          pattern="[0-9]*[.,]?[0-9]{0,4}"
          className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          value={form.surface}
          onChange={(e) => {
            const v = e.target.value.replace(",", ".");
            if (/^(\d+\.?\d{0,4})?$/.test(v)) setForm((p) => ({ ...p, surface: v }));
          }}
          placeholder="Ex : 2.5 ou 1.2345"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Description</label>
        <textarea
          rows={3}
          className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          placeholder="Type de sol, exposition, notes..."
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

// ==================== Page ====================

export default function ParcellairePage() {
  const { state } = useAppStore();
  const { showToast } = useToast();
  const { partiels } = state;

  const [modalOpen, setModalOpen] = useState(false);
  const [editPartiel, setEditPartiel] = useState<Partiel | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Partiel | null>(null);
  const [saving, setSaving] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showOverviewMap, setShowOverviewMap] = useState(true);
  const [splitTarget, setSplitTarget] = useState<Partiel | null>(null);
  const [splitSaving, setSplitSaving] = useState(false);
  const [editGeoTarget, setEditGeoTarget] = useState<Partiel | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [pendingGeometry, setPendingGeometry] = useState<{ geometry: object; surfaceHa: number } | null>(null);
  const [geoSaving, setGeoSaving] = useState(false);

  const [cadastrePrefill, setCadastrePrefill] = useState<{
    nom: string;
    surface: string;
    cadastreRef?: string;
    codeInsee?: string;
    section?: string;
    numeroParcelle?: string;
    geometry?: object;
  } | null>(null);

  const parcelsSansGeo = partiels.filter((p) => !p.geometry);

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

  // Sauvegarde d'une géométrie éditée ou dessinée
  const handleSaveGeometry = async () => {
    if (!pendingGeometry) return;
    setGeoSaving(true);
    try {
      if (editGeoTarget) {
        // Edition de parcelle existante
        const result = await updatePartiel(editGeoTarget.id, {
          geometry: pendingGeometry.geometry,
          surface: pendingGeometry.surfaceHa > 0 ? pendingGeometry.surfaceHa : editGeoTarget.surface,
        });
        if (result.success) {
          showToast({ type: "success", title: "Géométrie mise à jour" });
          setEditGeoTarget(null);
          setPendingGeometry(null);
        } else {
          showToast({ type: "error", title: "Erreur", message: result.error });
        }
      } else if (drawMode) {
        // Dessin à main levée → pré-remplir le formulaire de création
        setDrawMode(false);
        setCadastrePrefill({
          nom: "",
          surface: pendingGeometry.surfaceHa.toString(),
          geometry: pendingGeometry.geometry,
        });
        setModalOpen(true);
        setPendingGeometry(null);
      }
    } finally {
      setGeoSaving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* En-tête */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-stone-900">🗺️ Parcellaire</h1>
          <p className="text-stone-500 mt-1">Gérez vos parcelles fourragères</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => { setDrawMode(true); setPendingGeometry(null); }}
            className="px-4 py-2 text-sm font-medium text-stone-700 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 hover:border-stone-300 transition-colors cursor-pointer"
          >
            ✍️ Tracer à main levée
          </button>
          <button
            onClick={() => setShowMap(true)}
            className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors cursor-pointer"
          >
            + Nouvelle parcelle
          </button>
        </div>
      </div>

      {/* Vue carte générale */}
      {partiels.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => setShowOverviewMap((v) => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-stone-700 hover:text-brand-600 transition-colors mb-3 cursor-pointer"
          >
            <span>{showOverviewMap ? "▾" : "▸"}</span>
            <span>🗺️ Vue générale des terres</span>
            {partiels.filter((p) => p.geometry).length > 0 && (
              <span className="text-xs font-normal text-stone-400">
                {partiels.filter((p) => p.geometry).length} parcelle{partiels.filter((p) => p.geometry).length > 1 ? "s" : ""} sur la carte
              </span>
            )}
          </button>
          {showOverviewMap && (
            <ParcelOverviewMap
              partiels={partiels}
              onDoubleClick={(p) => setEditPartiel(p)}
              onSplit={(p) => setSplitTarget(p)}
              onDelete={(p) => setDeleteTarget(p)}
              onAdd={handleCadastreSelect}
            />
          )}
        </div>
      )}

      {/* Parcelles avec géométrie — liste avec actions */}
      {partiels.filter((p) => p.geometry).length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">
            Parcelles sur la carte ({partiels.filter((p) => p.geometry).length})
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {partiels.filter((p) => p.geometry).map((partiel) => (
              <div
                key={partiel.id}
                className="flex flex-col justify-between bg-white border border-stone-100 rounded-xl p-4 hover:bg-stone-50 hover:border-brand-600/30 transition-colors min-h-[110px]"
              >
                <div className="flex flex-col gap-1.5 min-w-0">
                  <span className="font-semibold text-stone-900 text-sm leading-tight">{partiel.nom}</span>
                  {partiel.surface != null && (
                    <span className="text-xs text-brand-600 font-bold">{partiel.surface} ha</span>
                  )}
                  <TypeBadge type={partiel.type} />
                </div>
                <div className="flex gap-1 mt-3">
                  <button
                    onClick={() => setSplitTarget(partiel)}
                    className="py-1.5 px-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg cursor-pointer transition-colors"
                    title="Diviser"
                  >
                    ✂️
                  </button>
                  <button
                    onClick={() => { setEditGeoTarget(partiel); setPendingGeometry(null); }}
                    className="py-1.5 px-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg cursor-pointer transition-colors"
                    title="Éditer le tracé"
                  >
                    📐
                  </button>
                  <button
                    onClick={() => setEditPartiel(partiel)}
                    className="flex-1 py-1.5 text-xs text-stone-500 hover:text-brand-600 hover:bg-brand-600/5 rounded-lg cursor-pointer transition-colors text-center"
                    title="Modifier"
                  >
                    ✏️ Modifier
                  </button>
                  <button
                    onClick={() => setDeleteTarget(partiel)}
                    className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                    title="Supprimer"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Parcelles sans géométrie */}
      {parcelsSansGeo.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">
            Parcelles sans carte ({parcelsSansGeo.length})
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {parcelsSansGeo.map((partiel) => (
              <div
                key={partiel.id}
                className="flex flex-col justify-between bg-white border border-stone-100 rounded-xl p-4 hover:bg-stone-50 hover:border-brand-600/30 transition-colors min-h-[110px]"
              >
                <div className="flex flex-col gap-1.5 min-w-0">
                  <span className="font-semibold text-stone-900 text-sm leading-tight">{partiel.nom}</span>
                  {partiel.surface != null && (
                    <span className="text-xs text-brand-600 font-bold">{partiel.surface} ha</span>
                  )}
                  <TypeBadge type={partiel.type} />
                </div>
                <div className="flex gap-1 mt-3">
                  <button
                    onClick={() => setEditPartiel(partiel)}
                    className="flex-1 py-1.5 text-xs text-stone-500 hover:text-brand-600 hover:bg-brand-600/5 rounded-lg cursor-pointer transition-colors text-center"
                    title="Modifier"
                  >
                    ✏️ Modifier
                  </button>
                  <button
                    onClick={() => setDeleteTarget(partiel)}
                    className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                    title="Supprimer"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {partiels.length === 0 && (
        <div className="text-center py-16 text-stone-400">
          <div className="text-5xl mb-3">🗺️</div>
          <p className="text-lg font-medium">Aucune parcelle créée</p>
          <p className="text-sm mt-1">Cliquez sur &quot;+ Nouvelle parcelle&quot; pour commencer.</p>
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

      {/* Modal édition géométrie (vertices) */}
      <Modal
        isOpen={!!editGeoTarget}
        onClose={() => { setEditGeoTarget(null); setPendingGeometry(null); }}
        title={`📐 Éditer le tracé — "${editGeoTarget?.nom ?? ""}"`}
        size="large"
      >
        {editGeoTarget && (
          <div className="flex flex-col gap-3" style={{ minHeight: "480px" }}>
            <ParcelGeometryEditor
              initialGeometry={editGeoTarget.geometry}
              mode="edit"
              onChange={(geometry, surfaceHa) => setPendingGeometry({ geometry, surfaceHa })}
            />
            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => { setEditGeoTarget(null); setPendingGeometry(null); }}
                className="px-4 py-2 text-sm font-medium bg-stone-100 text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-200 cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={!pendingGeometry || geoSaving}
                onClick={handleSaveGeometry}
                className="px-5 py-2 text-sm font-semibold text-white rounded-lg bg-brand-600 hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                {geoSaving ? "Enregistrement..." : "Enregistrer le tracé"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal dessin à main levée */}
      <Modal
        isOpen={drawMode}
        onClose={() => { setDrawMode(false); setPendingGeometry(null); }}
        title="✍️ Tracer une parcelle à main levée"
        size="large"
      >
        <div className="flex flex-col gap-3" style={{ minHeight: "480px" }}>
          <ParcelGeometryEditor
            mode="draw"
            onChange={(geometry, surfaceHa) => setPendingGeometry({ geometry, surfaceHa })}
          />
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={() => { setDrawMode(false); setPendingGeometry(null); }}
              className="px-4 py-2 text-sm font-medium bg-stone-100 text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-200 cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={!pendingGeometry}
              onClick={handleSaveGeometry}
              className="px-5 py-2 text-sm font-semibold text-white rounded-lg bg-amber-500 hover:bg-amber-600 transition-colors cursor-pointer disabled:opacity-50"
            >
              Valider ce tracé →
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}