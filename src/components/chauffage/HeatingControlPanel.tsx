"use client";

import { useId, useState } from "react";
import { Clock3, Eye, Minus, Plus, SlidersHorizontal, Thermometer } from "lucide-react";
import { Button, Card, Field, Notice, Sheet, farmStyles } from "@/components/ui/FarmUI";
import { heatingControlReason, type HeatingControlSettings, type HeatingControlStatus } from "@/lib/heating-control";
import styles from "./HeatingControlPanel.module.css";

export interface HeatingControlPanelProps {
  status: HeatingControlStatus | null;
  loading: boolean;
  offline: boolean;
  busy: boolean;
  error: string | null;
  result: string | null;
  onSave: (settings: HeatingControlSettings, expectedRevision: number) => Promise<void>;
}

const temperatureFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const observationLabel = "Observation — aucun mouvement du servomoteur";

function temperature(value: number | null) {
  return value === null || !Number.isFinite(value) ? "—" : `${temperatureFormat.format(value)} °C`;
}

function displayDate(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return { iso: new Date(value).toISOString(), text: dateFormat.format(new Date(value)) };
}

function Availability({ status, loading, offline }: Pick<HeatingControlPanelProps, "status" | "loading" | "offline">) {
  if (offline) return <Notice tone="warning">Hors connexion. Rétablis la connexion pour enregistrer de nouveaux réglages.</Notice>;
  if (loading && !status) return <p className={styles.muted} role="status">Chargement des réglages…</p>;
  if (!status?.available) return <Notice tone="warning">Les réglages du chauffage ne sont pas encore disponibles. L’enregistrement est momentanément indisponible.</Notice>;
  if (!status.fresh) return <Notice tone="warning">La synchronisation des réglages est en retard. Leur enregistrement reprendra après un relevé récent.</Notice>;
  return null;
}

function Calculation({ status, offline }: { status: HeatingControlStatus; offline: boolean }) {
  const suspended = offline || !status.available || !status.fresh || status.phase === "suspended";
  const checked = displayDate(status.updatedAt);
  const next = displayDate(status.nextAdjustmentAt);
  return <div className={styles.calculation}>
    {status.mode === "automatic" && <div className={styles.proposal}>
      <span>{suspended ? "Calcul suspendu" : "Proposition fioul"}</span>
      {!suspended && status.recommendedTemperature !== null && <strong>{temperature(status.recommendedTemperature)}</strong>}
      <p>{offline || !status.fresh ? "La proposition reprendra lorsque les relevés nécessaires seront récents et disponibles." : heatingControlReason(status.reason)}</p>
    </div>}
    <div className={`${styles.readings} ${suspended ? styles.oldReadings : ""}`}>
      <div><span>Ballon D · sonde Ferme</span><strong>{temperature(status.temperatureD)}</strong></div>
      <div><span>Ballon B</span><strong>{temperature(status.temperatureB)}</strong></div>
    </div>
    {checked && <p className={styles.date}><Clock3 aria-hidden="true" /><span>État reçu le <time dateTime={checked.iso}>{checked.text}</time></span></p>}
    {status.mode === "automatic" && !suspended && next && <p className={styles.muted}>Prochaine réévaluation possible : <time dateTime={next.iso}>{next.text}</time>.</p>}
  </div>;
}

function TemperatureInput({ id, value, onChange, min, max, disabled, label, hint }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  disabled: boolean;
  label: string;
  hint: string;
}) {
  const number = value.trim() === "" ? Number.NaN : Number(value);
  const valid = Number.isInteger(number) && number >= min && number <= max;
  const step = (amount: number) => onChange(String(Math.min(max, Math.max(min, (Number.isFinite(number) ? Math.round(number) : min) + amount))));
  return <Field label={label} htmlFor={id} error={!valid ? `Choisis un nombre entier entre ${min} et ${max} °C.` : undefined}>
    <div className={styles.stepper}>
      <Button aria-label={`Diminuer ${label.toLocaleLowerCase("fr-FR")} de 1 degré`} onClick={() => step(-1)} disabled={disabled || (valid && number <= min)}><Minus aria-hidden="true" /></Button>
      <div className={styles.temperatureInput}><input id={id} type="number" inputMode="numeric" min={min} max={max} step="1" value={value} onChange={event => onChange(event.target.value)} disabled={disabled} aria-invalid={!valid || undefined} aria-describedby={`${id}-hint`} /><span aria-hidden="true">°C</span></div>
      <Button aria-label={`Augmenter ${label.toLocaleLowerCase("fr-FR")} de 1 degré`} onClick={() => step(1)} disabled={disabled || (valid && number >= max)}><Plus aria-hidden="true" /></Button>
    </div>
    <p id={`${id}-hint`} className={styles.inputHint}>{hint}</p>
  </Field>;
}

function ControlSheet({ status, loading, offline, busy, error, result, onSave, onClose }: HeatingControlPanelProps & { onClose: () => void }) {
  const id = useId();
  // A draft belongs to the status seen on opening. Live updates must not replace it.
  const [revision] = useState(status?.available ? status.revision : null);
  const [mode, setMode] = useState<HeatingControlSettings["mode"]>(status?.available ? status.mode : "manual");
  const [manual, setManual] = useState(String(status?.available ? status.manualTemperature : 60));
  const [minimumD, setMinimumD] = useState(String(status?.available ? status.minimumD : 58));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const waiting = busy || saving;
  const changedElsewhere = revision !== null && status !== null && status.revision !== revision && !saved && !waiting;
  const manualValue = manual.trim() === "" ? Number.NaN : Number(manual);
  const minimumValue = minimumD.trim() === "" ? Number.NaN : Number(minimumD);
  const validMinimum = Number.isInteger(minimumValue) && minimumValue >= 40 && minimumValue <= 75;
  const valid = Number.isInteger(manualValue) && manualValue >= 50 && manualValue <= 90 && validMinimum;
  const canSave = !!status?.available && status.fresh && !offline && !loading && !waiting && !saved && !changedElsewhere && revision !== null && valid;

  async function save() {
    if (!canSave || revision === null) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave({ mode, manualTemperature: manualValue, minimumD: minimumValue }, revision);
      setSaved(true);
    } catch (failure) {
      setSaveError(failure instanceof Error ? failure.message : "L’enregistrement n’a pas été confirmé. Les réglages affichés dans l’application restent inchangés.");
    } finally {
      setSaving(false);
    }
  }

  return <Sheet title="Réglage du chauffage" description="Chaudière fioul · bâtiment B" onClose={onClose} busy={waiting} footer={<div className={styles.footer}>
    <Button variant="primary" fullWidth disabled={!canSave} busy={waiting} onClick={() => { void save(); }}>{waiting ? "Enregistrement…" : saved ? "Réglages enregistrés" : "Enregistrer les réglages"}</Button>
    <p>{saved ? "Ferme ce panneau pour consulter le nouvel état ou modifier à nouveau les réglages." : "Ces réglages servent à l’observation. Aucune commande physique n’est envoyée."}</p>
  </div>}>
    <div className={styles.sheetContent}>
      <Notice tone="warning"><strong>{observationLabel}</strong><p className={styles.noticeText}>La commande restera désactivée jusqu’à la validation du réglage du potentiomètre et de la liaison au bâtiment B.</p></Notice>
      <Availability status={status} loading={loading} offline={offline} />
      {revision === null && <p className={styles.muted}>Valeurs proposées par défaut : fioul 60 °C et limite du ballon D 58 °C. Elles ne sont pas enregistrées. Rouvre ce panneau lorsque les réglages seront disponibles.</p>}
      {changedElsewhere && <Notice tone="warning">Les réglages ont changé depuis l’ouverture du panneau. Ta saisie est conservée ici. Ferme puis rouvre le panneau pour repartir des derniers réglages.</Notice>}
      <div><p id={`${id}-mode`} className={styles.fieldLabel}>Mode de régulation</p><div role="group" aria-labelledby={`${id}-mode`} className={styles.modeChoice}>
        <button type="button" aria-pressed={mode === "manual"} className={mode === "manual" ? styles.selectedMode : ""} disabled={waiting || saved} onClick={() => setMode("manual")}>Manuel</button>
        <button type="button" aria-pressed={mode === "automatic"} className={mode === "automatic" ? styles.selectedMode : ""} disabled={waiting || saved} onClick={() => setMode("automatic")}>Automatique</button>
      </div></div>
      {mode === "manual" ? <TemperatureInput id={`${id}-manual`} value={manual} onChange={setManual} min={50} max={90} disabled={waiting || saved} label="Température souhaitée de la chaudière fioul" hint="Consigne théorique du potentiomètre, de 50 à 90 °C. Le réglage est mémorisé pour observation." /> : <>
        <TemperatureInput id={`${id}-minimum`} value={minimumD} onChange={setMinimumD} min={40} max={75} disabled={waiting || saved} label="Limite basse de la sonde du ballon D" hint="De 40 à 75 °C, sur la sonde affichée dans Ferme. À adapter à la différence avec la sonde de la chaudière." />
        <div className={styles.automaticExplanation}><Thermometer aria-hidden="true" /><div>
          <strong>Deux repères pour le ballon D</strong>
          <dl className={styles.thresholds}>
            <div><dt>Limite basse</dt><dd>{validMinimum ? temperature(minimumValue) : "—"}</dd></div>
            <div><dt>Retour au minimum fioul</dt><dd>{validMinimum ? temperature(minimumValue + 2) : "—"}</dd></div>
          </dl>
          <p>Dès que D atteint {validMinimum ? temperature(minimumValue + 2) : "la limite basse + 2 °C"}, ou qu’une remontée nette annonce ce seuil, la proposition fioul revient directement à <b>50 °C</b>.</p>
          <p>Elle reste à 50 °C tant que la tendance ne prévoit pas un passage sous {validMinimum ? temperature(minimumValue) : "ta limite basse"} dans les 10 prochaines minutes. Si nécessaire, le calcul propose une hausse progressive, jusqu’à 85 °C maximum.</p>
          <p>Entre les deux repères, le besoin d’appoint reste mémorisé jusqu’au retour au seuil haut pour éviter les allers-retours.</p>
          <p>Le seuil physique de 55 °C de la chaudière reste inchangé. Il est mesuré par une autre sonde.</p>
        </div></div>
      </>}
      {status?.available && <section aria-label="État actuel de l’observation"><h3 className={styles.sectionTitle}>État actuel de l’observation</h3><Calculation status={status} offline={offline} /></section>}
      {(saveError || error) && <Notice tone="error">{saveError || error}</Notice>}
      {saved && <Notice tone="success">{result || "Réglages enregistrés et confirmés. Aucun mouvement du servomoteur n’a été commandé par Ferme."}</Notice>}
    </div>
  </Sheet>;
}

export default function HeatingControlPanel(props: HeatingControlPanelProps) {
  const { status, loading, offline, busy, error, result } = props;
  const [open, setOpen] = useState(false);
  const known = status?.available;
  return <>
    <Card className={`${farmStyles.theme} ${styles.card}`} role="region" aria-label="Réglage de la chaudière fioul">
      <header className={styles.header}><div><p className={styles.eyebrow}>Chaudière fioul</p><h2>Réglage du chauffage</h2></div><SlidersHorizontal aria-hidden="true" /></header>
      <p className={styles.observation}><Eye aria-hidden="true" /><span>{observationLabel}</span></p>
      {known && <div className={styles.summary}><div><span>{status.mode === "manual" ? "Manuel · consigne mémorisée" : "Automatique · limite du ballon D"}</span><strong>{temperature(status.mode === "manual" ? status.manualTemperature : status.minimumD)}</strong></div>{status.mode === "automatic" && <p>Minimum fioul : 50 °C. Retour direct à ce minimum dès que la sonde D atteint {temperature(status.minimumD + 2)}.</p>}</div>}
      <Availability status={status} loading={loading} offline={offline} />
      {status?.available && status.mode === "automatic" && <p className={styles.muted}>{offline || !status.fresh || status.phase === "suspended" ? <>Calcul suspendu. {status.fresh && !offline ? heatingControlReason(status.reason).replace(/^Calcul suspendu : /, "") : "En attente de relevés récents."}</> : <>{status.recommendedTemperature !== null && <strong>Proposition fioul : {temperature(status.recommendedTemperature)}. </strong>}{heatingControlReason(status.reason)}</>}</p>}
      {error && <Notice tone="error">{error}</Notice>}
      {result && <Notice tone="success">{result}</Notice>}
      <Button fullWidth disabled={busy} onClick={() => setOpen(true)}><SlidersHorizontal aria-hidden="true" />Régler le chauffage</Button>
    </Card>
    {open && <ControlSheet {...props} onClose={() => setOpen(false)} />}
  </>;
}
