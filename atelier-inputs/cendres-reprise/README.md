# Lot de reprise — rappel de nettoyage des cendres

Source réelle à mettre à jour : `/home/seb/Bureau/ferme-facture-pilote`
Révision de départ vérifiée : `3e06dd1` (`feat(chauffage): add ash cleaning reminders`)
Tâche Atelier ayant produit et testé le correctif : `d544a5f7-98a5-4a86-9d60-3c21627dbf91`
Empreinte du lot compressé d’origine : `6cbb6f408616377f19774947c866efee1e534efc97ff347c1a1852dbab75cd63`

La session isolée ne reçoit pas `.git`. Utiliser `SOURCE-EVIDENCE.md` pour la
preuve hôte de `HEAD`, de l'état suivi et des empreintes des quatre cibles ;
contrôler ces empreintes contre la copie importée avant d'appliquer le lot.

Les fichiers joints sont les versions finales produites par la tâche, renommées en `.txt` uniquement pour permettre leur transmission dans le chat Hermès. Les chemins cibles sont encodés dans leur nom :

- `src__lib__cendres.ts.txt` → `src/lib/cendres.ts`
- `src__hooks__useCendres.ts.txt` → `src/hooks/useCendres.ts`
- `src__components__chauffage__CendresPanel.tsx.txt` → `src/components/chauffage/CendresPanel.tsx`
- `scripts__test-cendres-cycle.mjs.txt` → `scripts/test-cendres-cycle.mjs`

Avant application, comparer chaque fichier à la révision réellement présente et préserver tout changement plus récent. Lire `AGENTS.md`, `DESIGN.md` et le skill `ux-ui`. Appliquer ce lot dans une tâche **Codex** de l’espace **Ferme — Chauffage**, lancer le test joint, le build et les contrôles Firebase, puis produire une évolution déployable. Les e-mails restent désactivés et aucun e-mail ne doit être envoyé.
