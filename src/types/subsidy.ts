import type { Transaction } from "@/types/comptabilite";
import { KNOWN_PAYERS, normalizePayer } from "@/lib/comptabilite-payers";
import { parseMoneyCents } from "@/types/purchase-invoice";

export const SUBSIDY_SCHEMES = [
  { value: "pac_base", label: "PAC · Aide de base au revenu" },
  { value: "pac_redistributif", label: "PAC · Aide redistributive" },
  { value: "pac_acja", label: "PAC · Aide complémentaire jeune agriculteur" },
  { value: "ichn", label: "ICHN · Handicap naturel" },
  { value: "ecoregime", label: "PAC · Écorégime" },
  { value: "bovine", label: "Aide bovine" },
  { value: "ovine", label: "Aide ovine" },
  { value: "caprine", label: "Aide caprine" },
  { value: "cab", label: "Bio · Aide à la conversion" },
  { value: "maec", label: "MAEC · Mesure agroenvironnementale" },
  { value: "dja", label: "DJA · Dotation jeune agriculteur" },
  { value: "autre", label: "Autre aide" },
] as const;

export const SUBSIDY_TRANCHES = [
  { value: "avance", label: "Avance" },
  { value: "acompte", label: "Acompte" },
  { value: "solde", label: "Solde" },
  { value: "unique", label: "Versement unique" },
] as const;

export type SubsidyScheme = (typeof SUBSIDY_SCHEMES)[number]["value"];
export type SubsidyTranche = (typeof SUBSIDY_TRANCHES)[number]["value"];
export interface SubsidyMetadata {
  dispositif: SubsidyScheme;
  campagne: number;
  tranche: SubsidyTranche;
  organisme: string;
  /** Information de référence, jamais additionnée aux recettes encaissées. */
  montantReferenceAnnuelCentimes?: number;
  documentDate?: string;
  engagementDebut?: string;
  engagementFin?: string;
  sourceDocumentSha256?: string;
}

/** Un versement reçu pour un dispositif = une seule écriture de recette. */
export interface SubsidyPayment extends Transaction {
  operation: "Revenus";
  nature: "exploitation";
  subvention: SubsidyMetadata;
  versionSubvention: number;
  montantCentimes: number;
}

export interface SubsidyDraft {
  id: string;
  date: string;
  montant: string;
  payeur: string;
  production: string;
  dispositif: string;
  campagne: string;
  tranche: string;
  organisme: string;
  reference: string;
  remarque: string;
  montantReferenceAnnuel: string;
  documentDate: string;
  engagementDebut: string;
  engagementFin: string;
  version?: number;
}

function localDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function makeEmptySubsidyDraft(): SubsidyDraft {
  return { id: crypto.randomUUID(), date: "", montant: "", payeur: "", production: "Ferme", dispositif: "", campagne: String(new Date().getFullYear()), tranche: "unique", organisme: "", reference: "", remarque: "", montantReferenceAnnuel: "", documentDate: "", engagementDebut: "", engagementFin: "", version: 0 };
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateSubsidyDraft(draft: SubsidyDraft): { valid: boolean; errors: string[]; montantCentimes: number } {
  const errors: string[] = [];
  const fields = ["id", "date", "montant", "payeur", "production", "dispositif", "campagne", "tranche", "organisme", "reference", "remarque", "montantReferenceAnnuel", "documentDate", "engagementDebut", "engagementFin"] as const;
  if (!draft || typeof draft !== "object" || fields.some((key) => typeof draft[key] !== "string")) return { valid: false, errors: ["Le versement est incomplet."], montantCentimes: 0 };
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(draft.id)) errors.push("L’identifiant du versement est invalide.");
  if (!validDate(draft.date) || draft.date > localDate()) errors.push("Indiquez la date réelle d’encaissement, aujourd’hui ou avant.");
  const montantCentimes = parseMoneyCents(draft.montant);
  if (montantCentimes === null || montantCentimes <= 0) errors.push("Indiquez le montant réellement reçu, positif et avec deux décimales maximum.");
  if (!(KNOWN_PAYERS as readonly string[]).includes(normalizePayer(draft.payeur))) errors.push("Choisissez le compte qui a réellement encaissé l’aide.");
  if (!draft.production.trim() || draft.production.length > 240) errors.push("Choisissez une production ou la ferme entière.");
  if (!SUBSIDY_SCHEMES.some(({ value }) => value === draft.dispositif)) errors.push("Choisissez le dispositif d’aide.");
  if (!/^\d{4}$/.test(draft.campagne) || Number(draft.campagne) < 2000 || Number(draft.campagne) > 2100) errors.push("Indiquez une campagne valide (année sur quatre chiffres).");
  if (!SUBSIDY_TRANCHES.some(({ value }) => value === draft.tranche)) errors.push("Choisissez le type de versement.");
  if (draft.organisme.length > 240 || draft.reference.length > 240 || draft.remarque.length > 4000) errors.push("L’organisme, la référence ou les notes sont trop longs.");
  if (draft.montantReferenceAnnuel.trim()) {
    const referenceAmount = parseMoneyCents(draft.montantReferenceAnnuel);
    if (referenceAmount === null || referenceAmount <= 0) errors.push("Le montant annuel de référence doit être positif, avec deux décimales maximum, ou rester vide.");
  }
  for (const [value, label] of [[draft.documentDate, "document"], [draft.engagementDebut, "début d’engagement"], [draft.engagementFin, "fin d’engagement"]]) {
    if (value && !validDate(value)) errors.push(`La date de ${label} est invalide.`);
  }
  if (draft.engagementDebut && draft.engagementFin && draft.engagementFin < draft.engagementDebut) errors.push("La fin d’engagement doit suivre son début.");
  return { valid: errors.length === 0, errors, montantCentimes: montantCentimes ?? 0 };
}

export function isSubsidyPayment(transaction: Transaction | null | undefined): transaction is SubsidyPayment {
  if (!transaction) return false;
  const payment = transaction as Partial<SubsidyPayment>;
  return !!payment.subvention && typeof payment.subvention === "object"
    && SUBSIDY_SCHEMES.some(({ value }) => value === payment.subvention?.dispositif)
    && SUBSIDY_TRANCHES.some(({ value }) => value === payment.subvention?.tranche)
    && Number.isInteger(payment.subvention.campagne) && typeof payment.subvention.organisme === "string"
    && Number.isInteger(payment.versionSubvention) && (payment.versionSubvention ?? 0) > 0
    && Number.isSafeInteger(payment.montantCentimes) && (payment.montantCentimes ?? 0) > 0
    && Number.isFinite(payment.montant) && Math.round((payment.montant ?? 0) * 100) === payment.montantCentimes
    && payment.operation === "Revenus" && payment.nature === "exploitation";
}

export function subsidyToDraft(payment: SubsidyPayment): SubsidyDraft {
  const aid = payment.subvention;
  return { id: payment.id, date: payment.date, montant: (payment.montantCentimes / 100).toFixed(2), payeur: normalizePayer(payment.payeur), production: payment.production, dispositif: aid.dispositif, campagne: String(aid.campagne), tranche: aid.tranche, organisme: aid.organisme || "", reference: payment.reference || "", remarque: payment.remarque || "", montantReferenceAnnuel: aid.montantReferenceAnnuelCentimes === undefined ? "" : (aid.montantReferenceAnnuelCentimes / 100).toFixed(2), documentDate: aid.documentDate || "", engagementDebut: aid.engagementDebut || "", engagementFin: aid.engagementFin || "", version: payment.versionSubvention };
}

export function buildSubsidyPayment(draft: SubsidyDraft, options: { previous?: SubsidyPayment; pieceJointe?: Transaction["pieceJointe"]; now?: string; sourceDocumentSha256?: string } = {}): SubsidyPayment {
  const validation = validateSubsidyDraft(draft);
  if (!validation.valid) throw new Error(validation.errors.join(" "));
  const scheme = SUBSIDY_SCHEMES.find(({ value }) => value === draft.dispositif)!;
  const tranche = SUBSIDY_TRANCHES.find(({ value }) => value === draft.tranche)!;
  const now = options.now || new Date().toISOString();
  const pieceJointe = options.pieceJointe || options.previous?.pieceJointe;
  const attachmentChanged = options.pieceJointe && options.pieceJointe.storagePath !== options.previous?.pieceJointe?.storagePath;
  const sourceHash = options.sourceDocumentSha256 || (!attachmentChanged ? options.previous?.subvention.sourceDocumentSha256 : undefined);
  if (sourceHash && !/^[a-f0-9]{64}$/.test(sourceHash)) throw new Error("L’empreinte du document source est invalide.");
  return {
    id: draft.id, date: draft.date, operation: "Revenus", nature: "exploitation", payeur: normalizePayer(draft.payeur),
    production: draft.production.trim(), categorie: "Aides et subventions", sousCategorie: scheme.label,
    produit: `${scheme.label} · ${draft.campagne} · ${tranche.label}`, montant: validation.montantCentimes / 100, montantCentimes: validation.montantCentimes,
    versionSubvention: (options.previous?.versionSubvention || 0) + 1,
    subvention: { dispositif: scheme.value, campagne: Number(draft.campagne), tranche: tranche.value, organisme: draft.organisme.trim(),
      ...(draft.montantReferenceAnnuel.trim() ? { montantReferenceAnnuelCentimes: parseMoneyCents(draft.montantReferenceAnnuel)! } : {}),
      ...(draft.documentDate ? { documentDate: draft.documentDate } : {}), ...(draft.engagementDebut ? { engagementDebut: draft.engagementDebut } : {}), ...(draft.engagementFin ? { engagementFin: draft.engagementFin } : {}), ...(sourceHash ? { sourceDocumentSha256: sourceHash } : {}) },
    ...(draft.reference.trim() ? { reference: draft.reference.trim() } : {}), ...(draft.remarque.trim() ? { remarque: draft.remarque.trim() } : {}),
    ...(draft.organisme.trim() ? { fournisseur: draft.organisme.trim() } : {}), ...(pieceJointe ? { pieceJointe } : {}),
    dateCreation: options.previous?.dateCreation || now, derniereMAJ: now,
  };
}
