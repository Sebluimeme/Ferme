"use client";

import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/store";
import { formatCurrency, formatDate, getAnimalIcon } from "@/lib/utils";
import { getVehicleIcon, formatAlertMessage } from "@/lib/vehicle-utils";
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

  return (
    <div className="fade-in">
      <h1 className="text-2xl font-bold mb-6">📊 Tableau de bord</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Total Animaux" value={stats.totalAnimaux || 0} subtitle="actifs" onClick={() => router.push("/animaux")} />
        <KpiCard label={`${getAnimalIcon("ovin")} Ovins`} value={stats.ovins || 0} borderColorClass="border-l-ovin" valueColorClass="text-ovin" onClick={() => router.push("/animaux?type=ovin")} />
        <KpiCard label={`${getAnimalIcon("bovin")} Bovins`} value={stats.bovins || 0} borderColorClass="border-l-bovin" valueColorClass="text-bovin" onClick={() => router.push("/animaux?type=bovin")} />
        <KpiCard label={`${getAnimalIcon("caprin")} Caprins`} value={stats.caprins || 0} borderColorClass="border-l-caprin" valueColorClass="text-caprin" onClick={() => router.push("/animaux?type=caprin")} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <KpiCard label={`${getAnimalIcon("porcin")} Porcins`} value={stats.porcins || 0} borderColorClass="border-l-porcin" valueColorClass="text-porcin" onClick={() => router.push("/animaux?type=porcin")} />
        <KpiCard label="Profit Global" value={formatCurrency(stats.profitGlobal || 0)} subtitle="Année en cours" borderColorClass="border-l-green-500" valueColorClass="text-green-500" />
      </div>

      {/* KPI Véhicules */}
      <h2 className="text-xl font-bold mb-3 mt-6">🚗 Parc de véhicules</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard
          label="Total Véhicules"
          value={vehicleStats.totalVehicules || 0}
          subtitle="actifs"
          borderColorClass="border-l-blue-500"
          valueColorClass="text-blue-500"
          onClick={() => router.push("/vehicules")}
        />
        <KpiCard
          label={`${getVehicleIcon("voiture")} Voitures`}
          value={vehicleStats.parType.voiture || 0}
          borderColorClass="border-l-blue-600"
          valueColorClass="text-blue-600"
          onClick={() => router.push("/vehicules")}
        />
        <KpiCard
          label={`${getVehicleIcon("tracteur")} Tracteurs`}
          value={vehicleStats.parType.tracteur || 0}
          borderColorClass="border-l-green-600"
          valueColorClass="text-green-600"
          onClick={() => router.push("/vehicules")}
        />
        <KpiCard
          label={`${getVehicleIcon("moto")} Motos/Quads`}
          value={(vehicleStats.parType.moto || 0) + (vehicleStats.parType.quad || 0)}
          borderColorClass="border-l-red-600"
          valueColorClass="text-red-600"
          onClick={() => router.push("/vehicules")}
        />
      </div>

      {/* Tâches à faire */}
      {(urgentTasks.length > 0 || taskStats.enRetard > 0) && (
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
            {taches.filter((t) => t.statut !== "terminee").length > 5 && (
              <button
                onClick={() => router.push("/taches")}
                className="text-sm text-primary hover:underline mt-2"
              >
                Voir toutes les tâches ({taches.filter((t) => t.statut !== "terminee").length - 5} de plus)
              </button>
            )}
          </div>
        </div>
      )}

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

      {/* Bienvenue */}
      <div className="bg-white rounded-lg shadow-sm">
        <div className="px-4 py-3">
          <h2 className="text-xl font-bold mb-3">👋 Bienvenue dans votre application de gestion de ferme!</h2>
          <p className="text-gray-700 mb-3 text-sm">
            Gérez votre cheptel et votre parc de véhicules en toute simplicité.
          </p>

          <div className="mt-4">
            <h4 className="text-base font-semibold mb-1.5">🚀 Fonctionnalités disponibles:</h4>
            <ul className="list-none space-y-0.5 text-gray-700 text-sm">
              <li>✅ Gestion de 4 types d&apos;animaux (ovins, bovins, caprins, porcins)</li>
              <li>✅ Gestion du parc de véhicules (voitures, tracteurs, motos, quads...)</li>
              <li>✅ Suivi complet des entretiens avec alertes automatiques</li>
              <li>✅ Planification des entretiens basée sur km, heures ou dates</li>
              <li>✅ Templates d&apos;entretien prédéfinis</li>
              <li>✅ Gestion des documents (carte grise, assurance, CT...)</li>
              <li>✅ Suivi des coûts d&apos;entretien et pièces</li>
              <li>✅ Gestion des tâches avec échéances et notifications</li>
              <li>🔄 Synchronisation en temps réel avec Firebase</li>
              <li>📱 Interface responsive (mobile, tablette, desktop)</li>
            </ul>
          </div>

          <div className="mt-4">
            <h4 className="text-base font-semibold mb-1.5">📝 En développement:</h4>
            <ul className="list-none space-y-0.5 text-gray-700 text-sm">
              <li>Module Traitements vétérinaires</li>
              <li>Module Coûts globaux</li>
              <li>Module Profits</li>
              <li>Module Rapports</li>
              <li>Galerie photos véhicules</li>
              <li>Suivi consommation carburant</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
