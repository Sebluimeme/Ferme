"use client";

import type { Animal } from "@/store/store";
import { getAnimalIcon, getAnimalLabel, getAnimalBorderColor, getAnimalBgColor, formatAge, formatNumber } from "@/lib/utils";

interface AnimalCardProps {
  animal: Animal;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onClick?: (animal: Animal) => void;
}

export default function AnimalCard({ animal, onEdit, onDelete, onClick }: AnimalCardProps) {
  return (
    <div className={`bg-white rounded-xl shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all border-l-4 ${getAnimalBorderColor(animal.type)}`}>
      <div
        onClick={() => onClick?.(animal)}
        className="cursor-pointer"
      >
        <div className="flex items-center gap-3 p-4 border-b border-gray-200">
          <span className="text-3xl">{getAnimalIcon(animal.type)}</span>
          <div className="flex-1">
            <div className="font-semibold text-lg">{animal.nom || animal.numeroBoucle || "Animal sans identifiant"}</div>
            {animal.numeroBoucle && <div className="text-sm text-gray-600">{animal.numeroBoucle}</div>}
          </div>
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${getAnimalBgColor(animal.type)}`}>
            {getAnimalLabel(animal.type)}
          </span>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-gray-500 mb-0.5">Sexe</div>
              <div className="font-medium">{animal.sexe === "M" ? "♂ Mâle" : "♀ Femelle"}</div>
            </div>
            <div>
              <div className="text-gray-500 mb-0.5">Race</div>
              <div className="font-medium">{animal.race || "-"}</div>
            </div>
            <div>
              <div className="text-gray-500 mb-0.5">Âge</div>
              <div className="font-medium">{animal.ageMois ? formatAge(animal.ageMois) : "-"}</div>
            </div>
            <div>
              <div className="text-gray-500 mb-0.5">Poids</div>
              <div className="font-medium">{animal.poids ? formatNumber(animal.poids, 2) + " kg" : "-"}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl">
        <div className="flex gap-2 justify-end">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(animal.id); }}
            className="px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 transition-all cursor-pointer"
          >
            ✏️ Modifier
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(animal.id); }}
            className="px-3 py-1.5 text-sm font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all cursor-pointer"
          >
            🗑️ Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}
