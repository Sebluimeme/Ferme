import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProvider } from "@/store/store";
import { ToastProvider } from "@/components/Toast";
import AuthGate from "@/components/AuthGate";
import RegisterSW from "./register-sw";

export const metadata: Metadata = {
  title: "La Ferme Tabouche",
  description: "Application de gestion de ferme — Cheptel, coûts, véhicules, fourrage",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "La Ferme",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1c1e" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="font-sans antialiased">
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
