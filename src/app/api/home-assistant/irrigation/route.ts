import { NextRequest, NextResponse } from "next/server";
import { fetchHaStates, haFetch } from "@/lib/homeAssistant";

export const dynamic = "force-dynamic";

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
  "script.arrosage_arret_total",
  "script.arrosage_lancer_zone",
  ...["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"].flatMap((day) => [
    `input_boolean.arrosage_vanne_1_${day}`,
    `input_boolean.arrosage_vanne_2_${day}`,
  ]),
];

export async function GET() {
  try {
    const entities = await fetchHaStates(ENTITY_IDS);

    return NextResponse.json({ ok: true, entities, updatedAt: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erreur Home Assistant" },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Le lancement d'une zone (manuel ou auto) passe exclusivement par le bridge
    // local (irrigation-ha/commands en Firebase, voir scripts/home-assistant-
    // irrigation-bridge.mjs) : c'est le seul point qui applique la barrière de
    // sécurité fail-closed (canStartIrrigation). Aucune action "run_zone" ici :
    // elle contournerait ce garde-fou en appelant Home Assistant directement.
    const body = await request.json() as {
      action?: "turn_on" | "turn_off" | "stop_all";
      entityId?: string;
    };

    if (body.action === "stop_all") {
      await haFetch("/api/services/script/arrosage_arret_total", { method: "POST", body: JSON.stringify({}) });
      return NextResponse.json({ ok: true });
    }

    if ((body.action === "turn_on" || body.action === "turn_off") && body.entityId) {
      const allowed = ENTITY_IDS.includes(body.entityId);
      if (!allowed) return NextResponse.json({ ok: false, error: "Entité non autorisée" }, { status: 400 });
      await haFetch(`/api/services/switch/${body.action}`, {
        method: "POST",
        body: JSON.stringify({ entity_id: body.entityId }),
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Action invalide" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erreur Home Assistant" },
      { status: 502 },
    );
  }
}
