"use client";

import React, { useState, useMemo } from "react";
import { useAppStore } from "@/store/store";
import KpiCard from "@/components/KpiCard";
import Modal, { ConfirmModal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import type { Ruche, RecolteMiel, VenteMiel } from "@/types/apiculture";
import {
  createRuche, updateRuche, deleteRuche,
  createRecolte, updateRecolte, deleteRecolte,
  createVente, updateVente, deleteVente,
} from "@/services/apiculture-service";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, LineChart, Line,
} from "recharts";

// ==================== Constantes ====================

const TYPE_MIEL_LABELS: Record<NonNullable<RecolteMiel["type"]>, string> = {
  printemps: "Printemps",
  ete: "Été",
  automne: "Automne",
  hiver: "Hiver",
  toutes_fleurs: "Toutes fleurs",
  acacia: "Acacia",
  lavande: "Lavande",
  tilleul: "Tilleul",
  autre: "Autre",
};

const TYPE_MIEL_COLORS: Record<NonNullable<RecolteMiel["type"]>, string> = {
  printemps: "bg-pink-100 text-pink-800",
  ete: "bg-yellow-100 text-yellow-800",
  automne: "bg-orange-100 text-orange-800",
  hiver: "bg-blue-100 text-blue-800",
  toutes_fleurs: "bg-purple-100 text-purple-800",
  acacia: "bg-green-100 text-green-800",
  lavande: "bg-violet-100 text-violet-800",
  tilleul: "bg-lime-100 text-lime-800",
  autre: "bg-stone-100 text-stone-800",
};

const MOIS_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

// ==================== Formulaire ruche ====================

interface RucheFormData {
  nom: string;
  emplacement: string;
  dateInstallation: string;
  statut: Ruche["statut"];
  notes: string;
}

function RucheForm({ initial, onSubmit, onCancel, loading }: {
  initial?: Partial<RucheFormData>;
  onSubmit: (data: RucheFormData) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<RucheFormData>({
    nom: initial?.nom ?? "",
    emplacement: initial?.emplacement ?? "",
    dateInstallation: initial?.dateInstallation ?? "",
    statut: initial?.statut ?? "active",
    notes: initial?.notes ?? "",
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Nom de la ruche *</label>
          <input type="text" required
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={form.nom} onChange={(e) => setForm((p) => ({ ...p, nom: e.target.value }))}
            placeholder="Ex : Ruche 1" />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Statut</label>
          <select className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={form.statut} onChange={(e) => setForm((p) => ({ ...p, statut: e.target.value as Ruche["statut"] }))}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="perdue">Perdue</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Emplacement</label>
          <input type="text"
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={form.emplacement} onChange={(e) => setForm((p) => ({ ...p, emplacement: e.target.value }))}
            placeholder="Ex : Verger nord" />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Date d&apos;installation</label>
          <input type="date"
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={form.dateInstallation} onChange={(e) => setForm((p) => ({ ...p, dateInstallation: e.target.value }))} />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Notes</label>
        <textarea rows={2}
          className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
          value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          placeholder="Observations..." />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium bg-stone-100 text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-200 cursor-pointer">Annuler</button>
        <button type="submit" disabled={loading} className="px-5 py-2 text-sm font-semibold text-white rounded-lg bg-brand-600 hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50">
          {loading ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}

// ==================== Formulaire récolte ====================

interface RecolteFormData {
  rucheId: string;
  dateRecolte: string;
  poidsKg: string;
  type: RecolteMiel["type"] | "";
  notes: string;
}

function RecolteForm({ ruches, initial, onSubmit, onCancel, loading }: {
  ruches: Ruche[];
  initial?: Partial<RecolteFormData>;
  onSubmit: (data: RecolteFormData) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState<RecolteFormData>({
    rucheId: initial?.rucheId ?? "",
    dateRecolte: initial?.dateRecolte ?? today,
    poidsKg: initial?.poidsKg ?? "",
    type: initial?.type ?? "",
    notes: initial?.notes ?? "",
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Date de récolte *</label>
          <input type="date" required
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={form.dateRecolte} onChange={(e) => setForm((p) => ({ ...p, dateRecolte: e.target.value }))} />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Poids (kg) *</label>
          <input type="number" min="0" step="0.1" required
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={form.poidsKg} onChange={(e) => setForm((p) => ({ ...p, poidsKg: e.target.value }))}
            placeholder="Ex : 12.5" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Ruche</label>
          <select className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={form.rucheId} onChange={(e) => setForm((p) => ({ ...p, rucheId: e.target.value }))}>
            <option value="">— Toutes ruches —</option>
            {ruches.filter((r) => r.statut === "active").map((r) => (
              <option key={r.id} value={r.id}>{r.nom}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Type de miel</label>
          <select className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as RecolteMiel["type"] | "" }))}>
            <option value="">— Non spécifié —</option>
            {(Object.entries(TYPE_MIEL_LABELS) as [NonNullable<RecolteMiel["type"]>, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Notes</label>
        <textarea rows={2}
          className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
          value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          placeholder="Conditions, observations..." />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium bg-stone-100 text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-200 cursor-pointer">Annuler</button>
        <button type="submit" disabled={loading} className="px-5 py-2 text-sm font-semibold text-white rounded-lg bg-brand-600 hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50">
          {loading ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}

// ==================== Formulaire vente ====================

interface VenteFormData {
  dateVente: string;
  nbPots500g: string;
  nbPots1kg: string;
  typeMiel: string;
  beneficiaire: string;
  prixTotal: string;
  notes: string;
}

const TYPES_MIEL = ["Toutes fleurs", "Acacia", "Tilleul", "Lavande", "Printemps", "Été", "Automne", "Hiver", "Autre"];

function venteFormToPoidsKg(form: VenteFormData): number {
  return (parseInt(form.nbPots500g) || 0) * 0.5 + (parseInt(form.nbPots1kg) || 0) * 1;
}

function poidsKgToVenteForm(kg: number): { nbPots500g: string; nbPots1kg: string } {
  // Représente tout en pots 1 kg si entier, sinon en pots 0,5 kg
  if (kg % 1 === 0 && kg >= 1) {
    return { nbPots500g: "0", nbPots1kg: String(kg) };
  }
  return { nbPots500g: String(Math.round(kg / 0.5)), nbPots1kg: "0" };
}

function VenteForm({ initial, onSubmit, onCancel, loading }: {
  initial?: Partial<VenteFormData>;
  onSubmit: (data: VenteFormData) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const today = new Date().toISOString().split("T")[0];

  const initialPoids = initial ? venteFormToPoidsKg({
    nbPots500g: initial.nbPots500g ?? "0",
    nbPots1kg: initial.nbPots1kg ?? "0",
    dateVente: "", prixTotal: "", notes: "", typeMiel: "", beneficiaire: "",
  }) : 0.5;

  const [form, setForm] = useState<VenteFormData>({
    dateVente: initial?.dateVente ?? today,
    ...poidsKgToVenteForm(initialPoids || 0.5),
    typeMiel: initial?.typeMiel ?? "Toutes fleurs",
    beneficiaire: initial?.beneficiaire ?? "Revolut",
    prixTotal: initial?.prixTotal ?? "",
    notes: initial?.notes ?? "",
  });

  const [taillePot, setTaillePot] = useState<0.5 | 1>(
    (initialPoids || 0.5) % 1 !== 0 ? 0.5 : 1
  );
  const [nbPots, setNbPots] = useState<number>(
    Math.max(1, Math.round((initialPoids || 0.5) / ((initialPoids || 0.5) % 1 !== 0 ? 0.5 : 1)))
  );

  // Sync nbPots500g / nbPots1kg dans form à chaque changement
  const handlePotsChange = (taille: 0.5 | 1, nb: number) => {
    setTaillePot(taille);
    setNbPots(nb);
    if (taille === 0.5) {
      setForm((p) => ({ ...p, nbPots500g: String(nb), nbPots1kg: "0" }));
    } else {
      setForm((p) => ({ ...p, nbPots500g: "0", nbPots1kg: String(nb) }));
    }
  };

  const poidsTotal = taillePot * nbPots;

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="flex flex-col gap-4">
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Date de vente *</label>
        <input type="date" required
          className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          value={form.dateVente} onChange={(e) => setForm((p) => ({ ...p, dateVente: e.target.value }))} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Taille du pot</label>
          <select
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={taillePot}
            onChange={(e) => handlePotsChange(parseFloat(e.target.value) as 0.5 | 1, nbPots)}
          >
            <option value={0.5}>0,5 kg</option>
            <option value={1}>1 kg</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Nombre de pots</label>
          <input type="number" min="1" step="1" required
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={nbPots}
            onChange={(e) => handlePotsChange(taillePot, Math.max(1, parseInt(e.target.value) || 1))}
          />
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-amber-800 font-medium">
        Total : {nbPots} pot{nbPots > 1 ? "s" : ""} × {taillePot % 1 === 0 ? taillePot : taillePot.toFixed(1)} kg = <strong>{poidsTotal.toFixed(1)} kg</strong>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Type de miel</label>
        <select
          className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          value={form.typeMiel}
          onChange={(e) => setForm((p) => ({ ...p, typeMiel: e.target.value }))}
        >
          {TYPES_MIEL.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Encaissé par</label>
        <select
          className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          value={form.beneficiaire}
          onChange={(e) => setForm((p) => ({ ...p, beneficiaire: e.target.value }))}
        >
          <option value="Revolut">Revolut (ferme)</option>
          <option value="SY">Sébastien (SY)</option>
          <option value="BY">Benjamin (BY)</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Prix total (€) *</label>
        <input type="number" min="0" step="0.01" required
          className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          value={form.prixTotal} onChange={(e) => setForm((p) => ({ ...p, prixTotal: e.target.value }))}
          placeholder="Ex : 45.00" />
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Notes</label>
        <textarea rows={2}
          className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
          value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          placeholder="Client, lieu de vente..." />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium bg-stone-100 text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-200 cursor-pointer">Annuler</button>
        <button type="submit" disabled={loading} className="px-5 py-2 text-sm font-semibold text-white rounded-lg bg-brand-600 hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50">
          {loading ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}

// ==================== Page principale ====================

export default function ApiculturePage() {
  const { state } = useAppStore();
  const { showToast } = useToast();
  const { ruches, recolteMiel, ventesMiel, couts } = state;

  const [tab, setTab] = useState<"dashboard" | "recoltes" | "ventes" | "balance" | "ruches">("dashboard");
  const [modalRuche, setModalRuche] = useState(false);
  const [editRuche, setEditRuche] = useState<Ruche | null>(null);
  const [deleteRucheTarget, setDeleteRucheTarget] = useState<Ruche | null>(null);
  const [modalRecolte, setModalRecolte] = useState(false);
  const [editRecolte, setEditRecolte] = useState<RecolteMiel | null>(null);
  const [deleteRecolteTarget, setDeleteRecolteTarget] = useState<RecolteMiel | null>(null);
  const [modalVente, setModalVente] = useState(false);
  const [editVente, setEditVente] = useState<VenteMiel | null>(null);
  const [deleteVenteTarget, setDeleteVenteTarget] = useState<VenteMiel | null>(null);
  const [saving, setSaving] = useState(false);

  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth();

  // ——— KPIs ———
  const ruchesActives = ruches.filter((r) => r.statut === "active").length;
  const totalMielKg = recolteMiel.reduce((s, r) => s + r.poidsKg, 0);
  const mielCeMois = recolteMiel
    .filter((r) => { const d = new Date(r.dateRecolte); return d.getMonth() === thisMonth && d.getFullYear() === thisYear; })
    .reduce((s, r) => s + r.poidsKg, 0);
  const mielCetteAnnee = recolteMiel
    .filter((r) => new Date(r.dateRecolte).getFullYear() === thisYear)
    .reduce((s, r) => s + r.poidsKg, 0);

  // ——— KPIs ventes ———
  const caTotal = ventesMiel.reduce((s, v) => s + v.prixTotal, 0);
  const caCetteAnnee = ventesMiel
    .filter((v) => new Date(v.dateVente).getFullYear() === thisYear)
    .reduce((s, v) => s + v.prixTotal, 0);
  const totalPots500 = ventesMiel.reduce((s, v) => s + v.nbPots500g, 0);
  const totalPots1kg = ventesMiel.reduce((s, v) => s + v.nbPots1kg, 0);

  const rdtMoyenParRuche = ruchesActives > 0 && mielCetteAnnee > 0
    ? mielCetteAnnee / ruchesActives
    : null;

  // ——— Balance apiculture (transactions taguées "Apiculture") ———
  const coutsApiculture = useMemo(() =>
    couts.filter((t) => t.production?.toLowerCase().includes("apicult") || t.production?.toLowerCase().includes("miel") || t.production?.toLowerCase().includes("abeill")),
  [couts]);

  const depensesApiculture = useMemo(() =>
    coutsApiculture.filter((t) => t.operation === "Dépenses").reduce((s, t) => s + t.montant, 0),
  [coutsApiculture]);

  const revenusTransacApiculture = useMemo(() =>
    coutsApiculture.filter((t) => t.operation === "Revenus").reduce((s, t) => s + t.montant, 0),
  [coutsApiculture]);

  // Revenus totaux apiculture = ventes miel + revenus transactions taguées
  const revenusApicultureTotal = caTotal + revenusTransacApiculture;
  const balanceApiculture = revenusApicultureTotal - depensesApiculture;

  // Par catégorie de dépense
  const depensesParCategorie = useMemo(() => {
    const map: Record<string, number> = {};
    coutsApiculture
      .filter((t) => t.operation === "Dépenses")
      .forEach((t) => {
        const key = t.categorie || "Non catégorisé";
        map[key] = (map[key] ?? 0) + t.montant;
      });
    return Object.entries(map).map(([cat, montant]) => ({ cat, montant })).sort((a, b) => b.montant - a.montant);
  }, [coutsApiculture]);

  // ——— Analytics ———
  const donneesMensuelles = useMemo(() =>
    MOIS_LABELS.map((mois, idx) => {
      const kg = recolteMiel
        .filter((r) => { const d = new Date(r.dateRecolte); return d.getMonth() === idx && d.getFullYear() === thisYear; })
        .reduce((s, r) => s + r.poidsKg, 0);
      const ca = ventesMiel
        .filter((v) => { const d = new Date(v.dateVente);

... [OUTPUT TRUNCATED - 8169 chars omitted out of 58169 total] ...

l-yellow-500" valueColorClass="text-yellow-600" />
        <KpiCard label={`CA ${thisYear}`} value={caCetteAnnee > 0 ? formatEur(caCetteAnnee) : "—"} subtitle={caTotal !== caCetteAnnee && caTotal > 0 ? `${formatEur(caTotal)} total` : undefined} borderColorClass="border-l-green-500" valueColorClass="text-green-600" />
        <KpiCard label="Pots vendus" value={totalPots500 + totalPots1kg > 0 ? totalPots500 + totalPots1kg : "—"} subtitle={totalPots500 + totalPots1kg > 0 ? `${totalPots500}×½kg · ${totalPots1kg}×1kg` : undefined} borderColorClass="border-l-orange-500" valueColorClass="text-orange-600" />
      </div>

      {/* Onglets */}
      <div className="flex gap-1 mb-6 bg-stone-100 p-1 rounded-xl flex-wrap">
        {(["dashboard", "ventes", "balance", "recoltes", "ruches"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${tab === t ? "bg-white shadow-sm text-stone-900" : "text-stone-500 hover:text-stone-700"}`}>
            {t === "dashboard" ? "📊 Graphiques" : t === "ventes" ? "💰 Ventes" : t === "balance" ? "⚖️ Balance" : t === "recoltes" ? "🍯 Récoltes" : "🐝 Ruches"}
          </button>
        ))}
      </div>

      {/* ——— TAB DASHBOARD ——— */}
      {tab === "dashboard" && (
        <div className="space-y-6">
          {recolteMiel.length === 0 && ventesMiel.length === 0 ? (
            <div className="text-center py-16 text-stone-400">
              <div className="text-5xl mb-3">🍯</div>
              <p className="text-lg font-medium">Aucune donnée</p>
              <p className="text-sm mt-1">Enregistrez une récolte ou une vente pour voir les graphiques.</p>
            </div>
          ) : (
            <>
              {/* Récoltes mensuelles */}
              {recolteMiel.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-5">
                  <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Récoltes {thisYear} — par mois (kg)</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={donneesMensuelles} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} unit=" kg" />
                      <Tooltip formatter={(v: unknown) => v != null ? `${Number(v).toFixed(1)} kg` : "—"} />
                      <Bar dataKey="kg" name="Miel récolté" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* CA mensuel */}
              {ventesMiel.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-5">
                  <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Chiffre d&apos;affaires {thisYear} — par mois (€)</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={donneesMensuelles} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} unit=" €" />
                      <Tooltip formatter={(v: unknown) => v != null ? `${Number(v).toFixed(2)} €` : "—"} />
                      <Bar dataKey="ca" name="CA ventes" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Par ruche + par type côte à côte */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {parRuche.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-5">
                    <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Par ruche — {thisYear}</p>
                    <ResponsiveContainer width="100%" height={Math.max(160, parRuche.length * 40)}>
                      <BarChart data={parRuche} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11 }} unit=" kg" />
                        <YAxis type="category" dataKey="ruche" tick={{ fontSize: 12 }} width={80} />
                        <Tooltip formatter={(v: unknown) => `${Number(v).toFixed(1)} kg`} />
                        <Bar dataKey="kg" name="Miel" fill="#d97706" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {parType.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-5">
                    <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Par type de miel</p>
                    <div className="space-y-2">
                      {parType.map(({ type, kg }) => {
                        const pct = totalMielKg > 0 ? (kg / totalMielKg) * 100 : 0;
                        return (
                          <div key={type}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-stone-700 font-medium">{type}</span>
                              <span className="text-stone-500">{kg.toFixed(1)} kg · {pct.toFixed(0)}%</span>
                            </div>
                            <div className="w-full bg-stone-100 rounded-full h-2">
                              <div className="h-2 rounded-full bg-amber-400 transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Rendement + prix moyen pot */}
              {(rdtMoyenParRuche != null || ventesMiel.length > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {rdtMoyenParRuche != null && (
                    <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-5">
                      <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Rendement {thisYear}</p>
                      <div className="flex flex-col gap-3">
                        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                          <p className="text-xs text-amber-600 font-medium">Moy. par ruche active</p>
                          <p className="text-2xl font-bold text-amber-700 mt-0.5">{rdtMoyenParRuche.toFixed(1)} kg</p>
                        </div>
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
                          <p className="text-xs text-yellow-600 font-medium">Total récolté {thisYear}</p>
                          <p className="text-2xl font-bold text-yellow-700 mt-0.5">{mielCetteAnnee.toFixed(1)} kg</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {ventesMiel.length > 0 && (() => {
                    const totalPotsAll = totalPots500 + totalPots1kg;
                    const prixMoyPot = totalPotsAll > 0 ? caTotal / totalPotsAll : null;
                    const poidsVenduTotal = totalPots500 * 0.5 + totalPots1kg * 1;
                    const prixMoyKg = poidsVenduTotal > 0 ? caTotal / poidsVenduTotal : null;
                    return (
                      <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-5">
                        <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Statistiques ventes</p>
                        <div className="flex flex-col gap-3">
                          {prixMoyPot != null && (
                            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                              <p className="text-xs text-green-600 font-medium">Prix moyen / pot</p>
                              <p className="text-2xl font-bold text-green-700 mt-0.5">{formatEur(prixMoyPot)}</p>
                            </div>
                          )}
                          {prixMoyKg != null && (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                              <p className="text-xs text-emerald-600 font-medium">Prix moyen / kg</p>
                              <p className="text-2xl font-bold text-emerald-700 mt-0.5">{formatEur(prixMoyKg)}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Comparaison multi-années */}
              {recolteMiel.length >= 5 && (() => {
                const years = [...new Set(recolteMiel.map((r) => new Date(r.dateRecolte).getFullYear()))].sort();
                if (years.length < 2) return null;
                const data = MOIS_LABELS.map((mois, idx) => {
                  const obj: Record<string, number | string> = { mois };
                  years.forEach((y) => {
                    obj[String(y)] = recolteMiel
                      .filter((r) => { const d = new Date(r.dateRecolte); return d.getMonth() === idx && d.getFullYear() === y; })
                      .reduce((s, r) => s + r.poidsKg, 0) || 0;
                  });
                  return obj;
                });
                const COLORS = ["#f59e0b", "#10b981", "#6366f1", "#ef4444", "#3b82f6"];
                return (
                  <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-5">
                    <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Comparaison annuelle (kg/mois)</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} unit=" kg" />
                        <Tooltip formatter={(v: unknown) => `${Number(v).toFixed(1)} kg`} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        {years.map((y, i) => (
                          <Line key={y} type="monotone" dataKey={String(y)} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* ——— TAB VENTES ——— */}
      {tab === "ventes" && (
        <div className="space-y-3">
          {/* Récap année */}
          {ventesMiel.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-4 mb-2">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-stone-400 font-medium">CA total</p>
                  <p className="text-xl font-bold text-green-700">{formatEur(caTotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-stone-400 font-medium">Pots ½ kg vendus</p>
                  <p className="text-xl font-bold text-amber-700">{totalPots500}</p>
                </div>
                <div>
                  <p className="text-xs text-stone-400 font-medium">Pots 1 kg vendus</p>
                  <p className="text-xl font-bold text-amber-700">{totalPots1kg}</p>
                </div>
              </div>
            </div>
          )}

          {ventesTri.length === 0 ? (
            <div className="text-center py-16 text-stone-400">
              <div className="text-5xl mb-3">💰</div>
              <p className="text-lg font-medium">Aucune vente enregistrée</p>
              <p className="text-sm mt-1">Cliquez sur &quot;+ Vente&quot; pour en ajouter une.</p>
            </div>
          ) : ventesTri.map((v) => (
            <div key={v.id} className="bg-white rounded-xl shadow-sm border border-stone-100 p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-base font-bold text-green-700">{formatEur(v.prixTotal)}</span>
                  <span className="text-sm text-stone-500">{formatDate(v.dateVente)}</span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-sm text-stone-600 flex-wrap">
                  {v.nbPots500g > 0 && (
                    <span className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5 text-xs font-medium text-amber-800">
                      {v.nbPots500g} × ½ kg
                    </span>
                  )}
                  {v.nbPots1kg > 0 && (
                    <span className="inline-flex items-center gap-1 bg-yellow-50 border border-yellow-200 rounded-md px-2 py-0.5 text-xs font-medium text-yellow-800">
                      {v.nbPots1kg} × 1 kg
                    </span>
                  )}
                  <span className="text-stone-400 text-xs">
                    {((v.nbPots500g * 0.5) + (v.nbPots1kg * 1)).toFixed(1)} kg vendu
                  </span>
                </div>
                {v.notes && <div className="mt-0.5 text-xs text-stone-400 italic truncate">{v.notes}</div>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setEditVente(v)}
                  className="p-2 text-stone-400 hover:text-brand-600 hover:bg-stone-100 rounded-lg cursor-pointer transition-colors" title="Modifier">
                  ✏️
                </button>
                <button onClick={() => setDeleteVenteTarget(v)}
                  className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg cursor-pointer transition-colors" title="Supprimer">
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ——— TAB BALANCE ——— */}
      {tab === "balance" && (
        <div className="space-y-5">

          {/* Résumé balance */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-5">
              <p className="text-xs text-stone-400 font-semibold uppercase tracking-wide mb-2">Revenus apiculture</p>
              <p className="text-2xl font-bold text-green-700">{formatEur(revenusApicultureTotal)}</p>
              <div className="mt-2 space-y-1 text-xs text-stone-500">
                <div className="flex justify-between"><span>Ventes miel</span><span className="font-medium text-green-600">+{formatEur(caTotal)}</span></div>
                {revenusTransacApiculture > 0 && <div className="flex justify-between"><span>Autres revenus</span><span className="font-medium text-green-600">+{formatEur(revenusTransacApiculture)}</span></div>}
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-5">
              <p className="text-xs text-stone-400 font-semibold uppercase tracking-wide mb-2">Coûts apiculture</p>
              <p className="text-2xl font-bold text-red-600">{formatEur(depensesApiculture)}</p>
              {depensesParCategorie.length > 0 && (
                <div className="mt-2 space-y-1 text-xs text-stone-500">
                  {depensesParCategorie.slice(0, 3).map(({ cat, montant }) => (
                    <div key={cat} className="flex justify-between">
                      <span className="truncate max-w-[120px]">{cat}</span>
                      <span className="font-medium text-red-500">−{formatEur(montant)}</span>
                    </div>
                  ))}
                  {depensesParCategorie.length > 3 && <p className="text-stone-400 italic">+{depensesParCategorie.length - 3} autres catégories</p>}
                </div>
              )}
            </div>
            <div className={`rounded-xl shadow-sm border p-5 ${balanceApiculture >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
              <p className="text-xs text-stone-400 font-semibold uppercase tracking-wide mb-2">Balance nette</p>
              <p className={`text-2xl font-bold ${balanceApiculture >= 0 ? "text-green-700" : "text-red-700"}`}>
                {balanceApiculture >= 0 ? "+" : ""}{formatEur(balanceApiculture)}
              </p>
              <p className="text-xs text-stone-500 mt-2">
                {balanceApiculture >= 0 ? "✓ Activité bénéficiaire" : "⚠ Investissement en cours"}
              </p>
              {depensesApiculture > 0 && revenusApicultureTotal > 0 && (
                <div className="mt-3">
                  <div className="text-xs text-stone-400 mb-1">Taux de retour</div>
                  <div className="w-full bg-stone-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${balanceApiculture >= 0 ? "bg-green-500" : "bg-red-400"}`}
                      style={{ width: `${Math.min(100, (revenusApicultureTotal / depensesApiculture) * 100).toFixed(0)}%` }}
                    />
                  </div>
                  <p className="text-xs text-stone-500 mt-1 text-right">
                    {((revenusApicultureTotal / depensesApiculture) * 100).toFixed(0)}% des coûts couverts
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Répartition dépenses par catégorie */}
          {depensesParCategorie.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-5">
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-4">Dépenses par catégorie</p>
              <div className="space-y-3">
                {depensesParCategorie.map(({ cat, montant }) => {
                  const pct = depensesApiculture > 0 ? (montant / depensesApiculture) * 100 : 0;
                  return (
                    <div key={cat}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-stone-700">{cat}</span>
                        <span className="text-stone-500">{formatEur(montant)} · {pct.toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-stone-100 rounded-full h-2">
                        <div className="h-2 rounded-full bg-red-400 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Liste détaillée des transactions */}
          {coutsApiculture.length > 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-stone-100 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-stone-100">
                <p className="text-[13px] font-semibold text-stone-800">Transactions liées à l&apos;apiculture</p>
                <p className="text-xs text-stone-400 mt-0.5">Transactions avec production "Apiculture", "Miel" ou "Abeille"</p>
              </div>
              <div className="divide-y divide-stone-50">
                {[...coutsApiculture]
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((t) => (
                    <div key={t.id} className="flex items-center gap-3 px-5 py-3">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.operation === "Revenus" ? "bg-green-400" : "bg-red-400"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-stone-800 truncate">{t.produit || t.categorie}</p>
                        <p className="text-xs text-stone-400">{formatDate(t.date)} · {t.categorie}{t.sousCategorie ? ` › ${t.sousCategorie}` : ""}</p>
                      </div>
                      <span className={`text-sm font-semibold shrink-0 ${t.operation === "Revenus" ? "text-green-600" : "text-red-500"}`}>
                        {t.operation === "Revenus" ? "+" : "−"}{formatEur(t.montant)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-8 text-center">
              <p className="text-4xl mb-3">💸</p>
              <p className="text-base font-medium text-stone-700">Aucune transaction liée à l&apos;apiculture</p>
              <p className="text-sm text-stone-400 mt-1">
                Dans <strong>Coûts</strong>, taguez vos dépenses avec la production <strong>&quot;Apiculture&quot;</strong> pour les voir apparaître ici.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ——— TAB RÉCOLTES ——— */}
      {tab === "recoltes" && (
        <div className="space-y-3">
          {recoltesTri.length === 0 ? (
            <div className="text-center py-16 text-stone-400">
              <div className="text-5xl mb-3">🍯</div>
              <p className="text-lg font-medium">Aucune récolte</p>
              <p className="text-sm mt-1">Cliquez sur &quot;+ Récolte&quot; pour ajouter.</p>
            </div>
          ) : recoltesTri.map((r) => {
            const ruche = ruches.find((ru) => ru.id === r.rucheId);
            return (
              <div key={r.id} className="bg-white rounded-xl shadow-sm border border-stone-100 p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-bold text-amber-700">{r.poidsKg.toFixed(1)} kg</span>
                    {r.type && (
                      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_MIEL_COLORS[r.type]}`}>
                        {TYPE_MIEL_LABELS[r.type]}
                      </span>
                    )}
                    <span className="text-sm text-stone-500">{formatDate(r.dateRecolte)}</span>
                  </div>
                  <div className="mt-0.5 text-sm text-stone-600">
                    {ruche ? <span className="font-medium">🐝 {ruche.nom}</span> : <span className="text-stone-400">Ruche non attribuée</span>}
                  </div>
                  {r.notes && <div className="mt-0.5 text-xs text-stone-400 italic truncate">{r.notes}</div>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setEditRecolte(r)}
                    className="p-2 text-stone-400 hover:text-brand-600 hover:bg-stone-100 rounded-lg cursor-pointer transition-colors" title="Modifier">
                    ✏️
                  </button>
                  <button onClick={() => setDeleteRecolteTarget(r)}
                    className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg cursor-pointer transition-colors" title="Supprimer">
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ——— TAB RUCHES ——— */}
      {tab === "ruches" && (
        <div className="space-y-3">
          {ruches.length === 0 ? (
            <div className="text-center py-16 text-stone-400">
              <div className="text-5xl mb-3">🐝</div>
              <p className="text-lg font-medium">Aucune ruche</p>
              <p className="text-sm mt-1">Cliquez sur &quot;+ Ruche&quot; pour en ajouter.</p>
            </div>
          ) : ruches.map((r) => {
            const totalKg = recolteMiel.filter((rec) => rec.rucheId === r.id).reduce((s, rec) => s + rec.poidsKg, 0);
            const statutColor = r.statut === "active" ? "bg-green-100 text-green-800" : r.statut === "inactive" ? "bg-stone-100 text-stone-600" : "bg-red-100 text-red-700";
            const statutLabel = r.statut === "active" ? "Active" : r.statut === "inactive" ? "Inactive" : "Perdue";
            return (
              <div key={r.id} className="bg-white rounded-xl shadow-sm border border-stone-100 p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-xl shrink-0">🐝</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-stone-900">{r.nom}</span>
                    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${statutColor}`}>{statutLabel}</span>
                  </div>
                  <div className="mt-0.5 text-sm text-stone-500 flex gap-3 flex-wrap">
                    {r.emplacement && <span>📍 {r.emplacement}</span>}
                    {totalKg > 0 && <span className="font-medium text-amber-700">🍯 {totalKg.toFixed(1)} kg total</span>}
                    {r.dateInstallation && <span>Installée le {formatDate(r.dateInstallation)}</span>}
                  </div>
                  {r.notes && <div className="mt-0.5 text-xs text-stone-400 italic truncate">{r.notes}</div>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setEditRuche(r)}
                    className="p-2 text-stone-400 hover:text-brand-600 hover:bg-stone-100 rounded-lg cursor-pointer transition-colors" title="Modifier">
                    ✏️
                  </button>
                  <button onClick={() => setDeleteRucheTarget(r)}
                    className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg cursor-pointer transition-colors" title="Supprimer">
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ——— Modals ruches ——— */}
      <Modal isOpen={modalRuche} onClose={() => setModalRuche(false)} title="Nouvelle ruche">
        <RucheForm onSubmit={handleCreateRuche} onCancel={() => setModalRuche(false)} loading={saving} />
      </Modal>
      <Modal isOpen={!!editRuche} onClose={() => setEditRuche(null)} title="Modifier la ruche">
        {editRuche && <RucheForm initial={{ nom: editRuche.nom, emplacement: editRuche.emplacement, dateInstallation: editRuche.dateInstallation, statut: editRuche.statut, notes: editRuche.notes }} onSubmit={handleUpdateRuche} onCancel={() => setEditRuche(null)} loading={saving} />}
      </Modal>
      <ConfirmModal isOpen={!!deleteRucheTarget} onClose={() => setDeleteRucheTarget(null)} onConfirm={handleDeleteRuche}
        title="Supprimer la ruche" message={`Supprimer <strong>${deleteRucheTarget?.nom ?? ""}</strong> ?`} confirmText="Supprimer" danger />

      {/* ——— Modals récoltes ——— */}
      <Modal isOpen={modalRecolte} onClose={() => setModalRecolte(false)} title="Nouvelle récolte de miel">
        <RecolteForm ruches={ruches} onSubmit={handleCreateRecolte} onCancel={() => setModalRecolte(false)} loading={saving} />
      </Modal>
      <Modal isOpen={!!editRecolte} onClose={() => setEditRecolte(null)} title="Modifier la récolte">
        {editRecolte && <RecolteForm ruches={ruches} initial={{ rucheId: editRecolte.rucheId ?? "", dateRecolte: editRecolte.dateRecolte, poidsKg: String(editRecolte.poidsKg), type: editRecolte.type ?? "", notes: editRecolte.notes ?? "" }} onSubmit={handleUpdateRecolte} onCancel={() => setEditRecolte(null)} loading={saving} />}
      </Modal>
      <ConfirmModal isOpen={!!deleteRecolteTarget} onClose={() => setDeleteRecolteTarget(null)} onConfirm={handleDeleteRecolte}
        title="Supprimer la récolte" message={`Supprimer la récolte du <strong>${deleteRecolteTarget ? formatDate(deleteRecolteTarget.dateRecolte) : ""}</strong> (${deleteRecolteTarget?.poidsKg ?? 0} kg) ?`} confirmText="Supprimer" danger />

      {/* ——— Modals ventes ——— */}
      <Modal isOpen={modalVente} onClose={() => setModalVente(false)} title="Nouvelle vente de miel">
        <VenteForm onSubmit={handleCreateVente} onCancel={() => setModalVente(false)} loading={saving} />
      </Modal>
      <Modal isOpen={!!editVente} onClose={() => setEditVente(null)} title="Modifier la vente">
        {editVente && <VenteForm initial={{ dateVente: editVente.dateVente, nbPots500g: String(editVente.nbPots500g), nbPots1kg: String(editVente.nbPots1kg), prixTotal: String(editVente.prixTotal), notes: editVente.notes ?? "" }} onSubmit={handleUpdateVente} onCancel={() => setEditVente(null)} loading={saving} />}
      </Modal>
      <ConfirmModal isOpen={!!deleteVenteTarget} onClose={() => setDeleteVenteTarget(null)} onConfirm={handleDeleteVente}
        title="Supprimer la vente" message={`Supprimer la vente du <strong>${deleteVenteTarget ? formatDate(deleteVenteTarget.dateVente) : ""}</strong> (${deleteVenteTarget ? formatEur(deleteVenteTarget.prixTotal) : ""}) ?`} confirmText="Supprimer" danger />
    </div>
  );
}