"use client";

import { useRouter } from "next/navigation";
import type { Animal } from "@/store/store";
import { getAnimalIcon, getAnimalBgColor } from "@/lib/utils";

interface AnimalHeaderProps {
  animal: Animal;
  onEdit: () => void;
  onDelete: () => void;
}

const statutColors: Record<string, string> = {
  actif: "bg-green-100 text-green-700",
  vendu: "bg-blue-100 text-blue-700",
  mort: "bg-gray-100 text-gray-500",
  reforme: "bg-amber-100 text-amber-700",
};

const statutLabels: Record<string, string> = {
  actif: "Actif",
  vendu: "Vendu",
  mort: "Mort",
  reforme: "Réformé",
};

export default function AnimalHeader({ animal, onEdit, onDelete }: AnimalHeaderProps) {
  const router = useRouter();

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 mb-6">
      <div className="flex items-start gap-4 flex-wrap">
        <button
          onClick={() => router.push("/animaux")}
          className="text-gray-500 hover:text-gray-800 text-xl cursor-pointer bg-transparent border-none p-1"
        >
          &larr;
        </button>
        <span className="text-4xl">{getAnimalIcon(animal.type)}</span>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold m-0 truncate">
            {animal.nom || animal.numeroBoucle || "Animal sans identifiant"}
          </h1>
          {animal.numeroBoucle && <div className="text-sm text-gray-500 mt-1">{animal.numeroBoucle}</div>}
          <div className="flex gap-2 mt-2 flex-wrap">
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${getAnimalBgColor(animal.type)}`}>
              {animal.type.charAt(0).toUpperCase() + animal.type.slice(1)}
            </span>
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${statutColors[animal.statut] || ""}`}>
              {statutLabels[animal.statut] || animal.statut}
            </span>
            {animal.sexe && (
              <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                {animal.sexe === "M" ? "♂ Mâle" : "♀ Femelle"}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 cursor-pointer"
          >
            Modifier
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-1.5 text-sm font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 cursor-pointer"
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}
