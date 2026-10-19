"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Wheat } from "lucide-react";
import { useAppStore } from "@/store/store";
import styles from "./AppFrame.module.css";

export default function Navbar() {
  const { state, toggleSidebar } = useAppStore();
  const pathname = usePathname();
  return <header className={styles.navbar}>
    <Link href="/" className={styles.brand} aria-label="La Ferme Tabouche — accueil"><Wheat aria-hidden="true" /><span>La Ferme Tabouche</span></Link>
    <button type="button" className={`${styles.iconButton} ${styles.mobileControl}`} onClick={toggleSidebar} aria-label="Ouvrir le menu" aria-expanded={state.sidebarOpen} aria-controls="farm-navigation"><Menu aria-hidden="true" /></button>
    {pathname === "/couts" && <span className={styles.breadcrumb}>Achats et recettes</span>}
  </header>;
}
