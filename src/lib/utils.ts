export function formatDate(dateString: string | null | undefined, format: "short" | "long" | "time" = "short"): string {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "-";

  const options: Record<string, Intl.DateTimeFormatOptions> = {
    short: { day: "2-digit", month: "2-digit", year: "numeric" },
    long: { day: "numeric", month: "long", year: "numeric" },
    time: { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" },
  };
  return date.toLocaleDateString("fr-FR", options[format]);
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "-";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(amount);
}

export function formatNumber(number: number | null | undefined, decimals = 0): string {
  if (number === null || number === undefined) return "-";
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(number);
}

export function calculateAge(birthDate: string): number {
  if (!birthDate) return 0;
  const birth = new Date(birthDate);
  const today = new Date();
  let months = (today.getFullYear() - birth.getFullYear()) * 12;
  months -= birth.getMonth();
  months += today.getMonth();
  return months <= 0 ? 0 : months;
}

export function formatAge(months: number): string {
  if (months === null || months === undefined) return "-";
  if (months === 0) return "< 1 mois";
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (years === 0) return `${remainingMonths} mois`;
  if (remainingMonths === 0) return `${years} an${years > 1 ? "s" : ""}`;
  return `${years} an${years > 1 ? "s" : ""} ${remainingMonths} mois`;
}

export function formatAgeFromBirthDate(dateNaissance: string | undefined): string {
  if (!dateNaissance) return "-";
  const birth = new Date(dateNaissance);
  if (isNaN(birth.getTime())) return "-";
  const today = new Date();
  let months = (today.getFullYear() - birth.getFullYear()) * 12;
  months -= birth.getMonth();
  months += today.getMonth();
  if (months <= 0) {
    const diffTime = today.getTime() - birth.getTime();
    const days = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
    if (days === 0) return "Né aujourd'hui";
    return `${days} jour${days > 1 ? "s" : ""}`;
  }
  return formatAge(months);
}

export function getAnimalIcon(type: string): string {
  const icons: Record<string, string> = { ovin: "🐑", bovin: "🐄", caprin: "🐐", porcin: "🐷" };
  return icons[type] || "🐾";
}

export function getAnimalColor(type: string): string {
  const colors: Record<string, string> = {
    ovin: "var(--color-ovin)",
    bovin: "var(--color-bovin)",
    caprin: "var(--color-caprin)",
    porcin: "var(--color-porcin)",
  };
  return colors[type] || "#6b7280";
}

export function getAnimalLabel(type: string): string {
  const labels: Record<string, string> = { ovin: "Ovin", bovin: "Bovin", caprin: "Caprin", porcin: "Porcin" };
  return labels[type] || type;
}

export function getAnimalTailwindColor(type: string): string {
  const colors: Record<string, string> = {
    ovin: "text-ovin",
    bovin: "text-bovin",
    caprin: "text-caprin",
    porcin: "text-porcin",
  };
  return colors[type] || "text-gray-500";
}

export function getAnimalBorderColor(type: string): string {
  const colors: Record<string, string> = {
    ovin: "border-l-ovin",
    bovin: "border-l-bovin",
    caprin: "border-l-caprin",
    porcin: "border-l-porcin",
  };
  return colors[type] || "border-l-gray-500";
}

export function getAnimalBgColor(type: string): string {
  const colors: Record<string, string> = {
    ovin: "bg-ovin/10 text-ovin",
    bovin: "bg-bovin/10 text-bovin",
    caprin: "bg-caprin/10 text-caprin",
    porcin: "bg-porcin/10 text-porcin",
  };
  return colors[type] || "bg-gray-100 text-gray-500";
}
