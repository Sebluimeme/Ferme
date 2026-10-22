# Chauffage Ferme : observation avant mise en service

`ferme_chauffage.yaml` est un package Home Assistant autonome. Il mémorise les réglages depuis Ferme et calcule des propositions de consigne. **Cette version ne commande aucun équipement.** Les seules actions présentes sont deux écritures `input_text.set_value`, vers ses propres helpers. Les attributs `calibration_valid` et `actuation_enabled` sont des constantes `false`, sans interrupteur permettant de les activer.

## Chargement

Inclure le fichier dans `homeassistant.packages`, conserver une sauvegarde de la configuration et valider celle-ci avec `homeassistant.check_config`. Le package utilise des intégrations rechargeables : `input_text.reload`, `script.reload`, `automation.reload`, puis `template.reload`. Aucun redémarrage de Home Assistant ou des modules ESPHome n'est nécessaire. L'observateur s'exécute ensuite à chaque minute.

Ne pas remplacer les autres packages, automatisations ou helpers. La configuration JSON n'a pas de valeur `initial` imposée : Home Assistant conserve les réglages après redémarrage. En absence de réglages, les valeurs de préparation sont mode manuel, consigne fioul 60 °C et limite D 58 °C.

## Contrat de configuration

Appeler uniquement `script.ferme_chauffage_configurer` avec les six champs :

| Champ | Valeur |
|---|---|
| `mode` | `manual` ou `automatic` |
| `manual_temperature` | Entier entre 50 et 90 °C, mémorisé uniquement |
| `minimum_d` | Entier entre 40 et 75 °C, seuil souhaité sur la sonde D de Ferme |
| `request_id` | Identifiant unique de 1 à 48 caractères : lettres ASCII, chiffres, `_`, `-` |
| `expires_at` | Date limite Unix UTC en secondes, future et au maximum dans 120 secondes |
| `expected_revision` | Dernière révision connue, entier positif ou nul |

Le script est sérialisé (`queued`) et contrôle les données au début de chaque exécution. Une expiration, un conflit de révision ou la réutilisation du dernier identifiant avec un contenu différent arrête le script avec une erreur. Une répétition identique du dernier identifiant ne réécrit rien.

Une seule écriture atomique produit `input_text.ferme_chauffage_configuration` :

```json
{"v":1,"r":1,"m":"automatic","t":60,"d":58,"id":"identifiant_unique"}
```

Lire ce helper après l'appel pour confirmer `id` et `r`. Ne pas confondre cet acquittement de **mémorisation** avec l'application d'une consigne au servo. Ne pas stocker de commandes hors ligne à rejouer plus tard.

## Calcul en observation

Les capteurs sont `sensor.esphome_web_61063e_tampon_haut` et `sensor.batiment_b_ballon_b`. Les deux doivent fournir un nombre valide en °C et un `last_reported` datant de moins de cinq minutes. Valeur indisponible, historique restauré, date future et unités incorrectes suspendent le calcul. Une ancienne température reste exploitable pour l'affichage de Ferme, mais pas pour la régulation.

Le calcul utilise une cible `minimum_d + 2 °C`, une tendance sur 10 à 15 minutes et une projection à 10 minutes. Il attend trois confirmations sur des relevés distincts avant de proposer une variation. Les corrections simulées sont de 1 °C, ou de 2 °C en cas de baisse plus marquée, espacées d'au moins 10 minutes. La plage automatique **provisoire** est 50–85 °C ; elle ne valide pas les limites physiques de la chaudière. Les champs `commissioned_minimum` et `commissioned_maximum` restent nuls.

Une remontée suffisamment rapide évite de proposer une hausse ; une température au-dessus de la cible permet une diminution progressive. Après une coupure ou une reprise du moteur d'observation, l'historique est reconstruit avant toute nouvelle proposition. Si D ne montre pas de hausse d'au moins 0,3 °C dans les 30 minutes suivant le début des propositions montantes, les nouvelles hausses sont suspendues. **Puisque ces propositions ne sont pas appliquées, ce constat ne démontre pas une panne du chauffage.**

## État exposé

Les constantes numériques et booléennes sont exprimées comme templates (`{{ 1 }}`, `{{ false }}`) afin que Home Assistant les publie comme nombres et booléens natifs. Des scalaires YAML statiques seraient publiés ici comme chaînes et doivent être évités. Les tests verrouillent cette représentation.

`sensor.ferme_chauffage_controle` expose les réglages, la révision, l'identifiant acquitté et :

- `phase` : `observation` ou `suspended` ;
- `reason` : code ci-dessous ;
- `recommended_temperature` : proposition en °C, ou `null` si suspendue ou périmée ;
- `observed_temperature_d`, `observed_temperature_b`, `trend_c_per_minute` ;
- `last_proposal_at`, `next_adjustment_at` : secondes Unix, la seconde date est la prochaine possibilité théorique de correction ;
- `updated_at` : date ISO ;
- les indicateurs constants de verrouillage et les bornes provisoires.

| Code | Sens |
|---|---|
| `manual_observation` | Réglage manuel mémorisé, aucun mouvement |
| `warming_up` | Construction d'un historique récent suffisant |
| `automatic_observation` | Calcul automatique en observation |
| `stabilizing` | Attente de confirmations sur de nouveaux relevés |
| `cooldown` | Attente entre deux propositions de variation |
| `sensor_d_unavailable`, `sensor_b_unavailable` | Mesure invalide ou indisponible |
| `sensor_d_stale`, `sensor_b_stale` | Mesure trop ancienne ou date future |
| `no_heat_response` | Pas de remontée observée ; aucune hausse supplémentaire proposée |
| `configuration_invalid` | Configuration incohérente, à corriger avant de poursuivre |
| `observer_stale` | Le moteur n'a pas produit de résultat depuis plus de trois minutes |

## Conditions avant commande réelle

La conversion historique du potentiomètre est `level = 4 × température − 250`, puis division par 100 côté ESPHome. À 90 °C, elle produit 110 %, ce qui dépasse la plage usuelle du servo. Le capteur de position existant ne constitue pas un retour mécanique fiable. **Aucune correction de cette formule ni calibration n'est déduite automatiquement.**

La prochaine mise en service nécessite les positions mécaniques mesurées, la validation des bornes minimale et maximale de la chaudière, une liaison B stable et une revue des anciennes automatisations pouvant aussi commander `climate.chaudiere_fioul` ou `esphome.batiment_b_control_servo`. Toute future commande doit rester bornée à −100..100 et à la plage effectivement calibrée, sans dépasser 90 °C. Cette étape exige un nouveau changement de code ; elle ne peut pas être déclenchée depuis Ferme dans cette version.

La régulation proposée ne touche ni les pompes, ni le thermostat physique d'autorisation à 55 °C, qui utilise une sonde différente.

## Application et relais de configuration

L'écran Chauffage utilise `useHeatingControl` et `HeatingControlPanel`. Une demande n'est envoyée que si la session est authentifiée, la connexion active et l'état du contrôleur récent. Le brouillon conserve la révision lue à son ouverture ; une modification depuis un autre appareil impose de rouvrir le panneau. L'écriture REST crée un identifiant unique avec `If-Match: null_etag`, une durée de validité de 90 secondes et aucune file de commandes hors ligne. Seul l'identifiant du reçu est conservé localement pour retrouver une confirmation après rechargement.

`scripts/home-assistant-heating-control-bridge.mjs` est un service indépendant du relais des températures et de l'irrigation. Il utilise les variables `HOME_ASSISTANT_URL`, `HOME_ASSISTANT_TOKEN`, `NEXT_PUBLIC_FIREBASE_DATABASE_URL`, `NEXT_PUBLIC_FIREBASE_API_KEY`, `FIREBASE_EMAIL` et `FIREBASE_PASSWORD` dans un fichier d'environnement privé. Lancer `npm run ha:chauffage:control` (ou ajouter `-- --once` pour un seul cycle).

Le relais publie l'état dans `chauffage-ha/control/status` et consomme uniquement `chauffage-ha/control/requests`. Il réserve la demande par écriture conditionnelle, appelle exclusivement le script de configuration, puis confirme l'identifiant et la révision en relisant Home Assistant. Une réponse HTTP 200 ne suffit pas : Home Assistant peut renvoyer ce code même si le script refuse une demande. Après une réponse perdue, le relais relit l'état sans répéter l'appel. Les demandes interrompues deviennent confirmées ou incertaines, jamais rejouées.

Les règles Firebase existantes donnent aux utilisateurs autorisés des droits larges. Avant toute future commande physique, prévoir une identité distincte pour le relais et des règles limitant l'écriture des reçus et des états au serveur. Cette version n'utilise ni l'identité déclarée par le client ni un reçu Firebase comme autorisation de mouvement.

## Vérification des calculs et de la transmission

```sh
npm run test:chauffage
python3 scripts/test-heating-ha.py
```

Les tests nécessitent PyYAML et Jinja2. Ils exécutent les expressions du fichier livré avec des états isolés, vérifient les limites, expirations, révisions, coupures, temporisations, tendances et l'absence de service physique. Ils ne se connectent à aucun appareil. La validation du schéma Home Assistant et le rendu natif des templates complètent ces tests lors du chargement.
