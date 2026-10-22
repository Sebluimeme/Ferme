"use client";

import { Activity, CircleAlert, Clock3, Network, RefreshCw, Settings2, Thermometer, Wifi, WifiOff } from "lucide-react";
import { Button, Card, Notice, farmStyles } from "@/components/ui/FarmUI";
import type { ChauffageStatus, HeatingMetric } from "@/lib/chauffage";
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
  topology?: HeatingTopology;
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

function metricState(metric: HeatingMetric) {
  if (metric.availability === "missing") return "Mesure non disponible";
  if (metric.availability === "unavailable") return "Capteur indisponible";
  if (metric.availability === "invalid") return "Mesure non exploitable";
  if (metric.freshness === "stale") return "Ancien relevé";
  if (metric.freshness === "aging") return "Relevé à vérifier";
  if (metric.freshness === "unknown") return "Date inconnue";
  return "Relevé récent";
}

function needsAttention(metric: HeatingMetric) {
  return metric.availability !== "available" || metric.freshness !== "fresh";
}

function Reading({ metric, compact = false }: { metric: HeatingMetric; compact?: boolean }) {
  const available = metric.availability === "available" && metric.value !== null;
  return <span className={compact ? styles.compactValue : styles.value} aria-label={available ? `${numberFormat.format(metric.value!)} degrés Celsius` : "Température indisponible"}>
    {available ? numberFormat.format(metric.value!) : "—"}<span className={styles.unit} aria-hidden="true">°C</span>
  </span>;
}

function ReadingDate({ metric, setpoint = false }: { metric: HeatingMetric; setpoint?: boolean }) {
  const date = displayDate(metric.reportedAt);
  const warning = needsAttention(metric);
  return <div className={styles.readingMeta}>
    <span className={`${styles.measurementState} ${warning ? styles.warning : ""}`}>
      {warning ? <CircleAlert aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
      {setpoint && !warning ? "Réglage relevé" : metricState(metric)}
    </span>
    {date && <time dateTime={date.iso} title={date.full}>{metric.availability === "available" ? "Reçu le " : "Dernier état : "}{date.short}</time>}
  </div>;
}

function TankDrawing({ unavailable }: { unavailable: boolean }) {
  return <svg viewBox="0 0 112 116" className={`${styles.tankDrawing} ${unavailable ? styles.unavailableDrawing : ""}`} aria-hidden="true" focusable="false">
    <path className={styles.buildingOutline} d="M10 50V108H102V50M4 51L56 9L108 51M79 28V13H91V38" />
    <path className={styles.tankBody} d="M34 48C34 38 78 38 78 48V91C78 102 34 102 34 91Z" />
    <ellipse className={styles.tankTop} cx="56" cy="48" rx="22" ry="7" />
    <path className={styles.tankLine} d="M34 91C34 101 78 101 78 91M56 61V79M53 61A3 3 0 0 1 59 61V78A7 7 0 1 1 53 78Z" />
    <path className={styles.buildingOutline} d="M56 99V116" />
  </svg>;
}

function Circuit({ topology }: { topology: HeatingTopology }) {
  const positions: Record<BuildingId, number> = { A: 50, B: 150, D: 250 };
  return <svg viewBox="0 0 300 36" className={`${styles.circuit} ${topology.confirmed ? "" : styles.provisionalCircuit}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
    {topology.connections?.length ? topology.connections.map(({ from, to }, index) => <path key={`${from}-${to}-${index}`} d={`M${positions[from]} 0V24H${positions[to]}V0`} />) : <>
      <path d="M50 0V24H250V0M150 0V24" />
      <circle cx="150" cy="24" r="3" />
    </>}
  </svg>;
}

function InstallationOverview({ status, topology }: { status: ChauffageStatus; topology: HeatingTopology }) {
  const tanks: Array<{ id: BuildingId; metric: HeatingMetric; subtitle: string }> = [
    { id: "A", metric: status.measurements.tankA, subtitle: "Ballon d’eau chaude" },
    { id: "B", metric: status.measurements.tankB, subtitle: "Ballon · 2 000 L" },
    { id: "D", metric: status.measurements.tankD, subtitle: "Haut · 2 000 L" },
  ];
  return <Card className={styles.overview} role="region" aria-labelledby="installation-heading">
    <div className={styles.sectionHeading}><Network aria-hidden="true" /><h2 id="installation-heading">Les trois bâtiments</h2></div>
    <div className={styles.diagram}>
      <div className={styles.buildings}>
        {tanks.map(({ id, metric }) => <a href={`#chauffage-batiment-${id}`} className={styles.building} key={id} aria-label={`Voir le détail du bâtiment ${id}`}>
          <span className={styles.buildingLabel}>Bâtiment <strong>{id}</strong></span>
          <TankDrawing unavailable={metric.availability !== "available"} />
        </a>)}
      </div>
      <Circuit topology={topology} />
      <div className={styles.overviewReadings}>{tanks.map(({ id, metric, subtitle }) => <div className={styles.overviewReading} key={id}>
        <span className={styles.overviewTemperature}><Reading metric={metric} compact /></span>
        <span className={styles.tankCaption}>{subtitle}</span>
        <span className={`${styles.overviewState} ${needsAttention(metric) ? styles.warning : ""}`}>{metricState(metric)}</span>
      </div>)}</div>
    </div>
    <p className={styles.diagramNote}>{topology.description || (topology.confirmed ? "Les trois ballons sont reliés au réseau de chauffage." : "Réseau partagé · vue fonctionnelle. Le tracé des liaisons reste à confirmer.")}</p>
  </Card>;
}

function BoilerReading({ metric, type }: { metric: HeatingMetric; type: "wood" | "fuel" }) {
  const fuel = type === "fuel";
  const Icon = fuel ? Settings2 : Thermometer;
  return <section className={styles.boilerReading} aria-label={fuel ? "Consigne de la chaudière fioul" : "Température de la chaudière bois"}>
    <div className={styles.boilerLabel}><Icon aria-hidden="true" /><div><h3>{fuel ? "Chaudière fioul" : "Chaudière bois"}</h3><p>{fuel ? "Consigne demandée" : "Température mesurée"}</p></div></div>
    <Reading metric={metric} />
    <ReadingDate metric={metric} setpoint={fuel} />
    {fuel && <p className={styles.settingNote}>La consigne est le réglage demandé à la chaudière.</p>}
  </section>;
}

function TankCard({ id, metric, status }: { id: BuildingId; metric: HeatingMetric; status: ChauffageStatus }) {
  return <Card className={styles.tankCard} id={`chauffage-batiment-${id}`} role="region" aria-labelledby={`building-heading-${id}`}>
    <header className={styles.tankHeader}>
      <span className={styles.buildingBadge} aria-hidden="true">{id}</span>
      <div><h2 id={`building-heading-${id}`}>Bâtiment {id}</h2><p>{id === "A" ? "Ballon d’eau chaude" : "Ballon tampon · 2 000 litres"}</p></div>
    </header>
    <div className={styles.tankReading}>
      <div className={styles.measurementLabel}><Thermometer aria-hidden="true" />{id === "D" ? "Haut du ballon" : "Température du ballon"}</div>
      <Reading metric={metric} />
      <ReadingDate metric={metric} />
    </div>
    {id === "B" && <BoilerReading metric={status.fuel.setpoint} type="fuel" />}
    {id === "D" && <BoilerReading metric={status.measurements.woodBoiler} type="wood" />}
  </Card>;
}

export default function HeatingDashboard({ status, loading, error, refreshing, offline, onRefresh, topology = provisionalTopology }: HeatingDashboardProps) {
  const checked = displayDate(status.checkedAt);
  const connected = status.connected && status.relayFreshness === "fresh" && !offline;
  const connectionLabel = offline ? "Hors ligne" : !status.hasData ? "En attente des relevés" : !status.connected ? "Connexion interrompue" : status.relayFreshness !== "fresh" ? "Synchronisation en retard" : "Suivi connecté";
  const ConnectionIcon = offline || (status.hasData && !status.connected) ? WifiOff : connected ? Wifi : Clock3;

  return <div className={`${farmStyles.theme} ${styles.page}`}>
    <header className={styles.header}>
      <h1>Chauffage</h1>
      <p>Les ballons et les chaudières de la ferme.</p>
    </header>

    <div className={styles.connection} aria-live="polite">
      <span className={`${styles.connectionStatus} ${connected ? styles.connected : ""}`}><ConnectionIcon aria-hidden="true" />{loading && !status.hasData ? "Chargement des relevés…" : connectionLabel}</span>
      {checked && <span className={styles.checked}>Dernière vérification <time dateTime={checked.iso} title={checked.full}>{checked.short}</time></span>}
    </div>

    {offline && <Notice tone="warning" className={styles.notice}>Le suivi en direct est interrompu. Les dernières données disponibles restent visibles ; leur date figure sous chaque température.</Notice>}
    {error && !offline && <Notice tone="error" className={styles.notice}>Les relevés n’ont pas pu être actualisés. Tu peux réessayer avec « Actualiser ».</Notice>}
    {!loading && !status.hasData && !error && !offline && <Notice className={styles.notice}>Les températures apparaîtront dès que les premiers relevés seront disponibles.</Notice>}
    {status.hasData && !status.connected && !offline && !error && <Notice tone="warning" className={styles.notice}>Home Assistant ne répond pas. Les valeurs conservées correspondent à leur dernière date de relevé.</Notice>}

    <InstallationOverview status={status} topology={topology} />

    <div className={styles.detailsHeading}><h2>Températures et réglages</h2><p>Chaque mesure conserve sa propre date.</p></div>
    <div className={styles.tankCards}>
      <TankCard id="D" metric={status.measurements.tankD} status={status} />
      <TankCard id="B" metric={status.measurements.tankB} status={status} />
      <TankCard id="A" metric={status.measurements.tankA} status={status} />
    </div>
    <p className={styles.help}><Activity aria-hidden="true" />Les températures sont affichées telles qu’elles sont reçues. Un ancien relevé n’indique pas la température actuelle.</p>

    <footer className={styles.actions}>
      <Button variant="primary" fullWidth busy={refreshing} disabled={loading} onClick={() => { void onRefresh(); }}>
        {!refreshing && <RefreshCw aria-hidden="true" />}{refreshing ? "Actualisation…" : "Actualiser"}
      </Button>
    </footer>
  </div>;
}
