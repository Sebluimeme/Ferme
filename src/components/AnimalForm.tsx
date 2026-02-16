"use client";

import { useState, useMemo } from "react";
import { useAppStore, type Animal } from "@/store/store";

interface AnimalFormProps {
  animal?: Animal | null;
  formRef: React.RefObject<HTMLFormElement | null>;
}

export default function AnimalForm({ animal, formRef }: AnimalFormProps) {
  const { state } = useAppStore();
  const [selectedType, setSelectedType] = useState(animal?.type || "");

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
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">Race</label>
          <input
            type="text"
            name="race"
            defaultValue={animal?.race || ""}
            placeholder={selectedType ? "Commencez à taper..." : "Choisissez d'abord un type"}
            list="race-suggestions"
            autoComplete="off"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
          <datalist id="race-suggestions">
            {raceSuggestions.map((race) => (
              <option key={race} value={race} />
            ))}
          </datalist>
          {selectedType && raceSuggestions.length > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              {raceSuggestions.length} race{raceSuggestions.length > 1 ? "s" : ""} connue{raceSuggestions.length > 1 ? "s" : ""} pour ce type
            </p>
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
