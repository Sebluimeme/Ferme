# Preuve hôte de la source

Relevé en lecture seule sur la source réelle le 15 novembre 2026 avant toute application du lot.

- Source : `/home/seb/Bureau/ferme-facture-pilote`
- `git rev-parse HEAD` : `3e06dd1d62ff75e2c7f7d1691027765697b1b8d4`
- État Git : aucun fichier suivi modifié ; seuls `AGENTS.md`, `DESIGN.md` et `atelier-inputs/` sont non suivis.

Empreintes SHA-256 comparant `3e06dd1` à l'état courant :

| Chemin | Révision `3e06dd1` | État courant avant lot | Conclusion |
| --- | --- | --- | --- |
| `src/lib/cendres.ts` | `16cbe30b112e7480748d7364695fc4fa117e31b51e852f9a20f3e7b0ddbf1e29` | `16cbe30b112e7480748d7364695fc4fa117e31b51e852f9a20f3e7b0ddbf1e29` | identique |
| `src/hooks/useCendres.ts` | `1174d11716d571e89a0a342d0bded2f2100af6463528027a973e78f3cf14826b` | `1174d11716d571e89a0a342d0bded2f2100af6463528027a973e78f3cf14826b` | identique |
| `src/components/chauffage/CendresPanel.tsx` | `ee73d4ecf574f667c7c94ea776088227d9bb37da06f89f29c4c01524bd1ccb4b` | `ee73d4ecf574f667c7c94ea776088227d9bb37da06f89f29c4c01524bd1ccb4b` | identique |
| `scripts/test-cendres-cycle.mjs` | absent | absent | nouveau fichier prévu par le lot |

La copie importée par l'Atelier peut vérifier ses propres empreintes contre cette preuve. Aucun historique Git ne doit être inventé dans la session isolée.
