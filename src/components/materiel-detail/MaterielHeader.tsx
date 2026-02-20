"use client";

import { useRouter } from "next/navigation";
import type { Materiel } from "@/store/store";
import { getMaterielIcon, getStatutLabel, getStatutColor } from "@/services/materiel-service";

interface MaterielHeaderProps {
  materiel: Materiel;
  onEdit: () => void;
  onDelete: () => void;
}

export default function MaterielHeader({ materiel, onEdit, onDelete }: MaterielHeaderProps) {
  const router = useRouter();

  return (
    <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
      <div className="flex items-start gap-4 flex-wrap">
        <button
          onClick={() => router.push("/materiel")}
          className="text-gray-400 hover:text-gray-600 text-sm cursor-pointer"
        >
          ← Retour
        </button>
        <span className="text-4xl">{getMaterielIcon(materiel.type)}</span>
        <div className="flex-1">
          <h1 className="text-2xl font-bold m-0">{materiel.nom}</h1>
          <div className="text-gray-600 mt-1">
            {[materiel.marque, materiel.modele].filter(Boolean).join(" ")}
          </div>
        </div>
        <span className={`text-xs font-medium px-3 py-1.5 rounded-full ${getStatutColor(materiel.statut)}`}>
          {getStatutLabel(materiel.statut)}
        </span>
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 transition-all cursor-pointer"
          >
            ✏️ Modifier
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-1.5 text-sm font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all cursor-pointer"
          >
            🗑️ Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}
