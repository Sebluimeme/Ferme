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
      className={`group bg-white rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all border-l-4 ${getVehicleBorderColor(vehicle.type)}`}
    >
      {/* Photo banner ou placeholder */}
      <div
        className="relative cursor-pointer"
        onClick={() => onClick?.(vehicle)}
      >
        {vehicle.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={vehicle.photoUrl}
            alt={displayName}
            className="w-full h-36 object-cover rounded-t-lg"
          />
        ) : (
          <div className={`w-full h-36 flex items-center justify-center rounded-t-lg ${getVehicleBgColor(vehicle.type)}`}>
            <span className="text-5xl opacity-60">{getVehicleIcon(vehicle.type)}</span>
          </div>
        )}

        {/* Badges type + statut en overlay */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shadow-sm ${getVehicleBgColor(vehicle.type)}`}>
            {getVehicleTypeLabel(vehicle.type)}
          </span>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shadow-sm ${getStatusColor(vehicle.statut)}`}>
            {getStatusLabel(vehicle.statut)}
          </span>
        </div>

        {/* Bouton suppression discret — apparaît au hover */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(vehicle.id);
          }}
          className="absolute top-2 right-2 w-7 h-7 bg-black/40 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-sm flex items-center justify-center hover:bg-red-500/80"
          title="Supprimer"
        >
          🗑
        </button>
      </div>

      {/* Infos véhicule */}
      <div
        onClick={() => onClick?.(vehicle)}
        className="cursor-pointer px-3 py-2.5 border-b border-stone-200"
      >
        <div className="font-semibold text-sm sm:text-base">{displayName}</div>
        {vehicle.plaqueImmatriculation && (
          <div className="text-xs text-stone-600">{vehicle.plaqueImmatriculation}</div>
        )}
        {vehicle.marque && vehicle.modele && (
          <div className="text-[11px] text-stone-500">
            {vehicle.marque} {vehicle.modele}
          </div>
        )}
      </div>

      <div onClick={() => onClick?.(vehicle)} className="cursor-pointer px-3 py-2">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <div className="text-stone-500">Mise en circulation</div>
            <div className="font-medium">
              {vehicle.dateMiseEnCirculation
                ? new Date(vehicle.dateMiseEnCirculation).toLocaleDateString("fr-FR")
                : "-"}
            </div>
          </div>
          <div>
            <div className="text-stone-500">
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

      <div className="px-3 py-1.5 border-t border-stone-200 bg-stone-50 rounded-b-lg">
        <div className="flex gap-1.5 justify-end">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(vehicle.id);
            }}
            className="px-2.5 py-1 text-xs font-medium bg-stone-100 text-stone-700 border border-stone-300 rounded-md hover:bg-stone-200 transition-all cursor-pointer"
          >
            ✏️ Modifier
          </button>
        </div>
      </div>
    </div>
  );
}
