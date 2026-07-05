"use client";

import { useMemo, useState } from "react";
import { useAppStore } from "@/store/store";
import { computeStats, type Transaction } from "@/types/comptabilite";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { TrendingDown, TrendingUp, Scale, Receipt, ChevronDown } from "lucide-react";
import KpiCard from "@/components/KpiCard";

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 0): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec })
    .replace(/ /g, " ");
}

function fmtMois(iso: string): string {
  return new Date(iso + "-01").toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
}

const COULEURS = ["#78716c", "#a8a29e", "#57534e", "#d6d3d1", "#44403c", "#e7e5e4", "#292524"];
const COULEUR_DEPENSES = "#dc2626";
const COULEUR_REVENUS  = "#16a34a";

// Mapping production → type animal (fuzzy)
const PROD_TO_TYPE: Array<{ keywords: string[]; type: "bovin" | "ovin" | "caprin" | "porcin" | "equin" }> = [
  { keywords: ["porc", "cochon", "truie", "goret", "porcin"],    type: "porcin" },
  { keywords: ["bovin", "vach", "taureau", "veau", "génisse"],   type: "bovin"  },
  { keywords: ["ovin", "mouton", "brebis", "agneau"],            type: "ovin"   },
  { keywords: ["caprin", "chèvre", "chevre", "bouc", "chevreau"],type: "caprin" },
  { keywords: ["équin", "equin", "cheval", "poney", "jument"],   type: "equin"  },
];

function detectTypeAnimal(production: string) {
  const p = production.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  for (const { keywords, type } of PROD_TO_TYPE) {
    if (keywords.some((k) => p.includes(k))) return type;
  }
  return null;
}

// Tooltip personnalisé
function CustomTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-stone-200 rounded-lg px-3 py-2 shadow-md text-xs">
      <p className="font-semibold text-stone-700 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name} : <strong>{fmt(p.value, 2)} €</strong>
        </p>
      ))}
    </div>
  );
}

// ─── Composant principal ─────────────────────────────────────────────────────

export default function RapportsPageContent() {
  const { state } = useAppStore();
  const transactions = (state.couts as Transaction[]) || [];
  const animaux = state.animaux || [];

  // Productions disponibles
  const productions = useMemo(() => {
    const s = new Set(transactions.map((t) => t.production));
    return Array.from(s).sort();
  }, [transactions]);

  // Années disponibles
  const annees = useMemo(() => {
    const s = new Set(transactions.map((t) => t.date.substring(0, 4)));
    return Array.from(s).sort().reverse();
  }, [transactions]);

  const [selectedProd, setSelectedProd] = useState("all");
  const [selectedAnnee, setSelectedAnnee] = useState("");

  // ── Données filtrées ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = transactions;
    if (selectedProd !== "all") list = list.filter((t) => t.production === selectedProd);
    if (selectedAnnee) list = list.filter((t) => t.date.startsWith(selectedAnnee));
    return list;
  }, [transactions, selectedProd, selectedAnnee]);

  const stats = useMemo(() => computeStats(filtered), [filtered]);

  // ── Dépenses par catégorie ────────────────────────────────────────────────
  const depensesParCategorie = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.filter((t) => t.operation === "Dépenses").forEach((t) => {
      map[t.categorie] = (map[t.categorie] || 0) + t.montant;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const totalDepCat = depensesParCategorie.reduce((s, d) => s + d.value, 0);

  // ── Revenus par catégorie ──────────────────────────────────────────────────
  const revenusParCategorie = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.filter((t) => t.operation === "Revenus").forEach((t) => {
      map[t.categorie] = (map[t.categorie] || 0) + t.montant;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  // ── Évolution mensuelle ───────────────────────────────────────────────────
  const parMois = useMemo(() => {
    const map: Record<string, { depenses: number; revenus: number }> = {};
    filtered.forEach((t) => {
      const mois = t.date.substring(0, 7);
      if (!map[mois]) map[mois] = { depenses: 0, revenus: 0 };
      if (t.operation === "Dépenses") map[mois].depenses += t.montant;
      else map[mois].revenus += t.montant;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mois, d]) => ({ mois: fmtMois(mois), ...d }));
  }, [filtered]);

  const moyenneMensuelle = parMois.length > 0
    ? parMois.reduce((s, m) => s + m.depenses, 0) / parMois.length
    : 0;

  // ── Top produits (dépenses) ───────────────────────────────────────────────
  const topProduits = useMemo(() => {
    const map: Record<string, { total: number; count: number; categorie: string }> = {};
    filtered.filter((t) => t.operation === "Dépenses").forEach((t) => {
      if (!map[t.produit]) map[t.produit] = { total: 0, count: 0, categorie: t.categorie };
      map[t.produit].total += t.montant;
      map[t.produit].count += 1;
    });
    return Object.entries(map)
      .map(([produit, d]) => ({ produit, ...d }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 7);
  }, [filtered]);

  // ── Coût par tête ─────────────────────────────────────────────────────────
  const coutParTete = useMemo(() => {
    if (selectedProd === "all") return null;
    const typeAnimal = detectTypeAnimal(selectedProd);
    if (!typeAnimal) return null;
    const nbTetes = animaux.filter((a) => a.type === typeAnimal && a.statut === "actif").length;
    if (nbTetes === 0) return null;
    return {
      nbTetes,
      typeAnimal,
      coutTotal: stats.totalDepenses,
      coutParTete: stats.totalDepenses / nbTetes,
      revenuParTete: stats.totalRevenus > 0 ? stats.totalRevenus / nbTetes : null,
    };
  }, [selectedProd, animaux, stats]);

  const hasData = filtered.length > 0;

  return (
    <div className="space-y-6 fade-in">

      {/* En-tête */}
      <div>
        <h1 className="text-[22px] font-semibold text-stone-900 tracking-[-0.3px]">Analyse financière</h1>
        <p className="text-[13px] text-stone-400 mt-0.5">Visualisez les dépenses et revenus par production</p>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <select
            value={selectedProd}
            onChange={(e) => setSelectedProd(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 text-[13px] bg-white border border-stone-200 rounded-lg text-stone-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 cursor-pointer shadow-sm"
          >
            <option value="all">Toutes les productions</option>
            {productions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select
            value={selectedAnnee}
            onChange={(e) => setSelectedAnnee(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 text-[13px] bg-white border border-stone-200 rounded-lg text-stone-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 cursor-pointer shadow-sm"
          >
            <option value="">Toutes les années</option>
            {annees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
        </div>
      </div>

      {!hasData ? (
        <div className="bg-white rounded-xl border border-stone-200 py-20 flex flex-col items-center text-center">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-[14px] font-medium text-stone-600">Aucune donnée</p>
          <p className="text-[13px] text-stone-400 mt-1">Ajoutez des transactions dans la comptabilité pour voir les analyses.</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Dépenses" value={`${fmt(stats.totalDepenses)} €`} icon={<TrendingDown className="w-3.5 h-3.5 text-red-500" />} />
            <KpiCard label="Revenus" value={`${fmt(stats.totalRevenus)} €`} icon={<TrendingUp className="w-3.5 h-3.5 text-green-600" />} />
            <KpiCard
              label="Balance"
              value={`${stats.balance >= 0 ? "+" : ""}${fmt(stats.balance)} €`}
              icon={<Scale className="w-3.5 h-3.5" />}
            />
            <KpiCard label="Transactions" value={stats.nbTransactions} icon={<Receipt className="w-3.5 h-3.5" />} />
          </div>

          {/* Coût par tête */}
          {coutParTete && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 mb-3">
                Estimation coût / tête — {selectedProd} ({coutParTete.nbTetes} animaux actifs)
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-[11px] text-amber-600">Coût total</p>
                  <p className="text-[20px] font-bold text-amber-900">{fmt(coutParTete.coutTotal, 2)} €</p>
                </div>
                <div>
                  <p className="text-[11px] text-amber-600">Coût / tête</p>
                  <p className="text-[20px] font-bold text-amber-900">{fmt(coutParTete.coutParTete, 2)} €</p>
                </div>
                {coutParTete.revenuParTete !== null && (
                  <div>
                    <p className="text-[11px] text-amber-600">Revenu / tête</p>
                    <p className="text-[20px] font-bold text-green-700">{fmt(coutParTete.revenuParTete, 2)} €</p>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-amber-500 mt-2">* Basé sur les animaux actifs dans le cheptel</p>
            </div>
          )}

          {/* Évolution mensuelle */}
          {parMois.length > 1 && (
            <div className="bg-white rounded-xl border border-stone-200 p-5">
              <h2 className="text-[14px] font-semibold text-stone-800 mb-4">Évolution mensuelle</h2>
              {parMois.length > 0 && (
                <div className="mb-3 text-[12px] text-stone-500">
                  Moyenne mensuelle dépenses : <strong className="text-stone-700">{fmt(moyenneMensuelle, 2)} €</strong>
                </div>
              )}
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={parMois} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <XAxis dataKey="mois" tick={{ fontSize: 11, fill: "#a8a29e" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#a8a29e" }} tickFormatter={(v) => `${fmt(v)} €`} width={70} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="depenses" name="Dépenses" fill={COULEUR_DEPENSES} radius={[3, 3, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="revenus" name="Revenus" fill={COULEUR_REVENUS} radius={[3, 3, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Répartition dépenses */}
          {depensesParCategorie.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Barres horizontales */}
              <div className="bg-white rounded-xl border border-stone-200 p-5">
                <h2 className="text-[14px] font-semibold text-stone-800 mb-4">Dépenses par catégorie</h2>
                <div className="space-y-3">
                  {depensesParCategorie.map((cat, i) => {
                    const pct = totalDepCat > 0 ? (cat.value / totalDepCat) * 100 : 0;
                    return (
                      <div key={cat.name}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[12px] font-medium text-stone-700 truncate max-w-[60%]">{cat.name}</span>
                          <div className="text-right shrink-0">
                            <span className="text-[12px] font-semibold text-stone-800">{fmt(cat.value, 2)} €</span>
                            <span className="text-[10px] text-stone-400 ml-1.5">{Math.round(pct)}%</span>
                          </div>
                        </div>
                        <div className="w-full bg-stone-100 rounded-full h-2">
                          <div
                            className="h-2 rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: COULEURS[i % COULEURS.length] }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pie chart */}
              <div className="bg-white rounded-xl border border-stone-200 p-5">
                <h2 className="text-[14px] font-semibold text-stone-800 mb-2">Répartition</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={depensesParCategorie}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      labelLine={false}
                    >
                      {depensesParCategorie.map((_, i) => (
                        <Cell key={i} fill={COULEURS[i % COULEURS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => [`${fmt(Number(v), 2)} €`]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Revenus par catégorie */}
          {revenusParCategorie.length > 0 && (
            <div className="bg-white rounded-xl border border-stone-200 p-5">
              <h2 className="text-[14px] font-semibold text-stone-800 mb-4">Revenus par catégorie</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {revenusParCategorie.map((cat) => (
                  <div key={cat.name} className="flex items-center justify-between px-3 py-2 bg-green-50 border border-green-100 rounded-lg">
                    <span className="text-[12px] font-medium text-stone-700 truncate">{cat.name}</span>
                    <span className="text-[13px] font-semibold text-green-700 shrink-0 ml-2">+{fmt(cat.value, 2)} €</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top postes de dépenses */}
          {topProduits.length > 0 && (
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-stone-100">
                <h2 className="text-[14px] font-semibold text-stone-800">Top postes de dépenses</h2>
              </div>
              <div className="divide-y divide-stone-100">
                {topProduits.map((p, i) => (
                  <div key={p.produit} className="flex items-center gap-3 px-5 py-3">
                    <span className="text-[13px] font-bold text-stone-300 w-5 shrink-0">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-stone-800 truncate">{p.produit}</p>
                      <p className="text-[11px] text-stone-400">{p.categorie} · {p.count} achat{p.count > 1 ? "s" : ""}</p>
                    </div>
                    <span className="text-[14px] font-bold text-stone-900 shrink-0">{fmt(p.total, 2)} €</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
