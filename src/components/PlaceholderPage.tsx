1|"use client";
2|
3|interface PlaceholderPageProps {
4|  icon: string;
5|  title: string;
6|  subtitle?: string;
7|}
8|
9|export default function PlaceholderPage({ icon, title, subtitle = "En cours de développement..." }: PlaceholderPageProps) {
10|  return (
11|    <div className="text-center py-24 fade-in">
12|      <div className="text-6xl mb-4">{icon}</div>
13|      <h2 className="text-3xl font-bold mb-2">{title}</h2>
14|      <p className="text-stone-600">{subtitle}</p>
15|    </div>
16|  );
17|}
18|