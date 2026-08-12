"use client";

import type { Animal } from "@/store/store";
import { useAppStore } from "@/store/store";
import { getAnimalIcon } from "@/lib/utils";
import { getHeatAlert, formatGestationDate, type HeatAlert } from "@/lib/reproduction";
import type { ChaleurEntry } from "@/services/animal-detail-service";

interface UpcomingHeat {
  animal: Animal;
  alert: HeatAlert;
}

function groupChaleursByAnimal(chaleurs: ChaleurEntry[]): Record<string, ChaleurEntry[]> {
  const grouped: Record<string, ChaleurEntry[]> = {};
  for (const c of chaleurs) {
    if (!grouped[c.animalId]) grouped[c.animalId] = [];
    grouped[c.animalId].push(c);
  }
  return grouped;
}

/** Bandeau récapitulatif des chaleurs à venir, à afficher en haut d'une liste d'animaux. */
export function UpcomingHeatsBanner({ scope }: { scope?: Animal["type"] }) {
  const { state } = useAppStore();
  const chaleursByAnimal = groupChaleursByAnimal(state.chaleurs);

  const upcoming: UpcomingHeat[] = state.animaux
    .filter((a) => !scope || a.type === scope)
    .map((animal) => {
      const alert = getHeatAlert(animal, chaleursByAnimal[animal.id] || []);
      return alert ? { animal, alert } : null;
    })
    .filter((x): x is UpcomingHeat => x !== null)
    .sort((a, b) => a.alert.joursRestants - b.alert.joursRestants);

  if (upcoming.length === 0) return null;

  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 mb-6">
      <div className="font-semibold text-sm text-rose-900 mb-2 flex items-center gap-2">
        <span>🔥</span>
        <span>
          Prochaines chaleurs{scope ? "" : " (tous animaux)"} — {upcoming.length}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {upcoming.map(({ animal, alert }) => (
          <div key={animal.id} className="text-sm text-rose-900 flex items-center gap-2">
            <span>{getAnimalIcon(animal.type)}</span>
            <span className="font-medium">{animal.nom || animal.numeroBoucle || "Animal"}</span>
            <span className="text-rose-700">
              — prévue le {formatGestationDate(alert.dateEstimee)}
              {alert.joursRestants <= 1
                ? alert.joursRestants === 0
                  ? " (aujourd'hui)"
                  : " (demain)"
                : ` (dans ${alert.joursRestants} j)`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export { groupChaleursByAnimal };
