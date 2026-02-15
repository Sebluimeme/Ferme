"use client";

import { useRouter } from "next/navigation";
import type { Animal } from "@/store/store";
import { formatAge } from "@/lib/utils";

interface ParentCardsProps {
  animal: Animal;
  animaux: Animal[];
}

export default function ParentCards({ animal, animaux }: ParentCardsProps) {
  const router = useRouter();

  if (!animal.numeroBouclePere && !animal.numeroBoucleMere) return null;

  const pere = animal.numeroBouclePere
    ? animaux.find((a) => a.numeroBoucle === animal.numeroBouclePere)
    : null;

  const mere = animal.numeroBoucleMere
    ? animaux.find((a) => a.numeroBoucle === animal.numeroBoucleMere)
    : null;

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h2 className="text-lg font-semibold mb-4">Filiation</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {animal.numeroBouclePere && (
          <div className="border border-gray-200 rounded-lg p-4 bg-blue-50/50">
            <div className="text-xs font-semibold text-blue-600 uppercase mb-2">♂ Père</div>
            {pere ? (
              <div>
                <button
                  onClick={() => router.push(`/animaux/${pere.id}`)}
                  className="text-base font-semibold text-blue-700 hover:underline cursor-pointer bg-transparent border-none p-0"
                >
                  {pere.nom || pere.numeroBoucle || "Père"}
                </button>
                {pere.numeroBoucle && <div className="text-sm text-gray-600 mt-1">{pere.numeroBoucle}</div>}
                <div className="text-sm text-gray-600">
                  {pere.race || "-"} · {pere.ageMois ? formatAge(pere.ageMois) : "-"}
                </div>
              </div>
            ) : (
              <div>
                <div className="text-sm font-medium text-gray-700">{animal.numeroBouclePere}</div>
                <div className="text-xs text-gray-400 mt-1">Non trouvé dans le troupeau</div>
              </div>
            )}
          </div>
        )}

        {animal.numeroBoucleMere && (
          <div className="border border-gray-200 rounded-lg p-4 bg-pink-50/50">
            <div className="text-xs font-semibold text-pink-600 uppercase mb-2">♀ Mère</div>
            {mere ? (
              <div>
                <button
                  onClick={() => router.push(`/animaux/${mere.id}`)}
                  className="text-base font-semibold text-pink-700 hover:underline cursor-pointer bg-transparent border-none p-0"
                >
                  {mere.nom || mere.numeroBoucle || "Mère"}
                </button>
                {mere.numeroBoucle && <div className="text-sm text-gray-600 mt-1">{mere.numeroBoucle}</div>}
                <div className="text-sm text-gray-600">
                  {mere.race || "-"} · {mere.ageMois ? formatAge(mere.ageMois) : "-"}
                </div>
              </div>
            ) : (
              <div>
                <div className="text-sm font-medium text-gray-700">{animal.numeroBoucleMere}</div>
                <div className="text-xs text-gray-400 mt-1">Non trouvé dans le troupeau</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
