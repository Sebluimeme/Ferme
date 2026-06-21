"use client";

interface KpiCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: { value: string; positive?: boolean };
  borderColorClass?: string;  // legacy — ignoré
  valueColorClass?: string;   // legacy — ignoré
  onClick?: () => void;
}

export default function KpiCard({ label, value, subtitle, icon, trend, onClick }: KpiCardProps) {
  return (
    <div
      className={`bg-white border border-stone-200 rounded-xl p-5 hover:border-stone-300 hover:shadow-sm transition-all ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-stone-400">{label}</p>
        {icon && (
          <div className="w-7 h-7 rounded-lg bg-stone-100 flex items-center justify-center text-stone-500">
            {icon}
          </div>
        )}
      </div>

      <p className="text-[20px] sm:text-[26px] font-semibold text-stone-900 tracking-[-0.5px] leading-tight break-words">
        {value}
      </p>

      {subtitle && (
        <p className="text-[12px] text-stone-400 mt-1.5">{subtitle}</p>
      )}

      {trend && (
        <div className="flex items-center gap-1 mt-2">
          <span className={`text-[12px] font-medium ${trend.positive ? "text-brand-600" : "text-red-500"}`}>
            {trend.value}
          </span>
        </div>
      )}
    </div>
  );
}
