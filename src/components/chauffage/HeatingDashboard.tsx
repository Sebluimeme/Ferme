"use client";

import { ChartNoAxesCombined, CircleAlert, Clock3, Droplet, Logs, RefreshCw, Wifi, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Card, Notice, farmStyles } from "@/components/ui/FarmUI";
import { heatingReadingNeedsAttention, type ChauffageStatus, type HeatingMetric } from "@/lib/chauffage";
import type { HeatingHistoryKey } from "@/lib/chauffage-history";
import styles from "./HeatingDashboard.module.css";

type BuildingId = "A" | "B" | "D";

export interface HeatingTopology {
  confirmed: boolean;
  description?: string;
  connections?: ReadonlyArray<{ from: BuildingId; to: BuildingId }>;
}

export interface HeatingDashboardProps {
  status: ChauffageStatus;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  offline: boolean;
  onRefresh: () => void | Promise<void>;
  onSelectMetric?: (key: HeatingHistoryKey) => void;
  topology?: HeatingTopology;
  controlPanel?: ReactNode;
}

const numberFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fullDateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "medium" });
const provisionalTopology: HeatingTopology = { confirmed: false };

function displayDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return { short: dateFormat.format(date), full: fullDateFormat.format(date), iso: date.toISOString() };
}

function readingAge(metric: HeatingMetric) {
  if (!metric.reportedAt) return "Date inconnue";
  const elapsed = Date.now() - Date.parse(metric.reportedAt);
  if (!Number.isFinite(elapsed) || elapsed < -60_000) return "Date à vérifier";
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 1) return "Il y a moins d’une minute";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h${minutes % 60 ? ` ${minutes % 60}` : ""}`;
  const days = Math.floor(hours / 24);
  return `Il y a ${days} jour${days > 1 ? "s" : ""}`;
}

function needsAttention(metric: HeatingMetric) {
  return heatingReadingNeedsAttention(metric);
}

function Reading({ metric, boiler }: { metric: HeatingMetric; boiler: boolean }) {
  const value = metric.value === null ? "—" : numberFormat.format(metric.value);
  const size = boiler ? (value.length > 4 ? 20 : 26) : (value.length > 4 ? 28 : 32);
  return <svg viewBox="0 0 144 180" className={styles.visualReading} role="img" aria-label={`${value} ${metric.unit}`}>
    <text x={boiler ? 73 : 72} y={boiler ? 99 : 96} textAnchor="middle" className={styles.value} fontSize={size}>{value}</text>
    <text x={boiler ? 73 : 72} y={boiler ? 115 : 116} textAnchor="middle" className={styles.unit}>{metric.unit}</text>
  </svg>;
}

function ReadingDate({ metric, setpoint = false, sourceInterrupted = false }: { metric: HeatingMetric; setpoint?: boolean; sourceInterrupted?: boolean }) {
  const date = displayDate(metric.reportedAt);
  const warning = needsAttention(metric);
  const hasValue = metric.value !== null;
  return <span className={`${styles.readingMeta} ${warning ? styles.warning : ""}`}>
    <span className={styles.readingState}>
      {warning ? <CircleAlert aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
      {!hasValue ? "Aucun relevé conservé" : setpoint ? metric.label : warning || sourceInterrupted || metric.isFallback || metric.availability !== "available" ? "Dernier relevé" : "Relevé récent"}
    </span>
    {hasValue && !setpoint && <span>{readingAge(metric)}</span>}
    {date ? <time dateTime={date.iso} title={date.full}>{date.short}</time> : hasValue ? <span>Date inconnue</span> : <span>En attente du capteur</span>}
    {hasValue && (metric.isFallback || metric.availability !== "available") && <span className={styles.sourceUnavailable}>Capteur indisponible</span>}
  </span>;
}

function TankDrawing() {
  return <svg viewBox="0 0 144 180" className={styles.equipmentDrawing} aria-hidden="true" focusable="false">
    <path className={styles.pipeStub} d="M17 48H7M127 48H137M17 137H7M127 137H137" />
    <path className={styles.tankBody} d="M21 29C21 7 123 7 123 29V145C123 167 21 167 21 145Z" />
    <ellipse className={styles.tankTop} cx="72" cy="29" rx="51" ry="16" />
    <path className={styles.tankContour} d="M21 144C21 166 123 166 123 144M42 160V172M102 160V172" />
    <path className={styles.tankRing} d="M23 54C39 64 105 64 121 54M23 126C39 136 105 136 121 126" />
  </svg>;
}

function BoilerDrawing({ fuel }: { fuel: boolean }) {
  return <svg viewBox="0 0 144 180" className={styles.equipmentDrawing} aria-hidden="true" focusable="false">
    <path className={styles.pipeStub} d="M20 48H7M20 137H7M106 31V13H124" />
    <rect className={styles.boilerBody} x="23" y="32" width="100" height="128" rx="13" />
    <rect className={styles.boilerPanel} x="35" y="77" width="76" height="46" rx="9" />
    <path className={styles.tankContour} d="M38 160V172M106 160V172M46 139H98" />
    {!fuel && <path className={styles.tankContour} d="M47 146H97" />}
  </svg>;
}

function Equipment({ metricKey, title, subtitle, metric, kind = "tank", sourceInterrupted, onSelectMetric }: {
  metricKey: HeatingHistoryKey;
  title: string;
  subtitle: string;
  metric: HeatingMetric;
  kind?: "tank" | "wood" | "fuel";
  sourceInterrupted: boolean;
  onSelectMetric?: (key: HeatingHistoryKey) => void;
}) {
  const warning = needsAttention(metric);
  return <button type="button" className={`${styles.equipment} ${warning ? styles.equipmentWarning : ""} ${metric.value === null ? styles.equipmentEmpty : ""}`} onClick={() => onSelectMetric?.(metricKey)} aria-label={`Voir l’évolution : ${title}, ${metric.label}`}>
    <span className={styles.equipmentVisual}>
      {kind === "tank" ? <TankDrawing /> : <BoilerDrawing fuel={kind === "fuel"} />}
      {kind !== "tank" && <span className={styles.boilerIcon}>{kind === "fuel" ? <Droplet aria-hidden="true" /> : <Logs aria-hidden="true" />}</span>}
      <Reading metric={metric} boiler={kind !== "tank"} />
    </span>
    <span className={styles.equipmentTitle}>{title}</span>
    {subtitle && <span className={styles.equipmentSubtitle}>{subtitle}</span>}
    <ReadingDate metric={metric} setpoint={kind === "fuel"} sourceInterrupted={sourceInterrupted} />
    <span className={styles.chartLink}><ChartNoAxesCombined aria-hidden="true" />Historique</span>
  </button>;
}

function LocalPipes() {
  return <svg className={styles.localPipes} viewBox="0 0 100 180" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M28 48H72M28 137H72" /></svg>;
}

function Installation({ status, topology, sourceInterrupted, onSelectMetric, controlPanel }: { status: ChauffageStatus; topology: HeatingTopology; sourceInterrupted: boolean; onSelectMetric?: (key: HeatingHistoryKey) => void; controlPanel?: ReactNode }) {
  return <Card className={styles.installation} role="region" aria-label="Vue de l’installation de chauffage">
    <p className={styles.diagramHint}><ChartNoAxesCombined aria-hidden="true" />Touche un ballon ou une chaudière pour ouvrir son graphique.</p>
    <div className={`${styles.buildings} ${topology.confirmed ? styles.confirmedNetwork : ""}`}>
      {(["A", "B", "D"] as const).map((id) => <section className={styles.building} key={id} aria-labelledby={`building-heading-${id}`}>
        <header className={styles.buildingHeader}><span className={styles.buildingBadge} aria-hidden="true">{id}</span><h2 id={`building-heading-${id}`}>Bâtiment {id}</h2></header>
        <div className={`${styles.equipmentPair} ${id === "A" ? styles.singleEquipment : ""}`}>
          {id !== "A" && <LocalPipes />}
          <Equipment metricKey={`tank${id}`} title={id === "D" ? "Haut du ballon" : "Ballon d’eau chaude"} subtitle={id === "A" ? "Température du ballon" : "2 000 litres"} metric={status.measurements[`tank${id}`]} sourceInterrupted={sourceInterrupted} onSelectMetric={onSelectMetric} />
          {id === "B" && <Equipment metricKey="fuelSetpoint" title="Chaudière fioul" subtitle="" metric={status.fuel.setpoint} kind="fuel" sourceInterrupted={sourceInterrupted} onSelectMetric={onSelectMetric} />}
          {id === "D" && <Equipment metricKey="woodBoiler" title="Chaudière bois" subtitle="Température mesurée" metric={status.measurements.woodBoiler} kind="wood" sourceInterrupted={sourceInterrupted} onSelectMetric={onSelectMetric} />}
        </div>
        {id === "B" && <div className={styles.fuelControl}>{controlPanel}</div>}
      </section>)}
    </div>
    <p className={styles.diagramNote}>{topology.description || (topology.confirmed ? "Les ballons partagent le réseau de chauffage." : "Réseau partagé représenté en pointillés. Le tracé entre les bâtiments reste à confirmer.")}</p>
  </Card>;
}

export default function HeatingDashboard({ status, loading, error, refreshing, offline, onRefresh, onSelectMetric, topology = provisionalTopology, controlPanel }: HeatingDashboardProps) {
  const checked = displayDate(status.checkedAt);
  const connected = status.connected && status.relayFreshness === "fresh" && !offline;
  const sourceInterrupted = !connected;
  const connectionLabel = offline ? "Connexion interrompue" : !status.hasData ? "En attente des relevés" : !status.connected ? "Home Assistant ne répond pas" : status.relayFreshness !== "fresh" ? "Synchronisation en retard" : "Synchronisation active";
  const ConnectionIcon = offline || (status.hasData && !status.connected) ? WifiOff : connected ? Wifi : Clock3;

  return <div className={`${farmStyles.theme} ${styles.page}`}>
    <header className={styles.header}><h1>Chauffage</h1><p>Toute l’installation, en un regard.</p></header>
    <div className={styles.connection} aria-live="polite">
      <span className={`${styles.connectionStatus} ${connected ? styles.connected : styles.warning}`}><ConnectionIcon aria-hidden="true" />{loading && !status.hasData ? "Chargement des relevés…" : connectionLabel}</span>
      {checked && <span className={styles.checked}>Vérifié le <time dateTime={checked.iso} title={checked.full}>{checked.short}</time></span>}
    </div>
    {error && !offline && <Notice tone="error" className={styles.notice}>L’actualisation a échoué. Les dernières valeurs connues restent affichées.</Notice>}
    {!loading && !status.hasData && !error && !offline && <Notice className={styles.notice}>Les températures apparaîtront dès les premiers relevés disponibles.</Notice>}
    <Installation status={status} topology={topology} sourceInterrupted={sourceInterrupted} onSelectMetric={onSelectMetric} controlPanel={controlPanel} />
    <p className={styles.help}><CircleAlert aria-hidden="true" /><span>En orange : aucun nouveau relevé du capteur depuis plus de 30 minutes. Une coupure plus courte conserve la couleur habituelle.</span></p>
    <footer className={styles.actions}><Button variant="primary" fullWidth busy={refreshing} disabled={loading} onClick={() => { void onRefresh(); }}>{!refreshing && <RefreshCw aria-hidden="true" />}{refreshing ? "Actualisation…" : "Actualiser"}</Button></footer>
  </div>;
}
