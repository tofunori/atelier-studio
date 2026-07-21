# Plan 054 — Modulariser les éditeurs Studio en TypeScript autour de CM6

## Statut

- **Priorité** : P1
- **Effort** : XL
- **Risque** : élevé
- **État** : DONE (modularisation et validation native terminées le 2026-07-20; retrait CM5 reporté au plan 032)
- **Dépend de** : plan 031 fonctionnel; retrait CM5 toujours bloqué par la porte humaine du plan 032
- **Portée initiale** : `gallery/assets/{latex_studio,code_editor,md_viewer}.html`, `gallery/src/studio/`, bundles galerie et tests associés

## Avancement vérifié — 2026-07-20

- fondations TypeScript strictes, runtime hôte et factory CM6/CM5 : terminés;
- noyau partagé document, sélection et viewport : branché sur LaTeX, Code et Markdown;
- correctif du premier scroll de sélection : validé sur Chromium et WebKit;
- LaTeX : préflight, compilation/log, ghost CM5, rewrap, PDF/SyncTeX, annotations,
  outline, lecture, contrôles PDF et barre statut/wrap/lint extraits en TypeScript;
- Code : wrap partagé et vue CSV (filtre, tri, pagination, table/source) extraits;
- Markdown : aperçu, modes Preview/Split/Edit, sélection rendue et annotations extraits;
- les trois bootstraps de surface, la pilule de sélection, la composition diff
  et la compatibilité des globals historiques sont maintenant en TypeScript;
- CSS extrait dans trois feuilles dédiées et thème historique centralisé dans
  le runtime hôte typé;
- taille courante des pages : LaTeX 183 lignes, Code 76, Markdown 41, contre
  environ 3 295 lignes cumulées au départ; aucune logique produit longue ne
  subsiste dans ces pages;
- gates finales : TypeScript galerie et app, Vite, 111 tests Node galerie,
  37 Python, 545 sidecar, parity, 183 diff et 67 Playwright Chromium/WebKit verts;
- app macOS principale reconstruite et relancée : un seul `tauri-app`, PID
  99292, backend Rust PID 99549 sain, galerie PID 99646 saine;
- identités source = staging = app confirmées pour les trois HTML/CSS et les
  bundles `studio_surfaces`/`studio_runtime`; frontend mobile embarqué également
  identique au dist produit par le wrapper;
- contrôle visuel réel de la fenêtre Atelier effectué après relance;
- CM5 reste volontairement disponible jusqu'à la porte humaine du plan 032.

### Audit upstream CM6 et décision CM5

- modules courants confirmés au 2026-07-20 : `view@6.43.6`, `state@6.7.1`,
  `language@6.12.4`, `merge@6.12.2`, `commands@6.10.4`, `search@6.7.1` et
  `lang-markdown@6.5.1`;
- le premier saut de sélection n'est pas un comportement normal de CM6 : la
  sélection souris native ne demande pas de scroll; les régressions Tauri/parent
  scrollable et Safari 26/iframe ont été corrigées en amont avant `view@6.43.6`;
- le correctif Atelier protège donc le viewport réel pendant le premier focus,
  les sélections et les remplacements complets, avec preuve Chromium et WebKit;
- audit des consommateurs CM5 effectué : ils sont désormais bornés au factory,
  au ghost/hanging-indent de fallback et aux tests `?engine=cm5`; aucune page ne
  crée directement CM5;
- retrait refusé dans cette tranche : le plan 032 exige encore trois sessions
  réelles et un accord humain explicite.

## Résultat attendu

Les trois surfaces conservent exactement leur comportement et leur apparence,
mais leur HTML devient progressivement une coquille de rendu. Le code produit
vit dans des modules TypeScript testables et compilés en bundles IIFE pour la
WebView Tauri. CodeMirror reste CM6 direct; React n'est pas imposé au noyau.

La suppression de CM5 ne fait **pas** partie des premières tranches. Elle reste
soumise aux sessions réelles et à l'accord explicite définis par le plan 032.

## Architecture cible

```text
gallery/src/studio/
  core/
    editor_contract.ts      contrat neutre consommé par les surfaces
    document_session.ts     texte, dirty state, save/reload/conflit
    selection_bridge.ts     sélection éditeur et publication
    viewport.ts             scroll, focus, position et restauration
    commands.ts             raccourcis et commandes communes
    editor_wrap.ts          wrap window/off/colonne et contrôles
    file_picker.ts          fichiers récents et routage Code/LaTeX
  host/
    runtime.ts              token HTTP, nonce IPC, postMessage
    gallery_api.ts          client typé des routes galerie
  features/
    diff/                   journal, comparaison et restauration
    annotations/            commentaires et ré-ancrage
    latex/                  compile, PDF, SyncTeX, outline, rewrap, ghost
    markdown/               preview, modes, sélection rendue, annotations
    code/                   table CSV; langages via le factory CM6
  surfaces/
    latex.ts                composition de la surface LaTeX
    code.ts                 composition de la surface Code
    markdown.ts             composition de la surface Markdown
```

Les bundles générés restent dans `gallery/assets/` parce que la galerie et
`stage-gallery.sh` les embarquent déjà à cet endroit. Aucun fichier n'est édité
directement dans `src-tauri/gallery-dist/`.

## Contrats à ne pas casser

- sélection du moteur : query string > `localStorage.studioEngine` > CM6;
- `window.AtelierEditorFactory` et les globals hôte restent disponibles pendant la migration;
- routes `/code`, `/codesave`, `/texcompile`, `/synctex`, `/quote`, `/selinfo` inchangées;
- événements `postMessage` et nonce IPC inchangés;
- une intervention diff reste une action logique, jamais un compteur de mots;
- sauvegarde/rechargement préservent sélection et viewport;
- HTML/CSS et géométrie visible restent identiques durant l'extraction;
- le fallback `?engine=cm5` reste opérationnel jusqu'à la porte du plan 032.

## Matrice de parité

| Domaine | LaTeX | Code | Markdown | Preuve attendue |
|---|---:|---:|---:|---|
| ouverture, édition, undo/redo | oui | oui | oui | E2E CM6 + smoke CM5 |
| save et reload externe | oui | oui | oui | E2E long document |
| sélection, focus, viewport | oui | oui | oui | Chromium + WebKit |
| diff, historique, restore | oui | oui | non | suite diff + E2E |
| compilation et log | oui | non | non | API + app native |
| PDF et SyncTeX bidirectionnel | oui | non | non | app native |
| annotations et add-to-chat | oui | oui | sélection | E2E + IPC |
| preview/modes | lecture/PDF | CSV/source | preview/split/edit | E2E |
| lint/langages | Python/TeX | multi-langages | Markdown | tests de routage |

## Tranches d'exécution

### Tranche A — Fondations TypeScript

1. Ajouter un `tsconfig` strict propre à la galerie.
2. Définir le contrat typé du moteur d'édition.
3. Extraire token HTTP, nonce IPC et politique d'affichage initiale dans un runtime hôte.
4. Produire un bundle déterministe et des tests comportementaux.
5. Brancher les trois pages sans changement visible.

### Tranche B — Noyau document/viewport

1. Extraire positions, sélection, focus et viewport.
2. Extraire save/reload/conflit dans une session documentaire.
3. Faire dépendre LaTeX de ces modules, puis Code et Markdown.
4. Ajouter des contrats E2E sur documents longs et reload concurrent.

### Tranche C — Surface LaTeX

1. Déplacer le bootstrap de l'éditeur et les commandes.
2. Extraire ghost text et rewrap.
3. Extraire compilation/log et PDF/SyncTeX.
4. Extraire outline, annotations et add-to-chat.
5. Extraire lecture Markdown/LaTeX et menus secondaires.
6. Réduire le script inline à un appel de bootstrap.

État : étapes 1 à 6 terminées. Le HTML ne contient plus qu'un appel court à
`bootstrapLatexSurface` après son DOM.

### Tranche D — Code et Markdown

1. Composer Code depuis le noyau partagé, avec CSV/lint/diff comme features.
2. Composer Markdown depuis le noyau partagé, avec preview/split/edit.
3. Supprimer les duplications de save/reload/sélection seulement après parité.

État : terminé. Code et Markdown démarrent chacun depuis leur bootstrap de
surface TypeScript et ne contiennent plus de logique produit inline.

### Tranche E — Consolidation et retrait contrôlé

1. Auditer les globals et façades temporaires restants.
2. Mesurer la taille des bundles et séparer les features lourdes si nécessaire.
3. Exécuter la checklist native du plan 031.
4. Observer CM6 sur trois sessions réelles.
5. Demander l'accord humain du plan 032 avant toute suppression CM5.

État : étapes 1 à 3 terminées. Les étapes 4 et 5 appartiennent désormais au
plan 032 et restent volontairement ouvertes sans bloquer ce plan.

## Gates de chaque tranche

- `npm --prefix gallery run typecheck:studio`
- `npm --prefix gallery run build:cm6`
- tests Node ciblés du module extrait
- tests Playwright ciblés Chromium et WebKit
- `node gallery/server/tests/parity.mjs`
- `node gallery/server/tests/diff_suite.mjs`
- `npx tsc --noEmit`
- `npx vite build`
- `(cd sidecar && npx vitest run)`
- build, relance et contrôle du `.app` selon `AGENTS.md` pour toute tranche intégrée

## Conditions STOP

- une extraction exige de modifier un contrat serveur ou IPC sans test de compatibilité;
- le diff ou une annotation ne survit plus à une édition/reload;
- une page doit accéder directement à `EditorView` au lieu du contrat partagé;
- un changement visuel apparaît alors que la tranche est purement architecturale;
- le fallback CM5 est supprimé avant l'accord humain du plan 032;
- des changements utilisateur non liés doivent être écrasés pour continuer.

## Critères de fin

- HTML réduit à structure, styles et appels de bootstrap courts;
- logique produit dans des modules TypeScript stricts et testés;
- CM6 utilisé directement derrière un contrat stable, sans nouvelle dépendance CM5;
- parité fonctionnelle complète des trois surfaces;
- PDF/SyncTeX et IPC vérifiés dans l'app buildée;
- CM5 retiré uniquement après le soak et l'accord explicite;
- bundle embarqué identique aux sources construites.
