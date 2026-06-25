"use client";

import React, { useEffect, useState } from "react";
import type { Partiel } from "@/types/fourrage";

function computeCenter(partiels: Partiel[]): { lat: number; lon: number } | null {
  const withGeo = partiels.filter((p) => p.geometry);
  if (!withGeo.length) return null;
  let latSum = 0, lonSum = 0, count = 0;
  for (const p of withGeo) {
    const geo = p.geometry as { type: string; coordinates: number[][][] };
    if (geo?.type === "Polygon" && geo.coordinates?.[0]) {
      for (const [lng, lt] of geo.coordinates[0]) {
        lonSum += lng; latSum += lt; count++;
      }
    }
  }
  return count > 0 ? { lat: latSum / count, lon: lonSum / count } : null;
}

interface DayForecast {
  date: string;
  tempMax: number;
  tempMin: number;
  precipSum: number;
  precipProb: number;
  windMax: number;
  code: number;
}

function hayScore(d: DayForecast): "good" | "ok" | "bad" {
  if (d.precipSum > 1.5 || d.precipProb > 50 || d.tempMax < 12) return "bad";
  if (d.precipSum > 0.3 || d.precipProb > 25 || d.windMax > 35 || d.tempMax < 15) return "ok";
  return "good";
}

function codeToEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (code <= 19) return "🌫️";
  if (code <= 39) return "🌧️";
  if (code <= 49) return "❄️";
  if (code <= 69) return "🌧️";
  if (code <= 84) return "🌦️";
  return "⛈️";
}

function codeToLabel(code: number): string {
  if (code === 0) return "Ensoleillé";
  if (code <= 3) return "Nuageux";
  if (code <= 19) return "Brouillard";
  if (code <= 29) return "Bruine";
  if (code <= 39) return "Pluie légère";
  if (code <= 49) return "Bruine";
  if (code <= 59) return "Bruine modérée";
  if (code <= 69) return "Pluie";
  if (code <= 79) return "Neige";
  if (code <= 84) return "Averses";
  if (code <= 94) return "Grêle";
  return "Orage";
}

const SCORE_CONFIG = {
  good: { label: "Favorable", bg: "bg-green-50", border: "border-green-200", text: "text-green-700", dot: "bg-green-500" },
  ok:   { label: "Passable",  bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-700", dot: "bg-yellow-400" },
  bad:  { label: "Défavorable", bg: "bg-red-50", border: "border-red-200", text: "text-red-600", dot: "bg-red-400" },
};

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

function findBestWindow(days: DayForecast[]): { start: number; len: number } | null {
  let best: { start: number; len: number } | null = null;
  let cur = 0;
  for (let i = 0; i < days.length; i++) {
    if (hayScore(days[i]) !== "bad") {
      cur++;
      if (!best || cur > best.len) best = { start: i - cur + 1, len: cur };
    } else {
      cur = 0;
    }
  }
  return best && best.len >= 2 ? best : null;
}

export default function WeatherWidget({ partiels }: { partiels: Partiel[] }) {
  const [days, setDays] = useState<DayForecast[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualLat, setManualLat] = useState("");
  const [manualLon, setManualLon] = useState("");
  const [useManual, setUseManual] = useState(false);

  const auto = computeCenter(partiels);
  const lat = useManual ? parseFloat(manualLat) : auto?.lat;
  const lon = useManual ? parseFloat(manualLon) : auto?.lon;

  useEffect(() => {
    if (!lat || !lon || isNaN(lat) || isNaN(lon)) {
      if (!auto && !useManual) setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,windspeed_10m_max,weathercode&forecast_days=7&timezone=auto`
    )
      .then((r) => r.json())
      .then((json) => {
        const d = json.daily;
        setDays(
          d.time.map((date: string, i: number) => ({
            date,
            tempMax: Math.round(d.temperature_2m_max[i]),
            tempMin: Math.round(d.temperature_2m_min[i]),
            precipSum: d.precipitation_sum[i] ?? 0,
            precipProb: d.precipitation_probability_max[i] ?? 0,
            windMax: Math.round(d.windspeed_10m_max[i] ?? 0),
            code: d.weathercode[i] ?? 0,
          }))
        );
        setLoading(false);
      })
      .catch(() => {
        setError("Impossible de charger la météo");
        setLoading(false);
      });
  }, [lat, lon]);

  const bestWindow = days ? findBestWindow(days) : null;

  if (!auto && !useManual) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-5 mb-8">
        <h2 className="text-base font-semibold text-stone-800 mb-3">🌤️ Météo — fenêtre fenaison</h2>
        <p className="text-sm text-stone-500 mb-3">Aucune parcelle géolocalisée. Entrez vos coordonnées pour afficher la météo.</p>
        <div className="flex gap-2 items-end flex-wrap">
          <div>
            <label className="text-xs text-stone-500 mb-1 block">Latitude</label>
            <input type="text" placeholder="ex: 48.20" value={manualLat} onChange={(e) => setManualLat(e.target.value)}
              className="border border-stone-300 rounded-lg px-2 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="text-xs text-stone-500 mb-1 block">Longitude</label>
            <input type="text" placeholder="ex: 7.10" value={manualLon} onChange={(e) => setManualLon(e.target.value)}
              className="border border-stone-300 rounded-lg px-2 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <button onClick={() => setUseManual(true)}
            className="px-4 py-1.5 text-sm font-semibold text-white rounded-lg bg-brand-600 cursor-pointer">
            Afficher
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-5 mb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-stone-800">🌤️ Météo — fenêtre fenaison</h2>
          <p className="text-xs text-stone-400 mt-0.5">
            {auto && !useManual ? `Centroïde parcelles — ${auto.lat.toFixed(3)}, ${auto.lon.toFixed(3)}` : `${lat?.toFixed(3)}, ${lon?.toFixed(3)}`}
          </p>
        </div>
        {bestWindow && (
          <div className="text-right">
            <div className="text-xs font-medium text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
              ✅ Fenêtre : {bestWindow.len} jour{bestWindow.len > 1 ? "s" : ""} à partir de{" "}
              {dayLabel(days![bestWindow.start].date)}
            </div>
          </div>
        )}
        {!bestWindow && days && (
          <div className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
            ⚠️ Pas de fenêtre favorable sur 7 j
          </div>
        )}
      </div>

      {loading && (
        <div className="h-24 flex items-center justify-center text-stone-400 text-sm">Chargement météo...</div>
      )}
      {error && (
        <div className="text-sm text-red-500 py-4 text-center">{error}</div>
      )}

      {days && (
        <div className="overflow-x-auto -mx-1"><div className="grid grid-cols-7 gap-1 min-w-[340px] px-1">
          {days.map((day, i) => {
            const score = hayScore(day);
            const cfg = SCORE_CONFIG[score];
            const isWindow = bestWindow && i >= bestWindow.start && i < bestWindow.start + bestWindow.len;
            return (
              <div
                key={day.date}
                className={`rounded-xl border p-2 text-center flex flex-col gap-0.5 ${cfg.bg} ${cfg.border} ${isWindow ? "ring-2 ring-green-400 ring-offset-1" : ""}`}
              >
                <p className="text-xs font-semibold text-stone-500 truncate">{dayLabel(day.date)}</p>
                <p className="text-xl leading-none">{codeToEmoji(day.code)}</p>
                <p className="text-xs text-stone-500 truncate">{codeToLabel(day.code)}</p>
                <p className="text-xs font-bold text-stone-800">{day.tempMax}° / {day.tempMin}°</p>
                {day.precipSum > 0 && (
                  <p className="text-xs text-blue-600">💧 {day.precipSum.toFixed(1)} mm</p>
                )}
                {day.precipSum === 0 && <p className="text-xs text-stone-300">—</p>}
                <p className="text-xs text-stone-500">💨 {day.windMax} km/h</p>
                {day.precipProb > 0 && (
                  <p className="text-xs text-stone-400">{day.precipProb}% pluie</p>
                )}
                <div className="mt-1 flex justify-center">
                  <span className={`inline-block w-2 h-2 rounded-full ${cfg.dot}`} title={cfg.label} />
                </div>
              </div>
            );
          })}
        </div></div>
      )}

      {days && (
        <div className="flex gap-3 mt-3 justify-end text-xs text-stone-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Favorable (sec, chaud, peu de vent)</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> Passable</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Défavorable</span>
        </div>
      )}
    </div>
  );
}
