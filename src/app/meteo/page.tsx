"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  CalendarDays,
  CloudRain,
  CloudSun,
  Droplets,
  Gauge,
  RefreshCw,
  Thermometer,
  Wind,
} from "lucide-react";
import { useAppStore } from "@/store/store";
import type { WeatherImportResult } from "@/types/weather";
import {
  aggregateWeatherByDay,
  computeWeatherStats,
  formatWeatherValue,
  getWindDirectionLabel,
  keepLastWeatherDays,
} from "@/types/weather";

function formatDateLabel(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function formatTime(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Kpi({
  label,
  value,
  subtitle,
  icon,
  tone = "stone",
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  tone?: "stone" | "blue" | "amber" | "green" | "red";
}) {
  const tones = {
    stone: "bg-stone-50 text-stone-600 border-stone-200",
    blue: "bg-sky-50 text-sky-700 border-sky-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    red: "bg-red-50 text-red-700 border-red-100",
  };

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-stone-900 tracking-tight">{value}</p>
          {subtitle && <p className="mt-1 text-[12px] text-stone-500">{subtitle}</p>}
        </div>
        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${tones[tone]}`}>{icon}</div>
      </div>
    </div>
  );
}

export default function MeteoPage() {
  const { state } = useAppStore();
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastAutoImportAt, setLastAutoImportAt] = useState<string | null>(null);
  const importInFlightRef = useRef(false);

  const readings = useMemo(
    () => keepLastWeatherDays(state.weatherReadings ?? [], 370).sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [state.weatherReadings]
  );
  const stats = useMemo(() => computeWeatherStats(readings), [readings]);
  const daily = useMemo(() => aggregateWeatherByDay(readings).slice(-45), [readings]);
  const latest = stats.latest;

  const importNow = useCallback(
    async (mode: "manual" | "auto" = "manual") => {
      if (importInFlightRef.current) return;
      importInFlightRef.current = true;
      setImporting(true);
      if (mode === "manual") setMessage(null);

      try {
        const token = await state.user?.getIdToken();
        if (!token) {
          if (mode === "manual") setMessage("Connexion requise pour importer les données météo.");
          return;
        }
        const response = await fetch("/api/weather/import", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = (await response.json()) as WeatherImportResult;
        if (!response.ok || !result.success) {
          setMessage(result.error ?? "Import météo impossible");
          return;
        }

        const importedAt = new Date().toISOString();
        setLastAutoImportAt(importedAt);
        if (mode === "manual") {
          setMessage(`Dernière mesure importée : ${formatTime(result.reading?.timestamp)}`);
        }
      } catch (error) {
        setMessage((error as Error).message);
      } finally {
        importInFlightRef.current = false;
        setImporting(false);
      }
    },
    [state.user]
  );

  useEffect(() => {
    if (!state.user) return;

    const runIfVisible = () => {
      if (document.visibilityState === "visible") {
        void importNow("auto");
      }
    };

    runIfVisible();
    const intervalId = window.setInterval(runIfVisible, 30_000);
    document.addEventListener("visibilitychange", runIfVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", runIfVisible);
    };
  }, [importNow, state.user]);

  return (
    <div className="space-y-6 fade-in pb-6">
      <div className="relative overflow-hidden rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-5 md:p-7 shadow-sm">
        <div className="absolute right-[-50px] top-[-70px] w-48 h-48 rounded-full bg-sky-200/30 blur-2xl" />
        <div className="absolute right-16 bottom-[-80px] w-56 h-56 rounded-full bg-emerald-200/30 blur-2xl" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/80 border border-sky-100 px-3 py-1 text-[12px] font-medium text-sky-700 shadow-sm">
              <CloudSun className="w-3.5 h-3.5" /> Station VEVOR YT60234
            </div>
            <h1 className="mt-4 text-2xl md:text-3xl font-semibold tracking-tight text-stone-950">Météo de la ferme</h1>
            <p className="mt-2 text-sm text-stone-600 max-w-2xl">
              Suivi terrain pour décider les coupes de foin, surveiller la pluie réelle et garder un historique fiable saison par saison.
            </p>
          </div>

          <div className="bg-white/85 backdrop-blur border border-white rounded-2xl p-4 min-w-[240px] shadow-sm">
            <p className="text-[12px] text-stone-400">Dernière mesure</p>
            <p className="mt-1 text-xl font-semibold text-stone-900">{formatWeatherValue(latest?.temperatureC, "°C")}</p>
            <p className="mt-1 text-[12px] text-stone-500">{formatTime(latest?.timestamp)}</p>
            <button
              onClick={() => importNow("manual")}
              disabled={importing}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-stone-950 px-3 py-2 text-[12px] font-semibold text-white hover:bg-stone-800 disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${importing ? "animate-spin" : ""}`} />
              Importer maintenant
            </button>
            <div className="mt-3 flex items-center gap-2 text-[11px] text-emerald-700">
              <span className={`h-2 w-2 rounded-full ${importing ? "bg-amber-400 animate-pulse" : "bg-emerald-500"}`} />
              <span>Auto-refresh toutes les 30 sec{lastAutoImportAt ? ` · ${formatTime(lastAutoImportAt)}` : ""}</span>
            </div>
          </div>
        </div>
      </div>

      {message && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi label="Température" value={formatWeatherValue(latest?.temperatureC, "°C")} subtitle={`Mini ${formatWeatherValue(stats.temperatureMinC, "°C")} · maxi ${formatWeatherValue(stats.temperatureMaxC, "°C")}`} icon={<Thermometer className="w-4 h-4" />} tone="amber" />
        <Kpi label="Pluie aujourd'hui" value={formatWeatherValue(stats.rainTodayMm, "mm")} subtitle={`${formatWeatherValue(stats.rain7DaysMm, "mm")} sur 7 jours`} icon={<CloudRain className="w-4 h-4" />} tone="blue" />
        <Kpi label="Vent" value={formatWeatherValue(latest?.windSpeedKmh, "km/h")} subtitle={`Rafale ${formatWeatherValue(latest?.windGustKmh, "km/h")} · ${getWindDirectionLabel(latest?.windDirectionDeg)}`} icon={<Wind className="w-4 h-4" />} tone="stone" />
        <Kpi label="Jours secs" value={`${stats.dryDays}`} subtitle="depuis pluie > 0,2 mm" icon={<CalendarDays className="w-4 h-4" />} tone="green" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-[15px] font-semibold text-stone-900">Température sur 45 jours</h2>
              <p className="text-[12px] text-stone-400">moyenne, minimum et maximum par jour</p>
            </div>
          </div>
          <div className="h-[290px]">
            {daily.length < 2 ? (
              <div className="h-full flex items-center justify-center text-sm text-stone-400 border border-dashed border-stone-200 rounded-2xl">
                Les graphiques apparaîtront après quelques imports météo.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                  <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={{ fontSize: 11, fill: "#78716c" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#78716c" }} unit="°" />
                  <Tooltip labelFormatter={(label) => formatDateLabel(String(label))} formatter={(value) => [`${Number(value).toFixed(1)} °C`, ""]} />
                  <Line type="monotone" dataKey="temperatureMaxC" stroke="#f59e0b" strokeWidth={2} dot={false} name="Max" />
                  <Line type="monotone" dataKey="temperatureAvgC" stroke="#0ea5e9" strokeWidth={2.5} dot={false} name="Moyenne" />
                  <Line type="monotone" dataKey="temperatureMinC" stroke="#64748b" strokeWidth={2} dot={false} name="Min" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-[15px] font-semibold text-stone-900">Conditions actuelles</h2>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3"><span className="text-sm text-stone-500 flex items-center gap-2"><Droplets className="w-4 h-4" /> Humidité</span><span className="font-semibold text-stone-900">{formatWeatherValue(latest?.humidityPct, "%", 0)}</span></div>
            <div className="flex items-center justify-between border-b border-stone-100 pb-3"><span className="text-sm text-stone-500 flex items-center gap-2"><Gauge className="w-4 h-4" /> Pression</span><span className="font-semibold text-stone-900">{formatWeatherValue(latest?.pressureHpa, "hPa", 0)}</span></div>
            <div className="flex items-center justify-between border-b border-stone-100 pb-3"><span className="text-sm text-stone-500">Point de rosée</span><span className="font-semibold text-stone-900">{formatWeatherValue(latest?.dewPointC, "°C")}</span></div>
            <div className="flex items-center justify-between border-b border-stone-100 pb-3"><span className="text-sm text-stone-500">UV</span><span className="font-semibold text-stone-900">{formatWeatherValue(latest?.uvIndex, "", 1)}</span></div>
            <div className="flex items-center justify-between"><span className="text-sm text-stone-500">Enregistrements</span><span className="font-semibold text-stone-900">{stats.count}</span></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-[15px] font-semibold text-stone-900">Pluie réelle par jour</h2>
          <p className="text-[12px] text-stone-400 mb-5">utile pour foin, pâturage et décisions terrain</p>
          <div className="h-[260px]">
            {daily.length < 2 ? (
              <div className="h-full flex items-center justify-center text-sm text-stone-400 border border-dashed border-stone-200 rounded-2xl">Pas encore assez de données.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                  <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={{ fontSize: 11, fill: "#78716c" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#78716c" }} unit="mm" />
                  <Tooltip labelFormatter={(label) => formatDateLabel(String(label))} formatter={(value) => [`${Number(value).toFixed(1)} mm`, "Pluie"]} />
                  <Bar dataKey="rainMm" radius={[6, 6, 0, 0]} fill="#38bdf8" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-[15px] font-semibold text-stone-900">Vent max par jour</h2>
          <p className="text-[12px] text-stone-400 mb-5">rafales ou vitesse max observée</p>
          <div className="h-[260px]">
            {daily.length < 2 ? (
              <div className="h-full flex items-center justify-center text-sm text-stone-400 border border-dashed border-stone-200 rounded-2xl">Pas encore assez de données.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={daily} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="windGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                  <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={{ fontSize: 11, fill: "#78716c" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#78716c" }} unit="km/h" />
                  <Tooltip labelFormatter={(label) => formatDateLabel(String(label))} formatter={(value) => [`${Number(value).toFixed(1)} km/h`, "Vent max"]} />
                  <Area type="monotone" dataKey="windMaxKmh" stroke="#64748b" fill="url(#windGradient)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Kpi label="Pluie 30 jours" value={formatWeatherValue(stats.rain30DaysMm, "mm")} icon={<CloudRain className="w-4 h-4" />} tone="blue" />
        <Kpi label="Pluie année" value={formatWeatherValue(stats.rainYearMm, "mm")} icon={<CloudRain className="w-4 h-4" />} tone="green" />
        <Kpi label="Humidité moyenne" value={formatWeatherValue(stats.humidityAvgPct, "%", 0)} icon={<Droplets className="w-4 h-4" />} tone="stone" />
      </div>
    </div>
  );
}
