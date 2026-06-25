"use client";

import { useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useToast } from "@/components/Toast";
import Modal from "@/components/Modal";
import { addWeight, deleteWeight, type WeightEntry } from "@/services/animal-detail-service";
import { getAnimalColor, formatDate, formatNumber } from "@/lib/utils";

interface WeightChartProps {
  animalId: string;
  animalType: string;
  weights: WeightEntry[];
}

export default function WeightChart({ animalId, animalType, weights }: WeightChartProps) {
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WeightEntry | null>(null);

  const sortedWeights = useMemo(
    () => [...weights].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [weights]
  );

  const chartData = useMemo(
    () => sortedWeights.map((w) => ({
      date: new Date(w.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }),
      poids: w.poids,
    })),
    [sortedWeights]
  );

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const poids = parseFloat(formData.get("poids") as string);
    const date = formData.get("date") as string;
    const note = (formData.get("note") as string) || undefined;

    if (!poids || poids <= 0 || !date) {
      showToast({ type: "error", title: "Erreur", message: "Poids et date obligatoires" });
      return;
    }

    setSaving(true);
    try {
      const result = await addWeight(animalId, { poids, date, note });
      if (result.success) {
        showToast({ type: "success", title: "Succès", message: "Pesée ajoutée" });
        setShowForm(false);
      } else {
        showToast({ type: "error", title: "Erreur", message: result.error || "Erreur" });
      }
    } catch {
      showToast({ type: "error", title: "Erreur", message: "Erreur lors de l'enregistrement" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteWeight(animalId, deleteTarget.id);
    if (result.success) {
      showToast({ type: "success", title: "Succès", message: "Pesée supprimée" });
    } else {
      showToast({ type: "error", title: "Erreur", message: result.error || "Erreur" });
    }
    setDeleteTarget(null);
  };

  const color = getAnimalColor(animalType);

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Évolution du poids</h2>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 cursor-pointer"
        >
          + Ajouter une pesée
        </button>
      </div>

      {/* Graphique */}
      {chartData.length >= 2 ? (
        <div className="mb-6" style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} unit=" kg" />
              <Tooltip formatter={(value) => [`${formatNumber(Number(value), 2)} kg`, "Poids"]} />
              <Line type="monotone" dataKey="poids" stroke={color} strokeWidth={2} dot={{ r: 4, fill: color }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : chartData.length === 1 ? (
        <div className="text-center py-8 text-stone-400 mb-6">
          <p>Ajoutez au moins 2 pesées pour voir le graphique</p>
        </div>
      ) : null}

      {/* Tableau */}
      {weights.length === 0 ? (
        <div className="text-center py-12 text-stone-400">
          <div className="text-4xl mb-2">⚖️</div>
          <p>Aucune pesée enregistrée</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200">
                <th className="text-left py-2 font-medium text-stone-500">Date</th>
                <th className="text-left py-2 font-medium text-stone-500">Poids</th>
                <th className="text-left py-2 font-medium text-stone-500">Note</th>
                <th className="text-right py-2 font-medium text-stone-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {[...weights].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((w) => (
                <tr key={w.id} className="border-b border-stone-100">
                  <td className="py-2">{formatDate(w.date)}</td>
                  <td className="py-2 font-medium">{formatNumber(w.poids, 2)} kg</td>
                  <td className="py-2 text-stone-500">{w.note || "-"}</td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => setDeleteTarget(w)}
                      className="text-red-500 hover:text-red-700 text-xs cursor-pointer bg-transparent border-none"
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal ajout pesée */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="Ajouter une pesée" size="small">
        <form onSubmit={handleAdd} className="grid gap-4">
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
            <label className="block mb-1 text-sm font-medium text-stone-700">Poids (kg) *</label>
            <input
              type="number"
              name="poids"
              step="0.01"
              min="0"
              required
              placeholder="45.50"
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10"
            />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium text-stone-700">Note (optionnel)</label>
            <input
              type="text"
              name="note"
              placeholder="Après sevrage..."
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10"
            />
          </div>
          <div className="flex gap-3 justify-end mt-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-medium bg-stone-100 text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-200 cursor-pointer">
              Annuler
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 cursor-pointer disabled:opacity-50">
              {saving ? "Enregistrement..." : "Ajouter"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm delete */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Supprimer la pesée" size="small">
        <p className="text-stone-700">
          Voulez-vous vraiment supprimer la pesée du <strong>{deleteTarget && formatDate(deleteTarget.date)}</strong> ({deleteTarget?.poids} kg) ?
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