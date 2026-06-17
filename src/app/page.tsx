"use client";

import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/store";
import { formatCurrency, formatDate } from "@/lib/utils";
import { formatAlertMessage } from "@/lib/vehicle-utils";
import { getVehicleStats } from "@/services/vehicle-service";
import { getUrgentTasks, getTaskStats, getDaysUntilDue } from "@/services/task-service";
import KpiCard from "@/components/KpiCard";
import { useMemo } from "react";
import {
  PawPrint,
  Truck,
  Wallet,
  ClipboardList,
  Wheat,
  Wrench,
  ChevronRight,
  AlertCircle,
  Clock,
} from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const { state } = useAppStore();
  const { stats, alertes, vehicles, maintenanceAlerts, taches, animaux, activitesFourrage } = state;

  const vehicleStats = useMemo(() => getVehicleStats(vehicles), [vehicles]);
  const urgentTasks  = useMemo(() => getUrgentTasks(taches, 5), [taches]);
  const taskStats    = useMemo(() => getTaskStats(taches), [taches]);
  const allActiveTasks = useMemo(() => taches.filter((t) => t.statut !== "terminee"), [taches]);

  const sortedMaintenanceAlerts = useMemo(
    () => [...maintenanceAlerts].sort((a, b) => (a.urgent === b.urgent ? 0 : a.urgent ? -1 : 1)),
    [maintenanceAlerts]
  );

  const CONSO_KG_JOUR: Record<string, number> = { ovin: 2, bovin: 9, caprin: 1.8, porcin: 0, equin: 10 };
  const DUREE_STABULATION = 120;

  const objectifFoinTonnes = useMemo(() => {
    const actifs = animaux.filter((a) => a.statut === "actif");
    const kg = actifs.reduce((sum, a) => sum + (CONSO_KG_JOUR[a.type] ?? 0) * DUREE_STABULATION, 0);
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
                <div className="flex items-center gap-2.5">
                  <Wrench className="w-4 h-4 text-stone-400" />
                  <span className="text-[13px] font-semibold text-stone-800">
                    Entretiens à prévoir
                  </span>
                  <span className="text-[10px] font-semibold bg-amber-50 text-amber-600 border border-amber-100 px-1.5 py-0.5 rounded-full">
                    {sortedMaintenanceAlerts.length}
                  </span>
                </div>
              </div>
              <div className="divide-y divide-stone-100">
                {sortedMaintenanceAlerts.slice(0, 4).map((alert, index) => (
                  <div
                    key={`${alert.vehicleId}-${alert.maintenanceId || index}`}
                    onClick={() => router.push(`/vehicules/${alert.vehicleId}`)}
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
