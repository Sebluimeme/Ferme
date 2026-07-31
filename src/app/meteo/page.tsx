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
  ChevronDown,
  CloudRain,
  CloudSun,
  Compass,
  Droplets,
  Gauge,
  Info,
  RefreshCw,
  Thermometer,
  Wind,
} from "lucide-react";
import { useAppStore } from "@/store/store";
import firebaseService from "@/lib/firebase-service";
import type { Partiel } from "@/types/fourrage";
import type { WeatherForecast, WeatherForecastResult, WeatherImportResult, WeatherReading } from "@/types/weather";
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

function minutesSince(iso?: string | null): number | null {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs)) return null;
  return Math.max(0, Math.floor(diffMs / 60000));
}

function freshnessLabel(minutes: number | null): string {
  if (minutes === null) return "Aucune mesure reçue";
  if (minutes < 1) return "à l’instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.floor(hours / 24)} j`;
}

function freshnessTone(minutes: number | null): "green" | "amber" | "red" {
  if (minutes === null) return "red";
  if (minutes <= 60) return "green";
  if (minutes <= 360) return "amber";
  return "red";
}

function computeParcelCenter(partiels: Partiel[]): { lat: number; lon: number } | null {
  const withGeo = partiels.filter((p) => p.geometry);
  if (!withGeo.length) return null;
  let latSum = 0, lonSum = 0, count = 0;
  for (const p of withGeo) {
    const geo = p.geometry as { type: string; coordinates: number[][][] };
    if (geo?.type === "Polygon" && geo.coordinates?.[0]) {
      for (const [lng, lt] of geo.coordinates[0]) {
        lonSum += lng; latSum += lt; count++;
      }
    }
  }
  return count > 0 ? { lat: latSum / count, lon: lonSum / count } : null;
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

function numberValue(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getUvLevel(value: number | null | undefined): { label: string; color: string; width: string } {
  const uv = numberValue(value);
  if (uv === null) return { label: "UV non dispo", color: "bg-stone-300", width: "0%" };
  if (uv < 3) return { label: "UV faible", color: "bg-emerald-500", width: `${Math.max(12, uv * 9)}%` };
  if (uv < 6) return { label: "UV modéré", color: "bg-amber-500", width: `${uv * 9}%` };
  if (uv < 8) return { label: "UV fort", color: "bg-orange-500", width: `${uv * 9}%` };
  return { label: "UV très fort", color: "bg-red-500", width: "100%" };
}

function getSolarLevel(value: number | null | undefined): { label: string; color: string; width: string } {
  const solar = numberValue(value);
  if (solar === null) return { label: "Rayonnement non dispo", color: "bg-stone-300", width: "0%" };
  if (solar < 120) return { label: "Faible", color: "bg-stone-400", width: `${Math.max(10, solar / 10)}%` };
  if (solar < 450) return { label: "Correct", color: "bg-amber-400", width: `${Math.min(55, solar / 8)}%` };
  if (solar < 750) return { label: "Fort", color: "bg-orange-500", width: `${Math.min(85, solar / 8)}%` };
  return { label: "Très fort", color: "bg-red-500", width: "100%" };
}

function getAtmosphericSituation(reading: WeatherReading | null): { label: string; detail: string; tone: string } {
  if (!reading) return { label: "Pas de mesure", detail: "Station en attente", tone: "bg-stone-50 text-stone-500 border-stone-200" };
  const pressure = numberValue(reading.pressureHpa);
  const humidity = numberValue(reading.humidityPct);
  const dewPoint = numberValue(reading.dewPointC);
  const temp = numberValue(reading.temperatureC);
  const rainRate = numberValue(reading.rainRateMmH);

  if ((rainRate ?? 0) > 0.2) {
    return { label: "Pluie en cours", detail: `${formatWeatherValue(rainRate, "mm/h")} actuellement`, tone: "bg-sky-50 text-sky-700 border-sky-200" };
  }
  if (pressure !== null && pressure < 1005) {
    return { label: "Dépression", detail: "Temps potentiellement instable", tone: "bg-amber-50 text-amber-700 border-amber-200" };
  }
  if (humidity !== null && humidity > 85) {
    return { label: "Air très humide", detail: "Risque brouillard/rosée", tone: "bg-blue-50 text-blue-700 border-blue-200" };
  }
  if (temp !== null && dewPoint !== null && temp - dewPoint < 3) {
    return { label: "Rosée proche", detail: "Séchage plus lent", tone: "bg-cyan-50 text-cyan-700 border-cyan-200" };
  }
  if (pressure !== null && pressure > 1018) {
    return { label: "Temps stable", detail: "Pression haute", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  }
  return { label: "Conditions calmes", detail: "Pas de signal météo fort", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" };
}

function WindCompass({ reading }: { reading: WeatherReading | null }) {
  const deg = numberValue(reading?.windDirectionDeg);
  const speed = reading?.windSpeedKmh;
  const gust = reading?.windGustKmh;
  const direction = getWindDirectionLabel(deg);
  const rotation = deg ?? 0;

  return (
    <div className="bg-white border border-stone-200 rounded-3xl p-5 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-stone-900">Direction du vent</h2>
          <p className="text-[12px] text-stone-400">boussole station</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
          <Compass className="w-5 h-5" />
        </div>
      </div>

      <div className="mt-5 flex items-center justify-center">
        <div className="relative h-52 w-52 max-w-full rounded-full bg-[radial-gradient(circle_at_center,#ffffff_0%,#ffffff_31%,#eff8ff_32%,#f8fbff_68%,#ffffff_69%)] shadow-[inset_0_0_0_1px_rgba(14,165,233,0.12),inset_0_14px_34px_rgba(14,165,233,0.10)]">
          <div className="absolute inset-4 rounded-full border border-sky-100/80" />
          <div className="absolute inset-10 rounded-full border border-dashed border-sky-200/90" />
          <span className="absolute left-1/2 top-3 -translate-x-1/2 text-[11px] font-bold text-sky-700">N</span>
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-bold text-stone-400">E</span>
          <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] font-bold text-stone-400">S</span>
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[11px] font-bold text-stone-400">O</span>

          <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 208 208" aria-hidden="true">
            <defs>
              <linearGradient id="windNeedle" x1="104" y1="22" x2="104" y2="104" gradientUnits="userSpaceOnUse">
                <stop stopColor="#0EA5E9" />
                <stop offset="1" stopColor="#2563EB" />
              </linearGradient>
              <filter id="windNeedleShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="6" stdDeviation="4" floodColor="#2563EB" floodOpacity="0.22" />
              </filter>
            </defs>
            <g style={{ transform: `rotate(${rotation}deg)`, transformOrigin: "104px 104px" }}>
              <path d="M104 25 L119 95 Q104 88 89 95 Z" fill="url(#windNeedle)" filter="url(#windNeedleShadow)" />
              <circle cx="104" cy="104" r="4" fill="#2563EB" />
            </g>
          </svg>

          <div className="absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-stone-100 bg-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.10)]">
            <span className="text-2xl font-bold text-stone-950">{direction}</span>
            <span className="mt-0.5 text-[11px] font-medium text-stone-400">{deg !== null ? `${Math.round(deg)}°` : "—"}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-2xl bg-stone-50 p-3">
          <p className="text-[11px] uppercase tracking-wide text-stone-400">Vent</p>
          <p className="text-xl font-semibold text-stone-900">{formatWeatherValue(speed, "km/h")}</p>
        </div>
        <div className="rounded-2xl bg-stone-50 p-3">
          <p className="text-[11px] uppercase tracking-wide text-stone-400">Rafale</p>
          <p className="text-xl font-semibold text-stone-900">{formatWeatherValue(gust, "km/h")}</p>
        </div>
      </div>
    </div>
  );
}

function GaugeBar({ label, value, unit, level }: { label: string; value: number | null | undefined; unit: string; level: { label: string; color: string; width: string } }) {
  return (
    <div className="rounded-2xl border border-stone-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-400">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-stone-900">{formatWeatherValue(value, unit)}</p>
        </div>
        <span className="rounded-full bg-stone-50 px-2 py-1 text-[11px] font-medium text-stone-600">{level.label}</span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-stone-100 overflow-hidden">
        <div className={`h-full rounded-full ${level.color}`} style={{ width: level.width }} />
      </div>
    </div>
  );
}

function HourlyStrip({ readings }: { readings: WeatherReading[] }) {
  const items = readings.slice(-12).reverse();
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-[15px] font-semibold text-stone-900">Dernières mesures disponibles</h2>
          <p className="text-[12px] text-stone-400">historique horaire/minute remonté par la station</p>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-200 py-8 text-center text-sm text-stone-400">Aucune mesure importée.</div>
      ) : (
        <div className="overflow-x-auto -mx-1 pb-1">
          <div className="flex min-w-max gap-2 px-1">
            {items.map((reading) => (
              <div key={reading.id} className="w-32 rounded-2xl border border-stone-100 bg-stone-50/70 p-3">
                <p className="text-[11px] font-medium text-stone-400">{formatTime(reading.timestamp)}</p>
                <p className="mt-2 text-xl font-semibold text-stone-900">{formatWeatherValue(reading.temperatureC, "°C")}</p>
                <p className="mt-1 text-[12px] text-sky-700">💧 {formatWeatherValue(reading.rainRateMmH, "mm/h")}</p>
                <p className="text-[12px] text-stone-500">💨 {formatWeatherValue(reading.windSpeedKmh, "km/h")}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyChartNotice({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-stone-200 px-4 py-3 text-xs text-stone-400">
      <Info className="h-3.5 w-3.5 shrink-0" /> {text}
    </div>
  );
}

function ImportErrorNotice({
  error,
  latestTimestamp,
  onRetry,
  retrying,
}: {
  error: string;
  latestTimestamp?: string | null;
  onRetry: () => void;
  retrying: boolean;
}) {
  const [showDetails, setShowDetails] = useState(false);
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Import météo indisponible</p>
            <p className="mt-1 text-amber-800">
              Dernières données connues : {latestTimestamp ? formatTime(latestTimestamp) : "aucune mesure reçue"}.
            </p>
          </div>
        </div>
        <button
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl bg-stone-950 px-3 text-xs font-semibold text-white disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} />
          Réessayer
        </button>
      </div>
      <button onClick={() => setShowDetails((v) => !v)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-700 underline-offset-2 hover:underline">
        <ChevronDown className={`h-3 w-3 transition-transform ${showDetails ? "rotate-180" : ""}`} />
        Détails techniques
      </button>
      {showDetails && <p className="mt-1 font-mono text-[11px] text-amber-700">{error}</p>}
    </div>
  );
}

function RainForecastCard({
  status,
  forecast,
  error,
}: {
  status: "loading" | "unavailable" | "ready";
  forecast: WeatherForecast | null;
  error: string | null;
}) {
  if (status === "unavailable") {
    return (
      <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-400">Prévu · non disponible</p>
        <h2 className="mt-1 text-[15px] font-semibold text-stone-700">Prévisions pluie — 7 jours</h2>
        <p className="mt-2 text-sm text-stone-500">
          Indisponible : aucune parcelle géolocalisée. Dessinez la géométrie d’une parcelle dans Fourrage pour activer les prévisions.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-600">Prévu · erreur</p>
        <h2 className="mt-1 text-[15px] font-semibold text-amber-900">Prévisions pluie — 7 jours indisponibles</h2>
        <p className="mt-2 text-sm text-amber-800">{error}</p>
      </div>
    );
  }

  if (!forecast) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5 text-sm text-stone-400">
        Chargement des prévisions…
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-600">Prévu · Open-Meteo</p>
          <h2 className="mt-1 text-[15px] font-semibold text-stone-900">Prévisions pluie — 7 jours</h2>
        </div>
        <p className="text-[11px] text-stone-400">MAJ {formatTime(forecast.fetchedAt)}</p>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
        {forecast.days.map((day) => (
          <div key={day.date} className="rounded-xl bg-sky-50/60 p-2 text-center">
            <p className="text-[10px] font-semibold text-stone-500">{formatDateLabel(day.date)}</p>
            <p className="mt-1 text-sm font-bold text-sky-700">{formatWeatherValue(day.precipitationSumMm, "mm")}</p>
            <p className="text-[10px] text-stone-400">{day.precipitationProbabilityPct != null ? `${day.precipitationProbabilityPct}%` : "—"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MeteoPage() {
  const { state } = useAppStore();
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const importInFlightRef = useRef(false);

  const [parcelCenter, setParcelCenter] = useState<{ lat: number; lon: number } | null | undefined>(undefined);
  const [forecast, setForecast] = useState<WeatherForecast | null>(null);
  const [forecastError, setForecastError] = useState<string | null>(null);

  const readings = useMemo(
    () => keepLastWeatherDays(state.weatherReadings ?? [], 370).sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [state.weatherReadings]
  );
  const stats = useMemo(() => computeWeatherStats(readings), [readings]);
  const daily = useMemo(() => aggregateWeatherByDay(readings).slice(-45), [readings]);
  const latest = stats.latest;
  const atmosphere = useMemo(() => getAtmosphericSituation(latest), [latest]);
  const uvLevel = useMemo(() => getUvLevel(latest?.uvIndex), [latest?.uvIndex]);
  const solarLevel = useMemo(() => getSolarLevel(latest?.solarRadiationWm2), [latest?.solarRadiationWm2]);
  const freshMinutes = minutesSince(latest?.timestamp);
  const freshTone = freshnessTone(freshMinutes);

  const importNow = useCallback(
    async (mode: "manual" | "auto" = "manual") => {
      if (importInFlightRef.current) return;
      importInFlightRef.current = true;
      setImporting(true);

      try {
        const token = await state.user?.getIdToken();
        if (!token) {
          if (mode === "manual") setImportError("Connexion requise pour importer les données météo.");
          return;
        }
        const response = await fetch("/api/weather/import", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = (await response.json()) as WeatherImportResult;
        if (!response.ok || !result.success) {
          setImportError(result.error ?? "Import météo impossible");
          return;
        }
        setImportError(null);
      } catch (error) {
        setImportError((error as Error).message);
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

  useEffect(() => {
    let active = true;
    (async () => {
      const result = await firebaseService.getAll<Partiel>("partiels");
      if (!active) return;
      setParcelCenter(result.success ? computeParcelCenter(result.data ?? []) : null);
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!parcelCenter) return;
    let active = true;
    (async () => {
      try {
        const response = await fetch(`/api/weather/forecast?lat=${parcelCenter.lat}&lon=${parcelCenter.lon}`);
        const json = (await response.json()) as WeatherForecastResult;
        if (!active) return;
        if (!response.ok || !json.success || !json.forecast) {
          setForecastError(json.error ?? "Prévisions indisponibles");
          return;
        }
        setForecast(json.forecast);
        setForecastError(null);
      } catch (error) {
        if (active) setForecastError((error as Error).message);
      }
    })();
    return () => {
      active = false;
    };
  }, [parcelCenter]);

  const forecastStatus: "loading" | "unavailable" | "ready" = parcelCenter === undefined ? "loading" : parcelCenter === null ? "unavailable" : "ready";

  return (
    <div className="space-y-5 fade-in pb-6">
      <div className="relative overflow-hidden rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-5 md:p-7 shadow-sm">
        <div className="absolute right-[-50px] top-[-70px] w-48 h-48 rounded-full bg-sky-200/30 blur-2xl" />
        <div className="absolute right-16 bottom-[-80px] w-56 h-56 rounded-full bg-emerald-200/30 blur-2xl" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/80 border border-sky-100 px-3 py-1 text-[12px] font-medium text-sky-700 shadow-sm">
              <CloudSun className="w-3.5 h-3.5" /> Station VEVOR YT60234
            </div>
            <h1 className="mt-4 text-2xl md:text-3xl font-semibold tracking-tight text-stone-950">Météo de la ferme</h1>
            <div className="mt-2 inline-flex items-center gap-2 text-sm text-stone-600">
              <span className={[
                "h-2 w-2 rounded-full",
                freshTone === "green" ? "bg-emerald-500" : freshTone === "amber" ? "bg-amber-500" : "bg-red-500",
              ].join(" ")} />
              Mesuré {freshnessLabel(freshMinutes)}{latest?.timestamp ? ` · ${formatTime(latest.timestamp)}` : ""}
            </div>
          </div>

          <div className="bg-white/85 backdrop-blur border border-white rounded-2xl p-4 min-w-[200px] shadow-sm">
            <p className="text-[12px] text-stone-400">Dernière mesure</p>
            <p className="mt-1 text-xl font-semibold text-stone-900">{formatWeatherValue(latest?.temperatureC, "°C")}</p>
            <button
              onClick={() => importNow("manual")}
              disabled={importing}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-stone-950 px-3 py-2 text-[12px] font-semibold text-white hover:bg-stone-800 disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${importing ? "animate-spin" : ""}`} />
              Importer maintenant
            </button>
            <div className="mt-3 flex items-center gap-2 text-[11px] text-stone-500">
              <span className={`h-2 w-2 rounded-full ${importing ? "bg-amber-400 animate-pulse" : "bg-emerald-500"}`} />
              <span>Auto-refresh toutes les 30 sec</span>
            </div>
          </div>
        </div>
      </div>

      {importError && (
        <ImportErrorNotice
          error={importError}
          latestTimestamp={latest?.timestamp}
          onRetry={() => importNow("manual")}
          retrying={importing}
        />
      )}

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-400">Mesuré (station)</p>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <Kpi label="Température" value={formatWeatherValue(latest?.temperatureC, "°C")} subtitle={`Mini ${formatWeatherValue(stats.temperatureMinC, "°C")} · maxi ${formatWeatherValue(stats.temperatureMaxC, "°C")}`} icon={<Thermometer className="w-4 h-4" />} tone="amber" />
          <Kpi label="Pluie mesurée aujourd'hui" value={formatWeatherValue(stats.rainTodayMm, "mm")} subtitle={`${formatWeatherValue(stats.rain7DaysMm, "mm")} sur 7 jours`} icon={<CloudRain className="w-4 h-4" />} tone="blue" />
          <Kpi label="Vent" value={formatWeatherValue(latest?.windSpeedKmh, "km/h")} subtitle={`Rafale ${formatWeatherValue(latest?.windGustKmh, "km/h")} · ${getWindDirectionLabel(latest?.windDirectionDeg)}`} icon={<Wind className="w-4 h-4" />} tone="stone" />
          <Kpi label="Jours secs" value={`${stats.dryDays}`} subtitle="depuis pluie > 0,2 mm" icon={<CalendarDays className="w-4 h-4" />} tone="green" />
        </div>
      </div>

      <RainForecastCard status={forecastStatus} forecast={forecast} error={forecastError} />

      <details className="group rounded-2xl border border-stone-200 bg-white p-5 open:pb-6">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <span className="text-[15px] font-semibold text-stone-900">Historique & détails</span>
          <span className="text-xs font-semibold text-stone-400 group-open:hidden">Afficher</span>
          <span className="hidden text-xs font-semibold text-stone-400 group-open:inline">Masquer</span>
        </summary>

        <div className="mt-5 space-y-5">
          <div className={`rounded-2xl border p-5 shadow-sm ${atmosphere.tone}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-70">Situation atmosphérique</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">{atmosphere.label}</h2>
                <p className="mt-1 text-sm opacity-80">{atmosphere.detail}</p>
              </div>
              <CloudSun className="h-8 w-8 opacity-80" />
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <WindCompass reading={latest} />
            <div className="xl:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
              <GaugeBar label="Indice UV" value={latest?.uvIndex} unit="" level={uvLevel} />
              <GaugeBar label="Rayonnement solaire" value={latest?.solarRadiationWm2} unit="W/m²" level={solarLevel} />
              <Kpi label="Pluie instantanée" value={formatWeatherValue(latest?.rainRateMmH, "mm/h")} subtitle={`Cumul station ${formatWeatherValue(latest?.rainTotalMm, "mm")}`} icon={<CloudRain className="w-4 h-4" />} tone="blue" />
              <Kpi label="Ressenti" value={formatWeatherValue(latest?.heatIndexC ?? latest?.windChillC, "°C")} subtitle={`Point de rosée ${formatWeatherValue(latest?.dewPointC, "°C")}`} icon={<Thermometer className="w-4 h-4" />} tone="amber" />
            </div>
          </div>

          <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
            <h2 className="text-[15px] font-semibold text-stone-900">Conditions actuelles</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3"><span className="text-sm text-stone-500 flex items-center gap-2"><Droplets className="w-4 h-4" /> Humidité</span><span className="font-semibold text-stone-900">{formatWeatherValue(latest?.humidityPct, "%", 0)}</span></div>
              <div className="flex items-center justify-between border-b border-stone-100 pb-3"><span className="text-sm text-stone-500 flex items-center gap-2"><Gauge className="w-4 h-4" /> Pression</span><span className="font-semibold text-stone-900">{formatWeatherValue(latest?.pressureHpa, "hPa", 0)}</span></div>
              <div className="flex items-center justify-between border-b border-stone-100 pb-3 sm:border-b-0"><span className="text-sm text-stone-500">Point de rosée</span><span className="font-semibold text-stone-900">{formatWeatherValue(latest?.dewPointC, "°C")}</span></div>
              <div className="flex items-center justify-between"><span className="text-sm text-stone-500">Enregistrements</span><span className="font-semibold text-stone-900">{stats.count}</span></div>
            </div>
          </div>

          <HourlyStrip readings={readings} />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
              <div className="mb-4">
                <h2 className="text-[15px] font-semibold text-stone-900">Température sur 45 jours</h2>
                <p className="text-[12px] text-stone-400">moyenne, minimum et maximum par jour</p>
              </div>
              {daily.length < 2 ? (
                <EmptyChartNotice text="Données insuffisantes pour ce graphique." />
              ) : (
                <div className="h-[260px]">
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
                </div>
              )}
            </div>

            <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
              <div className="mb-4">
                <h2 className="text-[15px] font-semibold text-stone-900">Pluie réelle par jour</h2>
                <p className="text-[12px] text-stone-400">utile pour foin, pâturage et décisions terrain</p>
              </div>
              {daily.length < 2 ? (
                <EmptyChartNotice text="Pas encore assez de données." />
              ) : (
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={daily} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                      <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={{ fontSize: 11, fill: "#78716c" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#78716c" }} unit="mm" />
                      <Tooltip labelFormatter={(label) => formatDateLabel(String(label))} formatter={(value) => [`${Number(value).toFixed(1)} mm`, "Pluie"]} />
                      <Bar dataKey="rainMm" radius={[6, 6, 0, 0]} fill="#38bdf8" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm xl:col-span-2">
              <div className="mb-4">
                <h2 className="text-[15px] font-semibold text-stone-900">Vent max par jour</h2>
                <p className="text-[12px] text-stone-400">rafales ou vitesse max observée</p>
              </div>
              {daily.length < 2 ? (
                <EmptyChartNotice text="Pas encore assez de données." />
              ) : (
                <div className="h-[240px]">
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
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Kpi label="Pluie 30 jours" value={formatWeatherValue(stats.rain30DaysMm, "mm")} icon={<CloudRain className="w-4 h-4" />} tone="blue" />
            <Kpi label="Pluie année" value={formatWeatherValue(stats.rainYearMm, "mm")} icon={<CloudRain className="w-4 h-4" />} tone="green" />
            <Kpi label="Humidité moyenne" value={formatWeatherValue(stats.humidityAvgPct, "%", 0)} icon={<Droplets className="w-4 h-4" />} tone="stone" />
          </div>
        </div>
      </details>
    </div>
  );
}
