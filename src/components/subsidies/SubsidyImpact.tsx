"use client";

import Link from "next/link";
import { Card, farmStyles } from "@/components/ui/FarmUI";
import { isOperatingTransaction, type Transaction } from "@/types/comptabilite";
import { isSubsidyPayment } from "@/types/subsidy";
import styles from "./SubsidyImpact.module.css";

const money = (cents: number) => (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

export default function SubsidyImpact({ transactions }: { transactions: Transaction[] }) {
  const rows = transactions.filter(isOperatingTransaction);
  const aids = rows.filter(isSubsidyPayment).reduce((sum, row) => sum + row.montantCentimes, 0);
  const receipts = rows.filter(row => row.operation === "Revenus").reduce((sum, row) => sum + Math.round(row.montant * 100), 0);
  const purchases = rows.filter(row => row.operation === "Dépenses").reduce((sum, row) => sum + Math.round(row.montant * 100), 0);
  return <section className={farmStyles.theme} aria-label="Effet des aides sur le solde"><Card className={styles.card}>
    <h2>Avec et sans les aides</h2>
    <p>Pour la période et la production sélectionnées, selon la date des versements.</p>
    <dl>
      <div><dt>Recettes hors aides − achats</dt><dd>{money(receipts - aids - purchases)}</dd></div>
      <div><dt>Aides reçues</dt><dd>+ {money(aids)}</dd></div>
      <div className={styles.total}><dt>Recettes avec aides − achats</dt><dd>{money(receipts - purchases)}</dd></div>
    </dl>
    <p>Les aides sont déjà comprises dans les recettes. Les montants annoncés et les versements futurs ne sont pas ajoutés.</p>
    <Link href="/couts?vue=aides">Voir les aides par campagne</Link>
  </Card></section>;
}
