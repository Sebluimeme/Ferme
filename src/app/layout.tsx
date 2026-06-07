import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/store/store";
import { ToastProvider } from "@/components/Toast";
import AuthGate from "@/components/AuthGate";
import RegisterSW from "./register-sw";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  title: "La Ferme Tabouche",
  description: "Application de gestion de ferme — Cheptel, coûts, véhicules, fourrage",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "La Ferme",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0c0a09",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${dmSans.variable} font-sans text-stone-900 bg-stone-100 overflow-x-hidden antialiased`}>
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
