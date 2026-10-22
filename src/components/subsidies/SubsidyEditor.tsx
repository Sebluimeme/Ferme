"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronRight, ExternalLink, Paperclip, X } from "lucide-react";
import { Button, Card, Field, Notice, Sheet } from "@/components/ui/FarmUI";
import { normalizePayer, payerLabel, uniquePayers } from "@/lib/comptabilite-payers";
import { saveSubsidyPayment, validateSubsidyAttachment } from "@/services/subsidy-service";
import { makeEmptySubsidyDraft, subsidyToDraft, validateSubsidyDraft, SUBSIDY_SCHEMES, SUBSIDY_TRANCHES, type SubsidyDraft, type SubsidyPayment } from "@/types/subsidy";
import { isRestorableSubsidyDraft, readSubsidyDraft, writeSubsidyDraft, type SavedSubsidyDraft } from "./subsidy-drafts";
import styles from "./SubsidyEditor.module.css";

type Props = { payment?: SubsidyPayment; productions: string[]; userId: string; onClose: () => void; onSaved: (warning?: string) => void };

export default function SubsidyEditor({ payment, productions, userId, onClose, onSaved }: Props) {
  const id = useId();
  const [draft, setDraft] = useState<SubsidyDraft>(() => payment ? subsidyToDraft(payment) : makeEmptySubsidyDraft());
  const [file, setFile] = useState<File | null>(null);
  const [ready, setReady] = useState(false);
  const [recovered, setRecovered] = useState<SavedSubsidyDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState("");
  const [localStatus, setLocalStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const fileRef = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const dirtyRef = useRef(false);
  const completed = useRef(false);
  const revision = useRef(0);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const draftKey = `${userId}:${payment?.id || "new"}`;
  const current = useRef({ draft, file });
  current.current = { draft, file };
  const validation = useMemo(() => validateSubsidyDraft(draft), [draft]);
  const productionOptions = Array.from(new Set(["Ferme", ...productions, draft.production])).filter(Boolean);

  const queueWrite = (record: SavedSubsidyDraft | null) => {
    const next = writes.current.catch(() => {}).then(() => writeSubsidyDraft(draftKey, record));
    writes.current = next;
    return next;
  };
  const persist = async () => {
    const currentRevision = revision.current;
    setLocalStatus("saving");
    try {
      await queueWrite({ schema: 1, ...current.current, updatedAt: new Date().toISOString() });
      if (revision.current === currentRevision) setLocalStatus("saved");
      return true;
    } catch { setLocalStatus("error"); return false; }
  };
  const markChanged = () => { revision.current += 1; dirtyRef.current = true; setDirty(true); setLocalStatus("saving"); };
  const change = (key: keyof SubsidyDraft, value: string) => {
    const next = { ...current.current.draft, [key]: key === "payeur" ? normalizePayer(value) : value };
    current.current = { ...current.current, draft: next };
    setDraft(next); markChanged();
  };
  const requestClose = () => { if (lock.current) return; if (dirtyRef.current) setConfirmClose(true); else onClose(); };

  useEffect(() => {
    let cancelled = false;
    readSubsidyDraft(draftKey).then(record => { if (!cancelled && isRestorableSubsidyDraft(record)) setRecovered(record); })
      .catch(() => { if (!cancelled) setLocalStatus("error"); }).finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [draftKey]);
  useEffect(() => {
    const refresh = () => setOnline(navigator.onLine);
    refresh(); window.addEventListener("online", refresh); window.addEventListener("offline", refresh);
    return () => { window.removeEventListener("online", refresh); window.removeEventListener("offline", refresh); };
  }, []);
  useEffect(() => {
    if (!ready || recovered || !dirty || busy) return;
    setLocalStatus("saving");
    const timeout = setTimeout(() => { if (!lock.current) void persist(); }, 350);
    return () => clearTimeout(timeout);
    // Saving on the server suspends draft writes until its result is known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, file, ready, recovered, dirty, busy]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (busy || (dirty && localStatus !== "saved")) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [busy, dirty, localStatus]);
  useEffect(() => {
    const flush = () => {
      if (!dirtyRef.current || completed.current || lock.current) return;
      const record: SavedSubsidyDraft = { schema: 1, ...current.current, updatedAt: new Date().toISOString() };
      writes.current = writes.current.catch(() => {}).then(() => writeSubsidyDraft(draftKey, record));
      void writes.current.catch(() => {});
    };
    const onHidden = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onHidden); window.addEventListener("pagehide", flush);
    return () => { document.removeEventListener("visibilitychange", onHidden); window.removeEventListener("pagehide", flush); flush(); };
  }, [draftKey]);

  const chooseFile = (next: File | undefined) => {
    if (!next) return;
    const attachmentError = validateSubsidyAttachment(next);
    if (attachmentError) { setError(attachmentError); return; }
    current.current = { ...current.current, file: next }; setFile(next); markChanged(); setError("");
  };
  const save = async () => {
    if (lock.current || !ready || recovered) return;
    if (!validation.valid) { setError(validation.errors.join(" ")); return; }
    if (!navigator.onLine) { setError("Vous êtes hors ligne. Votre saisie est conservée ici ; reconnectez-vous pour enregistrer l’aide."); await persist(); return; }
    lock.current = true; setBusy(true); setError("");
    await persist();
    try {
      const result = await saveSubsidyPayment(draft, { pieceJointe: file || undefined, expectedVersion: draft.version || 0 });
      if (!result.success) { setError([result.error || "Enregistrement non confirmé. Votre saisie est conservée ; vous pouvez réessayer.", result.warning].filter(Boolean).join(" ")); return; }
      completed.current = true; dirtyRef.current = false; setDirty(false);
      let warning = result.warning;
      try { await queueWrite(null); } catch { warning = [warning, "L’aide est enregistrée, mais le brouillon local n’a pas pu être effacé."].filter(Boolean).join(" "); }
      onSaved(warning);
    } catch { setError("La connexion a été interrompue. Votre saisie et le document choisi sont conservés ; réessayez après le retour du réseau."); }
    finally { lock.current = false; setBusy(false); }
  };
  const closeDraft = async (keep: boolean) => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      if (keep) {
        if (!await persist()) { setError("Le brouillon n’a pas pu être conservé. Continuez la saisie ou abandonnez-le explicitement."); setConfirmClose(false); return; }
      } else await queueWrite(null);
      completed.current = true; dirtyRef.current = false; onClose();
    } catch { setError("Le brouillon n’a pas pu être effacé. Votre saisie est toujours ouverte."); setConfirmClose(false); }
    finally { lock.current = false; setBusy(false); }
  };

  return <>
    <Sheet title={payment ? "Modifier une aide reçue" : "Enregistrer une aide reçue"} description="Une saisie par type d’aide et par versement réellement reçu." onClose={requestClose} busy={busy}
      footer={<><div className={styles.footerError}>{error && <Notice tone="error">{error}</Notice>}</div><Button variant="primary" fullWidth busy={busy} disabled={!ready || !!recovered} onClick={() => void save()}>{busy ? "Enregistrement…" : "Enregistrer le versement"}</Button><p className={styles.note}>{busy ? "Gardez cet écran ouvert jusqu’à confirmation." : dirty && localStatus === "saved" ? "Brouillon conservé sur cet appareil, avec le document choisi." : dirty && localStatus === "saving" ? "Conservation du brouillon…" : "Les aides à venir ne sont pas ajoutées aux recettes."}</p></>}>
      {!ready && <p className={styles.note}>Recherche d’un brouillon sur cet appareil…</p>}
      {recovered && <Card className={styles.restore}><h3>Un brouillon vous attend</h3><p>Conservé le {new Date(recovered.updatedAt).toLocaleString("fr-FR")}{recovered.file ? ", avec son justificatif" : ""}.</p><div className={styles.stack}><Button variant="primary" fullWidth onClick={() => { current.current = { draft: recovered.draft, file: recovered.file }; setDraft(recovered.draft); setFile(recovered.file); markChanged(); setRecovered(null); }}>Reprendre le brouillon</Button><Button fullWidth onClick={async () => { try { await queueWrite(null); setRecovered(null); } catch { setError("Impossible d’effacer le brouillon. Réessayez ou reprenez-le."); } }}>Abandonner ce brouillon</Button></div></Card>}
      {(!online || localStatus === "error") && <div className={styles.alerts}>{!online && <Notice tone="warning">Pas de connexion. Vous pouvez préparer la saisie ; l’enregistrement dans les comptes nécessite du réseau.</Notice>}{localStatus === "error" && <Notice tone="warning">Le brouillon ne peut pas être conservé sur cet appareil. Gardez cet écran ouvert pour ne pas perdre votre saisie.</Notice>}</div>}
      <form className={styles.form} onSubmit={event => { event.preventDefault(); void save(); }}><fieldset className={styles.fieldset} disabled={busy || !ready || !!recovered}>
        <div className={styles.fields}>
          <Field label="Type d’aide" htmlFor={`${id}-scheme`}><select id={`${id}-scheme`} value={draft.dispositif} onChange={e => change("dispositif", e.target.value)}><option value="">Choisir l’aide</option>{SUBSIDY_SCHEMES.map(scheme => <option key={scheme.value} value={scheme.value}>{scheme.label}</option>)}</select></Field>
          <Field label="Campagne de l’aide" htmlFor={`${id}-campaign`} hint="L’année indiquée sur le relevé, même si le paiement arrive l’année suivante."><input id={`${id}-campaign`} type="text" inputMode="numeric" maxLength={4} value={draft.campagne} onChange={e => change("campagne", e.target.value)} /></Field>
          <Field label="Montant réellement reçu (€)" htmlFor={`${id}-amount`}><input id={`${id}-amount`} inputMode="decimal" autoComplete="off" placeholder="0,00" value={draft.montant} onChange={e => change("montant", e.target.value)} /></Field>
          <Field label="Date du versement" htmlFor={`${id}-date`}><input id={`${id}-date`} type="date" value={draft.date} onChange={e => change("date", e.target.value)} /></Field>
          <Field label="Encaissé sur" htmlFor={`${id}-payer`} hint={draft.payeur && draft.payeur !== "revolut" ? "Une recette encaissée personnellement réduit la somme que la ferme doit à cette personne." : "Le compte qui a réellement reçu le virement."}><select id={`${id}-payer`} value={draft.payeur} onChange={e => change("payeur", e.target.value)}><option value="">Choisir le compte d’encaissement</option>{uniquePayers(["revolut", "SY", "BY", draft.payeur]).map(value => <option key={value} value={value}>{payerLabel(value)}</option>)}</select></Field>
          <Field label="Versement" htmlFor={`${id}-tranche`} hint="Une avance PAC reste une recette d’aide. Elle n’est pas une avance personnelle de Benjamin ou Sébastien."><select id={`${id}-tranche`} value={draft.tranche} onChange={e => change("tranche", e.target.value)}><option value="">Choisir</option>{SUBSIDY_TRANCHES.map(tranche => <option key={tranche.value} value={tranche.value}>{tranche.label}</option>)}</select></Field>
          <Field label="Attribuer à" htmlFor={`${id}-production`} hint="Ferme pour une aide globale ; une production si le relevé la concerne précisément."><select id={`${id}-production`} value={draft.production} onChange={e => change("production", e.target.value)}>{productionOptions.map(production => <option key={production} value={production}>{production}</option>)}</select></Field>
        </div>
        <div className={styles.attachment}><Button fullWidth onClick={() => fileRef.current?.click()}><Paperclip aria-hidden="true" />{file || payment?.pieceJointe ? "Changer le justificatif" : "Joindre une photo ou un PDF"}</Button><input ref={fileRef} className={styles.fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.heic,.heif" aria-label="Choisir le justificatif de l’aide" onChange={event => { chooseFile(event.target.files?.[0]); event.target.value = ""; }} />
          {(file || payment?.pieceJointe) && <div className={styles.fileRow}><span className={styles.fileName}>{file ? file.name : payment?.pieceJointe && <a href={payment.pieceJointe.url} target="_blank" rel="noopener noreferrer">{payment.pieceJointe.nom}<ExternalLink aria-label="Nouvel onglet" /></a>}</span>{file && <Button className={styles.removeFile} variant="ghost" aria-label="Retirer le nouveau justificatif" onClick={() => { current.current = { ...current.current, file: null }; setFile(null); markChanged(); }}><X aria-hidden="true" /></Button>}</div>}
          <p className={styles.note}>Facultatif · 10 Mo maximum{file && payment?.pieceJointe ? ". L’ancien justificatif reste conservé tant que le remplacement n’est pas confirmé." : ""}</p>
        </div>
        <details className={styles.details}><summary><ChevronRight aria-hidden="true" />Référence et précisions</summary><div className={styles.detailsBody}><div className={styles.fields}>
          <Field label="Organisme payeur" htmlFor={`${id}-organism`}><input id={`${id}-organism`} maxLength={240} value={draft.organisme} onChange={e => change("organisme", e.target.value)} /></Field>
          <Field label="Référence du relevé ou du paiement" htmlFor={`${id}-reference`}><input id={`${id}-reference`} maxLength={240} value={draft.reference} onChange={e => change("reference", e.target.value)} /></Field>
          <Field label="Date du document · facultatif" htmlFor={`${id}-document-date`}><input id={`${id}-document-date`} type="date" value={draft.documentDate} onChange={e => change("documentDate", e.target.value)} /></Field>
          <Field label="Montant annuel de référence (€) · facultatif" htmlFor={`${id}-annual`} hint="À recopier uniquement s’il figure sur le relevé. Information indicative, jamais ajoutée aux recettes ni considérée comme un solde à recevoir."><input id={`${id}-annual`} inputMode="decimal" placeholder="Non renseigné" value={draft.montantReferenceAnnuel} onChange={e => change("montantReferenceAnnuel", e.target.value)} /></Field>
          <Field label="Note · facultatif" htmlFor={`${id}-note`}><textarea id={`${id}-note`} rows={3} maxLength={4000} value={draft.remarque} onChange={e => change("remarque", e.target.value)} /></Field>
        </div></div></details>
        <details className={styles.details}><summary><ChevronRight aria-hidden="true" />Engagement sur plusieurs années</summary><div className={styles.detailsBody}><p className={styles.note}>Pour la conversion bio ou une autre aide pluriannuelle, renseignez les dates de l’engagement lorsqu’elles sont connues. Chaque versement reçu sera enregistré séparément.</p><div className={`${styles.grid} ${styles.section}`}><Field label="Début · facultatif" htmlFor={`${id}-start`}><input id={`${id}-start`} type="date" value={draft.engagementDebut} onChange={e => change("engagementDebut", e.target.value)} /></Field><Field label="Fin · facultatif" htmlFor={`${id}-end`}><input id={`${id}-end`} type="date" value={draft.engagementFin} onChange={e => change("engagementFin", e.target.value)} /></Field></div></div></details>
      </fieldset></form>
    </Sheet>
    {confirmClose && <Sheet title="Fermer la saisie de l’aide ?" onClose={() => setConfirmClose(false)} busy={busy} footer={<div className={styles.stack}><Button variant="primary" fullWidth busy={busy} onClick={() => void closeDraft(true)}>Garder le brouillon et fermer</Button><Button fullWidth disabled={busy} onClick={() => setConfirmClose(false)}>Continuer la saisie</Button><Button variant="danger" fullWidth disabled={busy} onClick={() => void closeDraft(false)}>Abandonner le brouillon</Button></div>}><p className={styles.note}>La saisie et le document choisi restent uniquement sur cet appareil. Rien ne sera ajouté aux comptes sans appuyer sur Enregistrer.</p></Sheet>}
  </>;
}
