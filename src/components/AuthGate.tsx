"use client";

import { useAppStore } from "@/store/store";
import LoginPage from "./LoginPage";
import Navbar from "./Navbar";
import Sidebar from "./Sidebar";
import { Wheat } from "lucide-react";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { state } = useAppStore();

  if (state.authLoading) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center">
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
    <div className="min-h-screen flex bg-stone-100">
      <Sidebar />
      <div className="flex flex-col flex-1 lg:ml-[220px] min-h-screen">
        <Navbar />
        <main className="flex-1 overflow-y-auto p-5 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
