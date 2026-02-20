"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useAppStore } from "@/store/store";
import type { Vehicle } from "@/types/vehicle";
import VehicleHeader from "@/components/vehicle-detail/VehicleHeader";
import VehicleInfoGrid from "@/components/vehicle-detail/VehicleInfoGrid";
import MaintenanceTimeline from "@/components/vehicle-detail/MaintenanceTimeline";
import VehiclePhotoGallery from "@/components/vehicle-detail/VehiclePhotoGallery";
import VehicleDocuments from "@/components/vehicle-detail/VehicleDocuments";
import VehicleComposantsTab from "@/components/vehicle-detail/VehicleComposantsTab";

const TABS = [
  { id: "info", label: "Informations" },
  { id: "composants", label: "Composants" },
  { id: "entretien", label: "Entretien" },
  { id: "photos", label: "Photos" },
  { id: "documents", label: "Documents" },
];

export default function VehicleDetailPage() {
  const params = useParams();
  const vehicleId = params.id as string;
  const { state } = useAppStore();

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [activeTab, setActiveTab] = useState("info");

  useEffect(() => {
    const found = state.vehicles.find((v) => v.id === vehicleId);
    if (found) {
      setVehicle(found);
    }
  }, [vehicleId, state.vehicles]);

  if (!vehicle) {
    return (
      <div className="p-4 md:p-6 lg:p-8">
        <div className="text-center py-16">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-gray-500">Chargement du véhicule...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <VehicleHeader vehicle={vehicle} />

      {/* Onglets */}
      <div className="bg-white rounded-xl shadow-sm mb-6">
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-600 hover:text-gray-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === "info" && <VehicleInfoGrid vehicle={vehicle} />}
          {activeTab === "composants" && (
            <VehicleComposantsTab
              vehicleId={vehicle.id}
              initialComposants={vehicle.composants || []}
            />
          )}
          {activeTab === "entretien" && <MaintenanceTimeline vehicleId={vehicle.id} />}
          {activeTab === "photos" && <VehiclePhotoGallery vehicleId={vehicle.id} />}
          {activeTab === "documents" && <VehicleDocuments vehicleId={vehicle.id} />}
        </div>
      </div>
    </div>
  );
}
