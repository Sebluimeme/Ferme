"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { onValue, ref } from "firebase/database";
import { Plus, Search, SlidersHorizontal, MoreHorizontal, Receipt, Paperclip, ChevronRight, Tractor, ArrowUpRight, X, Trash2 } from "lucide-react";
import { database } from "@/lib/firebase";
import { useAppStore } from "@/store/store";
import { Button, Card, Field, Notice, Sheet, farmStyles } from "@/components/ui/FarmUI";
import PurchaseInvoiceEditor from "@/components/purchases/PurchaseInvoiceEditor";
import FinancingSummary from "@/components/FinancingSummary";
import SubsidyEditor from "@/components/subsidies/SubsidyEditor";
import SubsidySummary from "@/components/subsidies/SubsidySummary";
import { isSubsidyPayment, type SubsidyPayment } from "@/types/subsidy";
import { deleteSubsidyPayment } from "@/services/subsidy-service";
import { payerLabel, uniquePayers } from "@/lib/comptabilite-payers";
import { readTransactionRecords } from "@/lib/transaction-records";
import { FinanceEntryEditor, DebtEntryEditor } from "@/components/purchases/FinanceEntryEditor";
import { getCategoriesConfig, deleteTransaction, searchTransactions, filterTransactions, type CategoriesConfig } from "@/services/comptabilite-service";
import { deletePurchaseInvoice } from "@/services/purchase-invoice-service";
import { expandPurchaseAllocations, isPurchaseInvoice, purchaseInvoiceTitle, type PurchaseInvoice } from "@/types/purchase-invoice";
import { computeStats, computeCreditorBalances, formatDate, getTransactionNature, isOperatingTransaction, type Transaction, type FarmCreditor } from "@/types/comptabilite";
import type { Vehicle } from "@/types/vehicle";
import styles from "./CoutsPageContent.module.css";

const money = (amount: number) => amount.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "fr"));
const vehicleName = (v: Vehicle) => v.nom || [v.marque, v.modele].filter(Boolean).join(" ") || v.plaqueImmatriculation || "Matériel sans nom";
const payerName = payerLabel;
const emptyFilters = { operation: "", production: "", categorie: "", payeur: "", annee: "", vehicleId: "" };

export default function CoutsPageContent() {
  const { state } = useAppStore();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [config, setConfig] = useState<CategoriesConfig>({ productions: [], categories: [], sousCategories: [], payeurs: ["SY", "BY", "revolut"] });
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(emptyFilters);
  const [view, setView] = useState<"ecritures" | "productions" | "materiel" | "aides">("ecritures");
  const [panel, setPanel] = useState<"filters" | "more" | "financing" | null>(null);
  const [invoiceEditor, setInvoiceEditor] = useState<PurchaseInvoice | "new" | null>(null);
  const [subsidyEditor, setSubsidyEditor] = useState<SubsidyPayment | "new" | null>(null);
  const [legacyEditor, setLegacyEditor] = useState<Transaction | "revenue" | "new" | null>(null);
  const [debtEditor, setDebtEditor] = useState<{ kind: "avance" | "remboursement"; payeur: FarmCreditor } | null>(null);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const deleting = useRef(false);
  const [deleteError, setDeleteError] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "warning" | "error"; text: string } | null>(null);

  useEffect(() => { if (new URLSearchParams(window.location.search).get("vue") === "aides") setView("aides"); }, []);

  useEffect(() => {
    if (!state.user) return;
    let active = true;
    getCategoriesConfig().then(value => { if (active) setConfig(value); }).catch(() => { if (active) setLoadError("Les choix de classement n’ont pas pu être chargés. Réessayez avec du réseau."); });
    const unsubTransactions = onValue(ref(database, "transactions"), snapshot => {
      setTransactions(readTransactionRecords(snapshot.val()));
      setLoading(false); setLoadError("");
    }, () => { setLoading(false); setLoadError("Impossible de charger les écritures. Les dernières données affichées sont conservées."); });
    const unsubVehicles = onValue(ref(database, "vehicules"), snapshot => {
      setVehicles(Object.entries(snapshot.val() || {}).map(([key, value]) => ({ ...(value as Vehicle), id: key })));
    }, () => setMessage({ tone: "warning", text: "La liste du matériel n’a pas pu être actualisée." }));
    return () => { active = false; unsubTransactions(); unsubVehicles(); };
  }, [state.user]);

  const analysis = useMemo(() => expandPurchaseAllocations(transactions), [transactions]);
  const matching = (rows: Transaction[]) => {
    let result = filterTransactions(rows, filters);
    if (filters.vehicleId) result = result.filter(row => row.vehicleId === filters.vehicleId);
    if (search.trim()) {
      const q = search.trim().toLocaleLowerCase("fr");
      result = result.filter(row => searchTransactions([row], q).length > 0 || row.vehicleLabel?.toLocaleLowerCase("fr").includes(q) || ("reference" in row && String(row.reference || "").toLocaleLowerCase("fr").includes(q)));
    }
    return result;
  };
  // La sélection analytique ne remplace jamais les enregistrements originaux.
  const filteredAnalysis = matching(analysis);
  const filtered = transactions.map(transaction => ({ transaction, lines: matching(expandPurchaseAllocations([transaction])) }))
    .filter(item => item.lines.length > 0).sort((a, b) => b.transaction.date.localeCompare(a.transaction.date) || (b.transaction.dateCreation || "").localeCompare(a.transaction.dateCreation || ""));
  const stats = computeStats(filteredAnalysis);
  const balances = computeCreditorBalances(transactions);
  const aidReceipts = filteredAnalysis.filter(isSubsidyPayment).reduce((sum, t) => sum + t.montantCentimes, 0) / 100;
  const hasFilters = Object.values(filters).some(Boolean) || !!search.trim();
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const productions = unique([...config.productions, ...analysis.map(t => t.production)]);
  const categories = unique([...config.categories, ...analysis.map(t => t.categorie)]);
  const payers = uniquePayers([...config.payeurs, ...transactions.map(t => t.payeur)]);
  const years = unique(transactions.map(t => t.date.slice(0, 4))).reverse();
  const suppliers = unique(transactions.map(t => t.fournisseur || ""));
  const totals = (dimension: "production" | "vehicleId") => {
    const groups = new Map<string, { label: string; expense: number; revenue: number }>();
    filteredAnalysis.filter(isOperatingTransaction).forEach(row => {
      const key = dimension === "production" ? row.production : row.vehicleId;
      if (!key) return;
      const label = dimension === "production" ? key : vehicles.find(v => v.id === key) ? vehicleName(vehicles.find(v => v.id === key)!) : row.vehicleLabel || "Matériel associé";
      const group = groups.get(key) || { label, expense: 0, revenue: 0 };
      if (row.operation === "Dépenses") group.expense += row.montant; else group.revenue += row.montant;
      groups.set(key, group);
    });
    return Array.from(groups, ([id, values]) => ({ id, ...values })).sort((a, b) => b.expense - a.expense);
  };
  const groups = totals(view === "materiel" ? "vehicleId" : "production");
  const maximum = Math.max(1, ...groups.map(g => g.expense));
  const unassigned = filteredAnalysis.filter(t => t.production === "À affecter" && t.operation === "Dépenses").reduce((sum, t) => sum + t.montant, 0);
  const edit = (transaction: Transaction) => { setSelected(null); if (isPurchaseInvoice(transaction)) setInvoiceEditor(transaction); else if (isSubsidyPayment(transaction)) setSubsidyEditor(transaction); else setLegacyEditor(transaction); };
  const saved = (warning?: string) => {
    setInvoiceEditor(null); setSubsidyEditor(null); setLegacyEditor(null); setDebtEditor(null);
    setMessage({ tone: warning ? "warning" : "success", text: warning || "Enregistrement confirmé." });
  };
  const remove = async () => {
    if (!deleteTarget || deleting.current) return;
    deleting.current = true; setDeleteBusy(true); setDeleteError("");
    try {
      const result = isPurchaseInvoice(deleteTarget)
        ? await deletePurchaseInvoice(deleteTarget.id, deleteTarget.factureVersion)
        : isSubsidyPayment(deleteTarget) ? await deleteSubsidyPayment(deleteTarget.id, deleteTarget.versionSubvention)
        : await deleteTransaction(deleteTarget.id, deleteTarget.pieceJointe?.storagePath);
      if (result.success) { setDeleteTarget(null); setMessage({ tone: result.warning ? "warning" : "success", text: result.warning || "Écriture supprimée." }); }
      else setDeleteError(result.error || "Suppression impossible. L’écriture est conservée.");
    } catch { setDeleteError("Connexion interrompue. Vérifiez l’état de l’écriture avant de réessayer."); }
    finally { deleting.current = false; setDeleteBusy(false); }
  };

  return <div className={`${farmStyles.theme} ${styles.page}`}>
    <header className={styles.header}>
      <div><h1>Coûts</h1><p className={styles.subtitle}>Achats et recettes</p></div>
      <div className={styles.headerActions}><Button variant="ghost" aria-label="Qui a financé la ferme ?" onClick={() => setPanel("financing")}>Financement</Button><Button variant="ghost" aria-label="Autres actions" onClick={() => setPanel("more")}><MoreHorizontal aria-hidden="true" /></Button></div>
    </header>
    {message && <div className={styles.noticeRow}><Notice tone={message.tone}>{message.text}</Notice><Button variant="ghost" aria-label="Masquer le message" onClick={() => setMessage(null)}><X aria-hidden="true" /></Button></div>}
    {loadError && <Notice tone="error">{loadError}</Notice>}
    <Card className={styles.summary}>
      <div className={styles.summaryHeading}><span>Dépenses</span><Button variant="ghost" onClick={() => setPanel("filters")}>{filters.annee || "Toutes les années"}<SlidersHorizontal aria-hidden="true" /></Button></div>
      <p className={styles.bigAmount}>{loading ? "…" : money(stats.totalDepenses)}</p>
      <p className={styles.secondary}>{hasFilters ? "Sélection affichée · hors avances et remboursements personnels" : "Hors avances et remboursements personnels"}</p>
      <div className={styles.summaryDetails}><div><span>Recettes</span><strong>{money(stats.totalRevenus)}</strong></div><div><span>Recettes − achats</span><strong>{money(stats.balance)}</strong></div></div>
      {aidReceipts > 0 && <p className={styles.summaryExplanation}>Dont {money(aidReceipts)} d’aides reçues, déjà comprises dans les recettes.</p>}
      <p className={styles.summaryExplanation}>Cet écart n’est pas la somme à rembourser.</p>
    </Card>
    {unassigned > 0 && <Notice tone="warning">{money(unassigned)} restent à affecter à une production. Ces dépenses sont déjà comprises dans le total.</Notice>}
    {view !== "aides" && <div className={styles.toolbar}><div className={styles.search}><Search aria-hidden="true" /><input aria-label="Rechercher une écriture" placeholder="Fournisseur, achat, matériel…" value={search} onChange={e => setSearch(e.target.value)} /></div><Button aria-label={`Filtres${activeFilterCount ? ` : ${activeFilterCount} actifs` : ""}`} onClick={() => setPanel("filters")}><SlidersHorizontal aria-hidden="true" />{activeFilterCount || ""}</Button></div>}
    <div className={styles.tabs} aria-label="Vue des coûts">{([['ecritures','Écritures'],['productions','Productions'],['materiel','Matériel'],['aides','Aides']] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={view === value} onClick={() => { setView(value); if (value === "aides") { setFilters(emptyFilters); setSearch(""); } }}>{label}</button>)}</div>
    {view !== "aides" && hasFilters && <div className={styles.filterSummary}><span>{filtered.length} écriture{filtered.length !== 1 ? "s" : ""} retenue{filtered.length !== 1 ? "s" : ""}</span><Button variant="ghost" onClick={() => { setFilters(emptyFilters); setSearch(""); }}>Tout afficher</Button></div>}
    {loading ? <Card><p role="status">Chargement des écritures…</p></Card> : view === "aides" ? <SubsidySummary transactions={transactions} onEdit={setSubsidyEditor} /> : view === "ecritures" ? <div className={styles.entries}>
      {!filtered.length && <Card className={styles.empty}><Receipt aria-hidden="true" /><h2>{loadError ? "Données indisponibles" : "Aucune écriture"}</h2><p>{hasFilters ? "Essayez d’autres critères." : "Enregistrez votre premier achat pour commencer."}</p></Card>}
      {filtered.map(({ transaction: t, lines }) => {
        const invoice = isPurchaseInvoice(t);
        const nature = getTransactionNature(t);
        const selectedAmount = lines.reduce((sum, row) => sum + row.montant, 0);
        const partial = invoice && Math.round(selectedAmount * 100) !== Math.round(t.montant * 100);
        const destinations = unique(lines.flatMap(row => [row.production, row.vehicleLabel || ""]));
        return <button className={styles.entry} key={t.id} type="button" onClick={() => setSelected(t)}>
          <span className={styles.entryTop}><span className={styles.entryTitle}>{invoice ? purchaseInvoiceTitle(t) : t.produit || "Écriture"}</span><strong className={styles.entryAmount}>{t.operation === "Revenus" ? "+" : "−"}{money(t.montant)}</strong></span>
          {invoice && t.fournisseur && <span className={styles.entryDescription}>Fournisseur : {t.fournisseur}</span>}
          <span className={styles.entryDescription}>{invoice ? `${t.allocations.length} affectation${t.allocations.length > 1 ? "s" : ""} · ${destinations.join(", ")}` : t.production + " · " + t.sousCategorie}</span>
          {nature !== "exploitation" && <span className={styles.selectionAmount}>{nature === "avance" ? "Avance à la ferme" : "Remboursement personnel"} · hors total des achats</span>}
          {partial && <span className={styles.selectionAmount}>Dont {money(selectedAmount)} pour ces filtres</span>}
          <span className={styles.entryBottom}><span>{formatDate(t.date)} · {payerName(t.payeur)}</span><span className={styles.entryIcons}>{t.pieceJointe && <Paperclip aria-label="Avec justificatif" />}<ChevronRight aria-hidden="true" /></span></span>
        </button>;
      })}
    </div> : <div className={styles.entries}>
      {view === "materiel" && <Notice>Cette vue utilise les liens explicites avec le matériel. Les anciennes écritures ne sont pas attribuées automatiquement.</Notice>}
      {!groups.length && <Card className={styles.empty}><Tractor aria-hidden="true" /><h2>Aucune affectation {view === "materiel" ? "à un matériel" : "pour cette sélection"}</h2><p>Les nouvelles factures alimenteront cette analyse.</p></Card>}
      {groups.map(group => <Card key={group.id}><div className={styles.groupTitle}><h2>{group.label}</h2><strong>{money(group.expense)}</strong></div><div className={styles.bar} aria-hidden="true"><span style={{ width: `${group.expense / maximum * 100}%` }} /></div><div className={styles.groupDetails}><span>Recettes {money(group.revenue)}</span><span>Solde {money(group.revenue - group.expense)}</span></div></Card>)}
    </div>}
    <div className={styles.purchaseAction}><Button variant="primary" fullWidth onClick={() => view === "aides" ? setSubsidyEditor("new") : setInvoiceEditor("new")}><Plus aria-hidden="true" />{view === "aides" ? "Enregistrer une aide reçue" : "Enregistrer un achat"}</Button></div>

    {panel === "filters" && <Sheet title="Filtrer les écritures" onClose={() => setPanel(null)} footer={<Button variant="primary" fullWidth onClick={() => setPanel(null)}>Afficher les résultats</Button>}>
      {([
        ["annee", "Année", years], ["operation", "Opération", ["Dépenses", "Revenus"]], ["production", "Production", productions], ["categorie", "Catégorie", categories], ["payeur", "Payeur", payers],
      ] as const).map(([key,label,options]) => <Field key={key} label={label} htmlFor={`cost-filter-${key}`}><select id={`cost-filter-${key}`} value={filters[key]} onChange={e => setFilters(prev => ({ ...prev, [key]: e.target.value }))}><option value="">Tout afficher</option>{options.map(value => <option key={value} value={value}>{key === "payeur" ? payerName(value) : value}</option>)}</select></Field>)}
      <Field label="Matériel associé" htmlFor="cost-filter-vehicle"><select id="cost-filter-vehicle" value={filters.vehicleId} onChange={e => setFilters(prev => ({ ...prev, vehicleId: e.target.value }))}><option value="">Tous les matériels</option>{vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicleName(vehicle)}</option>)}</select></Field>
    </Sheet>}
    {panel === "more" && <Sheet title="Autres actions" onClose={() => setPanel(null)}><div className={styles.actions}>
      <Button onClick={() => { setPanel(null); setLegacyEditor("revenue"); }}>Ajouter une recette</Button>
      <Button onClick={() => { setPanel(null); setView("aides"); setFilters(emptyFilters); setSearch(""); }}>Aides et subventions</Button>
      <Button onClick={() => setPanel("financing")}>Financement et remboursements</Button>
      <Button onClick={() => { setPanel(null); setLegacyEditor("new"); }}>Saisie détaillée</Button>
      <Link className={styles.actionLink} href="/rapports">Analyse financière<ArrowUpRight aria-hidden="true" /></Link>
    </div></Sheet>}
    {panel === "financing" && <Sheet title="Financement et remboursements" onClose={() => setPanel(null)}><FinancingSummary transactions={transactions}
      onAdvance={payeur => { setPanel(null); setDebtEditor({ kind: "avance", payeur }); }}
      onRepay={payeur => { setPanel(null); setDebtEditor({ kind: "remboursement", payeur }); }}
      onShowEntries={payeur => { setPanel(null); setFilters({ ...emptyFilters, payeur }); setSearch(""); setView("ecritures"); }}
    /></Sheet>}
    {selected && <Sheet title={isPurchaseInvoice(selected) ? "Facture d’achat" : isSubsidyPayment(selected) ? "Aide reçue" : "Détail de l’écriture"} onClose={() => setSelected(null)} footer={<Button variant="primary" fullWidth onClick={() => edit(selected)}>Modifier {isPurchaseInvoice(selected) ? "la facture" : isSubsidyPayment(selected) ? "l’aide" : "l’écriture"}</Button>}>
      <p className={styles.detailAmount}>{money(selected.montant)}</p><p>{isPurchaseInvoice(selected) ? purchaseInvoiceTitle(selected) : selected.produit || "Écriture"}</p>
      {selected.fournisseur && <p className={styles.secondary}>Fournisseur : {selected.fournisseur}</p>}
      <p className={styles.secondary}>{formatDate(selected.date)} · {payerName(selected.payeur)}</p>
      {isSubsidyPayment(selected) && <p className={styles.secondary}>Campagne {selected.subvention.campagne} · Versement inclus dans les recettes</p>}
      {selected.reference && <p className={styles.secondary}>Référence : {selected.reference}</p>}
      {isPurchaseInvoice(selected) ? <div className={styles.actions}>{expandPurchaseAllocations([selected]).map(line => <Card key={line.id}><strong>{line.production} · {money(line.montant)}</strong><p className={styles.secondary}>{line.produit}</p>{line.vehicleLabel && <p className={styles.secondary}>{line.vehicleLabel}</p>}</Card>)}</div> : <p className={styles.secondary}>{selected.production} · {selected.categorie} · {selected.sousCategorie}</p>}
      {selected.remarque && <p className={styles.detailNote}>{selected.remarque}</p>}
      {selected.pieceJointe && <a className={styles.actionLink} href={selected.pieceJointe.url} target="_blank" rel="noopener noreferrer"><Paperclip aria-hidden="true" />Ouvrir le justificatif</a>}
      <Button variant="danger" fullWidth onClick={() => { setDeleteTarget(selected); setSelected(null); setDeleteError(""); }}><Trash2 aria-hidden="true" />Supprimer {isPurchaseInvoice(selected) ? "la facture" : "l’écriture"}</Button>
    </Sheet>}
    {deleteTarget && <Sheet title="Confirmer la suppression" onClose={() => setDeleteTarget(null)} busy={deleteBusy} footer={<Button variant="danger" fullWidth busy={deleteBusy} onClick={remove}>Supprimer définitivement</Button>}><p>{isPurchaseInvoice(deleteTarget) ? "La facture et toutes ses affectations seront supprimées." : "Cette écriture sera supprimée."}</p><p><strong>{isPurchaseInvoice(deleteTarget) ? purchaseInvoiceTitle(deleteTarget) : deleteTarget.produit || "Écriture"} · {money(deleteTarget.montant)}</strong></p>{deleteError && <Notice tone="error">{deleteError}</Notice>}<Button fullWidth onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>Conserver</Button></Sheet>}
    {invoiceEditor && <PurchaseInvoiceEditor invoice={invoiceEditor === "new" ? undefined : invoiceEditor} productions={productions} suppliers={suppliers} vehicles={vehicles} userId={state.user?.uid || ""} onClose={() => setInvoiceEditor(null)} onSaved={saved} />}
    {subsidyEditor && <SubsidyEditor payment={subsidyEditor === "new" ? undefined : subsidyEditor} productions={productions} userId={state.user?.uid || ""} onClose={() => setSubsidyEditor(null)} onSaved={saved} />}
    {legacyEditor && <FinanceEntryEditor transaction={typeof legacyEditor === "string" ? undefined : legacyEditor} revenue={legacyEditor === "revenue"} config={config} transactions={transactions} onClose={() => setLegacyEditor(null)} onSaved={saved} onConfigChange={setConfig} />}
    {debtEditor && <DebtEntryEditor {...debtEditor} balance={balances[debtEditor.payeur]} transactions={transactions} onClose={() => setDebtEditor(null)} onSaved={() => saved()} />}
  </div>;
}
