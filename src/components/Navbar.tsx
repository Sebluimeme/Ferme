"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/store/store";
import { Bell, Menu } from "lucide-react";
import { usePathname } from "next/navigation";

const PAGE_LABELS: Record<string, string> = {
  "/":                  "Tableau de bord",
  "/taches":            "Tâches",
  "/animaux":           "Animaux",
  "/traitements":       "Traitements",
  "/fourrage":          "Fourrage",
  "/paturage":          "Pâturage",
  "/apiculture":        "Apiculture",
  "/fourrage/partiels": "Parcellaire",
  "/source":            "Source",
  "/vehicules":         "Véhicules",
  "/entretiens":        "Entretiens",
  "/couts":             "Coûts",
  "/profits":           "Profits",
  "/rapports":          "Rapports",
};

export default function Navbar() {
  const { state, toggleSidebar } = useAppStore();
  const [dateStr, setDateStr] = useState("");
  const pathname = usePathname();

  useEffect(() => {
    setDateStr(
      new Date().toLocaleDateString("fr-FR", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    );
  }, []);

  const alertCount = state.alertes.length;
  const pageLabel = PAGE_LABELS[pathname] ?? "";

  return (
    <header className="h-14 bg-white flex items-center justify-between px-4 md:px-6"
      style={{ paddingRight: "max(env(safe-area-inset-right, 0px), 1.5rem)" }}>
      {/* Left */}
      <div className="flex items-center gap-3">
        <button
          className="lg:hidden w-8 h-8 rounded-lg hover:bg-stone-100 flex items-center justify-center transition-colors cursor-pointer"
          onClick={toggleSidebar}
        >
          <Menu className="w-4 h-4 text-stone-500" />
        </button>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-[13px]">
          <span className="text-stone-400 hidden sm:block">La Ferme Tabouche</span>
          {pageLabel && (
            <>
              <span className="text-stone-300 hidden sm:block">/</span>
              <span className="text-stone-800 font-medium">{pageLabel}</span>
            </>
          )}
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-stone-400 font-mono hidden lg:block">{dateStr}</span>

        <button
          className="relative w-8 h-8 rounded-lg hover:bg-stone-100 flex items-center justify-center transition-colors cursor-pointer"
          title="Notifications"
        >
          <Bell className="w-4 h-4 text-stone-500" />
          {alertCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-brand-500" />
          )}
        </button>

        {/* Avatar initiales */}
        <div className="w-8 h-8 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center text-[11px] font-semibold text-stone-600 select-none">
          SB
        </div>
      </div>
    </header>
  );
}
