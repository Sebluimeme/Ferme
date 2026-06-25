1|"use client";
2|
3|import React, { useState, useEffect, useCallback } from "react";
4|import { MapContainer, TileLayer, WMSTileLayer, useMapEvents, useMap } from "react-leaflet";
5|import L from "leaflet";
6|import "leaflet/dist/leaflet.css";
7|import type { Partiel } from "@/types/fourrage";
8|
9|// ==================== Geometry helpers ====================
10|
11|interface SnapResult {
12|  lng: number;
13|  lat: number;
14|  segIndex: number;
15|  t: number;
16|}
17|
18|function nearestOnSegment(
19|  sx: number, sy: number, ex: number, ey: number, px: number, py: number
20|): { x: number; y: number; t: number } {
21|  const dx = ex - sx, dy = ey - sy;
22|  const len2 = dx * dx + dy * dy;
23|  if (len2 === 0) return { x: sx, y: sy, t: 0 };
24|  const t = Math.max(0, Math.min(1, ((px - sx) * dx + (py - sy) * dy) / len2));
25|  return { x: sx + t * dx, y: sy + t * dy, t };
26|}
27|
28|function snapToRing(lng: number, lat: number, ring: number[][]): SnapResult {
29|  let best: SnapResult = { lng: ring[0][0], lat: ring[0][1], segIndex: 0, t: 0 };
30|  let bestDist = Infinity;
31|  for (let i = 0; i < ring.length - 1; i++) {
32|    const p = nearestOnSegment(ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1], lng, lat);
33|    const d = (p.x - lng) ** 2 + (p.y - lat) ** 2;
34|    if (d < bestDist) {
35|      bestDist = d;
36|      best = { lng: p.x, lat: p.y, segIndex: i, t: p.t };
37|    }
38|  }
39|  return best;
40|}
41|
42|function shoelace(ring: number[][]): number {
43|  let area = 0;
44|  const n = ring.length - 1;
45|  for (let i = 0; i < n; i++) {
46|    const j = (i + 1) % n;
47|    area += ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1];
48|  }
49|  return Math.abs(area) / 2;
50|}
51|
52|// Split a ring with a multi-point cutting line: start→mids→end (start and end are boundary snaps)
53|function splitRing(
54|  ring: number[][],
55|  s1: SnapResult,
56|  s2: SnapResult,
57|  mids: number[][]
58|): [number[][], number[][]] | null {
59|  let a = s1, b = s2;
60|  let orderedMids = mids;
61|  if (a.segIndex + a.t > b.segIndex + b.t) {
62|    [a, b] = [b, a];
63|    orderedMids = [...mids].reverse();
64|  }
65|
66|  const pA = [a.lng, a.lat];
67|  const pB = [b.lng, b.lat];
68|  const n = ring.length - 1;
69|
70|  // r1: pA → boundary(a→b) → pB → mids_reversed → pA
71|  const r1: number[][] = [pA];
72|  for (let i = a.segIndex + 1; i <= b.segIndex; i++) r1.push([...ring[i]]);
73|  r1.push(pB, ...[...orderedMids].reverse(), pA);
74|
75|  // r2: pB → boundary(b→a wrap) → pA → mids_forward → pB
76|  const r2: number[][] = [pB];
77|  for (let i = b.segIndex + 1; i <= n + a.segIndex; i++) r2.push([...ring[i % n]]);
78|  r2.push(pA, ...orderedMids, pB);
79|
80|  if (r1.length < 4 || r2.length < 4) return null;
81|  return [r1, r2];
82|}
83|
84|// ==================== Map sublayers ====================
85|
86|function OriginalLayer({ ring, hidden }: { ring: number[][]; hidden: boolean }) {
87|  const map = useMap();
88|  useEffect(() => {
89|    if (hidden) return;
90|    const toLL = (r: number[][]): L.LatLngExpression[] => r.map((c) => [c[1], c[0]] as L.LatLngExpression);
91|    const layer = L.polygon(toLL(ring), {
92|      color: "#6366f1", fillColor: "#6366f1", fillOpacity: 0.15, weight: 2,
93|    }).addTo(map);
94|    return () => { layer.remove(); };
95|  }, [map, ring, hidden]);
96|  return null;
97|}
98|
99|function SplitLayer({ r1, r2 }: { r1: number[][]; r2: number[][] }) {
100|  const map = useMap();
101|  useEffect(() => {
102|    const toLL = (r: number[][]): L.LatLngExpression[] => r.map((c) => [c[1], c[0]] as L.LatLngExpression);
103|    const p1 = L.polygon(toLL(r1), { color: "#22c55e", fillColor: "#22c55e", fillOpacity: 0.35, weight: 2 }).addTo(map);
104|    const p2 = L.polygon(toLL(r2), { color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 0.35, weight: 2 }).addTo(map);
105|    return () => { p1.remove(); p2.remove(); };
106|  }, [map, r1, r2]);
107|  return null;
108|}
109|
110|interface CuttingLayerProps {
111|  snapStart: SnapResult | null;
112|  snapEnd: SnapResult | null;
113|  intermediates: number[][];
114|}
115|
116|function CuttingLayer({ snapStart, snapEnd, intermediates }: CuttingLayerProps) {
117|  const map = useMap();
118|  useEffect(() => {
119|    const layers: L.Layer[] = [];
120|
121|    const path: L.LatLngExpression[] = [];
122|    if (snapStart) path.push([snapStart.lat, snapStart.lng]);
123|    for (const m of intermediates) path.push([m[1], m[0]]);
124|    if (snapEnd) path.push([snapEnd.lat, snapEnd.lng]);
125|
126|    if (path.length >= 2) {
127|      layers.push(
128|        L.polyline(path, { color: "#ef4444", weight: 2, dashArray: "6 4" }).addTo(map)
129|      );
130|    }
131|
132|    if (snapStart) {
133|      layers.push(
134|        L.circleMarker([snapStart.lat, snapStart.lng], {
135|          radius: 8, fillColor: "#22c55e", color: "#fff", weight: 2, fillOpacity: 1,
136|        }).addTo(map)
137|      );
138|    }
139|
140|    intermediates.forEach((m) => {
141|      layers.push(
142|        L.circleMarker([m[1], m[0]], {
143|          radius: 5, fillColor: "#3b82f6", color: "#fff", weight: 2, fillOpacity: 1,
144|        }).addTo(map)
145|      );
146|    });
147|
148|    if (snapEnd) {
149|      layers.push(
150|        L.circleMarker([snapEnd.lat, snapEnd.lng], {
151|          radius: 8, fillColor: "#ef4444", color: "#fff", weight: 2, fillOpacity: 1,
152|        }).addTo(map)
153|      );
154|    }
155|
156|    return () => { layers.forEach((l) => l.remove()); };
157|  }, [map, snapStart, snapEnd, intermediates]);
158|  return null;
159|}
160|
161|interface ClickHandlerProps {
162|  ring: number[][];
163|  snapStart: SnapResult | null;
164|  closingMode: boolean;
165|  isDone: boolean;
166|  onSnapStart: (s: SnapResult) => void;
167|  onIntermediate: (pt: number[]) => void;
168|  onSnapEnd: (s: SnapResult) => void;
169|}
170|
171|function ClickHandler({ ring, snapStart, closingMode, isDone, onSnapStart, onIntermediate, onSnapEnd }: ClickHandlerProps) {
172|  useMapEvents({
173|    click(e) {
174|      if (isDone) return;
175|      if (!snapStart) {
176|        onSnapStart(snapToRing(e.latlng.lng, e.latlng.lat, ring));
177|      } else if (closingMode) {
178|        onSnapEnd(snapToRing(e.latlng.lng, e.latlng.lat, ring));
179|      } else {
180|        onIntermediate([e.latlng.lng, e.latlng.lat]);
181|      }
182|    },
183|  });
184|  return null;
185|}
186|
187|// ==================== Editor component ====================
188|
189|interface Props {
190|  parcelle: Partiel;
191|  onClose: () => void;
192|  onConfirm: (r1: number[][], r2: number[][], n1: string, n2: string, s1?: number, s2?: number) => void;
193|  saving: boolean;
194|}
195|
196|export default function ParcelSplitEditor({ parcelle, onClose, onConfirm, saving }: Props) {
197|  const geo = parcelle.geometry as { type: string; coordinates: number[][][] } | null;
198|  const ring: number[][] =
199|    geo?.type === "Polygon"
200|      ? geo.coordinates[0]
201|      : geo?.type === "MultiPolygon"
202|      ? (geo.coordinates as unknown as number[][][][])[0][0]
203|      : [];
204|
205|  const [snapStart, setSnapStart] = useState<SnapResult | null>(null);
206|  const [snapEnd, setSnapEnd] = useState<SnapResult | null>(null);
207|  const [intermediates, setIntermediates] = useState<number[][]>([]);
208|  const [closingMode, setClosingMode] = useState(false);
209|  const [showNames, setShowNames] = useState(false);
210|  const [name1, setName1] = useState(`${parcelle.nom} A`);
211|  const [name2, setName2] = useState(`${parcelle.nom} B`);
212|  const [satellite, setSatellite] = useState(true);
213|
214|  const isDone = snapStart !== null && snapEnd !== null;
215|
216|  const phase: "idle" | "drawing" | "closing" | "done" = isDone
217|    ? "done"
218|    : closingMode
219|    ? "closing"
220|    : snapStart
221|    ? "drawing"
222|    : "idle";
223|
224|  const handleSnapStart = useCallback((s: SnapResult) => setSnapStart(s), []);
225|  const handleIntermediate = useCallback((pt: number[]) => setIntermediates((prev) => [...prev, pt]), []);
226|  const handleSnapEnd = useCallback((s: SnapResult) => {
227|    setSnapEnd(s);
228|    setClosingMode(false);
229|  }, []);
230|
231|  const handleUndo = () => {
232|    if (closingMode) {
233|      setClosingMode(false);
234|    } else if (intermediates.length > 0) {
235|      setIntermediates((prev) => prev.slice(0, -1));
236|    } else if (snapStart) {
237|      setSnapStart(null);
238|    }
239|  };
240|
241|  const handleReset = () => {
242|    setSnapStart(null);
243|    setSnapEnd(null);
244|    setIntermediates([]);
245|    setClosingMode(false);
246|    setShowNames(false);
247|  };
248|
249|  const splitResult = snapStart && snapEnd ? splitRing(ring, snapStart, snapEnd, intermediates) : null;
250|  const splitError = isDone && splitResult === null;
251|
252|  const handleConfirm = () => {
253|    if (!splitResult) return;
254|    const [r1, r2] = splitResult;
255|    let s1: number | undefined, s2: number | undefined;
256|    if (parcelle.surface != null) {
257|      const a1 = shoelace(r1), a2 = shoelace(r2), total = a1 + a2;
258|      if (total > 0) {
259|        s1 = Math.round((parcelle.surface * a1 / total) * 10000) / 10000;
260|        s2 = Math.round((parcelle.surface * a2 / total) * 10000) / 10000;
261|      }
262|    }
263|    onConfirm(r1, r2, name1, name2, s1, s2);
264|  };
265|
266|  if (!ring.length) {
267|    return (
268|      <div className="text-center py-8 text-stone-500">
269|        <p>Cette parcelle n'a pas de géométrie cadastrale — importez-la via le bouton 📍 Cadastre d'abord.</p>
270|        <button onClick={onClose} className="mt-4 px-4 py-2 bg-stone-100 rounded-lg text-sm cursor-pointer">
271|          Fermer
272|        </button>
273|      </div>
274|    );
275|  }
276|
277|  const lats = ring.map((c) => c[1]);
278|  const lngs = ring.map((c) => c[0]);
279|  const bounds: L.LatLngBoundsExpression = [
280|    [Math.min(...lats), Math.min(...lngs)],
281|    [Math.max(...lats), Math.max(...lngs)],
282|  ];
283|
284|  const stepMsg =
285|    splitError
286|      ? "⚠️ Tracé invalide — réinitialisez et tracez un chemin qui traverse la parcelle"
287|      : phase === "done"
288|      ? "✓ Tracé validé — nommez les parcelles puis confirmez"
289|      : phase === "idle"
290|      ? "① Cliquez sur le bord de la parcelle pour poser le point de départ (ancré automatiquement)"
291|      : phase === "drawing"
292|      ? `② Cliquez n'importe où pour ajouter des points${intermediates.length > 0 ? ` (${intermediates.length} intermédiaire${intermediates.length > 1 ? "s" : ""})` : ""} — puis "Terminer le tracé"`
293|      : "③ Cliquez sur le bord de la parcelle pour terminer et ancrer le tracé";
294|
295|  const canUndo = phase !== "idle" && !isDone;
296|
297|  return (
298|    <div className="flex flex-col gap-4">
299|      <div
300|        className={`border rounded-lg px-4 py-2 text-sm ${
301|          splitError
302|            ? "bg-red-50 border-red-200 text-red-700"
303|            : phase === "done"
304|            ? "bg-green-50 border-green-200 text-green-700"
305|            : "bg-blue-50 border-blue-200 text-blue-700"
306|        }`}
307|      >
308|        {stepMsg}
309|      </div>
310|
311|      <div style={{ height: "520px" }} className="relative rounded-xl overflow-hidden border border-stone-200">
312|        <button
313|          onClick={() => setSatellite(!satellite)}
314|          className="absolute top-2 right-2 z-[1000] px-2 py-1 text-xs font-semibold bg-white border border-stone-300 rounded shadow-sm hover:bg-stone-50 transition-colors"
315|        >
316|          {satellite ? "🗺️ Plan" : "🛰️ Satellite"}
317|        </button>
318|        <MapContainer
319|          bounds={bounds}
320|          boundsOptions={{ padding: [40, 40] }}
321|          style={{ height: "100%", width: "100%" }}
322|          maxZoom={22}
323|        >
324|          {satellite ? (
325|            <TileLayer
326|              url="https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&STYLE=normal&FORMAT=image/jpeg"
327|              attribution='&copy; <a href="https://www.geoportail.gouv.fr/">IGN</a>'
328|              maxNativeZoom={20}
329|              maxZoom={22}
330|            />
331|          ) : (
332|            <TileLayer
333|              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
334|              attribution="&copy; OpenStreetMap contributors"
335|              maxNativeZoom={19}
336|              maxZoom={22}
337|            />
338|          )}
339|          <WMSTileLayer
340|            url="https://data.geopf.fr/wms-r/wms"
341|            layers="CADASTRALPARCELS.PARCELLAIRE_EXPRESS"
342|            format="image/png"
343|            transparent={true}
344|            version="1.3.0"
345|            opacity={satellite ? 0.7 : 0.5}
346|            attribution='&copy; <a href="https://www.geoportail.gouv.fr/">IGN</a>'
347|          />
348|          <OriginalLayer ring={ring} hidden={!!splitResult} />
349|          {splitResult && <SplitLayer r1={splitResult[0]} r2={splitResult[1]} />}
350|          <CuttingLayer snapStart={snapStart} snapEnd={snapEnd} intermediates={intermediates} />
351|          <ClickHandler
352|            ring={ring}
353|            snapStart={snapStart}
354|            closingMode={closingMode}
355|            isDone={isDone}
356|            onSnapStart={handleSnapStart}
357|            onIntermediate={handleIntermediate}
358|            onSnapEnd={handleSnapEnd}
359|          />
360|        </MapContainer>
361|      </div>
362|
363|      <div className="flex items-center gap-2 flex-wrap">
364|        <button
365|          onClick={handleReset}
366|          disabled={phase === "idle"}
367|          className="px-4 py-2 text-sm font-medium bg-stone-100 text-stone-700 border border-stone-200 rounded-lg hover:bg-stone-200 cursor-pointer disabled:opacity-40"
368|        >
369|          Réinitialiser
370|        </button>
371|        {canUndo && (
372|          <button
373|            onClick={handleUndo}
374|            className="px-4 py-2 text-sm font-medium bg-stone-100 text-stone-700 border border-stone-200 rounded-lg hover:bg-stone-200 cursor-pointer"
375|          >
376|            ↩ Annuler dernier
377|          </button>
378|        )}
379|        {phase === "drawing" && (
380|          <button
381|            onClick={() => setClosingMode(true)}
382|            className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer"
383|          >
384|            Terminer le tracé →
385|          </button>
386|        )}
387|        <div className="flex-1" />
388|        <button
389|          onClick={onClose}
390|          className="px-4 py-2 text-sm font-medium bg-stone-100 text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-200 cursor-pointer"
391|        >
392|          Annuler
393|        </button>
394|        <button
395|          onClick={() => setShowNames(true)}
396|          disabled={!splitResult}
397|          className="px-5 py-2 text-sm font-semibold text-white rounded-lg bg-brand-600 cursor-pointer disabled:opacity-40"
398|        >
399|          ✂️ Diviser en 2
400|        </button>
401|      </div>
402|
403|      {showNames && (
404|        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 flex flex-col gap-3">
405|          <p className="text-sm font-semibold text-stone-700 m-0">Nommez les 2 nouvelles parcelles :</p>
406|          <div className="flex gap-3">
407|            <div className="flex-1">
408|              <label className="block text-xs text-green-700 font-semibold mb-1">🟢 Parcelle verte</label>
409|              <input
410|                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
411|                value={name1}
412|                onChange={(e) => setName1(e.target.value)}
413|                autoFocus
414|              />
415|            </div>
416|            <div className="flex-1">
417|              <label className="block text-xs text-amber-700 font-semibold mb-1">🟡 Parcelle jaune</label>
418|              <input
419|                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
420|                value={name2}
421|                onChange={(e) => setName2(e.target.value)}
422|              />
423|            </div>
424|          </div>
425|          <div className="flex justify-end gap-3">
426|            <button
427|              onClick={() => setShowNames(false)}
428|              className="px-4 py-2 text-sm bg-stone-100 text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-200 cursor-pointer"
429|            >
430|              Retour
431|            </button>
432|            <button
433|              onClick={handleConfirm}
434|              disabled={saving || !name1.trim() || !name2.trim()}
435|              className="px-5 py-2 text-sm font-semibold text-white rounded-lg bg-brand-600 cursor-pointer disabled:opacity-50"
436|            >
437|              {saving ? "Division en cours..." : "Confirmer la division"}
438|            </button>
439|          </div>
440|        </div>
441|      )}
442|    </div>
443|  );
444|}
445|