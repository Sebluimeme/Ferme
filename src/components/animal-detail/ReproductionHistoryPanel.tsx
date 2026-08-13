"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import {
  deleteChaleur,
  deleteHistoryEntry,
  type ChaleurEntry,
  type HistoryEntry,
} from "@/services/animal-detail-service";
import { deleteGestationSuivi } from "@/services/animal-service";
import { formatDate } from "@/lib/utils";
import type { Animal } from "@/store/store";

interface ReproductionHistoryPanelProps {
  history: HistoryEntry[];
  chaleurs: ChaleurEntry[];
  animal: Animal;
}

type TimelineItem = {
  id: string;
  date: string;
  label: string;
  detail?: string;
  icon: string;
  source: "active-saillie" | "chaleur" | "history";
  sourceId?: string;
};

export default function ReproductionHistoryPanel({ history, chaleurs, animal }: ReproductionHistoryPanelProps) {
  const { showToast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<TimelineItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const items: TimelineItem[] = [
    ...(animal.dateSaillie ? [{
      id: `active-saillie-${animal.dateSaillie}`,
      date: animal.dateSaillie,
      label: "Saillie / insémination en cours",
      detail: "Suivi de gestation actif",
      icon: "🐑",
      source: "active-saillie" as const,
    }] : []),
    ...chaleurs.map((entry) => ({
      id: `chaleur-${entry.id}`,
      date: entry.date,
      label: "Chaleur observée",
      detail: entry.note,
      icon: "🔥",
      source: "chaleur" as const,
      sourceId: entry.id,
    })),
    ...history
      .filter((entry) => entry.categorie === "reproduction" || /saillie|insémination|mise bas/i.test(entry.sujet))
      .map((entry) => ({
        id: `history-${entry.id}`,
        date: entry.date,
        label: entry.sujet,
        detail: entry.description,
        icon: /mise bas/i.test(entry.sujet) ? "🍼" : "🐑",
        source: "history" as const,
        sourceId: entry.id,
      })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const canDelete = (item: TimelineItem) =>
    item.source === "active-saillie" ||
    item.source === "chaleur" ||
    (item.source === "history" && /saillie|insémination/i.test(item.label));

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const result = deleteTarget.source === "active-saillie"
        ? await deleteGestationSuivi(animal.id)
        : deleteTarget.source === "chaleur" && deleteTarget.sourceId
          ? await deleteChaleur(animal.id, deleteTarget.sourceId)
          : deleteTarget.sourceId
            ? await deleteHistoryEntry(animal.id, deleteTarget.sourceId)
            : { success: false, error: "Événement introuvable" };

      if (result.success) {
        showToast({ type: "success", title: "Succès", message: "Événement supprimé" });
        setDeleteTarget(null);
      } else {
        showToast({ type: "error", title: "Erreur", message: result.error || "Erreur" });
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="reproduction-history-title">
      <div className="mb-5">
        <h2 id="reproduction-history-title" className="text-lg font-semibold text-stone-900">Historique de reproduction</h2>
        <p className="mt-1 text-sm text-stone-500">Chaleurs, saillies et mises bas enregistrées pour cet animal.</p>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">Aucun événement de reproduction enregistré.</p>
      ) : (
        <ol className="space-y-1">
          {items.map((item) => (
            <li key={item.id} className="flex gap-3 border-b border-stone-100 py-3 last:border-b-0">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600/10" aria-hidden="true">{item.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                  <span className="text-base font-medium text-stone-800">{item.label}</span>
                  <time className="text-sm text-stone-500" dateTime={item.date}>{formatDate(item.date)}</time>
                </div>
                {item.detail && <p className="mt-1 text-sm leading-relaxed text-stone-600">{item.detail}</p>}
              </div>
              {canDelete(item) && (
                <button
                  type="button"
                  onClick={() => setDeleteTarget(item)}
                  className="shrink-0 self-center px-2 py-1 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md cursor-pointer"
                  aria-label={`Supprimer ${item.label.toLowerCase()} du ${formatDate(item.date)}`}
                >
                  Supprimer
                </button>
              )}
            </li>
          ))}
        </ol>
      )}

      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Supprimer l'événement" size="small">
        <p className="text-stone-700">
          Voulez-vous vraiment supprimer <strong>{deleteTarget?.label.toLowerCase()}</strong>
          {deleteTarget ? ` du ${formatDate(deleteTarget.date)}` : ""} ?
        </p>
        <div className="flex gap-3 justify-end mt-6">
          <button
            onClick={() => setDeleteTarget(null)}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium bg-stone-100 text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-200 cursor-pointer disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 cursor-pointer disabled:opacity-50"
          >
            {deleting ? "Suppression..." : "Supprimer"}
          </button>
        </div>
      </Modal>
    </section>
  );
}
