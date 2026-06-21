"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useAppStore } from "@/store/store";
import Modal, { ConfirmModal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import KpiCard from "@/components/KpiCard";
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  searchTransactions,
  filterTransactions,
  getCategoriesConfig,
  addProduction,
  addCategorie,
  addSousCategorie,
  type CategoriesConfig,
} from "@/services/comptabilite-service";
import {
  computeStats,
  formatDate,
  EMPTY_TRANSACTION_FORM,
  type Transaction,
  type TransactionFormData,
} from "@/types/comptabilite";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  TrendingDown,
  TrendingUp,
  Scale,
  Receipt,
} from "lucide-react";

// ─── Styles helpers ─────────────────────────────────────────────────────────
const inputClass =
  "w-full px-3 py-2 text-[13px] bg-stone-50 border border-stone-200 rounded-lg text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white transition-all";
const labelClass = "text-[11px] font-semibold uppercase tracking-wide text-stone-400 mb-1 block";
const selectClass =
  "w-full px-3 py-2 text-[13px] bg-stone-50 border border-stone-200 rounded-lg text-stone-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white transition-all";

// ─── Formulaire transaction ──────────────────────────────────────────────────
function TransactionForm({
  form, setForm, config, onAddProduction, onAddCategorie, onAddSousCategorie,
}: {
  form: TransactionFormData;
  setForm: (f: TransactionFormData) => void;
  config: CategoriesConfig;
  onAddProduction: () => void;
  onAddCategorie: () => void;
  onAddSousCategorie: () => void;
}) {
  const set = (field: keyof TransactionFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [field]: e.target.value });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Date *</label>
          <input type="date" value={form.date} onChange={set("date")} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Opération *</label>
          <select value={form.operation} onChange={set("operation")} className={selectClass}>
            <option value="Dépenses">Dépenses</option>
            <option value="Revenus">Revenus</option>
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>Production *</label>
        <div className="flex gap-2">
          <select value={form.production} onChange={set("production")} className={`${selectClass} flex-1`}>
            <option value="">— Sélectionner —</option>
            {config.productions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button type="button" onClick={onAddProduction}
            className="px-3 py-2 text-[12px] font-medium bg-stone-100 text-stone-600 border border-stone-200 rounded-lg hover:bg-stone-200 cursor-pointer whitespace-nowrap transition-colors">
            + Ajouter
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Catégorie *</label>
          <div className="flex gap-2">
            <select value={form.categorie} onChange={set("categorie")} className={`${selectClass} flex-1`}>
              <option value="">— Sélectionner —</option>
              {config.categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button type="button" onClick={onAddCategorie}
              className="px-2.5 py-2 text-[12px] font-medium bg-stone-100 text-stone-600 border border-stone-200 rounded-lg hover:bg-stone-200 cursor-pointer transition-colors">
              +
            </button>
          </div>
        </div>
        <div>
          <label className={labelClass}>Sous-catégorie *</label>
          <div className="flex gap-2">
            <select value={form.sousCategorie} onChange={set("sousCategorie")} className={`${selectClass} flex-1`}>
              <option value="">— Sélectionner —</option>
              {config.sousCategories.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button type="button" onClick={onAddSousCategorie}
              className="px-2.5 py-2 text-[12px] font-medium bg-stone-100 text-stone-600 border border-stone-200 rounded-lg hover:bg-stone-200 cursor-pointer transition-colors">
              +
            </button>
          </div>
        </div>
      </div>

      <div>
        <label className={labelClass}>Produit / Description *</label>
        <input type="text" value={form.produit} onChange={set("produit")} placeholder="Ex: Pellet porc 25kg" className={inputClass} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Fournisseur</label>
          <input type="text" value={form.fournisseur} onChange={set("fournisseur")} placeholder="Ex: CAC COLMAR" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Référence / Remarque</label>
          <input type="text" value={form.remarque} onChange={set("remarque")} placeholder="Ex: FVC5080688" className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelClass}>Quantité</label>
          <input type="number" min="0" step="0.01" value={form.quantite} onChange={set("quantite")} placeholder="Ex: 5" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Payeur</label>
          <select value={form.payeur} onChange={set("payeur")} className={selectClass}>
            {config.payeurs.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Montant (€) *</label>
          <input type="number" min="0" step="0.01" value={form.montant} onChange={set("montant")} placeholder="Ex: 150.00" className={inputClass} />
        </div>
      </div>
    </div>
  );
}

// ─── Modal ajout valeur ──────────────────────────────────────────────────────
function AddValueModal({ isOpen, onClose, label, onAdd }: {
  isOpen: boolean; onClose: () => void; label: string; onAdd: (v: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!value.trim()) return;
    setLoading(true);
    await onAdd(value.trim());
    setValue(""); setLoading(false); onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={() => { setValue(""); onClose(); }} title={`Ajouter : ${label}`} size="small">
      <div className="space-y-3">
        <input
          type="text" value={value} onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder={`Nouvelle ${label.toLowerCase()}`} autoFocus
          className={inputClass}
        />
        <div className="flex gap-2 justify-end">
          <button onClick={() => { setValue(""); onClose(); }}
            className="px-4 py-2 text-[13px] bg-stone-100 text-stone-700 border border-stone-200 rounded-lg hover:bg-stone-200 cursor-pointer transition-colors">
            Annuler
          </button>
          <button onClick={handleSubmit} disabled={loading || !value.trim()}
            className="px-4 py-2 text-[13px] font-medium text-white bg-stone-900 rounded-lg disabled:opacity-40 cursor-pointer hover:bg-stone-700 transition-colors">
            {loading ? "..." : "Ajouter"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Page principale ─────────────────────────────────────────────────────────
export default function CoutsPageContent() {
  const { state } = useAppStore();
  const { showToast } = useToast();
  const transactions = (state.couts as Transaction[]) || [];

  const [config, setConfig] = useState<CategoriesConfig>({ productions: [], categories: [], sousCategories: [], payeurs: ["SY", "BY", "revolut"] });
  const [configLoading, setConfigLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Transaction | null>(null);
  const [form, setForm] = useState<TransactionFormData>(EMPTY_TRANSACTION_FORM);
  const [formLoading, setFormLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [addModal, setAddModal] = useState<null | "production" | "categorie" | "sousCategorie">(null);

  const [search, setSearch]       = useState("");
  const [filterOp, setFilterOp]   = useState("");
  const [filterProd, setFilterProd] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [filterPayeur, setFilterPayeur] = useState("");
  const [filterAnnee, setFilterAnnee]   = useState("");
  const [tab, setTab] = useState<"liste" | "par-production">("liste");

  useEffect(() => {
    getCategoriesConfig().then((cfg) => { setConfig(cfg); setConfigLoading(false); });
  }, []);

  const refreshConfig = useCallback(async () => {
    const cfg = await getCategoriesConfig();
    setConfig(cfg);
  }, []);

  const stats = useMemo(() => computeStats(transactions), [transactions]);

  // Dette ferme envers SY : avances SY (dépenses payeur=SY) - remboursements SY (revenus payeur=SY)
  const detteSY = useMemo(() => {
    const avances = transactions.filter((t) => t.payeur === "SY" && t.operation === "Dépenses").reduce((s, t) => s + t.montant, 0);
    const remboursements = transactions.filter((t) => t.payeur === "SY" && t.operation === "Revenus").reduce((s, t) => s + t.montant, 0);
    return avances - remboursements;
  }, [transactions]);

  const filtered = useMemo(() => {
    let list = filterTransactions(transactions, {
      operation: filterOp || undefined,
      production: filterProd || undefined,
      categorie: filterCat || undefined,
      payeur: filterPayeur || undefined,
      annee: filterAnnee || undefined,
    });
    if (search) list = searchTransactions(list, search);
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, filterOp, filterProd, filterCat, filterPayeur, filterAnnee, search]);

  const parProduction = useMemo(() => {
    const map: Record<string, { depenses: number; revenus: number }> = {};
    transactions.forEach((t) => {
      if (!map[t.production]) map[t.production] = { depenses: 0, revenus: 0 };
      if (t.operation === "Dépenses") map[t.production].depenses += t.montant;
      else map[t.production].revenus += t.montant;
    });
    return Object.entries(map)
      .map(([production, d]) => ({ production, ...d, balance: d.revenus - d.depenses }))
      .sort((a, b) => a.balance - b.balance);
  }, [transactions]);

  const annees = useMemo(() => {
    const s = new Set(transactions.map((t) => t.date.substring(0, 4)));
    return Array.from(s).sort().reverse();
  }, [transactions]);

  const openAdd = () => {
    setForm({ ...EMPTY_TRANSACTION_FORM, date: new Date().toISOString().split("T")[0] });
    setEditTarget(null);
    setShowModal(true);
  };

  const openEdit = (t: Transaction) => {
    setEditTarget(t);
    setForm({
      date: t.date, operation: t.operation, production: t.production,
      categorie: t.categorie, sousCategorie: t.sousCategorie, produit: t.produit,
      remarque: t.remarque || "", fournisseur: t.fournisseur || "",
      quantite: t.quantite != null ? String(t.quantite) : "",
      payeur: t.payeur, montant: String(t.montant),
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    setFormLoading(true);
    const res = editTarget ? await updateTransaction(editTarget.id, form) : await createTransaction(form);
    setFormLoading(false);
    if (res.success) {
      showToast(editTarget ? { type: "success", title: "Transaction modifiée" } : { type: "success", title: "Transaction ajoutée" });
      setShowModal(false);
    } else {
      showToast({ type: "error", title: res.error || "Erreur" });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const res = await deleteTransaction(deleteTarget.id);
    if (res.success) showToast({ type: "success", title: "Transaction supprimée" });
    else showToast({ type: "error", title: res.error || "Erreur" });
    setDeleteTarget(null);
  };

  const hasFilters = search || filterOp || filterProd || filterCat || filterPayeur || filterAnnee;

  if (configLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 fade-in">

      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-stone-900 tracking-[-0.3px]">Comptabilité</h1>
          <p className="text-[13px] text-stone-400 mt-0.5">Suivi des dépenses et revenus de la ferme</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-white text-[13px] font-medium rounded-lg hover:bg-stone-700 transition-colors cursor-pointer">
          <Plus className="w-3.5 h-3.5" />
          Ajouter une transaction
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Dépenses" value={`${stats.totalDepenses.toLocaleString("fr-FR", { minimumFractionDigits: 0 })} €`} icon={<TrendingDown className="w-3.5 h-3.5 text-red-500" />} />
        <KpiCard label="Revenus" value={`${stats.totalRevenus.toLocaleString("fr-FR", { minimumFractionDigits: 0 })} €`} icon={<TrendingUp className="w-3.5 h-3.5 text-brand-500" />} />
        <KpiCard
          label="Balance"
          value={`${stats.balance >= 0 ? "+" : ""}${stats.balance.toLocaleString("fr-FR", { minimumFractionDigits: 0 })} €`}
          icon={<Scale className="w-3.5 h-3.5" />}
        />
        <KpiCard label="Transactions" value={stats.nbTransactions} icon={<Receipt className="w-3.5 h-3.5" />} />
      </div>

      {/* Dette SY */}
      {detteSY > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-amber-700">Dette ferme envers SY</p>
            <p className="text-[22px] font-bold font-mono text-amber-900 mt-0.5">
              {detteSY.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
            </p>
          </div>
          <button
            onClick={() => {
              setForm({
                ...EMPTY_TRANSACTION_FORM,
                date: new Date().toISOString().split("T")[0],
                operation: "Revenus",
                production: "Ferme",
                categorie: "Remboursement",
                sousCategorie: "SY",
                produit: "Remboursement SY",
                payeur: "SY",
              });
              setEditTarget(null);
              setShowModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-[13px] font-medium rounded-lg hover:bg-amber-700 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Enregistrer remboursement
          </button>
        </div>
      )}

      {/* Onglets */}
      <div className="flex items-center gap-1 p-1 bg-stone-200/60 rounded-lg w-fit">
        {(["liste", "par-production"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-md text-[13px] font-medium transition-all cursor-pointer ${tab === t ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}>
            {t === "liste" ? "Transactions" : "Par production"}
          </button>
        ))}
      </div>

      {tab === "liste" && (
        <>
          {/* Filtres */}
          <div className="bg-white border border-stone-200 rounded-xl p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              <div className="relative col-span-2 md:col-span-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher..." className="w-full pl-9 pr-3 py-2 text-[13px] bg-stone-50 border border-stone-200 rounded-lg placeholder:text-stone-400 text-stone-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
              </div>
              {[
                { val: filterOp,    set: setFilterOp,    placeholder: "Opération",   opts: ["Dépenses", "Revenus"] },
                { val: filterProd,  set: setFilterProd,  placeholder: "Production",  opts: config.productions },
                { val: filterCat,   set: setFilterCat,   placeholder: "Catégorie",   opts: config.categories },
                { val: filterPayeur, set: setFilterPayeur, placeholder: "Payeur",    opts: config.payeurs },
                { val: filterAnnee,  set: setFilterAnnee,  placeholder: "Année",     opts: annees },
              ].map(({ val, set, placeholder, opts }) => (
                <select key={placeholder} value={val} onChange={(e) => set(e.target.value)}
                  className="w-full px-3 py-2 text-[13px] bg-stone-50 border border-stone-200 rounded-lg text-stone-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
                  <option value="">{placeholder}</option>
                  {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ))}
            </div>
            {hasFilters && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-stone-100">
                <span className="text-[12px] text-stone-400">{filtered.length} résultat{filtered.length > 1 ? "s" : ""}</span>
                <button onClick={() => { setSearch(""); setFilterOp(""); setFilterProd(""); setFilterCat(""); setFilterPayeur(""); setFilterAnnee(""); }}
                  className="text-[12px] text-brand-600 hover:underline cursor-pointer">
                  Réinitialiser
                </button>
              </div>
            )}
          </div>

          {/* Tableau */}
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Receipt className="w-10 h-10 text-stone-200 mb-3" />
                <p className="text-[14px] font-medium text-stone-600">Aucune transaction</p>
                <p className="text-[13px] text-stone-400 mt-1">
                  {transactions.length === 0 ? "Commencez par ajouter une dépense ou un revenu." : "Aucun résultat pour ces filtres."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-stone-200">
                      {["Date", "Production", "Catégorie", "Produit", "Fournisseur", "Qté", "Payeur", "Montant", ""].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-stone-400 uppercase tracking-[0.06em] whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {filtered.map((t) => (
                      <tr key={t.id} onClick={() => openEdit(t)} className="hover:bg-stone-50/80 transition-colors group cursor-pointer">
                        <td className="px-4 py-3 text-[12.5px] font-mono text-stone-500 whitespace-nowrap">{formatDate(t.date)}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-brand-50 text-brand-700">
                            {t.production}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[12px] text-stone-500 whitespace-nowrap">
                          {t.categorie} <span className="text-stone-300">›</span> {t.sousCategorie}
                        </td>
                        <td className="px-4 py-3 text-[13px] text-stone-800 max-w-[180px] truncate" title={t.produit}>{t.produit}</td>
                        <td className="px-4 py-3 text-[12px] text-stone-400 whitespace-nowrap">{t.fournisseur || "—"}</td>
                        <td className="px-4 py-3 text-[12px] text-stone-500 text-center">{t.quantite ?? "—"}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-[11px] font-mono bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded">{t.payeur}</span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <span className={`text-[13.5px] font-semibold font-mono ${t.operation === "Revenus" ? "text-brand-600" : "text-stone-900"}`}>
                            {t.operation === "Revenus" ? "+" : "−"}{t.montant.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}
                          </span>
                          <span className="text-[11px] text-stone-400 ml-0.5">€</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openEdit(t)}
                              className="w-7 h-7 rounded-md hover:bg-stone-200 flex items-center justify-center cursor-pointer transition-colors">
                              <Pencil className="w-3.5 h-3.5 text-stone-400" />
                            </button>
                            <button onClick={() => setDeleteTarget({ id: t.id, label: t.produit })}
                              className="w-7 h-7 rounded-md hover:bg-red-50 flex items-center justify-center cursor-pointer transition-colors">
                              <Trash2 className="w-3.5 h-3.5 text-stone-400 hover:text-red-500" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === "par-production" && (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          {parProduction.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <TrendingDown className="w-10 h-10 text-stone-200 mb-3" />
              <p className="text-[14px] text-stone-400">Aucune donnée</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-200">
                  {["Production", "Dépenses", "Revenus", "Balance", "Couverture"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-stone-400 uppercase tracking-[0.06em]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {parProduction.map((row) => {
                  const pct = row.depenses > 0 ? Math.min(100, (row.revenus / row.depenses) * 100) : 100;
                  return (
                    <tr key={row.production} className="hover:bg-stone-50">
                      <td className="px-4 py-3 text-[13px] font-medium text-stone-800">{row.production}</td>
                      <td className="px-4 py-3 text-[13px] font-mono text-stone-900">
                        −{row.depenses.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
                      </td>
                      <td className="px-4 py-3 text-[13px] font-mono text-brand-600">
                        +{row.revenus.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
                      </td>
                      <td className={`px-4 py-3 text-[13px] font-semibold font-mono ${row.balance >= 0 ? "text-brand-600" : "text-stone-900"}`}>
                        {row.balance >= 0 ? "+" : ""}{row.balance.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-stone-100 rounded-full h-1.5">
                            <div className="bg-brand-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[11px] text-stone-400 font-mono">{Math.round(pct)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-stone-200 bg-stone-50">
                <tr>
                  <td className="px-4 py-3 text-[12px] font-semibold uppercase tracking-wide text-stone-500">TOTAL</td>
                  <td className="px-4 py-3 text-[13px] font-semibold font-mono text-stone-900">
                    −{stats.totalDepenses.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
                  </td>
                  <td className="px-4 py-3 text-[13px] font-semibold font-mono text-brand-600">
                    +{stats.totalRevenus.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
                  </td>
                  <td className={`px-4 py-3 text-[14px] font-bold font-mono ${stats.balance >= 0 ? "text-brand-700" : "text-stone-900"}`}>
                    {stats.balance >= 0 ? "+" : ""}{stats.balance.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* Modal transaction */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)}
        title={editTarget ? "Modifier la transaction" : "Nouvelle transaction"}
        size="large"
        buttons={[
          { label: "Annuler", onClick: () => setShowModal(false), className: "px-4 py-2 text-[13px] bg-stone-100 text-stone-700 border border-stone-200 rounded-lg hover:bg-stone-200 cursor-pointer transition-colors" },
          { label: formLoading ? "Enregistrement..." : (editTarget ? "Modifier" : "Ajouter"), onClick: handleSave, className: "px-4 py-2 text-[13px] font-medium text-white bg-stone-900 rounded-lg hover:bg-stone-700 cursor-pointer transition-colors" },
        ]}>
        <TransactionForm form={form} setForm={setForm} config={config}
          onAddProduction={() => setAddModal("production")}
          onAddCategorie={() => setAddModal("categorie")}
          onAddSousCategorie={() => setAddModal("sousCategorie")}
        />
      </Modal>

      {/* Modal suppression */}
      <ConfirmModal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title="Supprimer la transaction"
        message={`Confirmer la suppression de <strong>${deleteTarget?.label}</strong> ?`}
        confirmText="Supprimer" danger />

      {/* Modals catégories */}
      <AddValueModal isOpen={addModal === "production"} onClose={() => setAddModal(null)} label="Production"
        onAdd={async (v) => {
          const res = await addProduction(v, config);
          if (res.success) { showToast({ type: "success", title: `"${v}" ajouté` }); await refreshConfig(); }
          else showToast({ type: "error", title: res.error || "Erreur" });
        }} />
      <AddValueModal isOpen={addModal === "categorie"} onClose={() => setAddModal(null)} label="Catégorie"
        onAdd={async (v) => {
          const res = await addCategorie(v, config);
          if (res.success) { showToast({ type: "success", title: `"${v}" ajouté` }); await refreshConfig(); }
          else showToast({ type: "error", title: res.error || "Erreur" });
        }} />
      <AddValueModal isOpen={addModal === "sousCategorie"} onClose={() => setAddModal(null)} label="Sous-catégorie"
        onAdd={async (v) => {
          const res = await addSousCategorie(v, config);
          if (res.success) { showToast({ type: "success", title: `"${v}" ajouté` }); await refreshConfig(); }
          else showToast({ type: "error", title: res.error || "Erreur" });
        }} />
    </div>
  );
}
