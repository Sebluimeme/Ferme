"use client";

interface PlaceholderPageProps {
  icon: string;
  title: string;
  subtitle?: string;
}

export default function PlaceholderPage({ icon, title, subtitle = "En cours de développement..." }: PlaceholderPageProps) {
  return (
    <div className="text-center py-24 fade-in">
      <div className="text-6xl mb-4">{icon}</div>
      <h2 className="text-3xl font-bold mb-2">{title}</h2>
      <p className="text-gray-600">{subtitle}</p>
    </div>
  );
}
