/**
 * Migration : crée les transactions miroir pour les ventes-miel sans transactionId
 * Usage : node scripts/migrate-ventes-miel.mjs
 */

import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, set, push, update } from "firebase/database";
import { signInWithEmailAndPassword, getAuth } from "firebase/auth";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");

// Lire .env.local
const env = {};
readFileSync(envPath, "utf8").split("\n").forEach((line) => {
  const [k, ...v] = line.split("=");
  if (k && v.length) env[k.trim()] = v.join("=").trim();
});

const firebaseConfig = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Login depuis .env.local ou args
const EMAIL = process.argv[2] || env.FIREBASE_EMAIL;
const PASSWORD = process.argv[3] || env.FIREBASE_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("Usage: node scripts/migrate-ventes-miel.mjs <email> <password>");
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

function buildTransaction(v) {
  const detail = [];
  if ((v.nbPots500g ?? 0) > 0) detail.push(`${v.nbPots500g}×½kg`);
  if ((v.nbPots1kg ?? 0) > 0) detail.push(`${v.nbPots1kg}×1kg`);
  const produit = `Vente miel${detail.length ? ` (${detail.join(", ")})` : ""}`;
  return {
    date: v.dateVente,
    operation: "Revenus",
    production: "Abeille",
    categorie: "Ventes",
    sousCategorie: "Miel",
    produit,
    remarque: v.notes ?? "",
    fournisseur: "",
    quantite: (v.nbPots500g ?? 0) + (v.nbPots1kg ?? 0),
    payeur: "Ferme",
    montant: v.prixTotal,
  };
}

async function migrate() {
  console.log("🔐 Connexion Firebase...");
  await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);
  console.log("✅ Connecté");

  const ventesSnap = await get(ref(db, "ventes-miel"));
  if (!ventesSnap.exists()) {
    console.log("Aucune vente-miel trouvée.");
    return;
  }

  const ventes = ventesSnap.val();
  const ids = Object.keys(ventes);
  console.log(`📊 ${ids.length} vente(s) trouvée(s)`);

  let migrated = 0;
  let skipped = 0;

  for (const id of ids) {
    const v = ventes[id];
    if (v.transactionId) {
      console.log(`  ⏭  ${id} — déjà migrée (transactionId=${v.transactionId})`);
      skipped++;
      continue;
    }

    // Créer la transaction
    const txRef = push(ref(db, "transactions"));
    await set(txRef, buildTransaction(v));
    const transactionId = txRef.key;

    // Mettre à jour la vente avec le lien
    await update(ref(db, `ventes-miel/${id}`), { transactionId });

    const detail = [];
    if ((v.nbPots500g ?? 0) > 0) detail.push(`${v.nbPots500g}×½kg`);
    if ((v.nbPots1kg ?? 0) > 0) detail.push(`${v.nbPots1kg}×1kg`);
    console.log(`  ✅ ${id} — ${v.dateVente} — ${v.prixTotal}€ ${detail.join(",")} → tx=${transactionId}`);
    migrated++;
  }

  console.log(`\n🎉 Migration terminée: ${migrated} créée(s), ${skipped} ignorée(s)`);
  process.exit(0);
}

migrate().catch((e) => { console.error("❌ Erreur:", e.message); process.exit(1); });
