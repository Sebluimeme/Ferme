# Chauffage Ferme : contrôleur local Home Assistant

`ferme_chauffage.yaml` mémorise les réglages depuis Ferme, calcule la consigne et peut la transmettre directement au module B. Le calcul et la reprise après une coupure fonctionnent dans Home Assistant, sans ordinateur ni navigateur ouvert. La liaison Ferme → Home Assistant sert uniquement à mémoriser la configuration.

La calibration utilise les graduations du potentiomètre lues sur place par le propriétaire le 22 octobre 2026. Le test a montré que l'ancienne formule `level = 4 × température − 250` plaçait une demande de 60 °C vers 62,5 °C : elle est retirée.

| Graduation confirmée | Niveau ESPHome confirmé |
|---|---:|
| 50 °C | −56 |
| 60 °C | −18 |
| 70 °C | 24 |

Le premier niveau −50 avait été lu à 50 °C, mais le retour depuis 80 °C a ensuite montré 52 °C après stabilisation. Le niveau bas a donc été corrigé à −56 : 50 °C a été confirmé, puis retrouvé exactement après un aller-retour à 60 °C. Le point 60 → −18 a aussi été revérifié lors de cet aller-retour. Les essais ont ensuite confirmé de nouveau 60 et 70 °C lors de la montée. Au niveau 56, une montée par paliers a donné 79 °C, puis le saut direct 50 → 80 a donné 80 °C. Les deux retours directs depuis ce niveau haut ont retrouvé 50 °C au niveau −56. Ces observations ne démontrent pas une précision mécanique parfaite. Le point 80 reste hors de la plage du contrôleur et ne relève pas son plafond de 70 °C.

La plage autorisée reste **50–70 °C**. Les valeurs intermédiaires sont estimées par interpolation entre ces points, sans extrapolation. Une calibration incomplète ou invalide bloque l'appel matériel. Le service unique est `esphome.batiment_b_control_servo`, dont le firmware divise le niveau par 100. Ces lectures calibrent les graduations, pas une mesure de température de chaudière. Le capteur de position historique n'est pas une mesure mécanique fiable.

**« Transmis » signifie uniquement que l'appel de service Home Assistant s'est terminé sans erreur.** Le firmware ne fournit pas d'accusé d'application ni de retour mécanique ; `position_feedback` vaut toujours `unmeasured`. Un état de ballon disponible indique une connexion native utilisable, sans prouver un nouvel échantillon à chaque consultation ni le mouvement du servo.

## Activation et chargement

Le nouvel interrupteur `input_boolean.ferme_chauffage_commande_active` est désactivé lors de sa première création. Il n'a pas de `initial` : son état et les cinq helpers JSON sont restaurés après redémarrage. Un contrôleur précédemment activé peut donc reprendre après le démarrage, uniquement avec une configuration valide et des sondes natives disponibles, non restaurées. La consigne absolue est recalculée et réémise ; aucun ancien ordre n'est rejoué.

Avant activation : sauvegarder la configuration et les états, valider le package avec `homeassistant.check_config`, désactiver l'ancienne automatisation `automation.nouvelle_automatisation_2`, puis contrôler les gardes et activer le nouvel interrupteur dans Home Assistant. Les températures doivent être fiables et la liaison B doit être surveillée pendant la mise en service. Ce réglage d'activation n'est pas exposé dans Ferme ou Firebase.

Le fichier appartient à `homeassistant.packages`. Recharger uniquement les intégrations modifiées : `input_boolean.reload`, `input_text.reload`, `script.reload`, `template.reload`, et **`automation.reload` avec `id: ferme_chauffage_observer`** sur Home Assistant2026.7.4. Ce dernier identifiant conserve celui de l'ancien observateur. Aucun redémarrage ni modification des autres automatisations n'est nécessaire. Ne pas interrompre une irrigation ou un script en cours lors d'un rechargement global d'intégration.

Le package n'actionne **aucune pompe**, aucun thermostat de sécurité, ni la gestion physique de la chaudière bois. Le seuil physique d'autorisation des circuits à55 °C utilise une autre sonde que celle de Ferme. La régulation ici ne remplace pas cette protection et ne garantit pas le maintien du ballon au-dessus de ce seuil en cas de coupure ou de transfert thermique trop lent.

## Configuration atomique

Appeler uniquement `script.ferme_chauffage_configurer` :

| Champ | Valeur |
|---|---|
| `mode` | `manual` ou `automatic` |
| `manual_temperature` | Entier50–70 °C |
| `minimum_d` | Entier55–59 °C ; défaut de saisie57 °C |
| `request_id` | 1–48 caractères ASCII : lettres, chiffres, `_`, `-` |
| `expires_at` | Secondes Unix UTC, dans le futur, au maximum120s |
| `expected_revision` | Révision entière connue, positive ou nulle |

Le script sérialisé valide la demande, sa durée de validité et sa révision avant une seule écriture du helper `input_text.ferme_chauffage_configuration` :

```json
{"v":1,"r":6,"m":"automatic","t":60,"d":57,"id":"identifiant_unique"}
```

Le format interne reste **v1**, afin de conserver les réglages et révisions existants. Le statut et les requêtes de l'application utilisent désormais la version2. Le script ne commande pas directement le servo. Un identifiant identique avec le même contenu est idempotent ; avec un autre contenu il est refusé. Une expiration ou une révision en conflit ne modifie rien.

Lire le helper après l'appel pour confirmer `id` et `r` : un HTTP200 seul ne prouve pas que Home Assistant a accepté le réglage. L'absence ou l'invalidité de ce helper **bloque le contrôleur**. Les valeurs par défaut du formulaire ne sont jamais une autorisation implicite de transmettre60 °C au démarrage.

## Calcul automatique

Sources fixes : D=`sensor.esphome_web_61063e_tampon_haut`, B=`sensor.batiment_b_ballon_b`. Pour ces deux modules ESPHome vérifiés, la disponibilité native est l'indicateur de connexion : l'intégration passe à `unavailable` en cas de déconnexion, et une erreur de lecture Dallas produit `unknown`. Les sondes interrogent le matériel toutes les60s, sans veille profonde ni mécanisme de suspension configuré. Cependant, une valeur identique à la précédente ne rafraîchit pas `last_reported` lorsque `force_update` est désactivé. Une température stable ne doit donc pas être déclarée périmée sur ce seul critère.

Le contrôleur accepte exclusivement leur état natif numérique entre0 et110 °C, en unité°C/C, non restauré, avec une date source strictement positive et non future. Il ne réhorodate jamais une valeur `unknown`, `unavailable` ou restaurée pour autoriser une commande. Cette règle est spécifique aux deux entités et firmwares vérifiés ; elle ne doit pas être généralisée à des capteurs MQTT ou à une télémétrie conservant son dernier état après déconnexion. La disponibilité native ne prouve pas la date de chaque conversion matérielle : cette preuve nécessiterait un heartbeat ou `force_update` dans le firmware, qui n'est pas modifié ici.

Pour les tendances, le contrôleur échantillonne l'état natif valide à son propre instant d'observation, distinct de la date du relevé matériel. Une valeur stable crée ainsi un plateau exploitable. Une déconnexion D ou une interruption d'échantillonnage de plus180s coupe l'historique continu. Les dates des températures présentées par la télémétrie de Ferme restent leurs dates sources ; elles ne sont pas artificiellement rajeunies.

Pour un minimum D de57 °C, la cible centrale est58,5 °C. Elle est calculée comme `(minimum_d + 60)/2` ; le seuil de retour au repos reste60 °C pour toutes les configurations.

- **Anti-oscillation** : médiane glissante de trois points espacés d'environ deux minutes (fenêtre d'environ quatre minutes), pour la température et les tendances. Les projections restent bornées à ±0,5 °C/min. Les échantillons bruts sont conservés.
- **Fonctionnement normal** : corrections limitées à ±2 °C, espacées de **30 minutes** depuis le dernier changement effectivement transmis, avec confirmation du sens de correction pendant deux minutes. Le premier appoint ne saute plus directement à `B+2` ; cette valeur reste seulement un objectif intermédiaire borné par les paliers.
- **D bas confirmé** : D brut et filtré au moins 1 °C sous le minimum configuré (56 °C pour minimum57), avec deux minutes continues sous ce seuil. Les hausses peuvent alors être espacées de10min ; premier pas depuis50 limité à+4 °C, puis+2 °C. Cette exception ne permet pas d'augmenter sur un seul creux isolé.
- **Retour au repos** : D brut ≥60 pendant cinq minutes continues et D filtré ≥60 →50 °C sans attendre30min. D brut ≥62 →50 immédiatement. Un pic isolé entre60 et62 ne remet plus immédiatement le fioul au minimum.
- Les temporisations de confirmation sont remises à zéro après une interruption d'observation de plus180s, une sonde D invalide ou un changement de configuration. Le helper persistant `ferme_chauffage_stabilisation` conserve aussi la date du dernier **changement**, séparément de la date de réenvoi API : une reconnexion avec la même consigne ne repousse pas les30min.
- Le calcul et l'historique de D continuent lorsque B est absent. `phase=active` et `delivery_state=waiting_module` distinguent calcul et envoi. Les paliers partent de la dernière transmission réussie, jamais d'une proposition non transmise. L'historique conserve au plus neuf points sur quinze minutes ; chaque helper reste sous255 caractères.
- Entre minimum et60 °C, un historique insuffisant conserve la dernière consigne transmise. Une proposition reste suspendue si D est invalide ; une dernière valeur ancienne affichée n'autorise pas le pilotage.
- Une absence de hausse d'au moins0,3 °C pendant30min suspend les augmentations supplémentaires seulement après une consigne **transmise** d'au moins `max(D,B)+2`. Elle ne prouve pas une panne ; les réductions et le retour50 restent possibles.

Les délais et marges sont des paramètres de régulation prudents, pas un modèle thermique mesuré. La liaison B, le temps de transfert B→D et l'inertie des ballons doivent être observés pour affiner le comportement. La limite70 reste absolue même si la consigne théoriquement utile serait supérieure.

## Transmission, coupures et concurrence

Le contrôleur tourne chaque minute et lors des changements de configuration, d'activation, de B ou D et de l'ancienne automatisation. Il ne conserve qu'une intention récente. À chaque tentative il recalcule depuis les températures présentes, y compris après reconnexion : un ancien appoint62 peut donc être remplacé par50 si D est maintenant chaud.

Avant l'appel ESPHome, il relit l'activation, l'ancienne automatisation **explicitement OFF**, la configuration complète et sa révision, les états sources et leurs véritables horodatages. En manuel, B doit être disponible et valide ; en automatique, B et D doivent l'être. Ces gardes comparent les dates sources originales, et non les dates locales d'échantillonnage. Un changement depuis le calcul annule la tentative. Toutes les températures transmises sont entières entre50 et70.

Le helper `ferme_chauffage_transmission` conserve la dernière réussite API, l'intention récente, l'obligation de réémission et le dernier essai. Une reconnexion, une réactivation après OFF ou un redémarrage imposent une nouvelle transmission absolue même si la température n'a pas changé. Cette obligation n'est effacée **qu'après le retour sans erreur du service**.

Juste avant le service, la tentative devient `uncertain`. Si l'action échoue ou est interrompue, Home Assistant arrête la séquence et aucune réussite n'est écrite. Les reprises du même ordre sur la même connexion sont limitées par un délai croissant120,240 puis300s. Une nouvelle connexion ou une nouvelle intention prioritaire50 peut passer avant ce délai, une seule fois ; ce droit est consommé à la tentative. Le calcul est refait à chaque reprise. Un reçu de configuration ne devient jamais une preuve d'envoi au servo.

## Statut version2

Les constantes numériques et booléennes utilisent des expressions Jinja (`{{ 2 }}`, `{{ true }}`), pour obtenir des valeurs natives Home Assistant. Des scalaires YAML statiques dans les attributs seraient des chaînes.

`sensor.ferme_chauffage_controle` expose les réglages, `revision`, `request_id`, `schema_version:2` et :

| Attribut | Sens |
|---|---|
| `phase` | `active` ou `suspended` |
| `actuation_enabled`, `calibration_valid` | Booléens ; `calibration_valid` reflète la validation des trois points utilisés et bloque la commande si elle est fausse |
| `fuel_minimum`, `fuel_maximum`, `release_temperature_d` |50,70,60 |
| `module_online`, `module_last_seen_at` | Disponibilité native B et date ISO de sa dernière observation locale valide ; ce n'est pas la date d'une conversion matérielle |
| `delivery_state` | `disabled`, `blocked`, `waiting_module`, `waiting_sensor`, `pending`, `uncertain`, `transmitted` |
| `desired_temperature`, `recommended_temperature` | Même intention récente, ou null |
| `last_transmitted_temperature`, `last_transmitted_at` | Dernier retour API sans erreur et sa date ISO, ou null |
| `position_feedback` | Toujours `unmeasured` |
| `heat_demand`, `resting_temperature` | Mémoire de l'appoint et repos50 |
| `last_proposal_at`, `next_adjustment_at` | Secondes Unix ; prochain délai théorique si applicable |

`sensor.ferme_chauffage_consigne_envoyee` est indisponible avant le premier succès API. Ensuite sa valeur est la dernière température transmise, en°C. Son attribut `transmitted_at` garde **l'instant réel de ce succès**, même si le template se réévalue. Le relais de télémétrie ne doit pas remplacer cette date par la date d'actualisation du sensor.

Codes `reason` : `control_disabled`, `calibration_required`, `legacy_conflict`, `configuration_invalid`, `sensor_d_unavailable`, `sensor_b_unavailable`, `sensor_d_stale`, `sensor_b_stale`, `warming_up`, `manual_ready`, `rest_hot`, `rest_in_band`, `support_start`, `support_increase`, `support_stable`, `recent_recovery`, `release_support`, `increase_cooldown`, `decrease_cooldown`, `stabilisation_wait`, `temperature_confirmation`, `at_maximum`, `response_not_observed`, `awaiting_transmission`, `transmission_uncertain`, `observer_stale`.

## Application et droits existants

Le relais `scripts/home-assistant-heating-control-bridge.mjs` lit lui-même la configuration et l'état Home Assistant ; il appelle exclusivement le script de configuration. Il n'utilise jamais un statut ou reçu Firebase pour autoriser un mouvement. Le drapeau d'activation matériel reste local à Home Assistant.

Les deux propriétaires autorisés disposent déjà de droits Firebase larges. `requestedBy` est une information déclarative dans ce modèle partagé, pas une nouvelle preuve d'identité ni une séparation de rôles. Cette évolution ne modifie pas les règles de base de données, ni les droits sur les autres fonctions de la ferme.

## Vérification

```sh
python3 scripts/test-heating-ha.py
node scripts/test-heating-adaptive-model.mjs
npm run test:chauffage
```

Le harness Python rend les **expressions réellement livrées dans le YAML** contre un environnement isolé et remplace l'unique service ESPHome par un faux service enregistrant ses appels. Il couvre les bornes, unités/dates/types, la configuration atomique, la reconnexion, les changements juste avant transmission, les erreurs d'API, le non-rejeu, les délais, la mémoire d'appoint, les tendances et les limites255. Il ne contacte aucun équipement. Le modèle JavaScript est une référence de conception distincte : voir `ADAPTIVE-POLICY.md` pour ses différences d'échantillonnage. Le schéma Home Assistant et le rendu Jinja natif complètent ces simulations avant activation.

Le module `heating-regulation-model.mjs` est un prototype historique non exécuté en production ; il ne représente pas la couche anti-oscillation ci-dessus. Les tests de référence du contrôleur installé exécutent directement ce YAML/Jinja (`python3 scripts/test-heating-ha.py`).
