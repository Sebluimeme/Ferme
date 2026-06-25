1|"use client";
2|
3|import React, { useState, useEffect } from "react";
4|import { MapContainer, TileLayer, WMSTileLayer, GeoJSON, useMapEvents } from "react-leaflet";
5|import L from "leaflet";
6|import "leaflet/dist/leaflet.css";
7|
8|// Fix Leaflet default icon issue in Next.js
9|delete (L.Icon.Default.prototype as any)._getIconUrl;
10|L.Icon.Default.mergeOptions({
11|  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
12|  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
13|  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
14|});
15|
16|export interface CadastreSelectData {
17|  nom: string;
18|  surface: number; // en hectares
19|  cadastreRef: string;
20|  codeInsee: string;
21|  section: string;
22|  numeroParcelle: string;
23|  geometry: object;
24|}
25|
26|interface ParcelleInfo {
27|  codeInsee: string;
28|  section: string;
29|  numero: string;
30|  contenance: number; // m²
31|  nomCommune: string;
32|  geometry: GeoJSON.Geometry;
33|  feature: GeoJSON.Feature;
34|}
35|
36|interface CadastreMapProps {
37|  onSelect: (data: CadastreSelectData) => void;
38|  onClose: () => void;
39|}
40|
41|function ClickHandler({
42|  onMapClick,
43|}: {
44|  onMapClick: (lat: number, lng: number) => void;
45|}) {
46|  useMapEvents({
47|    click(e) {
48|      onMapClick(e.latlng.lat, e.latlng.lng);
49|    },
50|  });
51|  return null;
52|}
53|
54|export default function CadastreMap({ onSelect, onClose }: CadastreMapProps) {
55|  const [selectedParcelle, setSelectedParcelle] = useState<ParcelleInfo | null>(null);
56|  const [loading, setLoading] = useState(false);
57|  const [error, setError] = useState<string | null>(null);
58|  const [satellite, setSatellite] = useState(true);
59|
60|  const handleMapClick = async (lat: number, lng: number) => {
61|    setLoading(true);
62|    setError(null);
63|    setSelectedParcelle(null);
64|
65|    try {
66|      const geom = JSON.stringify({ type: "Point", coordinates: [lng, lat] });
67|      const url = `https://apicarto.ign.fr/api/cadastre/parcelle?geom=${encodeURIComponent(geom)}`;
68|      const res = await fetch(url);
69|      if (!res.ok) throw new Error(`Erreur API cadastre (${res.status})`);
70|      const data = await res.json();
71|
72|      if (!data.features || data.features.length === 0) {
73|        setError("Aucune parcelle trouvée à cet emplacement. Essayez de zoomer davantage.");
74|        setLoading(false);
75|        return;
76|      }
77|
78|      const feature = data.features[0];
79|      const props = feature.properties;
80|
81|      setSelectedParcelle({
82|        codeInsee: props.code_com || props.code_arr || "",
83|        section: props.section || "",
84|        numero: props.numero || "",
85|        contenance: props.contenance || 0,
86|        nomCommune: props.nom_com || "",
87|        geometry: feature.geometry,
88|        feature: feature,
89|      });
90|    } catch (err: any) {
91|      setError(err.message || "Erreur lors de l'identification de la parcelle.");
92|    } finally {
93|      setLoading(false);
94|    }
95|  };
96|
97|  const handleValider = () => {
98|    if (!selectedParcelle) return;
99|    const surfaceHa = selectedParcelle.contenance / 10000;
100|    const cadastreRef = `${selectedParcelle.codeInsee}/${selectedParcelle.section}/${selectedParcelle.numero}`;
101|    const nom = `Parcelle ${selectedParcelle.section}${selectedParcelle.numero}`;
102|
103|    onSelect({
104|      nom,
105|      surface: Math.round(surfaceHa * 10000) / 10000,
106|      cadastreRef,
107|      codeInsee: selectedParcelle.codeInsee,
108|      section: selectedParcelle.section,
109|      numeroParcelle: selectedParcelle.numero,
110|      geometry: selectedParcelle.geometry,
111|    });
112|  };
113|
114|  return (
115|    <div className="flex flex-col h-full">
116|      {/* Info banner */}
117|      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 mb-3 text-sm text-blue-700">
118|        Cliquez sur une parcelle pour l&apos;identifier. Zoomez pour voir les parcelles cadastrales.
119|      </div>
120|
121|      {/* Loading/Error */}
122|      {loading && (
123|        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2 mb-3 text-sm text-yellow-700">
124|          Identification de la parcelle...
125|        </div>
126|      )}
127|      {error && (
128|        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 mb-3 text-sm text-red-700">
129|          {error}
130|        </div>
131|      )}
132|
133|      {/* Parcelle sélectionnée */}
134|      {selectedParcelle && (
135|        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-3">
136|          <div className="flex items-start justify-between gap-3">
137|            <div className="text-sm">
138|              <p className="font-semibold text-green-800 mb-1">
139|                Parcelle {selectedParcelle.section} {selectedParcelle.numero}
140|              </p>
141|              <p className="text-green-700">
142|                Commune : {selectedParcelle.nomCommune} ({selectedParcelle.codeInsee})
143|              </p>
144|              <p className="text-green-700">
145|                Surface : {(selectedParcelle.contenance / 10000).toFixed(4)} ha ({selectedParcelle.contenance} m²)
146|              </p>
147|            </div>
148|            <button
149|              onClick={handleValider}
150|              className="shrink-0 px-4 py-2 text-sm font-semibold text-white rounded-lg bg-brand-600 hover:bg-brand-700 transition-colors cursor-pointer shadow-sm"
151|            >
152|              Valider cette parcelle
153|            </button>
154|          </div>
155|        </div>
156|      )}
157|
158|      {/* Carte */}
159|      <div className="relative flex-1 rounded-xl overflow-hidden border border-stone-200" style={{ minHeight: "420px" }}>
160|        <button
161|          onClick={() => setSatellite(!satellite)}
162|          className="absolute top-2 right-2 z-[1000] px-2 py-1 text-xs font-semibold bg-white border border-stone-300 rounded shadow-sm hover:bg-stone-50 transition-colors"
163|        >
164|          {satellite ? "🗺️ Plan" : "🛰️ Satellite"}
165|        </button>
166|        <MapContainer
167|          center={[48.172, 7.141]}
168|          zoom={15}
169|          style={{ height: "100%", width: "100%" }}
170|        >
171|          {satellite ? (
172|            <TileLayer
173|              url="https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&STYLE=normal&FORMAT=image/jpeg"
174|              attribution='&copy; <a href="https://www.geoportail.gouv.fr/">IGN</a>'
175|              maxNativeZoom={20}
176|              maxZoom={22}
177|            />
178|          ) : (
179|            <TileLayer
180|              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
181|              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
182|            />
183|          )}
184|
185|          {/* Overlay cadastral IGN */}
186|          <WMSTileLayer
187|            url="https://data.geopf.fr/wms-r/wms"
188|            layers="CADASTRALPARCELS.PARCELLAIRE_EXPRESS"
189|            format="image/png"
190|            transparent={true}
191|            version="1.3.0"
192|            opacity={satellite ? 0.85 : 0.7}
193|            attribution='&copy; <a href="https://www.geoportail.gouv.fr/">IGN</a>'
194|          />
195|
196|          {/* Parcelle sélectionnée en surbrillance */}
197|          {selectedParcelle && (
198|            <GeoJSON
199|              key={`${selectedParcelle.codeInsee}-${selectedParcelle.section}-${selectedParcelle.numero}`}
200|              data={selectedParcelle.feature}
201|              style={{
202|                color: "#22c55e",
203|                weight: 3,
204|                fillColor: "#22c55e",
205|                fillOpacity: 0.3,
206|              }}
207|            />
208|          )}
209|
210|          <ClickHandler onMapClick={handleMapClick} />
211|        </MapContainer>
212|      </div>
213|    </div>
214|  );
215|}
216|