"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useAppStore, type Animal } from "@/store/store";

type AnimalStatus = Animal["statut"];

interface AnimalFormProps {
  animal?: Animal | null;
  formRef: React.RefObject<HTMLFormElement | null>;
}

export default function AnimalForm({ animal, formRef }: AnimalFormProps) {
  const { state } = useAppStore();
  const [selectedType, setSelectedType] = useState(animal?.type || "");
  const [selectedStatus, setSelectedStatus] = useState<AnimalStatus>(animal?.statut || "actif");
  const [raceValue, setRaceValue] = useState(animal?.race || "");
  const [raceDropdownOpen, setRaceDropdownOpen] = useState(false);
  const [raceSearchQuery, setRaceSearchQuery] = useState("");
  const [isAddingNewRace, setIsAddingNewRace] = useState(false);
  const raceDropdownRef = useRef<HTMLDivElement>(null);
  const raceInputRef = useRef<HTMLInputElement>(null);

  const maleAnimals = state.animaux.filter((a) => a.sexe === "M" && a.statut === "actif" && a.numeroBoucle);
  const femaleAnimals = state.animaux.filter((a) => a.sexe === "F" && a.statut === "actif" && a.numeroBoucle);

  // Races uniques pour le type sélectionné
  const raceSuggestions = useMemo(() => {
    if (!selectedType) return [];
    const races = state.animaux
      .filter((a) => a.type === selectedType && a.race && a.race.trim() !== "")
      .map((a) => a.race!.trim());
    return [...new Set(races)].sort((a, b) => a.localeCompare(b, "fr"));
  }, [state.animaux, selectedType]);

  const filteredRaceSuggestions = useMemo(() => {
    if (!raceSearchQuery) return raceSuggestions;
    const lower = raceSearchQuery.toLowerCase();
    return raceSuggestions.filter((r) => r.toLowerCase().includes(lower));
  }, [raceSuggestions, raceSearchQuery]);

  // Fermer le dropdown au clic extérieur
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (raceDropdownRef.current && !raceDropdownRef.current.contains(e.target as Node)) {
        setRaceDropdownOpen(false);
        setRaceSearchQuery("");
        setIsAddingNewRace(false);
      }
    }
    if (raceDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [raceDropdownOpen]);

  // Reset race quand le type change
  useEffect(() => {
    if (!animal) {
      setRaceValue("");
      setIsAddingNewRace(false);
    }
  }, [selectedType, animal]);

  return (
    <form ref={formRef} className="grid gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-stone-700">
            Type d&apos;animal <span className="text-red-500">*</span>
          </label>
          <select
            name="type"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            required
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10"
          >
            <option value="">Sélectionnez...</option>
            <option value="ovin">🐑 Ovin</option>
            <option value="bovin">🐄 Bovin</option>
            <option value="caprin">🐐 Caprin</option>
            <option value="porcin">🐷 Porcin</option>
            <option value="equin">🐴 Équin</option>
          </select>
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-stone-700">
            Numéro de boucle <span className="text-xs text-stone-400 font-normal">(ou nom requis)</span>
          </label>
          <input
            type="text"
            name="numeroBoucle"
            defaultValue={animal?.numeroBoucle || ""}
            placeholder="FR123456789"
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-stone-700">Nom <span className="text-xs text-stone-400 font-normal">(ou n° boucle requis)</span></label>
          <input
            type="text"
            name="nom"
            defaultValue={animal?.nom || ""}
            placeholder="Bernadette"
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-stone-700">
            Sexe <span className="text-red-500">*</span>
          </label>
          <select
            name="sexe"
            defaultValue={animal?.sexe || ""}
            required
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10"
          >
            <option value="">Sélectionnez...</option>
            <option value="M">♂ Mâle</option>
            <option value="F">♀ Femelle</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative" ref={raceDropdownRef}>
          <label className="block mb-1 text-sm font-medium text-stone-700">Race</label>
          <input type="hidden" name="race" value={raceValue} />
          {isAddingNewRace ? (
            <div className="flex gap-2">
              <input
                ref={raceInputRef}
                type="text"
                value={raceValue}
                onChange={(e) => setRaceValue(e.target.value)}
                placeholder="Saisir le nom de la race..."
                autoFocus
                className="flex-1 px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10"
              />
              <button
                type="button"
                onClick={() => {
                  setIsAddingNewRace(false);
                  if (!raceValue) setRaceDropdownOpen(false);
                }}
                className="px-2 py-2 text-xs text-stone-500 hover:text-stone-800 bg-stone-100 rounded-lg cursor-pointer border border-stone-300"
              >
                OK
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (!selectedType) return;
                setRaceDropdownOpen(!raceDropdownOpen);
                setRaceSearchQuery("");
              }}
              disabled={!selectedType}
              className={`w-full px-3 py-2 border border-stone-300 rounded-lg text-left flex items-center justify-between cursor-pointer bg-white focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10 disabled:bg-stone-100 disabled:cursor-not-allowed ${
                raceDropdownOpen ? "border-brand-600 ring-2 ring-primary/10" : ""
              }`}
            >
              <span className={raceValue ? "text-stone-900" : "text-stone-400"}>
                {raceValue || (selectedType ? "Sélectionner une race..." : "Choisissez d'abord un type")}
              </span>
              <span className="text-stone-400 text-xs ml-2">{raceDropdownOpen ? "▲" : "▼"}</span>
            </button>
          )}
          {raceDropdownOpen && !isAddingNewRace && (
            <div className="absolute z-50 mt-1 w-full bg-white border border-stone-200 rounded-lg shadow-lg max-h-60 overflow-hidden animate-[fadeIn_0.15s_ease-out]">
              {raceSuggestions.length > 3 && (
                <div className="p-2 border-b border-stone-100">
                  <input
                    type="text"
                    value={raceSearchQuery}
                    onChange={(e) => setRaceSearchQuery(e.target.value)}
                    placeholder="Filtrer..."
                    autoFocus
                    className="w-full px-2 py-1.5 text-sm border border-stone-200 rounded focus:outline-none focus:border-brand-600"
                  />
                </div>
              )}
              <div className="overflow-y-auto max-h-48">
                {raceValue && (
                  <button
                    type="button"
                    onClick={() => {
                      setRaceValue("");
                      setRaceDropdownOpen(false);
                      setRaceSearchQuery("");
                    }}
                    className="w-full px-3 py-2 text-sm text-left text-stone-400 italic hover:bg-stone-50 cursor-pointer bg-transparent border-none"
                  >
                    Aucune race
                  </button>
                )}
                {filteredRaceSuggestions.map((race) => (
                  <button
                    key={race}
                    type="button"
                    onClick={() => {
                      setRaceValue(race);
                      setRaceDropdownOpen(false);
                      setRaceSearchQuery("");
                    }}
                    className={`w-full px-3 py-2 text-sm text-left hover:bg-brand-600/5 cursor-pointer bg-transparent border-none flex items-center justify-between ${
                      raceValue === race ? "bg-brand-600/10 text-brand-600 font-medium" : "text-stone-700"
                    }`}
                  >
                    <span>{race}</span>
                    {raceValue === race && <span className="text-brand-600">✓</span>}
                  </button>
                ))}
                {raceSearchQuery && filteredRaceSuggestions.length === 0 && (
                  <div className="px-3 py-2 text-sm text-stone-400 italic">Aucune race trouvée</div>
                )}
              </div>
              <div className="border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingNewRace(true);
                    setRaceDropdownOpen(false);
                    setRaceSearchQuery("");
                    setRaceValue("");
                  }}
                  className="w-full px-3 py-2.5 text-sm text-left text-brand-600 font-medium hover:bg-brand-600/5 cursor-pointer bg-transparent border-none flex items-center gap-2"
                >
                  <span>+</span>
                  <span>Ajouter une race</span>
                </button>
              </div>
            </div>
          )}
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-stone-700">Date de naissance</label>
          <input
            type="date"
            name="dateNaissance"
            defaultValue={animal?.dateNaissance || ""}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-stone-700">Statut</label>
          <select
            name="statut"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as AnimalStatus)}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10"
          >
            <option value="actif">Actif</option>
            <option value="vendu">Vendu</option>
            <option value="mort">Mort</option>
            <option value="reforme">Réformé</option>
          </select>
        </div>
      </div>

      {selectedStatus === "vendu" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-amber-900">Informations de vente / sortie</h3>
            <p className="text-xs text-amber-800/80">Le poids de sortie est utile pour les statistiques. Le poids carcasse reste optionnel.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-1 text-sm font-medium text-stone-700">Poids de sortie (kg)</label>
              <input
                type="number"
                name="poidsSortieKg"
                defaultValue={animal?.poidsSortieKg ?? ""}
                min="0"
                step="0.1"
                inputMode="decimal"
                placeholder="Ex : 145"
                className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10 bg-white"
              />
            </div>
            <div>
              <label className="block mb-1 text-sm font-medium text-stone-700">Poids carcasse (kg) <span className="text-xs text-stone-400 font-normal">optionnel</span></label>
              <input
                type="number"
                name="poidsCarcasseKg"
                defaultValue={animal?.poidsCarcasseKg ?? ""}
                min="0"
                step="0.1"
                inputMode="decimal"
                placeholder="Ex : 78"
                className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10 bg-white"
              />
            </div>
          </div>
        </div>
      )}

      <div>
        <label className="block mb-1 text-sm font-medium text-stone-700">Commentaire</label>
        <textarea
          name="commentaire"
          defaultValue={animal?.commentaire || ""}
          placeholder="Bonne croissance, très docile..."
          rows={3}
          className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10 resize-y min-h-[100px]"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-stone-700">Père (optionnel)</label>
          <select
            name="numeroBouclePere"
            defaultValue={animal?.numeroBouclePere || ""}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10"
          >
            <option value="">Aucun</option>
            {maleAnimals.map((a) => (
              <option key={a.id} value={a.numeroBoucle}>
                {a.nom ? `${a.nom} - ${a.numeroBoucle}` : a.numeroBoucle}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-stone-700">Mère (optionnel)</label>
          <select
            name="numeroBoucleMere"
            defaultValue={animal?.numeroBoucleMere || ""}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10"
          >
            <option value="">Aucune</option>
            {femaleAnimals.map((a) => (
              <option key={a.id} value={a.numeroBoucle}>
                {a.nom ? `${a.nom} - ${a.numeroBoucle}` : a.numeroBoucle}
              </option>
            ))}
          </select>
        </div>
      </div>
    </form>
  );
}