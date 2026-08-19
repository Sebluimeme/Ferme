#!/usr/bin/env node
/**
 * Test logique pure du cache court + déduplication (KeyedRequestCache).
 * Usage: node --experimental-strip-types scripts/test-request-cache.mjs
 *
 * Couvre le comportement demandé pour la latence répétée des lectures
 * Citerne Eau : cache à durée courte explicite, déduplication des appels
 * concurrents, et absence totale de masquage des erreurs (jamais de succès
 * ou d'échec mis en cache silencieusement à la place d'un vrai résultat).
 */

import { KeyedRequestCache } from "../src/lib/requestCache.ts";

// ─── Infrastructure de test ──────────────────────────────────────────────────

let passed = 0, failed = 0;

async function test(name, fn) {
  try {
    await fn();
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

function assertEqual(actual, expected, label = "") {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// Deferred fetcher: lets a test control exactly when a "network call" resolves,
// so concurrency can be exercised deterministically without real timers.
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// ─────────────────────────────────────────────────────────────────────────────

console.log("\n── Cache : sert la valeur dans le TTL sans rappeler le fetcher ──────────────\n");

await test("Deuxième appel dans le TTL → aucune nouvelle requête", async () => {
  const cache = new KeyedRequestCache(60_000);
  let calls = 0;
  const fetcher = async () => { calls++; return `v${calls}`; };

  const first = await cache.get("tank-1", fetcher, { now: 1_000 });
  const second = await cache.get("tank-1", fetcher, { now: 1_000 + 30_000 });

  assertEqual(first, "v1");
  assertEqual(second, "v1", "sert la valeur en cache, pas un nouvel appel");
  assertEqual(calls, 1, "le fetcher n'est appelé qu'une fois");
});

await test("Appel après expiration du TTL → nouvelle requête réelle", async () => {
  const cache = new KeyedRequestCache(60_000);
  let calls = 0;
  const fetcher = async () => { calls++; return `v${calls}`; };

  const first = await cache.get("tank-1", fetcher, { now: 1_000 });
  const second = await cache.get("tank-1", fetcher, { now: 1_000 + 60_001 });

  assertEqual(first, "v1");
  assertEqual(second, "v2", "TTL expiré → revalidation réelle");
  assertEqual(calls, 2);
});

await test("Deux clés distinctes ne partagent jamais leur cache (citerne 1 vs citerne 2)", async () => {
  const cache = new KeyedRequestCache(60_000);
  const fetcher = (key) => async () => `value-for-${key}`;

  const tank1 = await cache.get(1, fetcher(1), { now: 1_000 });
  const tank2 = await cache.get(2, fetcher(2), { now: 1_000 });

  assertEqual(tank1, "value-for-1");
  assertEqual(tank2, "value-for-2");
});

console.log("\n── Déduplication des demandes concurrentes ───────────────────────────────────\n");

await test("Deux appels concurrents sur la même clé → un seul fetch réseau partagé", async () => {
  const cache = new KeyedRequestCache(60_000);
  let calls = 0;
  const d = deferred();
  const fetcher = async () => { calls++; return d.promise; };

  const p1 = cache.get("tank-1", fetcher, { now: 1_000 });
  const p2 = cache.get("tank-1", fetcher, { now: 1_000 });
  assertEqual(calls, 1, "un seul fetch déclenché pour les deux appelants concurrents");

  d.resolve("valeur-partagée");
  const [r1, r2] = await Promise.all([p1, p2]);
  assertEqual(r1, "valeur-partagée");
  assertEqual(r2, "valeur-partagée");
});

await test("Simule les 4 lectures Citerne (statut+historique × 2 citernes) : 4 clés, 4 fetchs, pas plus", async () => {
  const statusCache = new KeyedRequestCache(60_000);
  const historyCache = new KeyedRequestCache(60_000);
  let statusCalls = 0, historyCalls = 0;
  const fetchStatus = async () => { statusCalls++; return "status"; };
  const fetchHistory = async () => { historyCalls++; return "history"; };

  // Deux citernes montées en même temps (page eau), chacune demandant statut + historique en parallèle.
  await Promise.all([
    statusCache.get(1, fetchStatus, { now: 1_000 }),
    historyCache.get(1, fetchHistory, { now: 1_000 }),
    statusCache.get(2, fetchStatus, { now: 1_000 }),
    historyCache.get(2, fetchHistory, { now: 1_000 }),
  ]);

  assertEqual(statusCalls, 2, "un fetch de statut par citerne, jamais plus");
  assertEqual(historyCalls, 2, "un fetch d'historique par citerne, jamais plus");

  // Navigation rapide vers une autre page qui redemande les mêmes citernes dans le TTL.
  await Promise.all([
    statusCache.get(1, fetchStatus, { now: 1_000 + 5_000 }),
    historyCache.get(1, fetchHistory, { now: 1_000 + 5_000 }),
    statusCache.get(2, fetchStatus, { now: 1_000 + 5_000 }),
    historyCache.get(2, fetchHistory, { now: 1_000 + 5_000 }),
  ]);

  assertEqual(statusCalls, 2, "toujours servi depuis le cache, aucune requête répétée");
  assertEqual(historyCalls, 2, "toujours servi depuis le cache, aucune requête répétée");
});

console.log("\n── force : contourne le cache mais rejoint une requête déjà en vol ──────────\n");

await test("force=true avec cache frais → relance quand même une vraie requête", async () => {
  const cache = new KeyedRequestCache(60_000);
  let calls = 0;
  const fetcher = async () => { calls++; return `v${calls}`; };

  const first = await cache.get("tank-1", fetcher, { now: 1_000 });
  const forced = await cache.get("tank-1", fetcher, { now: 1_010, force: true });

  assertEqual(first, "v1");
  assertEqual(forced, "v2", "un rafraîchissement manuel doit toujours vérifier réellement");
  assertEqual(calls, 2);
});

await test("force=true pendant une requête déjà en vol → rejoint le vol, pas de doublon", async () => {
  const cache = new KeyedRequestCache(60_000);
  let calls = 0;
  const d = deferred();
  const fetcher = async () => { calls++; return d.promise; };

  const inFlight = cache.get("tank-1", fetcher, { now: 1_000 });
  const forced = cache.get("tank-1", fetcher, { now: 1_000, force: true });
  assertEqual(calls, 1, "la requête en vol est réutilisée, pas de second fetch");

  d.resolve("v1");
  const [r1, r2] = await Promise.all([inFlight, forced]);
  assertEqual(r1, "v1");
  assertEqual(r2, "v1");
});

console.log("\n── Erreurs : jamais masquées, jamais mises en cache ──────────────────────────\n");

await test("Un échec se propage à l'appelant (n'est pas avalé par le cache)", async () => {
  const cache = new KeyedRequestCache(60_000);
  const fetcher = async () => { throw new Error("panne réseau"); };

  let threw = false;
  try {
    await cache.get("tank-1", fetcher, { now: 1_000 });
  } catch (err) {
    threw = true;
    assertEqual(err.message, "panne réseau");
  }
  assert(threw, "l'erreur doit remonter à l'appelant");
});

await test("Un échec n'est pas mis en cache → l'appel suivant retente réellement (pas de succès factice)", async () => {
  const cache = new KeyedRequestCache(60_000);
  let calls = 0;
  const fetcher = async () => {
    calls++;
    if (calls === 1) throw new Error("panne réseau");
    return "rétabli";
  };

  await assertRejects(() => cache.get("tank-1", fetcher, { now: 1_000 }));
  const recovered = await cache.get("tank-1", fetcher, { now: 1_001 });

  assertEqual(recovered, "rétabli");
  assertEqual(calls, 2, "l'échec précédent n'a pas été servi comme une réponse en cache");
});

await test("Deux appelants concurrents sur un fetch qui échoue reçoivent tous les deux l'erreur", async () => {
  const cache = new KeyedRequestCache(60_000);
  const d = deferred();
  const fetcher = async () => d.promise;

  const p1 = cache.get("tank-1", fetcher, { now: 1_000 });
  const p2 = cache.get("tank-1", fetcher, { now: 1_000 });
  d.reject(new Error("panne réseau"));

  await assertRejects(() => p1);
  await assertRejects(() => p2);
});

async function assertRejects(fn) {
  try {
    await fn();
  } catch {
    return;
  }
  throw new Error("expected rejection, got a resolved value");
}

console.log("\n── reset ──────────────────────────────────────────────────────────────────\n");

await test("reset() vide le cache : l'appel suivant revalide réellement", async () => {
  const cache = new KeyedRequestCache(60_000);
  let calls = 0;
  const fetcher = async () => { calls++; return `v${calls}`; };

  await cache.get("tank-1", fetcher, { now: 1_000 });
  cache.reset();
  const afterReset = await cache.get("tank-1", fetcher, { now: 1_001 });

  assertEqual(afterReset, "v2");
  assertEqual(calls, 2);
});

// ─── Résumé ─────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(60)}`);
console.log(`Résultats : ${passed} passés, ${failed} échoués`);
if (failed > 0) {
  console.error("❌ Certains tests ont échoué !");
  process.exit(1);
} else {
  console.log("✅ Tous les tests passent.");
}
