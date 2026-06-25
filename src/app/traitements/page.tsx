"use client";

import { useState } from "react";
import Link from "next/link";
import { useAppStore, type FicheSoin } from "@/store/store";
import { useToast } from "@/components/Toast";
import { cloturerSoin, rouvrirSoin } from "@/services/animal-detail-service";
import { formatDate, getAnimalIcon } from "@/lib/utils";

type FilterStatut = "en_cours" | "cloture" | "tous";

export default function TraitementsPage() {
  const { state } = useAppStore();
  const { showToast } = useToast();
  const [filter, setFilter] = useState<FilterStatut>("en_cours");
  const [search, setSearch] = useState("");

  const traitements = state.traitements as FicheSoin[];

  const filteredTraitements = traitements
    .filter((t) => filter === "tous" || t.statut === filter)
    .filter((t) => {
      if (!search) return true;
      const s = search.toLowerCase();
      const animal = state.animaux.find((a) => a.id === t.animalId);
      const animalName = animal?.nom || animal?.numeroBoucle || "";
      return (
        t.titre.toLowerCase().includes(s) ||
        t.description?.toLowerCase().includes(s) ||
        animalName.toLowerCase().includes(s)
      );
    })
    .sort((a, b) => new Date(b.dateDebut).getTime() - new Date(a.dateDebut).getTime());

  const enCoursCount = traitements.filter((t) => t.statut === "en_cours").length;
  const clotureCount = traitements.filter((t) => t.statut === "cloture").length;

  const handleCloturer = async (soin: FicheSoin) => {
    const result = await cloturerSoin(soin.id);
    if (result.success) {
      showToast({ type: "success", title: "Succes", message: "Traitement cloture" });
    } else {
      showToast({ type: "error", title: "Erreur", message: result.error || "Erreur" });
    }
  };

  const handleRouvrir = async (soin: FicheSoin) => {
    const result = await rouvrirSoin(soin.id);
    if (result.success) {
      showToast({ type: "success", title: "Succes", message: "Traitement reouvert" });
    } else {
      showToast({ type: "error", title: "Erreur", message: result.error || "Erreur" });
    }
  };

  const getAnimalInfo = (animalId: string) => {
    return state.animaux.find((a) => a.id === animalId);
  };

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-stone-400 text-lg">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Traitements</h1>
          <p className="text-stone-500 text-sm mt-1">
            {enCoursCount} en cours &middot; {clotureCount} cloture{clotureCount > 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Filtres et recherche */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-2">
            {([
              { value: "en_cours", label: "En cours", count: enCoursCount },
              { value: "cloture", label: "Clotures", count: clotureCount },
              { value: "tous", label: "Tous", count: traitements.length },
            ] as const).map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer transition-colors ${
                  filter === f.value
                    ? "bg-brand-600 text-white"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                {f.label} ({f.count})
              </button>
            ))}
          </div>
          <div className="flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par traitement ou animal..."
              className="w-full px-3 py-1.5 text-sm border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10"
            />
          </div>
        </div>
      </div>

      {/* Liste */}
      {filteredTraitements.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <div className="text-4xl mb-2">💊</div>
          <p className="text-stone-400">
            {traitements.length === 0
              ? "Aucun traitement enregistre"
              : "Aucun resultat pour cette recherche"}
          </p>
          {traitements.length === 0 && (
            <p className="text-stone-400 text-sm mt-1">
              Ajoutez des fiches soins depuis la page d&apos;un animal (onglet Soins)
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTraitements.map((soin) => {
            const animal = getAnimalInfo(soin.animalId);
            return (
              <div
                key={soin.id}
                className={`bg-white rounded-xl shadow-sm p-4 border-l-4 ${
                  soin.statut === "en_cours" ? "border-l-amber-500" : "border-l-green-500"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-sm">{soin.titre}</h3>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          soin.statut === "en_cours"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-green-100 text-green-800"
                        }`}
                      >
                        {soin.statut === "en_cours" ? "En cours" : "Cloture"}
                      </span>
                    </div>

                    {/* Animal info */}
                    {animal && (
                      <Link
                        href={`/animaux/${animal.id}`}
                        className="inline-flex items-center gap-1.5 text-xs text-stone-500 hover:text-brand-600 mb-1 no-underline"
                      >
                        <span>{getAnimalIcon(animal.type)}</span>
                        <span>{animal.nom || animal.numeroBoucle || "Animal"}</span>
                      </Link>
                    )}

                    <div className="text-xs text-stone-400">
                      Debut : {formatDate(soin.dateDebut)}
                      {soin.dateFin && <> &middot; Fin : {formatDate(soin.dateFin)}</>}
                    </div>

                    {soin.description && (
                      <p className="text-sm text-stone-600 mt-2 whitespace-pre-wrap line-clamp-2">
                        {soin.description}
                      </p>
                    )}

                    {soin.photoUrl && (
                      <a
                        href={soin.photoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 text-xs text-brand-600 hover:underline"
                      >
                        <span>📎</span>
                        <span>{soin.photoNom || "Ordonnance"}</span>
                      </a>
                    )}
                  </div>

                  {/* Thumbnail */}
                  {soin.photoUrl && (
                    <a
                      href={soin.photoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 w-14 h-14 rounded-lg overflow-hidden border border-stone-200"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={soin.photoUrl}
                        alt="Ordonnance"
                        className="w-full h-full object-cover"
                      />
                    </a>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 mt-3 pt-2 border-t border-stone-100">
                  {soin.statut === "en_cours" ? (
                    <button
                      onClick={() => handleCloturer(soin)}
                      className="text-xs text-green-600 hover:text-green-800 cursor-pointer bg-transparent border-none p-0 font-medium"
                    >
                      Cloturer
                    </button>
                  ) : (
                    <button
                      onClick={() => handleRouvrir(soin)}
                      className="text-xs text-amber-600 hover:text-amber-800 cursor-pointer bg-transparent border-none p-0 font-medium"
                    >
                      Rouvrir
                    </button>
                  )}
                  {animal && (
                    <>
                      <span className="text-stone-300">|</span>
                      <Link
                        href={`/animaux/${animal.id}`}
                        className="text-xs text-brand-600 hover:underline no-underline"
                      >
                        Voir l&apos;animal
                      </Link>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}