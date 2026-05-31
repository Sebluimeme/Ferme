"use client";

import React, { useEffect } from "react";
import { MapContainer, TileLayer, WMSTileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Partiel } from "@/types/fourrage";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function FitBounds({ partiels }: { partiels: Partiel[] }) {
  const map = useMap();
  useEffect(() => {
    const withGeo = partiels.filter((p) => p.geometry);
    if (withGeo.length === 0) return;
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: withGeo.map((p) => ({
        type: "Feature",
        properties: {},
        geometry: p.geometry as GeoJSON.Geometry,
      })),
    };
    const layer = L.geoJSON(fc);
    const bounds = layer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function parcelColor(type?: string) {
  if (type === "pature") return { color: "#16a34a", fill: "#22c55e" };
  if (type === "fauche") return { color: "#ca8a04", fill: "#facc15" };
  return { color: "#3b82f6", fill: "#93c5fd" };
}

interface Props {
  partiels: Partiel[];
  onDoubleClick?: (partiel: Partiel) => void;
}

export default function ParcelOverviewMap({ partiels, onDoubleClick }: Props) {
  const withGeo = partiels.filter((p) => p.geometry);

  if (withGeo.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 text-center text-gray-400">
        <div className="text-3xl mb-2">🗺️</div>
        <p className="text-sm">Aucune parcelle avec géométrie cadastrale.</p>
        <p className="text-xs mt-1">Utilisez le bouton 📍 Cadastre pour importer des parcelles avec contour.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="rounded-xl overflow-hidden" style={{ height: "380px" }}>
        <MapContainer center={[48.172, 7.141]} zoom={14} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <WMSTileLayer
            url="https://data.geopf.fr/wms-r/wms"
            layers="CADASTRALPARCELS.PARCELLAIRE_EXPRESS"
            format="image/png"
            transparent={true}
            version="1.3.0"
            opacity={0.4}
            attribution="&copy; IGN"
          />
          {withGeo.map((p) => {
            const { color, fill } = parcelColor(p.type);
            return (
              <GeoJSON
                key={p.id}
                data={p.geometry as GeoJSON.GeoJsonObject}
                style={{ color, weight: 2.5, fillColor: fill, fillOpacity: 0.35 }}
                onEachFeature={(_, layer) => {
                  const label = p.surface
                    ? `<strong>${p.nom}</strong><br/>${p.surface} ha`
                    : `<strong>${p.nom}</strong>`;
                  layer.bindTooltip(label, { sticky: false, permanent: false, direction: "center" });
                  if (onDoubleClick) {
                    layer.on("dblclick", (e) => {
                      L.DomEvent.stopPropagation(e);
                      onDoubleClick(p);
                    });
                  }
                }}
              />
            );
          })}
          <FitBounds partiels={partiels} />
        </MapContainer>
      </div>
      {/* Légende */}
      <div className="px-4 py-2.5 border-t border-gray-100 flex gap-4 text-xs text-gray-500 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-green-400 border border-green-600" />
          Pâture
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-yellow-300 border border-yellow-500" />
          Fauche
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-blue-300 border border-blue-500" />
          Non défini
        </span>
        <span className="ml-auto text-gray-400">{withGeo.length} parcelle{withGeo.length > 1 ? "s" : ""} affichée{withGeo.length > 1 ? "s" : ""}</span>
      </div>
    </div>
  );
}
