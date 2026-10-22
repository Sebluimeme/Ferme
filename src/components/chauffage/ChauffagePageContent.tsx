"use client";

import { useChauffage } from "@/hooks/useChauffage";
import HeatingDashboard from "./HeatingDashboard";

export default function ChauffagePageContent() {
  const { status, loading, error, refreshing, refresh, offline } = useChauffage();
  return <HeatingDashboard status={status} loading={loading} error={error} refreshing={refreshing} offline={offline} onRefresh={refresh} />;
}
