"use client";

import { useRouter } from "next/navigation";
import type { Vehicle } from "@/types/vehicle";
import { getVehicleIcon, getVehicleTypeLabel, getStatusLabel, getStatusColor } from "@/lib/vehicle-utils";
import { getVehicleDisplayName } from "@/services/vehicle-service";

interface VehicleHeaderProps {
  vehicle: Vehicle;
}

export default function VehicleHeader({ vehicle }: VehicleHeaderProps) {
  const router = useRouter();
  const displayName = getVehicleDisplayName(vehicle);

  return (
    <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
      <button onClick={() => router.push("/vehicules")} className="text-primary hover:underline mb-4 inline-flex items-center gap-2">
        ← Retour au parc de véhicules
      </button>

      <div className="flex items-start gap-4">
        <div className="text-5xl">{getVehicleIcon(vehicle.type)}</div>
        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800">{displayName}</h1>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className={`text-xs font-medium px-3 py-1 rounded-full ${getStatusColor(vehicle.statut)}`}>
              {getStatusLabel(vehicle.statut)}
            </span>
            <span className="text-xs font-medium px-3 py-1 rounded-full bg-gray-100 text-gray-700">
              {getVehicleTypeLabel(vehicle.type)}
            </span>
            {vehicle.plaqueImmatriculation && (
              <span className="text-xs font-medium px-3 py-1 rounded-full bg-blue-50 text-blue-700">
                {vehicle.plaqueImmatriculation}
              </span>
            )}
          </div>
          {vehicle.marque && vehicle.modele && (
            <p className="text-gray-600 mt-2">
              {vehicle.marque} {vehicle.modele}
              {vehicle.dateMiseEnCirculation && ` • ${new Date(vehicle.dateMiseEnCirculation).toLocaleDateString("fr-FR")}`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
