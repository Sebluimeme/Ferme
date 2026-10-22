"use client";

import { useId, useState } from "react";
import { Clock3, Minus, Plus, SlidersHorizontal, Thermometer, Wifi, WifiOff } from "lucide-react";
import { Button, Card, Field, Notice, Sheet, farmStyles } from "@/components/ui/FarmUI";
import { HEATING_DEFAULT_MINIMUM_D, HEATING_FUEL_MINIMUM, HEATING_FUEL_MAXIMUM, HEATING_RELEASE_D, heatingControlReason, heatingSettingsFromDraft, type HeatingControlSettings, type HeatingControlStatus } from "@/lib/heating-control";
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

function Delivery({ status, offline, detailed = false }: { status: HeatingControlStatus; offline: boolean; detailed?: boolean }) {
  const stale = offline || !status.fresh;
  const transmitted = displayDate(status.lastTransmittedAt);
  const lastSeen = displayDate(status.moduleLastSeenAt);
  const labels = {
    disabled: "Pilotage désactivé",
    waiting_module: "En attente du module B",
    waiting_sensor: "En attente de mesures récentes",
    pending: "Transmission en attente",
    transmitted: "Dernier envoi via API enregistré",
    uncertain: "Transmission non confirmée",
    blocked: "Transmission suspendue",
  };
  const label = stale ? "État de transmission ancien" : !status.actuationEnabled ? labels.disabled : labels[status.deliveryState];
  const attention = stale || !status.actuationEnabled || !status.moduleOnline || status.deliveryState !== "transmitted";
  return <div className={styles.delivery}>
    <div className={styles.deliveryTarget}><span>Consigne fioul demandée</span><strong>{temperature(status.desiredTemperature)}</strong></div>
    <p className={`${styles.deliveryState} ${attention ? styles.deliveryWarning : ""}`}><Clock3 aria-hidden="true" /><span>{label}</span></p>
    {!stale && status.actuationEnabled && !status.moduleOnline && <p className={styles.muted}>Module B hors ligne. La dernière demande est conservée dans Home Assistant.</p>}
    {stale && <p className={styles.muted}>La transmission actuelle ne peut pas être vérifiée. Les derniers états connus restent affichés.</p>}
    <div className={styles.lastTransmission}><span>Consigne transmise via API</span><strong>{transmitted ? temperature(status.lastTransmittedTemperature) : "—"}</strong>{transmitted ? <time dateTime={transmitted.iso}>{transmitted.text}</time> : <span className={styles.noTransmission}>Aucun envoi enregistré</span>}</div>
    <p className={styles.feedback}>Position mécanique non mesurée. Un envoi via API ne confirme pas le mouvement du servomoteur.</p>
    {detailed && <>
      <p className={`${styles.moduleState} ${stale || !status.moduleOnline ? styles.deliveryWarning : ""}`}>{status.moduleOnline && !stale ? <Wifi aria-hidden="true" /> : <WifiOff aria-hidden="true" />}<span>{stale ? "Liaison du module à vérifier" : status.moduleOnline ? "Module B connecté" : "Module B hors ligne"}{lastSeen && <> · dernier contact le <time dateTime={lastSeen.iso}>{lastSeen.text}</time></>}</span></p>
      <p className={styles.muted}>Lors d’une coupure, seule la dernière demande est conservée. En automatique, elle est recalculée avec des mesures récentes avant transmission.</p>
    </>}
  </div>;
}

function Calculation({ status, offline }: { status: HeatingControlStatus; offline: boolean }) {
  const suspended = offline || !status.available || !status.fresh || status.phase === "suspended";
  const checked = displayDate(status.updatedAt);
  const next = displayDate(status.nextAdjustmentAt);
  return <div className={styles.calculation}>
    {status.mode === "automatic" && <div className={styles.proposal}>
      <span>{suspended ? "Calcul suspendu" : "Régulation du ballon D"}</span>
      <p>{offline || !status.fresh ? "L’état du calcul sera actualisé au retour de la connexion." : heatingControlReason(status.reason)}</p>
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
  const [confirmedSettings] = useState<HeatingControlSettings>(() => ({ mode: status?.available ? status.mode : "manual", manualTemperature: status?.available ? status.manualTemperature : 60, minimumD: status?.available ? status.minimumD : HEATING_DEFAULT_MINIMUM_D }));
  const [mode, setMode] = useState<HeatingControlSettings["mode"]>(status?.available ? status.mode : "manual");
  const [manual, setManual] = useState(String(status?.available ? status.manualTemperature : 60));
  const [minimumD, setMinimumD] = useState(String(status?.available ? status.minimumD : HEATING_DEFAULT_MINIMUM_D));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const waiting = busy || saving;
  const changedElsewhere = revision !== null && status !== null && status.revision !== revision && !saved && !waiting;
  const manualValue = manual.trim() === "" ? Number.NaN : Number(manual);
  const minimumValue = minimumD.trim() === "" ? Number.NaN : Number(minimumD);
  const validMinimum = Number.isInteger(minimumValue) && minimumValue >= 55 && minimumValue <= 59;
  const settingsToSave = heatingSettingsFromDraft(mode, manualValue, minimumValue, confirmedSettings);
  const canSave = !!status?.available && status.fresh && !offline && !loading && !waiting && !saved && !changedElsewhere && revision !== null && settingsToSave !== null;

  async function save() {
    if (!canSave || revision === null || settingsToSave === null) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(settingsToSave, revision);
      setSaved(true);
    } catch (failure) {
      setSaveError(failure instanceof Error ? failure.message : "L’enregistrement n’a pas été confirmé. Les réglages affichés dans l’application restent inchangés.");
    } finally {
      setSaving(false);
    }
  }

  return <Sheet title="Réglage du chauffage" description="Chaudière fioul · bâtiment B" onClose={onClose} busy={waiting} footer={<div className={styles.footer}>
    <Button variant="primary" fullWidth disabled={!canSave} busy={waiting} onClick={() => { void save(); }}>{waiting ? "Enregistrement…" : saved ? "Réglages enregistrés" : "Enregistrer les réglages"}</Button>
    <p>{saved ? "Le mode est enregistré. La transmission de la consigne est suivie séparément ci-dessus." : "Home Assistant mémorise le mode et gère ensuite la transmission de la consigne."}</p>
  </div>}>
    <div className={styles.sheetContent}>
      <Availability status={status} loading={loading} offline={offline} />
      {status?.available && !status.actuationEnabled && <Notice tone="warning">Le pilotage est désactivé dans Home Assistant. Les réglages peuvent être mémorisés, mais aucune nouvelle consigne n’est transmise tant qu’il reste désactivé.</Notice>}
      {revision === null && <p className={styles.muted}>Valeurs proposées par défaut : fioul 60 °C et limite du ballon D 57 °C. Elles ne sont pas enregistrées. Rouvre ce panneau lorsque les réglages seront disponibles.</p>}
      {changedElsewhere && <Notice tone="warning">Les réglages ont changé depuis l’ouverture du panneau. Ta saisie est conservée ici. Ferme puis rouvre le panneau pour repartir des derniers réglages.</Notice>}
      <div><p id={`${id}-mode`} className={styles.fieldLabel}>Mode de régulation</p><div role="group" aria-labelledby={`${id}-mode`} className={styles.modeChoice}>
        <button type="button" aria-pressed={mode === "manual"} className={mode === "manual" ? styles.selectedMode : ""} disabled={waiting || saved} onClick={() => setMode("manual")}>Manuel</button>
        <button type="button" aria-pressed={mode === "automatic"} className={mode === "automatic" ? styles.selectedMode : ""} disabled={waiting || saved} onClick={() => setMode("automatic")}>Automatique</button>
      </div></div>
      {mode === "manual" ? <TemperatureInput id={`${id}-manual`} value={manual} onChange={setManual} min={HEATING_FUEL_MINIMUM} max={HEATING_FUEL_MAXIMUM} disabled={waiting || saved} label="Consigne de la chaudière fioul" hint="De 50 à 70 °C. Home Assistant conserve cette consigne si le module B est temporairement hors ligne." /> : <>
        <TemperatureInput id={`${id}-minimum`} value={minimumD} onChange={setMinimumD} min={55} max={59} disabled={waiting || saved} label="Limite basse de la sonde du ballon D" hint="De 55 à 59 °C, sur la sonde affichée dans Ferme. À adapter à la différence avec la sonde de la chaudière." />
        <div className={styles.automaticExplanation}><Thermometer aria-hidden="true" /><div>
          <strong>Deux repères pour le ballon D</strong>
          <dl className={styles.thresholds}>
            <div><dt>Limite basse</dt><dd>{validMinimum ? temperature(minimumValue) : "—"}</dd></div>
            <div><dt>Retour au minimum fioul</dt><dd>{temperature(HEATING_RELEASE_D)}</dd></div>
          </dl>
          <p>L’appoint vise environ {validMinimum ? temperature((minimumValue + HEATING_RELEASE_D) / 2) : "le milieu de ces deux repères"}. La tendance récente aide à anticiper la baisse. Au démarrage, le fioul passe à une première consigne utile, puis les hausses se font par étapes, avec un maximum de <b>70 °C</b>.</p>
          <p>Quand D remonte vers 60 °C, la consigne fioul baisse par étapes. Dès que D atteint <b>60 °C</b>, elle revient à <b>50 °C</b>.</p>
          <p>Le délai entre les corrections évite les mouvements répétés à chaque variation de température.</p>
          <p>Le seuil physique de 55 °C de la chaudière reste inchangé. Il est mesuré par une autre sonde.</p>
        </div></div>
      </>}
      {status?.available && <section aria-label="État actuel du pilotage"><h3 className={styles.sectionTitle}>État actuel du pilotage</h3><Delivery status={status} offline={offline} detailed /><Calculation status={status} offline={offline} /></section>}
      {(saveError || error) && <Notice tone="error">{saveError || error}</Notice>}
      {saved && <Notice tone="success">{result || "Mode et réglages enregistrés. L’état de transmission de la consigne apparaît séparément."}</Notice>}
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
      {known && <div className={styles.summary}><p className={styles.registeredMode}>Mode {status.mode === "manual" ? "Manuel" : "Automatique"} enregistré</p><div><span>{status.mode === "manual" ? "Consigne manuelle" : "Limite basse du ballon D"}</span><strong>{temperature(status.mode === "manual" ? status.manualTemperature : status.minimumD)}</strong></div>{status.mode === "automatic" && <p>Fioul de 50 à 70 °C. Réduction progressive à l’approche de 60 °C dans D, puis retour à 50 °C.</p>}</div>}
      <Availability status={status} loading={loading} offline={offline} />
      {known && <Delivery status={status} offline={offline} />}
      {error && <Notice tone="error">{error}</Notice>}
      {result && <Notice tone="success">{result}</Notice>}
      <Button fullWidth disabled={busy} onClick={() => setOpen(true)}><SlidersHorizontal aria-hidden="true" />Régler le chauffage</Button>
    </Card>
    {open && <ControlSheet {...props} onClose={() => setOpen(false)} />}
  </>;
}
