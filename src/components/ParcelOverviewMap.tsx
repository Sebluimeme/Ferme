"use client";

import React, { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, WMSTileLayer, GeoJSON, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Partiel } from "@/types/fourrage";
import type { CadastreSelectData } from "@/components/CadastreMap";

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

interface CadastreClickHandlerProps {
  onMapClick: (lat: number, lng: number) => void;
}
function CadastreClickHandler({ onMapClick }: CadastreClickHandlerProps) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function parcelColor(type?: string) {
  if (type === "pature") return { color: "#16a34a", fill: "#22c55e" };
  if (type === "fauche") return { color: "#ca8a04", fill: "#facc15" };
  return { color: "#3b82f6", fill: "#93c5fd" };
}

interface CadastreInfo {
  section: string;
  numero: string;
  nomCommune: string;
  codeInsee: string;
  surfaceHa: number;
  geometry: GeoJSON.Geometry;
  feature: GeoJSON.Feature;
}

interface Props {
  partiels: Partiel[];
  onDoubleClick?: (partiel: Partiel) => void;
  onSplit?: (partiel: Partiel) => void;
  onDelete?: (partiel: Partiel) => void;
  onAdd?: (data: CadastreSelectData) => void;
}

export default function ParcelOverviewMap({ partiels, onDoubleClick, onSplit, onDelete, onAdd }: Props) {
  const [satellite, setSatellite] = useState(true);
  const [selectedPartiel, setSelectedPartiel] = useState<Partiel | null>(null);
  const [cadastreInfo, setCadastreInfo] = useState<CadastreInfo | null>(null);
  const [cadastreLoading, setCadastreLoading] = useState(false);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const withGeo = partiels.filter((p) => p.geometry);

  const handleMapClick = async (lat: number, lng: number) => {
    // Si un clic sur une parcelle connue est en cours (via GeoJSON), on ignore
    // (le stopPropagation sur GeoJSON empêche ce handler de se déclencher)
    setSelectedPartiel(null);
    setCadastreLoading(true);
    setCadastreInfo(null);
    try {
      const geom = JSON.stringify({ type: "Point", coordinates: [lng, lat] });
      const url = `https://apicarto.ign.fr/api/cadastre/parcelle?geom=${encodeURIComponent(geom)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (!data.features?.length) { setCadastreLoading(false); return; }
      const feature = data.features[0];
      const props = feature.properties;
      setCadastreInfo({
        section: props.section || "",
        numero: props.numero || "",
        nomCommune: props.nom_com || "",
        codeInsee: props.code_com || props.code_arr || "",
        surfaceHa: Math.round((props.contenance || 0)) / 10000,
        geometry: feature.geometry,
        feature,
      });
    } catch {
      // Pas de parcelle ou erreur silencieuse
    }
    setCadastreLoading(false);
  };

  const handleAddCadastre = () => {
    if (!cadastreInfo || !onAdd) return;
    const cadastreRef = `${cadastreInfo.codeInsee}/${cadastreInfo.section}/${cadastreInfo.numero}`;
    onAdd({
      nom: `Parcelle ${cadastreInfo.section}${cadastreInfo.numero}`,
      surface: Math.round(cadastreInfo.surfaceHa * 10000) / 10000,
      cadastreRef,
      codeInsee: cadastreInfo.codeInsee,
      section: cadastreInfo.section,
      numeroParcelle: cadastreInfo.numero,
      geometry: cadastreInfo.geometry,
    });
    setCadastreInfo(null);
  };

  // Vérifie si la parcelle cadastrale est déjà dans la DB
  const dejaAjoutee = cadastreInfo
    ? partiels.some(
        (p) =>
          p.section === cadastreInfo.section &&
          p.numeroParcelle === cadastreInfo.numero &&
          p.codeInsee === cadastreInfo.codeInsee
      )
    : false;

  if (withGeo.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-stone-100 shadow-sm p-6 text-center text-stone-400">
        <div className="text-3xl mb-2">🗺️</div>
        <p className="text-sm">Aucune parcelle avec géométrie cadastrale.</p>
        <p className="text-xs mt-1">Cliquez sur &quot;+ Nouvelle parcelle&quot; pour importer des parcelles depuis le cadastre.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-stone-100 shadow-sm overflow-hidden">
      <div className="relative rounded-xl overflow-hidden" style={{ height: "550px" }}>
        <button
          onClick={() => setSatellite(!satellite)}
          className="absolute top-2 right-2 z-[1000] px-2 py-1 text-xs font-semibold bg-white border border-stone-300 rounded shadow-sm hover:bg-stone-50 transition-colors"
        >
          {satellite ? "🗺️ Plan" : "🛰️ Satellite"}
        </button>

        {cadastreLoading && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] px-3 py-1.5 text-xs font-semibold bg-white border border-stone-300 rounded-full shadow-sm text-stone-600">
            Identification...
          </div>
        )}

        <MapContainer center={[48.172, 7.141]} zoom={14} style={{ height: "100%", width: "100%" }}>
          {satellite ? (
            <TileLayer
              url="https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&STYLE=normal&FORMAT=image/jpeg"
              attribution='&copy; <a href="https://www.geoportail.gouv.fr/">IGN</a>'
              maxNativeZoom={20}
              maxZoom={22}
            />
          ) : (
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          )}
          <WMSTileLayer
            url="https://data.geopf.fr/wms-r/wms"
            layers="CADASTRALPARCELS.PARCELLAIRE_EXPRESS"
            format="image/png"
            transparent={true}
            version="1.3.0"
            opacity={satellite ? 0.6 : 0.4}
            attribution="&copy; IGN"
          />

          {/* Parcelles déjà dans la DB */}
          {withGeo.map((p) => {
            const isSelected = selectedPartiel?.id === p.id;
            const { color, fill } = parcelColor(p.type);
            return (
              <GeoJSON
                key={p.id}
                data={p.geometry as GeoJSON.GeoJsonObject}
                style={{
                  color: isSelected ? "#1d4ed8" : color,
                  weight: isSelected ? 3.5 : 2.5,
                  fillColor: isSelected ? "#3b82f6" : fill,
                  fillOpacity: isSelected ? 0.55 : 0.35,
                }}
                onEachFeature={(_, layer) => {
                  const label = p.surface
                    ? `<strong>${p.nom}</strong><br/>${p.surface} ha`
                    : `<strong>${p.nom}</strong>`;
                  layer.bindTooltip(label, { sticky: false, permanent: false, direction: "center" });

                  layer.on("click", (e) => {
                    L.DomEvent.stopPropagation(e);
                    setCadastreInfo(null);
                    if (clickTimerRef.current) {
                      clearTimeout(clickTimerRef.current);
                      clickTimerRef.current = null;
                    }
                    clickTimerRef.current = setTimeout(() => {
                      clickTimerRef.current = null;
                      setSelectedPartiel((prev) => (prev?.id === p.id ? null : p));
                    }, 280);
                  });

                  layer.on("dblclick", (e) => {
                    L.DomEvent.stopPropagation(e);
                    if (clickTimerRef.current) {
                      clearTimeout(clickTimerRef.current);
                      clickTimerRef.current = null;
                    }
                    setSelectedPartiel(null);
                    if (onDoubleClick) onDoubleClick(p);
                  });
                }}
              />
            );
          })}

          {/* Parcelle cadastrale cliquée (non dans DB) mise en surbrillance */}
          {cadastreInfo && (
            <GeoJSON
              key={`cadastre-${cadastreInfo.codeInsee}-${cadastreInfo.section}-${cadastreInfo.numero}`}
              data={cadastreInfo.feature}
              style={{
                color: "#8b5cf6",
                weight: 3,
                fillColor: "#8b5cf6",
                fillOpacity: 0.25,
              }}
            />
          )}

          <CadastreClickHandler onMapClick={handleMapClick} />
          <FitBounds partiels={partiels} />
        </MapContainer>

        {/* Panneau — parcelle DB sélectionnée */}
        {selectedPartiel && (
          <div className="absolute bottom-0 left-0 right-0 z-[1000] bg-white border-t border-stone-200 shadow-lg px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-stone-900 text-sm">{selectedPartiel.nom}</span>
                  {selectedPartiel.surface != null && (
                    <span className="text-xs font-semibold text-brand-600">{selectedPartiel.surface} ha</span>
                  )}
                  {selectedPartiel.type && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      selectedPartiel.type === "pature"
                        ? "bg-green-100 text-green-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}>
                      {selectedPartiel.type === "pature" ? "🐄 Pâture" : "🌾 Fauche"}
                    </span>
                  )}
                </div>
                {selectedPartiel.cadastreRef && (
                  <p className="text-xs text-stone-400 font-mono mt-0.5">{selectedPartiel.cadastreRef}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {selectedPartiel.geometry && onSplit && (
                  <button
                    onClick={() => { onSplit(selectedPartiel); setSelectedPartiel(null); }}
                    className="px-2.5 py-1.5 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 cursor-pointer transition-colors"
                  >
                    ✂️ Diviser
                  </button>
                )}
                {onDoubleClick && (
                  <button
                    onClick={() => { onDoubleClick(selectedPartiel); setSelectedPartiel(null); }}
                    className="px-2.5 py-1.5 text-xs font-semibold bg-stone-50 text-stone-700 border border-stone-200 rounded-lg hover:bg-stone-100 cursor-pointer transition-colors"
                  >
                    ✏️ Modifier
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => { onDelete(selectedPartiel); setSelectedPartiel(null); }}
                    className="px-2.5 py-1.5 text-xs font-semibold bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 cursor-pointer transition-colors"
                  >
                    🗑️ Supprimer
                  </button>
                )}
                <button
                  onClick={() => setSelectedPartiel(null)}
                  className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg cursor-pointer transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Panneau — parcelle cadastrale cliquée (pas dans DB) */}
        {cadastreInfo && !selectedPartiel && (
          <div className="absolute bottom-0 left-0 right-0 z-[1000] bg-white border-t border-stone-200 shadow-lg px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-stone-900 text-sm">
                    Parcelle {cadastreInfo.section} {cadastreInfo.numero}
                  </span>
                  <span className="text-xs font-semibold text-purple-600">
                    {cadastreInfo.surfaceHa.toFixed(4)} ha
                  </span>
                  {dejaAjoutee && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                      ✓ Dans votre parcellaire
                    </span>
                  )}
                </div>
                <p className="text-xs text-stone-400 mt-0.5">
                  {cadastreInfo.nomCommune} · {cadastreInfo.codeInsee}/{cadastreInfo.section}/{cadastreInfo.numero}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!dejaAjoutee && onAdd && (
                  <button
                    onClick={handleAddCadastre}
                    className="px-3 py-1.5 text-xs font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700 cursor-pointer transition-colors shadow-sm"
                  >
                    + Ajouter cette parcelle
                  </button>
                )}
                <button
                  onClick={() => setCadastreInfo(null)}
                  className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg cursor-pointer transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Légende */}
      <div className="px-4 py-2.5 border-t border-stone-100 flex gap-4 text-xs text-stone-500 flex-wrap">
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
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-purple-300 border border-purple-500" />
          Cadastre (non ajouté)
        </span>
        <span className="ml-auto text-stone-400 text-xs italic">Cliquez sur une parcelle pour l&apos;identifier</span>
        <span className="text-stone-400">{withGeo.length} parcelle{withGeo.length > 1 ? "s" : ""} affichée{withGeo.length > 1 ? "s" : ""}</span>
      </div>
    </div>
  );
}
