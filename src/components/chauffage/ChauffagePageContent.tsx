"use client";

import { useChauffage } from "@/hooks/useChauffage";
import { useState } from "react";
import { useHeatingHistory, type HeatingHistoryRange } from "@/hooks/useHeatingHistory";
import type { HeatingHistoryKey } from "@/lib/chauffage-history";
import HeatingDashboard from "./HeatingDashboard";
import HeatingHistoryPanel from "./HeatingHistoryPanel";
import HeatingControlPanel from "./HeatingControlPanel";
import { useHeatingControl } from "@/hooks/useHeatingControl";

export default function ChauffagePageContent() {
  const { status, loading, error, refreshing, refresh, offline } = useChauffage();
  const [selected, setSelected] = useState<HeatingHistoryKey | null>(null);
  const [range, setRange] = useState<HeatingHistoryRange>(() => ({ start: Date.now() - 86_400_000, end: Date.now() }));
  const history = useHeatingHistory(selected, range);
  const control = useHeatingControl();
  const metrics = { ...status.measurements, fuelSetpoint: status.fuel.setpoint, servo: status.diagnostics.servo };
  function select(key: HeatingHistoryKey) {
    const end = Date.now();
    setRange({ start: end - 86_400_000, end });
    setSelected(key);
  }
  return <>
    <HeatingDashboard status={status} loading={loading} error={error} refreshing={refreshing} offline={offline} onRefresh={refresh} onSelectMetric={select} controlPanel={<HeatingControlPanel status={control.status} loading={control.loading} offline={control.offline} busy={control.busy} error={control.error} result={control.result} onSave={control.save} />} />
    {selected && <HeatingHistoryPanel metricKey={selected} metric={metrics[selected]} points={history.points} loading={history.loading} error={history.error} offline={offline} range={range} onRangeChange={setRange} onClose={() => setSelected(null)} />}
  </>;
}
