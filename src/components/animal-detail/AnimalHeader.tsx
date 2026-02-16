"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Animal } from "@/store/store";
import { getAnimalIcon, getAnimalBgColor } from "@/lib/utils";

interface AnimalHeaderProps {
  animal: Animal;
  onEdit: () => void;
  onDelete: () => void;
}

const statutColors: Record<string, string> = {
  actif: "bg-green-100 text-green-700",
  vendu: "bg-blue-100 text-blue-700",
  mort: "bg-gray-100 text-gray-500",
  reforme: "bg-amber-100 text-amber-700",
};

const statutLabels: Record<string, string> = {
  actif: "Actif",
  vendu: "Vendu",
  mort: "Mort",
  reforme: "Réformé",
};

export default function AnimalHeader({ animal, onEdit, onDelete }: AnimalHeaderProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [menuOpen]);

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 mb-6">
      <div className="flex items-start gap-3 sm:gap-4">
        <button
          onClick={() => router.push("/animaux")}
          className="text-gray-500 hover:text-gray-800 text-xl cursor-pointer bg-transparent border-none p-1"
        >
          &larr;
        </button>
        <span className="text-3xl sm:text-4xl">{getAnimalIcon(animal.type)}</span>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold m-0 break-words">
            {animal.nom || animal.numeroBoucle || "Animal sans identifiant"}
          </h1>
          {animal.numeroBoucle && animal.nom && (
            <div className="text-sm text-gray-500 mt-1">{animal.numeroBoucle}</div>
          )}
          <div className="flex gap-2 mt-2 flex-wrap">
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${getAnimalBgColor(animal.type)}`}>
              {animal.type.charAt(0).toUpperCase() + animal.type.slice(1)}
            </span>
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${statutColors[animal.statut] || ""}`}>
              {statutLabels[animal.statut] || animal.statut}
            </span>
            {animal.sexe && (
              <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                {animal.sexe === "M" ? "♂ Mâle" : "♀ Femelle"}
              </span>
            )}
          </div>
        </div>

        {/* Desktop: boutons visibles */}
        <div className="hidden sm:flex gap-2">
          <button
            onClick={onEdit}
            className="px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 cursor-pointer"
          >
            Modifier
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-1.5 text-sm font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 cursor-pointer"
          >
            Supprimer
          </button>
        </div>

        {/* Mobile: menu trois points */}
        <div className="sm:hidden relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg cursor-pointer bg-transparent border-none text-xl leading-none"
            aria-label="Actions"
          >
            &#8942;
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[140px] animate-[fadeIn_0.15s_ease-out]">
              <button
                onClick={() => { setMenuOpen(false); onEdit(); }}
                className="w-full px-4 py-2.5 text-sm text-left text-gray-700 hover:bg-gray-50 cursor-pointer bg-transparent border-none flex items-center gap-2"
              >
                ✏️ Modifier
              </button>
              <button
                onClick={() => { setMenuOpen(false); onDelete(); }}
                className="w-full px-4 py-2.5 text-sm text-left text-red-600 hover:bg-red-50 cursor-pointer bg-transparent border-none flex items-center gap-2"
              >
                🗑️ Supprimer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
