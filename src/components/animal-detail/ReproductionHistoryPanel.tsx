"use client";

import type { ChaleurEntry, HistoryEntry } from "@/services/animal-detail-service";
import { formatDate } from "@/lib/utils";
import type { Animal } from "@/store/store";

interface ReproductionHistoryPanelProps {
  history: HistoryEntry[];
  chaleurs: ChaleurEntry[];
  animal: Animal;
}

type TimelineItem = {
  id: string;
  date: string;
  label: string;
  detail?: string;
  icon: string;
};

export default function ReproductionHistoryPanel({ history, chaleurs, animal }: ReproductionHistoryPanelProps) {
  const items: TimelineItem[] = [
    ...(animal.dateSaillie ? [{
      id: `active-saillie-${animal.dateSaillie}`,
      date: animal.dateSaillie,
      label: "Saillie / insémination en cours",
      detail: "Suivi de gestation actif",
      icon: "🐑",
    }] : []),
    ...chaleurs.map((entry) => ({
      id: `chaleur-${entry.id}`,
      date: entry.date,
      label: "Chaleur observée",
      detail: entry.note,
      icon: "🔥",
    })),
    ...history
      .filter((entry) => entry.categorie === "reproduction" || /saillie|insémination|mise bas/i.test(entry.sujet))
      .map((entry) => ({
        id: `history-${entry.id}`,
        date: entry.date,
        label: entry.sujet,
        detail: entry.description,
        icon: /mise bas/i.test(entry.sujet) ? "🍼" : "🐑",
      })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="reproduction-history-title">
      <div className="mb-5">
        <h2 id="reproduction-history-title" className="text-lg font-semibold text-stone-900">Historique de reproduction</h2>
        <p className="mt-1 text-sm text-stone-500">Chaleurs, saillies et mises bas enregistrées pour cet animal.</p>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">Aucun événement de reproduction enregistré.</p>
      ) : (
        <ol className="space-y-1">
          {items.map((item) => (
            <li key={item.id} className="flex gap-3 border-b border-stone-100 py-3 last:border-b-0">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600/10" aria-hidden="true">{item.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                  <span className="text-base font-medium text-stone-800">{item.label}</span>
                  <time className="text-sm text-stone-500" dateTime={item.date}>{formatDate(item.date)}</time>
                </div>
                {item.detail && <p className="mt-1 text-sm leading-relaxed text-stone-600">{item.detail}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
