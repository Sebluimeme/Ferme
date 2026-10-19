"use client";

import { useId, useRef, useState } from "react";
import { normalizePayer, payerLabel, uniquePayers } from "@/lib/comptabilite-payers";
import { Button, Field, Notice, Sheet } from "@/components/ui/FarmUI";
import { createTransaction, updateTransaction, addProduction, addCategorie, addSousCategorie, getCategoriesConfig, type CategoriesConfig } from "@/services/comptabilite-service";
import { EMPTY_TRANSACTION_FORM, getTransactionNature, creditorLabel, type FarmCreditor, type Transaction, type TransactionFormData } from "@/types/comptabilite";

export function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function FinanceEntryEditor({ transaction, config, transactions, onClose, onSaved, onConfigChange, revenue = false }: {
  transaction?: Transaction; config: CategoriesConfig; transactions: Transaction[]; onClose: () => void;
  onSaved: (warning?: string) => void; onConfigChange: (config: CategoriesConfig) => void; revenue?: boolean;
}) {
  const id = useId();
  const [form, setForm] = useState<TransactionFormData>(() => transaction ? {
    date: transaction.date, operation: transaction.operation, production: transaction.production,
    categorie: transaction.categorie, sousCategorie: transaction.sousCategorie, produit: transaction.produit,
    remarque: transaction.remarque || "", fournisseur: transaction.fournisseur || "", quantite: transaction.quantite == null ? "" : String(transaction.quantite),
    payeur: normalizePayer(transaction.payeur), montant: String(transaction.montant), nature: getTransactionNature(transaction),
  } : { ...EMPTY_TRANSACTION_FORM, date: localDate(), operation: revenue ? "Revenus" : "Dépenses" });
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState<"production" | "categorie" | "sousCategorie" | null>(null);
  const [newValue, setNewValue] = useState("");
  const [addingBusy, setAddingBusy] = useState(false);
  const [addingError, setAddingError] = useState("");
  const set = (key: keyof TransactionFormData, value: string) => setForm(prev => ({ ...prev, [key]: value }));
  const save = async () => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError("");
    try {
      const result = transaction
        ? await updateTransaction(transaction.id, form, file, transaction.pieceJointe?.storagePath, transactions)
        : await createTransaction(form, file, transactions);
      if (result.success) onSaved("warning" in result ? String(result.warning || "") : undefined);
      else setError([result.error || "L’enregistrement a échoué. Votre saisie est conservée.", result.warning].filter(Boolean).join(" "));
    } catch { setError("Connexion interrompue. Votre saisie est conservée ; réessayez lorsque le réseau revient."); }
    finally { saving.current = false; setBusy(false); }
  };
  const addValue = async () => {
    if (!adding || addingBusy || !newValue.trim()) return;
    setAddingBusy(true); setAddingError("");
    try {
      const result = await (adding === "production" ? addProduction : adding === "categorie" ? addCategorie : addSousCategorie)(newValue, config);
      if (!result.success) { setAddingError(result.error || "Ajout impossible."); return; }
      onConfigChange(await getCategoriesConfig()); set(adding, newValue.trim()); setAdding(null); setNewValue("");
    } catch { setAddingError("Ajout impossible. Réessayez lorsque le réseau revient."); }
    finally { setAddingBusy(false); }
  };
  const selectOptions = (current: string, values: string[]) => Array.from(new Set([current, ...values])).filter(Boolean);
  return <>
    <Sheet title={transaction ? "Modifier l’écriture" : revenue ? "Nouvelle recette" : "Saisie détaillée"} onClose={onClose} busy={busy}
      description={transaction ? "Les informations de l’écriture existante sont conservées." : "Pour une facture d’achat, utilisez le bouton Enregistrer un achat."}
      footer={<Button variant="primary" fullWidth busy={busy} onClick={save}>{busy ? "Enregistrement…" : "Enregistrer"}</Button>}>
      <form onSubmit={event => { event.preventDefault(); void save(); }}>
        <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Date" htmlFor={`${id}-date`}><input id={`${id}-date`} type="date" value={form.date} onChange={e => set("date", e.target.value)} /></Field>
        <Field label="Nature de l’écriture" htmlFor={`${id}-nature`}><select id={`${id}-nature`} value={form.nature} onChange={e => {
          const nature = e.target.value as TransactionFormData["nature"];
          if (nature === "exploitation") { setForm(prev => ({ ...prev, nature })); return; }
          const advance = nature === "avance";
          setForm(prev => ({ ...prev, nature, operation: advance ? "Dépenses" : "Revenus", production: "Ferme", categorie: advance ? "Avance" : "Remboursement", sousCategorie: advance ? "Avance personnelle vers Revolut" : "Remboursement personnel depuis Revolut", produit: advance ? "Avance personnelle vers Revolut" : "Remboursement personnel depuis Revolut", payeur: prev.payeur === "BY" ? "BY" : "SY" }));
        }}><option value="exploitation">Dépense ou recette</option><option value="avance">Avance vers la ferme</option><option value="remboursement">Remboursement personnel</option></select></Field>
        <Field label="Opération" htmlFor={`${id}-op`}><select id={`${id}-op`} value={form.operation} disabled={form.nature !== "exploitation"} onChange={e => set("operation", e.target.value)}><option>Dépenses</option><option>Revenus</option></select></Field>
        {([
          ["production", "Production", config.productions], ["categorie", "Catégorie historique", config.categories], ["sousCategorie", "Sous-catégorie historique", config.sousCategories],
        ] as const).map(([key, label, options]) => <Field key={key} label={label} htmlFor={`${id}-${key}`}><div style={{ display: "flex", gap: 8 }}><select id={`${id}-${key}`} value={form[key]} onChange={e => set(key, e.target.value)}><option value="">Choisir</option>{selectOptions(form[key], [...options]).map(value => <option key={value}>{value}</option>)}</select><Button aria-label={`Ajouter : ${label}`} onClick={() => { setAdding(key); setNewValue(""); setAddingError(""); }}>+</Button></div></Field>)}
        <Field label="Description" htmlFor={`${id}-description`}><input id={`${id}-description`} value={form.produit} onChange={e => set("produit", e.target.value)} /></Field>
        <Field label="Montant (€)" htmlFor={`${id}-amount`}><input id={`${id}-amount`} inputMode="decimal" value={form.montant} onChange={e => set("montant", e.target.value)} /></Field>
        <Field label={form.operation === "Revenus" ? "Encaissé par" : "Payé par"} htmlFor={`${id}-payer`}><select id={`${id}-payer`} value={form.payeur} onChange={e => set("payeur", e.target.value)}>{uniquePayers([form.payeur, ...config.payeurs]).map(value => <option key={value} value={value}>{payerLabel(value)}</option>)}</select></Field>
        <Field label="Fournisseur (facultatif)" htmlFor={`${id}-supplier`}><input id={`${id}-supplier`} value={form.fournisseur} onChange={e => set("fournisseur", e.target.value)} /></Field>
        <Field label="Référence ou remarque (facultatif)" htmlFor={`${id}-note`}><textarea id={`${id}-note`} value={form.remarque} onChange={e => set("remarque", e.target.value)} /></Field>
        <Field label="Quantité (facultatif)" htmlFor={`${id}-quantity`}><input id={`${id}-quantity`} inputMode="decimal" value={form.quantite} onChange={e => set("quantite", e.target.value)} /></Field>
        <Field label="Justificatif (facultatif)" htmlFor={`${id}-file`}>
          {transaction?.pieceJointe && <p style={{ marginBottom: 12 }}><a href={transaction.pieceJointe.url} target="_blank" rel="noopener noreferrer">Ouvrir le justificatif actuel</a></p>}
          <input id={`${id}-file`} type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0])} />
        </Field>
        </fieldset>
      </form>
    </Sheet>
    {adding && <Sheet title={`Ajouter : ${adding === "production" ? "Production" : adding === "categorie" ? "Catégorie" : "Sous-catégorie"}`} onClose={() => setAdding(null)} busy={addingBusy} footer={<Button variant="primary" fullWidth busy={addingBusy} disabled={!newValue.trim()} onClick={addValue}>Ajouter</Button>}>
      {addingError && <Notice tone="error">{addingError}</Notice>}<Field label="Libellé" htmlFor={`${id}-new`}><input id={`${id}-new`} value={newValue} onChange={e => setNewValue(e.target.value)} /></Field>
    </Sheet>}
  </>;
}

export function DebtEntryEditor({ kind, payeur, balance, transactions, onClose, onSaved }: {
  kind: "avance" | "remboursement"; payeur: FarmCreditor; balance: number; transactions: Transaction[]; onClose: () => void; onSaved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const id = useId();
  const save = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const advance = kind === "avance";
      const result = await createTransaction({ ...EMPTY_TRANSACTION_FORM, date: localDate(), nature: kind, operation: advance ? "Dépenses" : "Revenus", production: "Ferme", categorie: advance ? "Avance" : "Remboursement", sousCategorie: advance ? "Avance personnelle vers Revolut" : "Remboursement personnel depuis Revolut", produit: `${advance ? "Avance" : "Remboursement"} ${creditorLabel(payeur)}`, montant: amount, payeur }, undefined, transactions);
      if (result.success) onSaved(); else setError(result.error || "Enregistrement impossible.");
    } catch { setError("Connexion interrompue. Votre saisie est conservée."); }
    finally { lock.current = false; setBusy(false); }
  };
  return <Sheet title={`${kind === "avance" ? "Avance" : "Remboursement"} · ${creditorLabel(payeur)}`} onClose={onClose} busy={busy}
    description={kind === "avance" ? "Somme avancée au compte de la ferme. Elle ne compte pas comme une dépense d’exploitation." : `Dette actuelle : ${balance.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}. Le remboursement ne compte pas comme une recette.`}
    footer={<Button variant="primary" fullWidth busy={busy} disabled={!amount.trim()} onClick={save}>Enregistrer</Button>}>
    {error && <Notice tone="error">{error}</Notice>}<Field label="Montant (€)" htmlFor={`${id}-debt`}><input id={`${id}-debt`} inputMode="decimal" value={amount} disabled={busy} onChange={e => setAmount(e.target.value)} /></Field>
  </Sheet>;
}
