import firebaseService from "@/lib/firebase-service";
import type { WeatherReading } from "@/types/weather";

export const WEATHER_READINGS_PATH = "weather-readings";

export async function getWeatherReadings() {
  return firebaseService.getAll<WeatherReading>(WEATHER_READINGS_PATH);
}

export function sortWeatherReadings(readings: WeatherReading[]): WeatherReading[] {
  return [...readings].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
