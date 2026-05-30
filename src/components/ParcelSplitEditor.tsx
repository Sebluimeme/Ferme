"use client";

import React, { useState, useEffect, useCallback } from "react";
import { MapContainer, TileLayer, WMSTileLayer, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Partiel } from "@/types/fourrage";

// ==================== Geometry helpers ====================

interface SnapResult {
  lng: number;
  lat: number;
  segIndex: number;
  t: number;
}

function nearestOnSegment(
  sx: number, sy: number, ex: number, ey: number, px: number, py: number
): { x: number; y: number; t: number } {
  const dx = ex - sx, dy = ey - sy;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { x: sx, y: sy, t: 0 };
  const t = Math.max(0, Math.min(1, ((px - sx) * dx + (py - sy) * dy) / len2));
  return { x: sx + t * dx, y: sy + t * dy, t };
}

function snapToRing(lng: number, lat: number, ring: number[][]): SnapResult {
  let best: SnapResult = { lng: ring[0][0], lat: ring[0][1], segIndex: 0, t: 0 };
  let bestDist = Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    const p = nearestOnSegment(ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1], lng, lat);
    const d = (p.x - lng) ** 2 + (p.y - lat) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = { lng: p.x, lat: p.y, segIndex: i, t: p.t };
    }
  }
  return best;
}

function shoelace(ring: number[][]): number {
  let area = 0;
  const n = ring.length - 1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1];
  }
  return Math.abs(area) / 2;
}

// Split a ring with a multi-point cutting line: start→mids→end (start and end are boundary snaps)
function splitRing(
  ring: number[][],
  s1: SnapResult,
  s2: SnapResult,
  mids: number[][]
): [number[][], number[][]] | null {
  let a = s1, b = s2;
  let orderedMids = mids;
  if (a.segIndex + a.t > b.segIndex + b.t) {
    [a, b] = [b, a];
    orderedMids = [...mids].reverse();
  }

  const pA = [a.lng, a.lat];
  const pB = [b.lng, b.lat];
  const n = ring.length - 1;

  // r1: pA → boundary(a→b) → pB → mids_reversed → pA
  const r1: number[][] = [pA];
  for (let i = a.segIndex + 1; i <= b.segIndex; i++) r1.push([...ring[i]]);
  r1.push(pB, ...[...orderedMids].reverse(), pA);

  // r2: pB → boundary(b→a wrap) → pA → mids_forward → pB
  const r2: number[][] = [pB];
  for (let i = b.segIndex + 1; i <= n + a.segIndex; i++) r2.push([...ring[i % n]]);
  r2.push(pA, ...orderedMids, pB);

  if (r1.length < 4 || r2.length < 4) return null;
  return [r1, r2];
}

// ==================== Map sublayers ====================

function OriginalLayer({ ring, hidden }: { ring: number[][]; hidden: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (hidden) return;
    const toLL = (r: number[][]): L.LatLngExpression[] => r.map((c) => [c[1], c[0]] as L.LatLngExpression);
    const layer = L.polygon(toLL(ring), {
      color: "#6366f1", fillColor: "#6366f1", fillOpacity: 0.15, weight: 2,
    }).addTo(map);
    return () => { layer.remove(); };
  }, [map, ring, hidden]);
  return null;
}

function SplitLayer({ r1, r2 }: { r1: number[][]; r2: number[][] }) {
  const map = useMap();
  useEffect(() => {
    const toLL = (r: number[][]): L.LatLngExpression[] => r.map((c) => [c[1], c[0]] as L.LatLngExpression);
    const p1 = L.polygon(toLL(r1), { color: "#22c55e", fillColor: "#22c55e", fillOpacity: 0.35, weight: 2 }).addTo(map);
    const p2 = L.polygon(toLL(r2), { color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 0.35, weight: 2 }).addTo(map);
    return () => { p1.remove(); p2.remove(); };
  }, [map, r1, r2]);
  return null;
}

interface CuttingLayerProps {
  snapStart: SnapResult | null;
  snapEnd: SnapResult | null;
  intermediates: number[][];
}

function CuttingLayer({ snapStart, snapEnd, intermediates }: CuttingLayerProps) {
  const map = useMap();
  useEffect(() => {
    const layers: L.Layer[] = [];

    const path: L.LatLngExpression[] = [];
    if (snapStart) path.push([snapStart.lat, snapStart.lng]);
    for (const m of intermediates) path.push([m[1], m[0]]);
    if (snapEnd) path.push([snapEnd.lat, snapEnd.lng]);

    if (path.length >= 2) {
      layers.push(
        L.polyline(path, { color: "#ef4444", weight: 2, dashArray: "6 4" }).addTo(map)
      );
    }

    if (snapStart) {
      layers.push(
        L.circleMarker([snapStart.lat, snapStart.lng], {
          radius: 8, fillColor: "#22c55e", color: "#fff", weight: 2, fillOpacity: 1,
        }).addTo(map)
      );
    }

    intermediates.forEach((m) => {
      layers.push(
        L.circleMarker([m[1], m[0]], {
          radius: 5, fillColor: "#3b82f6", color: "#fff", weight: 2, fillOpacity: 1,
        }).addTo(map)
      );
    });

    if (snapEnd) {
      layers.push(
        L.circleMarker([snapEnd.lat, snapEnd.lng], {
          radius: 8, fillColor: "#ef4444", color: "#fff", weight: 2, fillOpacity: 1,
        }).addTo(map)
      );
    }

    return () => { layers.forEach((l) => l.remove()); };
  }, [map, snapStart, snapEnd, intermediates]);
  return null;
}

interface ClickHandlerProps {
  ring: number[][];
  snapStart: SnapResult | null;
  closingMode: boolean;
  isDone: boolean;
  onSnapStart: (s: SnapResult) => void;
  onIntermediate: (pt: number[]) => void;
  onSnapEnd: (s: SnapResult) => void;
}

function ClickHandler({ ring, snapStart, closingMode, isDone, onSnapStart, onIntermediate, onSnapEnd }: ClickHandlerProps) {
  useMapEvents({
    click(e) {
      if (isDone) return;
      if (!snapStart) {
        onSnapStart(snapToRing(e.latlng.lng, e.latlng.lat, ring));
      } else if (closingMode) {
        onSnapEnd(snapToRing(e.latlng.lng, e.latlng.lat, ring));
      } else {
        onIntermediate([e.latlng.lng, e.latlng.lat]);
      }
    },
  });
  return null;
}

// ==================== Editor component ====================

interface Props {
  parcelle: Partiel;
  onClose: () => void;
  onConfirm: (r1: number[][], r2: number[][], n1: string, n2: string, s1?: number, s2?: number) => void;
  saving: boolean;
}

export default function ParcelSplitEditor({ parcelle, onClose, onConfirm, saving }: Props) {
  const geo = parcelle.geometry as { type: string; coordinates: number[][][] } | null;
  const ring: number[][] =
    geo?.type === "Polygon"
      ? geo.coordinates[0]
      : geo?.type === "MultiPolygon"
      ? (geo.coordinates as unknown as number[][][][])[0][0]
      : [];

  const [snapStart, setSnapStart] = useState<SnapResult | null>(null);
  const [snapEnd, setSnapEnd] = useState<SnapResult | null>(null);
  const [intermediates, setIntermediates] = useState<number[][]>([]);
  const [closingMode, setClosingMode] = useState(false);
  const [showNames, setShowNames] = useState(false);
  const [name1, setName1] = useState(`${parcelle.nom} A`);
  const [name2, setName2] = useState(`${parcelle.nom} B`);

  const isDone = snapStart !== null && snapEnd !== null;

  const phase: "idle" | "drawing" | "closing" | "done" = isDone
    ? "done"
    : closingMode
    ? "closing"
    : snapStart
    ? "drawing"
    : "idle";

  const handleSnapStart = useCallback((s: SnapResult) => setSnapStart(s), []);
  const handleIntermediate = useCallback((pt: number[]) => setIntermediates((prev) => [...prev, pt]), []);
  const handleSnapEnd = useCallback((s: SnapResult) => {
    setSnapEnd(s);
    setClosingMode(false);
  }, []);

  const handleUndo = () => {
    if (closingMode) {
      setClosingMode(false);
    } else if (intermediates.length > 0) {
      setIntermediates((prev) => prev.slice(0, -1));
    } else if (snapStart) {
      setSnapStart(null);
    }
  };

  const handleReset = () => {
    setSnapStart(null);
    setSnapEnd(null);
    setIntermediates([]);
    setClosingMode(false);
    setShowNames(false);
  };

  const splitResult = snapStart && snapEnd ? splitRing(ring, snapStart, snapEnd, intermediates) : null;
  const splitError = isDone && splitResult === null;

  const handleConfirm = () => {
    if (!splitResult) return;
    const [r1, r2] = splitResult;
    let s1: number | undefined, s2: number | undefined;
    if (parcelle.surface != null) {
      const a1 = shoelace(r1), a2 = shoelace(r2), total = a1 + a2;
      if (total > 0) {
        s1 = Math.round((parcelle.surface * a1 / total) * 10000) / 10000;
        s2 = Math.round((parcelle.surface * a2 / total) * 10000) / 10000;
      }
    }
    onConfirm(r1, r2, name1, name2, s1, s2);
  };

  if (!ring.length) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>Cette parcelle n'a pas de géométrie cadastrale — importez-la via le bouton 📍 Cadastre d'abord.</p>
        <button onClick={onClose} className="mt-4 px-4 py-2 bg-gray-100 rounded-lg text-sm cursor-pointer">
          Fermer
        </button>
      </div>
    );
  }

  const lats = ring.map((c) => c[1]);
  const lngs = ring.map((c) => c[0]);
  const bounds: L.LatLngBoundsExpression = [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];

  const stepMsg =
    splitError
      ? "⚠️ Tracé invalide — réinitialisez et tracez un chemin qui traverse la parcelle"
      : phase === "done"
      ? "✓ Tracé validé — nommez les parcelles puis confirmez"
      : phase === "idle"
      ? "① Cliquez sur le bord de la parcelle pour poser le point de départ (ancré automatiquement)"
      : phase === "drawing"
      ? `② Cliquez n'importe où pour ajouter des points${intermediates.length > 0 ? ` (${intermediates.length} intermédiaire${intermediates.length > 1 ? "s" : ""})` : ""} — puis "Terminer le tracé"`
      : "③ Cliquez sur le bord de la parcelle pour terminer et ancrer le tracé";

  const canUndo = phase !== "idle" && !isDone;

  return (
    <div className="flex flex-col gap-4">
      <div
        className={`border rounded-lg px-4 py-2 text-sm ${
          splitError
            ? "bg-red-50 border-red-200 text-red-700"
            : phase === "done"
            ? "bg-green-50 border-green-200 text-green-700"
            : "bg-blue-50 border-blue-200 text-blue-700"
        }`}
      >
        {stepMsg}
      </div>

      <div style={{ height: "520px" }} className="rounded-xl overflow-hidden border border-gray-200">
        <MapContainer
          bounds={bounds}
          boundsOptions={{ padding: [40, 40] }}
          style={{ height: "100%", width: "100%" }}
          maxZoom={22}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
            maxNativeZoom={19}
            maxZoom={22}
          />
          <WMSTileLayer
            url="https://data.geopf.fr/wms-r/wms"
            layers="CADASTRALPARCELS.PARCELLAIRE_EXPRESS"
            format="image/png"
            transparent={true}
            version="1.3.0"
            opacity={0.5}
            attribution='&copy; <a href="https://www.geoportail.gouv.fr/">IGN</a>'
          />
          <OriginalLayer ring={ring} hidden={!!splitResult} />
          {splitResult && <SplitLayer r1={splitResult[0]} r2={splitResult[1]} />}
          <CuttingLayer snapStart={snapStart} snapEnd={snapEnd} intermediates={intermediates} />
          <ClickHandler
            ring={ring}
            snapStart={snapStart}
            closingMode={closingMode}
            isDone={isDone}
            onSnapStart={handleSnapStart}
            onIntermediate={handleIntermediate}
            onSnapEnd={handleSnapEnd}
          />
        </MapContainer>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleReset}
          disabled={phase === "idle"}
          className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-200 cursor-pointer disabled:opacity-40"
        >
          Réinitialiser
        </button>
        {canUndo && (
          <button
            onClick={handleUndo}
            className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-200 cursor-pointer"
          >
            ↩ Annuler dernier
          </button>
        )}
        {phase === "drawing" && (
          <button
            onClick={() => setClosingMode(true)}
            className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer"
          >
            Terminer le tracé →
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 cursor-pointer"
        >
          Annuler
        </button>
        <button
          onClick={() => setShowNames(true)}
          disabled={!splitResult}
          className="px-5 py-2 text-sm font-semibold text-white rounded-lg bg-gradient-to-br from-primary to-secondary cursor-pointer disabled:opacity-40"
        >
          ✂️ Diviser en 2
        </button>
      </div>

      {showNames && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-sm font-semibold text-gray-700 m-0">Nommez les 2 nouvelles parcelles :</p>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-green-700 font-semibold mb-1">🟢 Parcelle verte</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={name1}
                onChange={(e) => setName1(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-amber-700 font-semibold mb-1">🟡 Parcelle jaune</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={name2}
                onChange={(e) => setName2(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowNames(false)}
              className="px-4 py-2 text-sm bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 cursor-pointer"
            >
              Retour
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving || !name1.trim() || !name2.trim()}
              className="px-5 py-2 text-sm font-semibold text-white rounded-lg bg-gradient-to-br from-primary to-secondary cursor-pointer disabled:opacity-50"
            >
              {saving ? "Division en cours..." : "Confirmer la division"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
