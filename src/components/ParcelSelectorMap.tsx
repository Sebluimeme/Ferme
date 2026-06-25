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
          <p className="text-[11px] text-stone-400">Cliquez sur une parcelle pour la sélectionner / désélectionner.</p>
          <div className="rounded-xl overflow-hidden border border-stone-200" style={{ height: "300px" }}>
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
                      color: isSelected ? "#33935e" : "#3b82f6",
                      weight: isSelected ? 3 : 2,
                      fillColor: isSelected ? "#33935e" : "#3b82f6",
                      fillOpacity: isSelected ? 0.45 : 0.12,
                    }}
                    eventHandlers={{ click: () => onToggle(p.id) }}
                    onEachFeature={(_, layer) => {
                      const label = p.surface
                        ? `${p.nom} (${p.surface.toFixed(2)} ha)`
                        : p.nom;
                      layer.bindTooltip(label, { sticky: true, className: "leaflet-tooltip-parcelle" });
                    }}
                  />
                );
              })}
              <FitBounds partiels={partiels} />
            </MapContainer>
          </div>

          {/* Résumé des parcelles sélectionnées */}
          {selectedIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedIds
                .map((id) => partiels.find((p) => p.id === id))
                .filter(Boolean)
                .map((p) => (
                  <span
                    key={p!.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200 rounded-full"
                  >
                    {p!.nom}
                    {p!.surface ? ` · ${p!.surface.toFixed(2)} ha` : ""}
                    <button
                      type="button"
                      onClick={() => onToggle(p!.id)}
                      className="ml-0.5 text-brand-400 hover:text-brand-700 cursor-pointer leading-none"
                    >
                      ×
                    </button>
                  </span>
                ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Aucun partiel avec géométrie cadastrale. Utilisez le bouton 📍 Cadastre dans la page Partiels.
        </p>
      )}

      {/* Parcelles sans géométrie : checkboxes uniquement */}
      {withoutGeometry.length > 0 && (
        <div>
          {withGeometry.length > 0 && (
            <p className="text-xs text-stone-400 mb-1.5">Sans géométrie cadastrale :</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {withoutGeometry.map((p) => (
              <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(p.id)}
                  onChange={() => onToggle(p.id)}
                  className="accent-brand-500"
                />
                <span className="text-sm text-stone-700">{p.nom}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
