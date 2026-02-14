"use client";

import { useState, useEffect, useRef } from "react";
import type { MaintenanceEntry, MaintenanceFormData, PartUsed } from "@/types/vehicle";
import {
  addMaintenance,
  updateMaintenance,
  deleteMaintenance,
  listenMaintenanceEntries,
} from "@/services/vehicle-detail-service";
import { useToast } from "../Toast";
import Modal, { ConfirmModal } from "../Modal";
import { formatDate, formatCurrency } from "@/lib/utils";
import {
  getMaintenanceTypeLabel,
  getMaintenanceTypeIcon,
  getMaintenanceStatusColor,
  formatKilometrage,
  formatHeures,
  daysUntil,
  isExpired,
} from "@/lib/vehicle-utils";

interface MaintenanceTimelineProps {
  vehicleId: string;
}

export default function MaintenanceTimeline({ vehicleId }: MaintenanceTimelineProps) {
  const { showToast } = useToast();
  const [entries, setEntries] = useState<MaintenanceEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState<MaintenanceEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MaintenanceEntry | null>(null);
  const [loading, setLoading] = useState(false);

  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    const unsubscribe = listenMaintenanceEntries(vehicleId, (data) => {
      setEntries(data.sort((a, b) => {
        const dateA = a.dateEffectuee || a.datePlanifiee || "";
        const dateB = b.dateEffectuee || b.datePlanifiee || "";
        return dateB.localeCompare(dateA);
      }));
    });
    return () => unsubscribe();
  }, [vehicleId]);

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expanded);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpanded(newExpanded);
  };

  const handleSubmit = async () => {
    if (!formRef.current) return;

    setLoading(true);
    const formData = new FormData(formRef.current);
    const data = Object.fromEntries(formData.entries()) as unknown as MaintenanceFormData;

    const result = editEntry
      ? await updateMaintenance(editEntry.id, vehicleId, data)
      : await addMaintenance(vehicleId, data);

    if (result.success) {
      showToast({
        type: "success",
        title: editEntry ? "Entretien modifié" : "Entretien ajouté",
        message: "L'enregistrement a été effectué avec succès",
      });
      setShowForm(false);
      setEditEntry(null);
      formRef.current.reset();
    } else {
      showToast({ type: "error", title: "Erreur", message: result.error || "Impossible d'enregistrer" });
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setLoading(true);
    const result = await deleteMaintenance(deleteTarget.id);

    if (result.success) {
      showToast({ type: "success", title: "Entretien supprimé", message: "L'entretien a été supprimé" });
      setDeleteTarget(null);
    } else {
      showToast({ type: "error", title: "Erreur", message: result.error || "Impossible de supprimer" });
    }
    setLoading(false);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Historique d'entretien</h3>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
        >
          + Ajouter un entretien
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <div className="text-4xl mb-3">🔧</div>
          <p className="text-gray-500">Aucun entretien enregistré</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const isExpandedEntry = expanded.has(entry.id);
            const showAlert = entry.prochaineDate && (isExpired(entry.prochaineDate) || daysUntil(entry.prochaineDate) <= 30);

            return (
              <div
                key={entry.id}
                className={`bg-white border rounded-lg overflow-hidden transition-all ${
                  showAlert ? "border-orange-300 bg-orange-50/30" : "border-gray-200"
                }`}
              >
                <div
                  onClick={() => toggleExpand(entry.id)}
                  className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{getMaintenanceTypeIcon(entry.type)}</span>
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-semibold text-gray-800">{entry.titre}</h4>
                          <p className="text-sm text-gray-600">{getMaintenanceTypeLabel(entry.type)}</p>
                        </div>
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${getMaintenanceStatusColor(entry.statut)}`}>
                          {entry.statut === "planifie" ? "Planifié" : entry.statut === "en_cours" ? "En cours" : entry.statut === "termine" ? "Terminé" : "Annulé"}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
                        {entry.dateEffectuee && <span>✅ Effectué le {formatDate(entry.dateEffectuee)}</span>}
                        {entry.datePlanifiee && !entry.dateEffectuee && <span>📅 Planifié le {formatDate(entry.datePlanifiee)}</span>}
                        {entry.garage && <span>🔧 {entry.garage}</span>}
                        {entry.coutTotal && <span>💰 {formatCurrency(entry.coutTotal)}</span>}
                      </div>
                      {showAlert && entry.prochaineDate && (
                        <div className="mt-2 text-sm font-semibold text-orange-700">
                          ⚠️ Prochain entretien {isExpired(entry.prochaineDate) ? "dépassé" : `dans ${daysUntil(entry.prochaineDate)} jours`}
                        </div>
                      )}
                    </div>
                    <span className="text-gray-400">{isExpandedEntry ? "▼" : "▶"}</span>
                  </div>
                </div>

                {isExpandedEntry && (
                  <div className="border-t border-gray-200 p-4 bg-gray-50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      {entry.description && (
                        <div className="md:col-span-2">
                          <p className="text-sm text-gray-700">{entry.description}</p>
                        </div>
                      )}
                      {entry.kilometrageEffectue && (
                        <div>
                          <p className="text-xs text-gray-500">Kilométrage</p>
                          <p className="text-sm font-medium">{formatKilometrage(entry.kilometrageEffectue)}</p>
                        </div>
                      )}
                      {entry.heuresEffectuees && (
                        <div>
                          <p className="text-xs text-gray-500">Heures</p>
                          <p className="text-sm font-medium">{formatHeures(entry.heuresEffectuees)}</p>
                        </div>
                      )}
                      {entry.prochainKm && (
                        <div>
                          <p className="text-xs text-gray-500">Prochain entretien (km)</p>
                          <p className="text-sm font-medium">{formatKilometrage(entry.prochainKm)}</p>
                        </div>
                      )}
                      {entry.prochaineDate && (
                        <div>
                          <p className="text-xs text-gray-500">Prochain entretien (date)</p>
                          <p className="text-sm font-medium">{formatDate(entry.prochaineDate)}</p>
                        </div>
                      )}
                      {entry.coutMain && (
                        <div>
                          <p className="text-xs text-gray-500">Main d'œuvre</p>
                          <p className="text-sm font-medium">{formatCurrency(entry.coutMain)}</p>
                        </div>
                      )}
                      {entry.coutPieces && (
                        <div>
                          <p className="text-xs text-gray-500">Pièces</p>
                          <p className="text-sm font-medium">{formatCurrency(entry.coutPieces)}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditEntry(entry);
                        }}
                        className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(entry);
                        }}
                        className="px-3 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Ajout/Modification */}
      <Modal
        isOpen={showForm || !!editEntry}
        onClose={() => {
          setShowForm(false);
          setEditEntry(null);
          formRef.current?.reset();
        }}
        title={editEntry ? "Modifier l'entretien" : "Ajouter un entretien"}
        size="large"
      >
        <MaintenanceForm entry={editEntry} formRef={formRef} />
        <div className="flex gap-2 justify-end mt-6">
          <button
            onClick={() => {
              setShowForm(false);
              setEditEntry(null);
              formRef.current?.reset();
            }}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50"
          >
            {loading ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </Modal>

      {/* Modal Suppression */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        danger
        message={`Êtes-vous sûr de vouloir supprimer cet entretien : <strong>${deleteTarget?.titre}</strong> ?`}
      />
    </div>
  );
}

function MaintenanceForm({ entry, formRef }: { entry: MaintenanceEntry | null; formRef: React.RefObject<HTMLFormElement> }) {
  return (
    <form ref={formRef} className="grid gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">
            Type <span className="text-red-500">*</span>
          </label>
          <select name="type" defaultValue={entry?.type || ""} required className="w-full px-3 py-2 border rounded-lg">
            <option value="">Sélectionnez...</option>
            <option value="vidange">🛢️ Vidange</option>
            <option value="filtres">🔧 Filtres</option>
            <option value="freins">🛑 Freins</option>
            <option value="pneus">🛞 Pneus</option>
            <option value="batterie">🔋 Batterie</option>
            <option value="courroie">⚙️ Courroie</option>
            <option value="climatisation">❄️ Climatisation</option>
            <option value="controle_technique">✅ Contrôle technique</option>
            <option value="revision">🔍 Révision</option>
            <option value="reparation">🔨 Réparation</option>
            <option value="autre">📋 Autre</option>
          </select>
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">
            Titre <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="titre"
            defaultValue={entry?.titre || ""}
            required
            placeholder="Ex: Vidange moteur"
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
      </div>

      <div>
        <label className="block mb-1 text-sm font-medium text-gray-700">Description</label>
        <textarea
          name="description"
          defaultValue={entry?.description || ""}
          rows={3}
          placeholder="Détails de l'entretien..."
          className="w-full px-3 py-2 border rounded-lg"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">
            Statut <span className="text-red-500">*</span>
          </label>
          <select name="statut" defaultValue={entry?.statut || "planifie"} required className="w-full px-3 py-2 border rounded-lg">
            <option value="planifie">Planifié</option>
            <option value="en_cours">En cours</option>
            <option value="termine">Terminé</option>
            <option value="annule">Annulé</option>
          </select>
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">Garage / Mécanicien</label>
          <input
            type="text"
            name="garage"
            defaultValue={entry?.garage || ""}
            placeholder="Garage Martin"
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">Date effectuée</label>
          <input
            type="date"
            name="dateEffectuee"
            defaultValue={entry?.dateEffectuee || ""}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">Date planifiée</label>
          <input
            type="date"
            name="datePlanifiee"
            defaultValue={entry?.datePlanifiee || ""}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">Kilométrage effectué</label>
          <input
            type="number"
            name="kilometrageEffectue"
            defaultValue={entry?.kilometrageEffectue || ""}
            placeholder="50000"
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">Heures effectuées</label>
          <input
            type="number"
            name="heuresEffectuees"
            defaultValue={entry?.heuresEffectuees || ""}
            placeholder="1200"
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
      </div>

      <h4 className="font-semibold text-gray-700 mt-4">Prochain entretien</h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">À X km</label>
          <input
            type="number"
            name="prochainKm"
            defaultValue={entry?.prochainKm || ""}
            placeholder="60000"
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">À X heures</label>
          <input
            type="number"
            name="prochainesHeures"
            defaultValue={entry?.prochainesHeures || ""}
            placeholder="1400"
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">À la date</label>
          <input
            type="date"
            name="prochaineDate"
            defaultValue={entry?.prochaineDate || ""}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
      </div>

      <h4 className="font-semibold text-gray-700 mt-4">Coûts</h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">Main d'œuvre (€)</label>
          <input
            type="number"
            name="coutMain"
            defaultValue={entry?.coutMain || ""}
            step="0.01"
            placeholder="50.00"
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">Pièces (€)</label>
          <input
            type="number"
            name="coutPieces"
            defaultValue={entry?.coutPieces || ""}
            step="0.01"
            placeholder="30.00"
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">Total (€)</label>
          <input
            type="number"
            name="coutTotal"
            defaultValue={entry?.coutTotal || ""}
            step="0.01"
            placeholder="80.00"
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
      </div>
    </form>
  );
}
