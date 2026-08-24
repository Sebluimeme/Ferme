import { NextRequest, NextResponse } from "next/server";
import type { WeatherImportResult, WeatherReading } from "@/types/weather";
import { fetchWeatherUndergroundReading } from "@/lib/weatherUnderground";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEATHER_READINGS_PATH = "weather-readings";

type FirebaseAccountLookupResponse = {
  users?: Array<{ localId?: string }>;
  error?: { message?: string };
};

async function validateFirebaseToken(request: NextRequest): Promise<{ ok: true; token: string } | { ok: false; response: NextResponse<WeatherImportResult> }> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

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
  if (!uid) {
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

  const fetched = await fetchWeatherUndergroundReading(stationId, apiKey);
  if (!fetched.success) {
    const result: WeatherImportResult = { success: false, error: fetched.error };
    return NextResponse.json(result, { status: fetched.status ?? 502 });
  }

  const reading = fetched.reading;

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
