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
      className={`bg-white rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all border-l-4 ${getVehicleBorderColor(vehicle.type)}`}
    >
      <div onClick={() => onClick?.(vehicle)} className="cursor-pointer">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-200">
          {vehicle.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={vehicle.photoUrl}
              alt={displayName}
              className="w-10 h-10 rounded-md object-cover border border-gray-200 flex-shrink-0"
            />
          ) : (
            <span className="text-2xl">{getVehicleIcon(vehicle.type)}</span>
          )}
          <div className="flex-1">
            <div className="font-semibold text-sm sm:text-base">{displayName}</div>
            {vehicle.plaqueImmatriculation && (
              <div className="text-xs text-gray-600">{vehicle.plaqueImmatriculation}</div>
            )}
            {vehicle.marque && vehicle.modele && (
              <div className="text-[11px] text-gray-500">
                {vehicle.marque} {vehicle.modele}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1 items-end">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${getVehicleBgColor(vehicle.type)}`}>
              {getVehicleTypeLabel(vehicle.type)}
            </span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${getStatusColor(vehicle.statut)}`}>
              {getStatusLabel(vehicle.statut)}
            </span>
          </div>
        </div>

        <div className="px-3 py-2">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-gray-500">Mise en circulation</div>
              <div className="font-medium">
                {vehicle.dateMiseEnCirculation
                  ? new Date(vehicle.dateMiseEnCirculation).toLocaleDateString("fr-FR")
                  : "-"}
              </div>
            </div>
            <div>
              <div className="text-gray-500">
                {vehicle.type === "tracteur" ? "Heures" : "Kilométrage"}
              </div>
              <div className="font-medium">
                {vehicle.type === "tracteur"
                  ? formatHeures(vehicle.heuresUtilisation)
                  : formatKilometrage(vehicle.kilometrage)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-3 py-1.5 border-t border-gray-200 bg-gray-50 rounded-b-lg">
        <div className="flex gap-1.5 justify-end">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(vehicle.id);
            }}
            className="px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-200 transition-all cursor-pointer"
          >
            ✏️ Modifier
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(vehicle.id);
            }}
            className="px-2.5 py-1 text-xs font-medium bg-red-500 text-white rounded-md hover:bg-red-600 transition-all cursor-pointer"
          >
            🗑️ Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}
