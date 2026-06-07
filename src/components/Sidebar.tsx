"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppStore } from "@/store/store";
import {
  LayoutDashboard,
  ClipboardList,
  PawPrint,
  Syringe,
  Wheat,
  Map,
  Truck,
  Wrench,
  Wallet,
  TrendingUp,
  BarChart3,
  LogOut,
  ChevronRight,
} from "lucide-react";

interface NavItem {
  icon: React.ElementType;
  label: string;
  route: string;
  badge?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    title: "Principal",
    items: [
      { icon: LayoutDashboard, label: "Tableau de bord", route: "/" },
      { icon: ClipboardList,   label: "Tâches",          route: "/taches" },
    ],
  },
  {
    title: "Cheptel",
    items: [
      { icon: PawPrint, label: "Mes Animaux",  route: "/animaux" },
      { icon: Syringe,  label: "Traitements",  route: "/traitements" },
    ],
  },
  {
    title: "Culture",
    items: [
      { icon: Wheat, label: "Fourrage",    route: "/fourrage" },
      { icon: Map,   label: "Parcellaire", route: "/fourrage/partiels" },
    ],
  },
  {
    title: "Machines",
    items: [
      { icon: Truck,   label: "Véhicules",  route: "/vehicules" },
      { icon: Wrench,  label: "Entretiens", route: "/entretiens" },
    ],
  },
  {
    title: "Finances",
    items: [
      { icon: Wallet,     label: "Coûts",   route: "/couts" },
      { icon: TrendingUp, label: "Profits", route: "/profits" },
      { icon: BarChart3,  label: "Rapports", route: "/rapports" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { state, closeSidebar, dispatch } = useAppStore();

  const handleLogout = async () => {
    const { logout } = await import("@/lib/auth-service");
    await logout();
  };

  return (
    <>
      {/* Overlay mobile */}
      {state.sidebarOpen && (
        <div
          className="fixed inset-0 top-0 bg-black/40 z-[1029] lg:hidden"
          onClick={closeSidebar}
        />
      )}

      <aside
        className={`
          w-[220px] h-screen bg-stone-950 flex flex-col shrink-0
          border-r border-stone-800/60
          fixed top-0 left-0 z-[1030]
          transition-transform duration-200
          lg:translate-x-0
          ${state.sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        {/* Logo */}
        <div className="px-4 py-5 border-b border-stone-800/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shrink-0">
              <Wheat className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-white leading-none">La Ferme</p>
              <p className="text-[11px] text-stone-500 leading-none mt-0.5">Tabouche</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-5">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-600">
                {section.title}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = pathname === item.route;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.route}
                      href={item.route}
                      onClick={closeSidebar}
                      className={`
                        flex items-center gap-2.5 px-2 py-1.5 rounded-md
                        text-[13px] font-medium transition-colors no-underline
                        ${isActive
                          ? "bg-stone-800 text-white"
                          : "text-stone-400 hover:text-stone-100 hover:bg-stone-800/50"}
                      `}
                    >
                      <Icon className={`w-[15px] h-[15px] shrink-0 ${isActive ? "text-brand-400" : ""}`} />
                      <span>{item.label}</span>
                      {item.badge && (
                        <span className="ml-auto text-[10px] font-semibold bg-stone-700 text-stone-300 px-1.5 py-0.5 rounded-full">
                          {item.badge}
                        </span>
                      )}
                      {isActive && (
                        <ChevronRight className="w-3 h-3 text-stone-600 ml-auto" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-stone-800/60 shrink-0">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 px-2 py-1.5 w-full rounded-md text-[13px] text-stone-500 hover:text-stone-300 hover:bg-stone-800/50 transition-colors cursor-pointer"
          >
            <LogOut className="w-[15px] h-[15px]" />
            Déconnexion
          </button>
        </div>
      </aside>
    </>
  );
}
