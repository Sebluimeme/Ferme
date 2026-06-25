"use client";

import { useState, useRef } from "react";
import { useToast } from "@/components/Toast";
import Modal from "@/components/Modal";
import { addPhoto, deletePhoto, type AnimalPhoto } from "@/services/animal-detail-service";

interface PhotoGalleryProps {
  animalId: string;
  photos: AnimalPhoto[];
}

export default function PhotoGallery({ animalId, photos }: PhotoGalleryProps) {
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AnimalPhoto | null>(null);

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
  };

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

      {photos.length === 0 ? (
        <div className="text-center py-12 text-stone-400">
          <div className="text-4xl mb-2">📷</div>
          <p>Aucune photo</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {photos.map((photo) => (
            <div key={photo.id} className="group relative aspect-square rounded-lg overflow-hidden bg-stone-100">
              <img
                src={photo.url}
                alt={photo.nom}
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => setLightboxUrl(photo.url)}
              />
              <button
                onClick={(e) => { e.stopPropagation(); setDeleteTarget(photo); }}
                className="absolute top-2 right-2 w-7 h-7 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-sm flex items-center justify-center"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      <Modal isOpen={!!lightboxUrl} onClose={() => setLightboxUrl(null)} title="" size="large">
        {lightboxUrl && (
          <img src={lightboxUrl} alt="" className="w-full h-auto rounded-lg" />
        )}
      </Modal>

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