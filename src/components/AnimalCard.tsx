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
    <div className={`group bg-white rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all border-l-4 ${getAnimalBorderColor(animal.type)} flex overflow-hidden`}>

      {/* Photo à gauche — format carré */}
      <div
        className="relative w-28 sm:w-32 shrink-0 self-start cursor-pointer"
        onClick={() => onClick?.(animal)}
      >
        {animal.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={animal.photoUrl}
            alt={animal.nom || animal.numeroBoucle || "Photo"}
            className="w-full aspect-square object-cover"
          />
        ) : (
          <div className={`w-full aspect-square flex items-center justify-center ${getAnimalBgColor(animal.type)}`}>
            <span className="text-4xl opacity-60">{getAnimalIcon(animal.type)}</span>
          </div>
        )}

        {/* Bouton suppression discret — hover uniquement */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(animal.id); }}
          className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/40 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-xs flex items-center justify-center hover:bg-red-500/80 z-10"
          title="Supprimer"
        >
          🗑
        </button>
      </div>

      {/* Infos à droite */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header nom + badge */}
        <div
          onClick={() => onClick?.(animal)}
          className="cursor-pointer px-3 pt-2.5 pb-1.5 flex items-start gap-2"
        >
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm sm:text-base truncate">
              {animal.numeroBoucle || animal.nom || "Animal sans identifiant"}
            </div>
            {animal.nom && (
              <div className="text-[11px] sm:text-xs text-stone-600 truncate">{animal.nom}</div>
            )}
          </div>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0 ${getAnimalBgColor(animal.type)}`}>
            {getAnimalLabel(animal.type)}
          </span>
        </div>

        {/* Infos détaillées */}
        <div
          onClick={() => onClick?.(animal)}
          className="cursor-pointer px-3 pb-2 flex-1"
        >
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] sm:text-xs">
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

          {lastModified && (
            <div className="mt-1.5 text-[9px] sm:text-[10px] text-stone-400">
              Modifié le {lastModified}
            </div>
          )}
        </div>

        {/* Footer — uniquement Modifier */}
        <div className="px-3 py-1.5 border-t border-stone-200 bg-stone-50 flex justify-end">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(animal.id); }}
            className="px-2.5 py-1 text-xs font-medium bg-stone-100 text-stone-700 border border-stone-300 rounded-md hover:bg-stone-200 transition-all cursor-pointer"
            title="Modifier"
          >
            ✏️ Modifier
          </button>
        </div>
      </div>
    </div>
  );
}
