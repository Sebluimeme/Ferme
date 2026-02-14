"use client";

import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/store";
import { formatCurrency, getAnimalIcon } from "@/lib/utils";
import { getVehicleIcon, formatAlertMessage } from "@/lib/vehicle-utils";
import { getVehicleStats } from "@/services/vehicle-service";
import KpiCard from "@/components/KpiCard";
import { useMemo } from "react";

export default function DashboardPage() {
  const router = useRouter();
  const { state } = useAppStore();
  const { stats, alertes, vehicles, maintenanceAlerts } = state;

  // Calculer les stats des véhicules
  const vehicleStats = useMemo(() => getVehicleStats(vehicles), [vehicles]);

  // Trier les alertes de maintenance par urgence
  const sortedMaintenanceAlerts = useMemo(
    () => [...maintenanceAlerts].sort((a, b) => (a.urgent === b.urgent ? 0 : a.urgent ? -1 : 1)),
    [maintenanceAlerts]
  );

  return (
    <div className="fade-in">
      <h1 className="text-3xl font-bold mb-8">📊 Tableau de bord</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Total Animaux" value={stats.totalAnimaux || 0} subtitle="actifs" onClick={() => router.push("/animaux")} />
        <KpiCard label={`${getAnimalIcon("ovin")} Ovins`} value={stats.ovins || 0} borderColorClass="border-l-ovin" valueColorClass="text-ovin" onClick={() => router.push("/animaux?type=ovin")} />
        <KpiCard label={`${getAnimalIcon("bovin")} Bovins`} value={stats.bovins || 0} borderColorClass="border-l-bovin" valueColorClass="text-bovin" onClick={() => router.push("/animaux?type=bovin")} />
        <KpiCard label={`${getAnimalIcon("caprin")} Caprins`} value={stats.caprins || 0} borderColorClass="border-l-caprin" valueColorClass="text-caprin" onClick={() => router.push("/animaux?type=caprin")} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <KpiCard label={`${getAnimalIcon("porcin")} Porcins`} value={stats.porcins || 0} borderColorClass="border-l-porcin" valueColorClass="text-porcin" onClick={() => router.push("/animaux?type=porcin")} />
        <KpiCard label="Profit Global" value={formatCurrency(stats.profitGlobal || 0)} subtitle="Année en cours" borderColorClass="border-l-green-500" valueColorClass="text-green-500" />
      </div>

      {/* KPI Véhicules */}
      <h2 className="text-2xl font-bold mb-4 mt-8">🚗 Parc de véhicules</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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

      {/* Alertes d'entretien */}
      {sortedMaintenanceAlerts.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm mb-8">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200">
            <span className="text-2xl">🔧</span>
            <h3 className="text-lg font-semibold m-0 flex-1">
              Entretiens à prévoir ({sortedMaintenanceAlerts.length})
            </h3>
          </div>
          <div className="p-6">
            {sortedMaintenanceAlerts.slice(0, 5).map((alert, index) => (
              <div
                key={`${alert.vehicleId}-${alert.maintenanceId || index}`}
                onClick={() => router.push(`/vehicules/${alert.vehicleId}`)}
                className={`px-4 py-3 rounded-lg mb-2 border-l-4 cursor-pointer hover:opacity-80 transition-opacity ${
                  alert.urgent
                    ? "bg-red-50 border-l-red-500 text-red-800"
                    : "bg-orange-50 border-l-orange-500 text-orange-800"
                }`}
              >
                <strong>
                  {alert.vehicleNom} - {alert.titre}
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
        <div className="bg-white rounded-xl shadow-sm mb-8">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200">
            <span className="text-2xl">🔔</span>
            <h3 className="text-lg font-semibold m-0 flex-1">Alertes ({alertes.length})</h3>
          </div>
          <div className="p-6">
            {alertes.slice(0, 5).map((alerte) => (
              <div
                key={alerte.id}
                className={`px-4 py-3 rounded-lg mb-2 border-l-4 ${
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
      <div className="bg-white rounded-xl shadow-sm">
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-4">👋 Bienvenue dans votre application de gestion de ferme!</h2>
          <p className="text-gray-700 mb-4">
            Gérez votre cheptel et votre parc de véhicules en toute simplicité.
          </p>

          <div className="mt-6">
            <h4 className="text-lg font-semibold mb-2">🚀 Fonctionnalités disponibles:</h4>
            <ul className="list-none space-y-1 text-gray-700">
              <li>✅ Gestion de 4 types d&apos;animaux (ovins, bovins, caprins, porcins)</li>
              <li>✅ Gestion du parc de véhicules (voitures, tracteurs, motos, quads...)</li>
              <li>✅ Suivi complet des entretiens avec alertes automatiques</li>
              <li>✅ Planification des entretiens basée sur km, heures ou dates</li>
              <li>✅ Templates d&apos;entretien prédéfinis</li>
              <li>✅ Gestion des documents (carte grise, assurance, CT...)</li>
              <li>✅ Suivi des coûts d&apos;entretien et pièces</li>
              <li>🔄 Synchronisation en temps réel avec Firebase</li>
              <li>📱 Interface responsive (mobile, tablette, desktop)</li>
            </ul>
          </div>

          <div className="mt-6">
            <h4 className="text-lg font-semibold mb-2">📝 En développement:</h4>
            <ul className="list-none space-y-1 text-gray-700">
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
