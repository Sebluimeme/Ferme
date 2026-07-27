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
 * - planifie et exécute l'arrosage automatique nocturne (22h→6h) selon les précipitations.
 *
 * Auto-schedule :
 * - Configuration : irrigation-ha/auto-schedule/config
 * - Plans :         irrigation-ha/auto-schedule/plans/{YYYY-MM-DD}
 * - Fenêtre :       22:00 → 06:00 (heure locale), départ au plus près du matin
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
const WEATHER_READINGS_PATH     = "weather-readings";

// ── Default auto-schedule config ─────────────────────────────────────────────
const DEFAULT_AUTO_CONFIG = {
  enabled: false,          // Désactivé par défaut — activer depuis l'UI
  rainThresholdMm: 15,     // Si pluie du jour ≥ 15 mm, pas d'arrosage
  targetMm: 20,            // Besoin journalier cible en mm
  mmPerHour: 5,            // Débit de référence mm/h (informatif)
  zones: [
    { zone: 1, enabled: true, maxDurationMinutes: 120 },
    { zone: 2, enabled: true, maxDurationMinutes: 120 },
  ],
  windowStartHour: 22,     // Début fenêtre nocturne
  windowEndHour: 6,        // Fin fenêtre nocturne (06:00)
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

async function executeCommand(id, command) {
  const commandRef = ref(db, `irrigation-ha/commands/${id}`);
  await update(commandRef, {
    status: "processing",
    processingAt: new Date().toISOString(),
    processingAtServer: serverTimestamp(),
  });

  try {
    if (command.action === "stop_all") {
      await haFetch("/api/services/script/arrosage_arret_total", {
        method: "POST",
        body: JSON.stringify({}),
      });
    } else if (command.action === "run_zone") {
      const zone = Number(command.zone) === 2 ? 2 : 1;
      const duration = Math.max(1, Math.min(360, Math.round(Number(command.durationMinutes || 1))));
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
      console.log(`[command] ${id} start zone=${zone} vanne=${vanne} duration=${duration}`);
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
// Auto-schedule — logique pure (miroir de src/lib/irrigationScheduler.ts)
// ═══════════════════════════════════════════════════════════════════════════════

/** YYYY-MM-DD en heure locale */
function localDateStr(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * Retourne la date YYYY-MM-DD du "matin" (fin de fenêtre 06:00) suivant.
 * Si heure < windowEndHour → ce matin ; sinon → demain matin.
 */
function getNextMorningDate(now, windowEndHour) {
  if (now.getHours() < windowEndHour) return localDateStr(now);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return localDateStr(tomorrow);
}

/** Calcule la pluie du jour (mm) depuis les readings Firebase. */
function computeTodayRain(readings, todayStr) {
  let max = 0;
  const values = Array.isArray(readings) ? readings : Object.values(readings || {});
  for (const r of values) {
    const date = r.date ?? r.timestamp?.slice(0, 10);
    if (date === todayStr && r.rainTotalMm != null && Number.isFinite(r.rainTotalMm)) {
      max = Math.max(max, r.rainTotalMm);
    }
  }
  return max;
}

/**
 * Calcule le plan d'arrosage pour un matin donné.
 * Retourne un objet plan à écrire dans Firebase.
 */
function computePlan(config, rainMm, morningDate, now) {
  const base = {
    planId: morningDate,
    date: morningDate,
    rainMeasuredMm: rainMm,
    rainThresholdMm: config.rainThresholdMm,
    createdAt: now.toISOString(),
  };

  // ── Skip: pluie suffisante ──────────────────────────────────────────────────
  if (rainMm >= config.rainThresholdMm) {
    return {
      ...base,
      status: "skipped",
      reason: `Pluie suffisante (${rainMm.toFixed(1)} mm ≥ seuil ${config.rainThresholdMm} mm)`,
      startAt: "", endAt: "", totalDurationMinutes: 0, zones: [],
    };
  }

  const enabledZones = (config.zones || []).filter((z) => z.enabled);
  if (enabledZones.length === 0) {
    return {
      ...base,
      status: "skipped",
      reason: "Aucune zone activée dans la configuration",
      startAt: "", endAt: "", totalDurationMinutes: 0, zones: [],
    };
  }

  // ── Durées proportionnelles au déficit ─────────────────────────────────────
  const deficit = Math.max(0, config.targetMm - rainMm);
  const scale = config.targetMm > 0 ? Math.min(1, deficit / config.targetMm) : 1;

  const zoneDurations = enabledZones.map((z) => ({
    zone: z.zone,
    durationMinutes: Math.max(1, Math.round(z.maxDurationMinutes * scale)),
  }));
  const totalMinutes = zoneDurations.reduce((s, z) => s + z.durationMinutes, 0);

  const windowMax = (config.windowEndHour + 24 - config.windowStartHour) * 60; // 480 min
  if (totalMinutes > windowMax) {
    return {
      ...base,
      status: "error",
      reason: `Durée totale (${totalMinutes} min) dépasse la fenêtre ${config.windowStartHour}h–${config.windowEndHour}h (max ${windowMax} min)`,
      startAt: "", endAt: "", totalDurationMinutes: totalMinutes, zones: [],
    };
  }

  // ── Calcul heure de démarrage (à rebours depuis 06:00) ─────────────────────
  const hEnd = String(config.windowEndHour).padStart(2, "0");
  // Parsed as LOCAL time (no Z suffix) — correct on a bridge running in France
  const endLocal = new Date(`${morningDate}T${hEnd}:00:00`);
  const startLocal = new Date(endLocal.getTime() - totalMinutes * 60 * 1000);

  // Borne inférieure : veille à 22:00
  const dayBefore = new Date(endLocal.getTime() - 24 * 60 * 60 * 1000);
  dayBefore.setHours(config.windowStartHour, 0, 0, 0);

  if (startLocal < dayBefore) {
    return {
      ...base,
      status: "error",
      reason: `Heure de démarrage (${startLocal.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}) antérieure à ${config.windowStartHour}h00`,
      startAt: "", endAt: "", totalDurationMinutes: totalMinutes, zones: [],
    };
  }

  // ── Plan séquentiel par zone ────────────────────────────────────────────────
  let cursor = startLocal.getTime();
  const scheduledZones = zoneDurations.map((z) => {
    const zStart = new Date(cursor);
    cursor += z.durationMinutes * 60 * 1000;
    return {
      zone: z.zone,
      durationMinutes: z.durationMinutes,
      startAt: zStart.toISOString(),
      endAt: new Date(cursor).toISOString(),
      status: "pending",
    };
  });

  return {
    ...base,
    status: "scheduled",
    reason: `Déficit: ${deficit.toFixed(1)} mm (${rainMm.toFixed(1)} mm mesuré, cible ${config.targetMm} mm)`,
    startAt: startLocal.toISOString(),
    endAt: endLocal.toISOString(),
    totalDurationMinutes: totalMinutes,
    zones: scheduledZones,
  };
}

// ─── État auto-schedule ───────────────────────────────────────────────────────

let autoConfig = null;
let executingAutoZone = false;

/**
 * Vérifie si un plan doit être créé/mis à jour et l'écrit dans Firebase.
 * N'écrase jamais un plan en cours d'exécution ou terminé.
 */
async function checkAndPlanSchedule() {
  if (!autoConfig?.enabled) return;

  try {
    const now = new Date();
    const morningDate = getNextMorningDate(now, autoConfig.windowEndHour ?? 6);
    const planRef = ref(db, `${AUTO_SCHEDULE_PLANS_PATH}/${morningDate}`);

    // Lire le plan existant
    const existingSnap = await get(planRef);
    const existing = existingSnap.val();

    // Ne pas écraser un plan en cours ou terminé
    if (existing && ["executing", "done"].includes(existing.status)) return;

    // Lire les données météo (pluie du jour)
    const weatherSnap = await get(ref(db, WEATHER_READINGS_PATH));
    const weatherData = weatherSnap.val() || {};
    const todayStr = localDateStr(now);
    const rainMm = computeTodayRain(weatherData, todayStr);

    const plan = computePlan(autoConfig, rainMm, morningDate, now);

    // Écrire uniquement si pas de plan existant (scheduled), ou si rain a changé
    if (!existing || existing.status === "scheduled") {
      await set(planRef, plan);
      await update(ref(db, AUTO_SCHEDULE_CONFIG_PATH), { lastError: null, lastErrorAt: null });
      console.log(`[auto-schedule] plan ${morningDate} → ${plan.status}: ${plan.reason}`);
    }
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
 * Protégé par un flag pour éviter le double déclenchement.
 */
async function checkAndExecuteSchedule() {
  if (!autoConfig?.enabled || executingAutoZone) return;

  try {
    const now = new Date();
    const morningDate = getNextMorningDate(now, autoConfig.windowEndHour ?? 6);
    const planRef = ref(db, `${AUTO_SCHEDULE_PLANS_PATH}/${morningDate}`);
    const planSnap = await get(planRef);
    const plan = planSnap.val();

    if (!plan || plan.status !== "scheduled") return;

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

        await update(ref(db, zonePathPrefix), {
          status: "done",
          doneAt: new Date().toISOString(),
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
 * Initialise l'auto-schedule :
 * - Crée la config par défaut si absente
 * - Surveille la config en temps réel
 * - Lance la vérification/planification toutes les 5 min
 * - Lance la vérification d'exécution toutes les 5 s
 */
async function initAutoSchedule() {
  const configRef = ref(db, AUTO_SCHEDULE_CONFIG_PATH);

  // Créer la config par défaut si absente
  const snap = await get(configRef);
  if (!snap.val()) {
    await set(configRef, DEFAULT_AUTO_CONFIG);
    console.log("[auto-schedule] config par défaut créée (désactivée — activer depuis l'UI /eau)");
  }

  // Surveiller la config en temps réel
  onValue(configRef, (snapshot) => {
    autoConfig = snapshot.val() || DEFAULT_AUTO_CONFIG;
    console.log(
      `[auto-schedule] config chargée: enabled=${autoConfig.enabled}, ` +
      `seuil=${autoConfig.rainThresholdMm}mm, cible=${autoConfig.targetMm}mm`
    );
  });

  // Planification : au démarrage + toutes les 5 min
  await checkAndPlanSchedule();
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
