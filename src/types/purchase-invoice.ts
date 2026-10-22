import type { Transaction } from "@/types/comptabilite";
import { KNOWN_PAYERS, normalizePayer } from "@/lib/comptabilite-payers";

export const PURCHASE_TYPES = [
  { value: "alimentation", label: "Alimentation", categorie: "Charges", sousCategorie: "Nourritures" },
  { value: "soins", label: "Soins et vétérinaire", categorie: "Charges", sousCategorie: "Vétérinaire" },
  { value: "reparation", label: "Entretien et réparation", categorie: "Charges", sousCategorie: "Entretien" },
  { value: "carburant", label: "Carburant", categorie: "Charges", sousCategorie: "Carburant" },
  { value: "materiel", label: "Achat de matériel", categorie: "Immobilisation", sousCategorie: "Matériel" },
  { value: "animaux", label: "Achat d’animaux", categorie: "Animaux", sousCategorie: "Cheptel" },
  { value: "semences", label: "Semences et cultures", categorie: "Charges", sousCategorie: "Semences" },
  { value: "services", label: "Services et cotisations", categorie: "Charges", sousCategorie: "Services" },
  { value: "autre", label: "Autre achat", categorie: "Charges", sousCategorie: "Fournitures" },
] as const;

export type PurchaseType = (typeof PURCHASE_TYPES)[number]["value"];

export interface PurchaseAllocationDraft {
  id: string;
  production: string;
  vehicleId?: string;
  vehicleLabel?: string;
  typeAchat: PurchaseType;
  description: string;
  quantite: string;
  montant: string;
}

export interface PurchaseInvoiceDraft {
  id: string;
  date: string;
  fournisseur: string;
  reference: string;
  payeur: string;
  montant: string;
  remarque: string;
  allocations: PurchaseAllocationDraft[];
  version?: number;
}

export interface PurchaseAllocation {
  id: string;
  production: string;
  vehicleId?: string;
  vehicleLabel?: string;
  typeAchat: PurchaseType;
  description: string;
  quantite?: number;
  montantCentimes: number;
}

/** Une facture = une seule écriture. Les affectations ne sont jamais persistées séparément. */
export interface PurchaseInvoice extends Transaction {
  typeFacture: "achat";
  factureVersion: number;
  totalCentimes: number;
  reference: string;
  allocations: PurchaseAllocation[];
}

export interface PurchaseInvoiceValidation {
  valid: boolean;
  errors: string[];
  totalCentimes: number;
  allocatedCentimes: number;
  remainingCentimes: number;
}

const SAFE_KEY = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_MONEY_CENTS = 999_999_999_99;

export function makePurchaseId(): string {
  return crypto.randomUUID();
}

/** Décimal strict : aucun parseFloat permissif, arrondi implicite ou notation exponentielle. */
export function parseMoneyCents(value: string): number | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(cleaned)) return null;
  const [whole, decimal = ""] = cleaned.replace(",", ".").split(".");
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= MAX_MONEY_CENTS ? cents : null;
}

function parseQuantity(value: string): number | undefined {
  if (!value.trim()) return undefined;
  if (!/^\d+(?:[.,]\d+)?$/.test(value.trim())) return NaN;
  return Number(value.replace(",", "."));
}

function localDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function makeEmptyInvoiceDraft(): PurchaseInvoiceDraft {
  return {
    id: makePurchaseId(), date: localDate(), fournisseur: "", reference: "", payeur: "SY",
    montant: "", remarque: "", version: 0,
    allocations: [{ id: makePurchaseId(), production: "À affecter", typeAchat: "autre", description: "", quantite: "", montant: "" }],
  };
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validatePurchaseInvoice(draft: PurchaseInvoiceDraft): PurchaseInvoiceValidation {
  const errors: string[] = [];
  if (!draft || typeof draft !== "object"
    || ![draft.id, draft.date, draft.fournisseur, draft.reference, draft.payeur, draft.montant, draft.remarque].every((value) => typeof value === "string")
    || !Array.isArray(draft.allocations)) {
    return { valid: false, errors: ["Le brouillon de facture est incomplet."], totalCentimes: 0, allocatedCentimes: 0, remainingCentimes: 0 };
  }
  if (!SAFE_KEY.test(draft.id)) errors.push("L’identifiant de la facture est invalide.");
  if (!validDate(draft.date)) errors.push("Choisissez une date valide.");
  if (!(KNOWN_PAYERS as readonly string[]).includes(normalizePayer(draft.payeur))) errors.push("Choisissez qui a payé la facture.");
  const total = parseMoneyCents(draft.montant);
  if (total === null || total <= 0) errors.push("Le total doit être positif, avec deux décimales maximum.");
  if (draft.fournisseur.length > 240 || draft.reference.length > 240 || draft.remarque.length > 4000) {
    errors.push("Le fournisseur, la référence ou la remarque est trop long.");
  }
  if (!Array.isArray(draft.allocations) || draft.allocations.length < 1 || draft.allocations.length > 100) {
    errors.push("Ajoutez entre une et cent affectations.");
  }
  const seen = new Set<string>();
  let allocatedCentimes = 0;
  for (const [index, allocation] of (draft.allocations || []).entries()) {
    const label = `Affectation ${index + 1}`;
    if (!allocation || typeof allocation !== "object"
      || ![allocation.id, allocation.production, allocation.typeAchat, allocation.description, allocation.quantite, allocation.montant].every((value) => typeof value === "string")
      || (allocation.vehicleId !== undefined && typeof allocation.vehicleId !== "string")
      || (allocation.vehicleLabel !== undefined && typeof allocation.vehicleLabel !== "string")) {
      errors.push(`${label} : données incomplètes.`);
      continue;
    }
    if (!SAFE_KEY.test(allocation.id) || seen.has(allocation.id)) errors.push(`${label} : identifiant invalide ou dupliqué.`);
    seen.add(allocation.id);
    if (!allocation.production.trim() || allocation.production.length > 240) errors.push(`${label} : choisissez une production.`);
    if (allocation.vehicleId && !SAFE_KEY.test(allocation.vehicleId)) errors.push(`${label} : matériel invalide.`);
    if ((allocation.vehicleLabel?.length || 0) > 240 || allocation.description.length > 1000) errors.push(`${label} : description trop longue.`);
    if (!PURCHASE_TYPES.some((type) => type.value === allocation.typeAchat)) errors.push(`${label} : choisissez un type d’achat.`);
    const quantity = parseQuantity(allocation.quantite);
    if (quantity !== undefined && (!Number.isFinite(quantity) || quantity <= 0)) errors.push(`${label} : la quantité doit être positive.`);
    const amount = parseMoneyCents(allocation.montant);
    if (amount === null || amount <= 0) errors.push(`${label} : le montant doit être positif, avec deux décimales maximum.`);
    else allocatedCentimes += amount;
  }
  const totalCentimes = total ?? 0;
  const remainingCentimes = totalCentimes - allocatedCentimes;
  if (total !== null && remainingCentimes !== 0) errors.push("La somme des affectations doit correspondre exactement au total de la facture.");
  return { valid: errors.length === 0, errors, totalCentimes, allocatedCentimes, remainingCentimes };
}

export function invoiceToDraft(invoice: PurchaseInvoice): PurchaseInvoiceDraft {
  return {
    id: invoice.id, date: invoice.date, fournisseur: invoice.fournisseur || "", reference: invoice.reference || "",
    payeur: normalizePayer(invoice.payeur), montant: (invoice.totalCentimes / 100).toFixed(2), remarque: invoice.remarque || "", version: invoice.factureVersion,
    allocations: invoice.allocations.map((allocation) => ({
      id: allocation.id, production: allocation.production, vehicleId: allocation.vehicleId, vehicleLabel: allocation.vehicleLabel,
      typeAchat: allocation.typeAchat, description: allocation.description, quantite: allocation.quantite?.toString() || "",
      montant: (allocation.montantCentimes / 100).toFixed(2),
    })),
  };
}

export function buildPurchaseInvoice(
  draft: PurchaseInvoiceDraft,
  options: { previous?: PurchaseInvoice; pieceJointe?: Transaction["pieceJointe"]; now?: string } = {},
): PurchaseInvoice {
  const validation = validatePurchaseInvoice(draft);
  if (!validation.valid) throw new Error(validation.errors.join(" "));
  const now = options.now || new Date().toISOString();
  const allocations: PurchaseAllocation[] = draft.allocations.map((allocation) => {
    const type = PURCHASE_TYPES.find((item) => item.value === allocation.typeAchat)!;
    const quantity = parseQuantity(allocation.quantite);
    return {
      id: allocation.id, production: allocation.production.trim(), typeAchat: allocation.typeAchat,
      description: allocation.description.trim() || `${type.label} · ${allocation.production.trim()}${allocation.vehicleLabel ? ` · ${allocation.vehicleLabel.trim()}` : ""}`,
      ...(allocation.vehicleId ? { vehicleId: allocation.vehicleId, ...(allocation.vehicleLabel?.trim() ? { vehicleLabel: allocation.vehicleLabel.trim() } : {}) } : {}),
      ...(quantity !== undefined ? { quantite: quantity } : {}),
      montantCentimes: parseMoneyCents(allocation.montant)!,
    };
  });
  const first = allocations[0];
  const sameProduction = allocations.every((allocation) => allocation.production === first.production);
  const sameType = allocations.every((allocation) => allocation.typeAchat === first.typeAchat);
  const mappedType = PURCHASE_TYPES.find((type) => type.value === first.typeAchat)!;
  const pieceJointe = options.pieceJointe || options.previous?.pieceJointe;
  return {
    id: draft.id, typeFacture: "achat", factureVersion: (options.previous?.factureVersion || 0) + 1,
    date: draft.date, operation: "Dépenses", nature: "exploitation", payeur: normalizePayer(draft.payeur),
    production: sameProduction ? first.production : "Plusieurs productions",
    categorie: sameType ? mappedType.categorie : "Charges", sousCategorie: sameType ? mappedType.sousCategorie : "Achats répartis",
    produit: allocations.length === 1 ? first.description : `Facture d’achat · ${allocations.length} affectations`,
    reference: draft.reference.trim(), ...(draft.fournisseur.trim() ? { fournisseur: draft.fournisseur.trim() } : {}),
    ...(draft.remarque.trim() ? { remarque: draft.remarque.trim() } : {}),
    ...(allocations.length === 1 && first.vehicleId ? { vehicleId: first.vehicleId, ...(first.vehicleLabel ? { vehicleLabel: first.vehicleLabel } : {}) } : {}),
    ...(sameType ? { typeAchat: first.typeAchat } : {}),
    ...(pieceJointe ? { pieceJointe } : {}),
    montant: validation.totalCentimes / 100, totalCentimes: validation.totalCentimes, allocations,
    dateCreation: options.previous?.dateCreation || now, derniereMAJ: now,
  };
}

export function isPurchaseInvoice(transaction: Transaction | null | undefined): transaction is PurchaseInvoice {
  if (!transaction) return false;
  const invoice = transaction as Partial<PurchaseInvoice>;
  return invoice.typeFacture === "achat" && Number.isInteger(invoice.factureVersion)
    && Array.isArray(invoice.allocations) && invoice.allocations.length > 0 && Number.isSafeInteger(invoice.totalCentimes);
}

/** Intitulé de lecture uniquement : ne remplace ni les affectations ni le fournisseur enregistrés. */
export function purchaseInvoiceTitle(invoice: PurchaseInvoice): string {
  const descriptions = Array.from(new Set(invoice.allocations
    .map((allocation) => allocation.description?.trim())
    .filter((description): description is string => Boolean(description))));
  if (descriptions.length) {
    return `${descriptions.slice(0, 2).join(" · ")}${descriptions.length > 2 ? " · …" : ""}`;
  }
  return invoice.produit?.trim() || invoice.fournisseur?.trim() || "Facture d’achat";
}

/** Vue analytique uniquement : remplace l’en-tête par ses affectations, sans ajouter de dépense. */
export function expandPurchaseAllocations(transactions: Transaction[]): Transaction[] {
  return transactions.flatMap((transaction) => {
    if (!isPurchaseInvoice(transaction)) return [transaction];
    return transaction.allocations.map((allocation) => {
      const mapped = PURCHASE_TYPES.find((type) => type.value === allocation.typeAchat) || PURCHASE_TYPES[PURCHASE_TYPES.length - 1];
      // Pas de discriminant facture sur ces lignes virtuelles : une seconde expansion reste sans effet.
      return {
        id: `${transaction.id}__${allocation.id}`, factureId: transaction.id, date: transaction.date,
        operation: transaction.operation, nature: transaction.nature, payeur: transaction.payeur,
        production: allocation.production, categorie: mapped.categorie, sousCategorie: mapped.sousCategorie,
        produit: allocation.description, montant: allocation.montantCentimes / 100,
        typeAchat: allocation.typeAchat, ...(allocation.vehicleId ? { vehicleId: allocation.vehicleId, ...(allocation.vehicleLabel ? { vehicleLabel: allocation.vehicleLabel } : {}) } : {}),
        ...(allocation.quantite !== undefined ? { quantite: allocation.quantite } : {}),
        ...(transaction.fournisseur ? { fournisseur: transaction.fournisseur } : {}),
        ...(transaction.reference ? { reference: transaction.reference } : {}),
        ...(transaction.remarque ? { remarque: transaction.remarque } : {}),
        ...(transaction.pieceJointe ? { pieceJointe: transaction.pieceJointe } : {}),
        dateCreation: transaction.dateCreation, derniereMAJ: transaction.derniereMAJ,
      } satisfies Transaction;
    });
  });
}
