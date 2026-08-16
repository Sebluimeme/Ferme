#!/usr/bin/env node
/**
 * Bridge gratuit Ferme ↔ Home Assistant.
 *
 * Flux :
 * - lit Home Assistant depuis le réseau local/Tailscale ;
 * - publie l'état dans Firebase Realtime Database : irrigation-ha/status/current ;
 * - écoute les commandes Firebase : irrigation-ha/commands ;
 * - exécute uniquement une allowlist d'actions Home Assistant ;
 * - marque chaque commande done/error ;
 * - calcule en permanence l'analyse d'arrosage (bilan hydrique + décision par
 *   zone) et, seulement si l'automatique est activé, exécute le plan nocturne.
 *
 * Auto-schedule (V3 — analyse permanente / exécution séparée) :
 * - Configuration :     irrigation-ha/auto-schedule/config
 * - Plans (conseil ou   irrigation-ha/auto-schedule/plans/{YYYY-MM-DD}
 *   exécutable, voir plan.mode)
 * - Bilan hydrique :    irrigation-ha/water-balance/state/{zone}
 * - Ledger arrosage :   irrigation-ha/water-balance/events/{zone}/{eventId}
 * - Confirmations       irrigation-ha/water-balance/pending-manual/{commandId}
 *   manuelles en attente (persistées : reprises au redémarrage, voir
 *   resumePendingManualConfirmations)
 * - Fenêtre :           22:00 → 06:00 (heure locale), départ au plus près du matin
 *
 * L'analyse (checkAndPlanSchedule) tourne toutes les 5 min et à chaque
 * changement de config, QUE l'automatique soit activé ou non : elle met à
 * jour le bilan hydrique et la décision par zone, et écrit un plan taggué
 * mode "advisory" (conseil, jamais exécuté) ou "executable" (auto ON).
 * L'exécution (checkAndExecuteSchedule) reste protégée par `enabled` ET par
 * `canExecutePlan()` (défense supplémentaire : refuse tout plan qui n'est
 * pas explicitement mode="executable").
 *
 * Usage : npm run ha:bridge
 */
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  getDatabase,
  ref,
  set,
  get,
  update,
  onValue,
  serverTimestamp,
} from "firebase/database";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getNextMorningDate,
  computeRecentRainMm,
  buildDailyRainTotals,
  initWaterBalanceState,
  consolidateWaterBalance,
  humidityPctFromBalance,
  computeZoneDecision,
  computeIrrigationPlanV2,
  canExecutePlan,
  computeManualConfirmationDelayMs,
  computePartialAppliedMm,
  resumeStuckExecutingPlan,
} from "../src/lib/irrigationScheduler.ts";
import { getCiterneEntityIds, normalizeCiterneStatus } from "../src/lib/citerneEau.ts";
import { canStartIrrigation, metersToCentimeters } from "../src/lib/irrigationSafety.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const envPath = resolve(rootDir, ".env.local");

const ENTITY_IDS = [
  "switch.sous_station_bat_a_pompe",
  "switch.sous_station_bat_a_electrovanne_1",
  "switch.sous_station_bat_a_electrovanne_2",
  "sensor.sous_station_bat_a_pression_reseau",
  "sensor.sous_station_bat_a_remplissage_cuve",
  "sensor.sous_station_bat_a_volume_cuve",
  "sensor.sous_station_bat_a_temperature_cuve",
  "sensor.arrosage_vanne_1_temps_aujourd_hui",
  "sensor.arrosage_vanne_2_temps_aujourd_hui",
  "sensor.arrosage_pompe_temps_aujourd_hui",
  "sensor.arrosage_vanne_1_mm_aujourd_hui",
  "sensor.arrosage_vanne_2_mm_aujourd_hui",
  "sensor.arrosage_pompe_energie_aujourd_hui",
  "sensor.arrosage_cout_aujourd_hui",
  "input_boolean.arrosage_vanne_1_actif",
  "input_boolean.arrosage_vanne_2_actif",
  "input_datetime.arrosage_vanne_1_heure",
  "input_datetime.arrosage_vanne_2_heure",
  "input_number.arrosage_vanne_1_duree",
  "input_number.arrosage_vanne_2_duree",
  "input_number.arrosage_pompe_puissance_w",
  "input_number.arrosage_prix_kwh",
  ...["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"].flatMap((day) => [
    `input_boolean.arrosage_vanne_1_${day}`,
    `input_boolean.arrosage_vanne_2_${day}`,
  ]),
];

const ALLOWED_SWITCHES = new Set([
  "switch.sous_station_bat_a_pompe",
  "switch.sous_station_bat_a_electrovanne_1",
  "switch.sous_station_bat_a_electrovanne_2",
]);

// ── Firebase paths ────────────────────────────────────────────────────────────
const AUTO_SCHEDULE_CONFIG_PATH = "irrigation-ha/auto-schedule/config";
const AUTO_SCHEDULE_PLANS_PATH  = "irrigation-ha/auto-schedule/plans";
const WATER_BALANCE_STATE_PATH  = "irrigation-ha/water-balance/state";  // bilan par zone
const WATER_BALANCE_LIVE_PATH   = "irrigation-ha/water-balance/live";   // instantané zoneStates, jamais verrouillé (même executing/done)
const WATER_BALANCE_EVENTS_PATH = "irrigation-ha/water-balance/events"; // ledger idempotent par zone
const WATER_BALANCE_PENDING_PATH = "irrigation-ha/water-balance/pending-manual"; // confirmations manuelles en attente (survit à un redémarrage)
const WEATHER_READINGS_PATH     = "weather-readings";

// ── Default auto-schedule config V2 ──────────────────────────────────────────
const DEFAULT_AUTO_CONFIG = {
  enabled: false,           // Désactivé par défaut — activer depuis l'UI /arrosage
  rainThresholdMm: 15,      // Si pluie récente ≥ 15 mm, pas d'arrosage
  zones: [
    {
      zone: 1, enabled: true,
      qualityMode: "passable",
      soilCapacityMm: 35,
      irrigationDepthMmPerHour: 5,
      minRunMinutes: 45,
      maxRunMinutes: 240,
      dailyLossMm: 3,
    },
    {
      zone: 2, enabled: true,
      qualityMode: "passable",
      soilCapacityMm: 35,
      irrigationDepthMmPerHour: 5,
      minRunMinutes: 45,
      maxRunMinutes: 240,
      dailyLossMm: 3,
    },
  ],
  windowStartHour: 22,      // Début fenêtre nocturne
  windowEndHour: 6,         // Fin fenêtre nocturne (06:00)
};

// ─────────────────────────────────────────────────────────────────────────────

function firebaseKey(entityId) {
  return entityId.replaceAll(".", "__dot__");
}

function readEnv() {
  const env = {};
  const content = readFileSync(envPath, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    env[key] = value;
  }
  return env;
}

function requireEnv(env, key) {
  if (!env[key]) throw new Error(`${key} manquant dans .env.local`);
  return env[key];
}

const env = readEnv();
const haBaseUrl = requireEnv(env, "HOME_ASSISTANT_URL").replace(/\/$/, "");
const haToken = requireEnv(env, "HOME_ASSISTANT_TOKEN");
const pollMs = Number(env.HA_BRIDGE_POLL_MS || 10000);

const firebaseConfig = {
  apiKey: requireEnv(env, "NEXT_PUBLIC_FIREBASE_API_KEY"),
  authDomain: requireEnv(env, "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  databaseURL: requireEnv(env, "NEXT_PUBLIC_FIREBASE_DATABASE_URL"),
  projectId: requireEnv(env, "NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
  storageBucket: requireEnv(env, "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: requireEnv(env, "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: requireEnv(env, "NEXT_PUBLIC_FIREBASE_APP_ID"),
};

const firebaseEmail = requireEnv(env, "FIREBASE_EMAIL");
const firebasePassword = requireEnv(env, "FIREBASE_PASSWORD");

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

async function haFetch(path, init = {}) {
  const response = await fetch(`${haBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${haToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Home Assistant ${response.status}: ${text.slice(0, 240)}`);
  }

  return response.json();
}

// ── Barrière de sécurité (fail-closed) — Citerne 2 < 10cm OU Citerne 1 < 75% ──
const CITERNE_1_ENTITY_IDS = getCiterneEntityIds(1);
const CITERNE_2_ENTITY_IDS = getCiterneEntityIds(2);
const CITERNE_GATE_ENTITY_IDS = [...Object.values(CITERNE_1_ENTITY_IDS), ...Object.values(CITERNE_2_ENTITY_IDS)];

/**
 * Relit les citernes en direct sur Home Assistant et applique canStartIrrigation().
 * Appelée avant CHAQUE lancement (manuel ou zone auto) — jamais un seul contrôle
 * global en tête de plan. Aucun appel HA de commande, aucune écriture
 * pending/ledger ne doit avoir lieu si le résultat est refusé.
 */
async function checkIrrigationGate() {
  const states = await haFetch("/api/states");
  const byId = new Map(states.map((s) => [s.entity_id, s]));
  const entitiesOf = (ids) =>
    Object.fromEntries(Object.values(ids).map((id) => [id, byId.get(id)]).filter(([, v]) => v !== undefined));

  const c1 = normalizeCiterneStatus(entitiesOf(CITERNE_1_ENTITY_IDS), Date.now(), 1);
  const c2 = normalizeCiterneStatus(entitiesOf(CITERNE_2_ENTITY_IDS), Date.now(), 2);

  return canStartIrrigation(
    { value: c1.niveau.value, freshness: c1.freshness },
    { value: metersToCentimeters(c2.hauteurEau.value), freshness: c2.freshness },
  );
}

async function publishStatus(extra = {}) {
  try {
    const states = await haFetch("/api/states");
    const wanted = new Set(ENTITY_IDS);
    const entities = states
      .filter((item) => wanted.has(item.entity_id))
      .reduce((acc, item) => {
        acc[firebaseKey(item.entity_id)] = {
          entity_id: item.entity_id,
          state: item.state,
          attributes: item.attributes || {},
          last_changed: item.last_changed || null,
          last_updated: item.last_updated || null,
        };
        return acc;
      }, {});

    await set(ref(db, "irrigation-ha/status/current"), {
      ok: true,
      source: "local-bridge",
      updatedAt: new Date().toISOString(),
      updatedAtServer: serverTimestamp(),
      entityCount: Object.keys(entities).length,
      entities,
      ...extra,
    });
    console.log(`[status] ok entities=${Object.keys(entities).length}`);
  } catch (error) {
    await set(ref(db, "irrigation-ha/status/current"), {
      ok: false,
      source: "local-bridge",
      updatedAt: new Date().toISOString(),
      updatedAtServer: serverTimestamp(),
      error: error instanceof Error ? error.message : String(error),
      ...extra,
    });
    console.error("[status] error", error instanceof Error ? error.message : error);
  }
}

/**
 * Écrit un événement d'arrosage confirmé et idempotent dans le ledger.
 * `id` doit être déterministe (id de commande manuelle, ou "{planId}-zone{n}"
 * pour l'auto) afin qu'un rejeu ne double-compte jamais le même arrosage.
 */
async function writeConfirmedIrrigationEvent({ zone, appliedMm, at, source, id }) {
  await set(ref(db, `${WATER_BALANCE_EVENTS_PATH}/${zone}/${id}`), {
    zone, appliedMm, at, source, confirmed: true,
  });
  console.log(`[water-balance] zone ${zone} arrosage confirmé +${appliedMm}mm (${source}, id=${id})`);
}

// Poignées des setTimeout de confirmation manuelle en attente, indexées par
// commandId — permet à stop_all() d'annuler la confirmation "plein tarif" et
// de la remplacer par un crédit partiel (temps réellement écoulé).
const pendingManualTimeouts = new Map();

/**
 * Programme la confirmation d'un arrosage manuel à `expectedConfirmAt`. Le
 * pending record en Firebase (WATER_BALANCE_PENDING_PATH) est la source de
 * vérité — le setTimeout n'est qu'une optimisation locale ; s'il est perdu
 * (redémarrage du bridge), resumePendingManualConfirmations() le reprogramme
 * au démarrage suivant avec le temps restant. Si ce temps est déjà écoulé, la
 * confirmation est écrite immédiatement en utilisant `expectedConfirmAt`
 * comme heure réelle de fin (l'arrosage physique se termine côté Home
 * Assistant indépendamment de l'état du bridge).
 */
function scheduleManualConfirmation({ id, zone, appliedMm, expectedConfirmAt }) {
  const remainingMs = computeManualConfirmationDelayMs(expectedConfirmAt, Date.now());
  const timeout = setTimeout(async () => {
    pendingManualTimeouts.delete(id);
    try {
      await writeConfirmedIrrigationEvent({ zone, appliedMm, at: expectedConfirmAt, source: "manual", id });
      await set(ref(db, `${WATER_BALANCE_PENDING_PATH}/${id}`), null);
    } catch (err) {
      console.error(`[water-balance] confirmation manuelle ${id} échouée:`, err instanceof Error ? err.message : err);
    }
  }, remainingMs);
  pendingManualTimeouts.set(id, timeout);
}

/**
 * Au démarrage : reprend toute confirmation manuelle encore en attente
 * (bridge redémarré pendant qu'un arrosage manuel était en cours). Sans ceci,
 * un arrosage manuel confirmé pile pendant l'interruption ne serait jamais
 * intégré au bilan hydrique.
 */
async function resumePendingManualConfirmations() {
  const snap = await get(ref(db, WATER_BALANCE_PENDING_PATH));
  const pending = snap.val() || {};
  const ids = Object.keys(pending);
  if (ids.length === 0) return;
  console.log(`[water-balance] reprise de ${ids.length} confirmation(s) manuelle(s) en attente après redémarrage`);
  for (const [id, entry] of Object.entries(pending)) {
    scheduleManualConfirmation({ id, zone: entry.zone, appliedMm: entry.appliedMm, expectedConfirmAt: entry.expectedConfirmAt });
  }
}

/**
 * Arrêt total : annule toute confirmation manuelle "plein tarif" encore en
 * attente et la remplace par un crédit proportionnel au temps réellement
 * écoulé (computePartialAppliedMm) — un stop_all ne doit jamais créditer de
 * l'eau qui n'a pas coulé. Idempotent (id déterministe), sans effet si aucune
 * confirmation n'est en attente.
 */
async function creditPendingManualConfirmationsOnStop() {
  const snap = await get(ref(db, WATER_BALANCE_PENDING_PATH));
  const pending = snap.val() || {};
  const now = new Date().toISOString();

  for (const [id, entry] of Object.entries(pending)) {
    const timeout = pendingManualTimeouts.get(id);
    if (timeout) {
      clearTimeout(timeout);
      pendingManualTimeouts.delete(id);
    }
    const partialMm = computePartialAppliedMm({
      mmPerHour: Number(entry.mmPerHour || 0),
      startedAtIso: entry.startedAt,
      stoppedAtIso: now,
      plannedDurationMinutes: Number(entry.durationMinutes || 0),
    });
    try {
      await writeConfirmedIrrigationEvent({ zone: entry.zone, appliedMm: partialMm, at: now, source: "manual", id });
      await set(ref(db, `${WATER_BALANCE_PENDING_PATH}/${id}`), null);
      console.log(`[water-balance] stop_all: confirmation manuelle ${id} créditée partiellement (+${partialMm}mm, au lieu de +${entry.appliedMm}mm plein tarif)`);
    } catch (err) {
      console.error(`[water-balance] stop_all: crédit partiel ${id} échoué:`, err instanceof Error ? err.message : err);
    }
  }
}

async function executeCommand(id, command) {
  const commandRef = ref(db, `irrigation-ha/commands/${id}`);
  await update(commandRef, {
    status: "processing",
    processingAt: new Date().toISOString(),
    processingAtServer: serverTimestamp(),
  });

  try {
    if (command.action === "stop_all") {
      // Toujours disponible, même si la barrière de sécurité refuserait un
      // nouveau lancement — l'arrêt total n'est jamais bloqué.
      await haFetch("/api/services/script/arrosage_arret_total", {
        method: "POST",
        body: JSON.stringify({}),
      });
      await creditPendingManualConfirmationsOnStop();
    } else if (command.action === "run_zone") {
      // Barrière de sécurité fail-closed : aucun appel HA, aucune écriture
      // pending/ledger si refusé. Revérifiée ici (pas seulement côté UI) car
      // c'est le bridge qui a réellement accès à Home Assistant.
      const gate = await checkIrrigationGate();
      if (!gate.allowed) {
        throw new Error(gate.reasons.join(" ; "));
      }

      const zone = Number(command.zone) === 2 ? 2 : 1;
      const duration = Math.max(5, Math.min(240, Math.round(Number(command.durationMinutes || 5))));
      const vanne = `switch.sous_station_bat_a_electrovanne_${zone}`;
      await haFetch("/api/services/script/turn_on", {
        method: "POST",
        body: JSON.stringify({
          entity_id: "script.arrosage_lancer_zone",
          variables: {
            vanne,
            duree_minutes: duration,
          },
        }),
      });
      const zoneConfig = (autoConfig?.zones || DEFAULT_AUTO_CONFIG.zones).find((item) => Number(item.zone) === zone) || {};
      const mmPerHour = Number(zoneConfig.irrigationDepthMmPerHour || 5);
      const appliedMm = Number(((duration / 60) * mmPerHour).toFixed(2));
      const startedAt = new Date().toISOString();
      const expectedConfirmAt = new Date(Date.now() + duration * 60 * 1000).toISOString();
      console.log(`[command] ${id} start zone=${zone} vanne=${vanne} duration=${duration} — confirmation prévue ${expectedConfirmAt}`);
      // Ne pas écrire l'événement d'arrosage tout de suite : la commande n'est
      // que "envoyée", pas "confirmée". On attend la durée réelle avant de
      // l'intégrer au bilan hydrique — un arrosage non confirmé ne doit
      // jamais compter. Le rendez-vous est persisté dans Firebase (pas
      // seulement en mémoire) : resumePendingManualConfirmations() le
      // reprogramme au démarrage si le bridge redémarre pendant l'attente.
      // startedAt/durationMinutes/mmPerHour permettent à stop_all de créditer
      // uniquement le temps réellement écoulé (computePartialAppliedMm) au
      // lieu du plein tarif si l'arrosage est interrompu avant son terme.
      const pending = { zone, appliedMm, source: "manual", id, expectedConfirmAt, startedAt, durationMinutes: duration, mmPerHour };
      await set(ref(db, `${WATER_BALANCE_PENDING_PATH}/${id}`), pending);
      scheduleManualConfirmation(pending);
    } else if ((command.action === "turn_on" || command.action === "turn_off") && command.entityId) {
      if (!ALLOWED_SWITCHES.has(command.entityId)) throw new Error("Entité non autorisée");
      await haFetch(`/api/services/switch/${command.action}`, {
        method: "POST",
        body: JSON.stringify({ entity_id: command.entityId }),
      });
    } else {
      throw new Error("Action invalide");
    }

    await update(commandRef, {
      status: "done",
      doneAt: new Date().toISOString(),
      doneAtServer: serverTimestamp(),
      error: null,
    });
    console.log(`[command] ${id} done action=${command.action}`);
    await publishStatus({ lastCommandId: id });
  } catch (error) {
    await update(commandRef, {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
      errorAt: new Date().toISOString(),
      errorAtServer: serverTimestamp(),
    });
    console.error(`[command] ${id} error`, error instanceof Error ? error.message : error);
    await publishStatus({ lastCommandId: id });
  }
}

const processing = new Set();
function watchCommands() {
  onValue(ref(db, "irrigation-ha/commands"), (snapshot) => {
    const commands = snapshot.val() || {};
    for (const [id, command] of Object.entries(commands)) {
      if (!command || command.status !== "pending" || processing.has(id)) continue;
      processing.add(id);
      executeCommand(id, command)
        .catch((error) => console.error(`[command] ${id} fatal`, error))
        .finally(() => processing.delete(id));
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Auto-schedule — analyse permanente (bilan hydrique) + exécution séparée
// Logique pure importée directement de src/lib/irrigationScheduler.ts (pas de
// copie miroir) : getNextMorningDate, computeRecentRainMm, buildDailyRainTotals,
// initWaterBalanceState, consolidateWaterBalance, humidityPctFromBalance,
// computeZoneDecision, computeIrrigationPlanV2, canExecutePlan.
// ═══════════════════════════════════════════════════════════════════════════════

let autoConfig = null;
let executingAutoZone = false;

/**
 * Recalcule en permanence l'analyse d'arrosage : bilan hydrique par zone,
 * décision par zone, et plan (conseil si auto OFF, exécutable si auto ON).
 * Tourne QUE l'automatique soit activé ou non — seule l'exécution réelle
 * (checkAndExecuteSchedule) est conditionnée par `enabled`.
 *
 * Le bilan hydrique (WATER_BALANCE_STATE_PATH) et l'instantané live des
 * décisions par zone (WATER_BALANCE_LIVE_PATH) sont TOUJOURS mis à jour, même
 * pendant un plan "executing"/"done" — sinon l'humidité reste figée pendant
 * tout un cycle manuel/auto. Seule l'écriture du PLAN lui-même (relance des
 * vannes, écrasement du planning) reste verrouillée tant que status est
 * executing/done.
 */
async function checkAndPlanSchedule() {
  if (!autoConfig) return; // config pas encore chargée au démarrage

  try {
    const now = new Date();
    const morningDate = getNextMorningDate(now, autoConfig.windowEndHour ?? 6);
    const planRef = ref(db, `${AUTO_SCHEDULE_PLANS_PATH}/${morningDate}`);

    // Lire le plan existant
    const existingSnap = await get(planRef);
    const existing = existingSnap.val();
    const planLocked = existing && ["executing", "done"].includes(existing.status);

    // Lire les données météo mesurées (jamais de prévision) : totaux journaliers
    // pour le bilan hydrique + pluie utile récente pour le garde-fou "forte pluie".
    const weatherSnap = await get(ref(db, WEATHER_READINGS_PATH));
    const weatherData = Object.values(weatherSnap.val() || {});
    const rainByDate = buildDailyRainTotals(weatherData);
    const recentRainMm = computeRecentRainMm(weatherData, now.getTime());

    const zonesConfig = autoConfig.zones || DEFAULT_AUTO_CONFIG.zones;
    const zoneStates = [];
    const liveZoneStates = [];

    for (const zoneCfg of zonesConfig) {
      const capacityMm = zoneCfg.soilCapacityMm ?? 35;
      const dailyLossMm = zoneCfg.dailyLossMm ?? 3;
      const balanceRef = ref(db, `${WATER_BALANCE_STATE_PATH}/${zoneCfg.zone}`);
      const balanceSnap = await get(balanceRef);
      let state = balanceSnap.val();

      if (!state) {
        // Migration prudente : point de départ = estimation du plan courant
        // pour cette zone si disponible, sinon 40%. Les totaux pluie connus
        // sont marqués "déjà comptés" pour ne pas rejouer les 7 derniers
        // jours de l'ancien modèle pondéré. Cette valeur reste "estimée"
        // (seeded=true) tant qu'elle n'a pas reçu d'apport réel.
        const seedFromExisting = existing?.zoneStates?.find(
          (z) => Number(z.zone) === Number(zoneCfg.zone)
        )?.estimatedHumidityPct;
        state = initWaterBalanceState({
          zone: zoneCfg.zone,
          capacityMm,
          seedPct: seedFromExisting != null ? Number(seedFromExisting) : null,
          nowIso: now.toISOString(),
          knownRainByDate: rainByDate,
        });
        console.log(`[water-balance] zone ${zoneCfg.zone} bilan initial (estimée) → ${state.reserveMm}/${capacityMm}mm`);
      }

      const eventsSnap = await get(ref(db, `${WATER_BALANCE_EVENTS_PATH}/${zoneCfg.zone}`));
      const eventsVal = eventsSnap.val() || {};
      const events = Object.entries(eventsVal).map(([eventId, e]) => ({ id: eventId, ...e }));

      // Toujours consolidé — pluie/arrosages confirmés doivent apparaître même
      // pendant un plan verrouillé (executing/done), sinon l'humidité reste
      // figée pendant tout le cycle en cours.
      const consolidated = consolidateWaterBalance({
        state, capacityMm, dailyLossMm, rainByDate, events, nowIso: now.toISOString(),
      });
      await set(balanceRef, consolidated);

      const humidity = humidityPctFromBalance(consolidated);
      const decision = computeZoneDecision(zoneCfg, humidity);
      zoneStates.push(decision);
      // reserveMm/capacityMm/irrigationDepthMmPerHour en plus du plan V2 —
      // nécessaires côté UI pour projeter l'humidité en direct pendant un
      // cycle en cours (estimateLiveHumidityPct), jamais écrits au ledger.
      liveZoneStates.push({
        ...decision,
        reserveMm: consolidated.reserveMm,
        capacityMm: consolidated.capacityMm,
        irrigationDepthMmPerHour: zoneCfg.irrigationDepthMmPerHour ?? 5,
      });
    }

    // Instantané live toujours à jour, indépendant du verrouillage du plan —
    // l'UI doit pouvoir lire l'humidité/décision courante sans dépendre d'un
    // plan daté figé (plan.zoneStates ne bouge plus une fois executing/done).
    await set(ref(db, WATER_BALANCE_LIVE_PATH), {
      updatedAt: now.toISOString(),
      zoneStates: liveZoneStates,
    });

    if (planLocked) {
      console.log(`[auto-schedule] bilan mis à jour (plan ${morningDate} verrouillé: ${existing.status}, non réécrit)`);
      return;
    }

    const mode = autoConfig.enabled ? "executable" : "advisory";
    const plan = computeIrrigationPlanV2(
      { ...autoConfig, zones: zonesConfig },
      zoneStates,
      recentRainMm,
      morningDate,
      now.toISOString(),
      mode,
    );

    // Réécrire tout plan non verrouillé. Les plans skipped/error/advisory
    // doivent pouvoir évoluer si la qualité, la pluie ou le bilan changent.
    await set(planRef, plan);
    await update(ref(db, AUTO_SCHEDULE_CONFIG_PATH), { lastError: null, lastErrorAt: null });
    console.log(`[auto-schedule] analyse ${morningDate} → ${plan.status} (${mode}): ${plan.reason}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await update(ref(db, AUTO_SCHEDULE_CONFIG_PATH), {
      lastError: message,
      lastErrorAt: new Date().toISOString(),
    }).catch(() => {});
    console.error("[auto-schedule] checkAndPlanSchedule:", message);
  }
}

/**
 * Vérifie si c'est l'heure d'exécuter le plan et lance les zones séquentiellement.
 * Double protection : `enabled` (gate rapide) ET `canExecutePlan()` (défense
 * supplémentaire — refuse tout plan qui n'est pas explicitement mode="executable",
 * même en cas d'incohérence transitoire entre config et plan).
 */
async function checkAndExecuteSchedule() {
  if (!autoConfig?.enabled || executingAutoZone) return;

  try {
    const now = new Date();
    const morningDate = getNextMorningDate(now, autoConfig.windowEndHour ?? 6);
    const planRef = ref(db, `${AUTO_SCHEDULE_PLANS_PATH}/${morningDate}`);
    const planSnap = await get(planRef);
    const plan = planSnap.val();

    const gate = canExecutePlan(autoConfig, plan);
    if (!gate.allowed) {
      if (plan) console.log(`[auto-schedule] exécution refusée (${gate.reason})`);
      return;
    }

    // Pas encore l'heure
    if (plan.startAt && now < new Date(plan.startAt)) return;

    // Fenêtre expirée
    if (plan.endAt && now > new Date(plan.endAt)) {
      await update(planRef, {
        status: "skipped",
        reason: "Fenêtre expirée (après 06h00) — plan non exécuté",
        updatedAt: now.toISOString(),
      });
      console.log(`[auto-schedule] plan ${morningDate} expiré`);
      return;
    }

    // ── Exécution ───────────────────────────────────────────────────────────
    executingAutoZone = true;
    await update(planRef, {
      status: "executing",
      startedAt: now.toISOString(),
    });
    console.log(`[auto-schedule] démarrage plan ${morningDate} (${plan.totalDurationMinutes} min total)`);

    try {
      const zones = Array.isArray(plan.zones) ? plan.zones : Object.values(plan.zones || {});

      for (let i = 0; i < zones.length; i++) {
        const zone = zones[i];
        const zonePathPrefix = `${AUTO_SCHEDULE_PLANS_PATH}/${morningDate}/zones/${i}`;

        // Barrière de sécurité fail-closed, revérifiée avant CHAQUE zone (pas
        // une seule fois en tête de plan) : l'état des citernes peut se
        // dégrader entre deux zones d'un même plan. Refus → aucun appel HA,
        // zone et plan marqués en erreur motivée, reste du plan abandonné
        // (les zones suivantes seraient refusées pour la même raison).
        const gate = await checkIrrigationGate();
        if (!gate.allowed) {
          const reason = gate.reasons.join(" ; ");
          await update(ref(db, zonePathPrefix), {
            status: "error",
            error: reason,
            errorAt: new Date().toISOString(),
          });
          throw new Error(reason);
        }

        // Marquer la zone en cours
        await update(ref(db, zonePathPrefix), {
          status: "executing",
          startedAt: new Date().toISOString(),
        });

        // Lancer la zone dans Home Assistant
        const vanne = `switch.sous_station_bat_a_electrovanne_${zone.zone}`;
        await haFetch("/api/services/script/turn_on", {
          method: "POST",
          body: JSON.stringify({
            entity_id: "script.arrosage_lancer_zone",
            variables: { vanne, duree_minutes: zone.durationMinutes },
          }),
        });
        console.log(`[auto-schedule] zone ${zone.zone} démarrée (${zone.durationMinutes} min)`);

        // Attendre la durée prévue. Pas de marge ajoutée : la fenêtre doit rester au plus proche de 06h.
        await new Promise((resolve) =>
          setTimeout(resolve, zone.durationMinutes * 60 * 1000)
        );

        const zoneDoneAt = new Date().toISOString();
        await update(ref(db, zonePathPrefix), {
          status: "done",
          doneAt: zoneDoneAt,
        });

        // Arrosage réellement terminé → événement confirmé et idempotent
        // (id déterministe : un seul événement par plan+zone, même en cas de rejeu).
        const zoneConfig = (autoConfig.zones || DEFAULT_AUTO_CONFIG.zones).find((item) => Number(item.zone) === Number(zone.zone)) || {};
        const mmPerHour = Number(zoneConfig.irrigationDepthMmPerHour || 5);
        const appliedMm = Number(((Number(zone.durationMinutes) / 60) * mmPerHour).toFixed(2));
        await writeConfirmedIrrigationEvent({
          zone: zone.zone,
          appliedMm,
          at: zoneDoneAt,
          source: "auto",
          id: `${morningDate}-zone${zone.zone}`,
        });
        console.log(`[auto-schedule] zone ${zone.zone} terminée`);
      }

      await update(planRef, {
        status: "done",
        completedAt: new Date().toISOString(),
      });
      console.log(`[auto-schedule] plan ${morningDate} terminé avec succès`);
    } catch (execErr) {
      const msg = execErr instanceof Error ? execErr.message : String(execErr);
      await update(planRef, {
        status: "error",
        error: msg,
        errorAt: new Date().toISOString(),
      });
      console.error(`[auto-schedule] plan ${morningDate} erreur:`, msg);
    } finally {
      executingAutoZone = false;
    }

    await publishStatus({ lastAutoSchedule: morningDate });
  } catch (err) {
    console.error("[auto-schedule] checkAndExecuteSchedule:", err instanceof Error ? err.message : err);
    executingAutoZone = false;
  }
}

/**
 * Récupère un plan resté bloqué au statut "executing" si le bridge a
 * redémarré pendant une exécution auto (crash, déploiement). Après un tel
 * redémarrage, l'état réel des vannes côté Home Assistant n'est plus fiable
 * (setTimeout perdu, executingAutoZone remis à false en mémoire) : on bascule
 * le plan en erreur motivée via resumeStuckExecutingPlan() pour qu'il ne
 * reste jamais bloqué. Doit tourner AVANT le premier checkAndPlanSchedule —
 * celui-ci n'écrase jamais un plan "executing"/"done".
 */
async function recoverStuckExecutingPlanOnStartup(config) {
  const now = new Date();
  const morningDate = getNextMorningDate(now, config.windowEndHour ?? 6);
  const planRef = ref(db, `${AUTO_SCHEDULE_PLANS_PATH}/${morningDate}`);
  const snap = await get(planRef);
  const plan = snap.val();
  if (!plan || plan.status !== "executing") return;

  const recovery = resumeStuckExecutingPlan(now.toISOString());
  await update(planRef, recovery);
  console.warn(
    `[auto-schedule] plan ${morningDate} bloqué en "executing" au démarrage — ` +
    `récupéré en "${recovery.status}": ${recovery.reason}`
  );
}

/**
 * Initialise l'auto-schedule :
 * - Crée la config par défaut si absente
 * - Récupère un éventuel plan bloqué en "executing" après un redémarrage
 * - Surveille la config en temps réel : recalcule l'analyse à chaque changement,
 *   même si `enabled` est false (l'analyse ne dépend jamais de `enabled`)
 * - Lance la vérification/planification toutes les 5 min
 * - Lance la vérification d'exécution toutes les 5 s (protégée par `enabled`)
 */
async function initAutoSchedule() {
  const configRef = ref(db, AUTO_SCHEDULE_CONFIG_PATH);

  // Créer la config par défaut si absente
  const snap = await get(configRef);
  if (!snap.val()) {
    await set(configRef, DEFAULT_AUTO_CONFIG);
    console.log("[auto-schedule] config par défaut créée (désactivée — activer depuis l'UI /arrosage)");
  }
  autoConfig = snap.val() || DEFAULT_AUTO_CONFIG;

  await recoverStuckExecutingPlanOnStartup(autoConfig);

  // Surveiller la config en temps réel. Recalcule immédiatement quand la config change.
  onValue(configRef, (snapshot) => {
    autoConfig = snapshot.val() || DEFAULT_AUTO_CONFIG;
    console.log(
      `[auto-schedule] config chargée: enabled=${autoConfig.enabled}, ` +
      `seuil=${autoConfig.rainThresholdMm}mm`
    );
    checkAndPlanSchedule().catch((err) =>
      console.error("[auto-schedule] recalcul config:", err instanceof Error ? err.message : err)
    );
  });

  // Planification/analyse : toutes les 5 min, que l'auto soit ON ou OFF.
  setInterval(() => checkAndPlanSchedule(), 5 * 60 * 1000);

  // Exécution : toutes les 5 secondes pour démarrer au plus près de l'heure calculée.
  setInterval(() => checkAndExecuteSchedule(), 5 * 1000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("[bridge] connexion Firebase...");
  await signInWithEmailAndPassword(auth, firebaseEmail, firebasePassword);
  console.log(`[bridge] Firebase connecté. HA=${haBaseUrl}`);

  watchCommands();
  await resumePendingManualConfirmations();
  await publishStatus();
  setInterval(() => publishStatus(), pollMs);

  // Auto-schedule
  await initAutoSchedule();
  console.log("[bridge] auto-schedule initialisé");
}

main().catch((error) => {
  console.error("[bridge] fatal", error instanceof Error ? error.message : error);
  process.exit(1);
});
