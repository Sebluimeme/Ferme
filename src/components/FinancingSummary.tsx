"use client";

import { Button, Card, farmStyles } from "@/components/ui/FarmUI";
import { computeCreditorStatements, creditorLabel, FARM_CREDITORS, type FarmCreditor, type Transaction } from "@/types/comptabilite";
import styles from "./FinancingSummary.module.css";

const money = (amount: number) => amount.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

export default function FinancingSummary({ transactions, onAdvance, onRepay, onShowEntries }: {
  transactions: Transaction[];
  onAdvance?: (payer: FarmCreditor) => void;
  onRepay?: (payer: FarmCreditor) => void;
  onShowEntries?: (payer: FarmCreditor) => void;
}) {
  const statements = computeCreditorStatements(transactions);
  return <section className={`${farmStyles.theme} ${styles.section}`} aria-label="Financement de la ferme">
    <div className={styles.intro}><h2>Qui a financé la ferme ?</h2><p>Toutes les années et productions. Les filtres d’achats ne modifient pas ces comptes.</p></div>
    <div className={styles.cards}>{FARM_CREDITORS.map(payer => {
      const account = statements[payer];
      return <Card key={payer} className={styles.card}>
        <h3>{creditorLabel(payer)}</h3>
        <p className={styles.label}>{account.netBalance < 0 ? "À reverser à la ferme selon les écritures" : "Reste à rembourser par la ferme"}</p>
        <p className={styles.amount}>{money(Math.abs(account.netBalance))}</p>
        <details className={styles.details}>
          <summary>Comprendre le calcul</summary>
          <dl>
            <div><dt>Achats payés personnellement</dt><dd>+ {money(account.purchases)}</dd></div>
            <div><dt>Avances vers Revolut</dt><dd>+ {money(account.advances)}</dd></div>
            <div className={styles.subtotal}><dt>Total avancé</dt><dd>{money(account.contributed)}</dd></div>
            <div><dt>Recettes attribuées à cette personne</dt><dd>− {money(account.receipts)}</dd></div>
            <div><dt>Remboursements reçus</dt><dd>− {money(account.repayments)}</dd></div>
          </dl>
          <p className={styles.note}>Les recettes à son nom sont déduites comme des encaissements personnels. Si elles sont allées directement sur Revolut, leur compte d’encaissement doit être vérifié.</p>
          {onShowEntries && <Button fullWidth onClick={() => onShowEntries(payer)}>Voir ses écritures</Button>}
        </details>
        {(onAdvance || onRepay) && <div className={styles.actions}>
          {onAdvance && <Button onClick={() => onAdvance(payer)}>Ajouter une avance</Button>}
          {onRepay && <Button disabled={account.amountDue <= 0} onClick={() => onRepay(payer)}>Remboursement</Button>}
        </div>}
      </Card>;
    })}</div>
    <p className={styles.note}>Revolut est le compte de la ferme. Ses achats ne doivent pas être comptés à nouveau comme apports personnels ; les avances s’enregistrent séparément. Ces montants ne donnent pas le solde bancaire de Revolut.</p>
  </section>;
}
