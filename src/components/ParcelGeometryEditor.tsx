"use client";

import React, { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, WMSTileLayer, useMap } from "react-leaflet";

// Corrige le redimensionnement dans les modals (surtout PWA/mobile)
// On tire plusieurs fois à des délais croissants pour couvrir les animations de modal
function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const delays = [150, 500, 1000, 2000];
    const timers = delays.map((d) => setTimeout(() => map.invalidateSize(), d));
    return () => timers.forEach(clearTimeout);
  }, [map]);
  return null;
}
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import area from "@turf/area";
import { polygon } from "@turf/helpers";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function latLngsToCoords(latlngs: L.LatLng[]): number[][] {
  const ring = latlngs.map((p) => [p.lng, p.lat]);
  // GeoJSON polygon ring must be closed
  if (ring.length > 0) ring.push(ring[0]);
  return ring;
}

function computeAreaHa(coords: number[][]): number {
  if (coords.length < 4) return 0;
  try {
    const poly = polygon([coords]);
    return Math.round((area(poly) / 10000) * 10000) / 10000;
  } catch {
    return 0;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Inner map controller — loads Geoman, sets up events
// ──────────────────────────────────────────────────────────────────────────────

interface GeomanControllerProps {
  initialGeometry?: object | null; // GeoJSON Polygon
  mode: "edit" | "draw";
  onUpdate: (coords: number[][], surfaceHa: number) => void;
}

function GeomanController({ initialGeometry, mode, onUpdate }: GeomanControllerProps) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);
  const satellite = useRef(true);

  useEffect(() => {
    let gm: any;
    // Dynamic import so SSR doesn't choke
    import("@geoman-io/leaflet-geoman-free").then((mod) => {
      gm = mod.default ?? mod;

      // Init Geoman on map
      if (!(map as any).pm) {
        (map as any).pm = new gm.Map(map);
      }

      // ── Edit mode: load existing polygon then enable vertex edit ──
      if (mode === "edit" && initialGeometry) {
        const geojsonLayer = L.geoJSON(initialGeometry as GeoJSON.GeoJsonObject, {
          style: {
            color: "#22c55e",
            weight: 2,
            fillColor: "#22c55e",
            fillOpacity: 0.2,
          },
        });
        geojsonLayer.addTo(map);
        layerRef.current = geojsonLayer;

        // Fit bounds — et re-fit à chaque resize (invalidateSize déclenche "resize")
        const bounds = geojsonLayer.getBounds();
        const fitIfValid = () => {
          if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] });
        };
        fitIfValid();
        map.once("resize", fitIfValid);

        // Active le mode édition global → initialise pm sur tous les layers
        // et permet le drag des vertices immédiatement (sans clic sur bouton équerre)
        (map as any).pm.enableGlobalEditMode({
          allowSelfIntersection: false,
          removeLayerBelowMinVertices: false,
        });

        // Listen for vertex changes
        const emitUpdate = () => {
          geojsonLayer.eachLayer((layer) => {
            const latlngs = (layer as L.Polygon).getLatLngs();
            const ring = Array.isArray(latlngs[0]) ? (latlngs[0] as L.LatLng[]) : (latlngs as L.LatLng[]);
            const coords = latLngsToCoords(ring);
            onUpdate(coords, computeAreaHa(coords));
          });
        };

        map.on("pm:edit", emitUpdate);
        map.on("pm:vertexadded", emitUpdate);
        map.on("pm:vertexremoved", emitUpdate);
        map.on("pm:markerdragend", emitUpdate);
      }

      // ── Draw mode: free polygon drawing ──
      if (mode === "draw") {
        (map as any).pm.addControls({
          position: "topright",
          drawPolygon: true,
          drawMarker: false,
          drawPolyline: false,
          drawRectangle: false,
          drawCircle: false,
          drawCircleMarker: false,
          editMode: false,
          dragMode: false,
          cutPolygon: false,
          removalMode: false,
          rotateMode: false,
          drawText: false,
        });

        // Centrer sur la zone ferme si pas de géométrie initiale
        map.setView([48.172, 7.141], 16);

        map.on("pm:create", (e: any) => {
          const layer = e.layer as L.Polygon;
          // Remove previous drawing
          if (layerRef.current) map.removeLayer(layerRef.current);
          layerRef.current = layer;

          const latlngs = layer.getLatLngs();
          const ring = Array.isArray(latlngs[0]) ? (latlngs[0] as L.LatLng[]) : (latlngs as L.LatLng[]);
          const coords = latLngsToCoords(ring);
          onUpdate(coords, computeAreaHa(coords));

          // Style the drawn layer
          (layer as any).setStyle?.({
            color: "#22c55e",
            weight: 2,
            fillColor: "#22c55e",
            fillOpacity: 0.2,
          });

          // Enable edit on newly drawn polygon
          if ((layer as any).pm) {
            (layer as any).pm.enable({ allowSelfIntersection: false });
          }

          // Emit on further edits too
          const emitUpdate = () => {
            const latlngs2 = layer.getLatLngs();
            const ring2 = Array.isArray(latlngs2[0]) ? (latlngs2[0] as L.LatLng[]) : (latlngs2 as L.LatLng[]);
            const coords2 = latLngsToCoords(ring2);
            onUpdate(coords2, computeAreaHa(coords2));
          };
          map.on("pm:edit", emitUpdate);
          map.on("pm:markerdragend", emitUpdate);
        });

        // Auto-start draw tool
        (map as any).pm.enableDraw("Polygon", {
          snappable: true,
          snapDistance: 15,
          allowSelfIntersection: false,
        });
      }
    });

    return () => {
      // Cleanup
      if ((map as any).pm) {
        try {
          (map as any).pm.disableDraw?.();
          (map as any).pm.removeControls?.();
        } catch {}
      }
      map.off("pm:edit");
      map.off("pm:create");
      map.off("pm:vertexadded");
      map.off("pm:vertexremoved");
      map.off("pm:markerdragend");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Public component
// ──────────────────────────────────────────────────────────────────────────────

interface ParcelGeometryEditorProps {
  /** Existing geometry (edit mode) — null/undefined for new drawing */
  initialGeometry?: object | null;
  /** "edit" = move vertices of existing polygon. "draw" = draw from scratch */
  mode: "edit" | "draw";
  /** Called each time the polygon changes */
  onChange: (geometry: object, surfaceHa: number) => void;
}

export default function ParcelGeometryEditor({
  initialGeometry,
  mode,
  onChange,
}: ParcelGeometryEditorProps) {
  const [surfaceHa, setSurfaceHa] = useState<number | null>(null);
  const [satellite, setSatellite] = useState(true);

  const handleUpdate = (coords: number[][], ha: number) => {
    setSurfaceHa(ha);
    onChange({ type: "Polygon", coordinates: [coords] }, ha);
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
        {mode === "edit"
          ? "Déplacez les points (◇) pour ajuster les limites. Cliquez sur un côté pour ajouter un point."
          : "Cliquez pour placer les points du polygone. Double-cliquez ou cliquez sur le premier point pour fermer."}
      </div>

      {/* Surface en temps réel */}
      {surfaceHa !== null && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700 font-semibold">
          Surface calculée : {surfaceHa.toFixed(4)} ha ({(surfaceHa * 10000).toFixed(0)} m²)
        </div>
      )}

      {/* Carte */}
      <div className="relative rounded-xl overflow-hidden border border-stone-200" style={{ height: "min(420px, 55svh)" }}>
        <button
          type="button"
          onClick={() => setSatellite((v) => !v)}
          className="absolute top-2 left-2 z-[1000] px-2 py-1 text-xs font-semibold bg-white border border-stone-300 rounded shadow-sm hover:bg-stone-50 transition-colors"
        >
          {satellite ? "🗺️ Plan" : "🛰️ Satellite"}
        </button>
        <MapContainer
          center={[48.172, 7.141]}
          zoom={15}
          style={{ height: "100%", width: "100%" }}
        >
          {satellite ? (
            <TileLayer
              url="https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&STYLE=normal&FORMAT=image/jpeg"
              attribution='&copy; <a href="https://www.geoportail.gouv.fr/">IGN</a>'
              maxNativeZoom={20}
              maxZoom={22}
            />
          ) : (
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          )}
          <WMSTileLayer
            url="https://data.geopf.fr/wms-r/wms"
            layers="CADASTRALPARCELS.PARCELLAIRE_EXPRESS"
            format="image/png"
            transparent={true}
            version="1.3.0"
            opacity={satellite ? 0.6 : 0.7}
            attribution='&copy; <a href="https://www.geoportail.gouv.fr/">IGN</a>'
          />
          <MapResizer />
          <GeomanController
            initialGeometry={initialGeometry}
            mode={mode}
            onUpdate={handleUpdate}
          />
        </MapContainer>
      </div>
    </div>
  );
}
