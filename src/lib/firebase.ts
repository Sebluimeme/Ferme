import { initializeApp, getApps } from "firebase/app";
import { connectDatabaseEmulator, getDatabase } from "firebase/database";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectStorageEmulator, getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "VOTRE_API_KEY",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "votre-projet.firebaseapp.com",
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "https://votre-projet-default-rtdb.firebaseio.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "votre-projet",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "votre-projet.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "123456789012",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:123456789012:web:abcdef1234567890",
};

const useEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";
if (useEmulators && !firebaseConfig.projectId.startsWith("demo-")) {
  throw new Error("Les émulateurs Firebase exigent un projet fictif demo-.");
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const database = getDatabase(app);
const auth = getAuth(app);

if (useEmulators && typeof window !== "undefined") {
  if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(window.location.hostname)) {
    throw new Error("Les émulateurs Firebase sont réservés à une application locale.");
  }
  if (!app.options.projectId?.startsWith("demo-")) {
    throw new Error("Une application Firebase réelle ne peut pas utiliser ce mode de test.");
  }
  // Le SDK conserve l'application entre deux rafraîchissements des modules en
  // développement. Connecter une seule fois évite une reconnexion après usage.
  const emulatorState = globalThis as typeof globalThis & { __fermeEmulatorApps?: WeakSet<object> };
  emulatorState.__fermeEmulatorApps ??= new WeakSet<object>();
  if (!emulatorState.__fermeEmulatorApps.has(app)) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectDatabaseEmulator(database, "127.0.0.1", 9000);
    connectStorageEmulator(getStorage(app), "127.0.0.1", 9199);
    emulatorState.__fermeEmulatorApps.add(app);
  }
}

export { app, database, auth };
