export interface WeatherReading {
  id: string;
  stationId: string;
  stationName?: string;
  timestamp: string; // ISO UTC
  date: string; // YYYY-MM-DD local/UTC derived for grouping
  temperatureC: number | null;
  humidityPct: number | null;
  dewPointC: number | null;
  heatIndexC: number | null;
  windChillC: number | null;
  windSpeedKmh: number | null;
  windGustKmh: number | null;
  windDirectionDeg: number | null;
  pressureHpa: number | null;
  rainRateMmH: number | null;
  rainTotalMm: number | null;
  solarRadiationWm2: number | null;
  uvIndex: number | null;
  source: "weather-underground" | "manual";
  dateCreation?: string;
  derniereMAJ?: string;
}

export interface WeatherImportResult {
  success: boolean;
  reading?: WeatherReading;
  error?: string;
  missingConfig?: boolean;
}

export interface WeatherForecastDay {
  date: string;
  precipitationSumMm: number | null;
  precipitationProbabilityPct: number | null;
  weatherCode: number | null;
}

export interface WeatherForecast {
  source: "open-meteo";
  fetchedAt: string;
  latitude: number;
  longitude: number;
  days: WeatherForecastDay[];
}

export interface WeatherForecastResult {
  success: boolean;
  forecast?: WeatherForecast;
  error?: string;
}

export interface WeatherStats {
  count: number;
  latest: WeatherReading | null;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  humidityAvgPct: number | null;
  windMaxKmh: number | null;
  // null = aucun relevé exploitable sur la période (pas une mesure à 0 mm).
  rainTodayMm: number | null;
  rain7DaysMm: number | null;
  rain30DaysMm: number | null;
  rainYearMm: number | null;
  dryDays: number;
}

export interface WeatherDailyPoint {
  date: string;
  temperatureAvgC: number | null;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  // null = aucun relevé de pluie exploitable ce jour-là (pas une mesure à 0 mm).
  rainMm: number | null;
  windMaxKmh: number | null;
  humidityAvgPct: number | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

// Retourne null quand aucun relevé exploitable ne couvre la période : une
// absence de mesure ne doit jamais être confondue avec une vraie mesure à 0 mm.
function sumRain(readings: WeatherReading[], since: Date, until = new Date()): number | null {
  const byDay = new Map<string, number>();

  readings.forEach((reading) => {
    const timestamp = new Date(reading.timestamp);
    if (timestamp < since || timestamp > until || !isFiniteNumber(reading.rainTotalMm)) return;

    const date = reading.date || reading.timestamp.slice(0, 10);
    byDay.set(date, Math.max(byDay.get(date) ?? 0, reading.rainTotalMm));
  });

  if (byDay.size === 0) return null;
  return [...byDay.values()].reduce((sum, rain) => sum + rain, 0);
}

function avg(values: Array<number | null | undefined>): number | null {
  const nums = values.filter(isFiniteNumber);
  if (nums.length === 0) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

export function formatWeatherValue(value: number | null | undefined, unit: string, digits = 1): string {
  if (!isFiniteNumber(value)) return "—";
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: digits })} ${unit}`;
}

export function getWindDirectionLabel(deg: number | null | undefined): string {
  if (!isFiniteNumber(deg)) return "—";
  const directions = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  return directions[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

export function computeWeatherStats(readings: WeatherReading[], now = new Date()): WeatherStats {
  const sorted = [...readings].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const latest = sorted.at(-1) ?? null;
  const temps = sorted.map((reading) => reading.temperatureC).filter(isFiniteNumber);
  const wind = sorted.map((reading) => reading.windGustKmh ?? reading.windSpeedKmh).filter(isFiniteNumber);

  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const start7 = new Date(now.getTime() - 7 * MS_PER_DAY);
  const start30 = new Date(now.getTime() - 30 * MS_PER_DAY);
  const startYear = new Date(now.getFullYear(), 0, 1);

  const daily = aggregateWeatherByDay(sorted);
  let dryDays = 0;
  for (const point of [...daily].reverse()) {
    // Un jour sans relevé de pluie exploitable est inconnu, jamais "sec" :
    // on ne peut pas prolonger la série sans données pour le prouver.
    if (point.rainMm === null || point.rainMm > 0.2) break;
    dryDays += 1;
  }

  return {
    count: sorted.length,
    latest,
    temperatureMinC: temps.length ? Math.min(...temps) : null,
    temperatureMaxC: temps.length ? Math.max(...temps) : null,
    humidityAvgPct: avg(sorted.map((reading) => reading.humidityPct)),
    windMaxKmh: wind.length ? Math.max(...wind) : null,
    rainTodayMm: sumRain(sorted, startToday, now),
    rain7DaysMm: sumRain(sorted, start7, now),
    rain30DaysMm: sumRain(sorted, start30, now),
    rainYearMm: sumRain(sorted, startYear, now),
    dryDays,
  };
}

export function aggregateWeatherByDay(readings: WeatherReading[]): WeatherDailyPoint[] {
  const groups = new Map<string, WeatherReading[]>();
  readings.forEach((reading) => {
    const key = reading.date || reading.timestamp.slice(0, 10);
    groups.set(key, [...(groups.get(key) ?? []), reading]);
  });

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => {
      const temps = values.map((reading) => reading.temperatureC).filter(isFiniteNumber);
      const wind = values.map((reading) => reading.windGustKmh ?? reading.windSpeedKmh).filter(isFiniteNumber);
      const dayRainValues = values.map((reading) => reading.rainTotalMm).filter(isFiniteNumber);
      return {
        date,
        temperatureAvgC: avg(values.map((reading) => reading.temperatureC)),
        temperatureMinC: temps.length ? Math.min(...temps) : null,
        temperatureMaxC: temps.length ? Math.max(...temps) : null,
        // null = aucun relevé de pluie exploitable ce jour-là (pas une mesure à 0 mm).
        rainMm: dayRainValues.length ? dayRainValues.reduce((max, rain) => Math.max(max, rain), 0) : null,
        windMaxKmh: wind.length ? Math.max(...wind) : null,
        humidityAvgPct: avg(values.map((reading) => reading.humidityPct)),
      };
    });
}

export function keepLastWeatherDays(readings: WeatherReading[], days: number): WeatherReading[] {
  const cutoff = new Date(Date.now() - days * MS_PER_DAY);
  return readings.filter((reading) => new Date(reading.timestamp) >= cutoff);
}
