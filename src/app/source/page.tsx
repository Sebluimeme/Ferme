"use client";

import React, { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useAppStore } from "@/store/store";
import { useToast } from "@/components/Toast";
import type { ReleverSource, ReleverSourceFormData, UniteDebit } from "@/types/source";
import { EMPTY_FORM, fmtDebit, computeSourceStats } from "@/types/source";
import { createReleve, updateReleve, deleteReleve } from "@/services/source-service";
import KpiCard from "@/components/KpiCard";

const inputClass =
  "w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400";
const UNITES: UniteDebit[] = ["L/h", "L/min", "L/s", "m³/h"];

export default function SourcePage() {
  const { state } = useAppStore();
  const { showToast } = useToast();
  const releves = (state.relevesSource as ReleverSource[]) || [];

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ReleverSource | null>(null);
  const [form, setForm] = useState<ReleverSourceFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ReleverSource | null>(null);

  const stats = useMemo(() => computeSourceStats(releves), [releves]);

  // Données graphique — triées par date, filtrées sur l'unité dominante
  const chartData = useMemo(() => {
    const sorted = [...releves].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.map((r) => ({
      date: r.date.slice(5), // MM-DD
      dateFull: r.date,
      debit: r.debit,
      unite: r.unite,
    }));
  }, [releves]);

  const moy = stats.moyenne;

  function openCreate() {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().split("T")[0] });
    setModalOpen(true);
  }

  function openEdit(r: ReleverSource) {
    setEditTarget(r);
    setForm({ date: r.date, debit: String(r.debit), unite: r.unite, remarque: r.remarque ?? "" });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditTarget(null);
    setForm(EMPTY_FORM);
  }

  function set(field: keyof ReleverSourceFormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [field]: e.target.value }));
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = editTarget
        ? await updateReleve(editTarget.id, form)
        : await createReleve(form);
      if (res.success) {
        showToast({ type: "success", title: editTarget ? "Relevé mis à jour" : "Relevé ajouté" });
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
    const res = await deleteReleve(deleteTarget.id);
    if (res.success) {
      showToast({ type: "success", title: "Relevé supprimé" });
    } else {
      showToast({ type: "error", title: "Erreur lors de la suppression" });
    }
    setDeleteTarget(null);
  }

  const sortedDesc = [...releves].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Source</h1>
          <p className="text-stone-500 mt-1">Suivi du débit de la source</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors cursor-pointer"
        >
          + Nouveau relevé
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          label="Relevés"
          value={String(stats.count)}
          icon="📋"
        />
        <KpiCard
          label="Dernier débit"
          value={stats.dernierDebit ? fmtDebit(stats.dernierDebit.debit, stats.dernierDebit.unite) : "—"}
          icon="💧"
        />
        <KpiCard
          label="Moyenne"
          value={stats.count > 0 ? fmtDebit(stats.moyenne, releves[0]?.unite ?? "L/min") : "—"}
          icon="📊"
        />
        <KpiCard
          label="Min / Max"
          value={stats.count > 0 ? `${stats.min} / ${stats.max}` : "—"}
          icon="↕️"
        />
      </div>

      {/* Graphique */}
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5">
        <h2 className="text-base font-semibold text-stone-800 mb-4">Évolution du débit</h2>
        {chartData.length < 2 ? (
          <p className="text-sm text-stone-400 text-center py-10">
            Ajoutez au moins 2 relevés pour afficher le graphique.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} />
              <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} />
              <Tooltip
                formatter={(v: unknown) =>
                  v != null ? [`${Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}`, "Débit"] : ["—", "Débit"]
                }
                labelStyle={{ fontSize: 12 }}
                contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 12 }}
              />
              {moy > 0 && (
                <ReferenceLine
                  y={moy}
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  label={{ value: "moy", position: "insideTopRight", fontSize: 10, fill: "#94a3b8" }}
                />
              )}
              <Line
                type="monotone"
                dataKey="debit"
                stroke="#3b82f6"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#3b82f6" }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Tableau desktop / Cartes mobile */}
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-stone-800">Historique des relevés</h2>
          <span className="text-xs text-stone-400">{releves.length} relevé(s)</span>
        </div>

        {releves.length === 0 ? (
          <p className="text-sm text-stone-400 text-center py-10">
            Aucun relevé enregistré — commencez par <button onClick={openCreate} className="text-brand-600 underline cursor-pointer">ajouter un relevé</button>.
          </p>
        ) : (
          <>
            {/* Vue carte mobile */}
            <div className="md:hidden divide-y divide-stone-100">
              {sortedDesc.map((r) => (
                <div
                  key={r.id}
                  onClick={() => openEdit(r)}
                  className="px-4 py-3 cursor-pointer hover:bg-stone-50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-stone-800">
                        {new Date(r.date + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                      </p>
                      {r.remarque && <p className="text-xs text-stone-400 mt-0.5 truncate max-w-[180px]">{r.remarque}</p>}
                    </div>
                    <span className="text-base font-bold text-blue-600 shrink-0">{fmtDebit(r.debit, r.unite)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Vue tableau desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr className="bg-stone-50 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide">
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Débit</th>
                    <th className="px-5 py-3">Unité</th>
                    <th className="px-5 py-3">Remarque</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {sortedDesc.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => openEdit(r)}
                      className="hover:bg-stone-50/80 transition-colors group cursor-pointer"
                    >
                      <td className="px-5 py-3 font-medium text-stone-800">
                        {new Date(r.date + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-5 py-3 font-bold text-blue-600">{r.debit.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</td>
                      <td className="px-5 py-3 text-stone-500">{r.unite}</td>
                      <td className="px-5 py-3 text-stone-400 max-w-[220px] truncate">{r.remarque ?? "—"}</td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(r); }}
                          className="text-red-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer text-xs px-2 py-1 rounded hover:bg-red-50"
                        >
                          Suppr.
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Modal ajout/édition */}
      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 overflow-hidden"
          onClick={closeModal}
          style={{
            paddingLeft: "env(safe-area-inset-left, 0px)",
            paddingRight: "env(safe-area-inset-right, 0px)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          <div
            className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[92dvh] sm:max-h-[90dvh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* En-tête fixe */}
            <div className="px-5 pt-5 pb-4 border-b border-stone-100 flex items-center justify-between shrink-0">
              <h2 className="text-base font-semibold text-stone-900">
                {editTarget ? "Modifier le relevé" : "Nouveau relevé"}
              </h2>
              <button onClick={closeModal} className="text-stone-400 hover:text-stone-600 cursor-pointer text-xl leading-none">×</button>
            </div>
            {/* Corps scrollable */}
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-5 space-y-4 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-stone-600 mb-1">Date *</label>
                    <input type="date" value={form.date} onChange={set("date")} required className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-600 mb-1">Débit *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.debit}
                      onChange={set("debit")}
                      placeholder="ex: 12.5"
                      required
                      className={inputClass}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">Unité</label>
                  <select value={form.unite} onChange={set("unite")} className={inputClass}>
                    {UNITES.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">Remarque</label>
                  <textarea
                    value={form.remarque}
                    onChange={set("remarque")}
                    rows={2}
                    placeholder="Conditions de mesure, météo…"
                    className={inputClass + " resize-none"}
                  />
                </div>
              </div>
              {/* Boutons toujours visibles en bas */}
              <div className="flex gap-3 px-5 py-4 border-t border-stone-100 bg-white shrink-0"
                style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
                <button type="button" onClick={closeModal} className="flex-1 py-2.5 rounded-xl border border-stone-200 text-sm text-stone-600 hover:bg-stone-50 cursor-pointer">
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors disabled:opacity-50 cursor-pointer transition-all"
                >
                  {saving ? "Enregistrement…" : editTarget ? "Mettre à jour" : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal confirmation suppression */}
      {deleteTarget && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="bg-white w-full max-w-sm mx-4 rounded-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-stone-900">Supprimer ce relevé ?</h3>
            <p className="text-sm text-stone-500">
              Relevé du{" "}
              {new Date(deleteTarget.date + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}{" "}
              — <strong>{fmtDebit(deleteTarget.debit, deleteTarget.unite)}</strong>
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2 rounded-xl border border-stone-200 text-sm text-stone-600 hover:bg-stone-50 cursor-pointer">
                Annuler
              </button>
              <button onClick={handleDelete} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 cursor-pointer">
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}