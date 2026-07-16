"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/store";
import {
  getMaintenanceTypeLabel,
  getMaintenanceTypeIcon,
  getMaintenanceStatusColor,
  getVehicleIcon,
  formatAlertMessage,
  formatKilometrage,
  formatHeures,
  daysUntil,
  isExpired,
} from "@/lib/vehicle-utils";
import { formatDate, formatCurrency } from "@/lib/utils";

export default function EntretiensPage() {
  const router = useRouter();
  const { state } = useAppStore();

  // Alertes triées : urgentes d'abord, puis par jours restants
  const sortedAlerts = useMemo(() => {
    return [...state.maintenanceAlerts].sort((a, b) => {
      if (a.urgent && !b.urgent) return -1;
      if (!a.urgent && b.urgent) return 1;
      const daysA = a.joursRestants ?? Infinity;
      const daysB = b.joursRestants ?? Infinity;
      return daysA - daysB;
    });
  }, [state.maintenanceAlerts]);

  // Entretiens planifiés (pas encore terminés)
  const plannedEntries = useMemo(() => {
    return state.maintenanceEntries
      .filter((e) => e.statut === "planifie" || e.statut === "en_cours")
      .sort((a, b) => {
        const dateA = a.datePlanifiee || a.dateEffectuee || "9999";
        const dateB = b.datePlanifiee || b.dateEffectuee || "9999";
        return dateA.localeCompare(dateB);
      });
  }, [state.maintenanceEntries]);

  // Historique récent (terminés, les 10 derniers)
  const recentHistory = useMemo(() => {
    return state.maintenanceEntries
      .filter((e) => e.statut === "termine")
      .sort((a, b) => {
        const dateA = a.dateEffectuee || a.datePlanifiee || "";
        const dateB = b.dateEffectuee || b.datePlanifiee || "";
        return dateB.localeCompare(dateA);
      })
      .slice(0, 10);
  }, [state.maintenanceEntries]);

  const getVehicleName = (vehicleId: string) => {
    const v = state.vehicles.find((v) => v.id === vehicleId);
    if (!v) return "Véhicule inconnu";
    return v.plaqueImmatriculation || `${v.marque || ""} ${v.modele || ""}`.trim() || "Véhicule";
  };

  const getVehicleType = (vehicleId: string) => {
    const v = state.vehicles.find((v) => v.id === vehicleId);
    return v?.type;
  };

  const openAlert = (alert: (typeof sortedAlerts)[number]) => {
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

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-20">
          <div className="text-stone-400 text-lg">Chargement...</div>
        </div>
    );
  }

  const hasNoData = sortedAlerts.length === 0 && plannedEntries.length === 0 && recentHistory.length === 0;

  return (
    <div className="fade-in">
      <div className="mb-6">
        <h1 className="text-2xl md:text-2xl font-bold text-stone-900">Entretiens</h1>
        <p className="text-stone-600 mt-1">Vue d&apos;ensemble de tous les entretiens de vos véhicules</p>
      </div>

      {hasNoData ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🔧</div>
          <p className="text-stone-500 mb-2">Aucun entretien enregistré</p>
          <p className="text-stone-400 text-sm mb-6">
            Ajoutez des entretiens depuis la fiche de chaque véhicule
          </p>
          {state.vehicles.length > 0 ? (
            <button
              onClick={() => router.push("/vehicules")}
              className="px-6 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
            >
              Voir mes véhicules
            </button>
          ) : (
            <button
              onClick={() => router.push("/vehicules")}
              className="px-6 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
            >
              + Ajouter un véhicule
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {/* Section Alertes */}
          {sortedAlerts.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-stone-800 mb-3 flex items-center gap-2">
                <span>⚠️</span>
                Entretiens à prévoir
                <span className="text-sm font-normal text-stone-500">({sortedAlerts.length})</span>
              </h2>
              <div className="space-y-2">
                {sortedAlerts.map((alert, index) => {
                  const vType = getVehicleType(alert.vehicleId);
                  return (
                    <div
                      key={`${alert.maintenanceId || alert.vehicleId}-${index}`}
                      onClick={() => openAlert(alert)}
                      className={`px-4 py-3 rounded-lg border-l-4 cursor-pointer transition-colors hover:opacity-90 ${
                        alert.urgent
                          ? "bg-red-50 border-l-red-500"
                          : "bg-orange-50 border-l-orange-500"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm">{vType ? getVehicleIcon(vType) : "🚗"}</span>
                            <span className="text-xs font-medium text-stone-500 truncate">
                              {alert.vehicleNom || getVehicleName(alert.vehicleId)}
                            </span>
                          </div>
                          <strong className={`text-sm ${alert.urgent ? "text-red-800" : "text-orange-800"}`}>
                            {alert.titre || getMaintenanceTypeLabel(alert.type || "autre")}
                          </strong>
                          <p className={`text-xs mt-0.5 ${alert.urgent ? "text-red-700" : "text-orange-700"}`}>
                            {formatAlertMessage(alert.raison, alert.valeurActuelle, alert.valeurCible, alert.dateCible, alert.joursRestants)}
                          </p>
                        </div>
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded-full shrink-0 ${
                            alert.urgent ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"
                          }`}
                        >
                          {alert.urgent ? "Urgent" : "A prévoir"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Section Entretiens planifiés / en cours */}
          {plannedEntries.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-stone-800 mb-3 flex items-center gap-2">
                <span>📋</span>
                Planifiés / En cours
                <span className="text-sm font-normal text-stone-500">({plannedEntries.length})</span>
              </h2>
              <div className="space-y-2">
                {plannedEntries.map((entry) => {
                  const vType = getVehicleType(entry.vehicleId);
                  return (
                    <div
                      key={entry.id}
                      onClick={() => router.push(`/vehicules/${entry.vehicleId}?tab=entretien`)}
                      className="bg-white border border-stone-200 rounded-lg p-4 cursor-pointer hover:bg-stone-50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{entry.type ? getMaintenanceTypeIcon(entry.type) : "🔧"}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm">{vType ? getVehicleIcon(vType) : "🚗"}</span>
                            <span className="text-xs font-medium text-stone-500 truncate">
                              {getVehicleName(entry.vehicleId)}
                            </span>
                          </div>
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-semibold text-stone-800 text-sm">{entry.titre || "Entretien"}</h4>
                            <span className={`text-xs font-medium px-2 py-1 rounded-full shrink-0 ${getMaintenanceStatusColor(entry.statut || "planifie")}`}>
                              {entry.statut === "planifie" ? "Planifié" : "En cours"}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-stone-500">
                            {entry.datePlanifiee && <span>📅 {formatDate(entry.datePlanifiee)}</span>}
                            {entry.garage && <span>🔧 {entry.garage}</span>}
                            {entry.coutTotal && <span>💰 {formatCurrency(entry.coutTotal)}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Section Historique récent */}
          {recentHistory.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-stone-800 mb-3 flex items-center gap-2">
                <span>✅</span>
                Historique récent
              </h2>
              <div className="space-y-2">
                {recentHistory.map((entry) => {
                  const vType = getVehicleType(entry.vehicleId);
                  const showAlert = entry.prochaineDate && (isExpired(entry.prochaineDate) || daysUntil(entry.prochaineDate) <= 30);

                  return (
                    <div
                      key={entry.id}
                      onClick={() => router.push(`/vehicules/${entry.vehicleId}?tab=entretien`)}
                      className={`bg-white border rounded-lg p-4 cursor-pointer hover:bg-stone-50 transition-colors ${
                        showAlert ? "border-orange-300" : "border-stone-200"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{entry.type ? getMaintenanceTypeIcon(entry.type) : "🔧"}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm">{vType ? getVehicleIcon(vType) : "🚗"}</span>
                            <span className="text-xs font-medium text-stone-500 truncate">
                              {getVehicleName(entry.vehicleId)}
                            </span>
                          </div>
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-semibold text-stone-800 text-sm">{entry.titre || "Entretien"}</h4>
                            <span className={`text-xs font-medium px-2 py-1 rounded-full shrink-0 ${getMaintenanceStatusColor("termine")}`}>
                              Terminé
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-stone-500">
                            {entry.dateEffectuee && <span>✅ {formatDate(entry.dateEffectuee)}</span>}
                            {entry.kilometrageEffectue && <span>📏 {formatKilometrage(entry.kilometrageEffectue)}</span>}
                            {entry.heuresEffectuees && <span>⏱️ {formatHeures(entry.heuresEffectuees)}</span>}
                            {entry.garage && <span>🔧 {entry.garage}</span>}
                            {entry.coutTotal && <span>💰 {formatCurrency(entry.coutTotal)}</span>}
                          </div>
                          {showAlert && entry.prochaineDate && (
                            <div className="mt-1.5 text-xs font-semibold text-orange-700">
                              ⚠️ Prochain entretien {isExpired(entry.prochaineDate) ? "dépassé" : `dans ${daysUntil(entry.prochaineDate)} jours`}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}