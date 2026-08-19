#!/usr/bin/env node
/**
 * Test de non-régression pour les vignettes de la liste Animaux.
 * Vérifie statiquement que AnimalCard sert des photos redimensionnées/recompressées
 * via next/image (pas l'image source brute) et que next.config.ts autorise bien
 * les paramètres utilisés (qualité, domaine Firebase Storage).
 *
 * Usage: node scripts/test-animal-thumbnails.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message ?? "assertion failed");
}

const animalCard = readFileSync(join(root, "src/components/AnimalCard.tsx"), "utf-8");
const nextConfig = readFileSync(join(root, "next.config.ts"), "utf-8");

console.log("\n── AnimalCard : vignettes optimisées ─────────────────────────────────────\n");

test("Importe next/image (optimisation serveur, pas d'<img> brute)", () => {
  assert(/import\s+Image\s+from\s+["']next\/image["']/.test(animalCard), "import next/image manquant");
});

test("N'utilise plus <img> pour la photo animal", () => {
  assert(!/<img\b/.test(animalCard), "un <img> brut a été trouvé, il contournerait l'optimisation");
});

test("Le composant Image utilise fill + sizes borné à la taille réelle de la vignette (~144-160px)", () => {
  const sizesMatch = animalCard.match(/sizes=["']([^"']+)["']/);
  assert(sizesMatch, "attribut sizes manquant sur <Image>");
  // On ignore les conditions média (ex. "(min-width: 640px)") pour ne garder
  // que les largeurs de vignette réellement demandées au serveur.
  const sizesWithoutMediaConditions = sizesMatch[1].replace(/\([^)]*\)/g, "");
  const widths = [...sizesWithoutMediaConditions.matchAll(/(\d+)px/g)].map((m) => Number(m[1]));
  assert(widths.length > 0, "aucune largeur trouvée dans sizes");
  assert(widths.every((w) => w <= 200), `sizes annonce une largeur trop grande pour une vignette 160×190 : ${widths}`);
});

test("Une quality explicite est fournie sur <Image>", () => {
  const qualityMatch = animalCard.match(/quality=\{?(\d+)\}?/);
  assert(qualityMatch, "prop quality manquante sur <Image>");
  const quality = Number(qualityMatch[1]);
  assert(quality > 0 && quality <= 80, `quality=${quality} hors de la plage attendue pour une vignette (1-80)`);

  // La qualité utilisée doit être explicitement autorisée par next.config.ts,
  // sinon Next.js renvoie une 400 sur /_next/image (régression déjà rencontrée).
  const qualitiesMatch = nextConfig.match(/qualities:\s*\[([^\]]+)\]/);
  assert(qualitiesMatch, "next.config.ts ne déclare pas images.qualities");
  const allowedQualities = qualitiesMatch[1].split(",").map((s) => Number(s.trim()));
  assert(
    allowedQualities.includes(quality),
    `quality=${quality} utilisée dans AnimalCard mais absente de images.qualities=[${allowedQualities}] dans next.config.ts`
  );
});

console.log("\n── next.config.ts : domaine Firebase Storage autorisé ────────────────────\n");

test("Autorise l'optimisation des images depuis firebasestorage.googleapis.com", () => {
  assert(
    /hostname:\s*["']firebasestorage\.googleapis\.com["']/.test(nextConfig),
    "remotePattern firebasestorage.googleapis.com manquant : next/image ne pourrait pas optimiser les photos animaux"
  );
});

console.log(`\n${"─".repeat(60)}`);
console.log(`Résultats : ${passed} passés, ${failed} échoués`);
if (failed > 0) {
  console.error("❌ Certains tests ont échoué !");
  process.exit(1);
} else {
  console.log("✅ Tous les tests passent.");
}
