# Référence de conception du calcul adaptatif

`heating-regulation-model.mjs` est un modèle pur de référence, sans accès réseau, stockage ou appareil. Le contrôleur effectivement exécuté est le **YAML Home Assistant**, testé directement par `scripts/test-heating-ha.py`. Le module JavaScript n'est pas une dépendance du pilotage et son résultat `authorizesActuation:false` ne peut pas déverrouiller du matériel.

La politique commune utilise le minimum D57 °C par défaut, la cible au milieu entre ce minimum et60 °C, le repos fioul50 °C, un plafond70 °C, une première hausse utile depuis50, puis des pas1–2 °C/10min et des réductions2–4 °C/5min. D≥60 demande immédiatement50. La demande d'appoint reste mémorisée pendant la réduction tant que la consigne n'a pas atteint50.

Le paramètre `lastTransmitted:{temperature,at}` désigne uniquement le dernier appel API Home Assistant terminé sans erreur. **Ce n'est ni un accusé ESPHome, ni une mesure de la position du servo.** Une proposition ou un réglage mémorisé ne modifie jamais cette donnée. Les délais se calculent depuis cette transmission et les consignes non transmises ne font pas avancer les étapes de hausse.

La calibration du potentiomètre est indépendante du calcul thermique. Le package exige trois points50/60/70 confirmés sur place, interpole leurs niveaux par segments et bloque une calibration incomplète ou invalide. Les bornes50–70 restent strictes, indépendamment de l'espace de paramètres du modèle expérimental. Le modèle ne valide pas à lui seul la chaudière ou ses délais thermiques.

Différences volontaires : le modèle de référence utilise les médianes des pentes entre paires de points à la minute. Le YAML conserve jusqu'à neuf points comprimés dans un helper255caractères, espacés d'environ deux minutes, puis compare pente lente, pente récente et dernier segment. Le modèle exige une date de relevé récente ; le YAML s'appuie sur la disponibilité native des deux sondes ESPHome fixes vérifiées, car leurs valeurs inchangées ne rafraîchissent pas `last_reported`. Il échantillonne ces états valides à l'instant local pour constituer les tendances, sans modifier les dates sources. Le YAML conserve aussi l'intention prioritaire50 quand D est chaud mais B absent, tout en interdisant son envoi avant que B soit à nouveau disponible et valide ; le modèle suspend entièrement sa proposition si une source manque. Les gardes, l'arbitrage avec l'ancienne automatisation, la reprise, les tentatives et la vérité du statut API sont testés dans le harness YAML, pas dans ce modèle.

```sh
node scripts/test-heating-adaptive-model.mjs
python3 scripts/test-heating-ha.py
```

Les tests JavaScript couvrent les scénarios thermiques de référence et l'absence de mutation des entrées ; les tests Python couvrent le code livré et son faux service matériel. Les deux restent sans connexion à Home Assistant ou au servo.
