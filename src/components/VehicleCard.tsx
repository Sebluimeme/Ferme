"use client";

import type { Vehicle } from "@/types/vehicle";
import {
  getVehicleIcon,
  getVehicleTypeLabel,
  getVehicleBorderColor,
  getVehicleBgColor,
  getStatusLabel,
  getStatusColor,
  formatKilometrage,
  formatHeures,
} from "@/lib/vehicle-utils";
import { getVehicleDisplayName } from "@/services/vehicle-service";

interface VehicleCardProps {
  vehicle: Vehicle;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onClick?: (vehicle: Vehicle) => void;
}

export default function VehicleCard({ vehicle, onEdit, onDelete, onClick }: VehicleCardProps) {
  const displayName = getVehicleDisplayName(vehicle);

  return (
    <div
      className={`bg-white rounded-xl shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all border-l-4 ${getVehicleBorderColor(vehicle.type)}`}
    >
      <div onClick={() => onClick?.(vehicle)} className="cursor-pointer">
        <div className="flex items-center gap-3 p-4 border-b border-gray-200">
          <span className="text-3xl">{getVehicleIcon(vehicle.type)}</span>
          <div className="flex-1">
            <div className="font-semibold text-lg">{displayName}</div>
            {vehicle.plaqueImmatriculation && (
              <div className="text-sm text-gray-600">{vehicle.plaqueImmatriculation}</div>
            )}
            {vehicle.marque && vehicle.modele && (
              <div className="text-xs text-gray-500">
                {vehicle.marque} {vehicle.modele}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1 items-end">
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${getVehicleBgColor(vehicle.type)}`}>
              {getVehicleTypeLabel(vehicle.type)}
            </span>
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${getStatusColor(vehicle.statut)}`}>
              {getStatusLabel(vehicle.statut)}
            </span>
          </div>
        </div>

        <div className="p-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-gray-500 mb-0.5">Année</div>
              <div className="font-medium">{vehicle.annee || "-"}</div>
            </div>
            <div>
              <div className="text-gray-500 mb-0.5">
                {vehicle.type === "tracteur" ? "Heures" : "Kilométrage"}
              </div>
              <div className="font-medium">
                {vehicle.type === "tracteur"
                  ? formatHeures(vehicle.heuresUtilisation)
                  : formatKilometrage(vehicle.kilometrage)}
              </div>
            </div>
            {vehicle.typeCarburant && (
              <div>
                <div className="text-gray-500 mb-0.5">Carburant</div>
                <div className="font-medium capitalize">{vehicle.typeCarburant}</div>
              </div>
            )}
            {vehicle.numeroSerie && (
              <div>
                <div className="text-gray-500 mb-0.5">N° série</div>
                <div className="font-medium text-xs">{vehicle.numeroSerie.substring(0, 10)}...</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl">
        <div className="flex gap-2 justify-end">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(vehicle.id);
            }}
            className="px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 transition-all cursor-pointer"
          >
            ✏️ Modifier
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(vehicle.id);
            }}
            className="px-3 py-1.5 text-sm font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all cursor-pointer"
          >
            🗑️ Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}
