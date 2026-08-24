import type { WeatherReading } from "@/types/weather";

export type WeatherUndergroundMetric = {
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

export type WeatherUndergroundObservation = {
  stationID?: string;
  neighborhood?: string;
  obsTimeUtc?: string;
  humidity?: number;
  winddir?: number;
  uv?: number;
  solarRadiation?: number;
  metric?: WeatherUndergroundMetric;
};

export type WeatherUndergroundResponse = {
  observations?: WeatherUndergroundObservation[];
};

export type WeatherUndergroundFetchResult =
  | { success: true; reading: WeatherReading }
  | { success: false; error: string; status?: number };

export function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildWeatherUndergroundUrl(stationId: string, apiKey: string): string {
  const url = new URL("https://api.weather.com/v2/pws/observations/current");
  url.searchParams.set("stationId", stationId);
  url.searchParams.set("format", "json");
  url.searchParams.set("units", "m");
  url.searchParams.set("numericPrecision", "decimal");
  url.searchParams.set("apiKey", apiKey);
  return url.toString();
}

export function mapObservation(observation: WeatherUndergroundObservation, fallbackStationId: string): WeatherReading {
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

/**
 * Interroge Weather Underground et retourne un WeatherReading prêt à écrire.
 * Fonction pure côté réseau : ne touche pas à Firebase, réutilisable depuis
 * l'API Next.js (import déclenché par la page /meteo) ET depuis le bridge
 * Home Assistant (collecte planifiée, indépendante d'une page ouverte).
 */
export async function fetchWeatherUndergroundReading(
  stationId: string,
  apiKey: string,
): Promise<WeatherUndergroundFetchResult> {
  const response = await fetch(buildWeatherUndergroundUrl(stationId, apiKey), {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const body = await response.text();
    return {
      success: false,
      error: `Weather Underground a répondu ${response.status} : ${body.slice(0, 240)}`,
      status: response.status,
    };
  }

  const payload = (await response.json()) as WeatherUndergroundResponse;
  const observation = payload.observations?.[0];

  if (!observation) {
    return { success: false, error: "Aucune observation météo retournée par Weather Underground", status: 502 };
  }

  return { success: true, reading: mapObservation(observation, stationId) };
}
