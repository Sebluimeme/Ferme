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
      className={`bg-white rounded-xl shadow-sm hover:shadow-md transition-all text-center p-6 border-l-4 ${borderColorClass || "border-l-transparent"} ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <div className="text-sm text-gray-600 uppercase tracking-wider">{label}</div>
      <div className={`text-4xl font-bold my-3 ${valueColorClass || "text-primary"}`}>{value}</div>
      {subtitle && <div className="text-sm text-gray-500">{subtitle}</div>}
    </div>
  );
}
