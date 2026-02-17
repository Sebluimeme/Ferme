"use client";

interface KpiCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  borderColorClass?: string;
  valueColorClass?: string;
  onClick?: () => void;
}

export default function KpiCard({ label, value, subtitle, borderColorClass, valueColorClass, onClick }: KpiCardProps) {
  return (
    <div
      className={`bg-white rounded-lg shadow-sm hover:shadow-md transition-all text-center px-4 py-3 border-l-4 ${borderColorClass || "border-l-transparent"} ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <div className="text-xs text-gray-600 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold my-1 ${valueColorClass || "text-primary"}`}>{value}</div>
      {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
    </div>
  );
}
