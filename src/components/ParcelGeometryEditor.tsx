1|"use client";
2|
3|import React, { useEffect, useRef, useState } from "react";
4|import { MapContainer, TileLayer, WMSTileLayer, useMap } from "react-leaflet";
5|import L from "leaflet";
6|import "leaflet/dist/leaflet.css";
7|import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
8|import area from "@turf/area";
9|import { polygon } from "@turf/helpers";
10|
11|delete (L.Icon.Default.prototype as any)._getIconUrl;
12|L.Icon.Default.mergeOptions({
13|  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
14|  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
15|  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
16|});
17|
18|// ──────────────────────────────────────────────────────────────────────────────
19|// Helpers
20|// ──────────────────────────────────────────────────────────────────────────────
21|
22|function latLngsToCoords(latlngs: L.LatLng[]): number[][] {
23|  const ring = latlngs.map((p) => [p.lng, p.lat]);
24|  // GeoJSON polygon ring must be closed
25|  if (ring.length > 0) ring.push(ring[0]);
26|  return ring;
27|}
28|
29|function computeAreaHa(coords: number[][]): number {
30|  if (coords.length < 4) return 0;
31|  try {
32|    const poly = polygon([coords]);
33|    return Math.round((area(poly) / 10000) * 10000) / 10000;
34|  } catch {
35|    return 0;
36|  }
37|}
38|
39|// ──────────────────────────────────────────────────────────────────────────────
40|// Inner map controller — loads Geoman, sets up events
41|// ──────────────────────────────────────────────────────────────────────────────
42|
43|interface GeomanControllerProps {
44|  initialGeometry?: object | null; // GeoJSON Polygon
45|  mode: "edit" | "draw";
46|  onUpdate: (coords: number[][], surfaceHa: number) => void;
47|}
48|
49|function GeomanController({ initialGeometry, mode, onUpdate }: GeomanControllerProps) {
50|  const map = useMap();
51|  const layerRef = useRef<L.Layer | null>(null);
52|  const satellite = useRef(true);
53|
54|  useEffect(() => {
55|    let gm: any;
56|    // Dynamic import so SSR doesn't choke
57|    import("@geoman-io/leaflet-geoman-free").then((mod) => {
58|      gm = mod.default ?? mod;
59|
60|      // Init Geoman on map
61|      if (!(map as any).pm) {
62|        (map as any).pm = new gm.Map(map);
63|      }
64|
65|      // ── Edit mode: load existing polygon then enable vertex edit ──
66|      if (mode === "edit" && initialGeometry) {
67|        const geojsonLayer = L.geoJSON(initialGeometry as GeoJSON.GeoJsonObject, {
68|          style: {
69|            color: "#22c55e",
70|            weight: 2,
71|            fillColor: "#22c55e",
72|            fillOpacity: 0.2,
73|          },
74|        });
75|        geojsonLayer.addTo(map);
76|        layerRef.current = geojsonLayer;
77|
78|        // Fit bounds
79|        const bounds = geojsonLayer.getBounds();
80|        if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] });
81|
82|        // Enable edit on the polygon layer
83|        geojsonLayer.eachLayer((layer) => {
84|          if ((layer as any).pm) {
85|            (layer as any).pm.enable({
86|              allowSelfIntersection: false,
87|              removeLayerBelowMinVertices: false,
88|            });
89|          }
90|        });
91|
92|        // Listen for vertex changes
93|        const emitUpdate = () => {
94|          geojsonLayer.eachLayer((layer) => {
95|            const latlngs = (layer as L.Polygon).getLatLngs();
96|            const ring = Array.isArray(latlngs[0]) ? (latlngs[0] as L.LatLng[]) : (latlngs as L.LatLng[]);
97|            const coords = latLngsToCoords(ring);
98|            onUpdate(coords, computeAreaHa(coords));
99|          });
100|        };
101|
102|        map.on("pm:edit", emitUpdate);
103|        map.on("pm:vertexadded", emitUpdate);
104|        map.on("pm:vertexremoved", emitUpdate);
105|        map.on("pm:markerdragend", emitUpdate);
106|      }
107|
108|      // ── Draw mode: free polygon drawing ──
109|      if (mode === "draw") {
110|        (map as any).pm.addControls({
111|          position: "topright",
112|          drawPolygon: true,
113|          drawMarker: false,
114|          drawPolyline: false,
115|          drawRectangle: false,
116|          drawCircle: false,
117|          drawCircleMarker: false,
118|          editMode: false,
119|          dragMode: false,
120|          cutPolygon: false,
121|          removalMode: false,
122|          rotateMode: false,
123|          drawText: false,
124|        });
125|
126|        // Centrer sur la zone ferme si pas de géométrie initiale
127|        map.setView([48.172, 7.141], 16);
128|
129|        map.on("pm:create", (e: any) => {
130|          const layer = e.layer as L.Polygon;
131|          // Remove previous drawing
132|          if (layerRef.current) map.removeLayer(layerRef.current);
133|          layerRef.current = layer;
134|
135|          const latlngs = layer.getLatLngs();
136|          const ring = Array.isArray(latlngs[0]) ? (latlngs[0] as L.LatLng[]) : (latlngs as L.LatLng[]);
137|          const coords = latLngsToCoords(ring);
138|          onUpdate(coords, computeAreaHa(coords));
139|
140|          // Style the drawn layer
141|          (layer as any).setStyle?.({
142|            color: "#22c55e",
143|            weight: 2,
144|            fillColor: "#22c55e",
145|            fillOpacity: 0.2,
146|          });
147|
148|          // Enable edit on newly drawn polygon
149|          if ((layer as any).pm) {
150|            (layer as any).pm.enable({ allowSelfIntersection: false });
151|          }
152|
153|          // Emit on further edits too
154|          const emitUpdate = () => {
155|            const latlngs2 = layer.getLatLngs();
156|            const ring2 = Array.isArray(latlngs2[0]) ? (latlngs2[0] as L.LatLng[]) : (latlngs2 as L.LatLng[]);
157|            const coords2 = latLngsToCoords(ring2);
158|            onUpdate(coords2, computeAreaHa(coords2));
159|          };
160|          map.on("pm:edit", emitUpdate);
161|          map.on("pm:markerdragend", emitUpdate);
162|        });
163|
164|        // Auto-start draw tool
165|        (map as any).pm.enableDraw("Polygon", {
166|          snappable: true,
167|          snapDistance: 15,
168|          allowSelfIntersection: false,
169|        });
170|      }
171|    });
172|
173|    return () => {
174|      // Cleanup
175|      if ((map as any).pm) {
176|        try {
177|          (map as any).pm.disableDraw?.();
178|          (map as any).pm.removeControls?.();
179|        } catch {}
180|      }
181|      map.off("pm:edit");
182|      map.off("pm:create");
183|      map.off("pm:vertexadded");
184|      map.off("pm:vertexremoved");
185|      map.off("pm:markerdragend");
186|    };
187|    // eslint-disable-next-line react-hooks/exhaustive-deps
188|  }, []);
189|
190|  return null;
191|}
192|
193|// ──────────────────────────────────────────────────────────────────────────────
194|// Public component
195|// ──────────────────────────────────────────────────────────────────────────────
196|
197|interface ParcelGeometryEditorProps {
198|  /** Existing geometry (edit mode) — null/undefined for new drawing */
199|  initialGeometry?: object | null;
200|  /** "edit" = move vertices of existing polygon. "draw" = draw from scratch */
201|  mode: "edit" | "draw";
202|  /** Called each time the polygon changes */
203|  onChange: (geometry: object, surfaceHa: number) => void;
204|}
205|
206|export default function ParcelGeometryEditor({
207|  initialGeometry,
208|  mode,
209|  onChange,
210|}: ParcelGeometryEditorProps) {
211|  const [surfaceHa, setSurfaceHa] = useState<number | null>(null);
212|  const [satellite, setSatellite] = useState(true);
213|
214|  const handleUpdate = (coords: number[][], ha: number) => {
215|    setSurfaceHa(ha);
216|    onChange({ type: "Polygon", coordinates: [coords] }, ha);
217|  };
218|
219|  return (
220|    <div className="flex flex-col gap-2">
221|      {/* Instructions */}
222|      <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
223|        {mode === "edit"
224|          ? "Déplacez les points (◇) pour ajuster les limites. Cliquez sur un côté pour ajouter un point."
225|          : "Cliquez pour placer les points du polygone. Double-cliquez ou cliquez sur le premier point pour fermer."}
226|      </div>
227|
228|      {/* Surface en temps réel */}
229|      {surfaceHa !== null && (
230|        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700 font-semibold">
231|          Surface calculée : {surfaceHa.toFixed(4)} ha ({(surfaceHa * 10000).toFixed(0)} m²)
232|        </div>
233|      )}
234|
235|      {/* Carte */}
236|      <div className="relative rounded-xl overflow-hidden border border-stone-200" style={{ height: "420px" }}>
237|        <button
238|          type="button"
239|          onClick={() => setSatellite((v) => !v)}
240|          className="absolute top-2 left-2 z-[1000] px-2 py-1 text-xs font-semibold bg-white border border-stone-300 rounded shadow-sm hover:bg-stone-50 transition-colors"
241|        >
242|          {satellite ? "🗺️ Plan" : "🛰️ Satellite"}
243|        </button>
244|        <MapContainer
245|          center={[48.172, 7.141]}
246|          zoom={15}
247|          style={{ height: "100%", width: "100%" }}
248|        >
249|          {satellite ? (
250|            <TileLayer
251|              url="https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&STYLE=normal&FORMAT=image/jpeg"
252|              attribution='&copy; <a href="https://www.geoportail.gouv.fr/">IGN</a>'
253|              maxNativeZoom={20}
254|              maxZoom={22}
255|            />
256|          ) : (
257|            <TileLayer
258|              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
259|              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
260|            />
261|          )}
262|          <WMSTileLayer
263|            url="https://data.geopf.fr/wms-r/wms"
264|            layers="CADASTRALPARCELS.PARCELLAIRE_EXPRESS"
265|            format="image/png"
266|            transparent={true}
267|            version="1.3.0"
268|            opacity={satellite ? 0.6 : 0.7}
269|            attribution='&copy; <a href="https://www.geoportail.gouv.fr/">IGN</a>'
270|          />
271|          <GeomanController
272|            initialGeometry={initialGeometry}
273|            mode={mode}
274|            onUpdate={handleUpdate}
275|          />
276|        </MapContainer>
277|      </div>
278|    </div>
279|  );
280|}
281|