"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import Modal from "@/components/Modal";
import { addHistoryEntry, updateHistoryEntry, deleteHistoryEntry, type HistoryEntry } from "@/services/animal-detail-service";
import { formatDate } from "@/lib/utils";

interface HistoryTimelineProps {
  animalId: string;
  history: HistoryEntry[];
}

export default function HistoryTimeline({ animalId, history }: HistoryTimelineProps) {
  const { showToast } = useToast();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState<HistoryEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HistoryEntry | null>(null);
  const [saving, setSaving] = useState(false);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sortedHistory = [...history].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const date = formData.get("date") as string;
    const sujet = (formData.get("sujet") as string).trim();
    const description = (formData.get("description") as string).trim() || undefined;

    if (!date || !sujet) {
      showToast({ type: "error", title: "Erreur", message: "Date et sujet obligatoires" });
      return;
    }

    setSaving(true);
    try {
      if (editEntry) {
        const result = await updateHistoryEntry(animalId, editEntry.id, { date, sujet, description });
        if (result.success) {
          showToast({ type: "success", title: "Succès", message: "Entrée modifiée" });
          setEditEntry(null);
        } else {
          showToast({ type: "error", title: "Erreur", message: result.error || "Erreur" });
        }
      } else {
        const result = await addHistoryEntry(animalId, { date, sujet, description });
        if (result.success) {
          showToast({ type: "success", title: "Succès", message: "Entrée ajoutée" });
          setShowForm(false);
        } else {
          showToast({ type: "error", title: "Erreur", message: result.error || "Erreur" });
        }
      }
    } catch {
      showToast({ type: "error", title: "Erreur", message: "Erreur lors de l'enregistrement" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteHistoryEntry(animalId, deleteTarget.id);
    if (result.success) {
      showToast({ type: "success", title: "Succès", message: "Entrée supprimée" });
    } else {
      showToast({ type: "error", title: "Erreur", message: result.error || "Erreur" });
    }
    setDeleteTarget(null);
  };

  const openEdit = (entry: HistoryEntry) => {
    setEditEntry(entry);
    setShowForm(false);
  };

  const closeModal = () => {
    setShowForm(false);
    setEditEntry(null);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Historique</h2>
        <button
          onClick={() => { setEditEntry(null); setShowForm(true); }}
          className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 cursor-pointer"
        >
          + Ajouter
        </button>
      </div>

      {sortedHistory.length === 0 ? (
        <div className="text-center py-12 text-stone-400">
          <div className="text-4xl mb-2">📝</div>
          <p>Aucun historique</p>
        </div>
      ) : (
        <div className="divide-y divide-stone-100">
          {sortedHistory.map((entry) => {
            const isExpanded = expandedIds.has(entry.id);
            return (
              <div key={entry.id} className="py-3">
                <div
                  className="flex items-center gap-3 cursor-pointer select-none"
                  onClick={() => toggleExpand(entry.id)}
                >
                  <span className="text-stone-400 text-xs w-5 text-center shrink-0">
                    {isExpanded ? "▾" : "▸"}
                  </span>
                  <span className="text-xs text-stone-400 shrink-0 w-[85px]">{formatDate(entry.date)}</span>
                  <span className="font-medium text-sm flex-1">{entry.sujet}</span>
                </div>
                {isExpanded && (
                  <div className="ml-8 mt-2 pl-4 border-l-2 border-stone-200">
                    {entry.description ? (
                      <p className="text-sm text-stone-600 whitespace-pre-wrap">{entry.description}</p>
                    ) : (
                      <p className="text-sm text-stone-400 italic">Pas de description</p>
                    )}
                    <div className="flex gap-3 mt-2">
                      <button
                        onClick={() => openEdit(entry)}
                        className="text-xs text-brand-600 hover:underline cursor-pointer bg-transparent border-none p-0"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => setDeleteTarget(entry)}
                        className="text-xs text-red-500 hover:underline cursor-pointer bg-transparent border-none p-0"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal ajout/édition */}
      <Modal
        isOpen={showForm || !!editEntry}
        onClose={closeModal}
        title={editEntry ? "Modifier l'entrée" : "Ajouter une entrée"}
        size="medium"
      >
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div>
            <label className="block mb-1 text-sm font-medium text-stone-700">Date *</label>
            <input
              type="date"
              name="date"
              defaultValue={editEntry?.date || new Date().toISOString().split("T")[0]}
              required
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10"
            />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium text-stone-700">Sujet *</label>
            <input
              type="text"
              name="sujet"
              defaultValue={editEntry?.sujet || ""}
              required
              placeholder="Visite vétérinaire, vaccination..."
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10"
            />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium text-stone-700">Description (optionnel)</label>
            <textarea
              name="description"
              defaultValue={editEntry?.description || ""}
              placeholder="Détails complémentaires..."
              rows={4}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10 resize-y"
            />
          </div>
          <div className="flex gap-3 justify-end mt-2">
            <button type="button" onClick={closeModal} className="px-4 py-2 text-sm font-medium bg-stone-100 text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-200 cursor-pointer">
              Annuler
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 cursor-pointer disabled:opacity-50">
              {saving ? "Enregistrement..." : editEntry ? "Enregistrer" : "Ajouter"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm delete */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Supprimer l'entrée" size="small">
        <p className="text-stone-700">
          Voulez-vous vraiment supprimer l&apos;entrée <strong>{deleteTarget?.sujet}</strong> du {deleteTarget && formatDate(deleteTarget.date)} ?
        </p>
        <div className="flex gap-3 justify-end mt-6">
          <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm font-medium bg-stone-100 text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-200 cursor-pointer">
            Annuler
          </button>
          <button onClick={handleDelete} className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 cursor-pointer">
            Supprimer
          </button>
        </div>
      </Modal>
    </div>
  );
}