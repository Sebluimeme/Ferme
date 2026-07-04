import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { app } from "./firebase";

const storage = getStorage(app);

export interface StorageResult {
  success: boolean;
  url?: string;
  storagePath?: string;
  error?: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function uploadFile(
  path: string,
  file: File
): Promise<StorageResult> {
  if (file.size > MAX_FILE_SIZE) {
    return { success: false, error: "Le fichier dépasse la taille maximale de 10 MB" };
  }
  try {
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    return { success: true, url, storagePath: path };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Compresse une image côté client via Canvas.
 * - Redimensionne à maxPx max (largeur ou hauteur)
 * - Encode en JPEG à la qualité donnée (0-1)
 * Retourne un File compressé, ou le fichier original si la compression échoue.
 */
export async function compressImage(file: File, maxPx = 800, quality = 0.78): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(file);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(file);
          const name = file.name.replace(/\.[^.]+$/, ".jpg");
          resolve(new File([blob], name, { type: "image/jpeg" }));
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}

export async function deleteFile(path: string): Promise<StorageResult> {
  try {
    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}
