"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { useAppStore } from "@/store/store";
import Modal, { ConfirmModal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import type { Partiel } from "@/types/fourrage";
import { createPartiel, updatePartiel, deletePartiel } from "@/services/fourrage-service";
import type { CadastreSelectData } from "@/components/CadastreMap";

// Import dynamique pour éviter le crash SSR (window is not defined)
const CadastreMap = dynamic(() => import("@/components/CadastreMap"), { ssr: false });

// ==================== Types internes ====================

interface PartielFormData {
  nom: string;
  surface: string;
  description: string;
}

// ==================== Formulaire partiel ====================

function PartielForm({
  initial,
  onSubmit,
  onCancel,
  loading,
}: {
  initial?: Partial<PartielFormData>;
  onSubmit: (data: PartielFormData) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<PartielFormData>({
    nom: initial?.nom ?? "",
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
        <label className="block text-sm font-medium text-gray-700 mb-1">Nom du partiel *</label>
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
        <label className="block text-sm font-medium text-gray-700 mb-1">Surface (hectares)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          value={form.surface}
          onChange={(e) => setForm((p) => ({ ...p, surface: e.target.value }))}
          placeholder="Ex : 2.5"
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

// ==================== Page partiels ====================

export default function PartielsPage() {
  const { state } = useAppStore();
  const { showToast } = useToast();
  const { partiels, activitesFourrage } = state;

  const [modalOpen, setModalOpen] = useState(false);
  const [editPartiel, setEditPartiel] = useState<Partiel | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Partiel | null>(null);
  const [saving, setSaving] = useState(false);
  const [showMap, setShowMap] = useState(false);

  // Données pré-remplies depuis le cadastre (stockées pour la création)
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

  const handleCadastreSelect = (data: CadastreSelectData) => {
    // Fermer la carte
    setShowMap(false);
    // Pré-remplir les données cadastrales
    setCadastrePrefill({
      nom: data.nom,
      surface: data.surface.toString(),
      cadastreRef: data.cadastreRef,
      codeInsee: data.codeInsee,
      section: data.section,
      numeroParcelle: data.numeroParcelle,
      geometry: data.geometry,
    });
    // Ouvrir le modal de création
    setModalOpen(true);
  };

  const handleCreate = async (data: PartielFormData) => {
    setSaving(true);
    try {
      const payload: Omit<Partiel, "id" | "dateCreation" | "derniereMAJ"> = {
        nom: data.nom.trim(),
        surface: data.surface ? parseFloat(data.surface) : undefined,
        description: data.description.trim() || undefined,
      };
      // Ajouter les champs cadastraux si disponibles
      if (cadastrePrefill) {
        if (cadastrePrefill.cadastreRef) payload.cadastreRef = cadastrePrefill.cadastreRef;
        if (cadastrePrefill.codeInsee) payload.codeInsee = cadastrePrefill.codeInsee;
        if (cadastrePrefill.section) payload.section = cadastrePrefill.section;
        if (cadastrePrefill.numeroParcelle) payload.numeroParcelle = cadastrePrefill.numeroParcelle;
        if (cadastrePrefill.geometry) payload.geometry = cadastrePrefill.geometry;
      }
      const result = await createPartiel(payload);
      if (result.success) {
        showToast({ type: "success", title: "Partiel créé" });
        setModalOpen(false);
        setCadastrePrefill(null);
      } else {
        showToast({ type: "error", title: "Erreur", message: result.error });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (data: PartielFormData) => {
    if (!editPartiel) return;
    setSaving(true);
    try {
      const result = await updatePartiel(editPartiel.id, {
        nom: data.nom.trim(),
        surface: data.surface ? parseFloat(data.surface) : undefined,
        description: data.description.trim() || undefined,
      });
      if (result.success) {
        showToast({ type: "success", title: "Partiel mis à jour" });
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
      showToast({ type: "success", title: "Partiel supprimé" });
    } else {
      showToast({ type: "error", title: "Erreur", message: result.error });
    }
    setDeleteTarget(null);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* En-tête */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">🗺️ Partiels</h1>
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
            + Nouveau partiel
          </button>
        </div>
      </div>

      {/* Grille partiels */}
      {partiels.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">🗺️</div>
          <p className="text-lg font-medium">Aucun partiel créé</p>
          <p className="text-sm mt-1">Cliquez sur &quot;+ Nouveau partiel&quot; pour commencer.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {partiels.map((partiel) => {
            const nbActivites = getActivitesCount(partiel.id);
            return (
              <div
                key={partiel.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-gray-900 truncate">{partiel.nom}</h3>
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
        title="Nouveau partiel"
        size="small"
      >
        {cadastrePrefill && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4 text-xs text-green-700">
            Données pré-remplies depuis le cadastre — {cadastrePrefill.cadastreRef}
          </div>
        )}
        <PartielForm
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
        title="Modifier le partiel"
        size="small"
      >
        {editPartiel && (
          <PartielForm
            initial={{
              nom: editPartiel.nom,
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
        title="Supprimer le partiel"
        message={`Êtes-vous sûr de vouloir supprimer le partiel <strong>${deleteTarget?.nom ?? ""}</strong> ? Les activités associées ne seront pas supprimées.`}
        confirmText="Supprimer"
        danger
      />
    </div>
  );
}
