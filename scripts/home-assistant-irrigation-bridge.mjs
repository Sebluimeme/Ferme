#!/usr/bin/env node
/**
 * Bridge gratuit Ferme ↔ Home Assistant.
 *
 * Flux :
 * - lit Home Assistant depuis le réseau local/Tailscale ;
 * - publie l'état dans Firebase Realtime Database : irrigation-ha/status/current ;
 * - écoute les commandes Firebase : irrigation-ha/commands ;
 * - exécute uniquement une allowlist d'actions Home Assistant ;
 * - marque chaque commande done/error.
 *
 * Usage : npm run ha:bridge
 */
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  getDatabase,
  ref,
  set,
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
const pollMs = Number(env.HA_BRIDGE_POLL_MS || 15000);

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
        acc[item.entity_id] = {
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
      await haFetch("/api/services/script/arrosage_lancer_zone", {
        method: "POST",
        body: JSON.stringify({
          vanne: `switch.sous_station_bat_a_electrovanne_${zone}`,
          duree_minutes: duration,
        }),
      });
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

async function main() {
  console.log("[bridge] connexion Firebase...");
  await signInWithEmailAndPassword(auth, firebaseEmail, firebasePassword);
  console.log(`[bridge] Firebase connecté. HA=${haBaseUrl}`);
  watchCommands();
  await publishStatus();
  setInterval(() => publishStatus(), pollMs);
}

main().catch((error) => {
  console.error("[bridge] fatal", error instanceof Error ? error.message : error);
  process.exit(1);
});
