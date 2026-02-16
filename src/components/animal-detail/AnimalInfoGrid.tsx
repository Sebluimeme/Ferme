"use client";

import type { Animal } from "@/store/store";
import { getAnimalIcon, formatAgeFromBirthDate, formatNumber, formatDate } from "@/lib/utils";

interface AnimalInfoGridProps {
  animal: Animal;
}

export default function AnimalInfoGrid({ animal }: AnimalInfoGridProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h2 className="text-lg font-semibold mb-4">Informations</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-gray-500 mb-0.5">Type</div>
          <div className="font-medium">{getAnimalIcon(animal.type)} {animal.type.charAt(0).toUpperCase() + animal.type.slice(1)}</div>
        </div>
        <div>
          <div className="text-gray-500 mb-0.5">Sexe</div>
          <div className="font-medium">{animal.sexe === "M" ? "♂ Mâle" : "♀ Femelle"}</div>
        </div>
        <div>
          <div className="text-gray-500 mb-0.5">Race</div>
          <div className="font-medium">{animal.race || "-"}</div>
        </div>
        <div>
          <div className="text-gray-500 mb-0.5">Date de naissance</div>
          <div className="font-medium">{animal.dateNaissance ? formatDate(animal.dateNaissance, "long") : "-"}</div>
        </div>
        <div>
          <div className="text-gray-500 mb-0.5">Âge</div>
          <div className="font-medium">{formatAgeFromBirthDate(animal.dateNaissance)}</div>
        </div>
        <div>
          <div className="text-gray-500 mb-0.5">Poids</div>
          <div className="font-medium">{animal.poids ? formatNumber(animal.poids, 2) + " kg" : "-"}</div>
        </div>
        {animal.commentaire && (
          <div className="col-span-full">
            <div className="text-gray-500 mb-0.5">Commentaire</div>
            <div className="font-medium">{animal.commentaire}</div>
          </div>
        )}
      </div>
    </div>
  );
}
