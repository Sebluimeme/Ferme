import { Suspense } from "react";
import AnimauxPageContent from "@/components/AnimauxPageContent";

export default function AnimauxPage() {
  return (
    <Suspense fallback={<div className="fade-in text-center py-16">Chargement...</div>}>
      <AnimauxPageContent />
    </Suspense>
  );
}
