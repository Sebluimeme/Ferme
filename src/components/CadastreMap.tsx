"use client";

import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, WMSTileLayer, GeoJSON, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet default icon issue in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export interface CadastreSelectData {
  nom: string;
  surface: number; // en hectares
  cadastreRef: string;
  codeInsee: string;
  section: string;
  numeroParcelle: string;
  geometry: object;
}

interface ParcelleInfo {
  codeInsee: string;
  section: string;
  numero: string;
  contenance: number; // m²
  nomCommune: string;
  geometry: GeoJSON.Geometry;
  feature: GeoJSON.Feature;
}

interface CadastreMapProps {
  onSelect: (data: CadastreSelectData) => void;
  onClose: () => void;
}

function ClickHandler({
  onMapClick,
}: {
  onMapClick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function CadastreMap({ onSelect, onClose }: CadastreMapProps) {
  const [selectedParcelle, setSelectedParcelle] = useState<ParcelleInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMapClick = async (lat: number, lng: number) => {
    setLoading(true);
    setError(null);
    setSelectedParcelle(null);

    try {
      const geom = JSON.stringify({ type: "Point", coordinates: [lng, lat] });
      const url = `https://apicarto.ign.fr/api/cadastre/parcelle?geom=${encodeURIComponent(geom)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Erreur API cadastre (${res.status})`);
      const data = await res.json();

      if (!data.features || data.features.length === 0) {
        setError("Aucune parcelle trouvée à cet emplacement. Essayez de zoomer davantage.");
        setLoading(false);
        return;
      }

      const feature = data.features[0];
      const props = feature.properties;

      setSelectedParcelle({
        codeInsee: props.code_com || props.code_arr || "",
        section: props.section || "",
        numero: props.numero || "",
        contenance: props.contenance || 0,
        nomCommune: props.nom_com || "",
        geometry: feature.geometry,
        feature: feature,
      });
    } catch (err: any) {
      setError(err.message || "Erreur lors de l'identification de la parcelle.");
    } finally {
      setLoading(false);
    }
  };

  const handleValider = () => {
    if (!selectedParcelle) return;
    const surfaceHa = selectedParcelle.contenance / 10000;
    const cadastreRef = `${selectedParcelle.codeInsee}/${selectedParcelle.section}/${selectedParcelle.numero}`;
    const nom = `Parcelle ${selectedParcelle.section}${selectedParcelle.numero}`;

    onSelect({
      nom,
      surface: Math.round(surfaceHa * 10000) / 10000,
      cadastreRef,
      codeInsee: selectedParcelle.codeInsee,
      section: selectedParcelle.section,
      numeroParcelle: selectedParcelle.numero,
      geometry: selectedParcelle.geometry,
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 mb-3 text-sm text-blue-700">
        Cliquez sur une parcelle pour l&apos;identifier. Zoomez pour voir les parcelles cadastrales.
      </div>

      {/* Loading/Error */}
      {loading && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2 mb-3 text-sm text-yellow-700">
          Identification de la parcelle...
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 mb-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Parcelle sélectionnée */}
      {selectedParcelle && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm">
              <p className="font-semibold text-green-800 mb-1">
                Parcelle {selectedParcelle.section} {selectedParcelle.numero}
              </p>
              <p className="text-green-700">
                Commune : {selectedParcelle.nomCommune} ({selectedParcelle.codeInsee})
              </p>
              <p className="text-green-700">
                Surface : {(selectedParcelle.contenance / 10000).toFixed(4)} ha ({selectedParcelle.contenance} m²)
              </p>
            </div>
            <button
              onClick={handleValider}
              className="shrink-0 px-4 py-2 text-sm font-semibold text-white rounded-lg bg-gradient-to-br from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 cursor-pointer shadow-sm"
            >
              Valider cette parcelle
            </button>
          </div>
        </div>
      )}

      {/* Carte */}
      <div className="flex-1 rounded-xl overflow-hidden border border-gray-200" style={{ minHeight: "420px" }}>
        <MapContainer
          center={[46.5, 2.3]}
          zoom={6}
          style={{ height: "100%", width: "100%" }}
        >
          {/* Fond OSM */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Overlay cadastral IGN */}
          <WMSTileLayer
            url="https://wxs.ign.fr/essentiels/geoportail/r/wms"
            layers="CADASTRALPARCELS.PARCELLAIRE_EXPRESS"
            format="image/png"
            transparent={true}
            version="1.3.0"
            opacity={0.7}
            attribution='&copy; <a href="https://www.geoportail.gouv.fr/">IGN</a>'
          />

          {/* Parcelle sélectionnée en surbrillance */}
          {selectedParcelle && (
            <GeoJSON
              key={`${selectedParcelle.codeInsee}-${selectedParcelle.section}-${selectedParcelle.numero}`}
              data={selectedParcelle.feature}
              style={{
                color: "#22c55e",
                weight: 3,
                fillColor: "#22c55e",
                fillOpacity: 0.3,
              }}
            />
          )}

          <ClickHandler onMapClick={handleMapClick} />
        </MapContainer>
      </div>
    </div>
  );
}
