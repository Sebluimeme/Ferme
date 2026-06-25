1|"use client";
2|
3|import React, { useEffect, useState, useRef } from "react";
4|import { MapContainer, TileLayer, WMSTileLayer, GeoJSON, useMap, useMapEvents } from "react-leaflet";
5|import L from "leaflet";
6|import "leaflet/dist/leaflet.css";
7|import type { Partiel } from "@/types/fourrage";
8|import type { CadastreSelectData } from "@/components/CadastreMap";
9|
10|delete (L.Icon.Default.prototype as any)._getIconUrl;
11|L.Icon.Default.mergeOptions({
12|  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
13|  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
14|  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
15|});
16|
17|function FitBounds({ partiels }: { partiels: Partiel[] }) {
18|  const map = useMap();
19|  useEffect(() => {
20|    const withGeo = partiels.filter((p) => p.geometry);
21|    if (withGeo.length === 0) return;
22|    const fc: GeoJSON.FeatureCollection = {
23|      type: "FeatureCollection",
24|      features: withGeo.map((p) => ({
25|        type: "Feature",
26|        properties: {},
27|        geometry: p.geometry as GeoJSON.Geometry,
28|      })),
29|    };
30|    const layer = L.geoJSON(fc);
31|    const bounds = layer.getBounds();
32|    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] });
33|    // eslint-disable-next-line react-hooks/exhaustive-deps
34|  }, []);
35|  return null;
36|}
37|
38|interface CadastreClickHandlerProps {
39|  onMapClick: (lat: number, lng: number) => void;
40|}
41|function CadastreClickHandler({ onMapClick }: CadastreClickHandlerProps) {
42|  useMapEvents({
43|    click(e) {
44|      onMapClick(e.latlng.lat, e.latlng.lng);
45|    },
46|  });
47|  return null;
48|}
49|
50|function parcelColor(type?: string) {
51|  if (type === "pature") return { color: "#16a34a", fill: "#22c55e" };
52|  if (type === "fauche") return { color: "#ca8a04", fill: "#facc15" };
53|  return { color: "#3b82f6", fill: "#93c5fd" };
54|}
55|
56|interface CadastreInfo {
57|  section: string;
58|  numero: string;
59|  nomCommune: string;
60|  codeInsee: string;
61|  surfaceHa: number;
62|  geometry: GeoJSON.Geometry;
63|  feature: GeoJSON.Feature;
64|}
65|
66|interface Props {
67|  partiels: Partiel[];
68|  onDoubleClick?: (partiel: Partiel) => void;
69|  onSplit?: (partiel: Partiel) => void;
70|  onDelete?: (partiel: Partiel) => void;
71|  onAdd?: (data: CadastreSelectData) => void;
72|}
73|
74|export default function ParcelOverviewMap({ partiels, onDoubleClick, onSplit, onDelete, onAdd }: Props) {
75|  const [satellite, setSatellite] = useState(true);
76|  const [selectedPartiel, setSelectedPartiel] = useState<Partiel | null>(null);
77|  const [cadastreInfo, setCadastreInfo] = useState<CadastreInfo | null>(null);
78|  const [cadastreLoading, setCadastreLoading] = useState(false);
79|  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
80|  const withGeo = partiels.filter((p) => p.geometry);
81|
82|  const handleMapClick = async (lat: number, lng: number) => {
83|    // Si un clic sur une parcelle connue est en cours (via GeoJSON), on ignore
84|    // (le stopPropagation sur GeoJSON empêche ce handler de se déclencher)
85|    setSelectedPartiel(null);
86|    setCadastreLoading(true);
87|    setCadastreInfo(null);
88|    try {
89|      const geom = JSON.stringify({ type: "Point", coordinates: [lng, lat] });
90|      const url = `https://apicarto.ign.fr/api/cadastre/parcelle?geom=${encodeURIComponent(geom)}`;
91|      const res = await fetch(url);
92|      if (!res.ok) throw new Error();
93|      const data = await res.json();
94|      if (!data.features?.length) { setCadastreLoading(false); return; }
95|      const feature = data.features[0];
96|      const props = feature.properties;
97|      setCadastreInfo({
98|        section: props.section || "",
99|        numero: props.numero || "",
100|        nomCommune: props.nom_com || "",
101|        codeInsee: props.code_com || props.code_arr || "",
102|        surfaceHa: Math.round((props.contenance || 0)) / 10000,
103|        geometry: feature.geometry,
104|        feature,
105|      });
106|    } catch {
107|      // Pas de parcelle ou erreur silencieuse
108|    }
109|    setCadastreLoading(false);
110|  };
111|
112|  const handleAddCadastre = () => {
113|    if (!cadastreInfo || !onAdd) return;
114|    const cadastreRef = `${cadastreInfo.codeInsee}/${cadastreInfo.section}/${cadastreInfo.numero}`;
115|    onAdd({
116|      nom: `Parcelle ${cadastreInfo.section}${cadastreInfo.numero}`,
117|      surface: Math.round(cadastreInfo.surfaceHa * 10000) / 10000,
118|      cadastreRef,
119|      codeInsee: cadastreInfo.codeInsee,
120|      section: cadastreInfo.section,
121|      numeroParcelle: cadastreInfo.numero,
122|      geometry: cadastreInfo.geometry,
123|    });
124|    setCadastreInfo(null);
125|  };
126|
127|  // Vérifie si la parcelle cadastrale est déjà dans la DB
128|  const dejaAjoutee = cadastreInfo
129|    ? partiels.some(
130|        (p) =>
131|          p.section === cadastreInfo.section &&
132|          p.numeroParcelle === cadastreInfo.numero &&
133|          p.codeInsee === cadastreInfo.codeInsee
134|      )
135|    : false;
136|
137|  if (withGeo.length === 0) {
138|    return (
139|      <div className="bg-white rounded-xl border border-stone-100 shadow-sm p-6 text-center text-stone-400">
140|        <div className="text-3xl mb-2">🗺️</div>
141|        <p className="text-sm">Aucune parcelle avec géométrie cadastrale.</p>
142|        <p className="text-xs mt-1">Cliquez sur &quot;+ Nouvelle parcelle&quot; pour importer des parcelles depuis le cadastre.</p>
143|      </div>
144|    );
145|  }
146|
147|  return (
148|    <div className="bg-white rounded-xl border border-stone-100 shadow-sm overflow-hidden">
149|      <div className="relative rounded-xl overflow-hidden" style={{ height: "550px" }}>
150|        <button
151|          onClick={() => setSatellite(!satellite)}
152|          className="absolute top-2 right-2 z-[1000] px-2 py-1 text-xs font-semibold bg-white border border-stone-300 rounded shadow-sm hover:bg-stone-50 transition-colors"
153|        >
154|          {satellite ? "🗺️ Plan" : "🛰️ Satellite"}
155|        </button>
156|
157|        {cadastreLoading && (
158|          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] px-3 py-1.5 text-xs font-semibold bg-white border border-stone-300 rounded-full shadow-sm text-stone-600">
159|            Identification...
160|          </div>
161|        )}
162|
163|        <MapContainer center={[48.172, 7.141]} zoom={14} style={{ height: "100%", width: "100%" }}>
164|          {satellite ? (
165|            <TileLayer
166|              url="https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&STYLE=normal&FORMAT=image/jpeg"
167|              attribution='&copy; <a href="https://www.geoportail.gouv.fr/">IGN</a>'
168|              maxNativeZoom={20}
169|              maxZoom={22}
170|            />
171|          ) : (
172|            <TileLayer
173|              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
174|              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
175|            />
176|          )}
177|          <WMSTileLayer
178|            url="https://data.geopf.fr/wms-r/wms"
179|            layers="CADASTRALPARCELS.PARCELLAIRE_EXPRESS"
180|            format="image/png"
181|            transparent={true}
182|            version="1.3.0"
183|            opacity={satellite ? 0.6 : 0.4}
184|            attribution="&copy; IGN"
185|          />
186|
187|          {/* Parcelles déjà dans la DB */}
188|          {withGeo.map((p) => {
189|            const isSelected = selectedPartiel?.id === p.id;
190|            const { color, fill } = parcelColor(p.type);
191|            return (
192|              <GeoJSON
193|                key={p.id}
194|                data={p.geometry as GeoJSON.GeoJsonObject}
195|                style={{
196|                  color: isSelected ? "#1d4ed8" : color,
197|                  weight: isSelected ? 3.5 : 2.5,
198|                  fillColor: isSelected ? "#3b82f6" : fill,
199|                  fillOpacity: isSelected ? 0.55 : 0.35,
200|                }}
201|                onEachFeature={(_, layer) => {
202|                  const label = p.surface
203|                    ? `<strong>${p.nom}</strong><br/>${p.surface} ha`
204|                    : `<strong>${p.nom}</strong>`;
205|                  layer.bindTooltip(label, { sticky: false, permanent: false, direction: "center" });
206|
207|                  layer.on("click", (e) => {
208|                    L.DomEvent.stopPropagation(e);
209|                    setCadastreInfo(null);
210|                    if (clickTimerRef.current) {
211|                      clearTimeout(clickTimerRef.current);
212|                      clickTimerRef.current = null;
213|                    }
214|                    clickTimerRef.current = setTimeout(() => {
215|                      clickTimerRef.current = null;
216|                      setSelectedPartiel((prev) => (prev?.id === p.id ? null : p));
217|                    }, 280);
218|                  });
219|
220|                  layer.on("dblclick", (e) => {
221|                    L.DomEvent.stopPropagation(e);
222|                    if (clickTimerRef.current) {
223|                      clearTimeout(clickTimerRef.current);
224|                      clickTimerRef.current = null;
225|                    }
226|                    setSelectedPartiel(null);
227|                    if (onDoubleClick) onDoubleClick(p);
228|                  });
229|                }}
230|              />
231|            );
232|          })}
233|
234|          {/* Parcelle cadastrale cliquée (non dans DB) mise en surbrillance */}
235|          {cadastreInfo && (
236|            <GeoJSON
237|              key={`cadastre-${cadastreInfo.codeInsee}-${cadastreInfo.section}-${cadastreInfo.numero}`}
238|              data={cadastreInfo.feature}
239|              style={{
240|                color: "#8b5cf6",
241|                weight: 3,
242|                fillColor: "#8b5cf6",
243|                fillOpacity: 0.25,
244|              }}
245|            />
246|          )}
247|
248|          <CadastreClickHandler onMapClick={handleMapClick} />
249|          <FitBounds partiels={partiels} />
250|        </MapContainer>
251|
252|        {/* Panneau — parcelle DB sélectionnée */}
253|        {selectedPartiel && (
254|          <div className="absolute bottom-0 left-0 right-0 z-[1000] bg-white border-t border-stone-200 shadow-lg px-4 py-3">
255|            <div className="flex items-start justify-between gap-2">
256|              <div className="flex-1 min-w-0">
257|                <div className="flex items-center gap-2 flex-wrap">
258|                  <span className="font-bold text-stone-900 text-sm">{selectedPartiel.nom}</span>
259|                  {selectedPartiel.surface != null && (
260|                    <span className="text-xs font-semibold text-brand-600">{selectedPartiel.surface} ha</span>
261|                  )}
262|                  {selectedPartiel.type && (
263|                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
264|                      selectedPartiel.type === "pature"
265|                        ? "bg-green-100 text-green-700"
266|                        : "bg-yellow-100 text-yellow-700"
267|                    }`}>
268|                      {selectedPartiel.type === "pature" ? "🐄 Pâture" : "🌾 Fauche"}
269|                    </span>
270|                  )}
271|                </div>
272|                {selectedPartiel.cadastreRef && (
273|                  <p className="text-xs text-stone-400 font-mono mt-0.5">{selectedPartiel.cadastreRef}</p>
274|                )}
275|              </div>
276|              <div className="flex items-center gap-1 shrink-0">
277|                {selectedPartiel.geometry && onSplit && (
278|                  <button
279|                    onClick={() => { onSplit(selectedPartiel); setSelectedPartiel(null); }}
280|                    className="px-2.5 py-1.5 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 cursor-pointer transition-colors"
281|                  >
282|                    ✂️ Diviser
283|                  </button>
284|                )}
285|                {onDoubleClick && (
286|                  <button
287|                    onClick={() => { onDoubleClick(selectedPartiel); setSelectedPartiel(null); }}
288|                    className="px-2.5 py-1.5 text-xs font-semibold bg-stone-50 text-stone-700 border border-stone-200 rounded-lg hover:bg-stone-100 cursor-pointer transition-colors"
289|                  >
290|                    ✏️ Modifier
291|                  </button>
292|                )}
293|                {onDelete && (
294|                  <button
295|                    onClick={() => { onDelete(selectedPartiel); setSelectedPartiel(null); }}
296|                    className="px-2.5 py-1.5 text-xs font-semibold bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 cursor-pointer transition-colors"
297|                  >
298|                    🗑️ Supprimer
299|                  </button>
300|                )}
301|                <button
302|                  onClick={() => setSelectedPartiel(null)}
303|                  className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg cursor-pointer transition-colors"
304|                >
305|                  ✕
306|                </button>
307|              </div>
308|            </div>
309|          </div>
310|        )}
311|
312|        {/* Panneau — parcelle cadastrale cliquée (pas dans DB) */}
313|        {cadastreInfo && !selectedPartiel && (
314|          <div className="absolute bottom-0 left-0 right-0 z-[1000] bg-white border-t border-stone-200 shadow-lg px-4 py-3">
315|            <div className="flex items-start justify-between gap-2">
316|              <div className="flex-1 min-w-0">
317|                <div className="flex items-center gap-2 flex-wrap">
318|                  <span className="font-bold text-stone-900 text-sm">
319|                    Parcelle {cadastreInfo.section} {cadastreInfo.numero}
320|                  </span>
321|                  <span className="text-xs font-semibold text-purple-600">
322|                    {cadastreInfo.surfaceHa.toFixed(4)} ha
323|                  </span>
324|                  {dejaAjoutee && (
325|                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
326|                      ✓ Dans votre parcellaire
327|                    </span>
328|                  )}
329|                </div>
330|                <p className="text-xs text-stone-400 mt-0.5">
331|                  {cadastreInfo.nomCommune} · {cadastreInfo.codeInsee}/{cadastreInfo.section}/{cadastreInfo.numero}
332|                </p>
333|              </div>
334|              <div className="flex items-center gap-1 shrink-0">
335|                {!dejaAjoutee && onAdd && (
336|                  <button
337|                    onClick={handleAddCadastre}
338|                    className="px-3 py-1.5 text-xs font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700 cursor-pointer transition-colors shadow-sm"
339|                  >
340|                    + Ajouter cette parcelle
341|                  </button>
342|                )}
343|                <button
344|                  onClick={() => setCadastreInfo(null)}
345|                  className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg cursor-pointer transition-colors"
346|                >
347|                  ✕
348|                </button>
349|              </div>
350|            </div>
351|          </div>
352|        )}
353|      </div>
354|
355|      {/* Légende */}
356|      <div className="px-4 py-2.5 border-t border-stone-100 flex gap-4 text-xs text-stone-500 flex-wrap">
357|        <span className="flex items-center gap-1.5">
358|          <span className="inline-block w-3 h-3 rounded-sm bg-green-400 border border-green-600" />
359|          Pâture
360|        </span>
361|        <span className="flex items-center gap-1.5">
362|          <span className="inline-block w-3 h-3 rounded-sm bg-yellow-300 border border-yellow-500" />
363|          Fauche
364|        </span>
365|        <span className="flex items-center gap-1.5">
366|          <span className="inline-block w-3 h-3 rounded-sm bg-blue-300 border border-blue-500" />
367|          Non défini
368|        </span>
369|        <span className="flex items-center gap-1.5">
370|          <span className="inline-block w-3 h-3 rounded-sm bg-purple-300 border border-purple-500" />
371|          Cadastre (non ajouté)
372|        </span>
373|        <span className="ml-auto text-stone-400 text-xs italic">Cliquez sur une parcelle pour l&apos;identifier</span>
374|        <span className="text-stone-400">{withGeo.length} parcelle{withGeo.length > 1 ? "s" : ""} affichée{withGeo.length > 1 ? "s" : ""}</span>
375|      </div>
376|    </div>
377|  );
378|}
379|