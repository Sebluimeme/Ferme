<!-- BEGIN PROJECT DESIGN FACTS -->
# DESIGN — Pilotage ferme

## Objectif

Permettre des saisies rapides sur le terrain et rendre immédiatement lisibles les tâches, animaux, achats, coûts, chauffage, aides et cartes.

## Choix visuels constatés

- PWA claire, pensée d’abord pour le téléphone et les zones sûres iOS.
- Vert profond de marque `#237549`, fond `#f5f5f7`, surfaces blanches, texte `#1d1d1f`.
- Neutres chauds et états métier distincts ; typographie système/Roboto.
- Contrôles et formulaires adaptés au tactile ; navigation inférieure sur mobile.

## Règles de continuité

- Cible tactile d’au moins 44 px ; taille de saisie de 16 px minimum sur mobile.
- Utiliser le système de formulaire déjà défini dans `src/app/globals.css`; ne pas introduire de grilles à deux colonnes non adaptatives dans les modales.
- Les chiffres, unités, dates et états de synchronisation doivent être explicites.

## Vérifications minimales

- iPhone, Android étroit et bureau ; hors ligne ; erreurs de synchronisation ; formulaires longs ; clavier ; cartes et graphiques.
<!-- END PROJECT DESIGN FACTS -->
