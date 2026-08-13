"use client";

import { useState } from "react";
import type { Animal } from "@/store/store";
import { useAppStore } from "@/store/store";
import { useToast } from "@/components/Toast";
import { clearGestationSuivi } from "@/services/animal-service";
import { getAnimalIcon } from "@/lib/utils";
import {
  getGestationAlert,
  formatGestationMessage,
  formatGestationDate,
  type GestationAlert,
} from "@/lib/reproduction";

/** Petit badge compact affiché sur les cartes animal de la liste. */
export function GestationBadge({ animal }: { animal: Animal }) {
  const alert = getGestationAlert(animal);
  if (!alert) return null;
  return (
    <div
      className={`mt-1.5 px-2 py-1 rounded-md text-[10px] sm:text-[11px] font-medium flex items-center gap-1 ${
        alert.enRetard ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"
      }`}
      title={formatGestationMessage(alert)}
    >
      <span>🍼</span>
      <span className="truncate">{formatGestationMessage(alert)}</span>
    </div>
  );
}

/** Carte d'alerte détaillée pour la fiche animal, avec action de clôture du suivi. */
export function GestationAlertCard({ animal }: { animal: Animal }) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const alert = getGestationAlert(animal);
  if (!alert) return null;

  const handleClear = async () => {
    setSaving(true);
    try {
      const result = await clearGestationSuivi(animal.id);
      if (result.success) {
        showToast({ type: "success", title: "Suivi clôturé", message: "La saillie et la mise bas restent visibles dans l’historique." });
      } else {
        showToast({ type: "error", title: "Erreur", message: result.error || "Erreur lors de la mise à jour" });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`rounded-xl border p-4 sm:p-5 mb-6 flex items-start gap-3 ${
        alert.enRetard ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className="text-2xl shrink-0">🍼</div>
      <div className="flex-1 min-w-0">
        <div className={`font-semibold text-sm sm:text-base ${alert.enRetard ? "text-red-800" : "text-amber-900"}`}>
          {alert.enRetard ? "⚠️ Naissance en retard sur l'estimation" : "Attention, prochaine naissance prévue"}
        </div>
        <div className="text-sm text-stone-700 mt-0.5">{formatGestationMessage(alert)}</div>
      </div>
      <button
        onClick={handleClear}
        disabled={saving}
        className="shrink-0 px-3 py-1.5 text-xs font-medium bg-white border border-stone-300 rounded-lg hover:bg-stone-50 cursor-pointer disabled:opacity-50"
        title="Effacer le suivi une fois la mise bas constatée"
      >
        {saving ? "…" : "✓ Mise bas constatée"}
      </button>
    </div>
  );
}

interface UpcomingBirth {
  animal: Animal;
  alert: GestationAlert;
}

/** Bandeau récapitulatif des naissances à venir, à afficher en haut d'une liste d'animaux. */
export function UpcomingBirthsBanner({ scope }: { scope?: Animal["type"] }) {
  const { state } = useAppStore();

  const upcoming: UpcomingBirth[] = state.animaux
    .filter((a) => !scope || a.type === scope)
    .map((animal) => {
      const alert = getGestationAlert(animal);
      return alert ? { animal, alert } : null;
    })
    .filter((x): x is UpcomingBirth => x !== null)
    .sort((a, b) => a.alert.joursRestants - b.alert.joursRestants);

  if (upcoming.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-6">
      <div className="font-semibold text-sm text-amber-900 mb-2 flex items-center gap-2">
        <span>🍼</span>
        <span>
          Prochaines naissances{scope ? "" : " (tous animaux)"} — {upcoming.length}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {upcoming.map(({ animal, alert }) => (
          <div key={animal.id} className="text-sm text-amber-900 flex items-center gap-2">
            <span>{getAnimalIcon(animal.type)}</span>
            <span className="font-medium">{animal.nom || animal.numeroBoucle || "Animal"}</span>
            <span className="text-amber-700">
              — {alert.enRetard ? "en retard" : `prévue le ${formatGestationDate(alert.dateEstimee)}`}
              {!alert.enRetard && alert.joursRestants <= 1
                ? alert.joursRestants === 0
                  ? " (aujourd'hui)"
                  : " (demain)"
                : !alert.enRetard
                  ? ` (dans ${alert.joursRestants} j)`
                  : ` de ${Math.abs(alert.joursRestants)} j`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
