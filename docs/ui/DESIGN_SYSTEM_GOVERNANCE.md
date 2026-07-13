# Gouvernance du design system Atelier

Le design system est une API de production, pas une collection d'intentions.

## Source unique

- Valeurs et rôles : `src/styles/tokens.css`.
- Adaptateur Tailwind v4/shadcn sans Preflight : `src/styles/shadcn.css`.
- Primitives de registre shadcn : `src/components/shadcn/`.
- Géométrie et états des primitives : `src/styles/primitives.css`.
- API React publique : `src/components/ui/index.ts`.
- Patterns produit : composants nommés dans `src/components/ui/` ou `src/components/chat/`.
- `src/App.css` ne redéfinit jamais une primitive `.ui-*`.

`src/components/shadcn/` ne contient jamais une composition produit. Un
`DialogSurface`, un menu métier ou un adaptateur lazy appartient à
`src/components/ui/`. Les adaptations Precision Native dans une primitive
shadcn restent limitées aux tokens, à la géométrie, au mouvement et aux
contrats Tauri documentés.

## Mise à jour shadcn

Toute modification d'une primitive suit ce flux, sans `--overwrite`,
`--force` ni `add --all` :

```bash
npx shadcn@latest info --json
npx shadcn@latest docs <component>
npx shadcn@latest add <component> --dry-run
npx shadcn@latest add <component> --diff <file>
```

Le diff est fusionné manuellement afin de préserver le préfixe `tw`, les
tokens Precision Native, l'absence de Preflight, Base UI et les timings Quiet
Instrument. Une source ajoutée est lue et testée avant tout nouveau usage.

## Patterns officiels

| Pattern | API | Contrat |
|---|---|---|
| Tabs | `TabList`, `Tab` | 28 px, rayon 2 px, sélection neutre, Home compact |
| Activité | `ActivityDisclosure` | cardless, une action par ligne, résumé final repliable |
| Navigation du fil | `JumpNavigation` | overlay borné à la timeline, jamais au composer |
| Composer | `ChatComposer` | provider verrouillé par chat, modèle/effort/permissions seulement |

## Règles de changement

1. Modifier d'abord la primitive ou le token, jamais ajouter une surcharge plus spécifique.
2. Migrer tous les consommateurs dans le même changement.
3. Supprimer l'ancienne règle; aucune période de coexistence.
4. Ajouter un test de comportement et un contrat source anti-régression.
5. Vérifier dark/light, 800/1280/1512 px et `prefers-reduced-motion` si pertinent.
6. Vérifier que `npx shadcn@latest info --json` reconnaît toujours la primitive.

## Interdits automatisables

- Nouveau sélecteur `.atab`, `.jump-pill`, `.tool-group.worklog` ou équivalent local.
- `--selection-line` sur les tabs et la navigation ordinaire.
- `transition: all` ou durée supérieure à 150 ms.
- couleur brute dans une primitive React.
- seconde définition d'un même pattern dans `App.css`.
