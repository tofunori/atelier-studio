---
name: migrate-radix-to-base
description: Migre un composant ou un package React de Radix UI vers Base UI lorsque cette migration est explicitement demandée. Ne pas déclencher pour un projet déjà Base UI ni pour une modification UI ordinaire.
---

# Migration Radix UI vers Base UI

Atelier racine utilise déjà `base-nova`. Avant toute migration, identifier le
package exact et prouver qu’il contient encore des wrappers ou consommateurs
Radix. Un lockfile ou une dépendance Radix dans un sous-projet distinct ne prouve
pas que la racine doit être migrée.

## Portée et état initial

1. Lire le `components.json`, le manifeste et le lockfile du package ciblé.
2. Délimiter le répertoire de recherche. Ne pas balayer, modifier ou nettoyer les
   autres packages du dépôt.
3. Inspecter les wrappers, leurs consommateurs et les tests. Les fichiers présents
   sont l’état de reprise; ne pas recommencer une migration partielle.
4. Relever les échecs préexistants avec un contrôle ciblé si la tâche autorise
   l’exécution. Un arbre Git sale n’interdit pas le travail: préserver les
   modifications existantes et éviter les fichiers qui se chevauchent.

La migration n’autorise pas implicitement une branche, un commit, une suppression
de dépendances hors portée ni un rapport écrit sur disque.

## Stratégie

### Wrapper shadcn avec paire officielle

- Classer le wrapper en comparant sa version locale à son origine correspondant
  exactement au style du package.
- Récupérer la variante Base officielle avec le CLI ou le registre. Conserver les
  personnalisations locales par diff ou fusion à trois voies.
- Ne pas utiliser `--overwrite`, `--force` ou `add --all` sans demande explicite,
  même si le wrapper semble pristine.
- Après fusion, rechercher les imports Radix et attributs devenus incompatibles;
  une fusion sans conflit n’est pas une preuve de migration complète.

### Code personnalisé ou style sans paire Base

Transformer le fichier local sans le restyler. Charger seulement les références
nécessaires:

- motifs structurels: [universal-patterns.md](universal-patterns.md);
- props des consommateurs: [consumer-props.md](consumer-props.md);
- attributs et variables CSS: [class-mapping.md](class-mapping.md);
- forme finale des wrappers: [wrapper-shapes.md](wrapper-shapes.md);
- famille concernée seulement: [overlays.md](overlays.md), [menus.md](menus.md),
  [form-controls.md](form-controls.md), [disclosure.md](disclosure.md) ou
  [display-misc.md](display-misc.md).

Vérifier les types de `@base-ui/react` installé lorsque la correspondance manque;
ne pas deviner une API.

## Migration progressive

La migration progressive est le défaut pour un composant isolé:

1. Migrer les dépendances de wrappers du bas vers le haut.
2. Garder l’original tant que des consommateurs en dépendent.
3. Repointer les consommateurs par petits groupes et adapter leurs props.
4. Supprimer l’ancien wrapper et les dépendances Radix seulement lorsque la
   recherche limitée au package prouve qu’ils ne sont plus utilisés.
5. Ne changer le style de `components.json` qu’à la fin d’une migration complète
   du package et seulement si sa valeur était Radix.

Une migration de tout le package doit être demandée explicitement. Elle suit le
même ordre, puis vérifie les consommateurs applicatifs et le lockfile du package.

## Invariants

- Ne pas migrer `cmdk`, `vaul`, `sonner`, `input-otp`, `react-day-picker` ou
  `recharts` sous prétexte qu’ils apparaissent près de wrappers Radix.
- Préserver les classes, tokens, comportements, accessibilité et focus existants.
- Signaler les différences de comportement Base UI; ne pas les masquer par un
  correctif improvisé.
- Un fichier ignoré ou restauré n’est pas déclaré migré.
- Dans Atelier, ne jamais modifier `src-tauri/gallery-dist/`; respecter `tw`,
  Precision Native et l’absence de Preflight.

## Vérification et rapport

Exécuter typecheck et tests proportionnés au composant et au package. Pour un
changement qui affecte l’app Atelier, appliquer ensuite
`docs/agent-reference/atelier-runtime.md`, sous réserve de l’autorisation de
remplacer une instance ouverte.

Le rapport normal reste dans la réponse: fichiers changés, consommateurs migrés,
différences de comportement, contrôles exécutés et nombre de wrappers Radix
restants dans le package ciblé. Créer des fichiers `.migration/`, une branche ou
des commits seulement si l’utilisateur le demande.
