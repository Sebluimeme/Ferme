"use client";

import { useState, useEffect } from "react";
import type { Vehicle, MeterReading, MeterReadingType } from "@/types/vehicle";
import { formatDate, formatCurrency } from "@/lib/utils";
import {
  getStatusLabel,
  formatKilometrage,
  formatHeures,
  formatPuissance,
  isExpired,
  isApproaching,
  daysUntil,
} from "@/lib/vehicle-utils";
import { addMeterReading, listenMeterReadings } from "@/services/vehicle-detail-service";
import { useToast } from "../Toast";
import Modal from "../Modal";

interface VehicleInfoGridProps {
  vehicle: Vehicle;
}

export default function VehicleInfoGrid({ vehicle }: VehicleInfoGridProps) {
  const { showToast } = useToast();
  const [showMeterModal, setShowMeterModal] = useState(false);
  const [meterType, setMeterType] = useState<MeterReadingType>("kilometrage");
  const [meterValue, setMeterValue] = useState("");
  const [meterDate, setMeterDate] = useState(new Date().toISOString().split("T")[0]);
  const [meterComment, setMeterComment] = useState("");
  const [meterLoading, setMeterLoading] = useState(false);
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const unsub = listenMeterReadings(vehicle.id, (data) => {
      setReadings(data.sort((a, b) => b.date.localeCompare(a.date)));
    });
    return () => unsub();
  }, [vehicle.id]);

  const openMeterModal = (type: MeterReadingType) => {
    setMeterType(type);
    setMeterValue("");
    setMeterDate(new Date().toISOString().split("T")[0]);
    setMeterComment("");
    setShowMeterModal(true);
  };

  const handleMeterSubmit = async () => {
    if (!meterValue || isNaN(Number(meterValue))) {
      showToast({ type: "error", title: "Erreur", message: "Veuillez saisir une valeur valide" });
      return;
    }

    setMeterLoading(true);
    const result = await addMeterReading(vehicle.id, {
      type: meterType,
      valeur: meterValue,
      date: meterDate,
      commentaire: meterComment || undefined,
    });

    if (result.success) {
      showToast({
        type: "success",
        title: "Relevé enregistré",
        message: `${meterType === "kilometrage" ? "Kilométrage" : "Heures"} mis à jour`,
      });
      setShowMeterModal(false);
    } else {
      showToast({ type: "error", title: "Erreur", message: result.error || "Impossible d'enregistrer" });
    }
    setMeterLoading(false);
  };

  const kmReadings = readings.filter((r) => r.type === "kilometrage");
  const heuresReadings = readings.filter((r) => r.type === "heures");

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Informations générales */}
        <InfoCard title="Informations générales">
          <InfoItem label="Type" value={vehicle.type} />
          <InfoItem label="Statut" value={getStatusLabel(vehicle.statut)} />
          <InfoItem label="Marque" value={vehicle.marque} />
          <InfoItem label="Modèle" value={vehicle.modele} />
          <InfoItem label="Mise en circulation" value={formatDate(vehicle.dateMiseEnCirculation)} />
          <InfoItem label="Plaque d'immatriculation" value={vehicle.plaqueImmatriculation} />
        </InfoCard>

        {/* Caractéristiques techniques */}
        <InfoCard title="Caractéristiques techniques">
          <InfoItem label="Puissance" value={formatPuissance(vehicle.puissance)} />
        </InfoCard>

        {/* Compteurs avec boutons de mise à jour */}
        <InfoCard title="Compteurs">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-500">Kilométrage</div>
              <div className="text-sm font-medium text-gray-800">{formatKilometrage(vehicle.kilometrage)}</div>
            </div>
            <button
              onClick={() => openMeterModal("kilometrage")}
              className="px-2.5 py-1 text-xs bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors font-medium"
            >
              Mettre à jour
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-500">Heures d&apos;utilisation</div>
              <div className="text-sm font-medium text-gray-800">{formatHeures(vehicle.heuresUtilisation)}</div>
            </div>
            <button
              onClick={() => openMeterModal("heures")}
              className="px-2.5 py-1 text-xs bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors font-medium"
            >
              Mettre à jour
            </button>
          </div>
          {readings.length > 0 && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-xs text-primary hover:underline mt-1"
            >
              {showHistory ? "Masquer l'historique" : `Voir l'historique (${readings.length} relevés)`}
            </button>
          )}
        </InfoCard>

        {/* Financier */}
        <InfoCard title="Financier">
          <InfoItem label="Valeur d'achat" value={formatCurrency(vehicle.valeurAchat)} />
          <InfoItem label="Date d'achat" value={formatDate(vehicle.dateAchat)} />
        </InfoCard>

        {/* Contrôle technique */}
        <InfoCard title="Contrôle technique">
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

      {/* Historique des relevés */}
      {showHistory && readings.length > 0 && (
        <div className="mt-4 bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Historique des relevés</h3>
          <div className="space-y-1">
            {/* En-tête km */}
            {kmReadings.length > 0 && (
              <>
                <div className="text-xs font-semibold text-gray-600 mt-2 mb-1">Kilométrage</div>
                {kmReadings.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-sm py-1 border-b border-gray-100 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">{formatDate(r.date)}</span>
                      <span className="font-medium">{formatKilometrage(r.valeur)}</span>
                    </div>
                    {r.commentaire && <span className="text-xs text-gray-400">{r.commentaire}</span>}
                  </div>
                ))}
              </>
            )}
            {/* En-tête heures */}
            {heuresReadings.length > 0 && (
              <>
                <div className="text-xs font-semibold text-gray-600 mt-3 mb-1">Heures d&apos;utilisation</div>
                {heuresReadings.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-sm py-1 border-b border-gray-100 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">{formatDate(r.date)}</span>
                      <span className="font-medium">{formatHeures(r.valeur)}</span>
                    </div>
                    {r.commentaire && <span className="text-xs text-gray-400">{r.commentaire}</span>}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal de relevé */}
      <Modal
        isOpen={showMeterModal}
        onClose={() => setShowMeterModal(false)}
        title={`Relevé ${meterType === "kilometrage" ? "kilométrage" : "d'heures"}`}
        size="small"
      >
        <div className="space-y-4">
          <div>
            <label className="block mb-1 text-sm font-medium text-gray-700">
              {meterType === "kilometrage" ? "Kilométrage actuel (km)" : "Heures actuelles (h)"}
            </label>
            <input
              type="number"
              value={meterValue}
              onChange={(e) => setMeterValue(e.target.value)}
              placeholder={meterType === "kilometrage" ? "Ex: 52000" : "Ex: 1250"}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              min="0"
              autoFocus
            />
            {vehicle[meterType === "kilometrage" ? "kilometrage" : "heuresUtilisation"] !== undefined && (
              <p className="text-xs text-gray-400 mt-1">
                Valeur actuelle : {meterType === "kilometrage" ? formatKilometrage(vehicle.kilometrage) : formatHeures(vehicle.heuresUtilisation)}
              </p>
            )}
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium text-gray-700">Date du relevé</label>
            <input
              type="date"
              value={meterDate}
              onChange={(e) => setMeterDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium text-gray-700">Commentaire (optionnel)</label>
            <input
              type="text"
              value={meterComment}
              onChange={(e) => setMeterComment(e.target.value)}
              placeholder="Ex: Relevé semestriel"
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-6">
          <button
            onClick={() => setShowMeterModal(false)}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleMeterSubmit}
            disabled={meterLoading || !meterValue}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {meterLoading ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </Modal>
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
  alert,
  alertMessage,
}: {
  label: string;
  value?: string | null;
  alert?: "warning" | "expired";
  alertMessage?: string;
}) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm font-medium text-gray-800">
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
