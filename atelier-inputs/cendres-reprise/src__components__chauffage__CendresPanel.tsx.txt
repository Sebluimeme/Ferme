"use client";

import { useId, useState } from "react";
import { BellRing, Flame, Trash2 } from "lucide-react";
import { Button, Field, Notice, Sheet, farmStyles } from "@/components/ui/FarmUI";
import { CENDRES_STATUS_LABEL, isReminderActive, type CendresReminder, type CendresState } from "@/lib/cendres";
import styles from "./CendresPanel.module.css";

export interface CendresPanelProps {
  state: CendresState;
  loading: boolean;
  loadError: string | null;
  offline: boolean;
  busy: boolean;
  /** Vrai uniquement si l'envoi d'e-mail a été validé et activé côté serveur. Faux par défaut. */
  emailEnabled: boolean;
  onClean: (at?: string) => Promise<string | null | void>;
  onRemove: (id: string) => Promise<void>;
  onSaveReminder: (input: { dueAt?: string; delayMinutes?: number }) => Promise<void>;
  onCancelReminder: () => Promise<void>;
}

const dateFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const shortDate = (iso: string) => dateFormat.format(new Date(iso));
const UNITS = [{ label: "heures", minutes: 60 }, { label: "jours", minutes: 1440 }, { label: "semaines", minutes: 10080 }] as const;

function messageOf(failure: unknown) { return failure instanceof Error ? failure.message : "L'action n'a pas abouti."; }

function ReminderSheet({ busy, offline, initial, onSave, onClose }: { busy: boolean; offline: boolean; initial: CendresReminder | null; onSave: CendresPanelProps["onSaveReminder"]; onClose: () => void }) {
  const id = useId();
  const [mode, setMode] = useState<"delay" | "date">("delay");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<number>(1440);
  const [when, setWhen] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const count = amount.trim() === "" ? Number.NaN : Number(amount);
  const valid = mode === "delay" ? Number.isFinite(count) && count > 0 : when !== "" && Number.isFinite(new Date(when).getTime());
  async function save() {
    setSaving(true); setError(null);
    try {
      await onSave(mode === "delay" ? { delayMinutes: Math.round(count * unit) } : { dueAt: new Date(when).toISOString() });
      onClose();
    } catch (failure) { setError(messageOf(failure)); } finally { setSaving(false); }
  }
  return <Sheet title={initial && isReminderActive(initial) ? "Modifier le rappel" : "Programmer un rappel"} description="Pour le prochain nettoyage de la chaudière" onClose={onClose} busy={saving}
    footer={<Button variant="primary" fullWidth disabled={!valid || offline || busy} busy={saving} onClick={() => { void save(); }}>{saving ? "Enregistrement…" : "Enregistrer le rappel"}</Button>}>
    <div className={styles.sheetContent}>
      {offline && <Notice tone="warning">Hors connexion : le rappel ne peut pas être enregistré maintenant.</Notice>}
      <div role="group" aria-label="Type de rappel" className={styles.choice}>
        <button type="button" aria-pressed={mode === "delay"} className={mode === "delay" ? styles.selected : ""} onClick={() => setMode("delay")}>Dans un délai</button>
        <button type="button" aria-pressed={mode === "date"} className={mode === "date" ? styles.selected : ""} onClick={() => setMode("date")}>À une date</button>
      </div>
      {mode === "delay" ? <Field label="Dans combien de temps ?" htmlFor={`${id}-amount`} hint="Après chaque « Cendres vidées », le rappel est reporté avec ce même délai. Tu peux le modifier ou l'annuler.">
        <div className={styles.delayRow}>
          <input id={`${id}-amount`} type="number" inputMode="numeric" min="1" step="1" placeholder="ex. 7" value={amount} onChange={e => setAmount(e.target.value)} />
          <select aria-label="Unité de temps" value={unit} onChange={e => setUnit(Number(e.target.value))}>{UNITS.map(u => <option key={u.minutes} value={u.minutes}>{u.label}</option>)}</select>
        </div>
      </Field> : <Field label="Date et heure" htmlFor={`${id}-when`} hint="Heure de l'appareil. Date fixe : pas de report automatique."><input id={`${id}-when`} type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} /></Field>}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  </Sheet>;
}

export default function CendresPanel({ state, loading, loadError, offline, busy, emailEnabled, onClean, onRemove, onSaveReminder, onCancelReminder }: CendresPanelProps) {
  const [sheet, setSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [pastDate, setPastDate] = useState("");
  const [all, setAll] = useState(false);
  const last = state.cleanings[0];
  const reminder = state.reminder && state.reminder.status !== "cancelled" ? state.reminder : null;
  const active = isReminderActive(reminder);
  const sending = reminder?.status === "sending";
  const shown = all ? state.cleanings : state.cleanings.slice(0, 5);

  async function act(action: () => Promise<string | null | void>, message: string) {
    setError(null); setDone(null);
    try { const note = await action(); setDone(typeof note === "string" && note ? `${message} ${note}` : message); } catch (failure) { setError(messageOf(failure)); }
  }
  const problem = reminder && ["failed", "unconfirmed", "failed_retry"].includes(reminder.status);

  return <>
    <section className={`${farmStyles.theme} ${styles.card}`} aria-label="Nettoyage de la chaudière">
      <header className={styles.header}><h3>Nettoyage de la chaudière</h3></header>
      <Button variant="primary" fullWidth disabled={offline || busy || loading} busy={busy} onClick={() => { void act(() => onClean(), "Nettoyage enregistré à l'instant."); }}><Flame aria-hidden="true" />Cendres vidées</Button>
      {loading ? <p className={styles.muted} role="status">Chargement…</p> : <p className={styles.muted} role="status">{last ? <>Dernier nettoyage : <time dateTime={last.at}>{shortDate(last.at)}</time></> : "Aucun nettoyage enregistré."}</p>}
      {offline && <Notice tone="warning">Hors connexion : rien ne peut être enregistré pour l'instant.</Notice>}
      {loadError && <Notice tone="error">{loadError}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {done && <p className={styles.state} role="status">{done}</p>}

      <details className={styles.details} open={dateOpen} onToggle={e => setDateOpen(e.currentTarget.open)}>
        <summary>Enregistrer à une autre date</summary>
        <Field label="Date et heure du nettoyage" htmlFor="cendres-past" hint="Pour noter un nettoyage déjà fait. Pas de date future.">
          <input id="cendres-past" type="datetime-local" value={pastDate} onChange={e => setPastDate(e.target.value)} />
        </Field>
        <Button fullWidth disabled={!pastDate || offline || busy} onClick={() => { void act(async () => { await onClean(new Date(pastDate).toISOString()); setPastDate(""); }, "Nettoyage enregistré."); }}>Enregistrer à cette date</Button>
      </details>

      <div className={styles.block}>
        <span className={styles.label}>Prochain rappel</span>
        {reminder ? <>
          <strong className={styles.big}><time dateTime={reminder.dueAt}>{shortDate(reminder.dueAt)}</time></strong>
          <p className={`${styles.state} ${problem ? styles.stateError : ""}`}>{CENDRES_STATUS_LABEL[reminder.status]}{reminder.lastError ? ` — ${reminder.lastError}` : ""}</p>
        </> : <p className={styles.muted}>Aucun rappel programmé.</p>}
        <p className={styles.state}>{emailEnabled ? "Un e-mail sera envoyé à l'échéance." : "E-mail à l'échéance désactivé pour l'instant : le rappel s'affiche seulement ici."}</p>
        <div className={active ? styles.actions : ""}>
          <Button variant={active ? "secondary" : "primary"} fullWidth disabled={offline || busy || sending} onClick={() => setSheet(true)}><BellRing aria-hidden="true" />{active ? "Modifier" : "Programmer un rappel"}</Button>
          {active && <Button variant="danger" fullWidth disabled={offline || busy} onClick={() => { void act(onCancelReminder, "Rappel annulé."); }}>Annuler le rappel</Button>}
        </div>
      </div>

      {state.cleanings.length > 0 && <div className={styles.block}>
        <span className={styles.label}>Historique</span>
        <ul className={styles.history}>{shown.map(c => <li key={c.id}><time dateTime={c.at}>{shortDate(c.at)}</time>
          <Button variant="ghost" aria-label={`Retirer le nettoyage du ${shortDate(c.at)}`} disabled={offline || busy} onClick={() => { if (window.confirm("Retirer ce nettoyage de l'historique ?")) void act(() => onRemove(c.id), "Nettoyage retiré."); }}><Trash2 aria-hidden="true" /></Button></li>)}</ul>
        {state.cleanings.length > 5 && <Button variant="ghost" onClick={() => setAll(v => !v)}>{all ? "Voir moins" : `Voir les ${state.cleanings.length} nettoyages`}</Button>}
      </div>}
    </section>
    {sheet && <ReminderSheet busy={busy} offline={offline} initial={state.reminder} onSave={onSaveReminder} onClose={() => setSheet(false)} />}
  </>;
}
