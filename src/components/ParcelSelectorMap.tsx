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
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

interface ParcelSelectorMapProps {
  partiels: Partiel[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}

export default function ParcelSelectorMap({ partiels, selectedIds, onToggle }: ParcelSelectorMapProps) {
  const withGeometry = partiels.filter((p) => p.geometry);
  const withoutGeometry = partiels.filter((p) => !p.geometry);

  return (
    <div className="flex flex-col gap-3">
      {withGeometry.length > 0 ? (
        <>
          <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: "300px" }}>
            <MapContainer center={[46.5, 2.3]} zoom={6} style={{ height: "100%", width: "100%" }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <WMSTileLayer
                url="https://wxs.ign.fr/essentiels/geoportail/r/wms"
                layers="CADASTRALPARCELS.PARCELLAIRE_EXPRESS"
                format="image/png"
                transparent={true}
                version="1.3.0"
                opacity={0.5}
                attribution="&copy; IGN"
              />
              {withGeometry.map((p) => {
                const isSelected = selectedIds.includes(p.id);
                return (
                  <GeoJSON
                    key={`${p.id}-${isSelected}`}
                    data={p.geometry as GeoJSON.GeoJsonObject}
                    style={{
                      color: isSelected ? "#22c55e" : "#3b82f6",
                      weight: 2,
                      fillColor: isSelected ? "#22c55e" : "#3b82f6",
                      fillOpacity: isSelected ? 0.4 : 0.15,
                    }}
                    eventHandlers={{ click: () => onToggle(p.id) }}
                    onEachFeature={(_, layer) => {
                      layer.bindTooltip(p.nom, { sticky: true });
                    }}
                  />
                );
              })}
              <FitBounds partiels={partiels} />
            </MapContainer>
          </div>

          <div className="flex flex-wrap gap-2">
            {withGeometry.map((p) => {
              const isSelected = selectedIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onToggle(p.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-green-100 border-green-400 text-green-800"
                      : "bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {isSelected ? "✓ " : ""}
                  {p.nom}
                  {p.surface ? ` (${p.surface.toFixed(2)} ha)` : ""}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Aucun partiel avec géométrie cadastrale. Utilisez le bouton 📍 Cadastre dans la page Partiels.
        </p>
      )}

      {withoutGeometry.length > 0 && (
        <div>
          {withGeometry.length > 0 && (
            <p className="text-xs text-gray-400 mb-1.5">Sans géométrie cadastrale :</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {withoutGeometry.map((p) => (
              <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(p.id)}
                  onChange={() => onToggle(p.id)}
                  className="accent-primary"
                />
                <span className="text-sm text-gray-700">{p.nom}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
