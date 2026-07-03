"use client";

import React, { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Fuel, Pencil, Trash2, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { useAppStore } from "@/store/store";
import { useToast } from "@/components/Toast";
import KpiCard from "@/components/KpiCard";
import Modal, { ConfirmModal } from "@/components/Modal";
import type { PleinCarburant, PleinCarburantFormData } from "@/types/carburant";
import { EMPTY_FORM, computeCarburantStats, aggregateByMonth } from "@/types/carburant";
import { createPlein, updatePlein, deletePlein } from "@/services/carburant-service";

const inputClass =
  "w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-green-400 transition-all";
const labelClass = "text-[11px] font-semibold uppercase tracking-wide text-stone-400 mb-1 block";

function fmt(n: number, decimals = 1): string {
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatDateFR(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

// Tooltip custom pour le graphique
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-stone-100 rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-stone-700 mb-1">{label}</p>
      <p className="text-green-600 font-bold">{fmt(payload[0].value, 1)} L</p>
    </div>
  );
}

export default function CarburantPage() {
  const { state } = useAppStore();
  const { showToast } = useToast();
  const pleins = (state.carburant as PleinCarburant[]) || [];

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PleinCarburant | null>(null);
  const [form, setForm] = useState<PleinCarburantFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PleinCarburant | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const stats = useMemo(() => computeCarburantStats(pleins), [pleins]);
  const chartData = useMemo(() => aggregateByMonth(pleins, selectedYear), [pleins, selectedYear]);

  // Années disponibles pour le sélecteur
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    years.add(new Date().getFullYear());
    for (const p of pleins) {
      const y = parseInt(p.date.slice(0, 4));
      if (!isNaN(y)) years.add(y);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [pleins]);

  // Total du mois en cours pour KPI
  const totalMoisCourant = useMemo(() => {
    const now = new Date().toISOString().slice(0, 7);
    return pleins
      .filter((p) => p.date.startsWith(now))
      .reduce((s, p) => s + p.litres, 0);
  }, [pleins]);

  const sortedDesc = useMemo(
    () => [...pleins].sort((a, b) => b.date.localeCompare(a.date)),
    [pleins]
  );

  function openCreate() {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().split("T")[0] });
    setModalOpen(true);
  }

  function openEdit(p: PleinCarburant) {
    setEditTarget(p);
    setForm({ date: p.date, litres: String(p.litres), remarque: p.remarque ?? "" });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditTarget(null);
    setForm(EMPTY_FORM);
  }

  function set(field: keyof PleinCarburantFormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [field]: e.target.value }));
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = editTarget
        ? await updatePlein(editTarget.id, form)
        : await createPlein(form);
      if (res.success) {
        showToast({
          type: "success",
          title: editTarget ? "Plein modifié" : "Plein enregistré",
        });
        closeModal();
      } else {
        showToast({ type: "error", title: (res as { error?: string }).error || "Erreur" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await deletePlein(deleteTarget.id);
    if (res.success) {
      showToast({ type: "success", title: "Entrée supprimée" });
    } else {
      showToast({ type: "error", title: "Erreur lors de la suppression" });
    }
    setDeleteTarget(null);
  }

  const maxLitres = Math.max(...chartData.map((d) => d.litres), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
            <Fuel className="w-6 h-6 text-green-600" />
            Carburant
          </h1>
          <p className="text-stone-500 mt-1">Suivi de la consommation Ecobloc</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Nouveau plein
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          label="Pleins enregistrés"
          value={String(stats.count)}
          icon="⛽"
        />
        <KpiCard
          label="Total (tous)"
          value={stats.totalLitres > 0 ? `${fmt(stats.totalLitres)} L` : "—"}
          icon="🛢️"
        />
        <KpiCard
          label="Ce mois-ci"
          value={totalMoisCourant > 0 ? `${fmt(totalMoisCourant)} L` : "—"}
          icon="📅"
        />
        <KpiCard
          label="Moy. par plein"
          value={stats.count > 0 ? `${fmt(stats.moyenne)} L` : "—"}
          icon="📊"
        />
      </div>

      {/* Graphique mensuel */}
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5">
        {/* En-tête graphique avec sélecteur année */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-stone-800">Consommation mensuelle</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSelectedYear((y) => y - 1)}
              className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-stone-700 w-12 text-center">
              {selectedYear}
            </span>
            <button
              onClick={() => setSelectedYear((y) => y + 1)}
              disabled={selectedYear >= new Date().getFullYear()}
              className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {chartData.every((d) => d.litres === 0) ? (
          <p className="text-sm text-stone-400 text-center py-12">
            Aucune donnée pour {selectedYear}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0ede9" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#a8a29e" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#a8a29e" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}L`}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f5f5f4" }} />
              <Bar dataKey="litres" radius={[6, 6, 0, 0]} maxBarSize={48}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.litres === maxLitres && entry.litres > 0 ? "#16a34a" : "#86efac"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Liste des entrées */}
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-50">
          <h2 className="text-base font-semibold text-stone-800">
            Historique ({sortedDesc.length})
          </h2>
        </div>

        {sortedDesc.length === 0 ? (
          <div className="text-center py-16 text-stone-400">
            <Fuel className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Aucun plein enregistré</p>
            <button
              onClick={openCreate}
              className="mt-3 text-sm text-green-600 font-semibold hover:underline cursor-pointer"
            >
              + Ajouter le premier
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-stone-50">
            {sortedDesc.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between px-5 py-3.5 hover:bg-stone-50/60 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                    <Fuel className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-stone-800">
                      {fmt(p.litres, 1)} L
                    </p>
                    <p className="text-xs text-stone-400">{formatDateFR(p.date)}</p>
                    {p.remarque && (
                      <p className="text-xs text-stone-400 truncate mt-0.5">{p.remarque}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button
                    onClick={() => openEdit(p)}
                    className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(p)}
                    className="p-1.5 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Modal ajout / édition */}
      {modalOpen && (
        <Modal
          isOpen={modalOpen}
          title={editTarget ? "Modifier le plein" : "Nouveau plein"}
          onClose={closeModal}
        >
          <form id="carburant-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={labelClass}>Date</label>
              <input
                type="date"
                value={form.date}
                onChange={set("date")}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Litres</label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                placeholder="ex: 50"
                value={form.litres}
                onChange={set("litres")}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Remarque (optionnel)</label>
              <textarea
                rows={2}
                placeholder="Tracteur, machine…"
                value={form.remarque}
                onChange={set("remarque")}
                className={inputClass + " resize-none"}
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 rounded-lg text-sm font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 transition-colors disabled:opacity-60 cursor-pointer"
              >
                {saving ? "Enregistrement…" : editTarget ? "Modifier" : "Enregistrer"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal confirmation suppression */}
      {deleteTarget && (
        <ConfirmModal
          isOpen={!!deleteTarget}
          title="Supprimer cette entrée ?"
          message={`${fmt(deleteTarget.litres, 1)} L du ${formatDateFR(deleteTarget.date)}`}
          confirmText="Supprimer"
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
          danger
        />
      )}
    </div>
  );
}
