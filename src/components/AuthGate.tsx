"use client";

import { useAppStore } from "@/store/store";
import LoginPage from "./LoginPage";
import Navbar from "./Navbar";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import PullToRefresh from "./PullToRefresh";
import { Wheat } from "lucide-react";
import { usePathname } from "next/navigation";
import styles from "./AppFrame.module.css";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { state } = useAppStore();
  const pathname = usePathname();
  const modernPage = pathname === "/couts" || pathname === "/reproduction";

  if (state.authLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)", background: "var(--farm-bg)", color: "var(--farm-text)" }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-brand-600 flex items-center justify-center">
            <Wheat className="w-6 h-6 text-white" />
          </div>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-stone-600 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!state.user) {
    return <LoginPage />;
  }

  return (
    <div className={styles.shell}>
      <PullToRefresh />

      {/* Sidebar desktop fixe */}
      <Sidebar />

      {/* Contenu principal */}
      <div className={styles.content}>
        {/* Navbar — padding top pour safe area iOS */}
        <div className={styles.top}>
          <Navbar />
        </div>

        {/* Contenu — padding bottom pour la BottomNav + safe area */}
        <main
          className={`${styles.main} ${modernPage ? "" : "legacy-content"}`}
        >
          {children}
        </main>
      </div>

      {/* Bottom nav mobile uniquement */}
      <BottomNav />
    </div>
  );
}
