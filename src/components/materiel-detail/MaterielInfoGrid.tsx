"use client";

import type { Materiel } from "@/store/store";
import { getMaterielLabel, getStatutLabel } from "@/services/materiel-service";

interface MaterielInfoGridProps {
  materiel: Materiel;
}

export default function MaterielInfoGrid({ materiel }: MaterielInfoGridProps) {
  const fields = [
    { label: "Nom", value: materiel.nom },
    { label: "Type", value: getMaterielLabel(materiel.type) },
    { label: "Marque", value: materiel.marque || "-" },
    { label: "Modèle", value: materiel.modele || "-" },
    { label: "Année", value: materiel.annee || "-" },
    { label: "Immatriculation", value: materiel.immatriculation || "-" },
    { label: "Statut", value: getStatutLabel(materiel.statut) },
    { label: "Commentaire", value: materiel.commentaire || "-" },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h3 className="text-lg font-semibold mb-4">Informations générales</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {fields.map((field) => (
          <div key={field.label}>
            <div className="text-sm text-gray-500 mb-1">{field.label}</div>
            <div className="font-medium">{field.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
