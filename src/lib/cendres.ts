/** Suivi du nettoyage de la chaudière : données, règles d'échéance et machine d'états du rappel. Logique pure, sans réseau. */

export const CENDRES_PATH = "chauffage-cendres";
export const CENDRES_MAX_DELAY_MS = 5 * 365 * 86_400_000;
/** Délais entre les essais d'envoi après un échec : 3 nouveaux essais puis arrêt visible. */
export const CENDRES_RETRY_DELAYS_MS = [5 * 60_000, 30 * 60_000, 2 * 3_600_000] as const;
export const CENDRES_MAX_ATTEMPTS = CENDRES_RETRY_DELAYS_MS.length + 1;

export type CendresReminderStatus = "scheduled" | "sending" | "sent" | "failed_retry" | "failed" | "cancelled" | "unconfirmed";

export interface CendresCleaning { id: string; at: string; recordedAt: string }
export interface CendresReminder {
  id: string;
  dueAt: string;
  createdAt: string;
  status: CendresReminderStatus;
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  sentAt: string | null;
  /** Heure de la prise en charge par le serveur (sert à repérer un envoi interrompu). */
  claimedAt: string | null;
}
export interface CendresState { cleanings: CendresCleaning[]; reminder: CendresReminder | null }

const STATUSES: readonly string[] = ["scheduled", "sending", "sent", "failed_retry", "failed", "cancelled", "unconfirmed"];
const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const isIso = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));

/** Décode ce que lit la base ; ignore tout enregistrement incomplet au lieu de planter l'écran. */
export function normalizeCendres(raw: unknown): CendresState {
  const root = isRecord(raw) ? raw : {};
  const cleanings: CendresCleaning[] = [];
  if (isRecord(root.cleanings)) for (const [key, v] of Object.entries(root.cleanings)) {
    if (isRecord(v) && isIso(v.at)) cleanings.push({ id: typeof v.id === "string" ? v.id : key, at: new Date(v.at).toISOString(), recordedAt: isIso(v.recordedAt) ? v.recordedAt : v.at });
  }
  cleanings.sort((a, b) => b.at.localeCompare(a.at));
  const r = root.reminder;
  let reminder: CendresReminder | null = null;
  if (isRecord(r) && typeof r.id === "string" && isIso(r.dueAt) && typeof r.status === "string" && STATUSES.includes(r.status)) {
    reminder = {
      id: r.id, dueAt: r.dueAt, createdAt: isIso(r.createdAt) ? r.createdAt : r.dueAt, status: r.status as CendresReminderStatus,
      attempts: Number.isInteger(r.attempts) ? (r.attempts as number) : 0, nextAttemptAt: isIso(r.nextAttemptAt) ? r.nextAttemptAt : r.dueAt,
      lastError: typeof r.lastError === "string" ? r.lastError : null, sentAt: isIso(r.sentAt) ? r.sentAt : null, claimedAt: isIso(r.claimedAt) ? r.claimedAt : null,
    };
  }
  return { cleanings, reminder };
}

export function buildCleaning(id: string, now: number, at?: string): CendresCleaning {
  const ms = at === undefined ? now : Date.parse(at);
  if (!Number.isFinite(ms)) throw new Error("Date invalide.");
  if (ms > now + 60_000) throw new Error("Un nettoyage ne peut pas être daté dans le futur.");
  return { id, at: new Date(ms).toISOString(), recordedAt: new Date(now).toISOString() };
}

/** Une date/heure OU un délai en minutes. Aucune fréquence n'est imposée ni répétée. */
export function buildReminder(id: string, now: number, input: { dueAt?: string; delayMinutes?: number }): CendresReminder {
  let ms: number;
  if (input.dueAt !== undefined) ms = Date.parse(input.dueAt);
  else if (input.delayMinutes !== undefined) ms = now + input.delayMinutes * 60_000;
  else throw new Error("Choisis une date et une heure, ou un délai.");
  if (!Number.isFinite(ms)) throw new Error("Rappel invalide.");
  if (ms <= now) throw new Error("L'échéance doit être dans le futur.");
  if (ms - now > CENDRES_MAX_DELAY_MS) throw new Error("Échéance trop lointaine (5 ans au maximum).");
  const due = new Date(ms).toISOString();
  return { id, dueAt: due, createdAt: new Date(now).toISOString(), status: "scheduled", attempts: 0, nextAttemptAt: due, lastError: null, sentAt: null, claimedAt: null };
}

export const isReminderActive = (r: CendresReminder | null): r is CendresReminder => !!r && (r.status === "scheduled" || r.status === "failed_retry");

export function cancelReminder(r: CendresReminder | null): CendresReminder {
  if (!isReminderActive(r)) throw new Error("Aucun rappel actif à annuler.");
  return { ...r, status: "cancelled" };
}

/** À traiter par le serveur ? Seulement un rappel actif dont l'heure est atteinte. */
export function isDue(r: CendresReminder | null, now: number): r is CendresReminder {
  return isReminderActive(r) && now >= Date.parse(r.nextAttemptAt);
}
/** Passe en « envoi en cours » AVANT l'appel au fournisseur (écriture conditionnelle côté serveur). */
export function claimReminder(r: CendresReminder, now: number): CendresReminder { return { ...r, status: "sending", attempts: r.attempts + 1, claimedAt: new Date(now).toISOString() }; }
export function markSent(r: CendresReminder, now: number): CendresReminder { return { ...r, status: "sent", sentAt: new Date(now).toISOString(), lastError: null }; }
export function markFailed(r: CendresReminder, now: number, message: string): CendresReminder {
  const lastError = message.slice(0, 200);
  if (r.attempts >= CENDRES_MAX_ATTEMPTS) return { ...r, status: "failed", lastError };
  return { ...r, status: "failed_retry", lastError, nextAttemptAt: new Date(now + CENDRES_RETRY_DELAYS_MS[r.attempts - 1]).toISOString() };
}
export const CENDRES_SENDING_TIMEOUT_MS = 10 * 60_000;
/** Après un arrêt brutal : un envoi resté « en cours » depuis plus de 10 min n'est jamais renvoyé tout seul (risque de doublon). */
export function recoverReminder(r: CendresReminder | null, now: number): CendresReminder | null {
  if (r?.status !== "sending") return r;
  if (r.claimedAt && now - Date.parse(r.claimedAt) < CENDRES_SENDING_TIMEOUT_MS) return r;
  return { ...r, status: "unconfirmed", lastError: "Envoi interrompu avant confirmation : à vérifier, non renvoyé." };
}

export const CENDRES_STATUS_LABEL: Record<CendresReminderStatus, string> = {
  scheduled: "Programmé", sending: "Envoi en cours", sent: "E-mail envoyé", failed_retry: "Échec, nouvel essai prévu",
  failed: "Échec : plus d'essai", cancelled: "Annulé", unconfirmed: "Envoi interrompu, à vérifier",
};

export const CENDRES_EMAIL_SUBJECT = "Chaudière : rappel de nettoyage (cendres)";
/** Modèle validé par Seb (le texte envoyé est ce modèle, rien d'autre). */
export const CENDRES_EMAIL_TEMPLATE = "Rappel programmé : nettoyage de la chaudière.\n{dernier}\nÉchéance : {échéance}.\n";
export const CENDRES_EMAIL_LAST = "Dernier nettoyage enregistré : {date}.";
export const CENDRES_EMAIL_NO_LAST = "Aucun nettoyage enregistré.";
export function cendresEmailText(dueAt: string, lastCleaningAt: string | null): string {
  const fmt = (iso: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(iso));
  const last = lastCleaningAt ? CENDRES_EMAIL_LAST.replace("{date}", fmt(lastCleaningAt)) : CENDRES_EMAIL_NO_LAST;
  return CENDRES_EMAIL_TEMPLATE.replace("{dernier}", last).replace("{échéance}", fmt(dueAt));
}
export const CENDRES_SEND_RULE = "Un seul e-mail par rappel, envoyé à l'échéance ; en cas d'échec, 3 nouveaux essais (5 min, 30 min, 2 h) puis arrêt visible ; "
  + "jamais de renvoi automatique après une interruption ; aucune répétition.";
