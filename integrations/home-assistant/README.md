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

Le calcul utilise un seuil bas `minimum_d`, un seuil haut `minimum_d + 2 °C`, une tendance sur 10 à 15 minutes et une projection à 10 minutes. Avec le réglage 58 °C, la plage souhaitée du ballon D est donc 58–60 °C.

Le repos correspond à une **consigne fioul de 50 °C**. Dès que D atteint le seuil haut, la proposition revient directement à 50 °C, sans attendre la temporisation ou les trois confirmations exigées pour une hausse. Cette priorité de retour au repos s'applique aussi après une précédente alerte d'absence de remontée. Elle ne commande pas l'arrêt du brûleur.

Au repos, la proposition reste à 50 °C tant que la projection à 10 minutes ne prévoit pas de passage sous le seuil bas. Les hausses simulées de 1 °C, ou de 2 °C en cas de baisse plus marquée, restent espacées d'au moins 10 minutes et nécessitent trois confirmations sur des relevés distincts. La demande d'appoint devient persistante à la première hausse confirmée ; une prédiction transitoire pendant l'attente ne suffit pas à la mémoriser. La demande persiste ensuite entre les deux seuils jusqu'au seuil haut. Elle se désengage aussi si D est déjà au-dessus du seuil bas et remonte assez vite pour atteindre le seuil haut dans la projection à 10 minutes.

Le dernier segment récent, couvrant au moins deux minutes, doit confirmer une remontée avant un désengagement anticipé. Une tendance ancienne positive ne doit pas masquer un refroidissement récent, et une ancienne baisse ne doit pas provoquer une hausse alors que le ballon remonte nettement.

Exemples avec seuil bas 58 °C : D à 60 °C stable → retour immédiat à 50 °C ; D à 59 °C stable après désengagement → maintien à 50 °C ; D à 59 °C descendant de 0,2 °C/min → demande d'appoint progressive ; D à 59 °C montant de 0,1 °C/min → retour à 50 °C. La plage automatique **provisoire** est 50–85 °C ; elle ne valide pas les limites physiques de la chaudière. Les champs `commissioned_minimum` et `commissioned_maximum` restent nuls.

Après une coupure ou une reprise du moteur d'observation, la demande et la dernière proposition sont conservées pour la même révision de réglages. L'historique est reconstruit avant toute nouvelle hausse. Une tendance manquante ne signifie pas que l'appoint est devenu inutile. Le retour au repos reste conditionné à deux mesures fraîches et valides ; dès que D atteint le seuil haut, cette décision reste prioritaire.

Le délai d'observation d'une remontée ne démarre que lorsque la proposition atteint au moins `max(température D, température B) + 2 °C`. Une proposition encore trop basse pour apporter de la chaleur ne déclenche pas une fausse absence de réponse. Si D ne montre ensuite pas de hausse d'au moins 0,3 °C pendant 30 minutes, les nouvelles hausses sont suspendues. La limite de 85 °C n'est jamais dépassée, même si ce niveau théoriquement utile serait supérieur. **Puisque ces propositions ne sont pas appliquées, ce constat ne démontre pas une panne du chauffage.**

Depuis le repos à 50 °C, la montée de 1–2 °C par dix minutes peut être trop lente pour empêcher D de franchir 55 °C. Cette cadence d'observation n'est donc pas validée pour le pilotage physique. Elle devra être ajustée à partir de mesures B fiables et du délai réel de transfert entre bâtiments avant activation, sans déduire un saut initial arbitraire.

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
- `heat_demand` : demande d'appoint mémorisée dans le calcul ; `resting_temperature` : 50 °C.

| Code | Sens |
|---|---|
| `manual_observation` | Réglage manuel mémorisé, aucun mouvement |
| `warming_up` | Construction d'un historique récent suffisant |
| `automatic_observation` | Calcul automatique en observation |
| `resting_observation` | Proposition maintenue au repos à 50 °C |
| `releasing_observation` | Retour proposé directement à 50 °C |
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
