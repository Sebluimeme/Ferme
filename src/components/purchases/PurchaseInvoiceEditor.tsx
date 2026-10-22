"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight, ExternalLink, Paperclip, Plus, Tractor, Trash2, X } from "lucide-react";
import type { Vehicle } from "@/types/vehicle";
import { KNOWN_PAYERS, normalizePayer, payerLabel, uniquePayers } from "@/lib/comptabilite-payers";
import { invoiceToDraft, makeEmptyInvoiceDraft, parseMoneyCents, PURCHASE_TYPES, validatePurchaseInvoice, type PurchaseInvoice, type PurchaseInvoiceDraft } from "@/types/purchase-invoice";
import { savePurchaseInvoice } from "@/services/purchase-invoice-service";
import { Button, Card, Field, Notice, Sheet, farmStyles, useBodyScrollLock, useDialogFocus, useVisualViewport } from "@/components/ui/FarmUI";
import styles from "./PurchaseInvoiceEditor.module.css";

type AllocationDraft = PurchaseInvoiceDraft["allocations"][number];
type SavedDraft = { schema: 1; draft: PurchaseInvoiceDraft; file: File | null; updatedAt: string };
type Props = { invoice?: PurchaseInvoice; productions: string[]; suppliers: string[]; vehicles: Vehicle[]; userId: string; onClose: () => void; onSaved: (warning?: string) => void };

const money = (cents: number) => `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const amountInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const vehicleName = (vehicle: Vehicle) => vehicle.nom || [vehicle.marque, vehicle.modele].filter(Boolean).join(" ") || vehicle.plaqueImmatriculation || "Matériel sans nom";

/** IndexedDB stores the File itself; drafts never leave this browser automatically. */
function openDraftDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error("Stockage local indisponible")); return; }
    const request = indexedDB.open("ferme-purchase-drafts", 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("drafts")) request.result.createObjectStore("drafts"); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Stockage local temporairement indisponible"));
  });
}

async function readDraft(key: string): Promise<SavedDraft | undefined> {
  const db = await openDraftDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("drafts", "readonly").objectStore("drafts").get(key);
      request.onsuccess = () => resolve(request.result as SavedDraft | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

function isRestorable(record: SavedDraft | undefined): record is SavedDraft {
  const draft = record?.draft;
  return record?.schema === 1 && !!draft
    && [draft.id, draft.date, draft.fournisseur, draft.reference, draft.payeur, draft.montant, draft.remarque].every(value => typeof value === "string")
    && Array.isArray(draft.allocations)
    && draft.allocations.every(part => !!part && [part.id, part.production, part.typeAchat, part.description, part.quantite, part.montant].every(value => typeof value === "string"));
}

async function writeDraft(key: string, record: SavedDraft | null) {
  const db = await openDraftDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("drafts", "readwrite");
      if (record) transaction.objectStore("drafts").put(record, key);
      else transaction.objectStore("drafts").delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

export default function PurchaseInvoiceEditor({ invoice, productions, suppliers, vehicles, userId, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<PurchaseInvoiceDraft>(() => invoice ? invoiceToDraft(invoice) : makeEmptyInvoiceDraft());
  const [file, setFile] = useState<File | null>(null);
  const [ready, setReady] = useState(false);
  const [recovered, setRecovered] = useState<SavedDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [localStatus, setLocalStatus] = useState<"saved" | "saving" | "error" | "idle">("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [allocation, setAllocation] = useState<AllocationDraft | null>(null);
  const [allocationError, setAllocationError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const viewport = useVisualViewport();
  const dialogRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const saveLock = useRef(false);
  const editRevision = useRef(0);
  const dirtyRef = useRef(false);
  const completed = useRef(false);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const draftKey = `${userId}:${invoice?.id || "new"}`;
  const current = useRef({ draft, file });
  current.current = { draft, file };
  const validation = useMemo(() => validatePurchaseInvoice(draft), [draft]);
  const totalCents = parseMoneyCents(draft.montant) || 0;
  const allocatedCents = draft.allocations.reduce((sum, part) => sum + (parseMoneyCents(part.montant) || 0), 0);
  const remaining = totalCents - allocatedCents;
  const unassignedCount = draft.allocations.filter(part => part.production === "À affecter").length;
  const productionOptions = Array.from(new Set([...productions.filter(Boolean), "Frais communs", "À affecter", ...draft.allocations.map(part => part.production)])).filter(Boolean);
  const sortedVehicles = useMemo(() => [...vehicles].sort((a, b) => vehicleName(a).localeCompare(vehicleName(b), "fr")), [vehicles]);

  const queueWrite = (record: SavedDraft | null) => {
    const next = writeQueue.current.catch(() => {}).then(() => writeDraft(draftKey, record));
    writeQueue.current = next;
    return next;
  };
  const persistCurrent = async () => {
    const revision = editRevision.current;
    setLocalStatus("saving");
    try { await queueWrite({ schema: 1, ...current.current, updatedAt: new Date().toISOString() }); if (revision === editRevision.current) setLocalStatus("saved"); return true; }
    catch { setLocalStatus("error"); return false; }
  };
  const requestClose = () => { if (saveLock.current) return; if (dirty) setConfirmClose(true); else onClose(); };
  useDialogFocus(dialogRef, requestClose, busy);
  useBodyScrollLock();

  useEffect(() => {
    let cancelled = false;
    readDraft(draftKey).then(record => {
      if (!cancelled && isRestorable(record)) setRecovered(record);
    }).catch(() => { if (!cancelled) setLocalStatus("error"); }).finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [draftKey]);

  useEffect(() => {
    const refresh = () => setOnline(navigator.onLine);
    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => { window.removeEventListener("online", refresh); window.removeEventListener("offline", refresh); };
  }, []);

  useEffect(() => {
    if (!ready || recovered || !dirty || busy) return;
    setLocalStatus("saving");
    const timeout = setTimeout(() => { if (!saveLock.current) void persistCurrent(); }, 350);
    return () => clearTimeout(timeout);
    // Each edit is saved after a short pause; saving to the server suspends this queue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, file, ready, recovered, dirty, busy]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (busy || (dirty && localStatus !== "saved")) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, localStatus, busy]);

  useEffect(() => {
    // Flush a recent edit before backgrounding the app; the debounced save alone
    // can otherwise miss the last keystrokes when navigating away quickly.
    const flush = () => {
      if (!dirtyRef.current || completed.current || saveLock.current) return;
      const record: SavedDraft = { schema: 1, ...current.current, updatedAt: new Date().toISOString() };
      writeQueue.current = writeQueue.current.catch(() => {}).then(() => writeDraft(draftKey, record));
      void writeQueue.current.catch(() => {});
    };
    const onHidden = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", flush);
    return () => { document.removeEventListener("visibilitychange", onHidden); window.removeEventListener("pagehide", flush); flush(); };
  }, [draftKey]);

  const markChanged = () => { editRevision.current += 1; dirtyRef.current = true; setDirty(true); setLocalStatus("saving"); };
  const change = (next: PurchaseInvoiceDraft) => { const normalized = { ...next, payeur: normalizePayer(next.payeur) }; current.current = { ...current.current, draft: normalized }; setDraft(normalized); markChanged(); };
  const changeTotal = (value: string) => {
    const only = draft.allocations[0];
    const followsTotal = draft.allocations.length === 1 && (!only.montant || parseMoneyCents(only.montant) === parseMoneyCents(draft.montant));
    change({ ...draft, montant: value, allocations: followsTotal ? [{ ...only, montant: value }] : draft.allocations });
  };
  const chooseFile = (nextFile: File | undefined) => {
    if (!nextFile) return;
    const accepted = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/i.test(nextFile.type) || (!nextFile.type && /\.(pdf|jpe?g|png|webp|heic|heif)$/i.test(nextFile.name));
    if (!accepted || nextFile.size === 0 || nextFile.size > 10 * 1024 * 1024) { setError(!accepted ? "Choisissez une photo JPEG, PNG, WebP, HEIC ou un PDF." : nextFile.size === 0 ? "Le justificatif choisi est vide." : "Le justificatif dépasse 10 Mo. Choisissez une photo ou un PDF plus léger."); return; }
    current.current = { ...current.current, file: nextFile }; setFile(nextFile); markChanged(); setError(null);
  };
  const editAllocation = (part?: AllocationDraft) => {
    setAllocationError(null);
    setAllocation(part ? { ...part } : { id: crypto.randomUUID(), production: "À affecter", vehicleId: "", vehicleLabel: "", typeAchat: "autre", description: "", quantite: "", montant: remaining > 0 ? amountInput(remaining) : "" });
  };
  const commitAllocation = () => {
    if (!allocation) return;
    const cents = parseMoneyCents(allocation.montant);
    if (!cents || cents <= 0) { setAllocationError("Indiquez un montant positif, avec deux décimales au maximum."); return; }
    if (!allocation.production) { setAllocationError("Choisissez une production, Frais communs ou À affecter."); return; }
    if (allocation.quantite.trim() && (!/^\d+(?:[.,]\d+)?$/.test(allocation.quantite.trim()) || !Number.isFinite(Number(allocation.quantite.replace(",", "."))) || Number(allocation.quantite.replace(",", ".")) <= 0)) { setAllocationError("La quantité doit être un nombre positif, ou rester vide."); return; }
    const exists = draft.allocations.some(part => part.id === allocation.id);
    change({ ...draft, allocations: exists ? draft.allocations.map(part => part.id === allocation.id ? allocation : part) : [...draft.allocations, allocation] });
    setAllocation(null);
  };
  const save = async () => {
    if (saveLock.current || !ready || recovered) return;
    if (!validation.valid) { setError(validation.errors.join(" ")); return; }
    if (!navigator.onLine) { setError("Vous êtes hors ligne. Le brouillon reste sur cet appareil ; reconnectez-vous puis appuyez sur Enregistrer."); await persistCurrent(); return; }
    saveLock.current = true; setBusy(true); setError(null);
    await persistCurrent();
    try {
      const result = await savePurchaseInvoice(draft, { pieceJointe: file || undefined, expectedVersion: draft.version || 0 });
      if (!result.success) { setError(result.error || "L’enregistrement n’a pas été confirmé. Votre saisie est conservée ; vous pouvez réessayer."); return; }
      setDirty(false);
      dirtyRef.current = false;
      let warning = result.warning;
      try { await queueWrite(null); } catch { warning = [warning, "La facture est enregistrée, mais son brouillon local n’a pas pu être effacé."].filter(Boolean).join(" "); }
      completed.current = true;
      onSaved(warning);
    } catch {
      setError("L’enregistrement n’a pas été confirmé. Votre saisie est conservée. Vérifiez le réseau, puis réessayez.");
    } finally { saveLock.current = false; setBusy(false); }
  };

  const closeWithDraft = async (keep: boolean) => {
    if (saveLock.current) return;
    saveLock.current = true; setBusy(true);
    try {
      if (keep) {
        if (!await persistCurrent()) { setError("Le brouillon n’a pas pu être conservé. Continuez la saisie ou abandonnez-le explicitement."); setConfirmClose(false); return; }
      } else {
        await queueWrite(null);
        setDirty(false);
      }
      completed.current = true;
      onClose();
    } catch { setLocalStatus("error"); setError("Impossible d’effacer le brouillon local. Réessayez avant de l’abandonner."); setConfirmClose(false); }
    finally { saveLock.current = false; setBusy(false); }
  };

  if (typeof document === "undefined") return null;
  return createPortal(<div className={`${farmStyles.theme} ${styles.screen}`} style={viewport} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="purchase-editor-title" tabIndex={-1} data-farm-dialog>
    <header className={styles.header}><div className={styles.headerInner}><div className={styles.headerCopy}><p className={styles.eyebrow}>Ferme · Achats</p><h1 id="purchase-editor-title">{invoice ? "Modifier la facture" : "Nouvelle facture d’achat"}</h1></div><Button className={styles.close} variant="ghost" onClick={requestClose} disabled={busy} aria-label="Fermer la facture"><X aria-hidden="true" /></Button></div></header>
    <div className={styles.body}><div className={styles.content}>
      {!ready && <p className={styles.busyMessage}>Recherche d’un brouillon sur cet appareil…</p>}
      {recovered && <Card className={styles.restoreCard}><h2 className={styles.restoreTitle}>Un brouillon vous attend</h2><p>Enregistré sur cet appareil le {new Date(recovered.updatedAt).toLocaleString("fr-FR")}{recovered.file ? ", avec son justificatif" : ""}. Aucun envoi automatique.</p><div className={styles.stack}><Button variant="primary" fullWidth onClick={() => { current.current = { draft: recovered.draft, file: recovered.file || null }; setDraft(recovered.draft); setFile(recovered.file || null); markChanged(); setRecovered(null); }}>Reprendre le brouillon</Button><Button fullWidth onClick={async () => { try { await queueWrite(null); setRecovered(null); } catch { setError("Impossible d’effacer le brouillon local. Réessayez ou reprenez-le."); } }}>Abandonner ce brouillon</Button></div></Card>}
      {!online && <Notice tone="warning">Pas de connexion. Vous pouvez préparer la facture ici ; il faudra du réseau pour l’enregistrer dans la ferme.</Notice>}
      {localStatus === "error" && <Notice tone="warning">Le stockage du brouillon sur cet appareil est indisponible. Gardez cet écran ouvert pour conserver votre saisie.</Notice>}
      <fieldset disabled={!ready || !!recovered || busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <Card>
          <label className={styles.heroLabel} htmlFor="purchase-total">Montant total de la facture</label><div className={styles.amount}><input id="purchase-total" type="text" inputMode="decimal" autoComplete="off" placeholder="0,00" value={draft.montant} onChange={event => changeTotal(event.target.value)} aria-label="Montant total de la facture en euros" /><span aria-hidden="true">€</span></div>
          {draft.allocations.length === 1 && <div className={styles.purchaseTitle}><Field label="Intitulé de l’achat" htmlFor="purchase-title" hint="Le nom qui apparaîtra dans la liste des coûts."><input id="purchase-title" maxLength={1000} value={draft.allocations[0].description} onChange={event => change({ ...draft, allocations: [{ ...draft.allocations[0], description: event.target.value }] })} placeholder="Ex. Boule de direction" /></Field></div>}
          <div className={styles.formGrid}><Field label="Date" htmlFor="purchase-date"><input id="purchase-date" type="date" value={draft.date} onChange={event => change({ ...draft, date: event.target.value })} /></Field><Field label="Payé par" htmlFor="purchase-payer"><select id="purchase-payer" value={normalizePayer(draft.payeur)} onChange={event => change({ ...draft, payeur: event.target.value })}>{uniquePayers([...KNOWN_PAYERS, draft.payeur]).map(value => <option key={value} value={value}>{payerLabel(value)}</option>)}</select></Field></div>
          <div style={{ marginTop: 16 }}><Field label={<>Fournisseur <span className={styles.optional}>· facultatif</span></>} htmlFor="purchase-supplier"><input id="purchase-supplier" list="purchase-known-suppliers" maxLength={240} autoComplete="off" placeholder="Nom du fournisseur" value={draft.fournisseur} onChange={event => change({ ...draft, fournisseur: event.target.value })} /><datalist id="purchase-known-suppliers">{Array.from(new Set(suppliers)).filter(Boolean).map(supplier => <option key={supplier} value={supplier} />)}</datalist></Field></div>
          <div className={styles.attachment}><Button fullWidth onClick={() => fileRef.current?.click()}><Paperclip aria-hidden="true" />{invoice?.pieceJointe || file ? "Changer le justificatif" : "Joindre une photo ou un PDF"}</Button><input ref={fileRef} className={styles.fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.heic,.heif" onChange={event => { chooseFile(event.target.files?.[0]); event.target.value = ""; }} aria-label="Choisir une photo ou un PDF" />
            {(file || invoice?.pieceJointe) && <div className={styles.fileRow}><span className={styles.fileName}>{file ? file.name : invoice?.pieceJointe && <a href={invoice.pieceJointe.url} target="_blank" rel="noopener noreferrer">{invoice.pieceJointe.nom}<ExternalLink aria-label="Nouvel onglet" /></a>}</span>{file && <Button className={styles.close} variant="ghost" aria-label="Retirer le justificatif choisi" onClick={() => { current.current = { ...current.current, file: null }; setFile(null); markChanged(); }}><X aria-hidden="true" /></Button>}</div>}
            <p className={styles.note}>Facultatif · 10 Mo maximum{file && invoice?.pieceJointe ? ". L’ancien document est conservé jusqu’à confirmation du remplacement." : ""}</p>
          </div>
        </Card>
        <section style={{ marginTop: 24 }} aria-labelledby="purchase-allocation-heading"><div className={styles.sectionHeading}><h2 id="purchase-allocation-heading">Répartition</h2><span className={styles.muted}>{draft.allocations.length} affectation{draft.allocations.length > 1 ? "s" : ""}</span></div>
          {draft.allocations.map(part => <button key={part.id} type="button" className={styles.allocation} onClick={() => editAllocation(part)} aria-label={`Modifier l’affectation ${part.production || "À affecter"}, ${money(parseMoneyCents(part.montant) || 0)}`}><span className={styles.allocationCopy}><span className={styles.allocationTitle}>{part.production || "À affecter"}</span><span className={styles.allocationType}>{PURCHASE_TYPES.find(type => type.value === part.typeAchat)?.label || "Autre achat"}{part.description ? ` · ${part.description}` : ""}</span>{part.vehicleLabel && <span className={styles.machine}><Tractor aria-hidden="true" />{part.vehicleLabel}</span>}</span><span className={styles.allocationEnd}><strong>{money(parseMoneyCents(part.montant) || 0)}</strong><ChevronRight aria-hidden="true" /></span></button>)}
          <Button variant="ghost" fullWidth className={styles.add} onClick={() => editAllocation()}><Plus aria-hidden="true" />Ajouter une affectation</Button>
          <div className={styles.balance}><Notice tone={totalCents > 0 && remaining === 0 && unassignedCount === 0 ? "success" : "warning"}>{totalCents > 0 && remaining === 0 ? `${money(totalCents)} répartis · Total exact${unassignedCount ? ` · ${unassignedCount} affectation${unassignedCount > 1 ? "s" : ""} à compléter` : ""}` : remaining < 0 ? `${money(-remaining)} en trop dans la répartition` : totalCents > 0 ? `${money(remaining)} à répartir` : "Indiquez le montant total de la facture."}</Notice></div>
          <p className={styles.note}>Une facture, plusieurs usages, un seul total. « À affecter » permet de décider plus tard.</p>
        </section>
        <details className={styles.details} style={{ marginTop: 20 }}><summary><ChevronRight aria-hidden="true" />Référence et note</summary><div className={styles.detailsBody}><Field label="Référence de la facture" htmlFor="purchase-reference"><input id="purchase-reference" maxLength={240} autoComplete="off" placeholder="Ex. F2026-0123" value={draft.reference} onChange={event => change({ ...draft, reference: event.target.value })} /></Field><Field label="Note" htmlFor="purchase-note"><textarea id="purchase-note" maxLength={4000} rows={3} value={draft.remarque} onChange={event => change({ ...draft, remarque: event.target.value })} placeholder="Une précision à garder" /></Field></div></details>
      </fieldset>
    </div></div>
    <footer className={styles.footer}><div className={styles.footerInner}>{error && <div className={styles.footerError}><Notice tone="error">{error}</Notice></div>}{!error && dirty && !validation.valid && <p className={`${styles.note} ${styles.footerError}`} role="status">{validation.errors[0]}</p>}<Button fullWidth variant="primary" onClick={() => void save()} busy={busy} disabled={!ready || !!recovered || !validation.valid}><Check aria-hidden="true" />{busy ? "Enregistrement en cours…" : `Enregistrer${totalCents > 0 ? ` ${money(totalCents)}` : " la facture"}`}</Button><p className={styles.note}>{busy ? "Gardez cet écran ouvert jusqu’à la confirmation." : dirty && localStatus === "saved" ? "Brouillon conservé sur cet appareil · Aucun envoi automatique" : dirty && localStatus === "saving" ? "Conservation du brouillon…" : "Achat déjà payé · Une seule dépense dans les comptes"}</p></div></footer>
    {allocation && <Sheet title={draft.allocations.some(part => part.id === allocation.id) ? "Modifier l’affectation" : "Nouvelle affectation"} description="La production et le matériel se choisissent séparément." onClose={() => setAllocation(null)} footer={<div className={styles.stack}><Button variant="primary" fullWidth onClick={commitAllocation}>Valider l’affectation</Button>{draft.allocations.some(part => part.id === allocation.id) && <Button variant="danger" fullWidth onClick={() => { change({ ...draft, allocations: draft.allocations.filter(part => part.id !== allocation.id) }); setAllocation(null); }}><Trash2 aria-hidden="true" />Retirer cette affectation</Button>}</div>}><div className={styles.sheetFields}>
      <Field label="Intitulé de l’achat" htmlFor="allocation-description"><input id="allocation-description" maxLength={1000} value={allocation.description} onChange={event => setAllocation({ ...allocation, description: event.target.value })} placeholder="Ex. Boule de direction, aliment pour porcs" /></Field>
      <Field label="Montant (€)" htmlFor="allocation-amount"><input id="allocation-amount" inputMode="decimal" autoComplete="off" value={allocation.montant} onChange={event => setAllocation({ ...allocation, montant: event.target.value })} /></Field>
      <Field label="Production" htmlFor="allocation-production" hint={allocation.production === "Frais communs" ? "Cette dépense concerne l’ensemble de la ferme." : allocation.production === "À affecter" ? "Vous pourrez préciser la destination plus tard." : undefined}><select id="allocation-production" value={allocation.production} onChange={event => setAllocation({ ...allocation, production: event.target.value })}>{productionOptions.map(production => <option key={production} value={production}>{production}</option>)}</select></Field>
      <Field label={<>Matériel <span className={styles.optional}>· facultatif</span></>} htmlFor="allocation-vehicle"><select id="allocation-vehicle" value={allocation.vehicleId || ""} onChange={event => { const vehicle = vehicles.find(item => item.id === event.target.value); setAllocation({ ...allocation, vehicleId: vehicle?.id || "", vehicleLabel: vehicle ? vehicleName(vehicle) : "" }); }}><option value="">Aucun matériel</option>{sortedVehicles.map(vehicle => <option value={vehicle.id} key={vehicle.id}>{vehicleName(vehicle)}{vehicle.statut === "vendu" || vehicle.statut === "reforme" ? " · archivé" : ""}</option>)}{allocation.vehicleId && !vehicles.some(vehicle => vehicle.id === allocation.vehicleId) && <option value={allocation.vehicleId}>{allocation.vehicleLabel || "Matériel lié"} · indisponible</option>}</select></Field>
      <Field label="Type d’achat" htmlFor="allocation-type"><select id="allocation-type" value={allocation.typeAchat} onChange={event => setAllocation({ ...allocation, typeAchat: event.target.value as AllocationDraft["typeAchat"] })}>{PURCHASE_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></Field>
      <Field label={<>Quantité <span className={styles.optional}>· facultatif</span></>} htmlFor="allocation-quantity"><input id="allocation-quantity" inputMode="decimal" value={allocation.quantite} onChange={event => setAllocation({ ...allocation, quantite: event.target.value })} placeholder="Ex. 4" /></Field>
      {allocationError && <Notice tone="error">{allocationError}</Notice>}
    </div></Sheet>}
    {confirmClose && <Sheet title="Fermer la facture ?" onClose={() => setConfirmClose(false)} busy={busy} footer={<div className={styles.stack}><Button variant="primary" fullWidth busy={busy} onClick={() => void closeWithDraft(true)}>Garder le brouillon et fermer</Button><Button fullWidth disabled={busy} onClick={() => setConfirmClose(false)}>Continuer la saisie</Button><Button variant="danger" fullWidth disabled={busy} onClick={() => void closeWithDraft(false)}>Abandonner le brouillon</Button></div>}><p className={styles.note}>Le brouillon reste uniquement sur cet appareil. Il ne sera envoyé à la ferme qu’après un appui sur Enregistrer.</p></Sheet>}
  </div>, document.body);
}
