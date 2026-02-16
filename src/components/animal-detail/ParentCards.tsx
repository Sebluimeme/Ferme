"use client";

import { useRouter } from "next/navigation";
import type { Animal } from "@/store/store";
import { formatAgeFromBirthDate, getAnimalIcon } from "@/lib/utils";

interface ParentCardsProps {
  animal: Animal;
  animaux: Animal[];
}

export default function ParentCards({ animal, animaux }: ParentCardsProps) {
  const router = useRouter();

  const pere = animal.numeroBouclePere
    ? animaux.find((a) => a.numeroBoucle === animal.numeroBouclePere)
    : null;

  const mere = animal.numeroBoucleMere
    ? animaux.find((a) => a.numeroBoucle === animal.numeroBoucleMere)
    : null;

  // Trouver les descendants (petits) de cet animal
  const descendants = animal.numeroBoucle
    ? animaux.filter(
        (a) =>
          a.numeroBoucleMere === animal.numeroBoucle ||
          a.numeroBouclePere === animal.numeroBoucle
      )
    : [];

  const hasParents = animal.numeroBouclePere || animal.numeroBoucleMere;
  const hasDescendants = descendants.length > 0;

  if (!hasParents && !hasDescendants) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h2 className="text-lg font-semibold mb-4">Filiation</h2>

      {/* Parents */}
      {hasParents && (
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
                    {pere.race || "-"} · {formatAgeFromBirthDate(pere.dateNaissance)}
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
                    {mere.race || "-"} · {formatAgeFromBirthDate(mere.dateNaissance)}
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
      )}

      {/* Descendants */}
      {hasDescendants && (
        <div className={hasParents ? "mt-6" : ""}>
          <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">
            Descendants ({descendants.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {descendants
              .sort((a, b) => {
                if (!a.dateNaissance) return 1;
                if (!b.dateNaissance) return -1;
                return new Date(b.dateNaissance).getTime() - new Date(a.dateNaissance).getTime();
              })
              .map((petit) => (
                <button
                  key={petit.id}
                  onClick={() => router.push(`/animaux/${petit.id}`)}
                  className="border border-gray-200 rounded-lg p-3 bg-green-50/50 hover:bg-green-100/50 transition-colors text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{getAnimalIcon(petit.type)}</span>
                    <span className="text-sm font-semibold text-green-800 truncate">
                      {petit.nom || petit.numeroBoucle || "Sans identifiant"}
                    </span>
                    <span className="text-xs text-gray-500 ml-auto">
                      {petit.sexe === "M" ? "♂" : "♀"}
                    </span>
                  </div>
                  {petit.numeroBoucle && petit.nom && (
                    <div className="text-xs text-gray-500 mb-1">{petit.numeroBoucle}</div>
                  )}
                  <div className="text-xs text-gray-600">
                    {petit.race || "-"} · {formatAgeFromBirthDate(petit.dateNaissance)}
                  </div>
                  {/* Indiquer le lien de parenté */}
                  <div className="text-[10px] text-gray-400 mt-1">
                    {petit.numeroBoucleMere === animal.numeroBoucle &&
                     petit.numeroBouclePere === animal.numeroBoucle
                      ? "mère & père"
                      : petit.numeroBoucleMere === animal.numeroBoucle
                        ? "mère"
                        : "père"}
                  </div>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
