/**
 * Utilitaires pour la gestion des véhicules
 * Icônes, couleurs, formatage
 */

import type { VehicleType, VehicleStatus, MaintenanceType, DocumentType } from "@/types/vehicle";

// ==================== ICÔNES ====================

export function getVehicleIcon(type: VehicleType): string {
  const icons: Record<VehicleType, string> = {
    voiture: "🚗",
    moto: "🏍️",
    quad: "🛺",
    tracteur: "🚜",
    utilitaire: "🚐",
    remorque: "🚚",
    engin_tp: "🦾",
  };
  return icons[type] || "🚗";
}

export function getVehicleTypeLabel(type: VehicleType): string {
  const labels: Record<VehicleType, string> = {
    voiture: "Voiture",
    moto: "Moto",
    quad: "Quad",
    tracteur: "Tracteur",
    utilitaire: "Utilitaire",
    remorque: "Remorque",
    engin_tp: "Engin TP",
  };
  return labels[type] || type;
}

export function getStatusLabel(status: VehicleStatus): string {
  const labels: Record<VehicleStatus, string> = {
    actif: "Actif",
    en_reparation: "En réparation",
    stocke: "Stocké",
    vendu: "Vendu",
    reforme: "Réformé",
  };
  return labels[status] || status;
}

export function getMaintenanceTypeLabel(type: MaintenanceType): string {
  const labels: Record<MaintenanceType, string> = {
    vidange: "Vidange",
    filtres: "Filtres",
    freins: "Freins",
    pneus: "Pneus",
    batterie: "Batterie",
    courroie: "Courroie",
    climatisation: "Climatisation",
    controle_technique: "Contrôle technique",
    revision: "Révision",
    reparation: "Réparation",
    autre: "Autre",
  };
  return labels[type] || type;
}

export function getMaintenanceTypeIcon(type: MaintenanceType): string {
  const icons: Record<MaintenanceType, string> = {
    vidange: "🛢️",
    filtres: "🔧",
    freins: "🛑",
    pneus: "🛞",
    batterie: "🔋",
    courroie: "⚙️",
    climatisation: "❄️",
    controle_technique: "✅",
    revision: "🔍",
    reparation: "🔨",
    autre: "📋",
  };
  return icons[type] || "📋";
}

export function getDocumentTypeLabel(type: DocumentType): string {
  const labels: Record<DocumentType, string> = {
    carte_grise: "Carte grise",
    assurance: "Assurance",
    controle_technique: "Contrôle technique",
    facture_achat: "Facture d'achat",
    facture_entretien: "Facture d'entretien",
    manuel: "Manuel",
    autre: "Autre",
  };
  return labels[type] || type;
}

export function getDocumentTypeIcon(type: DocumentType): string {
  const icons: Record<DocumentType, string> = {
    carte_grise: "📄",
    assurance: "🛡️",
    controle_technique: "✅",
    facture_achat: "🧾",
    facture_entretien: "🧾",
    manuel: "📖",
    autre: "📎",
  };
  return icons[type] || "📎";
}

// ==================== COULEURS ====================

export function getVehicleColor(type: VehicleType): string {
  const colors: Record<VehicleType, string> = {
    voiture: "var(--color-vehicle-voiture)",
    moto: "var(--color-vehicle-moto)",
    quad: "var(--color-vehicle-quad)",
    tracteur: "var(--color-vehicle-tracteur)",
    utilitaire: "var(--color-vehicle-utilitaire)",
    remorque: "var(--color-vehicle-remorque)",
    engin_tp: "#b45309",
  };
  return colors[type] || "#6b7280";
}

export function getVehicleTailwindColor(type: VehicleType): string {
  const colors: Record<VehicleType, string> = {
    voiture: "text-blue-600",
    moto: "text-red-600",
    quad: "text-orange-600",
    tracteur: "text-green-600",
    utilitaire: "text-purple-600",
    remorque: "text-gray-600",
    engin_tp: "text-amber-700",
  };
  return colors[type] || "text-gray-500";
}

export function getVehicleBorderColor(type: VehicleType): string {
  const colors: Record<VehicleType, string> = {
    voiture: "border-l-blue-600",
    moto: "border-l-red-600",
    quad: "border-l-orange-600",
    tracteur: "border-l-green-600",
    utilitaire: "border-l-purple-600",
    remorque: "border-l-gray-600",
    engin_tp: "border-l-amber-700",
  };
  return colors[type] || "border-l-gray-500";
}

export function getVehicleBgColor(type: VehicleType): string {
  const colors: Record<VehicleType, string> = {
    voiture: "bg-blue-50 text-blue-700",
    moto: "bg-red-50 text-red-700",
    quad: "bg-orange-50 text-orange-700",
    tracteur: "bg-green-50 text-green-700",
    utilitaire: "bg-purple-50 text-purple-700",
    remorque: "bg-gray-50 text-gray-700",
    engin_tp: "bg-amber-50 text-amber-700",
  };
  return colors[type] || "bg-gray-100 text-gray-700";
}

export function getStatusColor(status: VehicleStatus): string {
  const colors: Record<VehicleStatus, string> = {
    actif: "bg-green-100 text-green-800",
    en_reparation: "bg-orange-100 text-orange-800",
    stocke: "bg-blue-100 text-blue-800",
    vendu: "bg-gray-100 text-gray-800",
    reforme: "bg-red-100 text-red-800",
  };
  return colors[status] || "bg-gray-100 text-gray-800";
}

export function getMaintenanceStatusColor(status: string): string {
  const colors: Record<string, string> = {
    planifie: "bg-blue-100 text-blue-800",
    en_cours: "bg-yellow-100 text-yellow-800",
    termine: "bg-green-100 text-green-800",
    annule: "bg-gray-100 text-gray-800",
  };
  return colors[status] || "bg-gray-100 text-gray-800";
}

// ==================== FORMATAGE ====================

export function formatKilometrage(km: number | null | undefined): string {
  if (km === null || km === undefined) return "-";
  return new Intl.NumberFormat("fr-FR").format(km) + " km";
}

export function formatHeures(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return "-";
  return new Intl.NumberFormat("fr-FR").format(hours) + " h";
}

export function formatLitres(litres: number | null | undefined, decimals = 2): string {
  if (litres === null || litres === undefined) return "-";
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(litres) + " L";
}

export function formatConsommation(litresAux100km: number | null | undefined): string {
  if (litresAux100km === null || litresAux100km === undefined) return "-";
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(litresAux100km) + " L/100km";
}

export function formatPuissance(puissance: number | null | undefined): string {
  if (puissance === null || puissance === undefined) return "-";
  return new Intl.NumberFormat("fr-FR").format(puissance) + " CV";
}

// ==================== CALCULS ====================

/**
 * Calcule la consommation en L/100km
 */
export function calculateConsumption(litres: number, kmParcourus: number): number | null {
  if (!litres || !kmParcourus || kmParcourus === 0) return null;
  return (litres / kmParcourus) * 100;
}

/**
 * Calcule le nombre de jours depuis une date
 */
export function daysSince(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = now.getTime() - date.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Calcule le nombre de jours jusqu'à une date
 */
export function daysUntil(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = date.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Vérifie si une date est expirée
 */
export function isExpired(dateString: string | null | undefined): boolean {
  if (!dateString) return false;
  return new Date(dateString) < new Date();
}

/**
 * Vérifie si une date approche (dans les N jours)
 */
export function isApproaching(dateString: string | null | undefined, daysThreshold = 30): boolean {
  if (!dateString) return false;
  const days = daysUntil(dateString);
  return days >= 0 && days <= daysThreshold;
}

/**
 * Formate une alerte selon l'urgence
 */
export function getAlertUrgencyColor(urgent: boolean): string {
  return urgent ? "bg-red-50 border-red-200" : "bg-yellow-50 border-yellow-200";
}

export function getAlertUrgencyText(urgent: boolean): string {
  return urgent ? "text-red-700" : "text-yellow-700";
}

/**
 * Formate un message d'alerte
 */
export function formatAlertMessage(
  raison: "date" | "kilometrage" | "heures",
  valeurActuelle?: number,
  valeurCible?: number,
  dateCible?: string,
  joursRestants?: number
): string {
  if (raison === "date" && dateCible && joursRestants !== undefined) {
    if (joursRestants < 0) {
      return `Échéance dépassée de ${Math.abs(joursRestants)} jour(s)`;
    } else if (joursRestants === 0) {
      return "Échéance aujourd'hui";
    } else {
      return `Dans ${joursRestants} jour(s)`;
    }
  }

  if (raison === "kilometrage" && valeurActuelle !== undefined && valeurCible !== undefined) {
    const restant = valeurCible - valeurActuelle;
    if (restant <= 0) {
      return `Kilométrage dépassé de ${Math.abs(restant)} km`;
    } else {
      return `Plus que ${restant} km`;
    }
  }

  if (raison === "heures" && valeurActuelle !== undefined && valeurCible !== undefined) {
    const restant = valeurCible - valeurActuelle;
    if (restant <= 0) {
      return `Heures dépassées de ${Math.abs(restant)} h`;
    } else {
      return `Plus que ${restant} h`;
    }
  }

  return "Échéance proche";
}
