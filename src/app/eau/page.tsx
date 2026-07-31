"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  CircleStop,
  Clock3,
  CloudRain,
  Droplets,
  Gauge,
  Loader2,
  Power,
  Settings2,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  Waves,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { ref, onValue, push, set, update, serverTimestamp } from "firebase/database";
import { database } from "@/lib/firebase";
import { useToast } from "@/components/Toast";
import type { AutoIrrigationConfig, IrrigationPlan, QualityMode, ZoneConfig, ZoneMoistureState } from "@/lib/irrigationScheduler";
import { DEFAULT_AUTO_IRRIGATION_CONFIG, QUALITY_THRESHOLDS, formatPlanStatus, formatLocalTime } from "@/lib/irrigationScheduler";

type HaEntity = {
  entity_id: string;
  state: string;
  attributes?: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
};

type IrrigationResponse = {
  ok: boolean;
  error?: string;
  updatedAt?: string;
  entities?: Record<string, HaEntity>;
};

type PlanStatusTone = "blue" | "green" | "amber" | "red" | "stone";

const AUTO_SCHEDULE_CONFIG_PATH = "irrigation-ha/auto-schedule/config";
const AUTO_SCHEDULE_PLANS_PATH = "irrigation-ha/auto-schedule/plans";

const QUALITY_LABELS: Record<QualityMode, string> = {
  eco: "Éco",
  passable: "Passable",
  correct: "Correct",
  green: "Vert",
  manual: "Manuel",
};

const QUALITY_HELP: Record<QualityMode, string> = {
  eco: "gazon vivant, peu d’eau",
  passable: "jaunissement accepté",
  correct: "plus régulier",
  green: "plus vert, plus gourmand",
  manual: "seuil/cible personnalisés",
};

const toneClasses: Record<PlanStatusTone, string> = {
  blue: "bg-sky-50 text-sky-700 ring-sky-100",
  green: "bg-brand-50 text-brand-700 ring-brand-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  red: "bg-red-50 text-red-700 ring-red-100",
  stone: "bg-stone-100 text-stone-600 ring-stone-200",
};

const fmtNumber = (value: unknown, digits = 1) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString("fr-FR", { maximumFractionDigits: digits });
};

function stateOf(entities: Record<string, HaEntity> | undefined, id: string) {
  return entities?.[id]?.state ?? entities?.[id.replaceAll(".", "__dot__")]?.state ?? "unavailable";
}

function entityOf(entities: Record<string, HaEntity> | undefined, id: string) {
  return entities?.[id] ?? entities?.[id.replaceAll(".", "__dot__")];
}

function isOn(entities: Record<string, HaEntity> | undefined, id: string) {
  return stateOf(entities, id) === "on";
}

function elapsedLabel(since: string | undefined, now: Date) {
  if (!since) return "—";
  const startedAt = new Date(since).getTime();
  const seconds = Math.max(0, Math.floor((now.getTime() - startedAt) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes <= 0) return `${rest}s`;
  return `${minutes}min ${rest.toString().padStart(2, "0")}s`;
}

function planStatusTone(status: string | undefined): PlanStatusTone {
  switch (status) {
    case "scheduled": return "blue";
    case "executing":
    case "done": return "green";
    case "skipped": return "amber";
    case "error": return "red";
    default: return "stone";
  }
}

function mergeConfig(config: AutoIrrigationConfig | null): AutoIrrigationConfig {
  const zones = DEFAULT_AUTO_IRRIGATION_CONFIG.zones.map((fallback) => ({
    ...fallback,
    ...(config?.zones?.find((z) => z.zone === fallback.zone) ?? {}),
  }));
  return {
    ...DEFAULT_AUTO_IRRIGATION_CONFIG,
    ...(config ?? {}),
    zones,
  };
}

function getActiveValve(entities: Record<string, HaEntity> | undefined) {
  const valve1 = entityOf(entities, "switch.sous_station_bat_a_electrovanne_1");
  const valve2 = entityOf(entities, "switch.sous_station_bat_a_electrovanne_2");
  if (valve1?.state === "on") return { zone: 1 as const, valve: valve1 };
  if (valve2?.state === "on") return { zone: 2 as const, valve: valve2 };
  return null;
}

function MetricCard({ label, value, suffix, icon: Icon, tone = "green" }: {
  label: string;
  value: string;
  suffix?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "green" | "blue" | "amber" | "dark";
}) {
  const toneClass = {
    green: "bg-brand-50 text-brand-700 ring-brand-100",
    blue: "bg-sky-50 text-sky-700 ring-sky-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    dark: "bg-stone-900 text-white ring-stone-800",
  }[tone];

  return (
    <div className="rounded-3xl border border-stone-200/80 bg-white p-4 shadow-sm">
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-2xl ring-1 ${toneClass}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-3 text-xs font-semibold text-stone-500">{label}</p>
      <p className="mt-1 text-xl font-black tracking-tight text-stone-950">
        {value}{suffix && <span className="ml-1 text-xs font-bold text-stone-500">{suffix}</span>}
      </p>
    </div>
  );
}

function MetricSmall({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-200/70">
      <p className="text-xs font-bold uppercase tracking-wide text-stone-400">{label}</p>
      <p className="mt-1 text-lg font-black tracking-tight text-stone-950">{value}</p>
    </div>
  );
}

function QualityModeSelector({ zone, disabled, onChange }: {
  zone: ZoneConfig;
  disabled: boolean;
  onChange: (mode: QualityMode) => void;
}) {
  const mode = zone.qualityMode ?? "passable";
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {(Object.keys(QUALITY_LABELS) as QualityMode[]).map((key) => (
        <button
          key={key}
          disabled={disabled}
          onClick={() => onChange(key)}
          className={[
            "min-h-11 rounded-2xl px-3 py-2 text-left text-xs font-black ring-1 transition active:scale-[0.98] disabled:cursor-wait disabled:opacity-60",
            mode === key
              ? "bg-stone-950 text-white ring-stone-950"
              : "bg-white text-stone-600 ring-stone-200 hover:bg-stone-50",
          ].join(" ")}
        >
          <span className="block">{QUALITY_LABELS[key]}</span>
          <span className="mt-0.5 block text-[10px] font-semibold opacity-70">{QUALITY_HELP[key]}</span>
        </button>
      ))}
    </div>
  );
}

function MoistureBar({ state }: { state?: ZoneMoistureState }) {
  const pct = Math.max(0, Math.min(100, state?.estimatedHumidityPct ?? 0));
  const decision = state?.decision;
  const color = decision === "irrigate" ? "bg-amber-500" : decision === "wait" ? "bg-brand-600" : "bg-stone-300";
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-stone-400">Humidité estimée</p>
          <p className="mt-1 text-2xl font-black tracking-tight text-stone-950">{state ? `${pct}%` : "—"}</p>
        </div>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-stone-100 ring-1 ring-stone-200">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function NextActionCard({
  bridgeOk,
  bridgeError,
  activeValve,
  now,
  config,
  plan,
  onStop,
}: {
  bridgeOk: boolean;
  bridgeError?: string;
  activeValve: { zone: 1 | 2; valve: HaEntity } | null;
  now: Date;
  config: AutoIrrigationConfig;
  plan: IrrigationPlan | null;
  onStop: () => void;
}) {
  let title: string;
  let reason: string;
  let tone: PlanStatusTone;
  let timeBlock: { label: string; value: string }[] = [];

  if (!bridgeOk) {
    title = "Bridge Home Assistant indisponible";
    reason = bridgeError ?? "L’app ne reçoit plus de statut du bridge local.";
    tone = "red";
  } else if (activeValve) {
    title = `Arrosage en cours — Zone ${activeValve.zone}`;
    reason = `Depuis ${elapsedLabel(activeValve.valve.last_changed, now)}`;
    tone = "green";
  } else if (config.enabled && plan) {
    title = formatPlanStatus(plan.status);
    reason = plan.reason;
    tone = planStatusTone(plan.status);
    if (plan.startAt) {
      timeBlock = [
        { label: "Départ", value: formatLocalTime(plan.startAt) },
        { label: "Fin max", value: formatLocalTime(plan.endAt) },
      ];
    }
  } else if (!config.enabled) {
    title = "Automatique désactivé";
    reason = "Active l’automatique (dans Réglages) pour générer un plan depuis les mesures météo.";
    tone = "stone";
  } else {
    title = "Calcul en attente";
    reason = "Le bridge recalculera le prochain plan au prochain cycle.";
    tone = "blue";
  }

  const toneClass = toneClasses[tone];

  return (
    <section className={`rounded-[2rem] border p-5 shadow-sm sm:p-6 ring-1 ${toneClass} border-transparent`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-black uppercase tracking-wide opacity-70">Prochaine action</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed opacity-90">{reason}</p>
        </div>
        {timeBlock.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:min-w-56">
            {timeBlock.map((item) => (
              <div key={item.label} className="rounded-2xl bg-white/60 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide opacity-60">{item.label}</p>
                <p className="mt-1 text-lg font-black">{item.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {plan && bridgeOk && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold opacity-70">
          <CloudRain className="h-4 w-4" />
          Pluie récente mesurée (prise en compte) : {plan.rainMeasuredMm.toFixed(1)} mm
        </div>
      )}

      <button
        onClick={onStop}
        className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 text-sm font-black text-white shadow-lg shadow-red-200 transition hover:bg-red-700 active:scale-[0.98] sm:w-auto"
      >
        <CircleStop className="h-4 w-4" />
        Arrêt total
      </button>
    </section>
  );
}

function ZoneCompactCard({ zone, state }: { zone: ZoneConfig; state?: ZoneMoistureState }) {
  const mode = zone.qualityMode ?? "passable";
  return (
    <article className="rounded-3xl border border-stone-200 bg-white p-4 ring-1 ring-white sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-stone-400">Zone {zone.zone}</p>
          <h3 className="mt-1 text-lg font-black tracking-tight text-stone-950">{zone.zone === 1 ? "Terrain de volley" : "La butte"}</h3>
          <p className="mt-1 text-xs text-stone-500">Mode {QUALITY_LABELS[mode]}</p>
        </div>
        <span className={[
          "rounded-full px-3 py-1.5 text-xs font-black",
          state?.decision === "irrigate" ? "bg-amber-100 text-amber-800" : state?.decision === "wait" ? "bg-brand-100 text-brand-800" : "bg-stone-200 text-stone-600",
        ].join(" ")}>{state?.decision === "irrigate" ? "À arroser" : state?.decision === "wait" ? "Attendre" : "Estimée"}</span>
      </div>
      <div className="mt-4">
        <MoistureBar state={state} />
      </div>
    </article>
  );
}

function SettingsSection({
  config,
  plan,
  onQualityChange,
  updatingZone,
  entities,
}: {
  config: AutoIrrigationConfig;
  plan: IrrigationPlan | null;
  onQualityChange: (zone: 1 | 2, mode: QualityMode) => void;
  updatingZone: number | null;
  entities?: Record<string, HaEntity>;
}) {
  const zoneStates = new Map((plan?.zoneStates ?? []).map((z) => [z.zone, z]));

  return (
    <div className="mt-5 space-y-6">
      {config.lastError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-relaxed text-red-800">
          <strong>Planification bloquée.</strong>
          <span className="mt-1 block font-mono text-xs">{config.lastError}</span>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <MetricSmall label="Fenêtre" value={`${config.windowStartHour}h → ${config.windowEndHour}h`} />
        <MetricSmall label="Pluie blocante" value={`${config.rainThresholdMm ?? 15} mm utiles / 7j`} />
        <MetricSmall label="Cycle minimum" value={`${Math.min(...config.zones.map((z) => z.minRunMinutes ?? 45))} min / zone`} />
        <MetricSmall label="Pompe estimée" value="1 200 W · 0,20 €/kWh" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {config.zones.map((zone) => {
          const state = zoneStates.get(zone.zone);
          const mode = zone.qualityMode ?? "passable";
          const thresholds = mode === "manual"
            ? { triggerPct: zone.triggerPct ?? QUALITY_THRESHOLDS.manual.triggerPct, targetPct: zone.targetPct ?? QUALITY_THRESHOLDS.manual.targetPct }
            : QUALITY_THRESHOLDS[mode];
          const plannedZone = plan?.zones?.find((z) => z.zone === zone.zone);
          return (
            <article key={zone.zone} className="rounded-3xl border border-stone-200 bg-stone-50 p-4 ring-1 ring-white">
              <p className="text-xs font-bold uppercase tracking-wide text-stone-400">Zone {zone.zone} — seuil {thresholds.triggerPct}% → cible {thresholds.targetPct}%</p>
              <div className="mt-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-400">Qualité souhaitée</p>
                <QualityModeSelector
                  zone={zone}
                  disabled={updatingZone === zone.zone}
                  onChange={(next) => onQualityChange(zone.zone, next)}
                />
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <MetricSmall label="Débit estimé" value={`${zone.irrigationDepthMmPerHour ?? 5} mm/h`} />
                <MetricSmall label="Réserve sol" value={`${zone.soilCapacityMm ?? 35} mm`} />
                <MetricSmall label="Cycle prévu" value={plannedZone ? `${plannedZone.durationMinutes} min` : state?.plannedDurationMinutes ? `${state.plannedDurationMinutes} min` : "0 min"} />
              </div>
            </article>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-3xl border border-stone-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-black tracking-tight text-stone-950">Source & cuve</h3>
            <Waves className="h-5 w-5 text-sky-600" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MetricSmall label="Pression réseau" value={`${fmtNumber(stateOf(entities, "sensor.sous_station_bat_a_pression_reseau"), 2)} bar`} />
            <MetricSmall label="Cuve" value={`${fmtNumber(stateOf(entities, "sensor.sous_station_bat_a_remplissage_cuve"), 0)} %`} />
            <MetricSmall label="Volume" value={`${fmtNumber(stateOf(entities, "sensor.sous_station_bat_a_volume_cuve"), 0)} L`} />
            <MetricSmall label="Température" value={`${fmtNumber(stateOf(entities, "sensor.sous_station_bat_a_temperature_cuve"), 1)} °C`} />
          </div>
        </div>
        <div className="rounded-3xl border border-stone-200 bg-white p-5">
          <h3 className="text-base font-black tracking-tight text-stone-950">Coût pompe</h3>
          <p className="mt-1 text-xs text-stone-500">Kärcher BP 7 : estimation 1 200 W, prix prudent 0,20 €/kWh.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MetricSmall label="Puissance pompe HA" value={`${fmtNumber(stateOf(entities, "input_number.arrosage_pompe_puissance_w"), 0)} W`} />
            <MetricSmall label="Prix électricité HA" value={`${fmtNumber(stateOf(entities, "input_number.arrosage_prix_kwh"), 3)} €/kWh`} />
            <MetricSmall label="1h pompe" value="≈ 0,24 €" />
            <MetricSmall label="4h pompe" value="≈ 0,96 €" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ManualSection({
  entities,
  refreshing,
  now,
  duration,
  zone,
  onDurationChange,
  onZoneChange,
  onRun,
}: {
  entities?: Record<string, HaEntity>;
  refreshing: boolean;
  now: Date;
  duration: number;
  zone: 1 | 2;
  onDurationChange: (duration: number) => void;
  onZoneChange: (zone: 1 | 2) => void;
  onRun: () => void;
}) {
  const activeValve = getActiveValve(entities);

  return (
    <div className="mt-5 space-y-5">
      <div className="grid grid-cols-2 gap-2">
        {[1, 2].map((z) => (
          <button
            key={z}
            onClick={() => onZoneChange(z as 1 | 2)}
            className={[
              "min-h-11 rounded-2xl px-4 text-sm font-black ring-1 transition active:scale-[0.98]",
              zone === z ? "bg-stone-950 text-white ring-stone-950" : "bg-stone-50 text-stone-600 ring-stone-200 hover:bg-stone-100",
            ].join(" ")}
          >
            Zone {z}
          </button>
        ))}
      </div>

      <div className="rounded-3xl bg-stone-50 p-4 ring-1 ring-stone-200/70">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-stone-400">Durée manuelle</p>
            <p className="mt-1 text-3xl font-black tracking-tight text-stone-950">{duration} min</p>
          </div>
          <p className="pb-1 text-xs font-semibold text-stone-500">5 → 240 min</p>
        </div>
        <input
          type="range"
          min={5}
          max={240}
          step={5}
          value={duration}
          onChange={(event) => onDurationChange(Number(event.target.value))}
          className="mt-4 w-full accent-stone-950"
          aria-label="Durée d'arrosage manuel"
        />
        <div className="mt-3 grid grid-cols-4 gap-2">
          {[30, 60, 120, 180].map((preset) => (
            <button key={preset} onClick={() => onDurationChange(preset)} className="min-h-10 rounded-xl bg-white text-xs font-black text-stone-600 ring-1 ring-stone-200 active:scale-[0.98]">
              {preset}m
            </button>
          ))}
        </div>
      </div>

      <button
        disabled={refreshing}
        onClick={onRun}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-700 px-4 text-sm font-black text-white shadow-lg shadow-brand-200 transition hover:bg-brand-800 active:scale-[0.98] disabled:cursor-wait disabled:bg-stone-300"
      >
        {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
        Lancer zone {zone}
      </button>

      <div className="rounded-2xl bg-stone-950 p-4 text-sm text-white">
        <div className="flex items-center gap-2 font-black"><ShieldCheck className="h-4 w-4" /> Sécurité HA active</div>
        <p className="mt-2 text-stone-300">Une seule vanne à la fois. Pompe coupée automatiquement si aucune vanne n’est ouverte.</p>
        <p className="mt-3 font-semibold text-stone-200">
          {activeValve ? `Zone ${activeValve.zone} en cours depuis ${elapsedLabel(activeValve.valve.last_changed, now)}` : "Aucune vanne ouverte"}
        </p>
      </div>
    </div>
  );
}

export default function EauPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<IrrigationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [autoConfig, setAutoConfig] = useState<AutoIrrigationConfig | null>(null);
  const [todayPlan, setTodayPlan] = useState<IrrigationPlan | null>(null);
  const [toggling, setToggling] = useState(false);
  const [updatingZone, setUpdatingZone] = useState<number | null>(null);
  const [manualZone, setManualZone] = useState<1 | 2>(1);
  const [manualDuration, setManualDuration] = useState(60);

  const config = useMemo(() => mergeConfig(autoConfig), [autoConfig]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 10000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const cfgRef = ref(database, AUTO_SCHEDULE_CONFIG_PATH);
    return onValue(cfgRef, (snap) => setAutoConfig(snap.val() as AutoIrrigationConfig | null));
  }, []);

  useEffect(() => {
    const endHour = config.windowEndHour ?? 6;
    const h = now.getHours();
    const morningDate = h < endHour
      ? now.toLocaleDateString("fr-CA")
      : new Date(now.getTime() + 86400000).toLocaleDateString("fr-CA");
    const planRef = ref(database, `${AUTO_SCHEDULE_PLANS_PATH}/${morningDate}`);
    return onValue(planRef, (snap) => setTodayPlan(snap.val() as IrrigationPlan | null));
  }, [config.windowEndHour, now]);

  useEffect(() => {
    const statusRef = ref(database, "irrigation-ha/status/current");
    const unsubscribe = onValue(
      statusRef,
      (snapshot) => {
        const value = snapshot.val() as IrrigationResponse | null;
        setData(value ?? { ok: false, error: "Aucun statut bridge reçu" });
        setLoading(false);
        setRefreshing(false);
      },
      (error) => {
        setData({ ok: false, error: error.message });
        setLoading(false);
        setRefreshing(false);
      },
    );
    return () => unsubscribe();
  }, []);

  async function action(body: Record<string, unknown>, success: string) {
    setRefreshing(true);
    try {
      const commandRef = push(ref(database, "irrigation-ha/commands"));
      await set(commandRef, {
        ...body,
        status: "pending",
        requestedAt: new Date().toISOString(),
        requestedAtServer: serverTimestamp(),
      });
      showToast({ type: "success", title: success, message: "Commande envoyée au bridge local" });
      window.setTimeout(() => setRefreshing(false), 3000);
    } catch (error) {
      showToast({ type: "error", title: "Action impossible", message: error instanceof Error ? error.message : undefined });
      setRefreshing(false);
    }
  }

  async function handleToggleAutoSchedule() {
    setToggling(true);
    try {
      await update(ref(database, AUTO_SCHEDULE_CONFIG_PATH), { ...config, enabled: !config.enabled });
      showToast({
        type: "success",
        title: config.enabled ? "Arrosage auto désactivé" : "Arrosage auto activé",
        message: config.enabled ? "Le bridge ne programmera plus d’arrosage nocturne automatique." : "Le bridge calculera les cycles profonds selon l’humidité estimée.",
      });
    } catch (err) {
      showToast({ type: "error", title: "Impossible de modifier la config", message: (err as Error).message });
    } finally {
      setToggling(false);
    }
  }

  async function handleQualityChange(zoneId: 1 | 2, mode: QualityMode) {
    setUpdatingZone(zoneId);
    try {
      const nextZones = config.zones.map((zone) => zone.zone === zoneId ? { ...zone, qualityMode: mode } : zone);
      await update(ref(database, AUTO_SCHEDULE_CONFIG_PATH), { ...config, zones: nextZones });
      showToast({ type: "success", title: `Zone ${zoneId} réglée`, message: `Niveau ${QUALITY_LABELS[mode]} appliqué.` });
    } catch (err) {
      showToast({ type: "error", title: "Réglage impossible", message: (err as Error).message });
    } finally {
      setUpdatingZone(null);
    }
  }

  const entities = data?.entities;
  const pumpOn = isOn(entities, "switch.sous_station_bat_a_pompe");
  const activeValve = getActiveValve(entities);
  const totalMm = useMemo(() => {
    const v1 = Number(stateOf(entities, "sensor.arrosage_vanne_1_mm_aujourd_hui")) || 0;
    const v2 = Number(stateOf(entities, "sensor.arrosage_vanne_2_mm_aujourd_hui")) || 0;
    return v1 + v2;
  }, [entities]);
  const zoneStates = new Map((todayPlan?.zoneStates ?? []).map((z) => [z.zone, z]));

  return (
    <div className="min-h-full -m-4 bg-[radial-gradient(circle_at_top_left,#dcfce7_0,transparent_34rem),linear-gradient(180deg,#f8faf7,#eef4ec)] p-4 sm:-m-6 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-black text-brand-700 ring-1 ring-brand-100">
            <span className={pumpOn ? "h-2 w-2 rounded-full bg-brand-500" : "h-2 w-2 rounded-full bg-stone-300"} />
            HA {data?.ok ? "connecté" : "à connecter"}
          </div>
          <Link href="/meteo" className="text-xs font-bold text-sky-700 underline-offset-2 hover:underline">
            Météo & prévisions 7 jours →
          </Link>
        </div>

        {!data?.ok && !loading && (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <strong>Bridge local Home Assistant indisponible.</strong>
            <p className="mt-1">L’app Ferme lit Firebase. Le bridge local doit tourner pour synchroniser Home Assistant.</p>
            {data?.error && <p className="mt-2 font-mono text-xs">{data.error}</p>}
          </div>
        )}

        <NextActionCard
          bridgeOk={!!data?.ok}
          bridgeError={data?.error}
          activeValve={activeValve}
          now={now}
          config={config}
          plan={todayPlan}
          onStop={() => action({ action: "stop_all" }, "Arrêt total envoyé")}
        />

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Eau apportée par arrosage" value={fmtNumber(totalMm)} suffix="mm" icon={Droplets} tone="blue" />
          <MetricCard label="Pompe" value={pumpOn ? "ON" : "OFF"} icon={Zap} tone={pumpOn ? "green" : "dark"} />
          <MetricCard label="Temps pompe" value={fmtNumber(stateOf(entities, "sensor.arrosage_pompe_temps_aujourd_hui"), 2)} suffix="h" icon={Clock3} tone="green" />
          <MetricCard label="Coût estimé" value={fmtNumber(stateOf(entities, "sensor.arrosage_cout_aujourd_hui"), 2)} suffix="€" icon={Gauge} tone="amber" />
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          {config.zones.map((zone) => (
            <ZoneCompactCard key={zone.zone} zone={zone} state={zoneStates.get(zone.zone)} />
          ))}
        </section>

        <div className="flex items-center justify-between rounded-3xl border border-stone-200 bg-white p-4">
          <div>
            <p className="text-sm font-black text-stone-950">Arrosage automatique intelligent</p>
            <p className="text-xs text-stone-500">Décision par zone, pluie réelle, cycles longs — pas de petits cycles systématiques.</p>
          </div>
          <button
            onClick={handleToggleAutoSchedule}
            disabled={toggling}
            className={[
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black transition active:scale-[0.98] disabled:cursor-wait disabled:opacity-60",
              config.enabled ? "bg-brand-700 text-white hover:bg-brand-800" : "bg-stone-950 text-white hover:bg-stone-800",
            ].join(" ")}
          >
            {toggling ? <Loader2 className="h-4 w-4 animate-spin" /> : config.enabled ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
            {config.enabled ? "Activé" : "Activer"}
          </button>
        </div>

        <details className="group rounded-3xl border border-stone-200 bg-white p-5 open:pb-6">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-base font-black tracking-tight text-stone-950">
              <Power className="h-4 w-4 text-stone-400" /> Manuel rapide
            </span>
            <span className="text-xs font-bold text-stone-400 group-open:hidden">Afficher</span>
            <span className="hidden text-xs font-bold text-stone-400 group-open:inline">Masquer</span>
          </summary>
          <ManualSection
            entities={entities}
            refreshing={refreshing}
            now={now}
            zone={manualZone}
            duration={manualDuration}
            onZoneChange={setManualZone}
            onDurationChange={setManualDuration}
            onRun={() => action({ action: "run_zone", zone: manualZone, durationMinutes: manualDuration }, `Vanne ${manualZone} lancée ${manualDuration} min`)}
          />
        </details>

        <details className="group rounded-3xl border border-stone-200 bg-white p-5 open:pb-6">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-base font-black tracking-tight text-stone-950">
              <Settings2 className="h-4 w-4 text-stone-400" /> Réglages
            </span>
            <span className="text-xs font-bold text-stone-400 group-open:hidden">Afficher</span>
            <span className="hidden text-xs font-bold text-stone-400 group-open:inline">Masquer</span>
          </summary>
          <SettingsSection
            config={config}
            plan={todayPlan}
            onQualityChange={handleQualityChange}
            updatingZone={updatingZone}
            entities={entities}
          />
        </details>
      </div>
    </div>
  );
}
