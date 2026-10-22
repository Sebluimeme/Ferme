import type { Metadata } from "next";
import ChauffagePageContent from "@/components/chauffage/ChauffagePageContent";

export const metadata: Metadata = { title: "Chauffage · La Ferme Tabouche" };

export default function ChauffagePage() {
  return <ChauffagePageContent />;
}
