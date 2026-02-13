"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/store/store";

export default function Navbar() {
  const { state, toggleSidebar } = useAppStore();
  const [dateStr, setDateStr] = useState("");

  useEffect(() => {
    setDateStr(
      new Date().toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    );
  }, []);

  const alertCount = state.alertes.length;

  return (
    <nav className="sticky top-0 left-0 right-0 h-16 bg-white border-b border-gray-200 z-[1020] shadow-sm">
      <div className="flex items-center justify-between px-6 h-full">
        <div className="flex items-center gap-4">
          <button
            className="lg:hidden bg-transparent border-none text-2xl cursor-pointer"
            onClick={toggleSidebar}
          >
            ☰
          </button>
          <h1 className="text-2xl font-bold m-0 flex items-center gap-2">
            🌾 <span>Gestion Ferme</span>
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:block text-gray-600 text-sm">{dateStr}</div>
          <button className="relative text-xl" title="Notifications">
            🔔
            {alertCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 text-[10px] bg-red-100 text-red-800 rounded-full flex items-center justify-center font-medium">
                {alertCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </nav>
  );
}
