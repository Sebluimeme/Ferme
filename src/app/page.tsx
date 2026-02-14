"use client";

import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/store";
import { formatCurrency, getAnimalIcon } from "@/lib/utils";
import KpiCard from "@/components/KpiCard";

export default function DashboardPage() {
  const router = useRouter();
  const { state } = useAppStore();
  const { stats, alertes } = state;

  return (
    <div className="fade-in">
      <h1 className="text-3xl font-bold mb-8">📊 Tableau de bord</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Total Animaux" value={stats.totalAnimaux || 0} subtitle="actifs" onClick={() => router.push("/animaux")} />
        <KpiCard label={`${getAnimalIcon("ovin")} Ovins`} value={stats.ovins || 0} borderColorClass="border-l-ovin" valueColorClass="text-ovin" onClick={() => router.push("/animaux?type=ovin")} />
        <KpiCard label={`${getAnimalIcon("bovin")} Bovins`} value={stats.bovins || 0} borderColorClass="border-l-bovin" valueColorClass="text-bovin" onClick={() => router.push("/animaux?type=bovin")} />
        <KpiCard label={`${getAnimalIcon("caprin")} Caprins`} value={stats.caprins || 0} borderColorClass="border-l-caprin" valueColorClass="text-caprin" onClick={() => router.push("/animaux?type=caprin")} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <KpiCard label={`${getAnimalIcon("porcin")} Porcins`} value={stats.porcins || 0} borderColorClass="border-l-porcin" valueColorClass="text-porcin" onClick={() => router.push("/animaux?type=porcin")} />
        <KpiCard label="Profit Global" value={formatCurrency(stats.profitGlobal || 0)} subtitle="Année en cours" borderColorClass="border-l-green-500" valueColorClass="text-green-500" />
      </div>

      {/* Alertes */}
      {alertes.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm mb-8">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200">
            <span className="text-2xl">🔔</span>
            <h3 className="text-lg font-semibold m-0 flex-1">Alertes ({alertes.length})</h3>
          </div>
          <div className="p-6">
            {alertes.slice(0, 5).map((alerte) => (
              <div
                key={alerte.id}
                className={`px-4 py-3 rounded-lg mb-2 border-l-4 ${
                  alerte.priorite === "haute"
                    ? "bg-red-50 border-l-red-500 text-red-800"
                    : "bg-amber-50 border-l-amber-500 text-amber-800"
                }`}
              >
                <strong>{alerte.titre}</strong>
                <br />
                <small>{alerte.description}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bienvenue */}
      <div className="bg-white rounded-xl shadow-sm">
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-4">👋 Bienvenue dans votre application de gestion de ferme!</h2>
          <p className="text-gray-700 mb-4">Commencez par ajouter vos premiers animaux dans la section &quot;Mes Animaux&quot;.</p>

          <div className="mt-6">
            <h4 className="text-lg font-semibold mb-2">🚀 Fonctionnalités disponibles:</h4>
            <ul className="list-none space-y-1 text-gray-700">
              <li>✅ Gestion de 4 types d&apos;animaux (ovins, bovins, caprins, porcins)</li>
              <li>✅ Suivi des traitements vétérinaires</li>
              <li>✅ Gestion des coûts avec répartition multi-catégories</li>
              <li>✅ Calcul automatique des profits</li>
              <li>🔄 Synchronisation en temps réel avec Firebase</li>
              <li>📱 Interface responsive (mobile, tablette, desktop)</li>
            </ul>
          </div>

          <div className="mt-6">
            <h4 className="text-lg font-semibold mb-2">📝 En développement:</h4>
            <ul className="list-none space-y-1 text-gray-700">
              <li>Module Traitements</li>
              <li>Module Coûts</li>
              <li>Module Profits</li>
              <li>Module Rapports</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
