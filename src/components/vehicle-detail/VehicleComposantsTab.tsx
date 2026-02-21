"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import { updateVehicleComposants } from "@/services/vehicle-service";
import type { Composant } from "@/store/store";

interface VehicleComposantsTabProps {
  vehicleId: string;
  initialComposants: Composant[];
}

export default function VehicleComposantsTab({ vehicleId, initialComposants }: VehicleComposantsTabProps) {
  const [composants, setComposants] = useState<Composant[]>(initialComposants);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const addLine = () => {
    setComposants([...composants, { id: crypto.randomUUID(), nom: "", reference: "" }]);
  };

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const removeLine = (id: string) => {
    const c = composants.find((c) => c.id === id);
    if (c && (c.nom.trim() || c.reference.trim())) {
      setDeleteTarget(id);
    } else {
      setComposants(composants.filter((c) => c.id !== id));
    }
  };

  const confirmDelete = () => {
    if (deleteTarget) {
      setComposants(composants.filter((c) => c.id !== deleteTarget));
      setDeleteTarget(null);
    }
  };

  const updateLine = (id: string, field: "nom" | "reference", value: string) => {
    setComposants(composants.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const save = async () => {
    setSaving(true);
    try {
      const cleaned = composants.filter((c) => c.nom.trim() || c.reference.trim());
      const result = await updateVehicleComposants(vehicleId, cleaned);
      if (result.success) {
        setComposants(cleaned);
        showToast({ type: "success", title: "Succès", message: "Composants enregistrés" });
      } else {
        showToast({ type: "error", title: "Erreur", message: result.error || "Erreur lors de la sauvegarde" });
      }
    } catch {
      showToast({ type: "error", title: "Erreur", message: "Impossible de sauvegarder" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Références des composants</h3>
        <button
          onClick={addLine}
          className="px-3 py-1.5 text-sm font-medium text-white bg-gradient-to-br from-primary to-secondary rounded-lg hover:from-primary-dark hover:to-secondary-dark cursor-pointer"
        >
          + Ajouter
        </button>
      </div>

      {composants.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <div className="text-4xl mb-2">🔩</div>
          <p>Aucun composant enregistré</p>
          <p className="text-sm">Cliquez sur &quot;+ Ajouter&quot; pour ajouter une référence de pièce</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* En-tête */}
          <div className="grid grid-cols-[1fr_1fr_40px] gap-3 text-sm font-medium text-gray-500 px-1">
            <div>Composant</div>
            <div>Référence</div>
            <div></div>
          </div>

          {/* Lignes */}
          {composants.map((composant) => (
            <div key={composant.id} className="grid grid-cols-[1fr_1fr_40px] gap-3 items-center">
              <input
                type="text"
                value={composant.nom}
                onChange={(e) => updateLine(composant.id, "nom", e.target.value)}
                placeholder="Ex: Moteur, Filtre..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
              <input
                type="text"
                value={composant.reference}
                onChange={(e) => updateLine(composant.id, "reference", e.target.value)}
                placeholder="Ex: REF-ABC123"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
              <button
                onClick={() => removeLine(composant.id)}
                className="w-10 h-10 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                title="Supprimer"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}

      {composants.length > 0 && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-primary to-secondary rounded-lg hover:from-primary-dark hover:to-secondary-dark cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Enregistrement..." : "Enregistrer les composants"}
          </button>
        </div>
      )}

      {/* Confirmation de suppression */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">Supprimer ce composant ?</h3>
            <p className="text-sm text-gray-600 mb-1">
              <strong>{composants.find((c) => c.id === deleteTarget)?.nom || "Composant"}</strong>
            </p>
            <p className="text-sm text-gray-500 mb-4">
              {composants.find((c) => c.id === deleteTarget)?.reference || ""}
            </p>
            <p className="text-sm text-gray-500 mb-6">
              N&apos;oubliez pas d&apos;enregistrer après la suppression.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors cursor-pointer"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
