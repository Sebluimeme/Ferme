<!-- BEGIN UX-UI STANDARD v2 -->
## Standard UX/UI obligatoire

Pour toute création, modification, harmonisation ou revue d’interface de site ou d’application, lire et appliquer le skill `ux-ui` et le `DESIGN.md` du projet avant de concevoir ou coder, même si l’utilisateur ne mentionne pas le skill.

Cette règle couvre notamment les sites vitrines, landing pages, PWA, tableaux de bord, formulaires et composants HTML/CSS, React, Next.js ou Tailwind. Ne pas l’activer pour une tâche exclusivement backend ou un texte sans interface.

Sources à lire avant toute modification d’interface :
- skill : `/home/seb/.codex/skills/ux-ui/SKILL.md` (y compris ses ressources) ;
- décisions du projet : `/home/seb/Bureau/ferme-facture-pilote/DESIGN.md`.

Pour toute délégation concernant une interface, intégrer au prompt, avec des chemins accessibles à l’agent :
> Applique le skill ux-ui situé à /home/seb/.codex/skills/ux-ui/SKILL.md, avec ses ressources, et les décisions de /home/seb/Bureau/ferme-facture-pilote/DESIGN.md. Lis-les avant toute modification. Respecte les règles fermes et exécute les contrôles pertinents.

Si l’agent travaille dans un environnement séparé, lui fournir le paquet `ux-ui` complet et le `DESIGN.md`, puis remplacer les deux chemins ci-dessus par leurs chemins réels dans cet environnement. Mentionner seulement le nom du skill ne suffit pas.
<!-- END UX-UI STANDARD v2 -->
