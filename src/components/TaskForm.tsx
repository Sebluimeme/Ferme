"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useAppStore } from "@/store/store";
import type { Task } from "@/types/task";
import { getAnimalIcon } from "@/lib/utils";
import { getVehicleIcon } from "@/lib/vehicle-utils";
import { getVehicleDisplayName } from "@/services/vehicle-service";

interface TaskFormProps {
  task?: Task | null;
  formRef: React.RefObject<HTMLFormElement | null>;
  photoFileRef?: React.RefObject<File | null>;
  onPhotoRemoved?: () => void;
}

export default function TaskForm({ task, formRef, photoFileRef, onPhotoRemoved }: TaskFormProps) {
  const { state } = useAppStore();
  const [photoPreview, setPhotoPreview] = useState<string | null>(task?.photoUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Catégorie (même pattern que les races)
  const [categorieValue, setCategorieValue] = useState(task?.categorie || "");
  const [categorieDropdownOpen, setCategorieDropdownOpen] = useState(false);
  const [categorieSearchQuery, setCategorieSearchQuery] = useState("");
  const [isAddingNewCategorie, setIsAddingNewCategorie] = useState(false);
  const categorieDropdownRef = useRef<HTMLDivElement>(null);

  // Personne assignée (même pattern que les catégories)
  const [assigneAValue, setAssigneAValue] = useState(task?.assigneA || "");
  const [assigneADropdownOpen, setAssigneADropdownOpen] = useState(false);
  const [assigneASearchQuery, setAssigneASearchQuery] = useState("");
  const [isAddingNewPersonne, setIsAddingNewPersonne] = useState(false);
  const assigneADropdownRef = useRef<HTMLDivElement>(null);

  // Animal lié
  const [selectedAnimalId, setSelectedAnimalId] = useState(task?.animalId || "");
  const [animalSearchQuery, setAnimalSearchQuery] = useState("");
  const [animalDropdownOpen, setAnimalDropdownOpen] = useState(false);
  const animalDropdownRef = useRef<HTMLDivElement>(null);

  // Véhicule lié
  const [selectedVehiculeId, setSelectedVehiculeId] = useState(task?.vehiculeId || "");
  const [vehiculeSearchQuery, setVehiculeSearchQuery] = useState("");
  const [vehiculeDropdownOpen, setVehiculeDropdownOpen] = useState(false);
  const vehiculeDropdownRef = useRef<HTMLDivElement>(null);

  // Catégories uniques depuis les tâches existantes
  const categorieSuggestions = useMemo(() => {
    const cats = state.taches
      .filter((t) => t.categorie && t.categorie.trim() !== "")
      .map((t) => t.categorie!.trim());
    return [...new Set(cats)].sort((a, b) => a.localeCompare(b, "fr"));
  }, [state.taches]);

  const filteredCategorieSuggestions = useMemo(() => {
    if (!categorieSearchQuery) return categorieSuggestions;
    const lower = categorieSearchQuery.toLowerCase();
    return categorieSuggestions.filter((c) => c.toLowerCase().includes(lower));
  }, [categorieSuggestions, categorieSearchQuery]);

  // Personnes uniques depuis les tâches existantes
  const personneSuggestions = useMemo(() => {
    const personnes = state.taches
      .filter((t) => t.assigneA && t.assigneA.trim() !== "")
      .map((t) => t.assigneA!.trim());
    return [...new Set(personnes)].sort((a, b) => a.localeCompare(b, "fr"));
  }, [state.taches]);

  const filteredPersonneSuggestions = useMemo(() => {
    if (!assigneASearchQuery) return personneSuggestions;
    const lower = assigneASearchQuery.toLowerCase();
    return personneSuggestions.filter((p) => p.toLowerCase().includes(lower));
  }, [personneSuggestions, assigneASearchQuery]);

  // Animaux actifs
  const activeAnimals = useMemo(() => {
    return state.animaux
      .filter((a) => a.statut === "actif")
      .sort((a, b) => {
        const nameA = a.nom || a.numeroBoucle || "";
        const nameB = b.nom || b.numeroBoucle || "";
        return nameA.localeCompare(nameB, "fr");
      });
  }, [state.animaux]);

  const filteredAnimals = useMemo(() => {
    if (!animalSearchQuery) return activeAnimals;
    const lower = animalSearchQuery.toLowerCase();
    return activeAnimals.filter(
      (a) =>
        a.nom?.toLowerCase().includes(lower) ||
        a.numeroBoucle?.toLowerCase().includes(lower) ||
        a.race?.toLowerCase().includes(lower)
    );
  }, [activeAnimals, animalSearchQuery]);

  // Véhicules actifs
  const activeVehicles = useMemo(() => {
    return state.vehicles
      .filter((v) => v.statut === "actif" || v.statut === "en_reparation")
      .sort((a, b) => {
        const nameA = getVehicleDisplayName(a);
        const nameB = getVehicleDisplayName(b);
        return nameA.localeCompare(nameB, "fr");
      });
  }, [state.vehicles]);

  const filteredVehicles = useMemo(() => {
    if (!vehiculeSearchQuery) return activeVehicles;
    const lower = vehiculeSearchQuery.toLowerCase();
    return activeVehicles.filter(
      (v) =>
        v.marque?.toLowerCase().includes(lower) ||
        v.modele?.toLowerCase().includes(lower) ||
        v.plaqueImmatriculation?.toLowerCase().includes(lower)
    );
  }, [activeVehicles, vehiculeSearchQuery]);

  // Noms pour les hidden inputs
  const selectedAnimal = useMemo(
    () => activeAnimals.find((a) => a.id === selectedAnimalId),
    [activeAnimals, selectedAnimalId]
  );
  const selectedVehicle = useMemo(
    () => activeVehicles.find((v) => v.id === selectedVehiculeId),
    [activeVehicles, selectedVehiculeId]
  );

  const animalDisplayName = selectedAnimal
    ? selectedAnimal.nom
      ? `${selectedAnimal.nom}${selectedAnimal.numeroBoucle ? ` (${selectedAnimal.numeroBoucle})` : ""}`
      : selectedAnimal.numeroBoucle || ""
    : "";

  const vehiculeDisplayName = selectedVehicle ? getVehicleDisplayName(selectedVehicle) : "";

  // Fermer les dropdowns au clic extérieur
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (categorieDropdownRef.current && !categorieDropdownRef.current.contains(e.target as Node)) {
        setCategorieDropdownOpen(false);
        setCategorieSearchQuery("");
        setIsAddingNewCategorie(false);
      }
      if (assigneADropdownRef.current && !assigneADropdownRef.current.contains(e.target as Node)) {
        setAssigneADropdownOpen(false);
        setAssigneASearchQuery("");
        setIsAddingNewPersonne(false);
      }
      if (animalDropdownRef.current && !animalDropdownRef.current.contains(e.target as Node)) {
        setAnimalDropdownOpen(false);
        setAnimalSearchQuery("");
      }
      if (vehiculeDropdownRef.current && !vehiculeDropdownRef.current.contains(e.target as Node)) {
        setVehiculeDropdownOpen(false);
        setVehiculeSearchQuery("");
      }
    }
    if (categorieDropdownOpen || assigneADropdownOpen || animalDropdownOpen || vehiculeDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [categorieDropdownOpen, assigneADropdownOpen, animalDropdownOpen, vehiculeDropdownOpen]);

  return (
    <form ref={formRef} className="grid gap-4">
      {/* Titre */}
      <div>
        <label className="block mb-1 text-sm font-medium text-stone-700">
          Titre <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          name="titre"
          defaultValue={task?.titre || ""}
          placeholder="Ex: Vacciner les agneaux"
          required
          className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10"
        />
      </div>

      {/* Statut */}
      <input type="hidden" name="priorite" value="basse" />
      <div>
        <label className="block mb-1 text-sm font-medium text-stone-700">
          Statut <span className="text-red-500">*</span>
        </label>
        <select
          name="statut"
          defaultValue={task?.statut || "a_faire"}
          required
          className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10"
        >
          <option value="a_faire">A faire</option>
          <option value="en_cours">En cours</option>
          <option value="terminee">Terminée</option>
        </select>
      </div>

      {/* Date d'échéance + Catégorie + Assignée à */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-stone-700">
            Date d&apos;échéance
          </label>
          <input
            type="date"
            name="dateEcheance"
            defaultValue={task?.dateEcheance || ""}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10"
          />
        </div>

        {/* Catégorie - même pattern que les races */}
        <div className="relative" ref={categorieDropdownRef}>
          <label className="block mb-1 text-sm font-medium text-stone-700">Catégorie</label>
          <input type="hidden" name="categorie" value={categorieValue} />
          {isAddingNewCategorie ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={categorieValue}
                onChange={(e) => setCategorieValue(e.target.value)}
                placeholder="Nouvelle catégorie..."
                autoFocus
                className="flex-1 px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10"
              />
              <button
                type="button"
                onClick={() => {
                  setIsAddingNewCategorie(false);
                  if (!categorieValue) setCategorieDropdownOpen(false);
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
                setCategorieDropdownOpen(!categorieDropdownOpen);
                setCategorieSearchQuery("");
              }}
              className={`w-full px-3 py-2 border border-stone-300 rounded-lg text-left flex items-center justify-between cursor-pointer bg-white focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10 ${
                categorieDropdownOpen ? "border-brand-600 ring-2 ring-brand-500/10" : ""
              }`}
            >
              <span className={categorieValue ? "text-stone-900" : "text-stone-400"}>
                {categorieValue || "Sélectionner une catégorie..."}
              </span>
              <span className="text-stone-400 text-xs ml-2">{categorieDropdownOpen ? "▲" : "▼"}</span>
            </button>
          )}
          {categorieDropdownOpen && !isAddingNewCategorie && (
            <div className="absolute z-50 mt-1 w-full bg-white border border-stone-200 rounded-lg shadow-lg max-h-60 overflow-hidden animate-[fadeIn_0.15s_ease-out]">
              {categorieSuggestions.length > 3 && (
                <div className="p-2 border-b border-stone-100">
                  <input
                    type="text"
                    value={categorieSearchQuery}
                    onChange={(e) => setCategorieSearchQuery(e.target.value)}
                    placeholder="Filtrer..."
                    autoFocus
                    className="w-full px-2 py-1.5 text-sm border border-stone-200 rounded focus:outline-none focus:border-brand-600"
                  />
                </div>
              )}
              <div className="overflow-y-auto max-h-48">
                {categorieValue && (
                  <button
                    type="button"
                    onClick={() => {
                      setCategorieValue("");
                      setCategorieDropdownOpen(false);
                      setCategorieSearchQuery("");
                    }}
                    className="w-full px-3 py-2 text-sm text-left text-stone-400 italic hover:bg-stone-50 cursor-pointer bg-transparent border-none"
                  >
                    Aucune catégorie
                  </button>
                )}
                {filteredCategorieSuggestions.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setCategorieValue(cat);
                      setCategorieDropdownOpen(false);
                      setCategorieSearchQuery("");
                    }}
                    className={`w-full px-3 py-2 text-sm text-left hover:bg-brand-600/5 cursor-pointer bg-transparent border-none flex items-center justify-between ${
                      categorieValue === cat ? "bg-brand-600/10 text-brand-600 font-medium" : "text-stone-700"
                    }`}
                  >
                    <span>{cat}</span>
                    {categorieValue === cat && <span className="text-brand-600">✓</span>}
                  </button>
                ))}
                {categorieSearchQuery && filteredCategorieSuggestions.length === 0 && (
                  <div className="px-3 py-2 text-sm text-stone-400 italic">Aucune catégorie trouvée</div>
                )}
              </div>
              <div className="border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingNewCategorie(true);
                    setCategorieDropdownOpen(false);
                    setCategorieSearchQuery("");
                    setCategorieValue("");
                  }}
                  className="w-full px-3 py-2.5 text-sm text-left text-brand-600 font-medium hover:bg-brand-600/5 cursor-pointer bg-transparent border-none flex items-center gap-2"
                >
                  <span>+</span>
                  <span>Ajouter une catégorie</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Assignée à - même pattern que les catégories */}
        <div className="relative" ref={assigneADropdownRef}>
          <label className="block mb-1 text-sm font-medium text-stone-700">Assignée à</label>
          <input type="hidden" name="assigneA" value={assigneAValue} />
          {isAddingNewPersonne ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={assigneAValue}
                onChange={(e) => setAssigneAValue(e.target.value)}
                placeholder="Nom de la personne..."
                autoFocus
                className="flex-1 px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10"
              />
              <button
                type="button"
                onClick={() => {
                  setIsAddingNewPersonne(false);
                  if (!assigneAValue) setAssigneADropdownOpen(false);
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
                setAssigneADropdownOpen(!assigneADropdownOpen);
                setAssigneASearchQuery("");
              }}
              className={`w-full px-3 py-2 border border-stone-300 rounded-lg text-left flex items-center justify-between cursor-pointer bg-white focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10 ${
                assigneADropdownOpen ? "border-brand-600 ring-2 ring-brand-500/10" : ""
              }`}
            >
              <span className={assigneAValue ? "text-stone-900" : "text-stone-400"}>
                {assigneAValue || "Sélectionner une personne..."}
              </span>
              <span className="text-stone-400 text-xs ml-2">{assigneADropdownOpen ? "▲" : "▼"}</span>
            </button>
          )}
          {assigneADropdownOpen && !isAddingNewPersonne && (
            <div className="absolute z-50 mt-1 w-full bg-white border border-stone-200 rounded-lg shadow-lg max-h-60 overflow-hidden animate-[fadeIn_0.15s_ease-out]">
              {personneSuggestions.length > 3 && (
                <div className="p-2 border-b border-stone-100">
                  <input
                    type="text"
                    value={assigneASearchQuery}
                    onChange={(e) => setAssigneASearchQuery(e.target.value)}
                    placeholder="Filtrer..."
                    autoFocus
                    className="w-full px-2 py-1.5 text-sm border border-stone-200 rounded focus:outline-none focus:border-brand-600"
                  />
                </div>
              )}
              <div className="overflow-y-auto max-h-48">
                {assigneAValue && (
                  <button
                    type="button"
                    onClick={() => {
                      setAssigneAValue("");
                      setAssigneADropdownOpen(false);
                      setAssigneASearchQuery("");
                    }}
                    className="w-full px-3 py-2 text-sm text-left text-stone-400 italic hover:bg-stone-50 cursor-pointer bg-transparent border-none"
                  >
                    Aucune personne
                  </button>
                )}
                {filteredPersonneSuggestions.map((personne) => (
                  <button
                    key={personne}
                    type="button"
                    onClick={() => {
                      setAssigneAValue(personne);
                      setAssigneADropdownOpen(false);
                      setAssigneASearchQuery("");
                    }}
                    className={`w-full px-3 py-2 text-sm text-left hover:bg-brand-600/5 cursor-pointer bg-transparent border-none flex items-center justify-between ${
                      assigneAValue === personne ? "bg-brand-600/10 text-brand-600 font-medium" : "text-stone-700"
                    }`}
                  >
                    <span>{personne}</span>
                    {assigneAValue === personne && <span className="text-brand-600">✓</span>}
                  </button>
                ))}
                {assigneASearchQuery && filteredPersonneSuggestions.length === 0 && (
                  <div className="px-3 py-2 text-sm text-stone-400 italic">Aucune personne trouvée</div>
                )}
              </div>
              <div className="border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingNewPersonne(true);
                    setAssigneADropdownOpen(false);
                    setAssigneASearchQuery("");
                    setAssigneAValue("");
                  }}
                  className="w-full px-3 py-2.5 text-sm text-left text-brand-600 font-medium hover:bg-brand-600/5 cursor-pointer bg-transparent border-none flex items-center gap-2"
                >
                  <span>+</span>
                  <span>Ajouter une personne</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block mb-1 text-sm font-medium text-stone-700">Description</label>
        <textarea
          name="description"
          defaultValue={task?.description || ""}
          placeholder="Détails de la tâche..."
          rows={3}
          className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10 resize-y min-h-[80px]"
        />
      </div>

      {/* Photo jointe */}
      <div>
        <label className="block mb-1 text-sm font-medium text-stone-700">
          Photo jointe <span className="text-xs text-stone-400 font-normal">(optionnel)</span>
        </label>
        {photoPreview ? (
          <div className="flex items-start gap-3">
            <img
              src={photoPreview}
              alt="Aperçu"
              className="w-24 h-24 object-cover rounded-lg border border-stone-200"
            />
            <button
              type="button"
              onClick={() => {
                setPhotoPreview(null);
                if (photoFileRef) photoFileRef.current = null;
                if (fileInputRef.current) fileInputRef.current.value = "";
                if (task?.photoUrl && onPhotoRemoved) onPhotoRemoved();
              }}
              className="px-2 py-1 text-xs text-red-500 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 cursor-pointer"
            >
              Supprimer
            </button>
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="w-full px-3 py-4 border-2 border-dashed border-stone-300 rounded-lg text-center cursor-pointer hover:border-brand-600 hover:bg-brand-600/5 transition-colors"
          >
            <span className="text-stone-400 text-sm">Cliquez pour ajouter une photo</span>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              if (photoFileRef) photoFileRef.current = file;
              const reader = new FileReader();
              reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
              reader.readAsDataURL(file);
            }
          }}
        />
      </div>

      {/* Lier un animal / Lier un véhicule */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Animal */}
        <div className="relative" ref={animalDropdownRef}>
          <label className="block mb-1 text-sm font-medium text-stone-700">
            Lier un animal <span className="text-xs text-stone-400 font-normal">(optionnel)</span>
          </label>
          <input type="hidden" name="animalId" value={selectedAnimalId} />
          <input type="hidden" name="animalNom" value={animalDisplayName} />
          <button
            type="button"
            onClick={() => {
              setAnimalDropdownOpen(!animalDropdownOpen);
              setAnimalSearchQuery("");
            }}
            className={`w-full px-3 py-2 border border-stone-300 rounded-lg text-left flex items-center justify-between cursor-pointer bg-white focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10 ${
              animalDropdownOpen ? "border-brand-600 ring-2 ring-brand-500/10" : ""
            }`}
          >
            <span className={selectedAnimalId ? "text-stone-900" : "text-stone-400"}>
              {selectedAnimalId
                ? `${getAnimalIcon(selectedAnimal?.type || "")} ${animalDisplayName}`
                : "Aucun animal"}
            </span>
            <span className="text-stone-400 text-xs ml-2">{animalDropdownOpen ? "▲" : "▼"}</span>
          </button>
          {animalDropdownOpen && (
            <div className="absolute z-50 mt-1 w-full bg-white border border-stone-200 rounded-lg shadow-lg max-h-60 overflow-hidden animate-[fadeIn_0.15s_ease-out]">
              <div className="p-2 border-b border-stone-100">
                <input
                  type="text"
                  value={animalSearchQuery}
                  onChange={(e) => setAnimalSearchQuery(e.target.value)}
                  placeholder="Rechercher un animal..."
                  autoFocus
                  className="w-full px-2 py-1.5 text-sm border border-stone-200 rounded focus:outline-none focus:border-brand-600"
                />
              </div>
              <div className="overflow-y-auto max-h-48">
                {selectedAnimalId && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAnimalId("");
                      setAnimalDropdownOpen(false);
                      setAnimalSearchQuery("");
                    }}
                    className="w-full px-3 py-2 text-sm text-left text-stone-400 italic hover:bg-stone-50 cursor-pointer bg-transparent border-none"
                  >
                    Aucun animal
                  </button>
                )}
                {filteredAnimals.map((animal) => {
                  const name = animal.nom
                    ? `${animal.nom}${animal.numeroBoucle ? ` (${animal.numeroBoucle})` : ""}`
                    : animal.numeroBoucle || "Sans nom";
                  return (
                    <button
                      key={animal.id}
                      type="button"
                      onClick={() => {
                        setSelectedAnimalId(animal.id);
                        setAnimalDropdownOpen(false);
                        setAnimalSearchQuery("");
                      }}
                      className={`w-full px-3 py-2 text-sm text-left hover:bg-brand-600/5 cursor-pointer bg-transparent border-none flex items-center gap-2 ${
                        selectedAnimalId === animal.id ? "bg-brand-600/10 text-brand-600 font-medium" : "text-stone-700"
                      }`}
                    >
                      <span>{getAnimalIcon(animal.type)}</span>
                      <span className="flex-1">{name}</span>
                      {animal.race && <span className="text-xs text-stone-400">{animal.race}</span>}
                      {selectedAnimalId === animal.id && <span className="text-brand-600">✓</span>}
                    </button>
                  );
                })}
                {animalSearchQuery && filteredAnimals.length === 0 && (
                  <div className="px-3 py-2 text-sm text-stone-400 italic">Aucun animal trouvé</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Véhicule */}
        <div className="relative" ref={vehiculeDropdownRef}>
          <label className="block mb-1 text-sm font-medium text-stone-700">
            Lier un véhicule <span className="text-xs text-stone-400 font-normal">(optionnel)</span>
          </label>
          <input type="hidden" name="vehiculeId" value={selectedVehiculeId} />
          <input type="hidden" name="vehiculeNom" value={vehiculeDisplayName} />
          <button
            type="button"
            onClick={() => {
              setVehiculeDropdownOpen(!vehiculeDropdownOpen);
              setVehiculeSearchQuery("");
            }}
            className={`w-full px-3 py-2 border border-stone-300 rounded-lg text-left flex items-center justify-between cursor-pointer bg-white focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10 ${
              vehiculeDropdownOpen ? "border-brand-600 ring-2 ring-brand-500/10" : ""
            }`}
          >
            <span className={selectedVehiculeId ? "text-stone-900" : "text-stone-400"}>
              {selectedVehiculeId
                ? `${getVehicleIcon(selectedVehicle?.type || "voiture")} ${vehiculeDisplayName}`
                : "Aucun véhicule"}
            </span>
            <span className="text-stone-400 text-xs ml-2">{vehiculeDropdownOpen ? "▲" : "▼"}</span>
          </button>
          {vehiculeDropdownOpen && (
            <div className="absolute z-50 mt-1 w-full bg-white border border-stone-200 rounded-lg shadow-lg max-h-60 overflow-hidden animate-[fadeIn_0.15s_ease-out]">
              <div className="p-2 border-b border-stone-100">
                <input
                  type="text"
                  value={vehiculeSearchQuery}
                  onChange={(e) => setVehiculeSearchQuery(e.target.value)}
                  placeholder="Rechercher un véhicule..."
                  autoFocus
                  className="w-full px-2 py-1.5 text-sm border border-stone-200 rounded focus:outline-none focus:border-brand-600"
                />
              </div>
              <div className="overflow-y-auto max-h-48">
                {selectedVehiculeId && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedVehiculeId("");
                      setVehiculeDropdownOpen(false);
                      setVehiculeSearchQuery("");
                    }}
                    className="w-full px-3 py-2 text-sm text-left text-stone-400 italic hover:bg-stone-50 cursor-pointer bg-transparent border-none"
                  >
                    Aucun véhicule
                  </button>
                )}
                {filteredVehicles.map((vehicle) => (
                  <button
                    key={vehicle.id}
                    type="button"
                    onClick={() => {
                      setSelectedVehiculeId(vehicle.id);
                      setVehiculeDropdownOpen(false);
                      setVehiculeSearchQuery("");
                    }}
                    className={`w-full px-3 py-2 text-sm text-left hover:bg-brand-600/5 cursor-pointer bg-transparent border-none flex items-center gap-2 ${
                      selectedVehiculeId === vehicle.id ? "bg-brand-600/10 text-brand-600 font-medium" : "text-stone-700"
                    }`}
                  >
                    <span>{getVehicleIcon(vehicle.type)}</span>
                    <span className="flex-1">{getVehicleDisplayName(vehicle)}</span>
                    {vehicle.plaqueImmatriculation && (
                      <span className="text-xs text-stone-400">{vehicle.plaqueImmatriculation}</span>
                    )}
                    {selectedVehiculeId === vehicle.id && <span className="text-brand-600">✓</span>}
                  </button>
                ))}
                {vehiculeSearchQuery && filteredVehicles.length === 0 && (
                  <div className="px-3 py-2 text-sm text-stone-400 italic">Aucun véhicule trouvé</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
