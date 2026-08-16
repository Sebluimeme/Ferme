"use client";

import React, { useState, useMemo, useEffect, useCallback, useId } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import {
  Droplets,
  Waves,
  Ruler,
  Gauge,
  BatteryFull,
  BatteryMedium,
  BatteryLow,
  BatteryWarning,
  Clock,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Pencil,
  ChevronDown,
  SlidersHorizontal,
} from "lucide-react";
import { ref, onValue, set as firebaseSet } from "firebase/database";
import { database } from "@/lib/firebase";
import { useAppStore } from "@/store/store";
import { useToast } from "@/components/Toast";
import type { ReleverSource, ReleverSourceFormData, UniteDebit } from "@/types/source";
import { EMPTY_FORM, fmtDebit, computeSourceStats, debitToLitresPerHour } from "@/types/source";
import { createReleve, updateReleve, deleteReleve } from "@/services/source-service";
import type { CiterneStatus, Freshness, TankId } from "@/lib/citerneEau";
import { formatMeasurementDateTime, formatMetricValue, getBatteryAlert, getLevelAlert, classifyFreshness } from "@/lib/citerneEau";
import { computeEstimatedFlows, type CiterneHistoryPoint, type EstimatedFlowPoint } from "@/lib/citerneHistory";
import { loadCiterneHistory, loadCiterneStatus } from "@/lib/citerneClient";

interface CiterneAlertConfig {
  enabled: boolean;
  levelThresholdPct: number;
  batteryThresholdPct: number;
  maxAgeHours: number;
}

const CITERNE_1_ALERT_CONFIG_PATH = "integrations/citerne-1-alerts";

const DEFAULT_CITERNE_1_ALERT_CONFIG: CiterneAlertConfig = {
  enabled: true,
  levelThresholdPct: 20,
  batteryThresholdPct: 15,
  maxAgeHours: 48,
};

const inputClass =
  "w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400";
const UNITES: UniteDebit[] = ["L/h", "L/min", "L/s", "m³/h"];

type Tone = "green" | "amber" | "red" | "stone";

const BADGE_CLASSES: Record<Tone, string> = {
  green: "bg-brand-50 text-brand-700 border-brand-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  stone: "bg-stone-100 text-stone-500 border-stone-200",
};

const TILE_ICON_CLASSES: Record<Tone, string> = {
  green: "bg-brand-50 text-brand-600",
  amber: "bg-amber-50 text-amber-600",
  red: "bg-red-50 text-red-600",
  stone: "bg-stone-100 text-stone-600",
};

const FRESHNESS_TONE: Record<Freshness, Tone> = {
  fresh: "green",
  aging: "amber",
  stale: "red",
  unknown: "stone",
};

function batteryVisual(pct: number | null): { icon: typeof BatteryFull; tone: Tone } {
  if (pct === null) return { icon: BatteryWarning, tone: "stone" };
  if (pct >= 80) return { icon: BatteryFull, tone: "green" };
  if (pct >= 40) return { icon: BatteryMedium, tone: "green" };
  if (pct >= 15) return { icon: BatteryLow, tone: "amber" };
  return { icon: BatteryWarning, tone: "red" };
}


type CiterneApiResponse =
  | { ok: true; status: CiterneStatus; updatedAt: string }
  | { ok: false; error: string };

function TankMetricTile({ icon: Icon, label, value }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="p-4 flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center gap-1.5 text-stone-600">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide truncate">{label}</span>
      </div>
      <p className="text-sm sm:text-base font-bold text-stone-900 tabular-nums truncate">{value}</p>
    </div>
  );
}

function StatusTile({ icon: Icon, label, value, subtitle, tone }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subtitle?: string;
  tone: Tone;
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">{label}</span>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${TILE_ICON_CLASSES[tone]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-lg font-bold text-stone-900">{value}</p>
      {subtitle && <p className="text-xs text-stone-700 mt-1">{subtitle}</p>}
    </div>
  );
}

function TankSkeleton() {
  return (
    <section className="bg-white rounded-2xl border border-stone-200 p-5 sm:p-6 animate-pulse">
      <div className="h-3 w-40 bg-stone-100 rounded" />
      <div className="h-6 w-56 bg-stone-100 rounded mt-2" />
      <div className="h-12 w-32 bg-stone-100 rounded mt-5" />
      <div className="h-4 w-full bg-stone-100 rounded mt-3" />
      <div className="h-6 w-64 bg-stone-100 rounded mt-4" />
    </section>
  );
}

function TankLevelVisual({ level, tankLabel }: { level: number | null; tankLabel: string }) {
  const pct = Math.max(0, Math.min(100, level ?? 0));
  const tankTop = 20;
  const tankHeight = 112;
  const waterTop = tankTop + tankHeight * (1 - pct / 100);
  const waterHeight = tankHeight * (pct / 100);
  const uid = useId();
  const clipId = `tank-water-clip-${uid}`;
  const gradientId = `tank-water-gradient-${uid}`;

  return (
    <div
      className="mx-auto w-full max-w-[320px]"
      role="progressbar"
      aria-label={`Niveau visuel de la ${tankLabel.toLowerCase()}`}
      aria-valuenow={level ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg viewBox="0 0 290 170" className="block w-full h-auto" aria-hidden="true">
        <defs>
          <clipPath id={clipId}>
            <rect x="24" y="20" width="242" height="112" rx="16" />
          </clipPath>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#0284c7" />
          </linearGradient>
        </defs>

        <rect x="24" y="20" width="242" height="112" rx="16" fill="#f5f5f4" />
        <g clipPath={`url(#${clipId})`}>
          <rect
            data-testid="tank-water"
            data-level={pct}
            x="24"
            y={waterTop}
            width="242"
            height={waterHeight}
            fill={`url(#${gradientId})`}
            className="motion-safe:transition-all motion-safe:duration-700 motion-safe:ease-out"
          />
          {pct > 0 && (
            <ellipse
              cx="145"
              cy={waterTop}
              rx="121"
              ry="5"
              fill="#7dd3fc"
              className="motion-safe:transition-all motion-safe:duration-700 motion-safe:ease-out"
            />
          )}
        </g>
        <rect x="24" y="20" width="242" height="112" rx="16" fill="none" stroke="#44403c" strokeWidth="5" />
        <path d="M65 133v12M225 133v12M52 145h26M212 145h26" fill="none" stroke="#78716c" strokeWidth="5" strokeLinecap="round" />
        <path d="M266 54h9v44h-9" fill="none" stroke="#78716c" strokeWidth="4" strokeLinecap="round" />
        <line x1="145" y1={tankTop} x2="145" y2={tankTop + tankHeight} stroke="#0c0a09" strokeWidth="1.5" opacity="0.65" />

        {[75, 50, 25].map((mark) => {
          const y = tankTop + tankHeight * (1 - mark / 100);
          return (
            <g key={mark}>
              <line x1="132" y1={y} x2="158" y2={y} stroke="#0c0a09" strokeWidth="2" />
              <text x="163" y={y + 4} fontSize="11" fontWeight="700" fill="#0c0a09">{mark}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function TankErrorCard({ tankLabel, message, onRetry, retrying }: {
  tankLabel: string;
  message: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <section className="bg-white rounded-2xl border border-red-200 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-4.5 h-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-stone-900">{tankLabel} — indisponible</p>
          <p className="text-xs text-stone-500 mt-1 break-words">{message}</p>
        </div>
      </div>
      <button
        onClick={onRetry}
        disabled={retrying}
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-200 px-4 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50 cursor-pointer"
      >
        {retrying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        Réessayer
      </button>
    </section>
  );
}

function TankStatusSection({ tankLabel, data, estimatedFlow, loading, refreshing, onRefresh, alertConfig }: {
  tankLabel: string;
  data: CiterneApiResponse | null;
  estimatedFlow?: EstimatedFlowPoint;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  /** Réglages d'alerte propres à cette citerne (actuellement configurables pour la Citerne 1 uniquement). Absent → comportement par défaut inchangé. */
  alertConfig?: CiterneAlertConfig;
}) {
  if (loading) return <TankSkeleton />;

  if (!data || !data.ok) {
    return (
      <TankErrorCard
        tankLabel={tankLabel}
        message={data && !data.ok ? data.error : "Impossible de contacter le serveur."}
        onRetry={onRefresh}
        retrying={refreshing}
      />
    );
  }

  const { status } = data;

  if (!status.hasData) {
    return (
      <section className="bg-white rounded-2xl border border-stone-200 p-5 sm:p-6 text-center">
        <div className="w-10 h-10 rounded-full bg-stone-100 text-stone-600 flex items-center justify-center mx-auto">
          <Droplets className="w-5 h-5" />
        </div>
        <p className="text-sm font-semibold text-stone-800 mt-3">Aucune mesure reçue de la {tankLabel.toLowerCase()}</p>
        <p className="text-xs text-stone-500 mt-1">Vérifiez que le capteur a effectué son relevé quotidien.</p>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-200 px-4 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50 cursor-pointer"
        >
          {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Actualiser
        </button>
      </section>
    );
  }

  const level = status.niveau.value;
  const fTone = FRESHNESS_TONE[status.freshness];
  const battery = batteryVisual(status.batterie.value);
  const debitMesure = status.debit.value !== null;
  const debitEstime = !debitMesure && estimatedFlow !== undefined;

  // Alertes affichées : réglages Citerne 1 si fournis (activation + seuils
  // niveau/batterie/ancienneté), sinon comportement par défaut inchangé.
  const alertsEnabled = alertConfig?.enabled ?? true;
  const effectiveFreshness = alertConfig
    ? classifyFreshness(status.lastUpdated, Date.now(), alertConfig.maxAgeHours)
    : status.freshness;
  const showStaleWarning = alertsEnabled && (effectiveFreshness === "stale" || effectiveFreshness === "unknown");
  const batteryAlert = alertsEnabled ? getBatteryAlert(status.batterie.value, alertConfig?.batteryThresholdPct) : null;
  const levelAlert = alertsEnabled && alertConfig ? getLevelAlert(level, alertConfig.levelThresholdPct) : null;

  return (
    <div className="space-y-3">
      <section className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">{tankLabel} — Eau potable</p>
              <h2 className="text-xl sm:text-2xl font-bold text-stone-900 mt-1">{tankLabel} — niveau</h2>
            </div>
            <button
              onClick={onRefresh}
              disabled={refreshing}
              aria-label={`Actualiser les mesures de la ${tankLabel.toLowerCase()}`}
              className="min-h-11 min-w-11 flex items-center justify-center rounded-lg border border-stone-200 text-stone-500 hover:bg-stone-50 disabled:opacity-50 cursor-pointer shrink-0"
            >
              {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </button>
          </div>

          <div className="mt-5">
            <TankLevelVisual level={level} tankLabel={tankLabel} />
            <div className="mt-2 flex items-end justify-between gap-4 rounded-xl bg-stone-50 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-end gap-1">
                  <p className="text-4xl sm:text-5xl font-bold text-stone-900 tabular-nums leading-none">
                    {level !== null ? level.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : "—"}
                  </p>
                  <span className="text-lg sm:text-xl font-semibold text-stone-600 pb-0.5">%</span>
                </div>
                <p className="mt-1 text-sm font-medium text-stone-700">Niveau mesuré</p>
              </div>
              <p className="max-w-32 text-right text-sm text-stone-600 tabular-nums">
                {status.volumeDisponible.value !== null
                  ? `${status.volumeDisponible.value.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} L disponibles`
                  : "Volume indisponible"}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${BADGE_CLASSES[fTone]}`}>
              <Clock className="w-3.5 h-3.5" />
              Dernière mesure : {formatMeasurementDateTime(status.lastUpdated)}
            </span>
          </div>

          {showStaleWarning && (
            <p className="mt-2.5 text-xs text-red-600 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Pas de nouvelle mesure récente — le module reporte une fois par jour, vérifiez qu&apos;il fonctionne toujours.
            </p>
          )}

          {levelAlert && (
            <p className={`mt-2.5 text-xs flex items-start gap-1.5 ${levelAlert.tone === "red" ? "text-red-600" : "text-amber-600"}`}>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {levelAlert.message}
            </p>
          )}

          {batteryAlert && (
            <p className={`mt-2.5 text-xs flex items-start gap-1.5 ${batteryAlert.tone === "red" ? "text-red-600" : "text-amber-600"}`}>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {batteryAlert.message}
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 divide-x divide-stone-100 border-t border-stone-100">
          <TankMetricTile icon={Waves} label="Volume" value={formatMetricValue(status.volumeDisponible, 0)} />
          <TankMetricTile icon={Ruler} label="Hauteur" value={formatMetricValue(status.hauteurEau, 2)} />
          <TankMetricTile
            icon={Gauge}
            label="Distance"
            value={status.distanceCapteur.value === null ? "Absente" : formatMetricValue(status.distanceCapteur, 1)}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StatusTile
          icon={battery.icon}
          label="Batterie"
          value={status.batterie.value !== null ? `${status.batterie.value.toLocaleString("fr-FR")} %` : "—"}
          subtitle={status.tensionBatterie.value !== null ? formatMetricValue(status.tensionBatterie, 2) : undefined}
          tone={battery.tone}
        />
        <StatusTile
          icon={Droplets}
          label={debitMesure ? "Débit mesuré" : "Débit net estimé"}
          value={debitMesure
            ? formatMetricValue(status.debit, 2)
            : debitEstime
              ? `${estimatedFlow.debitLitresPerHour.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} L/h`
              : "En attente"}
          subtitle={debitMesure
            ? undefined
            : debitEstime
              ? "Calculé entre les deux derniers volumes ; la consommation peut le fausser."
              : "Disponible après deux mesures de volume."}
          tone={debitMesure ? "green" : debitEstime ? "amber" : "stone"}
        />
      </div>
    </div>
  );
}

/**
 * Petit réglage des alertes affichées pour la Citerne 1 (activation, seuil
 * niveau bas, seuil batterie, ancienneté max). Persisté en Firebase et
 * consommé par TankStatusSection pour calculer les alertes réellement
 * affichées — ne modifie ni le capteur ni sa cadence de relevé (hors dépôt).
 */
function CiterneAlertSettingsCard({ config, saving, onSave }: {
  config: CiterneAlertConfig;
  saving: boolean;
  onSave: (next: CiterneAlertConfig) => void;
}) {
  const [draft, setDraft] = useState(config);

  useEffect(() => setDraft(config), [config]);

  const dirty = draft.enabled !== config.enabled
    || draft.levelThresholdPct !== config.levelThresholdPct
    || draft.batteryThresholdPct !== config.batteryThresholdPct
    || draft.maxAgeHours !== config.maxAgeHours;

  return (
    <details className="group bg-white rounded-2xl border border-stone-200 p-4 sm:p-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-stone-800">
          <SlidersHorizontal className="w-4 h-4 text-stone-400" /> Alertes Citerne 1
        </span>
        <span className="text-xs font-semibold text-stone-400 group-open:hidden">Régler</span>
        <span className="hidden text-xs font-semibold text-stone-400 group-open:inline">Masquer</span>
      </summary>

      <div className="mt-4 space-y-4">
        <label className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2.5">
          <span className="text-xs font-medium text-stone-700">Alertes activées</span>
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))}
            className="h-5 w-5 accent-brand-600 cursor-pointer"
            aria-label="Activer les alertes Citerne 1"
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Seuil niveau bas (%)</label>
            <input
              type="number" min={0} max={100}
              value={draft.levelThresholdPct}
              onChange={(e) => setDraft((d) => ({ ...d, levelThresholdPct: Number(e.target.value) }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Seuil batterie (%)</label>
            <input
              type="number" min={0} max={100}
              value={draft.batteryThresholdPct}
              onChange={(e) => setDraft((d) => ({ ...d, batteryThresholdPct: Number(e.target.value) }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Ancienneté max (h)</label>
            <input
              type="number" min={1}
              value={draft.maxAgeHours}
              onChange={(e) => setDraft((d) => ({ ...d, maxAgeHours: Number(e.target.value) }))}
              className={inputClass}
            />
          </div>
        </div>

        <p className="text-xs text-stone-500">
          Ces seuils ne s’appliquent qu’aux alertes affichées ici pour la Citerne 1 — ils ne modifient ni le capteur ni sa cadence de relevé quotidien.
        </p>

        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => onSave(draft)}
          className="min-h-10 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 cursor-pointer"
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </details>
  );
}

/** Loads status + history for one tank and keeps it polled/refreshed; shared by both Citerne cards. */
function useCiterneStatus(tankId: TankId) {
  const [data, setData] = useState<CiterneApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [history, setHistory] = useState<CiterneHistoryPoint[]>([]);

  const load = useCallback(async () => {
    try {
      const [status, tankHistory] = await Promise.all([
        loadCiterneStatus(tankId),
        loadCiterneHistory(tankId).catch(() => [] as CiterneHistoryPoint[]),
      ]);
      setData({ ok: true, status, updatedAt: new Date().toISOString() });
      setHistory(tankHistory);
    } catch (err) {
      setData({ ok: false, error: err instanceof Error ? err.message : "Erreur réseau" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tankId]);

  useEffect(() => {
    load();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    const refreshWhenOnline = () => load();
    const timer = window.setInterval(load, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("online", refreshWhenOnline);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("online", refreshWhenOnline);
    };
  }, [load]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  return { data, loading, refreshing, history, refresh };
}

export default function EauPage() {
  const { state } = useAppStore();
  const { showToast } = useToast();
  const releves = (state.relevesSource as ReleverSource[]) || [];

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ReleverSource | null>(null);
  const [form, setForm] = useState<ReleverSourceFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ReleverSource | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [citerne1AlertConfig, setCiterne1AlertConfig] = useState<CiterneAlertConfig>(DEFAULT_CITERNE_1_ALERT_CONFIG);
  const [savingAlertConfig, setSavingAlertConfig] = useState(false);

  useEffect(() => {
    const configRef = ref(database, CITERNE_1_ALERT_CONFIG_PATH);
    return onValue(configRef, (snap) => {
      const value = snap.val() as Partial<CiterneAlertConfig> | null;
      setCiterne1AlertConfig(value ? { ...DEFAULT_CITERNE_1_ALERT_CONFIG, ...value } : DEFAULT_CITERNE_1_ALERT_CONFIG);
    });
  }, []);

  async function handleSaveAlertConfig(next: CiterneAlertConfig) {
    setSavingAlertConfig(true);
    try {
      await firebaseSet(ref(database, CITERNE_1_ALERT_CONFIG_PATH), next);
      showToast({ type: "success", title: "Alertes Citerne 1 mises à jour" });
    } catch (err) {
      showToast({ type: "error", title: "Enregistrement impossible", message: (err as Error).message });
    } finally {
      setSavingAlertConfig(false);
    }
  }

  const tank1 = useCiterneStatus(1);
  const tank2 = useCiterneStatus(2);

  const stats = useMemo(() => computeSourceStats(releves), [releves]);

  const estimatedFlows = useMemo(() => computeEstimatedFlows(tank1.history), [tank1.history]);
  const latestEstimatedFlow = estimatedFlows.at(-1);
  const latestEstimatedFlowTank2 = useMemo(
    () => computeEstimatedFlows(tank2.history).at(-1),
    [tank2.history],
  );

  const chartData = useMemo(() => {
    const byDay = new Map<string, {
      date: string;
      dateFull: string;
      manuel?: number;
      estime?: number;
    }>();

    for (const releve of releves) {
      const dateFull = releve.date;
      byDay.set(dateFull, {
        ...(byDay.get(dateFull) ?? {
          date: new Date(`${dateFull}T00:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
          dateFull,
        }),
        manuel: Math.round(debitToLitresPerHour(releve.debit, releve.unite) * 100) / 100,
      });
    }

    for (const estimate of estimatedFlows) {
      const dateFull = estimate.receivedAt.slice(0, 10);
      byDay.set(dateFull, {
        ...(byDay.get(dateFull) ?? {
          date: new Date(`${dateFull}T00:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
          dateFull,
        }),
        estime: estimate.debitLitresPerHour,
      });
    }

    return [...byDay.values()].sort((a, b) => a.dateFull.localeCompare(b.dateFull));
  }, [releves, estimatedFlows]);

  const manualAverageLh = useMemo(() => {
    if (releves.length === 0) return 0;
    return releves.reduce((sum, releve) => sum + debitToLitresPerHour(releve.debit, releve.unite), 0) / releves.length;
  }, [releves]);

  function openCreate() {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().split("T")[0] });
    setModalOpen(true);
  }

  function openEdit(r: ReleverSource) {
    setEditTarget(r);
    setForm({ date: r.date, debit: String(r.debit), unite: r.unite, remarque: r.remarque ?? "" });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditTarget(null);
    setForm(EMPTY_FORM);
  }

  function set(field: keyof ReleverSourceFormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [field]: e.target.value }));
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = editTarget
        ? await updateReleve(editTarget.id, form)
        : await createReleve(form);
      if (res.success) {
        showToast({ type: "success", title: editTarget ? "Relevé mis à jour" : "Relevé ajouté" });
        closeModal();
      } else {
        showToast({ type: "error", title: (res as { error?: string }).error || "Erreur" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await deleteReleve(deleteTarget.id);
    if (res.success) {
      showToast({ type: "success", title: "Relevé supprimé" });
    } else {
      showToast({ type: "error", title: "Erreur lors de la suppression" });
    }
    setDeleteTarget(null);
  }

  const sortedDesc = [...releves].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-stone-900">Eau</h1>
        <p className="text-stone-500 mt-1">Mesures quotidiennes des citernes et suivi manuel du débit de la source</p>
      </div>

      {/* Citernes 1 et 2 — état opérationnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <TankStatusSection
          tankLabel="Citerne 1"
          data={tank1.data}
          estimatedFlow={latestEstimatedFlow}
          loading={tank1.loading}
          refreshing={tank1.refreshing}
          onRefresh={tank1.refresh}
          alertConfig={citerne1AlertConfig}
        />
        <TankStatusSection
          tankLabel="Citerne 2"
          data={tank2.data}
          estimatedFlow={latestEstimatedFlowTank2}
          loading={tank2.loading}
          refreshing={tank2.refreshing}
          onRefresh={tank2.refresh}
        />
      </div>

      <CiterneAlertSettingsCard config={citerne1AlertConfig} saving={savingAlertConfig} onSave={handleSaveAlertConfig} />

      {/* Débit de la source — relevés manuels */}
      <div className="pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div>
            <h2 className="text-lg font-bold text-stone-900">Débit de la source</h2>
            <p className="text-xs text-stone-500 mt-0.5">Relevés manuels et estimation nette issue des variations de la citerne.</p>
          </div>
          <button
            onClick={openCreate}
            className="min-h-11 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors cursor-pointer shrink-0"
          >
            + Nouveau relevé
          </button>
        </div>

        {state.loading ? (
          <div className="bg-white rounded-2xl border border-stone-100 p-10 text-center text-stone-600 text-sm">
            Chargement des relevés…
          </div>
        ) : (
          <div className="space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatusTile icon={Pencil} label="Relevés" value={String(stats.count)} tone="stone" />
              <StatusTile icon={Droplets} label="Dernier débit" value={stats.dernierDebit ? fmtDebit(stats.dernierDebit.debit, stats.dernierDebit.unite) : "—"} tone="stone" />
              <StatusTile icon={Gauge} label="Moyenne" value={stats.count > 0 ? fmtDebit(stats.moyenne, stats.dernierDebit?.unite ?? "L/h") : "—"} tone="stone" />
              <StatusTile icon={Waves} label="Min / Max" value={stats.count > 0 ? `${stats.min} / ${stats.max} ${stats.dernierDebit?.unite ?? "L/h"}` : "—"} tone="stone" />
            </div>

            {/* Graphique */}
            <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5">
              <div className="mb-4">
                <h3 className="text-base font-semibold text-stone-800">Évolution du débit</h3>
                <p className="mt-1 text-xs text-amber-700">
                  L’estimation correspond à la variation nette du volume de la citerne. La consommation de la maison peut la fausser.
                </p>
                {estimatedFlows.length === 0 && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                    Courbe estimée disponible après la prochaine mesure de la citerne.
                  </p>
                )}
              </div>
              {chartData.length < 2 ? (
                <p className="text-sm text-stone-600 text-center py-10">
                  Deux mesures sont nécessaires pour tracer une évolution.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartData} margin={{ top: 5, right: 12, left: -12, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#57534e" }} />
                    <YAxis
                      yAxisId="manual"
                      tick={{ fontSize: 10, fill: "#2563eb" }}
                      tickFormatter={(value) => Number(value).toLocaleString("fr-FR", { maximumFractionDigits: 0 })}
                      width={48}
                    />
                    <YAxis
                      yAxisId="estimate"
                      orientation="right"
                      tick={{ fontSize: 10, fill: "#d97706" }}
                      tickFormatter={(value) => Number(value).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}
                      width={48}
                    />
                    <Tooltip
                      formatter={(value: unknown, name: unknown) => [
                        value != null ? `${Number(value).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} L/h` : "—",
                        String(name),
                      ]}
                      labelStyle={{ fontSize: 12 }}
                      contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                    {manualAverageLh > 0 && (
                      <ReferenceLine
                        yAxisId="manual"
                        y={manualAverageLh}
                        stroke="#94a3b8"
                        strokeDasharray="4 4"
                        label={{ value: "moy. manuelle", position: "insideTopRight", fontSize: 10, fill: "#64748b" }}
                      />
                    )}
                    <Line
                      type="monotone"
                      yAxisId="manual"
                      dataKey="manuel"
                      name="Relevés manuels"
                      stroke="#2563eb"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: "#2563eb" }}
                      activeDot={{ r: 6 }}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      yAxisId="estimate"
                      dataKey="estime"
                      name="Estimation capteur"
                      stroke="#d97706"
                      strokeWidth={2.5}
                      strokeDasharray="6 4"
                      dot={{ r: 4, fill: "#d97706" }}
                      activeDot={{ r: 6 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Tableau desktop / Cartes mobile */}
            <div className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
              <div className={`px-5 py-4 flex items-center justify-between gap-4 ${historyOpen ? "border-b border-stone-100" : ""}`}>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-stone-800">Historique des relevés</h3>
                  <span className="text-xs text-stone-600">{releves.length} relevé(s)</span>
                </div>
                <button
                  type="button"
                  onClick={() => setHistoryOpen((open) => !open)}
                  aria-expanded={historyOpen}
                  className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-stone-200 px-3 text-sm font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
                >
                  {historyOpen ? "Masquer" : "Afficher"}
                  <ChevronDown className={`h-4 w-4 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
                </button>
              </div>

              {historyOpen && (releves.length === 0 ? (
                <p className="text-sm text-stone-600 text-center py-10">
                  Aucun relevé enregistré — commencez par <button onClick={openCreate} className="text-brand-600 underline cursor-pointer">ajouter un relevé</button>.
                </p>
              ) : (
                <>
                  {/* Vue carte mobile */}
                  <div className="md:hidden divide-y divide-stone-100">
                    {sortedDesc.map((r) => (
                      <div
                        key={r.id}
                        onClick={() => openEdit(r)}
                        className="px-4 py-3 cursor-pointer hover:bg-stone-50 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-stone-800">
                              {new Date(r.date + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                            </p>
                            {r.remarque && <p className="text-xs text-stone-600 mt-0.5 truncate max-w-[180px]">{r.remarque}</p>}
                          </div>
                          <span className="text-base font-bold text-blue-600 shrink-0">{fmtDebit(r.debit, r.unite)}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Vue tableau desktop */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm min-w-[500px]">
                      <thead>
                        <tr className="bg-stone-50 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide">
                          <th className="px-5 py-3">Date</th>
                          <th className="px-5 py-3">Débit</th>
                          <th className="px-5 py-3">Unité</th>
                          <th className="px-5 py-3">Remarque</th>
                          <th className="px-5 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {sortedDesc.map((r) => (
                          <tr
                            key={r.id}
                            onClick={() => openEdit(r)}
                            className="hover:bg-stone-50/80 transition-colors group cursor-pointer"
                          >
                            <td className="px-5 py-3 font-medium text-stone-800">
                              {new Date(r.date + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                            </td>
                            <td className="px-5 py-3 font-bold text-blue-600">{r.debit.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</td>
                            <td className="px-5 py-3 text-stone-500">{r.unite}</td>
                            <td className="px-5 py-3 text-stone-600 max-w-[220px] truncate">{r.remarque ?? "—"}</td>
                            <td className="px-5 py-3 text-right">
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeleteTarget(r); }}
                                className="text-red-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer text-xs px-2 py-1 rounded hover:bg-red-50"
                              >
                                Suppr.
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal ajout/édition */}
      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 overflow-hidden"
          onClick={closeModal}
          style={{
            paddingLeft: "env(safe-area-inset-left, 0px)",
            paddingRight: "env(safe-area-inset-right, 0px)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          <div
            className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[92dvh] sm:max-h-[90dvh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* En-tête fixe */}
            <div className="px-5 pt-5 pb-4 border-b border-stone-100 flex items-center justify-between shrink-0">
              <h2 className="text-base font-semibold text-stone-900">
                {editTarget ? "Modifier le relevé" : "Nouveau relevé"}
              </h2>
              <button onClick={closeModal} className="text-stone-600 hover:text-stone-600 cursor-pointer text-xl leading-none">×</button>
            </div>
            {/* Corps scrollable */}
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-5 space-y-4 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-stone-600 mb-1">Date *</label>
                    <input type="date" value={form.date} onChange={set("date")} required className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-600 mb-1">Débit *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.debit}
                      onChange={set("debit")}
                      placeholder="ex: 12.5"
                      required
                      className={inputClass}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">Unité</label>
                  <select value={form.unite} onChange={set("unite")} className={inputClass}>
                    {UNITES.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">Remarque</label>
                  <textarea
                    value={form.remarque}
                    onChange={set("remarque")}
                    rows={2}
                    placeholder="Conditions de mesure, météo…"
                    className={inputClass + " resize-none"}
                  />
                </div>
              </div>
              {/* Boutons toujours visibles en bas */}
              <div className="flex gap-3 px-5 py-4 border-t border-stone-100 bg-white shrink-0"
                style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
                <button type="button" onClick={closeModal} className="flex-1 py-2.5 rounded-xl border border-stone-200 text-sm text-stone-600 hover:bg-stone-50 cursor-pointer">
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors disabled:opacity-50 cursor-pointer transition-all"
                >
                  {saving ? "Enregistrement…" : editTarget ? "Mettre à jour" : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal confirmation suppression */}
      {deleteTarget && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="bg-white w-full max-w-sm mx-4 rounded-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-stone-900">Supprimer ce relevé ?</h3>
            <p className="text-sm text-stone-500">
              Relevé du{" "}
              {new Date(deleteTarget.date + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}{" "}
              — <strong>{fmtDebit(deleteTarget.debit, deleteTarget.unite)}</strong>
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2 rounded-xl border border-stone-200 text-sm text-stone-600 hover:bg-stone-50 cursor-pointer">
                Annuler
              </button>
              <button onClick={handleDelete} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 cursor-pointer">
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
