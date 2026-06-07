"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
  formatMontant,
  formatDate,
  EMPTY_TRANSACTION_FORM,
  type Transaction,
  type TransactionFormData,
  type OperationType,
} from "@/types/comptabilite";

// ===================== Formulaire ajout/édition =====================

function TransactionForm({
  form,
  setForm,
  config,
  onAddProduction,
  onAddCategorie,
  onAddSousCategorie,
}: {
  form: TransactionFormData;
  setForm: (f: TransactionFormData) => void;
  config: CategoriesConfig;
  onAddProduction: () => void;
  onAddCategorie: () => void;
  onAddSousCategorie: () => void;
}) {
  const set = (field: keyof TransactionFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [field]: e.target.value });

  const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary";
  const labelClass = "text-xs font-semibold text-gray-600 mb-1 block";

  return (
    <div className="space-y-4">
      {/* Ligne 1 : Date + Opération */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Date *</label>
          <input type="date" value={form.date} onChange={set("date")} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Opération *</label>
          <select value={form.operation} onChange={set("operation")} className={inputClass}>
            <option value="Dépenses">Dépenses</option>
            <option value="Revenus">Revenus</option>
          </select>
        </div>
      </div>

      {/* Ligne 2 : Production */}
      <div>
        <label className={labelClass}>Production *</label>
        <div className="flex gap-2">
          <select value={form.production} onChange={set("production")} className={`${inputClass} flex-1`}>
            <option value="">-- Sélectionner --</option>
            {config.productions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button type="button" onClick={onAddProduction} className="px-3 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-lg text-sm hover:bg-gray-200 cursor-pointer whitespace-nowrap">
            + Ajouter
          </button>
        </div>
      </div>

      {/* Ligne 3 : Catégorie + Sous-catégorie */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Catégorie *</label>
          <div className="flex gap-2">
            <select value={form.categorie} onChange={set("categorie")} className={`${inputClass} flex-1`}>
              <option value="">-- Sélectionner --</option>
              {config.categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button type="button" onClick={onAddCategorie} className="px-2 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm hover:bg-gray-200 cursor-pointer">
              +
            </button>
          </div>
        </div>
        <div>
          <label className={labelClass}>Sous-catégorie *</label>
          <div className="flex gap-2">
            <select value={form.sousCategorie} onChange={set("sousCategorie")} className={`${inputClass} flex-1`}>
              <option value="">-- Sélectionner --</option>
              {config.sousCategories.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button type="button" onClick={onAddSousCategorie} className="px-2 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm hover:bg-gray-200 cursor-pointer">
              +
            </button>
          </div>
        </div>
      </div>

      {/* Ligne 4 : Produit */}
      <div>
        <label className={labelClass}>Produit / Description *</label>
        <input type="text" value={form.produit} onChange={set("produit")} placeholder="Ex: Pellet porc 25kg" className={inputClass} />
      </div>

      {/* Ligne 5 : Fournisseur + Remarque */}
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

      {/* Ligne 6 : Quantité + Payeur + Montant */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelClass}>Quantité</label>
          <input type="number" min="0" step="0.01" value={form.quantite} onChange={set("quantite")} placeholder="Ex: 5" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Payeur</label>
          <select value={form.payeur} onChange={set("payeur")} className={inputClass}>
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

// ===================== Modal ajout d'une valeur =====================

function AddValueModal({
  isOpen,
  onClose,
  label,
  onAdd,
}: {
  isOpen: boolean;
  onClose: () => void;
  label: string;
  onAdd: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!value.trim()) return;
    setLoading(true);
    await onAdd(value.trim());
    setValue("");
    setLoading(false);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={() => { setValue(""); onClose(); }} title={`Ajouter : ${label}`} size="small">
      <div className="space-y-3">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder={`Nouvelle ${label.toLowerCase()}`}
          autoFocus
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={() => { setValue(""); onClose(); }} className="px-4 py-2 text-sm bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 cursor-pointer">
            Annuler
          </button>
          <button onClick={handleSubmit} disabled={loading || !value.trim()} className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-primary to-secondary rounded-lg disabled:opacity-50 cursor-pointer">
            {loading ? "..." : "Ajouter"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ===================== Page principale =====================

export default function CoutsPageContent() {
  const { state } = useAppStore();
  const { showToast } = useToast();

  // Cast — couts est unknown[] dans le store global
  const transactions = (state.couts as Transaction[]) || [];

  const [config, setConfig] = useState<CategoriesConfig>({
    productions: [],
    categories: [],
    sousCategories: [],
    payeurs: ["SY", "BY", "revolut"],
  });
  const [configLoading, setConfigLoading] = useState(true);

  // Formulaire
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTransaction, setEditTransaction] = useState<Transaction | null>(null);
  const [form, setForm] = useState<TransactionFormData>(EMPTY_TRANSACTION_FORM);
  const [formLoading, setFormLoading] = useState(false);

  // Suppression
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);

  // Ajout catégories
  const [addModal, setAddModal] = useState<null | "production" | "categorie" | "sousCategorie">(null);

  // Filtres
  const [search, setSearch] = useState("");
  const [filterOp, setFilterOp] = useState("");
  const [filterProd, setFilterProd] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [filterPayeur, setFilterPayeur] = useState("");
  const [filterAnnee, setFilterAnnee] = useState("");

  // Onglets
  const [tab, setTab] = useState<"liste" | "par-production">("liste");

  // Chargement config
  useEffect(() => {
    getCategoriesConfig().then((cfg) => {
      setConfig(cfg);
      setConfigLoading(false);
    });
  }, []);

  const refreshConfig = useCallback(async () => {
    const cfg = await getCategoriesConfig();
    setConfig(cfg);
  }, []);

  // Calcul stats
  const stats = useMemo(() => computeStats(transactions), [transactions]);

  // Filtrage + recherche
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

  // Par production
  const parProduction = useMemo(() => {
    const map: Record<string, { depenses: number; revenus: number }> = {};
    transactions.forEach((t) => {
      if (!map[t.production]) map[t.production] = { depenses: 0, revenus: 0 };
      if (t.operation === "Dépenses") map[t.production].depenses += t.montant;
      else map[t.production].revenus += t.montant;
    });
    return Object.entries(map)
      .map(([production, data]) => ({ production, ...data, balance: data.revenus - data.depenses }))
      .sort((a, b) => a.balance - b.balance);
  }, [transactions]);

  // Années disponibles pour filtre
  const annees = useMemo(() => {
    const set = new Set(transactions.map((t) => t.date.substring(0, 4)));
    return Array.from(set).sort().reverse();
  }, [transactions]);

  // Ouvrir modal ajout
  const openAdd = () => {
    setForm({ ...EMPTY_TRANSACTION_FORM, date: new Date().toISOString().split("T")[0] });
    setEditTransaction(null);
    setShowAddModal(true);
  };

  // Ouvrir modal édition
  const openEdit = (t: Transaction) => {
    setEditTransaction(t);
    setForm({
      date: t.date,
      operation: t.operation,
      production: t.production,
      categorie: t.categorie,
      sousCategorie: t.sousCategorie,
      produit: t.produit,
      remarque: t.remarque || "",
      fournisseur: t.fournisseur || "",
      quantite: t.quantite != null ? String(t.quantite) : "",
      payeur: t.payeur,
      montant: String(t.montant),
    });
    setShowAddModal(true);
  };

  // Sauvegarder
  const handleSave = async () => {
    setFormLoading(true);
    const res = editTransaction
      ? await updateTransaction(editTransaction.id, form)
      : await createTransaction(form);
    setFormLoading(false);

    if (res.success) {
      showToast(editTransaction ? { type: "success", title: "Transaction modifiée" } : { type: "success", title: "Transaction ajoutée" });
      setShowAddModal(false);
    } else {
      showToast({ type: "error", title: res.error || "Erreur" });
    }
  };

  // Supprimer
  const handleDelete = async () => {
    if (!deleteTarget) return;
    const res = await deleteTransaction(deleteTarget.id);
    if (res.success) showToast({ type: "success", title: "Transaction supprimée" });
    else showToast({ type: "error", title: res.error || "Erreur" });
    setDeleteTarget(null);
  };

  if (configLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">💰 Comptabilité</h1>
          <p className="text-sm text-gray-500 mt-1">Suivi des dépenses et revenus de la ferme</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-br from-primary to-secondary text-white rounded-lg font-semibold text-sm hover:opacity-90 transition cursor-pointer"
        >
          <span className="text-lg">+</span>
          Ajouter une transaction
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Dépenses totales"
          value={`${stats.totalDepenses.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €`}
          borderColorClass="border-l-red-400"
          valueColorClass="text-red-600"
        />
        <KpiCard
          label="Revenus totaux"
          value={`${stats.totalRevenus.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €`}
          borderColorClass="border-l-green-400"
          valueColorClass="text-green-600"
        />
        <KpiCard
          label="Balance"
          value={`${stats.balance >= 0 ? "+" : ""}${stats.balance.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €`}
          borderColorClass={stats.balance >= 0 ? "border-l-green-500" : "border-l-red-500"}
          valueColorClass={stats.balance >= 0 ? "text-green-700" : "text-red-700"}
        />
        <KpiCard
          label="Transactions"
          value={stats.nbTransactions}
          borderColorClass="border-l-primary"
        />
      </div>

      {/* Onglets */}
      <div className="flex gap-1 border-b border-gray-200">
        {(["liste", "par-production"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition cursor-pointer ${
              tab === t ? "bg-white border border-b-white border-gray-200 text-primary -mb-px" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {t === "liste" ? "📋 Toutes les transactions" : "📊 Par production"}
          </button>
        ))}
      </div>

      {tab === "liste" && (
        <>
          {/* Filtres */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 Rechercher..."
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 col-span-2 md:col-span-1"
              />
              <select value={filterOp} onChange={(e) => setFilterOp(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none">
                <option value="">Toutes opérations</option>
                <option value="Dépenses">Dépenses</option>
                <option value="Revenus">Revenus</option>
              </select>
              <select value={filterProd} onChange={(e) => setFilterProd(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none">
                <option value="">Toutes productions</option>
                {config.productions.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none">
                <option value="">Toutes catégories</option>
                {config.categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filterPayeur} onChange={(e) => setFilterPayeur(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none">
                <option value="">Tous payeurs</option>
                {config.payeurs.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={filterAnnee} onChange={(e) => setFilterAnnee(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none">
                <option value="">Toutes années</option>
                {annees.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            {(search || filterOp || filterProd || filterCat || filterPayeur || filterAnnee) && (
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-gray-500">{filtered.length} résultat{filtered.length > 1 ? "s" : ""}</span>
                <button
                  onClick={() => { setSearch(""); setFilterOp(""); setFilterProd(""); setFilterCat(""); setFilterPayeur(""); setFilterAnnee(""); }}
                  className="text-xs text-primary hover:underline cursor-pointer"
                >
                  Réinitialiser filtres
                </button>
              </div>
            )}
          </div>

          {/* Tableau */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <div className="text-5xl mb-3">💰</div>
                <p className="font-medium">Aucune transaction</p>
                <p className="text-sm mt-1">
                  {transactions.length === 0
                    ? "Commencez par ajouter une dépense ou un revenu."
                    : "Aucun résultat pour ces filtres."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500 tracking-wide">
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Production</th>
                      <th className="px-4 py-3 text-left">Catégorie</th>
                      <th className="px-4 py-3 text-left">Produit</th>
                      <th className="px-4 py-3 text-left">Fournisseur</th>
                      <th className="px-4 py-3 text-center">Qté</th>
                      <th className="px-4 py-3 text-center">Payeur</th>
                      <th className="px-4 py-3 text-right">Montant</th>
                      <th className="px-4 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((t) => (
                      <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(t.date)}</td>
                        <td className="px-4 py-3">
                          <span className="inline-block bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-xs font-medium">{t.production}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          <span className="text-gray-500 text-xs">{t.categorie}</span>
                          <span className="mx-1 text-gray-300">›</span>
                          <span className="text-xs">{t.sousCategorie}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-800 max-w-[200px] truncate" title={t.produit}>{t.produit}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{t.fournisseur || "—"}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{t.quantite != null ? t.quantite : "—"}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono">{t.payeur}</span>
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${t.operation === "Revenus" ? "text-green-600" : "text-red-600"}`}>
                          {formatMontant(t.montant, t.operation)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={() => openEdit(t)}
                              className="p-1.5 text-gray-400 hover:text-primary hover:bg-gray-100 rounded-lg transition cursor-pointer"
                              title="Modifier"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => setDeleteTarget({ id: t.id, label: t.produit })}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition cursor-pointer"
                              title="Supprimer"
                            >
                              🗑️
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {parProduction.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-4xl mb-2">📊</p>
              <p>Aucune donnée</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500 tracking-wide">
                  <th className="px-4 py-3 text-left">Production</th>
                  <th className="px-4 py-3 text-right">Dépenses</th>
                  <th className="px-4 py-3 text-right">Revenus</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3 text-right">Progression</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {parProduction.map((row) => {
                  const pct = row.depenses > 0 ? Math.min(100, (row.revenus / row.depenses) * 100) : 100;
                  return (
                    <tr key={row.production} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{row.production}</td>
                      <td className="px-4 py-3 text-right text-red-600 font-semibold">
                        -{row.depenses.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
                      </td>
                      <td className="px-4 py-3 text-right text-green-600 font-semibold">
                        +{row.revenus.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
                      </td>
                      <td className={`px-4 py-3 text-right font-bold ${row.balance >= 0 ? "text-green-700" : "text-red-700"}`}>
                        {row.balance >= 0 ? "+" : ""}{row.balance.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-24 bg-red-100 rounded-full h-2">
                            <div
                              className="bg-green-500 h-2 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 w-8">{Math.round(pct)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-gray-300 bg-gray-50">
                <tr>
                  <td className="px-4 py-3 font-bold text-gray-900">TOTAL</td>
                  <td className="px-4 py-3 text-right font-bold text-red-700">
                    -{stats.totalDepenses.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-green-700">
                    +{stats.totalRevenus.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
                  </td>
                  <td className={`px-4 py-3 text-right font-bold text-lg ${stats.balance >= 0 ? "text-green-800" : "text-red-800"}`}>
                    {stats.balance >= 0 ? "+" : ""}{stats.balance.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* Modal ajout / édition */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={editTransaction ? "✏️ Modifier la transaction" : "➕ Nouvelle transaction"}
        size="large"
        buttons={[
          { label: "Annuler", onClick: () => setShowAddModal(false), className: "px-4 py-2 text-sm bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 cursor-pointer" },
          {
            label: formLoading ? "Enregistrement..." : (editTransaction ? "Modifier" : "Ajouter"),
            onClick: handleSave,
            className: "px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-primary to-secondary rounded-lg disabled:opacity-50 cursor-pointer",
          },
        ]}
      >
        <TransactionForm
          form={form}
          setForm={setForm}
          config={config}
          onAddProduction={() => setAddModal("production")}
          onAddCategorie={() => setAddModal("categorie")}
          onAddSousCategorie={() => setAddModal("sousCategorie")}
        />
      </Modal>

      {/* Modal suppression */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Supprimer la transaction"
        message={`Confirmer la suppression de <strong>${deleteTarget?.label}</strong> ?`}
        confirmText="Supprimer"
        danger
      />

      {/* Modals ajout catégories */}
      <AddValueModal
        isOpen={addModal === "production"}
        onClose={() => setAddModal(null)}
        label="Production"
        onAdd={async (v) => {
          const res = await addProduction(v, config);
          if (res.success) { showToast({ type: "success", title: `Production "${v}" ajoutée` }); await refreshConfig(); }
          else showToast({ type: "error", title: res.error || "Erreur" });
        }}
      />
      <AddValueModal
        isOpen={addModal === "categorie"}
        onClose={() => setAddModal(null)}
        label="Catégorie"
        onAdd={async (v) => {
          const res = await addCategorie(v, config);
          if (res.success) { showToast({ type: "success", title: `Catégorie "${v}" ajoutée` }); await refreshConfig(); }
          else showToast({ type: "error", title: res.error || "Erreur" });
        }}
      />
      <AddValueModal
        isOpen={addModal === "sousCategorie"}
        onClose={() => setAddModal(null)}
        label="Sous-catégorie"
        onAdd={async (v) => {
          const res = await addSousCategorie(v, config);
          if (res.success) { showToast({ type: "success", title: `Sous-catégorie "${v}" ajoutée` }); await refreshConfig(); }
          else showToast({ type: "error", title: res.error || "Erreur" });
        }}
      />
    </div>
  );
}
