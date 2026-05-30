"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppStore } from "@/store/store";

interface NavItem {
  icon: string;
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
      { icon: "📊", label: "Tableau de bord", route: "/" },
      { icon: "📋", label: "Tâches", route: "/taches" },
    ],
  },
  {
    title: "Cheptel",
    items: [
      { icon: "🐾", label: "Mes Animaux", route: "/animaux" },
      { icon: "💉", label: "Traitements", route: "/traitements" },
    ],
  },
  {
    title: "Culture",
    items: [
      { icon: "🌾", label: "Fourrage", route: "/fourrage" },
      { icon: "🗺️", label: "Parcellaire", route: "/fourrage/partiels" },
    ],
  },
  {
    title: "Parc Machine",
    items: [
      { icon: "🚗", label: "Véhicules", route: "/vehicules" },
      { icon: "🔧", label: "Entretiens", route: "/entretiens" },
    ],
  },
  {
    title: "Financier",
    items: [
      { icon: "💰", label: "Coûts", route: "/couts" },
      { icon: "📈", label: "Profits", route: "/profits" },
    ],
  },
  {
    title: "Autres",
    items: [
      { icon: "📊", label: "Rapports", route: "/rapports" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { state, closeSidebar } = useAppStore();

  return (
    <>
      {state.sidebarOpen && (
        <div
          className="fixed inset-0 top-16 bg-black/50 z-[1029] lg:hidden"
          onClick={closeSidebar}
        />
      )}
      <aside
        className={`w-[250px] h-[calc(100vh-4rem)] bg-white border-r border-gray-200 overflow-y-auto sticky top-16 left-0 shrink-0 transition-all duration-200
          max-lg:fixed max-lg:top-16 max-lg:z-[1030] max-lg:shadow-xl
          ${state.sidebarOpen ? "max-lg:left-0" : "max-lg:-left-full"}
        `}
      >
        <nav className="py-6">
          {sections.map((section) => (
            <div key={section.title} className="px-4 mb-6">
              <div className="text-xs font-semibold uppercase text-gray-500 mb-2 tracking-wider">
                {section.title}
              </div>
              {section.items.map((item) => {
                const isActive = pathname === item.route;
                return (
                  <Link
                    key={item.route}
                    href={item.route}
                    onClick={closeSidebar}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg mb-1 text-sm no-underline transition-all duration-200 ${
                      isActive
                        ? "bg-gradient-to-br from-primary to-secondary text-white font-semibold"
                        : "text-gray-700 hover:bg-gray-100 hover:text-primary"
                    }`}
                  >
                    <span className="text-xl">{item.icon}</span>
                    <span>{item.label}</span>
                    {item.badge && (
                      <span className="ml-auto text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
