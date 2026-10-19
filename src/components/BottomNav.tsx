"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ClipboardList, PawPrint, Wallet, Menu } from "lucide-react";
import { useAppStore } from "@/store/store";
import styles from "./AppFrame.module.css";

const MAIN_ITEMS = [
  { icon: LayoutDashboard, label: "Accueil", route: "/" },
  { icon: ClipboardList, label: "Tâches", route: "/taches" },
  { icon: PawPrint, label: "Animaux", route: "/animaux" },
  { icon: Wallet, label: "Coûts", route: "/couts" },
];
export default function BottomNav() {
  const pathname = usePathname();
  const { state, toggleSidebar } = useAppStore();
  return <nav className={styles.bottomNav} aria-label="Navigation principale"><div className={styles.tabs}>
    {MAIN_ITEMS.map(({ icon: Icon, label, route }) => {
      const active = pathname === route || (route !== "/" && pathname.startsWith(route + "/"));
      return <Link key={route} href={route} className={styles.tab} aria-current={active ? "page" : undefined}><Icon aria-hidden="true" strokeWidth={active ? 2.25 : 1.75} /><span>{label}</span></Link>;
    })}
    <button type="button" onClick={toggleSidebar} className={styles.tab} aria-label="Menu" aria-expanded={state.sidebarOpen} aria-controls="farm-navigation"><Menu aria-hidden="true" strokeWidth={1.75} /><span>Menu</span></button>
  </div></nav>;
}
