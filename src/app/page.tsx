"use client";

import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/store";
import { formatCurrency, formatDate } from "@/lib/utils";
import { formatAlertMessage } from "@/lib/vehicle-utils";
import { getVehicleStats } from "@/services/vehicle-service";
import { getUrgentTasks, getTaskStats, isTaskOverdue, isTaskDueSoon, getDaysUntilDue } from "@/services/task-service";
import KpiCard from "@/components/KpiCard";
import { useMemo } from "react";

export default function DashboardPage() {
  const router = useRouter();
  const { state } = useAppStore();
  const { stats, alertes, vehicles, maintenanceAlerts, taches } = state;

  // Calculer les stats des véhicules
  const vehicleStats = useMemo(() => getVehicleStats(vehicles), [vehicles]);

  // Tâches urgentes pour le dashboard
  const urgentTasks = useMemo(() => getUrgentTasks(taches, 5), [taches]);
  const taskStats = useMemo(() => getTaskStats(taches), [taches]);

  // Trier les alertes de maintenance par urgence
  const sortedMaintenanceAlerts = useMemo(
    () => [...maintenanceAlerts].sort((a, b) => (a.urgent === b.urgent ? 0 : a.urgent ? -1 : 1)),
    [maintenanceAlerts]
  );

  const allActiveTasks = useMemo(() => taches.filter((t) => t.statut !== "terminee"), [taches]);

  return (
    <div className="fade-in">
      <h1 className="text-2xl font-bold mb-6">📊 Tableau de bord</h1>

      {/* Tâches à faire - TOUT EN HAUT */}
      <div className="bg-white rounded-lg shadow-sm mb-6">
        <div
          className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => router.push("/taches")}
        >
          <span className="text-lg">📋</span>
          <h3 className="text-base font-semibold m-0 flex-1">
            Tâches à faire ({taskStats.aFaire + taskStats.enCours})
          </h3>
          {taskStats.enRetard > 0 && (
            <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">
              {taskStats.enRetard} en retard
            </span>
          )}
          <span className="text-gray-400 text-xs">Voir tout →</span>
        </div>
        <div className="px-4 py-3">
          {urgentTasks.length > 0 ? (
            <>
              {urgentTasks.map((task) => {
                const overdue = isTaskOverdue(task);
                const dueSoon = isTaskDueSoon(task);
                const days = getDaysUntilDue(task);
                let echeanceText = "";
                if (days !== null) {
                  if (days < 0) echeanceText = `En retard (${Math.abs(days)}j)`;
                  else if (days === 0) echeanceText = "Aujourd'hui";
                  else echeanceText = `Dans ${days}j`;
                }
                return (
                  <div
                    key={task.id}
                    onClick={() => router.push("/taches")}
                    className={`px-3 py-2 rounded-md mb-1.5 border-l-4 cursor-pointer hover:opacity-80 transition-opacity text-sm ${
                      overdue
                        ? "bg-red-50 border-l-red-500 text-red-800"
                        : dueSoon
                        ? "bg-amber-50 border-l-amber-500 text-amber-800"
                        : task.priorite === "haute"
                        ? "bg-red-50 border-l-red-400 text-red-800"
                        : task.priorite === "moyenne"
                        ? "bg-amber-50 border-l-amber-400 text-amber-800"
                        : "bg-green-50 border-l-green-400 text-green-800"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <strong>{task.titre}</strong>
                      <div className="flex items-center gap-2 text-xs">
                        {task.categorie && (
                          <span className="bg-white/50 px-2 py-0.5 rounded-full">{task.categorie}</span>
                        )}
                        {echeanceText && (
                          <span className="font-medium">{echeanceText}</span>
                        )}
                      </div>
                    </div>
                    {(task.animalNom || task.vehiculeNom || task.dateEcheance || task.assigneA) && (
                      <small className="flex items-center gap-2 mt-1">
                        {task.dateEcheance && <span>📅 {formatDate(task.dateEcheance)}</span>}
                        {task.assigneA && <span>👤 {task.assigneA}</span>}
                        {task.animalNom && <span>🐾 {task.animalNom}</span>}
                        {task.vehiculeNom && <span>🚗 {task.vehiculeNom}</span>}
                      </small>
                    )}
                  </div>
                );
              })}
              {allActiveTasks.length > 5 && (
                <button
                  onClick={() => router.push("/taches")}
                  className="text-sm text-primary hover:underline mt-2"
                >
                  Voir toutes les tâches ({allActiveTasks.length - 5} de plus)
                </button>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400 py-2">Aucune tâche en cours</p>
          )}
        </div>
      </div>

      {/* Résumé rapide */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <KpiCard label="🐾 Animaux" value={stats.totalAnimaux || 0} subtitle="actifs" onClick={() => router.push("/animaux")} />
        <KpiCard
          label="🚗 Véhicules"
          value={vehicleStats.totalVehicules || 0}
          subtitle="actifs"
          borderColorClass="border-l-blue-500"
          valueColorClass="text-blue-500"
          onClick={() => router.push("/vehicules")}
        />
        <KpiCard label="💰 Profit Global" value={formatCurrency(stats.profitGlobal || 0)} subtitle="Année en cours" borderColorClass="border-l-green-500" valueColorClass="text-green-500" />
      </div>

      {/* Alertes d'entretien */}
      {sortedMaintenanceAlerts.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm mb-6">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
            <span className="text-lg">🔧</span>
            <h3 className="text-base font-semibold m-0 flex-1">
              Entretiens à prévoir ({sortedMaintenanceAlerts.length})
            </h3>
          </div>
          <div className="px-4 py-3">
            {sortedMaintenanceAlerts.slice(0, 5).map((alert, index) => (
              <div
                key={`${alert.vehicleId}-${alert.maintenanceId || index}`}
                onClick={() => router.push(`/vehicules/${alert.vehicleId}`)}
                className={`px-3 py-2 rounded-md mb-1.5 border-l-4 cursor-pointer hover:opacity-80 transition-opacity text-sm ${
                  alert.urgent
                    ? "bg-red-50 border-l-red-500 text-red-800"
                    : "bg-orange-50 border-l-orange-500 text-orange-800"
                }`}
              >
                <strong>
                  {alert.vehicleNom}{alert.titre ? ` - ${alert.titre}` : ""}
                </strong>
                <br />
                <small>
                  {formatAlertMessage(
                    alert.raison,
                    alert.valeurActuelle,
                    alert.valeurCible,
                    alert.dateCible,
                    alert.joursRestants
                  )}
                </small>
              </div>
            ))}
            {sortedMaintenanceAlerts.length > 5 && (
              <button
                onClick={() => router.push("/vehicules")}
                className="text-sm text-primary hover:underline mt-2"
              >
                Voir tous les entretiens ({sortedMaintenanceAlerts.length - 5} de plus)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Alertes */}
      {alertes.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm mb-6">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
            <span className="text-lg">🔔</span>
            <h3 className="text-base font-semibold m-0 flex-1">Alertes ({alertes.length})</h3>
          </div>
          <div className="px-4 py-3">
            {alertes.slice(0, 5).map((alerte) => (
              <div
                key={alerte.id}
                className={`px-3 py-2 rounded-md mb-1.5 border-l-4 text-sm ${
                  alerte.priorite === "haute"
                    ? "bg-red-50 border-l-red-500 text-red-800"
                    : "bg-amber-50 border-l-amber-500 text-amber-800"
                }`}
              >
                <strong>{alerte.titre}</strong>
                <br />
                <small>{alerte.description}</small>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
