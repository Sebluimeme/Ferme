"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CircleStop,
  Clock3,
  Droplets,
  Gauge,
  Leaf,
  Loader2,
  Plus,
  Power,
  RefreshCw,
  ShieldCheck,
  Waves,
  Zap,
} from "lucide-react";
import { useToast } from "@/components/Toast";

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

const DAYS = [
  ["lundi", "L"],
  ["mardi", "M"],
  ["mercredi", "M"],
  ["jeudi", "J"],
  ["vendredi", "V"],
  ["samedi", "S"],
  ["dimanche", "D"],
] as const;

const fmtNumber = (value: unknown, digits = 1) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString("fr-FR", { maximumFractionDigits: digits });
};

function stateOf(entities: Record<string, HaEntity> | undefined, id: string) {
  return entities?.[id]?.state ?? "unavailable";
}

function isOn(entities: Record<string, HaEntity> | undefined, id: string) {
  return stateOf(entities, id) === "on";
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
    <div className="relative overflow-hidden rounded-3xl border border-stone-200/80 bg-white p-5 shadow-sm">
      <div className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ring-1 ${toneClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-5 text-sm font-semibold text-stone-500">{label}</p>
      <p className="mt-1 text-3xl font-black tracking-tight text-stone-950">
        {value}{suffix && <span className="ml-1 text-base font-bold text-stone-500">{suffix}</span>}
      </p>
      <div className="absolute -bottom-10 -right-8 h-28 w-28 rounded-full bg-brand-50" />
    </div>
  );
}

function ZoneCard({
  zone,
  title,
  subtitle,
  entities,
  refreshing,
  onRun,
}: {
  zone: 1 | 2;
  title: string;
  subtitle: string;
  entities?: Record<string, HaEntity>;
  refreshing: boolean;
  onRun: (zone: 1 | 2, duration: number) => void;
}) {
  const valveId = `switch.sous_station_bat_a_electrovanne_${zone}`;
  const activeId = `input_boolean.arrosage_vanne_${zone}_actif`;
  const timeId = `input_datetime.arrosage_vanne_${zone}_heure`;
  const durationId = `input_number.arrosage_vanne_${zone}_duree`;
  const mmId = `sensor.arrosage_vanne_${zone}_mm_aujourd_hui`;
  const duration = Math.max(1, Math.round(Number(stateOf(entities, durationId)) || 1));

  return (
    <article className="rounded-[2rem] border border-stone-200 bg-white p-5 shadow-sm transition-all hover:border-brand-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className={[
            "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg",
            zone === 1 ? "bg-gradient-to-br from-sky-500 to-blue-700 shadow-sky-200" : "bg-gradient-to-br from-brand-400 to-brand-700 shadow-brand-200",
          ].join(" ")}>
            {zone === 1 ? <Droplets className="h-7 w-7" /> : <Leaf className="h-7 w-7" />}
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight text-stone-950">{title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-stone-500">{subtitle}</p>
          </div>
        </div>
        <span className={[
          "rounded-full px-3 py-1.5 text-xs font-black",
          isOn(entities, activeId) ? "bg-brand-50 text-brand-700" : "bg-stone-100 text-stone-500",
        ].join(" ")}>{isOn(entities, activeId) ? "Programmée" : "Inactive"}</span>
      </div>

      <div className="mt-5 rounded-3xl bg-stone-50 p-4 ring-1 ring-stone-200/70">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-stone-400">Départ</p>
            <p className="mt-1 text-lg font-black text-stone-950">{stateOf(entities, timeId).slice(0, 5)}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-stone-400">Durée</p>
            <p className="mt-1 text-lg font-black text-stone-950">{duration} min</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-stone-400">Aujourd’hui</p>
            <p className="mt-1 text-lg font-black text-sky-700">{fmtNumber(stateOf(entities, mmId))} mm</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {DAYS.map(([day, label]) => {
            const on = isOn(entities, `input_boolean.arrosage_vanne_${zone}_${day}`);
            return (
              <span key={day} className={[
                "grid h-8 w-8 place-items-center rounded-xl text-xs font-black ring-1",
                on ? "bg-brand-700 text-white ring-brand-700" : "bg-white text-stone-400 ring-stone-200",
              ].join(" ")}>{label}</span>
            );
          })}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-stone-500">
          <span className={[
            "h-2.5 w-2.5 rounded-full",
            isOn(entities, valveId) ? "bg-brand-500 shadow-[0_0_0_6px_rgba(51,147,94,.12)]" : "bg-stone-300",
          ].join(" ")} />
          {isOn(entities, valveId) ? "Vanne ouverte" : "Vanne fermée"}
        </div>
        <button
          disabled={refreshing}
          onClick={() => onRun(zone, duration)}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-stone-950 px-4 text-sm font-black text-white transition-all hover:bg-brand-800 active:scale-[0.98] disabled:cursor-wait disabled:bg-stone-300"
        >
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
          Lancer {duration} min
        </button>
      </div>
    </article>
  );
}

export default function EauPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<IrrigationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    try {
      const response = await fetch("/api/home-assistant/irrigation", { cache: "no-store" });
      const json = await response.json() as IrrigationResponse;
      setData(json);
      if (!json.ok && !silent) showToast({ type: "error", title: "Home Assistant indisponible", message: json.error });
    } catch (error) {
      setData({ ok: false, error: error instanceof Error ? error.message : "Erreur réseau" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(true), 30000);
    return () => window.clearInterval(timer);
  }, []);

  async function action(body: Record<string, unknown>, success: string) {
    setRefreshing(true);
    try {
      const response = await fetch("/api/home-assistant/irrigation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json() as IrrigationResponse;
      if (!response.ok || !json.ok) throw new Error(json.error || "Action refusée");
      showToast({ type: "success", title: success });
      await load(true);
    } catch (error) {
      showToast({ type: "error", title: "Action impossible", message: error instanceof Error ? error.message : undefined });
      setRefreshing(false);
    }
  }

  const entities = data?.entities;
  const pumpOn = isOn(entities, "switch.sous_station_bat_a_pompe");
  const totalMm = useMemo(() => {
    const v1 = Number(stateOf(entities, "sensor.arrosage_vanne_1_mm_aujourd_hui")) || 0;
    const v2 = Number(stateOf(entities, "sensor.arrosage_vanne_2_mm_aujourd_hui")) || 0;
    return v1 + v2;
  }, [entities]);

  return (
    <div className="min-h-full -m-4 bg-[radial-gradient(circle_at_top_left,#dcfce7_0,transparent_34rem),linear-gradient(180deg,#f8faf7,#eef4ec)] p-4 sm:-m-6 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-5 rounded-[2rem] border border-white/70 bg-white/70 p-5 shadow-sm backdrop-blur-xl sm:p-7 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-black text-brand-700 ring-1 ring-brand-100">
              <span className={pumpOn ? "h-2 w-2 rounded-full bg-brand-500" : "h-2 w-2 rounded-full bg-stone-300"} />
              Home Assistant {data?.ok ? "connecté" : "à connecter"}
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-[-0.04em] text-stone-950 sm:text-5xl">Eau & arrosage</h1>
            <p className="mt-3 max-w-3xl text-base leading-relaxed text-stone-600">
              Programmateur visuel par zones, suivi du temps d’activation, estimation en mm et coût pompe. Les vannes sont verrouillées : une seule zone à la fois, pompe toujours active pendant l’arrosage.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setRefreshing(true); load(true); }}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 text-sm font-black text-stone-800 shadow-sm transition hover:border-brand-200"
            >
              <RefreshCw className={refreshing || loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Actualiser
            </button>
            <button
              onClick={() => action({ action: "stop_all" }, "Arrêt total envoyé")}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 text-sm font-black text-white shadow-lg shadow-red-200 transition hover:bg-red-700"
            >
              <CircleStop className="h-4 w-4" />
              Arrêt total
            </button>
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-brand-700 px-4 text-sm font-black text-white shadow-lg shadow-brand-200 transition hover:bg-brand-800"
              title="La V1 utilise les plages Home Assistant actuelles. Les plages multiples seront ajoutées dans la prochaine passe."
            >
              <Plus className="h-4 w-4" />
              Ajouter une plage
            </button>
          </div>
        </header>

        {!data?.ok && !loading && (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <strong>Connexion Home Assistant indisponible depuis ce serveur.</strong>
            <p className="mt-1">Si l’app Ferme tourne sur Vercel, il faudra un tunnel/VPN/URL distante Home Assistant côté serveur. Depuis Hermes local, l’API Home Assistant fonctionne déjà.</p>
            {data?.error && <p className="mt-2 font-mono text-xs">{data.error}</p>}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Pompe" value={pumpOn ? "ON" : "OFF"} icon={Zap} tone={pumpOn ? "green" : "dark"} />
          <MetricCard label="Eau aujourd’hui" value={fmtNumber(totalMm)} suffix="mm" icon={Droplets} tone="blue" />
          <MetricCard label="Temps pompe" value={fmtNumber(stateOf(entities, "sensor.arrosage_pompe_temps_aujourd_hui"), 2)} suffix="h" icon={Clock3} tone="green" />
          <MetricCard label="Coût estimé" value={fmtNumber(stateOf(entities, "sensor.arrosage_cout_aujourd_hui"), 2)} suffix="€" icon={Gauge} tone="amber" />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.35fr_.85fr]">
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black tracking-tight text-stone-950">Programmateur par zones</h2>
                <p className="mt-1 text-sm text-stone-500">Base actuelle : une plage principale par vanne, pilotée par Home Assistant.</p>
              </div>
              <span className="hidden rounded-full bg-white px-3 py-1.5 text-xs font-black text-stone-600 ring-1 ring-stone-200 sm:inline-flex">4h = 20mm</span>
            </div>
            <ZoneCard zone={1} title="Vanne 1 — Zone source" subtitle="Zone indépendante. La pompe démarre avant l’ouverture de la vanne." entities={entities} refreshing={refreshing} onRun={(zone, duration) => action({ action: "run_zone", zone, durationMinutes: duration }, `Vanne ${zone} lancée`)} />
            <ZoneCard zone={2} title="Vanne 2 — Zone pâture" subtitle="Ne peut pas tourner en même temps que la vanne 1." entities={entities} refreshing={refreshing} onRun={(zone, duration) => action({ action: "run_zone", zone, durationMinutes: duration }, `Vanne ${zone} lancée`)} />
          </div>

          <aside className="space-y-5">
            <div className="rounded-[2rem] border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-black tracking-tight text-stone-950">Source & cuve</h2>
                <Waves className="h-5 w-5 text-sky-600" />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <MetricSmall label="Pression réseau" value={`${fmtNumber(stateOf(entities, "sensor.sous_station_bat_a_pression_reseau"), 2)} bar`} />
                <MetricSmall label="Cuve" value={`${fmtNumber(stateOf(entities, "sensor.sous_station_bat_a_remplissage_cuve"), 0)} %`} />
                <MetricSmall label="Volume" value={`${fmtNumber(stateOf(entities, "sensor.sous_station_bat_a_volume_cuve"), 0)} L`} />
                <MetricSmall label="Température" value={`${fmtNumber(stateOf(entities, "sensor.sous_station_bat_a_temperature_cuve"), 1)} °C`} />
              </div>
            </div>

            <div className="rounded-[2rem] bg-stone-950 p-5 text-white shadow-xl shadow-stone-300">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10"><ShieldCheck className="h-5 w-5" /></div>
                <div><h2 className="text-lg font-black">Sécurité système</h2><p className="text-sm text-stone-400">Verrouillages actifs côté Home Assistant</p></div>
              </div>
              <div className="mt-5 space-y-3 text-sm">
                <SafetyRow label="Vannes simultanées" value="Bloquées" />
                <SafetyRow label="Pompe sans vanne" value="Arrêt auto" />
                <SafetyRow label="Commande critique" value="Arrêt total" />
              </div>
            </div>

            <div className="rounded-[2rem] border border-stone-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-black tracking-tight text-stone-950">Réglages coût</h2>
              <div className="mt-4 grid gap-3">
                <MetricSmall label="Puissance pompe" value={`${fmtNumber(stateOf(entities, "input_number.arrosage_pompe_puissance_w"), 0)} W`} />
                <MetricSmall label="Prix électricité" value={`${fmtNumber(stateOf(entities, "input_number.arrosage_prix_kwh"), 3)} €/kWh`} />
              </div>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}

function MetricSmall({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-200/70">
      <p className="text-xs font-bold uppercase tracking-wide text-stone-400">{label}</p>
      <p className="mt-1 text-xl font-black tracking-tight text-stone-950">{value}</p>
    </div>
  );
}

function SafetyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/6 px-3 py-2.5">
      <span className="text-stone-300">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
