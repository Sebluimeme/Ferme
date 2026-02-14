"use client";

import type { Vehicle } from "@/types/vehicle";
import { formatDate, formatCurrency } from "@/lib/utils";
import {
  getStatusLabel,
  getFuelTypeLabel,
  formatKilometrage,
  formatHeures,
  formatPuissance,
  isExpired,
  isApproaching,
  daysUntil,
} from "@/lib/vehicle-utils";

interface VehicleInfoGridProps {
  vehicle: Vehicle;
}

export default function VehicleInfoGrid({ vehicle }: VehicleInfoGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* Informations générales */}
      <InfoCard title="Informations générales">
        <InfoItem label="Type" value={vehicle.type} />
        <InfoItem label="Statut" value={getStatusLabel(vehicle.statut)} />
        <InfoItem label="Marque" value={vehicle.marque} />
        <InfoItem label="Modèle" value={vehicle.modele} />
        <InfoItem label="Année" value={vehicle.annee?.toString()} />
      </InfoCard>

      {/* Identification */}
      <InfoCard title="Identification">
        <InfoItem label="Plaque d'immatriculation" value={vehicle.plaqueImmatriculation} />
        <InfoItem label="Numéro de série (VIN)" value={vehicle.numeroSerie} mono />
        <InfoItem label="Nom personnalisé" value={vehicle.nom} />
      </InfoCard>

      {/* Caractéristiques techniques */}
      <InfoCard title="Caractéristiques techniques">
        <InfoItem label="Type de carburant" value={vehicle.typeCarburant && getFuelTypeLabel(vehicle.typeCarburant)} />
        <InfoItem label="Puissance" value={formatPuissance(vehicle.puissance)} />
        <InfoItem label="Capacité réservoir" value={vehicle.capaciteReservoir ? `${vehicle.capaciteReservoir} L` : undefined} />
      </InfoCard>

      {/* Compteurs */}
      <InfoCard title="Compteurs">
        <InfoItem label="Kilométrage" value={formatKilometrage(vehicle.kilometrage)} />
        <InfoItem label="Heures d'utilisation" value={formatHeures(vehicle.heuresUtilisation)} />
      </InfoCard>

      {/* Financier */}
      <InfoCard title="Financier">
        <InfoItem label="Valeur d'achat" value={formatCurrency(vehicle.valeurAchat)} />
        <InfoItem label="Date d'achat" value={formatDate(vehicle.dateAchat)} />
        <InfoItem label="Valeur actuelle estimée" value={formatCurrency(vehicle.valeurActuelle)} />
      </InfoCard>

      {/* Assurance et contrôle */}
      <InfoCard title="Assurance et contrôle">
        <InfoItem label="N° police d'assurance" value={vehicle.numeroPoliceAssurance} />
        <InfoItem
          label="Expiration assurance"
          value={vehicle.dateExpAssurance ? formatDate(vehicle.dateExpAssurance) : undefined}
          alert={vehicle.dateExpAssurance ? (isExpired(vehicle.dateExpAssurance) ? "expired" : isApproaching(vehicle.dateExpAssurance, 30) ? "warning" : undefined) : undefined}
          alertMessage={vehicle.dateExpAssurance && isExpired(vehicle.dateExpAssurance) ? "Expiré !" : vehicle.dateExpAssurance && isApproaching(vehicle.dateExpAssurance, 30) ? `Dans ${daysUntil(vehicle.dateExpAssurance)} jours` : undefined}
        />
        <InfoItem
          label="Prochain contrôle technique"
          value={vehicle.dateProchainCT ? formatDate(vehicle.dateProchainCT) : undefined}
          alert={vehicle.dateProchainCT ? (isExpired(vehicle.dateProchainCT) ? "expired" : isApproaching(vehicle.dateProchainCT, 60) ? "warning" : undefined) : undefined}
          alertMessage={vehicle.dateProchainCT && isExpired(vehicle.dateProchainCT) ? "Dépassé !" : vehicle.dateProchainCT && isApproaching(vehicle.dateProchainCT, 60) ? `Dans ${daysUntil(vehicle.dateProchainCT)} jours` : undefined}
        />
      </InfoCard>

      {/* Commentaires */}
      {vehicle.commentaire && (
        <div className="md:col-span-2 lg:col-span-3">
          <InfoCard title="Commentaires">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{vehicle.commentaire}</p>
          </InfoCard>
        </div>
      )}
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoItem({
  label,
  value,
  mono = false,
  alert,
  alertMessage,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  alert?: "warning" | "expired";
  alertMessage?: string;
}) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-sm font-medium text-gray-800 ${mono ? "font-mono text-xs" : ""}`}>
        {value || "-"}
        {alert && alertMessage && (
          <span className={`ml-2 text-xs font-semibold ${alert === "expired" ? "text-red-600" : "text-orange-600"}`}>
            {alertMessage}
          </span>
        )}
      </div>
    </div>
  );
}
