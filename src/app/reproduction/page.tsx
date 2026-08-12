"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAppStore, type Animal } from "@/store/store";
import { getGestationAlert, getHeatAlert, formatGestationMessage, formatHeatMessage } from "@/lib/reproduction";
import { groupChaleursByAnimal } from "@/components/HeatAlerts";
import { getAnimalIcon } from "@/lib/utils";

export default function ReproductionPage() {
  const router = useRouter();
  const { state } = useAppStore();
  const { animaux, chaleurs, loading } = state;

  const upcomingHeats = useMemo(() => {
    const chaleursByAnimal = groupChaleursByAnimal(chaleurs);
    return animaux
      .map((animal) => {
        const alert = getHeatAlert(animal, chaleursByAnimal[animal.id] || []);
        return alert ? { animal, alert } : null;
      })
      .filter((x): x is { animal: Animal; alert: NonNullable<ReturnType<typeof getHeatAlert>> } => x !== null)
      .sort((a, b) => a.alert.joursRestants - b.alert.joursRestants);
  }, [animaux, chaleurs]);

  const upcomingBirths = useMemo(() => {
    return animaux
      .map((animal) => {
        const alert = getGestationAlert(animal);
        return alert ? { animal, alert } : null;
      })
      .filter((x): x is { animal: Animal; alert: NonNullable<ReturnType<typeof getGestationAlert>> } => x !== null)
      .sort((a, b) => a.alert.joursRestants - b.alert.joursRestants);
  }, [animaux]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-stone-400 text-lg">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900">Reproduction</h1>
        <p className="text-stone-500 text-sm mt-1">Chaleurs et mises bas à venir, tous animaux confondus</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Chaleurs à venir */}
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-stone-100">
            <span>🔥</span>
            <span className="text-[13px] font-semibold text-stone-800">
              Prochaines chaleurs {upcomingHeats.length > 0 && `(${upcomingHeats.length})`}
            </span>
          </div>
          {upcomingHeats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <p className="text-[13px] text-stone-400">Aucune chaleur à venir</p>
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {upcomingHeats.map(({ animal, alert }) => (
                <div
                  key={animal.id}
                  onClick={() => router.push(`/animaux/${animal.id}`)}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-stone-50 cursor-pointer transition-colors"
                >
                  <span className="text-lg shrink-0">{getAnimalIcon(animal.type)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-stone-800 truncate">
                      {animal.nom || animal.numeroBoucle || "Animal"}
                    </p>
                    <p className="text-[11px] text-stone-400 mt-0.5">{formatHeatMessage(alert)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mises bas à venir */}
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-stone-100">
            <span>🍼</span>
            <span className="text-[13px] font-semibold text-stone-800">
              Prochaines mises bas {upcomingBirths.length > 0 && `(${upcomingBirths.length})`}
            </span>
          </div>
          {upcomingBirths.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <p className="text-[13px] text-stone-400">Aucune mise bas à venir</p>
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {upcomingBirths.map(({ animal, alert }) => (
                <div
                  key={animal.id}
                  onClick={() => router.push(`/animaux/${animal.id}`)}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-stone-50 cursor-pointer transition-colors"
                >
                  <span className="text-lg shrink-0">{getAnimalIcon(animal.type)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-stone-800 truncate">
                      {animal.nom || animal.numeroBoucle || "Animal"}
                    </p>
                    <p className={`text-[11px] mt-0.5 ${alert.enRetard ? "text-red-500" : "text-stone-400"}`}>
                      {formatGestationMessage(alert)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
