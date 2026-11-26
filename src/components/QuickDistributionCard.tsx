"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ChevronDown, Trash2, Wheat } from "lucide-react";
import { useAppStore } from "@/store/store";
import { useToast } from "@/components/Toast";
import { ConfirmModal } from "@/components/Modal";
import { createDistribution, deleteDistribution } from "@/services/fourrage-service";
import { stockFoinRestant } from "@/lib/fourrage-calculs";
import type {
  CheptelDistribution,
  DistributionFourrage,
  TypeFourrageDistribution,
  UniteDistribution,
} from "@/types/fourrage";

interface QuickDistributionCardProps {
  historyInitiallyOpen?: boolean;
  historyLimit?: number;
}

const dateLocaleISO = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const formatDate = (iso: string) => {
  if (iso === dateLocaleISO(new Date())) return "Aujourd’hui";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(`${iso}T12:00:00`));
};

const formatTonnes = (tonnes: number) => new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
}).format(tonnes);

const formatDistribution = (distribution: DistributionFourrage) => {
  const unite = distribution.unite === "balle" ? "balle" : "botte";
  const typeFourrage = distribution.typeFourrage ?? "foin";
  return `${distribution.quantite} ${unite}${distribution.quantite > 1 ? "s" : ""} de ${typeFourrage}`;
};

function ChoiceGroup<T extends string>({
  step,
  legend,
  hint,
  value,
  options,
  onChange,
  disabled,
}: {
  step: number;
  legend: string;
  hint: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  disabled: boolean;
}) {
  return (
    <fieldset className="min-w-0 px-4 py-4 sm:px-5">
      <legend className="flex items-center gap-2 text-base font-semibold text-stone-900">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-brand-300 bg-brand-50 text-sm font-bold text-brand-800" aria-hidden="true">
          {step}
        </span>
        {legend}
      </legend>
      <p className="mt-1 text-sm text-stone-600">{hint}</p>
      <div className={`mt-3 grid gap-2 ${options.length === 3 ? "grid-cols-3" : "grid-cols-2"}`} role="group">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`min-h-11 rounded-lg border px-2 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${
              value === option.value
                ? "border-brand-600 bg-brand-50 text-brand-800"
                : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function QuickDistributionCard({
  historyInitiallyOpen = false,
  historyLimit,
}: QuickDistributionCardProps) {
  const { state } = useAppStore();
  const { showToast } = useToast();
  const { activitesFourrage, distributionsFourrage } = state;
  const [quantite, setQuantite] = useState<1 | 2 | 3>(1);
  const [typeFourrage, setTypeFourrage] = useState<TypeFourrageDistribution>("foin");
  const [unite, setUnite] = useState<UniteDistribution>("botte");
  const [cheptel, setCheptel] = useState<CheptelDistribution>("ovin");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [historyOpen, setHistoryOpen] = useState(historyInitiallyOpen);
  const [deleteTarget, setDeleteTarget] = useState<DistributionFourrage | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const stock = useMemo(
    () => stockFoinRestant(activitesFourrage, distributionsFourrage),
    [activitesFourrage, distributionsFourrage]
  );
  const pourcentageStockRestant = stock.tonnesEnregistrees > 0
    ? Math.min(100, Math.max(0, Math.round((stock.tonnesRestantesEstimees / stock.tonnesEnregistrees) * 100)))
    : 0;
  const distributionsTriees = useMemo(
    () => [...distributionsFourrage].sort((a, b) => {
      const parDate = b.dateDistribution.localeCompare(a.dateDistribution);
      if (parDate !== 0) return parDate;
      return (b.dateCreation ?? b.derniereMAJ ?? "").localeCompare(a.dateCreation ?? a.derniereMAJ ?? "");
    }),
    [distributionsFourrage]
  );
  const distributionsVisibles = historyLimit
    ? distributionsTriees.slice(0, historyLimit)
    : distributionsTriees;

  const handleSave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await createDistribution({
        dateDistribution: dateLocaleISO(new Date()),
        cheptel,
        unite,
        typeFourrage,
        quantite,
      });
      if (result.success) {
        const animaux = cheptel === "ovin" ? "les ovins" : "les bovins";
        showToast({
          type: "success",
          title: "Distribution enregistrée",
          message: `${quantite} ${unite}${quantite > 1 ? "s" : ""} de ${typeFourrage} pour ${animaux}.`,
        });
      } else {
        showToast({ type: "error", title: "Distribution non enregistrée", message: result.error });
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(deleteTarget.id);
    try {
      const result = await deleteDistribution(deleteTarget.id);
      if (result.success) {
        showToast({ type: "success", title: "Distribution supprimée" });
      } else {
        showToast({ type: "error", title: "Suppression impossible", message: result.error });
      }
    } finally {
      setDeleting(null);
      setDeleteTarget(null);
    }
  };

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 sm:p-5" aria-labelledby="distribution-rapide-title">
      <div className="mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Wheat className="h-5 w-5 text-brand-700" aria-hidden="true" />
            <h2 id="distribution-rapide-title" className="text-lg font-semibold text-stone-900">Distribution rapide</h2>
          </div>
          <p className="mt-1 text-sm text-stone-600">Chaque enregistrement ajoute une nouvelle ligne à l’historique.</p>
        </div>
      </div>

      <div className="mb-5 rounded-lg border border-stone-200 bg-stone-50 p-4" aria-label="Stock de foin restant">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-stone-700">Stock de foin restant</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-stone-950">
              {formatTonnes(stock.tonnesRestantesEstimees)} t
            </p>
            <p className="text-sm text-stone-600">restantes estimées</p>
          </div>
          <div className="shrink-0 rounded-lg border border-stone-300 bg-white px-3 py-2 text-right">
            <p className="text-xl font-bold tabular-nums text-stone-950">{pourcentageStockRestant} %</p>
            <p className="text-sm text-stone-600">du stock enregistré</p>
          </div>
        </div>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200"
          role="progressbar"
          aria-label="Pourcentage du stock de foin restant"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pourcentageStockRestant}
        >
          <div
            className="h-full rounded-full bg-brand-600 transition-[width]"
            style={{ width: `${pourcentageStockRestant}%` }}
          />
        </div>
        <p className="mt-2 text-sm text-stone-600">
          {formatTonnes(stock.tonnesEnregistrees)} t enregistrées − {formatTonnes(stock.tonnesDistribueesEstimees)} t distribuées estimées
        </p>
      </div>

      <div className="divide-y divide-stone-200 overflow-hidden rounded-lg border border-stone-200 bg-white">
        <ChoiceGroup
          step={1}
          legend="Quantité"
          hint="Nombre de bottes ou de balles"
          value={String(quantite) as "1" | "2" | "3"}
          options={[
            { value: "1", label: "1" },
            { value: "2", label: "2" },
            { value: "3", label: "3" },
          ]}
          onChange={(value) => setQuantite(Number(value) as 1 | 2 | 3)}
          disabled={saving}
        />
        <ChoiceGroup
          step={2}
          legend="Fourrage"
          hint="Ce qui a été distribué"
          value={typeFourrage}
          options={[
            { value: "foin", label: "Foin" },
            { value: "paille", label: "Paille" },
          ]}
          onChange={setTypeFourrage}
          disabled={saving}
        />
        <ChoiceGroup
          step={3}
          legend="Format"
          hint="Unité utilisée"
          value={unite}
          options={[
            { value: "botte", label: "Botte" },
            { value: "balle", label: "Balle" },
          ]}
          onChange={setUnite}
          disabled={saving}
        />
        <ChoiceGroup
          step={4}
          legend="Animaux"
          hint="Troupeau concerné"
          value={cheptel}
          options={[
            { value: "ovin", label: "Ovins" },
            { value: "bovin", label: "Bovins" },
          ]}
          onChange={setCheptel}
          disabled={saving}
        />
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        aria-busy={saving}
        className="mt-4 min-h-12 w-full rounded-lg bg-brand-600 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
      >
        {saving ? "Enregistrement…" : "Enregistrer la distribution"}
      </button>

      <details
        className="mt-4 border-t border-stone-200 pt-3"
        open={historyOpen}
        onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-2 text-sm font-semibold text-stone-800 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-brand-500">
          <span>Historique des distributions ({distributionsTriees.length})</span>
          <ChevronDown className="h-5 w-5 shrink-0 text-stone-500" aria-hidden="true" />
        </summary>

        {distributionsVisibles.length === 0 ? (
          <p className="px-2 py-4 text-sm text-stone-600">Aucune distribution enregistrée.</p>
        ) : (
          <ul className="mt-1 max-h-72 divide-y divide-stone-100 overflow-y-auto">
            {distributionsVisibles.map((distribution) => {
              const animaux = distribution.cheptel === "ovin" ? "Ovins" : "Bovins";
              return (
                <li key={distribution.id} className="flex min-h-14 items-center gap-3 px-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-stone-900">{formatDistribution(distribution)}</p>
                    <p className="mt-0.5 text-sm text-stone-600">{animaux} · {formatDate(distribution.dateDistribution)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(distribution)}
                    disabled={deleting === distribution.id}
                    className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-stone-600 transition-colors hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:cursor-wait disabled:opacity-50"
                    aria-label={`Supprimer ${formatDistribution(distribution)} pour ${animaux.toLowerCase()}`}
                  >
                    <Trash2 className="h-5 w-5" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {historyLimit && distributionsTriees.length > historyLimit && (
          <Link href="/fourrage" className="mt-2 flex min-h-11 items-center px-2 text-sm font-semibold text-brand-700 hover:underline">
            Voir tout l’historique
          </Link>
        )}
      </details>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Supprimer la distribution ?"
        message={deleteTarget
          ? `La ligne <strong>${formatDistribution(deleteTarget)}</strong> pour ${deleteTarget.cheptel === "ovin" ? "les ovins" : "les bovins"} sera supprimée de l’historique.`
          : ""}
        confirmText="Supprimer"
        danger
      />
    </section>
  );
}
