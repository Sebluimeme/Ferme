"use client";

import type { Animal } from "@/store/store";
import { getAnimalIcon, getAnimalLabel, getAnimalBorderColor, getAnimalBgColor, formatAgeFromBirthDate, formatNumber } from "@/lib/utils";

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
    <div className={`bg-white rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all border-l-4 ${getAnimalBorderColor(animal.type)} relative group`}>
      <div
        onClick={() => onClick?.(animal)}
        className="cursor-pointer"
      >
        {/* Header avec infos principales */}
        <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
          <span className="text-xl sm:text-2xl">{getAnimalIcon(animal.type)}</span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm sm:text-base truncate">
              {animal.numeroBoucle || animal.nom || "Animal sans identifiant"}
            </div>
            {animal.nom && (
              <div className="text-[11px] sm:text-xs text-stone-600 truncate">{animal.nom}</div>
            )}
          </div>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${getAnimalBgColor(animal.type)}`}>
            {getAnimalLabel(animal.type)}
          </span>
        </div>

        {/* Infos détaillées - 2 colonnes sur mobile, 4 sur desktop */}
        <div className="px-3 pb-1.5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-0.5 text-[11px] sm:text-xs">
            <div>
              <div className="text-stone-400">Sexe</div>
              <div className="font-medium">{animal.sexe === "M" ? "♂ Mâle" : "♀ Fem."}</div>
            </div>
            <div>
              <div className="text-stone-400">Race</div>
              <div className="font-medium truncate">{animal.race || "-"}</div>
            </div>
            <div>
              <div className="text-stone-400">Âge</div>
              <div className="font-medium">{formatAgeFromBirthDate(animal.dateNaissance)}</div>
            </div>
            <div>
              <div className="text-stone-400">Poids</div>
              <div className="font-medium">{animal.poids ? formatNumber(animal.poids, 2) + " kg" : "-"}</div>
            </div>
          </div>
        </div>

        {/* Dernière modification */}
        {lastModified && (
          <div className="px-3 pb-1 text-[9px] sm:text-[11px] text-stone-400">
            Modifié le {lastModified}
          </div>
        )}
      </div>

      {/* Boutons d'action - positionnés clairement en bas */}
      <div className="px-3 py-1.5 border-t border-stone-100 flex gap-1.5 justify-end">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(animal.id); }}
          className="px-2 py-0.5 sm:px-2.5 sm:py-1 text-[11px] sm:text-xs font-medium bg-stone-100 text-stone-600 border border-stone-200 rounded-md hover:bg-stone-200 transition-all cursor-pointer"
          title="Modifier"
        >
          ✏️ <span className="hidden sm:inline">Modifier</span>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(animal.id); }}
          className="px-2 py-0.5 sm:px-2.5 sm:py-1 text-[11px] sm:text-xs font-medium bg-red-50 text-red-500 border border-red-200 rounded-md hover:bg-red-100 transition-all cursor-pointer"
          title="Supprimer"
        >
          🗑️ <span className="hidden sm:inline">Supprimer</span>
        </button>
      </div>
    </div>
  );
}