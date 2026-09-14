---
name: shadcn
description: Gère les primitives shadcn/Base UI d’Atelier. Utiliser pour ajouter, mettre à jour, diagnostiquer ou composer explicitement une primitive; ne pas déclencher pour toute modification visuelle ni pour la seule présence de components.json.
user-invocable: false
allowed-tools: Bash(npx shadcn@latest *), Bash(pnpm dlx shadcn@latest *), Bash(bunx --bun shadcn@latest *)
---

# shadcn/Base UI dans Atelier

Ce skill est une couche projet. Le code et les conventions déjà présents priment
sur les exemples génériques du registre.

## Contrat local

- Lire `components.json` avant une opération CLI. Atelier utilise `base-nova`,
  l’alias `@/components/shadcn`, le préfixe Tailwind `tw` et Tailwind v4.
- `src/styles/shadcn.css` relie les variables shadcn aux tokens Precision Native.
  Il n’importe pas Preflight; ne pas introduire un second reset ni des couleurs,
  rayons, tailles ou animations parallèles.
- Les wrappers de primitives vivent dans `src/components/shadcn/`. Les API et
  compositions propres au produit vivent dans `src/components/ui/`.
- Préserver le clavier, le retour de focus, les libellés accessibles, les zones
  tactiles et `prefers-reduced-motion`. Un composant visuellement correct mais
  inutilisable au clavier n’est pas terminé.
- Les portails Base UI doivent conserver les tokens et les styles du produit.
  Vérifier le contenu porté, les sous-menus et le focus, pas seulement le trigger.

## Routage progressif

Charger seulement la référence correspondant au travail:

- structure Base UI/Radix et triggers: [rules/base-vs-radix.md](rules/base-vs-radix.md);
- formulaires: [rules/forms.md](rules/forms.md);
- composition et accessibilité: [rules/composition.md](rules/composition.md);
- icônes: [rules/icons.md](rules/icons.md);
- styles et tokens: [rules/styling.md](rules/styling.md);
- chat: [rules/chat.md](rules/chat.md);
- commande ou option CLI incertaine: [cli.md](cli.md);
- registre, thème ou personnalisation seulement si la demande les concerne:
  [registry.md](registry.md), [customization.md](customization.md).

Ne pas charger toutes les références par défaut.

## Workflow

1. Inspecter le wrapper, ses consommateurs et les tests existants. Réutiliser une
   primitive installée avant d’en ajouter une autre.
2. Pour une API shadcn incertaine, consulter la documentation du composant. Une
   simple utilisation d’un wrapper local connu ne nécessite pas d’appel CLI ou
   réseau.
3. Avant un ajout ou une mise à jour, utiliser `info`, `--dry-run` et `--diff`
   seulement selon le besoin; examiner chaque fichier touché.
4. Préserver les adaptations locales lors d’une mise à jour. Ne jamais utiliser
   `--overwrite`, `--force` ou `add --all` sans demande explicite de l’utilisateur.
5. Pour un composant de registre tiers, corriger ses alias, icônes et dépendances
   d’après `components.json`; ne pas importer aveuglément ses conventions.
6. Exécuter les contrôles proportionnés puis, si le changement touche l’app,
   suivre `docs/agent-reference/atelier-runtime.md`.

## Achèvement

Le changement est achevé lorsque l’API locale reste cohérente, les états clavier
et focus sont couverts, les tokens Atelier sont conservés, les contrôles adaptés
passent et le comportement est validé dans la surface requise. Distinguer une
inspection du code, des tests passés et une validation réelle du bundle.

La configuration MCP de projet est dans `.mcp.json`. Ne pas modifier la
configuration MCP globale depuis ce dépôt sans demande explicite.
