import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/store/store";
import { ToastProvider } from "@/components/Toast";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "🌾 Gestion Ferme",
  description: "Application de gestion de ferme - Cheptel, traitements, coûts et profits",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="font-sans text-gray-900 bg-gray-50 overflow-x-hidden">
        <AppProvider>
          <ToastProvider>
            <div className="min-h-screen flex flex-col">
              <Navbar />
              <div className="flex flex-1 overflow-hidden">
                <Sidebar />
                <main className="flex-1 h-[calc(100vh-4rem)] overflow-y-auto p-4 md:p-6 lg:p-8 bg-gray-50">
                  {children}
                </main>
              </div>
            </div>
          </ToastProvider>
        </AppProvider>
      </body>
    </html>
  );
}
