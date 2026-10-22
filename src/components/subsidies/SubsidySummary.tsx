"use client";

import { useId, useMemo, useState } from "react";
import { ExternalLink, Landmark, Plus } from "lucide-react";
import { Button, Card, Field, farmStyles } from "@/components/ui/FarmUI";
import { payerLabel } from "@/lib/comptabilite-payers";
import type { Transaction } from "@/types/comptabilite";
import { isSubsidyPayment, SUBSIDY_SCHEMES, SUBSIDY_TRANCHES, type SubsidyPayment } from "@/types/subsidy";
import styles from "./SubsidySummary.module.css";

type Props = { transactions: Transaction[]; onAdd?: () => void; onEdit?: (payment: SubsidyPayment) => void };
type PaymentGroup = { key: string; campaign: number; scheme: string; payments: SubsidyPayment[]; cents: number };
const money = (cents: number) => (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR");
const schemeLabel = (value: string) => SUBSIDY_SCHEMES.find(scheme => scheme.value === value)?.label || value;
const trancheLabel = (value: string) => SUBSIDY_TRANCHES.find(tranche => tranche.value === value)?.label || value;

export default function SubsidySummary({ transactions, onAdd, onEdit }: Props) {
  const id = useId();
  const [campaign, setCampaign] = useState("all");
  const payments = useMemo(() => transactions.filter(isSubsidyPayment), [transactions]);
  const campaigns = useMemo(() => Array.from(new Set(payments.map(payment => payment.subvention.campagne))).sort((a, b) => b - a), [payments]);
  const selected = useMemo(() => payments.filter(payment => campaign === "all" || String(payment.subvention.campagne) === campaign), [payments, campaign]);
  const groups = useMemo(() => {
    const byScheme = new Map<string, PaymentGroup>();
    for (const payment of selected) {
      const key = `${payment.subvention.campagne}:${payment.subvention.dispositif}`;
      const group = byScheme.get(key) || { key, campaign: payment.subvention.campagne, scheme: payment.subvention.dispositif, payments: [], cents: 0 };
      group.payments.push(payment); group.cents += payment.montantCentimes;
      byScheme.set(key, group);
    }
    return [...byScheme.values()].sort((a, b) => b.campaign - a.campaign || schemeLabel(a.scheme).localeCompare(schemeLabel(b.scheme), "fr"));
  }, [selected]);
  const total = selected.reduce((sum, payment) => sum + payment.montantCentimes, 0);

  return <section className={`${farmStyles.theme} ${styles.section}`} aria-labelledby={`${id}-heading`}>
    <div className={styles.intro}><h2 id={`${id}-heading`}>Aides et subventions</h2><p>Chaque aide, sa campagne et ses versements. Les montants reçus sont déjà compris dans les recettes de la ferme.</p></div>
    <div className={styles.toolbar}><Field label="Campagne de l’aide" htmlFor={`${id}-campaign`}><select id={`${id}-campaign`} value={campaign} onChange={event => setCampaign(event.target.value)}><option value="all">Toutes les campagnes</option>{campaigns.map(year => <option key={year} value={String(year)}>Campagne {year}</option>)}</select></Field>{onAdd && <Button onClick={onAdd}><Plus aria-hidden="true" />Ajouter une aide</Button>}</div>
    <Card className={styles.total}><p className={styles.label}>Aides réellement encaissées</p><p className={styles.amount}>{money(total)}</p><p className={styles.label}>{selected.length} ligne{selected.length > 1 ? "s" : ""} d’aide enregistrée{selected.length > 1 ? "s" : ""}</p><p className={styles.note}>Un virement peut regrouper plusieurs aides. Sélection par campagne, indépendamment de l’année du virement et des filtres d’achats. Les aides annoncées ou les années futures ne sont pas comptées.</p></Card>
    {!groups.length && <Card className={styles.empty}><Landmark aria-hidden="true" /><h3>Aucune aide reçue enregistrée</h3><p className={styles.note}>Ajoutez chaque versement à partir de son relevé : PAC, conversion bio, aide aux jeunes agriculteurs ou autre aide.</p></Card>}
    <div className={styles.groups}>{groups.map(group => {
      const references = Array.from(new Set(group.payments.map(payment => payment.subvention.montantReferenceAnnuelCentimes).filter((amount): amount is number => typeof amount === "number")));
      return <Card key={group.key} className={styles.group}>
        <div className={styles.groupHeader}><p className={styles.campaign}>Campagne {group.campaign}</p><h3>{schemeLabel(group.scheme)}</h3><p className={styles.groupTotal}>{money(group.cents)}</p><p className={styles.note}>{group.payments.length} versement{group.payments.length > 1 ? "s" : ""} reçu{group.payments.length > 1 ? "s" : ""}</p></div>
        {references.length > 0 && <p className={styles.reference}><strong>{references.length === 1 ? `Référence annuelle indiquée : ${money(references[0])}` : `Références annuelles indiquées : ${references.map(money).join(" ; ")}`}</strong>{references.length > 1 ? "Des montants différents figurent sur les documents. Consultez le détail de chaque versement. " : ""}Information du relevé, non ajoutée aux recettes. Ce n’est pas un solde restant à recevoir.</p>}
        <ul className={styles.payments}>{[...group.payments].sort((a, b) => b.date.localeCompare(a.date)).map(payment => <li key={payment.id} className={styles.payment}>
          <div className={styles.paymentHeader}><span>{trancheLabel(payment.subvention.tranche)} · {dateLabel(payment.date)}</span><strong>{money(payment.montantCentimes)}</strong></div>
          <p className={styles.metadata}>{payerLabel(payment.payeur)} · {payment.production}</p>
          <details className={styles.paymentDetails}><summary>Détail du versement</summary><dl>
            <div><dt>Organisme</dt><dd>{payment.subvention.organisme || "Non renseigné"}</dd></div>
            {payment.reference && <div><dt>Référence</dt><dd>{payment.reference}</dd></div>}
            {payment.subvention.documentDate && <div><dt>Date du relevé</dt><dd>{dateLabel(payment.subvention.documentDate)}</dd></div>}
            {payment.subvention.montantReferenceAnnuelCentimes != null && <div><dt>Référence annuelle</dt><dd>{money(payment.subvention.montantReferenceAnnuelCentimes)}</dd></div>}
            {(payment.subvention.engagementDebut || payment.subvention.engagementFin) && <div><dt>Engagement</dt><dd>{payment.subvention.engagementDebut ? dateLabel(payment.subvention.engagementDebut) : "Début non renseigné"} → {payment.subvention.engagementFin ? dateLabel(payment.subvention.engagementFin) : "Fin non renseignée"}</dd></div>}
            {payment.remarque && <div><dt>Note</dt><dd>{payment.remarque}</dd></div>}
          </dl><div className={styles.paymentActions}>{payment.pieceJointe && <a className={styles.attachment} href={payment.pieceJointe.url} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" />Justificatif</a>}{onEdit && <Button onClick={() => onEdit(payment)} aria-label={`Modifier ${schemeLabel(group.scheme)}, ${trancheLabel(payment.subvention.tranche)}, ${dateLabel(payment.date)}`}>Modifier</Button>}</div></details>
        </li>)}</ul>
      </Card>;
    })}</div>
    <p className={styles.note}>Un engagement de conversion bio sur plusieurs années n’ajoute pas automatiquement de recettes : seuls les paiements reçus et enregistrés sont totalisés.</p>
  </section>;
}
