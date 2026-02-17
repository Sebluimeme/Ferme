"use client";

import { useState, useEffect, useRef } from "react";
import { useToast } from "@/components/Toast";
import Modal from "@/components/Modal";
import type { VehiclePhoto } from "@/types/vehicle";
import {
  addPhoto,
  deletePhoto,
  listenPhotos,
} from "@/services/vehicle-detail-service";

interface VehiclePhotoGalleryProps {
  vehicleId: string;
}

export default function VehiclePhotoGallery({ vehicleId }: VehiclePhotoGalleryProps) {
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<VehiclePhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VehiclePhoto | null>(null);

  useEffect(() => {
    const unsubscribe = listenPhotos(vehicleId, (data) => {
      setPhotos(
        data.sort(
          (a, b) =>
            new Date(b.dateCreation || "").getTime() -
            new Date(a.dateCreation || "").getTime()
        )
      );
    });
    return () => unsubscribe();
  }, [vehicleId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    let successCount = 0;
    try {
      for (const file of Array.from(files)) {
        const result = await addPhoto(vehicleId, file);
        if (result.success) {
          successCount++;
        } else {
          showToast({
            type: "error",
            title: "Erreur",
            message: result.error || `Erreur lors de l'upload de ${file.name}`,
          });
        }
      }
      if (successCount > 0) {
        showToast({
          type: "success",
          title: "Succès",
          message: `${successCount} photo(s) ajoutée(s)`,
        });
      }
    } catch {
      showToast({ type: "error", title: "Erreur", message: "Erreur lors de l'upload" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const result = await deletePhoto(deleteTarget.id, deleteTarget.storagePath);
    if (result.success) {
      showToast({ type: "success", title: "Succès", message: "Photo supprimée" });
    } else {
      showToast({
        type: "error",
        title: "Erreur",
        message: result.error || "Erreur lors de la suppression",
      });
    }
    setDeleteTarget(null);
    setLightboxIndex(null);
  };

  const navigateLightbox = (direction: "prev" | "next") => {
    if (lightboxIndex === null) return;
    if (direction === "prev" && lightboxIndex > 0) {
      setLightboxIndex(lightboxIndex - 1);
    } else if (direction === "next" && lightboxIndex < photos.length - 1) {
      setLightboxIndex(lightboxIndex + 1);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Photos du véhicule</h3>
        <label className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-primary to-secondary rounded-lg hover:from-primary-dark hover:to-secondary-dark cursor-pointer transition-colors">
          {uploading ? "Upload..." : "+ Ajouter des photos"}
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
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
          <div className="text-4xl mb-3">📷</div>
          <p className="text-gray-500 mb-1">Aucune photo</p>
          <p className="text-gray-400 text-sm">
            Ajoutez des photos de votre véhicule
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {photos.map((photo, index) => (
            <div
              key={photo.id}
              className="group relative aspect-square rounded-lg overflow-hidden bg-gray-100 shadow-sm hover:shadow-md transition-shadow"
            >
              <img
                src={photo.url}
                alt={photo.description || "Photo du véhicule"}
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => setLightboxIndex(index)}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(photo);
                }}
                className="absolute top-2 right-2 w-7 h-7 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-sm flex items-center justify-center"
              >
                &times;
              </button>
              {photo.description && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-2 py-1 truncate">
                  {photo.description}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox avec navigation */}
      <Modal
        isOpen={lightboxIndex !== null}
        onClose={() => setLightboxIndex(null)}
        title=""
        size="large"
      >
        {lightboxIndex !== null && photos[lightboxIndex] && (
          <div className="relative">
            <img
              src={photos[lightboxIndex].url}
              alt={photos[lightboxIndex].description || ""}
              className="w-full h-auto rounded-lg max-h-[70vh] object-contain"
            />

            {/* Navigation */}
            {photos.length > 1 && (
              <>
                {lightboxIndex > 0 && (
                  <button
                    onClick={() => navigateLightbox("prev")}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 text-white rounded-full flex items-center justify-center hover:bg-black/70 cursor-pointer"
                  >
                    ‹
                  </button>
                )}
                {lightboxIndex < photos.length - 1 && (
                  <button
                    onClick={() => navigateLightbox("next")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 text-white rounded-full flex items-center justify-center hover:bg-black/70 cursor-pointer"
                  >
                    ›
                  </button>
                )}
              </>
            )}

            {/* Info photo */}
            <div className="mt-3 flex items-center justify-between">
              <div className="text-sm text-gray-500">
                {lightboxIndex + 1} / {photos.length}
                {photos[lightboxIndex].description && (
                  <span className="ml-2 text-gray-700">
                    — {photos[lightboxIndex].description}
                  </span>
                )}
              </div>
              <button
                onClick={() => setDeleteTarget(photos[lightboxIndex])}
                className="px-3 py-1.5 text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg cursor-pointer"
              >
                Supprimer cette photo
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirmation de suppression */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Supprimer la photo"
        size="small"
      >
        <p className="text-gray-700">
          Voulez-vous vraiment supprimer cette photo ?
        </p>
        <div className="flex gap-3 justify-end mt-6">
          <button
            onClick={() => setDeleteTarget(null)}
            className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 cursor-pointer"
          >
            Annuler
          </button>
          <button
            onClick={handleDelete}
            className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 cursor-pointer"
          >
            Supprimer
          </button>
        </div>
      </Modal>
    </div>
  );
}
