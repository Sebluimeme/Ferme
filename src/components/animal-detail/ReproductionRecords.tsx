"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import Modal from "@/components/Modal";
import { addChaleur, deleteChaleur, type ChaleurEntry } from "@/services/animal-detail-service";
import { updateGestationSuivi, clearGestationSuivi, deleteGestationSuivi } from "@/services/animal-service";
import { formatDate } from "@/lib/utils";
import {
  getGestationDurationDays,
  calculateEstimatedBirthDate,
  formatGestationDate,
  getNextHeatDate,
} from "@/lib/reproduction";
import type { Animal } from "@/store/store";

interface ReproductionRecordsProps {
  animal: Animal;
  chaleurs: ChaleurEntry[];
}

export default function ReproductionRecords({ animal, chaleurs }: ReproductionRecordsProps) {
  const { showToast } = useToast();
  const [editingSaillie, setEditingSaillie] = useState(false);
  const [savingSaillie, setSavingSaillie] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [deleteSaillieOpen, setDeleteSaillieOpen] = useState(false);
  const [deletingSaillie, setDeletingSaillie] = useState(false);
  const [showChaleurForm, setShowChaleurForm] = useState(false);
  const [savingChaleur, setSavingChaleur] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChaleurEntry | null>(null);

  const gestationDays = getGestationDurationDays(animal);
  const estimatedBirthDate = animal.dateSaillie
    ? calculateEstimatedBirthDate(animal.dateSaillie, gestationDays)
    : null;

  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  const enGestation = !!estimatedBirthDate && (() => {
    const b = new Date(estimatedBirthDate);
    b.setHours(0, 0, 0, 0);
    return b.getTime() >= todayMidnight.getTime();
  })();

  const nextHeatDate = !enGestation ? getNextHeatDate(animal, chaleurs) : null;
  const joursAvantChaleur = nextHeatDate
    ? Math.round((nextHeatDate.getTime() - todayMidnight.getTime()) / 86400000)
    : null;

  const sortedChaleurs = [...chaleurs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const handleSaillieSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const dateSaillie = formData.get("dateSaillie") as string;
    const dureeGestationJours = formData.get("dureeGestationJours") as string;

    setSavingSaillie(true);
    try {
      const result = await updateGestationSuivi(animal.id, { dateSaillie, dureeGestationJours });
      if (result.success) {
        showToast({ type: "success", title: "Succès", message: "Saillie enregistrée" });
        setEditingSaillie(false);
      } else {
        showToast({ type: "error", title: "Erreur", message: result.error || "Erreur" });
      }
    } finally {
      setSavingSaillie(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      const result = await clearGestationSuivi(animal.id);
      if (result.success) {
        showToast({ type: "success", title: "Succès", message: "Mise bas archivée et suivi clôturé" });
      } else {
        showToast({ type: "error", title: "Erreur", message: result.error || "Erreur" });
      }
    } finally {
      setClearing(false);
    }
  };

  const handleDeleteSaillie = async () => {
    setDeletingSaillie(true);
    try {
      const result = await deleteGestationSuivi(animal.id);
      if (result.success) {
        showToast({ type: "success", title: "Succès", message: "Saillie supprimée" });
        setDeleteSaillieOpen(false);
      } else {
        showToast({ type: "error", title: "Erreur", message: result.error || "Erreur" });
      }
    } finally {
      setDeletingSaillie(false);
    }
  };

  const handleChaleurSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const date = formData.get("date") as string;
    const note = (formData.get("note") as string)?.trim() || undefined;

    if (!date) {
      showToast({ type: "error", title: "Erreur", message: "Date obligatoire" });
      return;
    }

    setSavingChaleur(true);
    try {
      const result = await addChaleur(animal.id, { date, note });
      if (result.success) {
        showToast({ type: "success", title: "Succès", message: "Chaleur enregistrée" });
        setShowChaleurForm(false);
      } else {
        showToast({ type: "error", title: "Erreur", message: result.error || "Erreur" });
      }
    } finally {
      setSavingChaleur(false);
    }
  };

  const handleDeleteChaleur = async () => {
    if (!deleteTarget) return;
    const result = await deleteChaleur(animal.id, deleteTarget.id);
    if (result.success) {
      showToast({ type: "success", title: "Succès", message: "Chaleur supprimée" });
    } else {
      showToast({ type: "error", title: "Erreur", message: result.error || "Erreur" });
    }
    setDeleteTarget(null);
  };

  return (
    <div className="grid gap-6">
      {/* Saillie / insémination */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Saillie / insémination</h2>
          {!editingSaillie && (
            <button
              onClick={() => setEditingSaillie(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 cursor-pointer"
            >
              {animal.dateSaillie ? "Modifier" : "+ Enregistrer une saillie"}
            </button>
          )}
        </div>

        {editingSaillie ? (
          <form onSubmit={handleSaillieSubmit} className="grid gap-4">
            <div>
              <label className="block mb-1 text-sm font-medium text-stone-700">Date de saillie / insémination *</label>
              <input
                type="date"
                name="dateSaillie"
                defaultValue={animal.dateSaillie || ""}
                required
                className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10"
              />
            </div>
            <div>
              <label className="block mb-1 text-sm font-medium text-stone-700">Durée de gestation (jours)</label>
              <input
                type="number"
                name="dureeGestationJours"
                defaultValue={animal.dureeGestationJours || ""}
                placeholder={`Par défaut : ${gestationDays} j`}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10"
              />
            </div>
            <div className="flex gap-3 justify-end mt-2">
              <button
                type="button"
                onClick={() => setEditingSaillie(false)}
                className="px-4 py-2 text-sm font-medium bg-stone-100 text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-200 cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={savingSaillie}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 cursor-pointer disabled:opacity-50"
              >
                {savingSaillie ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </form>
        ) : animal.dateSaillie ? (
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between border-b border-stone-100 pb-2">
              <span className="text-stone-500">Date de saillie</span>
              <span className="font-medium">{formatDate(animal.dateSaillie)}</span>
            </div>
            <div className="flex justify-between border-b border-stone-100 pb-2">
              <span className="text-stone-500">Durée de gestation</span>
              <span className="font-medium">{gestationDays} j</span>
            </div>
            {estimatedBirthDate && (
              <div className="flex justify-between pb-2">
                <span className="text-stone-500">Mise bas estimée</span>
                <span className="font-medium">{formatGestationDate(estimatedBirthDate)}</span>
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={handleClear}
                disabled={clearing}
                className="px-3 py-1.5 text-xs font-medium bg-white border border-stone-300 rounded-lg hover:bg-stone-50 cursor-pointer disabled:opacity-50"
                title="Effacer le suivi une fois la mise bas constatée"
              >
                {clearing ? "…" : "✓ Mise bas constatée"}
              </button>
              <button
                onClick={() => setDeleteSaillieOpen(true)}
                className="px-3 py-1.5 text-xs font-medium bg-white text-red-600 border border-red-200 rounded-lg hover:bg-red-50 cursor-pointer"
              >
                Supprimer la saillie
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-stone-400">
            <div className="text-4xl mb-2">🐑</div>
            <p>Aucune saillie enregistrée</p>
          </div>
        )}
      </div>

      {/* Chaleurs */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Chaleurs observées</h2>
          <button
            onClick={() => setShowChaleurForm(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 cursor-pointer"
          >
            + Ajouter une observation
          </button>
        </div>

        {sortedChaleurs.length === 0 ? (
          <div className="text-center py-12 text-stone-400">
            <div className="text-4xl mb-2">🔥</div>
            <p>Aucune chaleur enregistrée</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedChaleurs.map((c) => (
              <div key={c.id} className="flex items-center justify-between border border-stone-100 rounded-lg px-3 py-2">
                <div>
                  <span className="text-sm font-medium">{formatDate(c.date)}</span>
                  {c.note && <span className="text-sm text-stone-500 ml-2">— {c.note}</span>}
                </div>
                <button
                  onClick={() => setDeleteTarget(c)}
                  className="text-red-500 hover:text-red-700 text-xs cursor-pointer bg-transparent border-none"
                >
                  Supprimer
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Prochaine chaleur estimée */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold mb-4">Prochaine chaleur estimée</h2>
        {enGestation ? (
          <p className="text-sm text-stone-500">Femelle en gestation — pas de chaleur prévue.</p>
        ) : nextHeatDate && joursAvantChaleur !== null ? (
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-stone-900">{formatGestationDate(nextHeatDate)}</span>
            <span className="text-sm text-stone-500">
              {joursAvantChaleur === 0 ? "aujourd'hui" : joursAvantChaleur === 1 ? "demain" : `dans ${joursAvantChaleur} j`}
            </span>
          </div>
        ) : (
          <p className="text-sm text-stone-400">
            Aucune chaleur observée pour le moment — ajoutez une observation pour estimer la prochaine.
          </p>
        )}
      </div>

      {/* Modal ajout chaleur */}
      <Modal isOpen={showChaleurForm} onClose={() => setShowChaleurForm(false)} title="Ajouter une chaleur" size="small">
        <form onSubmit={handleChaleurSubmit} className="grid gap-4">
          <div>
            <label className="block mb-1 text-sm font-medium text-stone-700">Date *</label>
            <input
              type="date"
              name="date"
              defaultValue={new Date().toISOString().split("T")[0]}
              required
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10"
            />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium text-stone-700">Note (optionnel)</label>
            <input
              type="text"
              name="note"
              placeholder="Comportement observé..."
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10"
            />
          </div>
          <div className="flex gap-3 justify-end mt-2">
            <button
              type="button"
              onClick={() => setShowChaleurForm(false)}
              className="px-4 py-2 text-sm font-medium bg-stone-100 text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-200 cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={savingChaleur}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 cursor-pointer disabled:opacity-50"
            >
              {savingChaleur ? "Enregistrement..." : "Ajouter"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm delete */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Supprimer la chaleur" size="small">
        <p className="text-stone-700">
          Voulez-vous vraiment supprimer l&apos;observation du <strong>{deleteTarget && formatDate(deleteTarget.date)}</strong> ?
        </p>
        <div className="flex gap-3 justify-end mt-6">
          <button
            onClick={() => setDeleteTarget(null)}
            className="px-4 py-2 text-sm font-medium bg-stone-100 text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-200 cursor-pointer"
          >
            Annuler
          </button>
          <button
            onClick={handleDeleteChaleur}
            className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 cursor-pointer"
          >
            Supprimer
          </button>
        </div>
      </Modal>

      <Modal isOpen={deleteSaillieOpen} onClose={() => setDeleteSaillieOpen(false)} title="Supprimer la saillie" size="small">
        <p className="text-stone-700">
          Voulez-vous vraiment supprimer la saillie du <strong>{animal.dateSaillie && formatDate(animal.dateSaillie)}</strong> ?
          Cette action n&apos;enregistrera pas de mise bas.
        </p>
        <div className="flex gap-3 justify-end mt-6">
          <button
            onClick={() => setDeleteSaillieOpen(false)}
            disabled={deletingSaillie}
            className="px-4 py-2 text-sm font-medium bg-stone-100 text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-200 cursor-pointer disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={handleDeleteSaillie}
            disabled={deletingSaillie}
            className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 cursor-pointer disabled:opacity-50"
          >
            {deletingSaillie ? "Suppression..." : "Supprimer"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
