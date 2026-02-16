"use client";

import type { Animal } from "@/store/store";
import { getAnimalIcon, getAnimalLabel, getAnimalBorderColor, getAnimalBgColor, formatAge, formatNumber } from "@/lib/utils";

interface AnimalCardProps {
  animal: Animal;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onClick?: (animal: Animal) => void;
}

function formatLastModified(dateStr?: string): string | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " + date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default function AnimalCard({ animal, onEdit, onDelete, onClick }: AnimalCardProps) {
  const lastModified = formatLastModified(animal.derniereMAJ);

  return (
    <div className={`bg-white rounded-xl shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all border-l-4 ${getAnimalBorderColor(animal.type)} relative group`}>
      <div
        onClick={() => onClick?.(animal)}
        className="cursor-pointer"
      >
        {/* Header avec infos principales */}
        <div className="flex items-center gap-3 p-4 pb-2">
          <span className="text-2xl sm:text-3xl">{getAnimalIcon(animal.type)}</span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-base sm:text-lg truncate">
              {animal.nom || animal.numeroBoucle || "Animal sans identifiant"}
            </div>
            {animal.numeroBoucle && animal.nom && (
              <div className="text-xs sm:text-sm text-gray-600 truncate">{animal.numeroBoucle}</div>
            )}
          </div>
          <span className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${getAnimalBgColor(animal.type)}`}>
            {getAnimalLabel(animal.type)}
          </span>
        </div>

        {/* Infos détaillées - 2 colonnes sur mobile, 4 sur desktop */}
        <div className="px-4 pb-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs sm:text-sm">
            <div>
              <div className="text-gray-400 mb-0.5">Sexe</div>
              <div className="font-medium">{animal.sexe === "M" ? "♂ Mâle" : "♀ Fem."}</div>
            </div>
            <div>
              <div className="text-gray-400 mb-0.5">Race</div>
              <div className="font-medium truncate">{animal.race || "-"}</div>
            </div>
            <div>
              <div className="text-gray-400 mb-0.5">Âge</div>
              <div className="font-medium">{animal.ageMois ? formatAge(animal.ageMois) : "-"}</div>
            </div>
            <div>
              <div className="text-gray-400 mb-0.5">Poids</div>
              <div className="font-medium">{animal.poids ? formatNumber(animal.poids, 2) + " kg" : "-"}</div>
            </div>
          </div>
        </div>

        {/* Dernière modification */}
        {lastModified && (
          <div className="px-4 pb-2 text-[10px] sm:text-xs text-gray-400">
            Modifié le {lastModified}
          </div>
        )}
      </div>

      {/* Boutons d'action - positionnés clairement en bas */}
      <div className="px-4 py-2 border-t border-gray-100 flex gap-2 justify-end">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(animal.id); }}
          className="px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium bg-gray-100 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-200 transition-all cursor-pointer"
          title="Modifier"
        >
          ✏️ <span className="hidden sm:inline">Modifier</span>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(animal.id); }}
          className="px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium bg-red-50 text-red-500 border border-red-200 rounded-lg hover:bg-red-100 transition-all cursor-pointer"
          title="Supprimer"
        >
          🗑️ <span className="hidden sm:inline">Supprimer</span>
        </button>
      </div>
    </div>
  );
}
