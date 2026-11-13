import { createHash } from "node:crypto";
import { CENDRES_EMAIL_LAST, CENDRES_EMAIL_NO_LAST, CENDRES_EMAIL_SUBJECT, CENDRES_EMAIL_TEMPLATE, CENDRES_SEND_RULE, cendresEmailText, claimReminder, isDue, markFailed, markSent, recoverReminder, type CendresReminder } from "./cendres.ts";

/** Côté serveur uniquement. Les envois réels exigent une configuration explicite ET l'empreinte de la validation de Seb. */
export interface CendresMailConfig { enabled: boolean; to: string; from: string; approval: string; }
export interface MailMessage { to: string; from: string; subject: string; text: string; idempotencyKey: string }
export interface MailTransport { send(message: MailMessage): Promise<void> }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isValidEmail = (v: string) => EMAIL.test(v);

/** Empreinte de ce que Seb valide : destinataire, expéditeur, objet, modèle de texte et règle. Tout changement l'invalide. */
export function cendresApprovalFingerprint(to: string, from: string): string {
  return createHash("sha256").update(JSON.stringify([to, from, CENDRES_EMAIL_SUBJECT, CENDRES_EMAIL_TEMPLATE, CENDRES_EMAIL_LAST, CENDRES_EMAIL_NO_LAST, CENDRES_SEND_RULE])).digest("hex");
}

/** Lit l'environnement. Désactivé par défaut ; la moindre incohérence désactive. */
export function readCendresMailConfig(env: Record<string, string | undefined>): { config: CendresMailConfig | null; reason: string } {
  if (env.CENDRES_EMAIL_ENABLED !== "true") return { config: null, reason: "Envoi désactivé (CENDRES_EMAIL_ENABLED ≠ true)." };
  const to = env.CENDRES_EMAIL_TO?.trim() ?? "", from = env.CENDRES_EMAIL_FROM?.trim() ?? "", approval = env.CENDRES_EMAIL_APPROVAL?.trim() ?? "";
  if (!isValidEmail(to)) return { config: null, reason: "Destinataire absent ou invalide." };
  if (!from) return { config: null, reason: "Expéditeur absent." };
  if (approval !== cendresApprovalFingerprint(to, from)) return { config: null, reason: "Validation absente ou périmée." };
  return { config: { enabled: true, to, from, approval }, reason: "ok" };
}

/** Port de stockage serveur : le claim est une écriture CONDITIONNELLE (échoue si le rappel a changé entre-temps). */
export interface CendresServerStore {
  read(): Promise<{ reminder: CendresReminder | null; lastCleaningAt: string | null; version: string }>;
  /** Remplace le rappel seulement si `version` est toujours la bonne. Retourne false sinon (modifié/annulé par l'utilisateur ou autre exécution). */
  writeIfUnchanged(reminder: CendresReminder, version: string): Promise<boolean>;
}

/** Enregistre le résultat seulement si le rappel est toujours celui qui vient d'être traité (pas remplacé ni annulé entre-temps). */
async function finalize(store: CendresServerStore, id: string, next: CendresReminder): Promise<void> {
  try { const s = await store.read(); if (s.reminder?.id === id) await store.writeIfUnchanged(next, s.version); } catch { /* le statut « en cours » restera et sera repéré comme interrompu */ }
}

export type DispatchOutcome = "none" | "not_due" | "disabled" | "lost_race" | "sent" | "retry" | "failed";

export async function dispatchCendresReminder(opts: { store: CendresServerStore; transport: MailTransport; config: CendresMailConfig | null; now: number }): Promise<DispatchOutcome> {
  const { store, transport, config, now } = opts;
  let { reminder, lastCleaningAt, version } = await store.read();
  const recovered = recoverReminder(reminder, now);
  if (recovered !== reminder && recovered) { if (!(await store.writeIfUnchanged(recovered, version))) return "lost_race"; return "none"; }
  if (!reminder || (reminder.status !== "scheduled" && reminder.status !== "failed_retry")) return "none";
  if (!isDue(reminder, now)) return "not_due";
  if (!config) return "disabled"; // le rappel reste visible dans l'application ; aucun envoi
  const claimed = claimReminder(reminder, now);
  if (!(await store.writeIfUnchanged(claimed, version))) return "lost_race";
  try {
    await transport.send({ to: config.to, from: config.from, subject: CENDRES_EMAIL_SUBJECT, text: cendresEmailText(claimed.dueAt, lastCleaningAt), idempotencyKey: `cendres-${claimed.id}` });
  } catch (e) {
    const next = markFailed(claimed, now, e instanceof Error ? e.message : "Échec d'envoi");
    await finalize(store, claimed.id, next);
    return next.status === "failed" ? "failed" : "retry";
  }
  await finalize(store, claimed.id, markSent(claimed, now));
  return "sent";
}

/** Transport Resend (API HTTP). Jamais appelé tant que la configuration n'est pas validée. */
export class ResendTransport implements MailTransport {
  private apiKey: string;
  private fetchImpl: typeof fetch;
  constructor(apiKey: string, fetchImpl: typeof fetch = fetch) { this.apiKey = apiKey; this.fetchImpl = fetchImpl; }
  async send(m: MailMessage): Promise<void> {
    const response = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": m.idempotencyKey },
      body: JSON.stringify({ from: m.from, to: [m.to], subject: m.subject, text: m.text }),
    });
    if (!response.ok) throw new Error(`Resend a refusé l'envoi (HTTP ${response.status}).`);
  }
}
