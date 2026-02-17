import {
  ref,
  set,
  get,
  push,
  update,
  remove,
  onValue,
  query,
  orderByChild,
  equalTo,
  type Unsubscribe,
} from "firebase/database";
import { database } from "./firebase";

export interface FirebaseResult<T = unknown> {
  success: boolean;
  id?: string;
  data?: T;
  error?: string;
}

// Supprime récursivement les valeurs undefined d'un objet (Firebase les rejette)
function stripUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripUndefined) as T;
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (value !== undefined) {
      cleaned[key] = typeof value === "object" && value !== null ? stripUndefined(value) : value;
    }
  }
  return cleaned as T;
}

class FirebaseService {
  async create<T extends Record<string, unknown>>(path: string, data: T): Promise<FirebaseResult<T & { id: string }>> {
    try {
      const newRef = push(ref(database, path));
      const id = newRef.key!;
      const dataWithMetadata = stripUndefined({
        ...data,
        id,
        dateCreation: new Date().toISOString(),
        derniereMAJ: new Date().toISOString(),
      });
      await set(newRef, dataWithMetadata);
      return { success: true, id, data: dataWithMetadata as T & { id: string } };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async getById<T>(path: string, id: string): Promise<FirebaseResult<T>> {
    try {
      const snapshot = await get(ref(database, `${path}/${id}`));
      if (snapshot.exists()) {
        return { success: true, data: snapshot.val() as T };
      }
      return { success: false, error: "Entrée non trouvée" };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async getAll<T>(path: string): Promise<FirebaseResult<T[]>> {
    try {
      const snapshot = await get(ref(database, path));
      if (snapshot.exists()) {
        return { success: true, data: Object.values(snapshot.val()) as T[] };
      }
      return { success: true, data: [] };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async getWhere<T>(path: string, field: string, value: unknown): Promise<FirebaseResult<T[]>> {
    try {
      const dbRef = ref(database, path);
      const q = query(dbRef, orderByChild(field), equalTo(value as string | number | boolean | null));
      const snapshot = await get(q);
      if (snapshot.exists()) {
        return { success: true, data: Object.values(snapshot.val()) as T[] };
      }
      return { success: true, data: [] };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async update(path: string, id: string, updates: Record<string, unknown>): Promise<FirebaseResult> {
    try {
      const updateData = stripUndefined({ ...updates, derniereMAJ: new Date().toISOString() });
      await update(ref(database, `${path}/${id}`), updateData);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async delete(path: string, id: string): Promise<FirebaseResult> {
    try {
      await remove(ref(database, `${path}/${id}`));
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  listen<T>(path: string, callback: (data: T[]) => void): Unsubscribe {
    const dbRef = ref(database, path);
    return onValue(
      dbRef,
      (snapshot) => {
        if (snapshot.exists()) {
          callback(Object.values(snapshot.val()) as T[]);
        } else {
          callback([]);
        }
      },
      () => {
        callback([]);
      }
    );
  }

  listenWhere<T>(path: string, field: string, value: unknown, callback: (data: T[]) => void): Unsubscribe {
    const dbRef = ref(database, path);
    const q = query(dbRef, orderByChild(field), equalTo(value as string | number | boolean | null));
    return onValue(
      q,
      (snapshot) => {
        if (snapshot.exists()) {
          callback(Object.values(snapshot.val()) as T[]);
        } else {
          callback([]);
        }
      },
      () => {
        callback([]);
      }
    );
  }
}

const firebaseService = new FirebaseService();
export { firebaseService };
export default firebaseService;
