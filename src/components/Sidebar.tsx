"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import styles from "./AppFrame.module.css";
import { usePathname } from "next/navigation";
import { useAppStore } from "@/store/store";
import {
  LayoutDashboard,
  ClipboardList,
  PawPrint,
  Syringe,
  Flower,
  Wheat,
  Map,
  Truck,
  Wrench,
  Wallet,
  TrendingUp,
  BarChart3,
  Droplets,
  LogOut,
  ChevronRight,
  Footprints,
  Fuel,
  CloudSun,
  HeartPulse,
  Thermometer,
  X,
} from "lucide-react";

const sections = [
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
      { icon: HeartPulse, label: "Reproduction", route: "/reproduction" },
    ],
  },
  {
    title: "Culture",
    items: [
      { icon: Wheat,       label: "Fourrage",    route: "/fourrage" },
      { icon: Footprints,  label: "Pâturage",    route: "/paturage" },
      { icon: Flower,      label: "Apiculture",  route: "/apiculture" },
      { icon: Map,   label: "Parcellaire", route: "/fourrage/partiels" },
      { icon: Droplets, label: "Arrosage", route: "/arrosage" },
      { icon: Droplets, label: "Eau", route: "/eau" },
      { icon: CloudSun, label: "Météo", route: "/meteo" },
    ],
  },
  {
    title: "Machines",
    items: [
      { icon: Truck,  label: "Véhicules",  route: "/vehicules" },
      { icon: Wrench, label: "Entretiens", route: "/entretiens" },
    ],
  },
  {
    title: "Ecobloc",
    items: [
      { icon: Fuel, label: "Carburant", route: "/carburant" },
    ],
  },
  {
    title: "Bâtiments",
    items: [
      { icon: Thermometer, label: "Chauffage", route: "/chauffage" },
    ],
  },
  {
    title: "Finances",
    items: [
      { icon: Wallet,     label: "Coûts",    route: "/couts" },
      { icon: BarChart3,  label: "Rapports", route: "/rapports" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { state, closeSidebar } = useAppStore();
  const menuRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!state.sidebarOpen) return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    if (desktop.matches) { closeSidebar(); return; }
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Opening changes visibility as well as transform. Let the browser apply
    // that style before focusing; no timer tied to the animation duration.
    let focusFrame = 0;
    const openingFrame = requestAnimationFrame(() => {
      focusFrame = requestAnimationFrame(() => {
        if (!desktop.matches && !menuRef.current?.contains(document.activeElement)) {
          menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
        }
      });
    });
    const onViewportChange = (event: MediaQueryListEvent) => {
      if (!event.matches) return;
      document.body.style.overflow = overflow;
      // The mobile close button disappears on desktop; keep keyboard focus on
      // a visible navigation item instead of leaving it on a hidden control.
      const active = document.activeElement as HTMLElement | null;
      if (!active?.getClientRects().length) {
        const target = menuRef.current?.querySelector<HTMLAnchorElement>('a[aria-current="page"]')
          || menuRef.current?.querySelector<HTMLAnchorElement>("a[href]");
        target?.focus({ preventScroll: true });
      }
      closeSidebar();
    };
    const onKey = (event: KeyboardEvent) => {
      if (desktop.matches) return;
      if (event.key === "Escape") { event.preventDefault(); closeSidebar(); }
      if (event.key !== "Tab") return;
      const elements = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("a[href],button") || []).filter(e => e.getClientRects().length);
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    desktop.addEventListener("change", onViewportChange);
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(openingFrame);
      cancelAnimationFrame(focusFrame);
      desktop.removeEventListener("change", onViewportChange);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (previous?.isConnected && previous.getClientRects().length) previous.focus({ preventScroll: true });
    };
  }, [state.sidebarOpen, closeSidebar]);
  const handleLogout = async () => { const { logout } = await import("@/lib/auth-service"); await logout(); };
  return <>
    {state.sidebarOpen && <div className={styles.backdrop} onClick={closeSidebar} aria-hidden="true" />}
    <aside id="farm-navigation" ref={menuRef} data-modal-root={state.sidebarOpen ? "true" : undefined} className={`${styles.sidebar} ${state.sidebarOpen ? styles.sidebarOpen : ""}`} aria-label="Menu de la ferme">
      <div className={styles.sidebarHeader}><span className={styles.brand}><Wheat aria-hidden="true" /><span>La Ferme</span></span><button type="button" className={`${styles.iconButton} ${styles.mobileControl}`} onClick={closeSidebar} aria-label="Fermer le menu"><X aria-hidden="true" /></button></div>
      <nav className={styles.sidebarNav} aria-label="Toutes les rubriques">
        {sections.map(section => <section key={section.title} className={styles.sidebarSection}>
          <h2 className={styles.sidebarTitle}>{section.title}</h2>
          {section.items.map(item => { const Icon = item.icon; const active = pathname === item.route || (item.route !== "/" && pathname.startsWith(item.route + "/") && item.route !== "/fourrage"); return <Link key={item.route} href={item.route} onClick={closeSidebar} className={styles.sidebarLink} aria-current={active ? "page" : undefined}><Icon aria-hidden="true" /><span>{item.label}</span></Link>; })}
        </section>)}
      </nav>
      <div className={styles.sidebarFooter}><button type="button" onClick={handleLogout} className={`${styles.sidebarLink} ${styles.logout}`}><LogOut aria-hidden="true" />Déconnexion</button></div>
    </aside>
  </>;
}
