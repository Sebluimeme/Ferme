"use client";

import { useState, useRef, useEffect } from "react";
import { useToast } from "@/components/Toast";
import Modal from "@/components/Modal";
import { addPhoto, deletePhoto, type AnimalPhoto } from "@/services/animal-detail-service";

interface PhotoGalleryProps {
  animalId: string;
  photos: AnimalPhoto[];
  profilePhotoUrl?: string;
}

export default function PhotoGallery({ animalId, photos, profilePhotoUrl }: PhotoGalleryProps) {
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AnimalPhoto | null>(null);

  // Navigation clavier dans le lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowLeft") {
        if (lightboxIndex > 0) setLightboxIndex(lightboxIndex - 1);
        else if (lightboxIndex === 0 && profilePhotoUrl) setLightboxIndex(-1);
      }
      if (e.key === "ArrowRight") {
        if (lightboxIndex === -1 && photos.length > 0) setLightboxIndex(0);
        else if (lightboxIndex >= 0 && lightboxIndex < photos.length - 1) setLightboxIndex(lightboxIndex + 1);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [lightboxIndex, photos.length, profilePhotoUrl]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const result = await addPhoto(animalId, file);
        if (!result.success) {
          showToast({ type: "error", title: "Erreur", message: result.error || "Erreur lors de l'upload" });
        }
      }
      showToast({ type: "success", title: "Succès", message: `${files.length} photo(s) ajoutée(s)` });
    } catch {
      showToast({ type: "error", title: "Erreur", message: "Erreur lors de l'upload" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const result = await deletePhoto(animalId, deleteTarget.id, deleteTarget.storagePath);
    if (result.success) {
      showToast({ type: "success", title: "Succès", message: "Photo supprimée" });
    } else {
      showToast({ type: "error", title: "Erreur", message: result.error || "Erreur lors de la suppression" });
    }
    setDeleteTarget(null);
    setLightboxIndex(null);
  };

  // -1 = photo de profil, 0+ = galerie
  const isProfileLightbox = lightboxIndex === -1;
  const currentPhoto = lightboxIndex !== null && lightboxIndex >= 0 ? photos[lightboxIndex] : null;
  const lightboxUrl = isProfileLightbox ? profilePhotoUrl : currentPhoto?.url;
  const lightboxOpen = lightboxIndex !== null && !!lightboxUrl;

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Photos</h2>
        <label className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 cursor-pointer">
          {uploading ? "Upload..." : "+ Ajouter"}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>

      {photos.length === 0 && !profilePhotoUrl ? (
        <div className="text-center py-12 text-stone-400">
          <div className="text-4xl mb-2">📷</div>
          <p>Aucune photo</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {/* Photo de profil en premier */}
          {profilePhotoUrl && (
            <div
              className="group relative aspect-square rounded-lg overflow-hidden bg-stone-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setLightboxIndex(-1)}
            >
              <img
                src={profilePhotoUrl}
                alt="Photo de profil"
                className="w-full h-full object-cover"
              />
              {/* Badge profil */}
              <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] font-medium px-2 py-1 text-center">
                ⭐ Photo de profil
              </div>
            </div>
          )}

          {photos.map((photo, index) => (
            <div key={photo.id} className="group relative aspect-square rounded-lg overflow-hidden bg-stone-100 shadow-sm hover:shadow-md transition-shadow">
              <img
                src={photo.url}
                alt={photo.nom}
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => setLightboxIndex(index)}
              />
              {/* Bouton suppression discret — hover uniquement */}
              <button
                onClick={(e) => { e.stopPropagation(); setDeleteTarget(photo); }}
                className="absolute top-2 right-2 w-7 h-7 bg-black/40 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-sm flex items-center justify-center hover:bg-red-500/80"
                title="Supprimer"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox fullscreen — z-[1100] pour passer au-dessus BottomNav (z-1025) et Sidebar (z-1030) */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[1100] bg-black/95 flex items-center justify-center"
          onClick={() => setLightboxIndex(null)}
        >
          {/* Fermer — top-14 pour laisser la place à la barre navigateur mobile */}
          <button
            onClick={() => setLightboxIndex(null)}
            className="absolute top-14 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center text-xl cursor-pointer transition-colors z-10"
          >
            ✕
          </button>

          {/* Supprimer — uniquement sur les photos de galerie, pas la photo de profil */}
          {currentPhoto && (
            <button
              onClick={(e) => { e.stopPropagation(); setDeleteTarget(currentPhoto); }}
              className="absolute top-14 left-4 w-10 h-10 bg-white/10 hover:bg-red-500/60 text-white rounded-full flex items-center justify-center text-base cursor-pointer transition-colors z-10"
              title="Supprimer cette photo"
            >
              🗑
            </button>
          )}

          {/* Badge profil dans lightbox */}
          {isProfileLightbox && (
            <div className="absolute top-14 left-4 bg-black/50 text-white text-xs font-medium px-3 py-1.5 rounded-full">
              ⭐ Photo de profil
            </div>
          )}

          {/* Compteur */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
            {profilePhotoUrl ? (lightboxIndex! + 2) : (lightboxIndex! + 1)} / {photos.length + (profilePhotoUrl ? 1 : 0)}
          </div>

          {/* Navigation gauche */}
          {(lightboxIndex! > 0 || (lightboxIndex === 0 && profilePhotoUrl)) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (lightboxIndex === 0 && profilePhotoUrl) setLightboxIndex(-1);
                else setLightboxIndex(lightboxIndex! - 1);
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center text-2xl cursor-pointer transition-colors"
            >
              ‹
            </button>
          )}

          {/* Image */}
          <img
            src={lightboxUrl}
            alt={currentPhoto?.nom || "Photo de profil"}
            className="max-w-full max-h-full object-contain p-16 cursor-default"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Navigation droite */}
          {((isProfileLightbox && photos.length > 0) || (lightboxIndex !== null && lightboxIndex >= 0 && lightboxIndex < photos.length - 1)) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isProfileLightbox) setLightboxIndex(0);
                else setLightboxIndex(lightboxIndex! + 1);
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center text-2xl cursor-pointer transition-colors"
            >
              ›
            </button>
          )}
        </div>
      )}

      {/* Confirm delete */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Supprimer la photo" size="small">
        <p className="text-stone-700">Voulez-vous vraiment supprimer cette photo ?</p>
        <div className="flex gap-3 justify-end mt-6">
          <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm font-medium bg-stone-100 text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-200 cursor-pointer">
            Annuler
          </button>
          <button onClick={handleDelete} className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 cursor-pointer">
            Supprimer
          </button>
        </div>
      </Modal>
    </div>
  );
}
