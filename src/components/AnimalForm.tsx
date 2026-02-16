"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useAppStore, type Animal } from "@/store/store";

interface AnimalFormProps {
  animal?: Animal | null;
  formRef: React.RefObject<HTMLFormElement | null>;
}

export default function AnimalForm({ animal, formRef }: AnimalFormProps) {
  const { state } = useAppStore();
  const [selectedType, setSelectedType] = useState(animal?.type || "");
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
          <label className="block mb-1 text-sm font-medium text-gray-700">
            Type d&apos;animal <span className="text-red-500">*</span>
          </label>
          <select
            name="type"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          >
            <option value="">Sélectionnez...</option>
            <option value="ovin">🐑 Ovin</option>
            <option value="bovin">🐄 Bovin</option>
            <option value="caprin">🐐 Caprin</option>
            <option value="porcin">🐷 Porcin</option>
          </select>
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">
            Numéro de boucle <span className="text-xs text-gray-400 font-normal">(ou nom requis)</span>
          </label>
          <input
            type="text"
            name="numeroBoucle"
            defaultValue={animal?.numeroBoucle || ""}
            placeholder="FR123456789"
            readOnly={!!animal}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 read-only:bg-gray-100 read-only:cursor-not-allowed"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">Nom <span className="text-xs text-gray-400 font-normal">(ou n° boucle requis)</span></label>
          <input
            type="text"
            name="nom"
            defaultValue={animal?.nom || ""}
            placeholder="Bernadette"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">
            Sexe <span className="text-red-500">*</span>
          </label>
          <select
            name="sexe"
            defaultValue={animal?.sexe || ""}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          >
            <option value="">Sélectionnez...</option>
            <option value="M">♂ Mâle</option>
            <option value="F">♀ Femelle</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative" ref={raceDropdownRef}>
          <label className="block mb-1 text-sm font-medium text-gray-700">Race</label>
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
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
              <button
                type="button"
                onClick={() => {
                  setIsAddingNewRace(false);
                  if (!raceValue) setRaceDropdownOpen(false);
                }}
                className="px-2 py-2 text-xs text-gray-500 hover:text-gray-800 bg-gray-100 rounded-lg cursor-pointer border border-gray-300"
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
              className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-left flex items-center justify-between cursor-pointer bg-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-gray-100 disabled:cursor-not-allowed ${
                raceDropdownOpen ? "border-primary ring-2 ring-primary/10" : ""
              }`}
            >
              <span className={raceValue ? "text-gray-900" : "text-gray-400"}>
                {raceValue || (selectedType ? "Sélectionner une race..." : "Choisissez d'abord un type")}
              </span>
              <span className="text-gray-400 text-xs ml-2">{raceDropdownOpen ? "▲" : "▼"}</span>
            </button>
          )}
          {raceDropdownOpen && !isAddingNewRace && (
            <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-hidden animate-[fadeIn_0.15s_ease-out]">
              {raceSuggestions.length > 3 && (
                <div className="p-2 border-b border-gray-100">
                  <input
                    type="text"
                    value={raceSearchQuery}
                    onChange={(e) => setRaceSearchQuery(e.target.value)}
                    placeholder="Filtrer..."
                    autoFocus
                    className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-primary"
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
                    className="w-full px-3 py-2 text-sm text-left text-gray-400 italic hover:bg-gray-50 cursor-pointer bg-transparent border-none"
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
                    className={`w-full px-3 py-2 text-sm text-left hover:bg-primary/5 cursor-pointer bg-transparent border-none flex items-center justify-between ${
                      raceValue === race ? "bg-primary/10 text-primary font-medium" : "text-gray-700"
                    }`}
                  >
                    <span>{race}</span>
                    {raceValue === race && <span className="text-primary">✓</span>}
                  </button>
                ))}
                {raceSearchQuery && filteredRaceSuggestions.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-400 italic">Aucune race trouvée</div>
                )}
              </div>
              <div className="border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingNewRace(true);
                    setRaceDropdownOpen(false);
                    setRaceSearchQuery("");
                    setRaceValue("");
                  }}
                  className="w-full px-3 py-2.5 text-sm text-left text-primary font-medium hover:bg-primary/5 cursor-pointer bg-transparent border-none flex items-center gap-2"
                >
                  <span>+</span>
                  <span>Ajouter une race</span>
                </button>
              </div>
            </div>
          )}
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">Date de naissance</label>
          <input
            type="date"
            name="dateNaissance"
            defaultValue={animal?.dateNaissance || ""}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">Statut</label>
          <select
            name="statut"
            defaultValue={animal?.statut || "actif"}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          >
            <option value="actif">Actif</option>
            <option value="vendu">Vendu</option>
            <option value="mort">Mort</option>
            <option value="reforme">Réformé</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block mb-1 text-sm font-medium text-gray-700">Commentaire</label>
        <textarea
          name="commentaire"
          defaultValue={animal?.commentaire || ""}
          placeholder="Bonne croissance, très docile..."
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 resize-y min-h-[100px]"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">Père (optionnel)</label>
          <select
            name="numeroBouclePere"
            defaultValue={animal?.numeroBouclePere || ""}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
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
          <label className="block mb-1 text-sm font-medium text-gray-700">Mère (optionnel)</label>
          <select
            name="numeroBoucleMere"
            defaultValue={animal?.numeroBoucleMere || ""}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
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
