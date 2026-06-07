"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  PawPrint,
  Wallet,
  Menu,
} from "lucide-react";
import { useAppStore } from "@/store/store";

const MAIN_ITEMS = [
  { icon: LayoutDashboard, label: "Accueil",  route: "/" },
  { icon: ClipboardList,   label: "Tâches",   route: "/taches" },
  { icon: PawPrint,        label: "Animaux",  route: "/animaux" },
  { icon: Wallet,          label: "Coûts",    route: "/couts" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { toggleSidebar } = useAppStore();

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-[1025] bg-stone-950 border-t border-stone-800/60"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-stretch h-14">
        {MAIN_ITEMS.map(({ icon: Icon, label, route }) => {
          const isActive = pathname === route;
          return (
            <Link
              key={route}
              href={route}
              className="flex-1 flex flex-col items-center justify-center gap-1 no-underline transition-colors"
            >
              <Icon
                className={`w-5 h-5 ${isActive ? "text-brand-400" : "text-stone-500"}`}
                strokeWidth={isActive ? 2.5 : 1.75}
              />
              <span className={`text-[10px] font-medium ${isActive ? "text-brand-400" : "text-stone-500"}`}>
                {label}
              </span>
            </Link>
          );
        })}

        {/* Bouton Menu → ouvre la sidebar complète */}
        <button
          onClick={toggleSidebar}
          className="flex-1 flex flex-col items-center justify-center gap-1 cursor-pointer"
        >
          <Menu className="w-5 h-5 text-stone-500" strokeWidth={1.75} />
          <span className="text-[10px] font-medium text-stone-500">Menu</span>
        </button>
      </div>
    </nav>
  );
}
