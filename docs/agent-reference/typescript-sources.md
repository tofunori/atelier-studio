# Sources TypeScript et fichiers générés

Le code JavaScript maintenu dans Atelier est écrit en TypeScript. Les fichiers
JavaScript distribués par des bibliothèques tierces et les sorties de compilation
restent en JavaScript. Les attributs Linguist de `.gitattributes` distinguent ces
sorties et ces bibliothèques des sources du projet.

## Outils et installation

Node.js 22.18 ou ultérieur est nécessaire pour exécuter directement les scripts
`.mts` et `.cts`. Les contrôles utilisent TypeScript 7.0.2. Le site conserve aussi
TypeScript 6 sous le nom `typescript`, pour les API utilisées par Next.js et
ESLint ; sa commande `typecheck` appelle explicitement le compilateur natif 7.

Les dépendances sont déclarées et verrouillées séparément à la racine, dans
`gallery`, `gallery/notes-src`, `gallery/whiteboard-src`,
`packages/atelier-protocol` et `website`. Les installer dans chaque répertoire
concerné avant ses contrôles. La CI installe les deux éditeurs avant le contrôle
global et le staging de la galerie. Les types de pdf.js (`pdfjs-dist`, épinglé
sur la version vendorisée dans `gallery/assets/pdfjs`) viennent des dépendances
de `gallery`. Le client web `mobile/`, gelé depuis le 2026-09-28, garde son
propre verrou mais n'est plus installé ni contrôlé.

## Où modifier le code

| Surface | Source à modifier | Sortie générée |
| --- | --- | --- |
| Scripts classiques des viewers | `gallery/src/browser/*.ts` | `gallery/assets/*.js` |
| Scripts des pages galerie | `gallery/src/browser/pages/*.ts` | Scripts intégrés aux HTML de `gallery/assets` |
| Widgets et page de diagnostic | `scripts/browser/*.ts` | Emplacements HTML indiqués dans le manifeste |
| CodeMirror 6 | `gallery/src/browser/cm6` et `gallery/src/studio` | Bundles de `gallery/assets` et `gallery/assets/cm6` |
| Interface React de galerie | `gallery/react-ui` | `gallery/assets/shadcn-ui` |
| Notes et tableau blanc | `gallery/notes-src/src`, `gallery/whiteboard-src/src` | `gallery/assets/notes`, `gallery/assets/whiteboard` |
| Rendu du chat natif | `mobile-native/Renderer/chat-renderer.ts` | `mobile-native/Sources/AtelierUI/Resources/ChatRenderer/chat-renderer.js` |

`scripts/typescript-sources.json` relie chaque script classique à sa sortie. Les
attributs HTML `data-atelier-source` identifient les blocs à régénérer. Modifier
le HTML autour de ces blocs reste possible ; modifier leur contenu JavaScript
sera écrasé à la prochaine génération.

Les scripts classiques utilisent uniquement une syntaxe TypeScript effaçable.
Le générateur retire les types sans les transformer en modules : les variables
globales, l'ordre des scripts et les points d'entrée publics restent compatibles
avec les pages existantes. Utiliser `import type` et `export type` pour leurs
contrats ; une dépendance exécutable doit être intégrée à un bundle ou chargée
explicitement par la page.

## Construire et vérifier

- `npm run build:browser-sources` régénère les scripts classiques et intégrés.
- `npm --prefix gallery run build:cm6` régénère aussi ces scripts avant les bundles.
- `npm run build:gallery-ui` construit l'interface React de galerie.
- `npm run build:gallery-editors` contrôle et construit Notes et le tableau blanc.
- `node mobile-native/scripts/build-chat-renderer.mts` construit le rendu natif.
- `npm run typecheck:all` vérifie les sources applicatives, les viewers, les
  éditeurs, les scripts et les tests. Le site se vérifie séparément avec
  `npm --prefix website run typecheck`.
- Les commandes `test:frontend`, `test:gallery` et `verify:e2e` reconstruisent les
  scripts dont leurs tests dépendent. Les tests E2E nécessitent les navigateurs
  Chromium et WebKit correspondant à la version Playwright de `gallery`.

Le staging de la galerie reconstruit les viewers, l'interface React, les deux
éditeurs et CodeMirror avant de copier les ressources. Pour construire ou
relancer l'application, suivre [la procédure runtime](atelier-runtime.md).

## Niveau de typage

Les modules déjà stricts le restent. Les anciennes surfaces JavaScript ont leurs
configurations séparées et sont contrôlées avec `strict: false` : cette migration
ne prétend pas avoir supprimé tous les `any` ni activé toutes les garanties de
nullabilité. Les contrats partagés de galerie sont dans
`gallery/src/contracts/gallery.ts`, les API globales des viewers dans
`gallery/src/browser/globals.d.ts`, et les faux environnements des tests dans
`gallery/tests/injected-globals.d.ts`.
