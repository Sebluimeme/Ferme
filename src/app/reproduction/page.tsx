"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, HeartPulse, PawPrint } from "lucide-react";
import { useAppStore, type Animal } from "@/store/store";
import { getGestationAlert, getHeatAlert, formatGestationMessage, formatHeatMessage } from "@/lib/reproduction";
import { groupChaleursByAnimal } from "@/components/HeatAlerts";
import { Card, Notice, farmStyles } from "@/components/ui/FarmUI";
import styles from "./ReproductionPage.module.css";

export default function ReproductionPage() {
  const { state } = useAppStore();
  const { animaux, chaleurs, loading } = state;

  const upcomingHeats = useMemo(() => {
    const chaleursByAnimal = groupChaleursByAnimal(chaleurs);
    return animaux
      .map((animal) => {
        const alert = getHeatAlert(animal, chaleursByAnimal[animal.id] || []);
        return alert ? { animal, alert } : null;
      })
      .filter((x): x is { animal: Animal; alert: NonNullable<ReturnType<typeof getHeatAlert>> } => x !== null)
      .sort((a, b) => a.alert.joursRestants - b.alert.joursRestants);
  }, [animaux, chaleurs]);

  const upcomingBirths = useMemo(() => {
    return animaux
      .map((animal) => {
        const alert = getGestationAlert(animal);
        return alert ? { animal, alert } : null;
      })
      .filter((x): x is { animal: Animal; alert: NonNullable<ReturnType<typeof getGestationAlert>> } => x !== null)
      .sort((a, b) => a.alert.joursRestants - b.alert.joursRestants);
  }, [animaux]);

  return (
    <div className={`${farmStyles.theme} ${styles.page}`}>
      <header className={styles.header}>
        <h1>Reproduction</h1>
        <p>Chaleurs et mises bas à venir, tous animaux confondus.</p>
      </header>

      {loading ? <Notice>Chargement du suivi de reproduction…</Notice> : <>
        <div className={styles.sections}>
          <Card className={styles.section} role="region" aria-labelledby="upcoming-heats-heading">
            <header className={styles.sectionHeader}>
              <HeartPulse aria-hidden="true" />
              <h2 id="upcoming-heats-heading">Prochaines chaleurs</h2>
              <span className={styles.count} aria-label={`${upcomingHeats.length} chaleur${upcomingHeats.length > 1 ? "s" : ""} à venir`}>{upcomingHeats.length}</span>
            </header>
            {upcomingHeats.length === 0 ? (
              <p className={styles.empty}>Aucune chaleur à venir.</p>
            ) : (
              <ul className={styles.list}>
                {upcomingHeats.map(({ animal, alert }) => (
                  <li key={animal.id}>
                    <Link href={`/animaux/${animal.id}`} className={styles.animalLink}>
                      <PawPrint className={styles.animalIcon} aria-hidden="true" />
                      <span className={styles.animalDetails}>
                        <span className={styles.animalName}>{animal.nom || animal.numeroBoucle || "Animal"}</span>
                        <span className={styles.prediction}>{formatHeatMessage(alert)}</span>
                      </span>
                      <ChevronRight className={styles.chevron} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className={styles.section} role="region" aria-labelledby="upcoming-births-heading">
            <header className={styles.sectionHeader}>
              <CalendarDays aria-hidden="true" />
              <h2 id="upcoming-births-heading">Prochaines mises bas</h2>
              <span className={styles.count} aria-label={`${upcomingBirths.length} mise${upcomingBirths.length > 1 ? "s" : ""} bas à venir`}>{upcomingBirths.length}</span>
            </header>
            {upcomingBirths.length === 0 ? (
              <p className={styles.empty}>Aucune mise bas à venir.</p>
            ) : (
              <ul className={styles.list}>
                {upcomingBirths.map(({ animal, alert }) => (
                  <li key={animal.id}>
                    <Link href={`/animaux/${animal.id}`} className={styles.animalLink}>
                      <PawPrint className={styles.animalIcon} aria-hidden="true" />
                      <span className={styles.animalDetails}>
                        <span className={styles.animalName}>{animal.nom || animal.numeroBoucle || "Animal"}</span>
                        <span className={`${styles.prediction} ${alert.enRetard ? styles.overdue : ""}`}>{formatGestationMessage(alert)}</span>
                      </span>
                      <ChevronRight className={styles.chevron} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <p className={styles.help}>Les prévisions dépendent des observations et des saillies renseignées dans les fiches des animaux.</p>
      </>}
    </div>
  );
}
