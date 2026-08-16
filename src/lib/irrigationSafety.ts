/**
 * irrigationSafety.ts
 * Pure, fail-closed safety gate for starting irrigation (manual or auto), on any
 * launch path (UI, bridge, API). No Firebase, no HA network calls — fully
 * testable in isolation. See canStartIrrigation() below.
 */

import type { Freshness } from "@/lib/citerneEau";

export interface IrrigationGateThresholds {
  /** Citerne 1 (%): irrigation refused strictly below this level. Equal is allowed. */
  citerne1MinPct: number;
  /** Citerne 2 (cm): irrigation refused strictly below this water height. Equal is allowed. */
  citerne2MinCm: number;
}

export const DEFAULT_IRRIGATION_GATE_THRESHOLDS: IrrigationGateThresholds = {
  citerne1MinPct: 75,
  citerne2MinCm: 10,
};

/** Converts a water-height measurement from meters (HA sensor unit for Citerne 2) to centimeters. */
export function metersToCentimeters(value: number | null): number | null {
  if (value === null) return null;
  return value * 100;
}

export interface IrrigationGateTankInput {
  /** Measured value already in the gate's comparison unit — % for Citerne 1, cm for Citerne 2. */
  value: number | null;
  freshness: Freshness;
}

export interface IrrigationGateResult {
  allowed: boolean;
  /** Blocking causes — every one of them, never just the first. Empty when allowed. */
  reasons: string[];
  /** Non-blocking notices (e.g. aging-but-still-usable data). */
  warnings: string[];
}

function evaluateTank(
  label: string,
  unit: string,
  input: IrrigationGateTankInput,
  minValue: number,
  reasons: string[],
  warnings: string[],
): void {
  if (input.freshness === "unknown") {
    reasons.push(`${label} : mesure absente/inconnue — arrosage refusé.`);
    return;
  }
  if (input.freshness === "stale") {
    reasons.push(`${label} : mesure obsolète (> 48h) — arrosage refusé.`);
    return;
  }
  if (input.value === null) {
    reasons.push(`${label} : mesure invalide/indisponible — arrosage refusé.`);
    return;
  }
  if (input.value < minValue) {
    reasons.push(`${label} : ${input.value}${unit} < seuil ${minValue}${unit} — arrosage refusé.`);
    return;
  }
  if (input.freshness === "aging") {
    warnings.push(`${label} : mesure vieillissante (24-48h) — ${input.value}${unit} accepté avec avertissement.`);
  }
}

/**
 * Fail-closed pre-flight gate for irrigation start (manual or auto), any zone,
 * any launch path. Must be checked before every HA call and before writing any
 * pending/ledger entry — a refusal must have zero side effects.
 * - Citerne 2 < 10 cm OU Citerne 1 < 75 % → refusé (égalité autorisée).
 * - Donnée absente/invalide/stale/unknown → refusé.
 * - "aging" (< 48h) → autorisé avec avertissement (le capteur ne reporte qu'une fois par jour).
 * Reasons/warnings list every cause at once — never just the first found.
 */
export function canStartIrrigation(
  citerne1: IrrigationGateTankInput,
  citerne2: IrrigationGateTankInput,
  thresholds: IrrigationGateThresholds = DEFAULT_IRRIGATION_GATE_THRESHOLDS,
): IrrigationGateResult {
  const reasons: string[] = [];
  const warnings: string[] = [];

  evaluateTank("Citerne 1 (niveau)", "%", citerne1, thresholds.citerne1MinPct, reasons, warnings);
  evaluateTank("Citerne 2 (hauteur d'eau)", "cm", citerne2, thresholds.citerne2MinCm, reasons, warnings);

  return { allowed: reasons.length === 0, reasons, warnings };
}
