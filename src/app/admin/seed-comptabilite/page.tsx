"use client";

import { useState } from "react";
import { createTransaction } from "@/services/comptabilite-service";
import type { TransactionFormData } from "@/types/comptabilite";

// 86 transactions extraites du fichier Comptabilite_de_la_ferme.xlsx
const TRANSACTIONS: TransactionFormData[] = [
  { date: "2024-08-14", operation: "Dépenses", production: "Bovins", categorie: "Immobilisation", sousCategorie: "Parc", produit: "poste electriques", remarque: "", fournisseur: "ELEVAGE SERVICE", quantite: "1", payeur: "SY", montant: "152.70" },
  { date: "2025-04-24", operation: "Dépenses", production: "Moutons", categorie: "Animaux", sousCategorie: "Cheptel", produit: "limousine", remarque: "femelles", fournisseur: "", quantite: "5", payeur: "SY", montant: "800.00" },
  { date: "2025-04-25", operation: "Dépenses", production: "Moutons", categorie: "Immobilisation", sousCategorie: "Parc", produit: "filet éléctrique", remarque: "", fournisseur: "ELEVAGE SERVICE", quantite: "7", payeur: "SY", montant: "938.00" },
  { date: "2025-04-25", operation: "Dépenses", production: "Moutons", categorie: "Immobilisation", sousCategorie: "Parc", produit: "poste electriques", remarque: "grain poulet N246066", fournisseur: "ELEVAGE SERVICE", quantite: "1", payeur: "SY", montant: "257.40" },
  { date: "2025-05-19", operation: "Dépenses", production: "Bovins", categorie: "Immobilisation", sousCategorie: "Parc", produit: "piquet fibre isolateur", remarque: "", fournisseur: "SAS MECA'CHENILLES", quantite: "1", payeur: "SY", montant: "182.72" },
  { date: "2025-05-19", operation: "Dépenses", production: "Équipement", categorie: "Engins", sousCategorie: "Presse", produit: "presse botte carré", remarque: "", fournisseur: "", quantite: "1", payeur: "SY", montant: "1500.00" },
  { date: "2025-05-21", operation: "Dépenses", production: "Moutons", categorie: "Immobilisation", sousCategorie: "Parc", produit: "peson a aiguilles", remarque: "", fournisseur: "ELEVAGE SERVICE", quantite: "1", payeur: "SY", montant: "34.90" },
  { date: "2025-05-27", operation: "Dépenses", production: "Bovins", categorie: "Animaux", sousCategorie: "Cheptel", produit: "highland", remarque: "solene, tania, twingo", fournisseur: "Parolini guy", quantite: "3", payeur: "SY", montant: "3900.00" },
  { date: "2025-05-27", operation: "Dépenses", production: "Équipement", categorie: "Engins", sousCategorie: "Tracteur", produit: "metrac", remarque: "", fournisseur: "", quantite: "1", payeur: "SY", montant: "7300.00" },
  { date: "2025-05-31", operation: "Dépenses", production: "Bovins", categorie: "Animaux", sousCategorie: "Cheptel", produit: "highland", remarque: "valty male", fournisseur: "Tempe Thierry", quantite: "1", payeur: "SY", montant: "700.00" },
  { date: "2025-06-02", operation: "Dépenses", production: "Équipement", categorie: "Engins", sousCategorie: "Rateau faneur", produit: "rateau faneur reform", remarque: "", fournisseur: "", quantite: "1", payeur: "SY", montant: "200.00" },
  { date: "2025-06-10", operation: "Dépenses", production: "Équipement", categorie: "Engins", sousCategorie: "Faucheuse", produit: "faucheuse busatis latéral", remarque: "", fournisseur: "", quantite: "1", payeur: "SY", montant: "150.00" },
  { date: "2025-06-10", operation: "Dépenses", production: "Porcs", categorie: "Charges", sousCategorie: "Nourritures", produit: "sac aliments 20kg", remarque: "", fournisseur: "graineterie de wadicourt", quantite: "50", payeur: "BY", montant: "645.00" },
  { date: "2025-06-10", operation: "Dépenses", production: "Équipement", categorie: "Engins", sousCategorie: "Faneuse", produit: "faneuse porté 2 toupies", remarque: "", fournisseur: "", quantite: "1", payeur: "SY", montant: "250.00" },
  { date: "2025-06-12", operation: "Dépenses", production: "Équipement", categorie: "Engins", sousCategorie: "Broyeur", produit: "broyeur quivogne", remarque: "", fournisseur: "", quantite: "1", payeur: "SY", montant: "600.00" },
  { date: "2025-06-18", operation: "Dépenses", production: "Moutons", categorie: "Animaux", sousCategorie: "Cheptel", produit: "texel", remarque: "femelles", fournisseur: "", quantite: "4", payeur: "SY", montant: "600.00" },
  { date: "2025-06-20", operation: "Revenus", production: "Équipement", categorie: "Engins", sousCategorie: "Faneuse", produit: "faneuse porté 2 toupies", remarque: "", fournisseur: "", quantite: "1", payeur: "SY", montant: "350.00" },
  { date: "2025-06-20", operation: "Dépenses", production: "Équipement", categorie: "Engins", sousCategorie: "Faucheuse", produit: "faucheuse frontal pottinger", remarque: "", fournisseur: "", quantite: "1", payeur: "SY", montant: "3300.00" },
  { date: "2025-06-23", operation: "Dépenses", production: "Équipement", categorie: "Engins", sousCategorie: "Tracteur", produit: "aebi tt90", remarque: "", fournisseur: "", quantite: "1", payeur: "SY", montant: "14500.00" },
  { date: "2025-06-24", operation: "Dépenses", production: "Moutons", categorie: "Immobilisation", sousCategorie: "Parc", produit: "filet éléctrique", remarque: "N252610", fournisseur: "ELEVAGE SERVICE", quantite: "1", payeur: "SY", montant: "134.90" },
  { date: "2025-06-24", operation: "Dépenses", production: "Équipement", categorie: "Immobilisation", sousCategorie: "Lampe", produit: "lampe frontal", remarque: "EBCF41029", fournisseur: "ALSACE BATTERIES", quantite: "1", payeur: "SY", montant: "99.90" },
  { date: "2025-06-24", operation: "Dépenses", production: "Bovins", categorie: "Immobilisation", sousCategorie: "Parc", produit: "piquet et flexible hydro", remarque: "FA00001776", fournisseur: "SAS MECA'CHENILLES", quantite: "1", payeur: "SY", montant: "267.35" },
  { date: "2025-06-25", operation: "Dépenses", production: "Bovins", categorie: "Immobilisation", sousCategorie: "Parc", produit: "queu de cochon", remarque: "FA00001779", fournisseur: "SAS MECA'CHENILLES", quantite: "1", payeur: "SY", montant: "45.36" },
  { date: "2025-06-25", operation: "Dépenses", production: "Équipement", categorie: "Engins", sousCategorie: "Andaineur", produit: "andaineur khun", remarque: "", fournisseur: "", quantite: "1", payeur: "SY", montant: "250.00" },
  { date: "2025-06-25", operation: "Dépenses", production: "Équipement", categorie: "Engins", sousCategorie: "Faneuse", produit: "faneuse porté 4 toupies", remarque: "", fournisseur: "", quantite: "1", payeur: "SY", montant: "300.00" },
  { date: "2025-06-25", operation: "Dépenses", production: "Équipement", categorie: "Engins", sousCategorie: "Fournitures", produit: "entretien tt90", remarque: "facture 1010060672", fournisseur: "BALTHAZARD", quantite: "1", payeur: "SY", montant: "329.95" },
  { date: "2025-06-28", operation: "Revenus", production: "Équipement", categorie: "Engins", sousCategorie: "Rateau faneur", produit: "rateau faneur reform", remarque: "", fournisseur: "", quantite: "1", payeur: "SY", montant: "350.00" },
  { date: "2025-06-29", operation: "Dépenses", production: "Équipement", categorie: "Engins", sousCategorie: "Rouleau", produit: "rouleau a gazon", remarque: "", fournisseur: "", quantite: "1", payeur: "SY", montant: "120.00" },
  { date: "2025-07-02", operation: "Dépenses", production: "Équipement", categorie: "Engins", sousCategorie: "Faneuse", produit: "faneuse traine 4 toupies", remarque: "", fournisseur: "", quantite: "1", payeur: "SY", montant: "250.00" },
  { date: "2025-07-08", operation: "Dépenses", production: "Équipement", categorie: "Engins", sousCategorie: "Treuil", produit: "treuil gmc", remarque: "", fournisseur: "", quantite: "1", payeur: "SY", montant: "150.00" },
  { date: "2025-08-25", operation: "Dépenses", production: "Bovins", categorie: "Animaux", sousCategorie: "Vétérinaire", produit: "profilaxie entrée vache", remarque: "facl792507439", fournisseur: "filiavet", quantite: "1", payeur: "SY", montant: "266.63" },
  { date: "2025-08-26", operation: "Dépenses", production: "Porcs", categorie: "Immobilisation", sousCategorie: "Parc", produit: "parc a cochon", remarque: "crampillons, seau de chantier, isolateurs, grillage", fournisseur: "", quantite: "1", payeur: "BY", montant: "193.75" },
  { date: "2025-08-27", operation: "Dépenses", production: "Équipement", categorie: "Engins", sousCategorie: "Broyeur", produit: "broyeur a fléau", remarque: "", fournisseur: "", quantite: "1", payeur: "SY", montant: "2000.00" },
  { date: "2025-08-28", operation: "Dépenses", production: "Moutons", categorie: "Animaux", sousCategorie: "Cheptel", produit: "texel", remarque: "serge male", fournisseur: "", quantite: "1", payeur: "SY", montant: "300.00" },
  { date: "2025-08-30", operation: "Revenus", production: "Équipement", categorie: "Engins", sousCategorie: "Tracteur", produit: "metrac", remarque: "", fournisseur: "", quantite: "1", payeur: "SY", montant: "9000.00" },
  { date: "2025-09-08", operation: "Dépenses", production: "Porcs", categorie: "Animaux", sousCategorie: "Cheptel", produit: "gascon/rose", remarque: "", fournisseur: "", quantite: "6", payeur: "BY", montant: "480.00" },
  { date: "2025-09-20", operation: "Dépenses", production: "Équipement", categorie: "Engins", sousCategorie: "Rateau faneur", produit: "rateau faneur aebi", remarque: "", fournisseur: "", quantite: "1", payeur: "SY", montant: "1500.00" },
  { date: "2025-09-25", operation: "Dépenses", production: "Bovins", categorie: "Charges", sousCategorie: "Nourritures", produit: "lait poudre 25kg", remarque: "FVC5080688", fournisseur: "CAC COLMAR", quantite: "1", payeur: "SY", montant: "67.39" },
  { date: "2025-09-25", operation: "Dépenses", production: "Poule pondeuse", categorie: "Charges", sousCategorie: "Nourritures", produit: "pellet pondeuse 25kg", remarque: "FVC5080688", fournisseur: "CAC COLMAR", quantite: "2", payeur: "SY", montant: "28.30" },
  { date: "2025-09-25", operation: "Dépenses", production: "Bovins", categorie: "Charges", sousCategorie: "Nourritures", produit: "sel 10kg", remarque: "FVC5080688", fournisseur: "CAC COLMAR", quantite: "4", payeur: "SY", montant: "18.02" },
  { date: "2025-09-25", operation: "Dépenses", production: "Canard", categorie: "Charges", sousCategorie: "Nourritures", produit: "blé 25kg", remarque: "FVC5080688", fournisseur: "CAC COLMAR", quantite: "1", payeur: "SY", montant: "6.73" },
  { date: "2025-09-25", operation: "Dépenses", production: "Bovins", categorie: "Charges", sousCategorie: "Nourritures", produit: "mais 25kg", remarque: "FVC5080688", fournisseur: "CAC COLMAR", quantite: "1", payeur: "SY", montant: "6.99" },
  { date: "2025-09-25", operation: "Dépenses", production: "Équipement", categorie: "Charges", sousCategorie: "Semences", produit: "semence prairie 15 kg", remarque: "FVC5080688", fournisseur: "CAC COLMAR", quantite: "1", payeur: "SY", montant: "84.38" },
  { date: "2025-10-07", operation: "Dépenses", production: "Bovins", categorie: "Immobilisation", sousCategorie: "Parc", produit: "isolateur fer a beton", remarque: "", fournisseur: "", quantite: "200", payeur: "SY", montant: "96.99" },
  { date: "2025-10-25", operation: "Dépenses", production: "Poule pondeuse", categorie: "Charges", sousCategorie: "Nourritures", produit: "pellet pondeuse 25kg", remarque: "FVC5090797", fournisseur: "CAC COLMAR", quantite: "4", payeur: "SY", montant: "56.60" },
  { date: "2025-10-25", operation: "Dépenses", production: "Bovins", categorie: "Charges", sousCategorie: "Nourritures", produit: "sel 10kg", remarque: "FVC5090797", fournisseur: "CAC COLMAR", quantite: "6", payeur: "SY", montant: "24.12" },
  { date: "2025-10-25", operation: "Dépenses", production: "Bovins", categorie: "Charges", sousCategorie: "Nourritures", produit: "mais 25kg", remarque: "FVC5090797", fournisseur: "CAC COLMAR", quantite: "20", payeur: "SY", montant: "131.88" },
  { date: "2025-10-25", operation: "Revenus", production: "Canard", categorie: "Charges", sousCategorie: "Nourritures", produit: "blé 25kg", remarque: "FVC5090797", fournisseur: "CAC COLMAR", quantite: "10", payeur: "SY", montant: "64.62" },
  { date: "2025-10-29", operation: "Dépenses", production: "Moutons", categorie: "Immobilisation", sousCategorie: "Parc", produit: "parc a mouton collines", remarque: "", fournisseur: "", quantite: "3", payeur: "SY", montant: "167.70" },
  { date: "2025-11-09", operation: "Dépenses", production: "Porcs", categorie: "Animaux", sousCategorie: "Cheptel", produit: "gascon/rose", remarque: "", fournisseur: "", quantite: "5", payeur: "BY", montant: "400.00" },
  { date: "2025-11-25", operation: "Dépenses", production: "Poule pondeuse", categorie: "Charges", sousCategorie: "Nourritures", produit: "pellet pondeuse 25kg", remarque: "FVC5100867", fournisseur: "CAC COLMAR", quantite: "10", payeur: "SY", montant: "141.50" },
  { date: "2025-12-25", operation: "Dépenses", production: "Porcs", categorie: "Charges", sousCategorie: "Nourritures", produit: "pellet porc 25 kg", remarque: "FVC5111121", fournisseur: "CAC COLMAR", quantite: "8", payeur: "SY", montant: "113.10" },
  { date: "2025-12-25", operation: "Dépenses", production: "Chien", categorie: "Charges", sousCategorie: "Nourritures", produit: "croquette chien 20 kg", remarque: "FVC5111121", fournisseur: "CAC COLMAR", quantite: "1", payeur: "SY", montant: "30.12" },
  { date: "2026-01-25", operation: "Dépenses", production: "Porcs", categorie: "Charges", sousCategorie: "Nourritures", produit: "pellet porc 25 kg", remarque: "FVC5120543", fournisseur: "CAC COLMAR", quantite: "40", payeur: "SY", montant: "565.48" },
  { date: "2026-01-25", operation: "Dépenses", production: "Chien", categorie: "Charges", sousCategorie: "Nourritures", produit: "croquette chien 20 kg", remarque: "FVC5120543", fournisseur: "CAC COLMAR", quantite: "2", payeur: "SY", montant: "61.68" },
  { date: "2026-01-27", operation: "Dépenses", production: "Bovins", categorie: "Animaux", sousCategorie: "Vétérinaire", produit: "profilaxie 2025", remarque: "facl792512568", fournisseur: "filiavet", quantite: "1", payeur: "SY", montant: "126.89" },
  { date: "2026-02-13", operation: "Dépenses", production: "Moutons", categorie: "Charges", sousCategorie: "Cheptel", produit: "limousine/hampshire", remarque: "male de 4 ans", fournisseur: "", quantite: "1", payeur: "SY", montant: "280.00" },
  { date: "2026-02-25", operation: "Dépenses", production: "Porcs", categorie: "Charges", sousCategorie: "Nourritures", produit: "pellet porc 25 kg", remarque: "FVC6010799", fournisseur: "CAC COLMAR", quantite: "20", payeur: "SY", montant: "248.45" },
  { date: "2026-02-25", operation: "Dépenses", production: "Poule pondeuse", categorie: "Charges", sousCategorie: "Nourritures", produit: "pellet pondeuse 25kg", remarque: "FVC6010799", fournisseur: "CAC COLMAR", quantite: "5", payeur: "SY", montant: "70.75" },
  { date: "2026-02-25", operation: "Dépenses", production: "Chien", categorie: "Charges", sousCategorie: "Nourritures", produit: "croquette chien 20 kg", remarque: "FVC6010799", fournisseur: "CAC COLMAR", quantite: "3", payeur: "SY", montant: "79.44" },
  { date: "2026-02-28", operation: "Dépenses", production: "Moutons", categorie: "Charges", sousCategorie: "Nourritures", produit: "lait en poudre mouton 25kg", remarque: "fvc6020702", fournisseur: "CAC COLMAR", quantite: "1", payeur: "SY", montant: "55.53" },
  { date: "2026-02-28", operation: "Dépenses", production: "Poule pondeuse", categorie: "Charges", sousCategorie: "Nourritures", produit: "farine pondeuse 25kg", remarque: "fvc6020702", fournisseur: "CAC COLMAR", quantite: "2", payeur: "SY", montant: "34.50" },
  { date: "2026-02-28", operation: "Dépenses", production: "Chien", categorie: "Charges", sousCategorie: "Nourritures", produit: "croquette chien 20 kg", remarque: "fvc6020702", fournisseur: "CAC COLMAR", quantite: "2", payeur: "SY", montant: "61.68" },
  { date: "2026-02-28", operation: "Dépenses", production: "Porcs", categorie: "Charges", sousCategorie: "Nourritures", produit: "vrac pellet porc 1,1 tonnes", remarque: "fvc6020702", fournisseur: "CAC COLMAR", quantite: "1", payeur: "SY", montant: "381.66" },
  { date: "2026-03-07", operation: "Dépenses", production: "Moutons", categorie: "Charges", sousCategorie: "Vétérinaire", produit: "visite toxemie brebis + belier", remarque: "facl7926020001", fournisseur: "filiavet", quantite: "1", payeur: "SY", montant: "259.84" },
  { date: "2026-03-18", operation: "Dépenses", production: "Moutons", categorie: "Animaux", sousCategorie: "Cheptel", produit: "mouton lucas desfranes", remarque: "", fournisseur: "", quantite: "9", payeur: "SY", montant: "870.00" },
  { date: "2026-03-27", operation: "Dépenses", production: "Équipement", categorie: "Engins", sousCategorie: "Tracteur", produit: "flexible, boule d'azote", remarque: "fc26/00640", fournisseur: "mlsi", quantite: "1", payeur: "revolut", montant: "81.60" },
  { date: "2026-03-31", operation: "Dépenses", production: "Équipement", categorie: "Engins", sousCategorie: "Gator", produit: "chaine gator", remarque: "fc26/00747", fournisseur: "mlsi", quantite: "1", payeur: "revolut", montant: "82.67" },
  { date: "2026-03-31", operation: "Dépenses", production: "Moutons", categorie: "Charges", sousCategorie: "Nourritures", produit: "sceau mineraux", remarque: "FVC6031124", fournisseur: "CAC COLMAR", quantite: "1", payeur: "revolut", montant: "33.73" },
  { date: "2026-03-31", operation: "Dépenses", production: "Chien", categorie: "Charges", sousCategorie: "Nourritures", produit: "croquette chien 20 kg", remarque: "FVC6031124", fournisseur: "CAC COLMAR", quantite: "2", payeur: "revolut", montant: "60.24" },
  { date: "2026-04-03", operation: "Revenus", production: "Porcs", categorie: "Animaux", sousCategorie: "Viande", produit: "viande sylvie cochon 1et2", remarque: "FVC6031124", fournisseur: "", quantite: "", payeur: "BY", montant: "112.00" },
  { date: "2026-04-20", operation: "Revenus", production: "Porcs", categorie: "Animaux", sousCategorie: "Viande", produit: "Viande amigo cochon 3 mergez", remarque: "", fournisseur: "", quantite: "", payeur: "BY", montant: "55.00" },
  { date: "2026-04-21", operation: "Dépenses", production: "Équipement", categorie: "Engins", sousCategorie: "Fournitures", produit: "aebi tt90", remarque: "joints", fournisseur: "BALTHAZARD", quantite: "1", payeur: "revolut", montant: "89.88" },
  { date: "2026-04-22", operation: "Dépenses", production: "Poulet de chair", categorie: "Animaux", sousCategorie: "Cheptel", produit: "poulet de chaire", remarque: "13 cou nu / 13 blanc", fournisseur: "GAMP", quantite: "26", payeur: "BY", montant: "96.80" },
  { date: "2026-04-30", operation: "Dépenses", production: "Porcs", categorie: "Animaux", sousCategorie: "Cheptel", produit: "insemination truie brune", remarque: "", fournisseur: "elitest brumath", quantite: "2", payeur: "revolut", montant: "24.54" },
  { date: "2026-04-30", operation: "Dépenses", production: "Chien", categorie: "Charges", sousCategorie: "Nourritures", produit: "croquette chien 20 kg", remarque: "FVC6041179", fournisseur: "CAC COLMAR", quantite: "4", payeur: "revolut", montant: "120.48" },
  { date: "2026-04-30", operation: "Dépenses", production: "Poule pondeuse", categorie: "Charges", sousCategorie: "Nourritures", produit: "farine pondeuse 25kg", remarque: "FVC6041179", fournisseur: "CAC COLMAR", quantite: "3", payeur: "revolut", montant: "42.05" },
  { date: "2026-04-30", operation: "Dépenses", production: "Poulet de chair", categorie: "Charges", sousCategorie: "Nourritures", produit: "miette start 25kg", remarque: "FVC6041179", fournisseur: "CAC COLMAR", quantite: "1", payeur: "revolut", montant: "16.32" },
  { date: "2026-04-30", operation: "Dépenses", production: "Poulet de chair", categorie: "Charges", sousCategorie: "Nourritures", produit: "croissance 25kg", remarque: "FVC6041179", fournisseur: "CAC COLMAR", quantite: "2", payeur: "revolut", montant: "31.33" },
  { date: "2026-04-30", operation: "Dépenses", production: "Équipement", categorie: "Charges", sousCategorie: "Semences", produit: "semence prairie 15 kg", remarque: "FVC6041179", fournisseur: "CAC COLMAR", quantite: "1", payeur: "revolut", montant: "85.14" },
  { date: "2026-05-02", operation: "Revenus", production: "Porcs", categorie: "Animaux", sousCategorie: "Viande", produit: "Viande amigo cochon 3 pate", remarque: "", fournisseur: "", quantite: "", payeur: "BY", montant: "100.00" },
  { date: "2026-05-02", operation: "Revenus", production: "Porcs", categorie: "Animaux", sousCategorie: "Viande", produit: "Viande marc cochon 1et2", remarque: "", fournisseur: "", quantite: "", payeur: "BY", montant: "515.25" },
  { date: "2026-05-07", operation: "Dépenses", production: "Bovins", categorie: "Charges", sousCategorie: "Cotisation", produit: "chambre agriculture", remarque: "", fournisseur: "", quantite: "", payeur: "revolut", montant: "69.06" },
  { date: "2026-05-20", operation: "Dépenses", production: "Bovins", categorie: "Charges", sousCategorie: "Parc", produit: "fert a beton", remarque: "10mm. 6m", fournisseur: "tcr", quantite: "40", payeur: "revolut", montant: "176.64" },
  { date: "2026-05-23", operation: "Dépenses", production: "Abeille", categorie: "Animaux", sousCategorie: "Cheptel", produit: "essaine + matériel d'apiculture", remarque: "", fournisseur: "LUDO", quantite: "1", payeur: "BY", montant: "2500.00" },
];

export default function SeedComptabilitePage() {
  const [log, setLog] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  const run = async () => {
    setRunning(true);
    const lines: string[] = [];
    for (let i = 0; i < TRANSACTIONS.length; i++) {
      const t = TRANSACTIONS[i];
      const res = await createTransaction(t);
      if (res.success) {
        lines.push(`✅ ${t.date} — ${t.production} — ${t.produit} (${t.operation === "Dépenses" ? "-" : "+"}${t.montant} €)`);
      } else {
        lines.push(`❌ ${t.date} — ${t.produit} : ${res.error}`);
      }
      setProgress(i + 1);
    }
    setLog(lines);
    setDone(true);
    setRunning(false);
  };

  return (
    <div className="max-w-2xl mx-auto mt-10 p-6 bg-white rounded-xl shadow">
      <h1 className="text-xl font-bold mb-2">💰 Seed — Import comptabilité</h1>
      <p className="text-sm text-gray-500 mb-4">
        Importe les <strong>{TRANSACTIONS.length} transactions</strong> de la ferme (août 2024 → mai 2026) dans Firebase.
        <br />⚠️ À utiliser <strong>une seule fois</strong>. Ne pas relancer pour éviter les doublons.
      </p>

      {!done ? (
        <div className="space-y-4">
          {running && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Progression</span>
                <span>{progress} / {TRANSACTIONS.length}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-primary to-secondary h-3 rounded-full transition-all duration-300"
                  style={{ width: `${(progress / TRANSACTIONS.length) * 100}%` }}
                />
              </div>
            </div>
          )}
          <button
            onClick={run}
            disabled={running}
            className="bg-gradient-to-br from-primary to-secondary text-white px-6 py-3 rounded-lg font-semibold disabled:opacity-50 cursor-pointer"
          >
            {running ? `Import en cours... (${progress}/${TRANSACTIONS.length})` : `🚀 Importer les ${TRANSACTIONS.length} transactions`}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-sm font-semibold text-green-700 mb-3">
            ✅ Import terminé — {log.filter(l => l.startsWith("✅")).length} succès, {log.filter(l => l.startsWith("❌")).length} erreurs
          </div>
          <div className="max-h-96 overflow-y-auto space-y-1">
            {log.map((l, i) => (
              <p key={i} className={`text-xs font-mono p-1.5 rounded ${l.startsWith("✅") ? "bg-green-50" : "bg-red-50"}`}>{l}</p>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-4">Tu peux maintenant aller sur <a href="/couts" className="text-primary underline">/couts</a> pour voir les transactions.</p>
        </div>
      )}
    </div>
  );
}
