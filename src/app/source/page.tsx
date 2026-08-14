"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
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
  SignalHigh,
  SignalMedium,
  SignalLow,
  SignalZero,
  Clock,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Pencil,
} from "lucide-react";
import { useAppStore } from "@/store/store";
import { useToast } from "@/components/Toast";
import type { ReleverSource, ReleverSourceFormData, UniteDebit } from "@/types/source";
import { EMPTY_FORM, fmtDebit, computeSourceStats } from "@/types/source";
import { createReleve, updateReleve, deleteReleve } from "@/services/source-service";
import type { CiterneStatus, Freshness } from "@/lib/citerneEau";
import { formatFreshnessLabel, formatMetricValue, formatRelativeAge } from "@/lib/citerneEau";
import { loadCiterneStatus } from "@/lib/citerneClient";

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

function signalVisual(dbm: number | null): { icon: typeof SignalHigh; tone: Tone } {
  if (dbm === null) return { icon: SignalZero, tone: "stone" };
  if (dbm >= -67) return { icon: SignalHigh, tone: "green" };
  if (dbm >= -85) return { icon: SignalMedium, tone: "amber" };
  if (dbm >= -100) return { icon: SignalLow, tone: "red" };
  return { icon: SignalLow, tone: "red" };
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

function TankLevelVisual({ level }: { level: number | null }) {
  const pct = Math.max(0, Math.min(100, level ?? 0));
  const tankTop = 20;
  const tankHeight = 112;
  const waterTop = tankTop + tankHeight * (1 - pct / 100);
  const waterHeight = tankHeight * (pct / 100);

  return (
    <div
      className="mx-auto w-full max-w-[320px]"
      role="progressbar"
      aria-label="Niveau visuel de la citerne horizontale"
      aria-valuenow={level ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg viewBox="0 0 320 170" className="block w-full h-auto" aria-hidden="true">
        <defs>
          <clipPath id="tank-water-clip">
            <rect x="24" y="20" width="242" height="112" rx="56" />
          </clipPath>
          <linearGradient id="tank-water-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#0284c7" />
          </linearGradient>
        </defs>

        <rect x="24" y="20" width="242" height="112" rx="56" fill="#f5f5f4" />
        <g clipPath="url(#tank-water-clip)">
          <rect
            data-testid="tank-water"
            data-level={pct}
            x="24"
            y={waterTop}
            width="242"
            height={waterHeight}
            fill="url(#tank-water-gradient)"
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
        <rect x="24" y="20" width="242" height="112" rx="56" fill="none" stroke="#44403c" strokeWidth="5" />
        <path d="M65 133v12M225 133v12M52 145h26M212 145h26" fill="none" stroke="#78716c" strokeWidth="5" strokeLinecap="round" />
        <path d="M266 54h9v44h-9" fill="none" stroke="#78716c" strokeWidth="4" strokeLinecap="round" />

        {[100, 75, 50, 25, 0].map((mark) => {
          const y = tankTop + tankHeight * (1 - mark / 100);
          return (
            <g key={mark}>
              <line x1="278" y1={y} x2="286" y2={y} stroke="#a8a29e" strokeWidth="2" />
              <text x="291" y={y + 4} fontSize="10" fill="#78716c">{mark}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function TankErrorCard({ message, onRetry, retrying }: { message: string; onRetry: () => void; retrying: boolean }) {
  return (
    <section className="bg-white rounded-2xl border border-red-200 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-4.5 h-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-stone-900">Citerne 1 — indisponible</p>
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

function TankStatusSection({ data, loading, refreshing, onRefresh, nowMs }: {
  data: CiterneApiResponse | null;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  nowMs: number;
}) {
  if (loading) return <TankSkeleton />;

  if (!data || !data.ok) {
    return (
      <TankErrorCard
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
        <p className="text-sm font-semibold text-stone-800 mt-3">Aucune mesure reçue de la citerne 1</p>
        <p className="text-xs text-stone-500 mt-1">Vérifiez que le module LoRa a effectué son relevé quotidien.</p>
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
  const signal = signalVisual(status.rssi.value);
  const debitMesure = status.debit.value !== null;

  return (
    <div className="space-y-3">
      <section className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">Citerne 1 — Eau potable</p>
              <h1 className="text-xl sm:text-2xl font-bold text-stone-900 mt-1">Niveau de la citerne</h1>
            </div>
            <button
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="Actualiser les mesures de la citerne"
              className="min-h-11 min-w-11 flex items-center justify-center rounded-lg border border-stone-200 text-stone-500 hover:bg-stone-50 disabled:opacity-50 cursor-pointer shrink-0"
            >
              {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </button>
          </div>

          <div className="mt-5">
            <TankLevelVisual level={level} />
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
              {formatFreshnessLabel(status.freshness)} · {formatRelativeAge(status.lastUpdated, nowMs)}
            </span>
          </div>

          {(status.freshness === "stale" || status.freshness === "unknown") && (
            <p className="mt-2.5 text-xs text-red-600 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Pas de nouvelle mesure récente — le module reporte une fois par jour, vérifiez qu&apos;il fonctionne toujours.
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatusTile
          icon={battery.icon}
          label="Batterie"
          value={status.batterie.value !== null ? `${status.batterie.value.toLocaleString("fr-FR")} %` : "—"}
          subtitle={status.tensionBatterie.value !== null ? formatMetricValue(status.tensionBatterie, 2) : undefined}
          tone={battery.tone}
        />
        <StatusTile
          icon={signal.icon}
          label="Signal LoRa"
          value={status.rssi.value !== null ? formatMetricValue(status.rssi, 0) : "—"}
          subtitle={status.snr.value !== null ? `SNR ${formatMetricValue(status.snr, 1)}` : undefined}
          tone={signal.tone}
        />
        <StatusTile
          icon={Droplets}
          label="Débit"
          value={debitMesure ? formatMetricValue(status.debit, 2) : "Non mesuré"}
          subtitle={debitMesure ? undefined : "Donnée indisponible côté capteur"}
          tone={debitMesure ? "green" : "stone"}
        />
      </div>
    </div>
  );
}

export default function SourcePage() {
  const { state } = useAppStore();
  const { showToast } = useToast();
  const releves = (state.relevesSource as ReleverSource[]) || [];

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ReleverSource | null>(null);
  const [form, setForm] = useState<ReleverSourceFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ReleverSource | null>(null);

  const [citerneData, setCiterneData] = useState<CiterneApiResponse | null>(null);
  const [citerneLoading, setCiterneLoading] = useState(true);
  const [citerneRefreshing, setCiterneRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const loadCiterne = useCallback(async () => {
    try {
      const status = await loadCiterneStatus();
      setCiterneData({ ok: true, status, updatedAt: new Date().toISOString() });
    } catch (err) {
      setCiterneData({ ok: false, error: err instanceof Error ? err.message : "Erreur réseau" });
    } finally {
      setCiterneLoading(false);
      setCiterneRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadCiterne();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") loadCiterne();
    };
    const refreshWhenOnline = () => loadCiterne();
    const timer = window.setInterval(loadCiterne, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("online", refreshWhenOnline);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("online", refreshWhenOnline);
    };
  }, [loadCiterne]);

  function handleRefreshCiterne() {
    setCiterneRefreshing(true);
    loadCiterne();
  }

  const stats = useMemo(() => computeSourceStats(releves), [releves]);

  const chartData = useMemo(() => {
    const sorted = [...releves].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.map((r) => ({
      date: r.date.slice(5),
      dateFull: r.date,
      debit: r.debit,
      unite: r.unite,
    }));
  }, [releves]);

  const moy = stats.moyenne;

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
        <h1 className="text-2xl font-bold text-stone-900">Source</h1>
        <p className="text-stone-500 mt-1">Mesures quotidiennes de la citerne 1 et suivi manuel du débit de la source</p>
      </div>

      {/* Citerne 1 — état opérationnel */}
      <TankStatusSection
        data={citerneData}
        loading={citerneLoading}
        refreshing={citerneRefreshing}
        onRefresh={handleRefreshCiterne}
        nowMs={now.getTime()}
      />

      {/* Débit de la source — relevés manuels */}
      <div className="pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div>
            <h2 className="text-lg font-bold text-stone-900">Débit de la source — relevés manuels</h2>
            <p className="text-xs text-stone-500 mt-0.5">Historique saisi à la main, indépendant des capteurs de la citerne.</p>
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
              <h3 className="text-base font-semibold text-stone-800 mb-4">Évolution du débit</h3>
              {chartData.length < 2 ? (
                <p className="text-sm text-stone-600 text-center py-10">
                  Ajoutez au moins 2 relevés pour afficher le graphique.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#57534e" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#57534e" }} />
                    <Tooltip
                      formatter={(v: unknown) =>
                        v != null ? [`${Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}`, "Débit"] : ["—", "Débit"]
                      }
                      labelStyle={{ fontSize: 12 }}
                      contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 12 }}
                    />
                    {moy > 0 && (
                      <ReferenceLine
                        y={moy}
                        stroke="#94a3b8"
                        strokeDasharray="4 4"
                        label={{ value: "moy", position: "insideTopRight", fontSize: 10, fill: "#94a3b8" }}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="debit"
                      stroke="#3b82f6"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: "#3b82f6" }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Tableau desktop / Cartes mobile */}
            <div className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
                <h3 className="text-base font-semibold text-stone-800">Historique des relevés</h3>
                <span className="text-xs text-stone-600">{releves.length} relevé(s)</span>
              </div>

              {releves.length === 0 ? (
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
              )}
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
