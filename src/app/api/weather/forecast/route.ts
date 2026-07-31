import { NextRequest, NextResponse } from "next/server";
import type { WeatherForecast, WeatherForecastResult } from "@/types/weather";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OpenMeteoDailyResponse = {
  daily?: {
    time?: string[];
    precipitation_sum?: Array<number | null>;
    precipitation_probability_max?: Array<number | null>;
    weathercode?: Array<number | null>;
  };
};

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    const result: WeatherForecastResult = { success: false, error: "Coordonnées invalides ou manquantes" };
    return NextResponse.json(result, { status: 400 });
  }

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat.toFixed(4));
  url.searchParams.set("longitude", lon.toFixed(4));
  url.searchParams.set("daily", "precipitation_sum,precipitation_probability_max,weathercode");
  url.searchParams.set("forecast_days", "7");
  url.searchParams.set("timezone", "auto");

  let response: Response;
  try {
    response = await fetch(url.toString(), { cache: "no-store", headers: { Accept: "application/json" } });
  } catch (error) {
    const result: WeatherForecastResult = { success: false, error: (error as Error).message };
    return NextResponse.json(result, { status: 502 });
  }

  if (!response.ok) {
    const body = await response.text();
    const result: WeatherForecastResult = { success: false, error: `Open-Meteo a répondu ${response.status} : ${body.slice(0, 240)}` };
    return NextResponse.json(result, { status: 502 });
  }

  const payload = (await response.json()) as OpenMeteoDailyResponse;
  const times = payload.daily?.time ?? [];

  if (times.length === 0) {
    const result: WeatherForecastResult = { success: false, error: "Aucune prévision retournée par Open-Meteo" };
    return NextResponse.json(result, { status: 502 });
  }

  const forecast: WeatherForecast = {
    source: "open-meteo",
    fetchedAt: new Date().toISOString(),
    latitude: lat,
    longitude: lon,
    days: times.map((date, i) => ({
      date,
      precipitationSumMm: asNumber(payload.daily?.precipitation_sum?.[i]),
      precipitationProbabilityPct: asNumber(payload.daily?.precipitation_probability_max?.[i]),
      weatherCode: asNumber(payload.daily?.weathercode?.[i]),
    })),
  };

  const result: WeatherForecastResult = { success: true, forecast };
  return NextResponse.json(result);
}
