"use client";

import type { Materiel } from "@/store/store";
import { getMaterielIcon, getMaterielLabel, getStatutLabel, getStatutColor } from "@/services/materiel-service";

interface MaterielCardProps {
  materiel: Materiel;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onClick?: (materiel: Materiel) => void;
}

export default function MaterielCard({ materiel, onEdit, onDelete, onClick }: MaterielCardProps) {
  const composantCount = materiel.composants?.length || 0;

  return (
    <div className="bg-white rounded-xl shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all border-l-4 border-l-blue-500">
      <div
        onClick={() => onClick?.(materiel)}
        className="cursor-pointer"
      >
        <div className="flex items-center gap-3 p-4 border-b border-gray-200">
          <span className="text-3xl">{getMaterielIcon(materiel.type)}</span>
          <div className="flex-1">
            <div className="font-semibold text-lg">{materiel.nom}</div>
            <div className="text-sm text-gray-600">
              {[materiel.marque, materiel.modele].filter(Boolean).join(" ") || "-"}
            </div>
          </div>
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${getStatutColor(materiel.statut)}`}>
            {getStatutLabel(materiel.statut)}
          </span>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-gray-500 mb-0.5">Type</div>
              <div className="font-medium">{getMaterielLabel(materiel.type)}</div>
            </div>
            <div>
              <div className="text-gray-500 mb-0.5">Année</div>
              <div className="font-medium">{materiel.annee || "-"}</div>
            </div>
            <div>
              <div className="text-gray-500 mb-0.5">Immatriculation</div>
              <div className="font-medium">{materiel.immatriculation || "-"}</div>
            </div>
            <div>
              <div className="text-gray-500 mb-0.5">Composants</div>
              <div className="font-medium">{composantCount} référence{composantCount > 1 ? "s" : ""}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl">
        <div className="flex gap-2 justify-end">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(materiel.id); }}
            className="px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 transition-all cursor-pointer"
          >
            ✏️ Modifier
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(materiel.id); }}
            className="px-3 py-1.5 text-sm font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all cursor-pointer"
          >
            🗑️ Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}
