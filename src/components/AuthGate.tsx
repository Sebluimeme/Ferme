"use client";

import { useAppStore } from "@/store/store";
import LoginPage from "./LoginPage";
import Navbar from "./Navbar";
import Sidebar from "./Sidebar";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { state } = useAppStore();

  if (state.authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">🌾</div>
          <div className="text-gray-400 text-lg">Chargement...</div>
        </div>
      </div>
    );
  }

  if (!state.user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 h-[calc(100vh-4rem)] overflow-y-auto p-4 md:p-6 lg:p-8 bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  );
}
