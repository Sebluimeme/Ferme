/**
 * Preuve d'état Home Assistant pour l'arrosage.
 *
 * Une acceptation du service HA (HTTP 200 sur script.turn_on) ne prouve RIEN :
 * le script peut échouer, la vanne rester fermée, la pompe ne pas démarrer.
 * Avant de valider ou de comptabiliser un arrosage, on relit les états et on
 * exige la preuve complète :
 *   - pompe  switch.sous_station_bat_a_pompe          = on
 *   - vanne demandée  switch...electrovanne_{zone}    = on
 *   - autre vanne     switch...electrovanne_{autre}   = off
 *
 * Logique pure et testable : aucun accès réseau, Firebase ou HA ici.
 * Les I/O (lecture HA, attente) sont injectées par l'appelant.
 */

export const PUMP_ENTITY_ID = "switch.sous_station_bat_a_pompe";

/** Normalise une zone en 1 ou 2. */
export function normalizeZone(zone) {
  return Number(zone) === 2 ? 2 : 1;
}

export function valveEntityId(zone) {
  return `switch.sous_station_bat_a_electrovanne_${normalizeZone(zone)}`;
}

export function otherValveEntityId(zone) {
  return `switch.sous_station_bat_a_electrovanne_${normalizeZone(zone) === 2 ? 1 : 2}`;
}

/**
 * Indexe une réponse /api/states (tableau) ou un objet d'entités
 * en Map entity_id → état normalisé en minuscules.
 */
export function indexStates(states) {
  const index = new Map();
  const items = Array.isArray(states) ? states : Object.values(states || {});
  for (const item of items) {
    if (!item || typeof item !== "object" || !item.entity_id) continue;
    const raw = item.state;
    index.set(item.entity_id, typeof raw === "string" ? raw.toLowerCase() : raw == null ? null : String(raw));
  }
  return index;
}

function describeState(state) {
  if (state === null || state === undefined) return "absent";
  return `"${state}"`;
}

/**
 * Évalue la preuve d'arrosage pour une zone à partir des états HA.
 * Retourne toujours un objet complet (jamais d'undefined : écrivable dans Firebase).
 */
export function evaluateIrrigationProof(states, zone) {
  const z = normalizeZone(zone);
  const otherZone = z === 2 ? 1 : 2;
  const index = indexStates(states);

  const valveId = valveEntityId(z);
  const otherId = otherValveEntityId(z);

  const pumpState = index.has(PUMP_ENTITY_ID) ? index.get(PUMP_ENTITY_ID) : null;
  const valveState = index.has(valveId) ? index.get(valveId) : null;
  const otherValveState = index.has(otherId) ? index.get(otherId) : null;

  const problems = [];
  if (pumpState !== "on") {
    problems.push(`pompe ${PUMP_ENTITY_ID} = ${describeState(pumpState)} (attendu "on")`);
  }
  if (valveState !== "on") {
    problems.push(`vanne zone ${z} ${valveId} = ${describeState(valveState)} (attendu "on")`);
  }
  if (otherValveState !== "off") {
    problems.push(`vanne zone ${otherZone} ${otherId} = ${describeState(otherValveState)} (attendu "off")`);
  }

  const ok = problems.length === 0;
  return {
    ok,
    zone: z,
    pumpState,
    valveState,
    otherValveState,
    valveEntityId: valveId,
    otherValveEntityId: otherId,
    problems,
    reason: ok
      ? `Preuve OK — pompe on, ${valveId} on, ${otherId} off`
      : `Preuve d'arrosage absente — ${problems.join(" ; ")}`,
  };
}

/** Résultat d'échec homogène quand la lecture HA elle-même casse. */
function readFailureProof(zone, error) {
  const z = normalizeZone(zone);
  return {
    ok: false,
    zone: z,
    pumpState: null,
    valveState: null,
    otherValveState: null,
    valveEntityId: valveEntityId(z),
    otherValveEntityId: otherValveEntityId(z),
    problems: ["lecture Home Assistant impossible"],
    reason: `Lecture Home Assistant impossible — ${error instanceof Error ? error.message : String(error)}`,
  };
}

/**
 * Attend la preuve d'arrosage, dans un délai borné.
 * Relit les états toutes les `intervalMs` jusqu'à `timeoutMs`.
 *
 * @returns {Promise<{ok:boolean, reason:string, attempts:number, elapsedMs:number, timedOut:boolean, ...proof}>}
 */
export async function waitForIrrigationProof({
  zone,
  readStates,
  sleep,
  now = Date.now,
  timeoutMs = 45000,
  intervalMs = 3000,
}) {
  const startedAt = now();
  let attempts = 0;
  let last = null;

  for (;;) {
    attempts++;
    try {
      last = evaluateIrrigationProof(await readStates(), zone);
      if (last.ok) {
        return { ...last, attempts, elapsedMs: now() - startedAt, timedOut: false };
      }
    } catch (error) {
      last = readFailureProof(zone, error);
    }

    const elapsedMs = now() - startedAt;
    if (elapsedMs + intervalMs > timeoutMs) {
      return {
        ...last,
        attempts,
        elapsedMs,
        timedOut: true,
        reason: `${last.reason} (aucune confirmation après ${Math.round(timeoutMs / 1000)} s)`,
      };
    }
    await sleep(intervalMs);
  }
}

/**
 * Surveille un arrosage déjà confirmé pendant `durationMs`.
 * Découpe l'attente en tranches de `checkIntervalMs` et revérifie la preuve
 * à chaque tranche. Seules les tranches terminées avec preuve valide sont
 * comptabilisées dans `confirmedMs`.
 *
 * @returns {Promise<{ok:boolean, confirmedMs:number, reason:string, proof:object|null}>}
 */
export async function monitorIrrigationProof({
  zone,
  durationMs,
  readStates,
  sleep,
  now = Date.now,
  checkIntervalMs = 30000,
}) {
  const startedAt = now();
  let confirmedMs = 0;

  for (;;) {
    const remainingMs = durationMs - (now() - startedAt);
    if (remainingMs <= 0) {
      return { ok: true, confirmedMs, reason: "Arrosage confirmé sur toute la durée", proof: null };
    }

    const chunkMs = Math.min(checkIntervalMs, remainingMs);
    await sleep(chunkMs);

    let proof;
    try {
      proof = evaluateIrrigationProof(await readStates(), zone);
    } catch (error) {
      proof = readFailureProof(zone, error);
    }

    if (!proof.ok) {
      return { ok: false, confirmedMs, reason: proof.reason, proof };
    }
    confirmedMs += chunkMs;
  }
}

/** Minutes confirmées (1 décimale) à partir d'une durée en ms. */
export function confirmedMinutes(confirmedMs) {
  return Number((Math.max(0, confirmedMs) / 60000).toFixed(1));
}

/** mm apportés pour des minutes confirmées, au débit d'irrigation de la zone. */
export function confirmedMm(minutes, mmPerHour) {
  const rate = Number(mmPerHour);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return Number(((Math.max(0, minutes) / 60) * rate).toFixed(2));
}

/**
 * Cycle complet d'un arrosage sous preuve : attente de la preuve de démarrage,
 * puis surveillance de cette preuve jusqu'à la fin de la durée demandée.
 *
 * Le délai de confirmation est déduit de la durée : on ne prolonge jamais
 * l'arrosage au-delà de ce qui a été demandé. Seules les tranches réellement
 * confirmées sont comptabilisées — une confirmation de démarrage ne crédite
 * rien à elle seule.
 *
 * `onConfirmed(startProof)` est appelé une seule fois, dès que le démarrage est
 * prouvé et avant la surveillance : c'est le point où l'appelant publie l'état
 * "en cours" sans attendre la fin.
 *
 * @returns {Promise<{started:boolean, ok:boolean, startProof:object, confirmedMs:number,
 *   minutes:number, mm:number, reason:string, proof:object}>}
 */
export async function runIrrigationWithProof({
  zone,
  durationMs,
  readStates,
  sleep,
  now = Date.now,
  mmPerHour,
  proofTimeoutMs = 45000,
  proofIntervalMs = 3000,
  monitorIntervalMs = 30000,
  onConfirmed,
}) {
  const startProof = await waitForIrrigationProof({
    zone,
    readStates,
    sleep,
    now,
    timeoutMs: proofTimeoutMs,
    intervalMs: proofIntervalMs,
  });

  if (!startProof.ok) {
    return {
      started: false,
      ok: false,
      startProof,
      confirmedMs: 0,
      minutes: 0,
      mm: 0,
      reason: startProof.reason,
      proof: startProof,
    };
  }

  if (onConfirmed) await onConfirmed(startProof);

  const run = await monitorIrrigationProof({
    zone,
    durationMs: Math.max(0, durationMs - startProof.elapsedMs),
    readStates,
    sleep,
    now,
    checkIntervalMs: monitorIntervalMs,
  });

  const minutes = confirmedMinutes(run.confirmedMs);
  return {
    started: true,
    ok: run.ok,
    startProof,
    confirmedMs: run.confirmedMs,
    minutes,
    mm: confirmedMm(minutes, mmPerHour),
    reason: run.reason,
    proof: run.proof ?? startProof,
  };
}

/** Sous-ensemble sérialisable d'une preuve, sûr à écrire dans Firebase. */
export function proofSnapshot(proof) {
  if (!proof) return null;
  return {
    pumpState: proof.pumpState ?? null,
    valveState: proof.valveState ?? null,
    otherValveState: proof.otherValveState ?? null,
    checkedAt: new Date().toISOString(),
  };
}
