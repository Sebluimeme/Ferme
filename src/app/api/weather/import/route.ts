import { NextRequest, NextResponse } from "next/server";
import type { WeatherImportResult, WeatherReading } from "@/types/weather";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEATHER_READINGS_PATH = "weather-readings";

type WeatherUndergroundMetric = {
  temp?: number;
  heatIndex?: number;
  dewpt?: number;
  windChill?: number;
  windSpeed?: number;
  windGust?: number;
  pressure?: number;
  precipRate?: number;
  precipTotal?: number;
  elev?: number;
};

type WeatherUndergroundObservation = {
  stationID?: string;
  neighborhood?: string;
  obsTimeUtc?: string;
  humidity?: number;
  winddir?: number;
  uv?: number;
  solarRadiation?: number;
  metric?: WeatherUndergroundMetric;
};

type WeatherUndergroundResponse = {
  observations?: WeatherUndergroundObservation[];
};

type FirebaseAccountLookupResponse = {
  users?: Array<{ localId?: string }>;
  error?: { message?: string };
};

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildWeatherUndergroundUrl(stationId: string, apiKey: string): string {
  const url = new URL("https://api.weather.com/v2/pws/observations/current");
  url.searchParams.set("stationId", stationId);
  url.searchParams.set("format", "json");
  url.searchParams.set("units", "m");
  url.searchParams.set("numericPrecision", "decimal");
  url.searchParams.set("apiKey", apiKey);
  return url.toString();
}

function mapObservation(observation: WeatherUndergroundObservation, fallbackStationId: string): WeatherReading {
  const timestamp = observation.obsTimeUtc ? new Date(observation.obsTimeUtc) : new Date();
  const iso = Number.isNaN(timestamp.getTime()) ? new Date().toISOString() : timestamp.toISOString();
  const stationId = observation.stationID || fallbackStationId;
  const id = `${stationId}_${iso.slice(0, 16).replace(/[-:T]/g, "")}`;
  const metric = observation.metric ?? {};
  const now = new Date().toISOString();

  return {
    id,
    stationId,
    stationName: observation.neighborhood,
    timestamp: iso,
    date: iso.slice(0, 10),
    temperatureC: asNumber(metric.temp),
    humidityPct: asNumber(observation.humidity),
    dewPointC: asNumber(metric.dewpt),
    heatIndexC: asNumber(metric.heatIndex),
    windChillC: asNumber(metric.windChill),
    windSpeedKmh: asNumber(metric.windSpeed),
    windGustKmh: asNumber(metric.windGust),
    windDirectionDeg: asNumber(observation.winddir),
    pressureHpa: asNumber(metric.pressure),
    rainRateMmH: asNumber(metric.precipRate),
    rainTotalMm: asNumber(metric.precipTotal),
    solarRadiationWm2: asNumber(observation.solarRadiation),
    uvIndex: asNumber(observation.uv),
    source: "weather-underground",
    dateCreation: now,
    derniereMAJ: now,
  };
}

async function validateFirebaseToken(request: NextRequest): Promise<{ ok: true; token: string } | { ok: false; response: NextResponse<WeatherImportResult> }> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const allowedUid = process.env.WEATHER_IMPORT_ALLOWED_UID;

  if (!allowedUid) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: "Configuration manquante : WEATHER_IMPORT_ALLOWED_UID" }, { status: 500 }),
    };
  }

  if (!token || !firebaseApiKey) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: "Connexion Firebase requise pour importer la météo" }, { status: 401 }),
    };
  }

  const lookup = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: token }),
    cache: "no-store",
  });

  if (!lookup.ok) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: "Session Firebase invalide" }, { status: 401 }),
    };
  }

  const account = (await lookup.json()) as FirebaseAccountLookupResponse;
  const uid = account.users?.[0]?.localId;
  if (!uid || uid !== allowedUid) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: "Utilisateur non autorisé à importer la météo" }, { status: 403 }),
    };
  }

  return { ok: true, token };
}

async function saveReadingWithFirebaseRules(reading: WeatherReading, token: string) {
  const databaseUrl = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("NEXT_PUBLIC_FIREBASE_DATABASE_URL manquant");
  }

  const url = new URL(`${databaseUrl.replace(/\/$/, "")}/${WEATHER_READINGS_PATH}/${reading.id}.json`);
  url.searchParams.set("auth", token);

  const response = await fetch(url.toString(), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reading),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Firebase a répondu ${response.status} : ${body.slice(0, 240)}`);
  }
}

export async function POST(request: NextRequest) {
  const auth = await validateFirebaseToken(request);
  if (!auth.ok) return auth.response;

  const stationId = process.env.WEATHER_UNDERGROUND_STATION_ID;
  const apiKey = process.env.WEATHER_UNDERGROUND_API_KEY;

  if (!stationId || !apiKey) {
    const result: WeatherImportResult = {
      success: false,
      missingConfig: true,
      error: "Configuration manquante : WEATHER_UNDERGROUND_STATION_ID et WEATHER_UNDERGROUND_API_KEY",
    };
    return NextResponse.json(result, { status: 400 });
  }

  const response = await fetch(buildWeatherUndergroundUrl(stationId, apiKey), {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const body = await response.text();
    const result: WeatherImportResult = {
      success: false,
      error: `Weather Underground a répondu ${response.status} : ${body.slice(0, 240)}`,
    };
    return NextResponse.json(result, { status: response.status });
  }

  const payload = (await response.json()) as WeatherUndergroundResponse;
  const observation = payload.observations?.[0];

  if (!observation) {
    const result: WeatherImportResult = {
      success: false,
      error: "Aucune observation météo retournée par Weather Underground",
    };
    return NextResponse.json(result, { status: 502 });
  }

  const reading = mapObservation(observation, stationId);

  try {
    await saveReadingWithFirebaseRules(reading, auth.token);
  } catch (error) {
    const result: WeatherImportResult = {
      success: false,
      error: (error as Error).message,
    };
    return NextResponse.json(result, { status: 502 });
  }

  const result: WeatherImportResult = { success: true, reading };
  return NextResponse.json(result);
}
