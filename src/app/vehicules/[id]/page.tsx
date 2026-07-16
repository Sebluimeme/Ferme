"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useAppStore } from "@/store/store";
import type { MeterReadingType, Vehicle } from "@/types/vehicle";
import VehicleHeader from "@/components/vehicle-detail/VehicleHeader";
import VehicleInfoGrid from "@/components/vehicle-detail/VehicleInfoGrid";
import MaintenanceTimeline from "@/components/vehicle-detail/MaintenanceTimeline";
import VehiclePhotoGallery from "@/components/vehicle-detail/VehiclePhotoGallery";
import VehicleDocuments from "@/components/vehicle-detail/VehicleDocuments";
import VehicleComposantsTab from "@/components/vehicle-detail/VehicleComposantsTab";

type MeterModalType = MeterReadingType | "both";

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
  const [autoOpenMeterType, setAutoOpenMeterType] = useState<MeterModalType | null>(null);
  const [autoOpenMaintenanceForm, setAutoOpenMaintenanceForm] = useState(false);
  const [autoOpenMaintenanceId, setAutoOpenMaintenanceId] = useState<string | null>(null);

  useEffect(() => {
    const found = state.vehicles.find((v) => v.id === vehicleId);
    if (found) {
      setVehicle(found);
    }
  }, [vehicleId, state.vehicles]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    const meter = params.get("meter");

    if (tab && TABS.some((item) => item.id === tab)) {
      setActiveTab(tab);
    }

    if (meter === "kilometrage" || meter === "heures" || meter === "both") {
      setActiveTab("info");
      setAutoOpenMeterType(meter);
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }

    if (params.get("maintenanceAction") === "complete" || params.get("maintenanceAction") === "add") {
      setActiveTab("entretien");
      setAutoOpenMaintenanceId(params.get("maintenanceId"));
      setAutoOpenMaintenanceForm(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  if (!vehicle) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-4">⏳</div>
        <p className="text-stone-500">Chargement du véhicule...</p>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <VehicleHeader vehicle={vehicle} />

      {/* Onglets */}
      <div className="bg-white rounded-xl shadow-sm mb-6">
        <div className="flex border-b border-stone-200 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-stone-600 hover:text-stone-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === "info" && <VehicleInfoGrid vehicle={vehicle} autoOpenMeterType={autoOpenMeterType} onAutoOpenConsumed={() => setAutoOpenMeterType(null)} />}
          {activeTab === "composants" && (
            <VehicleComposantsTab
              vehicleId={vehicle.id}
              initialComposants={vehicle.composants || []}
            />
          )}
          {activeTab === "entretien" && <MaintenanceTimeline vehicleId={vehicle.id} autoOpenForm={autoOpenMaintenanceForm} autoOpenMaintenanceId={autoOpenMaintenanceId} onAutoOpenConsumed={() => { setAutoOpenMaintenanceForm(false); setAutoOpenMaintenanceId(null); }} />}
          {activeTab === "photos" && <VehiclePhotoGallery vehicleId={vehicle.id} />}
          {activeTab === "documents" && <VehicleDocuments vehicleId={vehicle.id} />}
        </div>
      </div>
    </div>
  );
}