"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WaterLevelChartPoint } from "@/lib/citerneHistory";

function formatDate(dateFull: string) {
  return new Date(`${dateFull}T00:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

export default function TankLevelHistoryChart({
  data,
  hasTraceableHistory,
}: {
  data: WaterLevelChartPoint[];
  hasTraceableHistory: boolean;
}) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-stone-800">Évolution du niveau d&apos;eau</h2>
        <p className="mt-1 text-xs text-stone-500">Citerne 1 en pourcentage, Citerne 2 en hauteur d&apos;eau (cm).</p>
      </div>
      {!hasTraceableHistory ? (
        <p className="rounded-lg bg-stone-50 px-3 py-8 text-center text-sm text-stone-600">
          Deux mesures de niveau sont nécessaires pour tracer l&apos;évolution.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data.map((point) => ({ ...point, date: formatDate(point.dateFull) }))} margin={{ top: 5, right: 12, left: -12, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#57534e" }} />
            <YAxis
              yAxisId="citerne1"
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: "#0284c7" }}
              tickFormatter={(value) => `${value} %`}
              width={48}
            />
            <YAxis
              yAxisId="citerne2"
              orientation="right"
              tick={{ fontSize: 10, fill: "#16a34a" }}
              tickFormatter={(value) => `${Number(value).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} cm`}
              width={52}
            />
            <Tooltip
              formatter={(value: unknown, name: unknown) => {
                const unit = name === "Citerne 1" ? "%" : "cm";
                return [value != null ? `${Number(value).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ${unit}` : "—", String(name)];
              }}
              labelStyle={{ fontSize: 12 }}
              contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            <Line
              type="monotone"
              yAxisId="citerne1"
              dataKey="citerne1"
              name="Citerne 1"
              stroke="#0284c7"
              strokeWidth={2.5}
              dot={{ r: 4, fill: "#0284c7" }}
              activeDot={{ r: 6 }}
              connectNulls
            />
            <Line
              type="monotone"
              yAxisId="citerne2"
              dataKey="citerne2"
              name="Citerne 2"
              stroke="#16a34a"
              strokeWidth={2.5}
              dot={{ r: 4, fill: "#16a34a" }}
              activeDot={{ r: 6 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
