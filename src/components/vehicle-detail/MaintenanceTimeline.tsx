"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import type { MaintenanceEntry, MaintenanceFormData } from "@/types/vehicle";
import { useAppStore } from "@/store/store";
import {
  addMaintenance,
  updateMaintenance,
  deleteMaintenance,
  listenMaintenanceEntries,
  uploadMaintenanceFacture,
  deleteMaintenanceFacture,
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
  formatAlertMessage,
  daysUntil,
  isExpired,
} from "@/lib/vehicle-utils";

interface MaintenanceTimelineProps {
  vehicleId: string;
}

export default function MaintenanceTimeline({ vehicleId }: MaintenanceTimelineProps) {
  const { showToast } = useToast();
  const { state } = useAppStore();
  const [entries, setEntries] = useState<MaintenanceEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState<MaintenanceEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MaintenanceEntry | null>(null);
  const [loading, setLoading] = useState(false);

  const formRef = useRef<HTMLFormElement | null>(null);
  const factureFileRef = useRef<File | null>(null);

  // Alertes de maintenance pour ce véhicule
  const vehicleAlerts = useMemo(() => {
    return state.maintenanceAlerts.filter((a) => a.vehicleId === vehicleId);
  }, [state.maintenanceAlerts, vehicleId]);

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
      // Upload facture si sélectionnée
      const entryId = editEntry ? editEntry.id : result.id;
      if (factureFileRef.current && entryId) {
        await uploadMaintenanceFacture(entryId, vehicleId, factureFileRef.current);
        factureFileRef.current = null;
      }
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
      {/* Section Entretiens à prévoir */}
      {vehicleAlerts.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Entretiens à prévoir</h3>
          <div className="space-y-2">
            {vehicleAlerts.map((alert, index) => (
              <div
                key={`${alert.maintenanceId || index}-alert`}
                className={`px-4 py-3 rounded-lg border-l-4 ${
                  alert.urgent
                    ? "bg-red-50 border-l-red-500 text-red-800"
                    : "bg-orange-50 border-l-orange-500 text-orange-800"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <strong className="text-sm">{alert.titre || getMaintenanceTypeLabel(alert.type || "autre")}</strong>
                    <p className="text-xs mt-0.5">
                      {formatAlertMessage(alert.raison, alert.valeurActuelle, alert.valeurCible, alert.dateCible, alert.joursRestants)}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    alert.urgent ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"
                  }`}>
                    {alert.urgent ? "Urgent" : "A prévoir"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historique */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Historique d&apos;entretien</h3>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
        >
          + Ajouter un entretien
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-stone-200">
          <div className="text-4xl mb-3">🔧</div>
          <p className="text-stone-500">Aucun entretien enregistré</p>
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
                  showAlert ? "border-orange-300 bg-orange-50/30" : "border-stone-200"
                }`}
              >
                <div
                  onClick={() => toggleExpand(entry.id)}
                  className="p-4 cursor-pointer hover:bg-stone-50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{entry.type ? getMaintenanceTypeIcon(entry.type) : "🔧"}</span>
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-semibold text-stone-800">{entry.titre || "Entretien"}</h4>
                          <p className="text-sm text-stone-600">{entry.type ? getMaintenanceTypeLabel(entry.type) : ""}</p>
                        </div>
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${getMaintenanceStatusColor(entry.statut || "termine")}`}>
                          {entry.statut === "planifie" ? "Planifié" : entry.statut === "en_cours" ? "En cours" : entry.statut === "termine" ? "Terminé" : "Annulé"}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-stone-500">
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
                    <span className="text-stone-400">{isExpandedEntry ? "▼" : "▶"}</span>
                  </div>
                </div>

                {isExpandedEntry && (
                  <div className="border-t border-stone-200 p-4 bg-stone-50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      {entry.description && (
                        <div className="md:col-span-2">
                          <p className="text-sm text-stone-700">{entry.description}</p>
                        </div>
                      )}
                      {entry.kilometrageEffectue && (
                        <div>
                          <p className="text-xs text-stone-500">Kilométrage</p>
                          <p className="text-sm font-medium">{formatKilometrage(entry.kilometrageEffectue)}</p>
                        </div>
                      )}
                      {entry.heuresEffectuees && (
                        <div>
                          <p className="text-xs text-stone-500">Heures</p>
                          <p className="text-sm font-medium">{formatHeures(entry.heuresEffectuees)}</p>
                        </div>
                      )}
                      {entry.prochainKm && (
                        <div>
                          <p className="text-xs text-stone-500">Prochain entretien (km)</p>
                          <p className="text-sm font-medium">{formatKilometrage(entry.prochainKm)}</p>
                        </div>
                      )}
                      {entry.prochaineDate && (
                        <div>
                          <p className="text-xs text-stone-500">Prochain entretien (date)</p>
                          <p className="text-sm font-medium">{formatDate(entry.prochaineDate)}</p>
                        </div>
                      )}
                      {entry.facture && (
                        <div>
                          <p className="text-xs text-stone-500">Facture</p>
                          <a href={entry.facture} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-brand-600 hover:underline">
                            📄 Voir la facture
                          </a>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditEntry(entry);
                        }}
                        className="px-3 py-1.5 text-sm bg-stone-200 text-stone-700 rounded-lg hover:bg-stone-300"
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
        <MaintenanceForm entry={editEntry} formRef={formRef} factureFileRef={factureFileRef} />
        <div className="flex gap-2 justify-end mt-6">
          <button
            onClick={() => {
              setShowForm(false);
              setEditEntry(null);
              formRef.current?.reset();
            }}
            className="px-4 py-2 bg-stone-100 text-stone-700 rounded-lg hover:bg-stone-200"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
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

function MaintenanceForm({ entry, formRef, factureFileRef }: { entry: MaintenanceEntry | null; formRef: React.RefObject<HTMLFormElement | null>; factureFileRef: React.RefObject<File | null> }) {
  const [facturePreview, setFacturePreview] = useState<string | null>(entry?.facture || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <form ref={formRef} className="grid gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-stone-700">Type</label>
          <select name="type" defaultValue={entry?.type || ""} className="w-full px-3 py-2 border rounded-lg">
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
          <label className="block mb-1 text-sm font-medium text-stone-700">Titre</label>
          <input
            type="text"
            name="titre"
            defaultValue={entry?.titre || ""}
            placeholder="Ex: Vidange moteur"
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
      </div>

      <div>
        <label className="block mb-1 text-sm font-medium text-stone-700">Description</label>
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
          <label className="block mb-1 text-sm font-medium text-stone-700">Statut</label>
          <select name="statut" defaultValue={entry?.statut || "termine"} className="w-full px-3 py-2 border rounded-lg">
            <option value="planifie">Planifié</option>
            <option value="en_cours">En cours</option>
            <option value="termine">Terminé</option>
            <option value="annule">Annulé</option>
          </select>
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-stone-700">Mécanicien</label>
          <input
            type="text"
            name="garage"
            defaultValue={entry?.garage || ""}
            placeholder="Nom du mécanicien"
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-stone-700">Date</label>
          <input
            type="date"
            name="dateEffectuee"
            defaultValue={entry?.dateEffectuee || ""}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-stone-700">Coût (€)</label>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-stone-700">Kilométrage</label>
          <input
            type="number"
            name="kilometrageEffectue"
            defaultValue={entry?.kilometrageEffectue || ""}
            placeholder="50000"
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-stone-700">Heures</label>
          <input
            type="number"
            name="heuresEffectuees"
            defaultValue={entry?.heuresEffectuees || ""}
            placeholder="1200"
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
      </div>

      <h4 className="font-semibold text-stone-700 mt-2">Prochain entretien</h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-stone-700">À X km</label>
          <input
            type="number"
            name="prochainKm"
            defaultValue={entry?.prochainKm || ""}
            placeholder="60000"
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-stone-700">À X heures</label>
          <input
            type="number"
            name="prochainesHeures"
            defaultValue={entry?.prochainesHeures || ""}
            placeholder="1400"
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-stone-700">À la date</label>
          <input
            type="date"
            name="prochaineDate"
            defaultValue={entry?.prochaineDate || ""}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
      </div>

      {/* Facture jointe */}
      <div>
        <label className="block mb-1 text-sm font-medium text-stone-700">Facture</label>
        {facturePreview ? (
          <div className="flex items-center gap-3">
            {facturePreview.startsWith("data:image") || facturePreview.startsWith("http") ? (
              <a href={facturePreview} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-600 hover:underline flex items-center gap-1">
                📄 Voir la facture
              </a>
            ) : (
              <span className="text-sm text-stone-700">📄 {facturePreview}</span>
            )}
            <button
              type="button"
              onClick={() => {
                setFacturePreview(null);
                if (factureFileRef) factureFileRef.current = null;
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="px-2 py-1 text-xs text-red-500 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 cursor-pointer"
            >
              Supprimer
            </button>
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="w-full px-3 py-4 border-2 border-dashed border-stone-300 rounded-lg text-center cursor-pointer hover:border-brand-600 hover:bg-brand-600/5 transition-colors"
          >
            <span className="text-stone-400 text-sm">Cliquez pour ajouter une facture (photo ou PDF)</span>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              if (factureFileRef) factureFileRef.current = file;
              if (file.type.startsWith("image/")) {
                const reader = new FileReader();
                reader.onload = (ev) => setFacturePreview(ev.target?.result as string);
                reader.readAsDataURL(file);
              } else {
                setFacturePreview(file.name);
              }
            }
          }}
        />
      </div>
    </form>
  );
}
