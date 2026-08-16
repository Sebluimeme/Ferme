"use client";

import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/store";
import { formatCurrency } from "@/lib/utils";
import { formatAlertMessage } from "@/lib/vehicle-utils";
import { computeWeatherStats, formatWeatherValue, getWindDirectionLabel } from "@/types/weather";
import { getVehicleStats } from "@/services/vehicle-service";
import { getUrgentTasks, getTaskStats, getDaysUntilDue } from "@/services/task-service";
import { getGestationAlert, getHeatAlert, formatGestationDate } from "@/lib/reproduction";
import { groupChaleursByAnimal } from "@/components/HeatAlerts";
import { getAnimalIcon } from "@/lib/utils";
import KpiCard from "@/components/KpiCard";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Animal } from "@/store/store";
import type { CiterneStatus } from "@/lib/citerneEau";
import { formatFreshnessLabel, formatMetricValue, formatRelativeAge } from "@/lib/citerneEau";
import { loadCiterneStatus } from "@/lib/citerneClient";
import {
  PawPrint,
  Truck,
  Wallet,
  ClipboardList,
  Wheat,
  Wrench,
  ChevronRight,
  AlertCircle,
  CloudSun,
  Droplets,
  Waves,
  Wind,
  Thermometer,
  RefreshCw,
} from "lucide-react";

type CiterneSummaryResponse =
  | { ok: true; status: CiterneStatus; updatedAt: string }
  | { ok: false; error: string };

export default function DashboardPage() {
  const router = useRouter();
  const { state } = useAppStore();
  const { stats, alertes, vehicles, maintenanceAlerts, taches, animaux, activitesFourrage, weatherReadings, chaleurs } = state;

  const vehicleStats = useMemo(() => getVehicleStats(vehicles), [vehicles]);
  const urgentTasks  = useMemo(() => getUrgentTasks(taches, 5), [taches]);
  const taskStats    = useMemo(() => getTaskStats(taches), [taches]);
  const allActiveTasks = useMemo(() => taches.filter((t) => t.statut !== "terminee"), [taches]);

  const upcomingHeats = useMemo(() => {
    const chaleursByAnimal = groupChaleursByAnimal(chaleurs);
    return animaux
      .map((animal) => {
        const alert = getHeatAlert(animal, chaleursByAnimal[animal.id] || []);
        return alert ? { animal, alert } : null;
      })
      .filter((x): x is { animal: Animal; alert: NonNullable<ReturnType<typeof getHeatAlert>> } => x !== null)
      .sort((a, b) => a.alert.joursRestants - b.alert.joursRestants)
      .slice(0, 3);
  }, [animaux, chaleurs]);

  const upcomingBirths = useMemo(() => {
    return animaux
      .map((animal) => {
        const alert = getGestationAlert(animal);
        return alert ? { animal, alert } : null;
      })
      .filter((x): x is { animal: Animal; alert: NonNullable<ReturnType<typeof getGestationAlert>> } => x !== null)
      .sort((a, b) => a.alert.joursRestants - b.alert.joursRestants)
      .slice(0, 3);
  }, [animaux]);

  const sortedMaintenanceAlerts = useMemo(
    () => [...maintenanceAlerts].sort((a, b) => (a.urgent === b.urgent ? 0 : a.urgent ? -1 : 1)),
    [maintenanceAlerts]
  );

  const weatherStats = useMemo(() => computeWeatherStats(weatherReadings), [weatherReadings]);
  const latestWeather = weatherStats.latest;

  const [citerne, setCiterne] = useState<CiterneSummaryResponse | null>(null);
  const loadCiterne = useCallback(async () => {
    try {
      const status = await loadCiterneStatus();
      setCiterne({ ok: true, status, updatedAt: new Date().toISOString() });
    } catch (error) {
      setCiterne({ ok: false, error: error instanceof Error ? error.message : "Erreur réseau" });
    }
  }, []);

  useEffect(() => {
    void loadCiterne();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadCiterne();
    };
    const refreshWhenOnline = () => void loadCiterne();
    const timer = window.setInterval(() => void loadCiterne(), 5 * 60 * 1000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("online", refreshWhenOnline);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("online", refreshWhenOnline);
    };
  }, [loadCiterne]);
  const citerneStatus = citerne?.ok ? citerne.status : null;

  const openMaintenanceAlert = (alert: (typeof sortedMaintenanceAlerts)[number]) => {
    const title = (alert.titre || "").toLowerCase();
    const isMeterReadingReminder = !alert.maintenanceId && (title.includes("relevé") || title.includes("releve"));

    if (isMeterReadingReminder) {
      const meter = title.includes("km") && title.includes("heure")
        ? "both"
        : title.includes("heure") && !title.includes("km") && !title.includes("kilom")
          ? "heures"
          : "kilometrage";
      router.push(`/vehicules/${alert.vehicleId}?tab=info&meter=${meter}`);
      return;
    }

    const maintenanceParam = alert.maintenanceId ? `&maintenanceId=${alert.maintenanceId}` : "";
    router.push(`/vehicules/${alert.vehicleId}?tab=entretien&maintenanceAction=complete${maintenanceParam}`);
  };

  const DUREE_STABULATION = 120;

  // Même logique que fourrage/page.tsx : conso selon espèce + âge à la prochaine stabulation
  function getConsoKgJour(type: string, ageMois: number | null): number {
    switch (type) {
      case "bovin":
        if (ageMois === null) return 9;
        if (ageMois < 3)  return 1;
        if (ageMois < 9)  return 3;
        if (ageMois < 18) return 5;
        return 9;
      case "ovin":
        if (ageMois === null) return 2;
        if (ageMois < 3)  return 0.4;
        if (ageMois < 9)  return 1;
        return 2;
      case "caprin":
        if (ageMois === null) return 1.8;
        if (ageMois < 3)  return 0.4;
        if (ageMois < 9)  return 0.9;
        return 1.8;
      case "equin":
        if (ageMois === null) return 10;
        if (ageMois < 6)  return 2;
        if (ageMois < 18) return 5;
        return 10;
      default: return 0;
    }
  }

  function ageMoisAStabulation(dateNaissance: string | undefined): number | null {
    if (!dateNaissance) return null;
    const naissance = new Date(dateNaissance);
    if (isNaN(naissance.getTime())) return null;
    const now = new Date();
    const debutStab = new Date(now.getMonth() < 10 ? now.getFullYear() : now.getFullYear() + 1, 10, 15);
    const diffMs = debutStab.getTime() - naissance.getTime();
    if (diffMs < 0) return 0;
    return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44));
  }

  const objectifFoinTonnes = useMemo(() => {
    const actifs = animaux.filter((a) => a.statut === "actif");
    const kg = actifs.reduce((sum, a) => {
      const age = ageMoisAStabulation(a.dateNaissance);
      return sum + getConsoKgJour(a.type, age) * DUREE_STABULATION;
    }, 0);
    return Math.round(kg / 100) / 10;
  }, [animaux]);

  const foinsRecoltesTonnes = useMemo(() => {
    const annee = new Date().getFullYear().toString();
    return activitesFourrage
      .filter((a) => a.typeActivite === "foin" && a.dateActivite?.startsWith(annee) && (a.poidsTonne ?? 0) > 0)
      .reduce((sum, a) => sum + (a.poidsTonne ?? 0), 0);
  }, [activitesFourrage]);

  const foinPct = objectifFoinTonnes > 0
    ? Math.min(100, Math.round((foinsRecoltesTonnes / objectifFoinTonnes) * 100))
    : 0;

  return (
    <div className="space-y-6 fade-in">

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Animaux"
          value={stats.totalAnimaux || 0}
          subtitle="actifs"
          icon={<PawPrint className="w-3.5 h-3.5" />}
          onClick={() => router.push("/animaux")}
        />
        <KpiCard
          label="Véhicules"
          value={vehicleStats.totalVehicules || 0}
          subtitle="dans le parc"
          icon={<Truck className="w-3.5 h-3.5" />}
          onClick={() => router.push("/vehicules")}
        />
        <KpiCard
          label="Tâches actives"
          value={taskStats.aFaire + taskStats.enCours}
          subtitle={taskStats.enRetard > 0 ? `${taskStats.enRetard} en retard` : "à jour"}
          icon={<ClipboardList className="w-3.5 h-3.5" />}
          onClick={() => router.push("/taches")}
        />
        <KpiCard
          label="Profit global"
          value={formatCurrency(stats.profitGlobal || 0)}
          subtitle="Année en cours"
          icon={<Wallet className="w-3.5 h-3.5" />}
        />
      </div>

      {/* Rappels reproduction */}
      {(upcomingHeats.length > 0 || upcomingBirths.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {upcomingHeats.length > 0 && (
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-100">
                <span className="text-[13px] font-semibold text-stone-800">⚠️ Prochaines chaleurs</span>
                <button
                  onClick={() => router.push("/reproduction")}
                  className="text-[12px] text-brand-600 hover:underline font-medium cursor-pointer"
                >
                  Voir tout
                </button>
              </div>
              <div className="divide-y divide-stone-100">
                {upcomingHeats.map(({ animal, alert }) => (
                  <div
                    key={animal.id}
                    onClick={() => router.push(`/animaux/${animal.id}`)}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-stone-50 cursor-pointer transition-colors"
                  >
                    <span className="text-lg shrink-0">{getAnimalIcon(animal.type)}</span>
                    <p className="flex-1 min-w-0 text-[13px] font-medium text-stone-800 truncate">
                      {animal.nom || animal.numeroBoucle || "Animal"}
                    </p>
                    <span className="text-[11px] text-stone-400 shrink-0">{formatGestationDate(alert.dateEstimee)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {upcomingBirths.length > 0 && (
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-100">
                <span className="text-[13px] font-semibold text-stone-800">🍼 Prochaines mises bas</span>
                <button
                  onClick={() => router.push("/reproduction")}
                  className="text-[12px] text-brand-600 hover:underline font-medium cursor-pointer"
                >
                  Voir tout
                </button>
              </div>
              <div className="divide-y divide-stone-100">
                {upcomingBirths.map(({ animal, alert }) => (
                  <div
                    key={animal.id}
                    onClick={() => router.push(`/animaux/${animal.id}`)}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-stone-50 cursor-pointer transition-colors"
                  >
                    <span className="text-lg shrink-0">{getAnimalIcon(animal.type)}</span>
                    <p className="flex-1 min-w-0 text-[13px] font-medium text-stone-800 truncate">
                      {animal.nom || animal.numeroBoucle || "Animal"}
                    </p>
                    <span className="text-[11px] text-stone-400 shrink-0">{formatGestationDate(alert.dateEstimee)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {latestWeather && (
        <button
          onClick={() => router.push("/meteo")}
          className="w-full bg-gradient-to-br from-sky-50 to-white border border-sky-100 rounded-xl p-4 text-left hover:border-sky-200 hover:shadow-sm transition-all"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                <CloudSun className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-stone-800">Météo ferme</p>
                <p className="text-[11px] text-stone-400 truncate">
                  {latestWeather.stationName || "Station météo"}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-semibold text-stone-900 tracking-tight">
                {formatWeatherValue(latestWeather.temperatureC, "°C", 1)}
              </p>
              <p className="text-[11px] text-brand-600 font-medium">Voir →</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="rounded-lg bg-white/80 border border-sky-100 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11px] text-stone-400"><Droplets className="w-3 h-3" /> Humidité</div>
              <p className="text-sm font-semibold text-stone-800 mt-0.5">{formatWeatherValue(latestWeather.humidityPct, "%", 0)}</p>
            </div>
            <div className="rounded-lg bg-white/80 border border-sky-100 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11px] text-stone-400"><Wind className="w-3 h-3" /> Vent</div>
              <p className="text-sm font-semibold text-stone-800 mt-0.5">{formatWeatherValue(latestWeather.windGustKmh ?? latestWeather.windSpeedKmh, "km/h", 0)}</p>
            </div>
            <div className="rounded-lg bg-white/80 border border-sky-100 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11px] text-stone-400"><Thermometer className="w-3 h-3" /> Pluie</div>
              <p className="text-sm font-semibold text-stone-800 mt-0.5">{formatWeatherValue(weatherStats.rainTodayMm, "mm", 1)}</p>
            </div>
          </div>
          <p className="text-[11px] text-stone-400 mt-2">
            Vent {getWindDirectionLabel(latestWeather.windDirectionDeg)} · cumul 7 j {formatWeatherValue(weatherStats.rain7DaysMm, "mm", 1)}
          </p>
        </button>
      )}

      {!citerne && (
        <div className="w-full h-28 rounded-xl border border-stone-200 bg-stone-50 animate-pulse" aria-label="Chargement de la citerne" />
      )}

      {citerne && !citerneStatus?.hasData && (
        <button
          onClick={() => void loadCiterne()}
          className="w-full rounded-xl border border-amber-200 bg-amber-50 p-4 text-left hover:bg-amber-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-stone-800">Citerne temporairement indisponible</p>
              <p className="text-[11px] text-stone-600 mt-0.5">Appuyer ici pour réessayer via Firebase</p>
            </div>
          </div>
        </button>
      )}

      {citerneStatus?.hasData && (
        <button
          onClick={() => router.push("/eau")}
          className="w-full bg-white border border-stone-200 rounded-xl p-4 text-left hover:border-stone-300 hover:shadow-sm transition-all"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                <Waves className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-stone-800">Citerne 1 — eau potable</p>
                <p className="text-[11px] text-stone-400 truncate">
                  {formatFreshnessLabel(citerneStatus.freshness)} · {formatRelativeAge(citerneStatus.lastUpdated, Date.now())}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-semibold text-stone-900 tracking-tight">
                {citerneStatus.niveau.value !== null ? `${citerneStatus.niveau.value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}%` : "—"}
              </p>
              <p className="text-[11px] text-brand-600 font-medium">Voir →</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div className="rounded-lg bg-stone-50 border border-stone-100 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11px] text-stone-400"><Droplets className="w-3 h-3" /> Volume dispo.</div>
              <p className="text-sm font-semibold text-stone-800 mt-0.5">{formatMetricValue(citerneStatus.volumeDisponible, 0)}</p>
            </div>
            <div className="rounded-lg bg-stone-50 border border-stone-100 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11px] text-stone-400"><Droplets className="w-3 h-3" /> Débit</div>
              <p className="text-sm font-semibold text-stone-800 mt-0.5">
                {citerneStatus.debit.value !== null ? formatMetricValue(citerneStatus.debit, 2) : "Non mesuré"}
              </p>
            </div>
          </div>
        </button>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Tâches */}
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <button
            onClick={() => router.push("/taches")}
            className="w-full flex items-center justify-between px-5 py-3.5 border-b border-stone-100 hover:bg-stone-50 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <ClipboardList className="w-4 h-4 text-stone-400" />
              <span className="text-[13px] font-semibold text-stone-800">
                Tâches à faire
              </span>
              {taskStats.enRetard > 0 && (
                <span className="text-[10px] font-semibold bg-red-50 text-red-600 border border-red-100 px-1.5 py-0.5 rounded-full">
                  {taskStats.enRetard} en retard
                </span>
              )}
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
          </button>

          <div className="divide-y divide-stone-100">
            {urgentTasks.length > 0 ? (
              <>
                {urgentTasks.map((task) => {
                  const days = getDaysUntilDue(task);
                  const isLate = days !== null && days < 0;
                  const isSoon = days !== null && days >= 0 && days <= 5;

                  let echeanceText = "";
                  if (days !== null) {
                    if (days < 0) echeanceText = `${Math.abs(days)}j de retard`;
                    else if (days === 0) echeanceText = "Aujourd'hui";
                    else echeanceText = `Dans ${days}j`;
                  }

                  return (
                    <div
                      key={task.id}
                      onClick={() => router.push("/taches")}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-stone-50 cursor-pointer transition-colors group"
                    >
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isLate ? "bg-red-400" : isSoon ? "bg-amber-400" : "bg-brand-400"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-stone-800 truncate">{task.titre}</p>
                        {task.assigneA && (
                          <p className="text-[11px] text-stone-400 mt-0.5">{task.assigneA}</p>
                        )}
                      </div>
                      {echeanceText && (
                        <span className={`text-[11px] font-medium shrink-0 ${isLate ? "text-red-500" : isSoon ? "text-amber-500" : "text-stone-400"}`}>
                          {echeanceText}
                        </span>
                      )}
                    </div>
                  );
                })}
                {allActiveTasks.length > 5 && (
                  <div className="px-5 py-3">
                    <button onClick={() => router.push("/taches")} className="text-[12px] text-brand-600 hover:underline cursor-pointer">
                      Voir {allActiveTasks.length - 5} tâches de plus
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <ClipboardList className="w-8 h-8 text-stone-200 mb-2" />
                <p className="text-[13px] text-stone-400">Aucune tâche en cours</p>
              </div>
            )}
          </div>
        </div>

        {/* Colonne droite */}
        <div className="space-y-4">

          {/* Objectif foin */}
          {objectifFoinTonnes > 0 && (
            <div className="bg-white border border-stone-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Wheat className="w-4 h-4 text-stone-400" />
                  <span className="text-[13px] font-semibold text-stone-800">Objectif foin {new Date().getFullYear()}</span>
                </div>
                <button
                  onClick={() => router.push("/fourrage")}
                  className="text-[12px] text-brand-600 hover:underline cursor-pointer"
                >
                  Voir →
                </button>
              </div>

              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-[24px] font-semibold text-stone-900 tracking-tight font-mono">
                  {foinsRecoltesTonnes.toFixed(1)}
                </span>
                <span className="text-[13px] text-stone-400">/ {objectifFoinTonnes.toFixed(1)} t</span>
                <span className={`ml-auto text-[13px] font-semibold ${foinPct >= 100 ? "text-brand-600" : foinPct >= 50 ? "text-amber-600" : "text-stone-500"}`}>
                  {foinPct}%
                </span>
              </div>

              <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${foinPct >= 100 ? "bg-brand-500" : foinPct >= 50 ? "bg-amber-400" : "bg-red-400"}`}
                  style={{ width: `${foinPct}%` }}
                />
              </div>

              {foinPct < 100 && (
                <p className="text-[11px] text-stone-400 mt-2">
                  Il manque <span className="text-stone-600 font-medium">{(objectifFoinTonnes - foinsRecoltesTonnes).toFixed(1)} t</span> pour atteindre l'objectif
                </p>
              )}
            </div>
          )}

          {/* Entretiens */}
          {sortedMaintenanceAlerts.length > 0 && (
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-100">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Wrench className="w-4 h-4 text-stone-400 shrink-0" />
                  <span className="text-[13px] font-semibold text-stone-800">
                    Entretiens à prévoir
                  </span>
                  <span className="text-[10px] font-semibold bg-amber-50 text-amber-600 border border-amber-100 px-1.5 py-0.5 rounded-full">
                    {sortedMaintenanceAlerts.length}
                  </span>
                </div>
                <button
                  onClick={() => router.push("/entretiens")}
                  className="text-[12px] text-brand-600 hover:underline font-medium shrink-0"
                >
                  Tout voir
                </button>
              </div>
              <div className="divide-y divide-stone-100">
                {sortedMaintenanceAlerts.slice(0, 4).map((alert, index) => (
                  <div
                    key={`${alert.vehicleId}-${alert.maintenanceId || index}`}
                    onClick={() => openMaintenanceAlert(alert)}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-stone-50 cursor-pointer transition-colors"
                  >
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${alert.urgent ? "bg-red-400" : "bg-amber-400"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-stone-800 truncate">
                        {alert.vehicleNom}{alert.titre ? ` — ${alert.titre}` : ""}
                      </p>
                      <p className="text-[11px] text-stone-400 mt-0.5 truncate">
                        {formatAlertMessage(alert.raison, alert.valeurActuelle, alert.valeurCible, alert.dateCible, alert.joursRestants)}
                      </p>
                    </div>
                    {alert.urgent && (
                      <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    )}
                  </div>
                ))}
                {sortedMaintenanceAlerts.length > 4 && (
                  <div className="px-5 py-3">
                    <button
                      onClick={() => router.push("/entretiens")}
                      className="w-full rounded-lg bg-stone-50 px-3 py-2 text-[12px] font-medium text-brand-600 hover:bg-stone-100"
                    >
                      Tout voir ({sortedMaintenanceAlerts.length})
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Alertes */}
          {alertes.length > 0 && (
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-stone-100">
                <AlertCircle className="w-4 h-4 text-stone-400" />
                <span className="text-[13px] font-semibold text-stone-800">Alertes ({alertes.length})</span>
              </div>
              <div className="divide-y divide-stone-100">
                {alertes.slice(0, 3).map((alerte) => (
                  <div key={alerte.id} className="flex items-start gap-3 px-5 py-3">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${alerte.priorite === "haute" ? "bg-red-400" : "bg-amber-400"}`} />
                    <div>
                      <p className="text-[13px] font-medium text-stone-800">{alerte.titre}</p>
                      <p className="text-[11px] text-stone-400 mt-0.5">{alerte.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
