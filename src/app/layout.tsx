import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProvider } from "@/store/store";
import { ToastProvider } from "@/components/Toast";
import AuthGate from "@/components/AuthGate";
import RegisterSW from "./register-sw";

export const metadata: Metadata = {
  title: "🌾 Gestion Ferme",
  description: "Application de gestion de ferme - Cheptel, traitements, coûts et profits",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Gestion Ferme",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#10b981",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="font-sans text-gray-900 bg-gray-50 overflow-x-hidden">
        <RegisterSW />
        <AppProvider>
          <ToastProvider>
            <AuthGate>
              {children}
            </AuthGate>
          </ToastProvider>
        </AppProvider>
      </body>
    </html>
  );
}
