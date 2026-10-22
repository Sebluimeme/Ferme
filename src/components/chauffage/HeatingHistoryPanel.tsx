"use client";

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Clock3, Maximize2, Minimize2, Minus, Plus, X } from "lucide-react";
import { Button, Notice, farmStyles, useBodyScrollLock, useDialogFocus, useVisualViewport } from "@/components/ui/FarmUI";
import type { HeatingMetric } from "@/lib/chauffage";
import type { HeatingHistoryKey, HeatingHistoryPoint } from "@/lib/chauffage-history";
import { boundHeatingRange, heatingChartSegments, heatingValueAxis, nearestHeatingSample, panHeatingRange, reduceHeatingSegments, zoomHeatingRange, HEATING_CHART_MAX_SPAN, HEATING_CHART_MIN_SPAN, type HeatingChartRange } from "@/lib/heating-chart";
import styles from "./HeatingHistoryPanel.module.css";

export interface HeatingHistoryPanelProps {
  metricKey: HeatingHistoryKey;
  metric: HeatingMetric;
  points: HeatingHistoryPoint[];
  loading: boolean;
  error: string | null;
  offline: boolean;
  range: HeatingChartRange;
  onRangeChange: (range: HeatingChartRange) => void;
  onClose: () => void;
}

const labels: Record<HeatingHistoryKey, { title: string; description: string }> = {
  tankA: { title: "Ballon · bâtiment A", description: "Évolution de la température du ballon" },
  tankB: { title: "Ballon · bâtiment B", description: "Évolution de la température du ballon de 2 000 L" },
  tankD: { title: "Ballon · bâtiment D", description: "Évolution de la température en haut du ballon de 2 000 L" },
  woodBoiler: { title: "Chaudière bois · D", description: "Évolution de la température mesurée" },
  fuelSetpoint: { title: "Chaudière fioul · B", description: "Historique des consignes enregistrées" },
  servo: { title: "Servomoteur fioul · B", description: "Évolution de la position rapportée" },
};
const presets = [{ label: "6 h", span: 6 * 3_600_000 }, { label: "24 h", span: 86_400_000 }, { label: "7 j", span: 7 * 86_400_000 }, { label: "30 j", span: HEATING_CHART_MAX_SPAN }];
const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const shortDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fullDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "medium" });
const hour = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

function dateInput(at: number) {
  const date = new Date(at);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function stamp(at: string | null) {
  const value = at ? Date.parse(at) : NaN;
  return Number.isFinite(value) ? value : null;
}

interface PointerPosition { x: number; y: number }
interface Gesture { range: HeatingChartRange; x: number; distance: number | null; anchor: number; moved: boolean }

/** A normal HTML dialog fills the visual viewport; it also works in installed iPhone PWAs. */
export default function HeatingHistoryPanel({ metricKey, metric, points, loading, error, offline, range, onRangeChange, onClose }: HeatingHistoryPanelProps) {
  const titleId = useId(), helpId = useId(), clipId = useId().replace(/:/g, "");
  const dialogRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, PointerPosition>());
  const gesture = useRef<Gesture | null>(null);
  const draftRef = useRef<HeatingChartRange | null>(null);
  const [draftRange, setDraftRange] = useState<HeatingChartRange | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [size, setSize] = useState({ width: 350, height: 250 });
  const [selectedAt, setSelectedAt] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState("");
  const viewport = useVisualViewport();
  useDialogFocus(dialogRef, onClose);
  useBodyScrollLock();

  useEffect(() => {
    const node = chartRef.current;
    if (!node) return;
    const update = () => setSize({ width: Math.max(240, node.clientWidth), height: Math.max(120, node.clientHeight) });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { setSelectedAt(null); setSelectedDay(""); }, [metricKey]);

  const shown = draftRange ?? range;
  const span = shown.end - shown.start;
  const persistent = metricKey === "fuelSetpoint";
  const orderedPoints = useMemo(() => [...points].sort((a, b) => a.at - b.at || (a.kind === "gap" ? -1 : 1)), [points]);
  const segments = useMemo(() => heatingChartSegments(orderedPoints, shown, persistent, true), [orderedPoints, shown, persistent]);
  const samples = useMemo(() => segments.flat(), [segments]);
  const plotted = useMemo(() => reduceHeatingSegments(segments, Math.min(600, Math.max(200, Math.round(size.width * 1.5)))), [segments, size.width]);
  const axis = useMemo(() => heatingValueAxis(samples), [samples]);
  const selected = useMemo(() => selectedAt === null ? null : nearestHeatingSample(samples, selectedAt), [samples, selectedAt]);
  const limits = useMemo(() => {
    if (!samples.length) return null;
    let min = Infinity, max = -Infinity;
    for (const sample of samples) { min = Math.min(min, sample.value); max = Math.max(max, sample.value); }
    return { min, max };
  }, [samples]);
  const plot = { left: 42, right: size.width - 12, top: 14, bottom: size.height - 33 };
  const plotWidth = plot.right - plot.left, plotHeight = plot.bottom - plot.top;
  const x = (at: number) => plot.left + (at - shown.start) / span * plotWidth;
  const y = (value: number) => plot.bottom - (value - axis.min) / (axis.max - axis.min) * plotHeight;
  const reported = stamp(metric.reportedAt);
  const old = metric.isFallback || metric.freshness !== "fresh" || metric.availability !== "available";
  const valueAvailable = metric.value !== null && Number.isFinite(metric.value);
  const chartTitle = labels[metricKey];
  const latestWindow = range.end >= Date.now() - 120_000;

  const changeRange = (next: HeatingChartRange) => {
    draftRef.current = null;
    setDraftRange(null);
    setSelectedAt(null);
    setSelectedDay("");
    onRangeChange(boundHeatingRange(next));
  };
  const showDraft = (next: HeatingChartRange) => { draftRef.current = next; setDraftRange(next); };
  const pointerFraction = (clientX: number) => {
    const bounds = chartRef.current?.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - (bounds?.left ?? 0) - plot.left) / plotWidth));
  };
  const startGesture = () => {
    const active = [...pointers.current.values()];
    if (!active.length) return;
    const center = active.length > 1 ? (active[0].x + active[1].x) / 2 : active[0].x;
    gesture.current = {
      range: draftRef.current ?? range,
      x: center,
      distance: active.length > 1 ? Math.max(1, Math.hypot(active[1].x - active[0].x, active[1].y - active[0].y)) : null,
      anchor: pointerFraction(center),
      moved: active.length > 1,
    };
  };
  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    startGesture();
  };
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const active = [...pointers.current.values()], initial = gesture.current;
    const currentX = active.length > 1 ? (active[0].x + active[1].x) / 2 : active[0].x;
    const delta = currentX - initial.x;
    if (Math.abs(delta) < 5 && active.length < 2 && !initial.moved) return;
    initial.moved = true;
    const distance = active.length > 1 ? Math.max(1, Math.hypot(active[1].x - active[0].x, active[1].y - active[0].y)) : null;
    const zoomed = initial.distance !== null && distance !== null
      ? zoomHeatingRange(initial.range, initial.distance / distance, initial.anchor)
      : initial.range;
    showDraft(panHeatingRange(zoomed, -delta / plotWidth * (zoomed.end - zoomed.start)));
  };
  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const initial = gesture.current;
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (pointers.current.size) { startGesture(); return; }
    gesture.current = null;
    if (!cancelled && initial && !initial.moved) setSelectedAt(shown.start + pointerFraction(event.clientX) * span);
    if (draftRef.current) { const next = draftRef.current; changeRange(next); }
  };
  const moveSelection = (direction: -1 | 1) => {
    if (!samples.length) return;
    const index = selected ? samples.indexOf(selected) : direction === 1 ? -1 : samples.length;
    const next = Math.max(0, Math.min(samples.length - 1, index + direction));
    setSelectedAt(samples[next].at);
  };
  const jumpToDate = (value: string) => {
    setSelectedDay(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    const start = new Date(`${value}T00:00:00`);
    if (!Number.isFinite(start.getTime()) || start.getTime() > Date.now()) return;
    const end = new Date(start); end.setDate(end.getDate() + 1);
    changeRange({ start: start.getTime(), end: Math.min(Date.now(), end.getTime()) });
    setSelectedDay(value);
  };

  if (typeof document === "undefined") return null;
  return createPortal(<div className={`${farmStyles.theme} ${styles.overlay} ${expanded ? styles.expandedOverlay : ""}`} style={viewport} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} className={`${styles.panel} ${expanded ? styles.expanded : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-farm-dialog>
      {!expanded && <div className={styles.handle} aria-hidden="true" />}
      <header className={styles.header}>
        <div><h2 id={titleId}>{chartTitle.title}</h2><p>{chartTitle.description}</p></div>
        <Button variant="ghost" className={styles.iconButton} onClick={onClose} aria-label="Fermer le graphique"><X aria-hidden="true" /></Button>
      </header>
      <div className={styles.body}>
        <div className={styles.current}>
          <div><span className={styles.caption}>{persistent ? metric.label : "Dernier relevé disponible"}</span><strong className={old && valueAvailable ? styles.oldValue : ""}>{valueAvailable ? number.format(metric.value!) : "—"}<span>{metric.unit}</span></strong></div>
          <div className={styles.currentDate}>{old && valueAvailable && <span className={styles.oldBadge}><Clock3 aria-hidden="true" />Ancien relevé</span>}{reported !== null ? <time dateTime={new Date(reported).toISOString()} title={fullDate.format(reported)}>{shortDate.format(reported)}</time> : <span>Pas de date disponible</span>}</div>
        </div>
        {persistent && <p className={styles.note}>Cet historique peut contenir d’anciens réglages mémorisés et des consignes transmises via l’API. La source n’est pas distinguée pour chaque point. Il ne mesure ni la position du servomoteur, ni la température réelle de la chaudière.</p>}
        {offline && <Notice className={styles.historyNotice} tone="warning">Hors connexion : seuls les relevés déjà chargés sont consultables.</Notice>}
        {error && !offline && <Notice className={styles.historyNotice} tone="warning">L’historique n’a pas pu être actualisé. Les relevés disponibles restent affichés.</Notice>}
        <div className={styles.presets} role="group" aria-label="Période du graphique">
          {presets.map(preset => <Button key={preset.label} variant="secondary" aria-pressed={latestWindow && Math.abs(range.end - range.start - preset.span) < 1000} onClick={() => { const now = Date.now(); changeRange({ start: now - preset.span, end: now }); }}>{preset.label}</Button>)}
        </div>
        <div className={styles.dateRow}><label htmlFor={`${titleId}-date`}>Voir un jour</label><input id={`${titleId}-date`} type="date" value={selectedDay} max={dateInput(Date.now())} onChange={event => jumpToDate(event.target.value)} /></div>
        <div className={styles.period}><span>{shortDate.format(shown.start)}</span><span aria-hidden="true">→</span><span>{shortDate.format(shown.end)}</span></div>
        <div className={styles.chartWrap} ref={chartRef} role="group" aria-roledescription="graphique interactif" aria-label={chartTitle.description} aria-describedby={helpId} tabIndex={0}
          onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={event => pointerUp(event)} onPointerCancel={event => pointerUp(event, true)}
          onKeyDown={event => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); moveSelection(event.key === "ArrowLeft" ? -1 : 1); }
            else if (event.key === "+" || event.key === "=") { event.preventDefault(); changeRange(zoomHeatingRange(shown, .5)); }
            else if (event.key === "-") { event.preventDefault(); changeRange(zoomHeatingRange(shown, 2)); }
          }}>
          {samples.length > 0 ? <svg viewBox={`0 0 ${size.width} ${size.height}`} width="100%" height="100%" role="img" aria-label={`${samples.length} relevés. Minimum ${number.format(limits!.min)} ${metric.unit}, maximum ${number.format(limits!.max)} ${metric.unit}.`}>
            <defs><clipPath id={clipId}><rect x={plot.left - 3} y={plot.top - 3} width={plotWidth + 6} height={plotHeight + 6} /></clipPath></defs>
            {axis.ticks.map(tick => <g key={tick}><line className={styles.gridLine} x1={plot.left} x2={plot.right} y1={y(tick)} y2={y(tick)} /><text className={styles.axisLabel} x={plot.left - 7} y={y(tick) + 4} textAnchor="end">{number.format(tick)}</text></g>)}
            {[0, .5, 1].map(fraction => { const at = shown.start + span * fraction; return <text key={fraction} className={styles.axisLabel} x={x(at)} y={size.height - 10} textAnchor={fraction === 0 ? "start" : fraction === 1 ? "end" : "middle"}>{span <= 36 * 3_600_000 ? hour.format(at) : day.format(at)}</text>; })}
            <g clipPath={`url(#${clipId})`}>
              {plotted.map((segment, index) => <g key={index}>{segment.length > 1 && <path className={styles.curve} d={segment.map((point, i) => i === 0 ? `M${x(point.at)},${y(point.value)}` : persistent ? `H${x(point.at)}V${y(point.value)}` : `L${x(point.at)},${y(point.value)}`).join(" ")} />}{(segment.length <= 3 || samples.length <= 80) && segment.map(point => <circle key={point.at} className={styles.sampleDot} cx={x(point.at)} cy={y(point.value)} r={segment.length === 1 ? 3.5 : 2.3} />)}</g>)}
              {selected && <><line className={styles.crosshair} x1={x(selected.at)} x2={x(selected.at)} y1={plot.top} y2={plot.bottom} /><circle className={styles.selectedDot} cx={x(selected.at)} cy={y(selected.value)} r="6" /></>}
            </g>
          </svg> : <div className={styles.empty} role="status"><Clock3 aria-hidden="true" /><strong>{loading ? "Chargement des relevés…" : persistent ? "Aucun changement de consigne enregistré sur cette période" : "Aucun relevé sur cette période"}</strong><span>{loading ? "L’historique disponible est en cours de lecture." : persistent ? "La dernière valeur disponible reste affichée au-dessus, avec sa source." : "Choisis un autre jour ou une période plus large."}</span></div>}
          {loading && samples.length > 0 && <span className={styles.loading}>Actualisation…</span>}
        </div>
        <output className={styles.inspection} aria-live="polite">{selected ? <><strong>{number.format(selected.value)} {metric.unit}</strong><time dateTime={new Date(selected.at).toISOString()} title={fullDate.format(selected.at)}>{expanded ? shortDate.format(selected.at) : fullDate.format(selected.at)}</time></> : <span>Touche la courbe pour lire la valeur et l’heure d’un relevé.</span>}</output>
        {limits && <div className={styles.stats}><span>Min. <strong>{number.format(limits.min)} {metric.unit}</strong></span><span>Max. <strong>{number.format(limits.max)} {metric.unit}</strong></span><span>{number.format(samples.length)} relevés</span></div>}
        <p id={helpId} className={styles.note}>Glisse pour te déplacer, pince pour zoomer. Au clavier : flèches pour lire les relevés, + et − pour zoomer.</p>
        <p className={styles.note}>{persistent ? "La ligne suit les réglages enregistrés. Elle s’interrompt lorsque la source est indisponible." : "Les interruptions restent visibles : aucune ligne n’est tracée entre deux relevés espacés de plus de 10 minutes."} Sur les longues périodes, les points sont regroupés en conservant les minima et maxima ; zoome pour retrouver le détail disponible.</p>
      </div>
      <footer className={styles.footer}>
        <div className={styles.controls} role="group" aria-label="Navigation dans le graphique">
          <Button variant="secondary" className={styles.iconButton} onClick={() => changeRange(panHeatingRange(shown, -span * .5))} aria-label="Période précédente"><ChevronLeft aria-hidden="true" /></Button>
          <Button variant="secondary" className={styles.iconButton} disabled={span >= HEATING_CHART_MAX_SPAN} onClick={() => changeRange(zoomHeatingRange(shown, 2))} aria-label="Dézoomer le graphique"><Minus aria-hidden="true" /></Button>
          <Button variant="secondary" className={styles.iconButton} disabled={span <= HEATING_CHART_MIN_SPAN} onClick={() => changeRange(zoomHeatingRange(shown, .5))} aria-label="Zoomer le graphique"><Plus aria-hidden="true" /></Button>
          <Button variant="secondary" className={styles.iconButton} onClick={() => changeRange(panHeatingRange(shown, span * .5))} disabled={shown.end >= Date.now() - 1000} aria-label="Période suivante"><ChevronRight aria-hidden="true" /></Button>
        </div>
        <Button variant="secondary" fullWidth onClick={() => setExpanded(value => !value)} aria-pressed={expanded}>{expanded ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}{expanded ? "Réduire le graphique" : "Agrandir en plein écran"}</Button>
      </footer>
    </div>
  </div>, document.body);
}
