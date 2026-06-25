"use client";

import { useAppStore } from "@/store/store";
import LoginPage from "./LoginPage";
import Navbar from "./Navbar";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import { Wheat } from "lucide-react";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { state } = useAppStore();

  if (state.authLoading) {
    return (
      <div className="min-h-[100dvh] bg-stone-950 flex items-center justify-center"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
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
    <div className="flex bg-stone-100 w-screen overflow-hidden" style={{ minHeight: "100dvh" }}>
      {/* Sidebar desktop fixe */}
      <Sidebar />

      {/* Contenu principal */}
      <div className="flex flex-col flex-1 min-w-0 lg:ml-[220px] min-h-[100dvh]">
        {/* Navbar — padding top pour safe area iOS */}
        <div style={{ paddingTop: "env(safe-area-inset-top, 0px)" }} className="bg-white border-b border-stone-200 sticky top-0 z-[1020]">
          <Navbar />
        </div>

        {/* Contenu — padding bottom pour la BottomNav + safe area */}
        <main
          className="flex-1 overflow-y-auto overflow-x-hidden w-full max-w-full p-4 md:p-6 lg:p-8 lg:pb-8"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 3.75rem)" }}
        >
          <div className="lg:pb-0" style={{ paddingBottom: 0 }}>
            {children}
          </div>
        </main>
      </div>

      {/* Bottom nav mobile uniquement */}
      <BottomNav />
    </div>
  );
}
