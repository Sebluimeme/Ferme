"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { Animal } from "@/store/store";
import { getAnimalIcon, getAnimalBgColor } from "@/lib/utils";
import { uploadAnimalPhoto, deleteAnimalPhoto } from "@/services/animal-service";
import { useToast } from "@/components/Toast";

interface AnimalHeaderProps {
  animal: Animal;
  onEdit: () => void;
  onDelete: () => void;
}

const statutColors: Record<string, string> = {
  actif: "bg-green-100 text-green-700",
  vendu: "bg-blue-100 text-blue-700",
  mort: "bg-stone-100 text-stone-500",
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
  const { showToast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

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

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadAnimalPhoto(animal.id, file, animal.photoStoragePath);
      if (result.success) {
        showToast({ type: "success", title: "Photo mise à jour", message: "La photo a été enregistrée." });
      } else {
        showToast({ type: "error", title: "Erreur", message: (result as any).error || "Erreur lors de l'upload" });
      }
    } finally {
      setUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const handleDeletePhoto = async () => {
    if (!animal.photoStoragePath) return;
    setUploading(true);
    try {
      await deleteAnimalPhoto(animal.id, animal.photoStoragePath);
      showToast({ type: "success", title: "Photo supprimée", message: "" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 mb-6">
      <div className="flex items-start gap-3 sm:gap-4">
        <button
          onClick={() => router.push(`/animaux?type=${animal.type}`)}
          className="text-stone-500 hover:text-stone-800 text-xl cursor-pointer bg-transparent border-none p-1"
        >
          &larr;
        </button>

        {/* Zone photo / emoji — cliquable pour changer la photo */}
        <div className="relative group shrink-0">
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoChange}
          />
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={uploading}
            className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden border-2 border-stone-200 hover:border-brand-400 transition-colors cursor-pointer bg-stone-50 flex items-center justify-center disabled:opacity-60"
            title="Changer la photo"
          >
            {animal.photoUrl ? (
              <Image
                src={animal.photoUrl}
                alt={animal.nom || animal.numeroBoucle || "Photo"}
                fill
                className="object-cover"
                sizes="64px"
              />
            ) : (
              <span className="text-3xl sm:text-4xl">{getAnimalIcon(animal.type)}</span>
            )}
            {/* Overlay "📷" au hover */}
            <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity text-white text-lg">
              {uploading ? "⏳" : "📷"}
            </span>
          </button>
          {/* Bouton supprimer photo */}
          {animal.photoUrl && !uploading && (
            <button
              type="button"
              onClick={handleDeletePhoto}
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center shadow hover:bg-red-600 cursor-pointer border-2 border-white"
              title="Supprimer la photo"
            >
              ✕
            </button>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 break-words">
            {animal.numeroBoucle || animal.nom || "Animal sans identifiant"}
          </h1>
          {animal.nom && (
            <div className="text-sm text-stone-500 mt-1">{animal.nom}</div>
          )}
          <div className="flex gap-2 mt-2 flex-wrap">
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${getAnimalBgColor(animal.type)}`}>
              {animal.type.charAt(0).toUpperCase() + animal.type.slice(1)}
            </span>
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${statutColors[animal.statut] || ""}`}>
              {statutLabels[animal.statut] || animal.statut}
            </span>
            {animal.sexe && (
              <span className="text-xs font-medium px-2 py-1 rounded-full bg-stone-100 text-stone-600">
                {animal.sexe === "M" ? "♂ Mâle" : "♀ Femelle"}
              </span>
            )}
          </div>
        </div>

        {/* Desktop: boutons visibles */}
        <div className="hidden sm:flex gap-2">
          <button
            onClick={onEdit}
            className="px-3 py-1.5 text-sm font-medium bg-stone-100 text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-200 cursor-pointer"
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
            className="p-2 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-lg cursor-pointer bg-transparent border-none text-xl leading-none"
            aria-label="Actions"
          >
            &#8942;
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-stone-200 py-1 z-50 min-w-[140px] animate-[fadeIn_0.15s_ease-out]">
              <button
                onClick={() => { setMenuOpen(false); onEdit(); }}
                className="w-full px-4 py-2.5 text-sm text-left text-stone-700 hover:bg-stone-50 cursor-pointer bg-transparent border-none flex items-center gap-2"
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