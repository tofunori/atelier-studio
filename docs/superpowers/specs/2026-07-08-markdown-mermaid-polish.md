# Markdown chat, lot 2 — Mermaid, hiérarchie des titres, task-lists

Date : 2026-07-08 · Validé par Thierry · Implémentation : Sonnet 5 xhigh
Recherche préalable : patterns assistant-ui (PR #2002, mermaid-diagram.tsx) et
Vercel Streamdown — consensus 2025-2026 documenté ci-dessous.

## Contexte

Chat React (`src/components/Chat.tsx`) : react-markdown@10 + remark-gfm@4 +
remark-math/rehype-katex (lot 1). Deux maps de composants existent déjà :
`MD_COMPONENTS` (message final) et `MD_COMPONENTS_STREAMING` (bulle en cours,
code non coloré). Tauri 2 = **WKWebView** (pas Chrome). Design system strict
(CLAUDE.md) : tailles 10/11/12/13/15, rayons 6/10, couleurs via tokens.

## Chantier A — Diagrammes Mermaid (le gros morceau)

### Décisions tranchées (issues de la recherche — ne pas dévier)

1. **Intégration par composant custom**, PAS `rehype-mermaid` (orienté
   transformation serveur/async, aucun concept de contenu partiel) ni plugin
   remark. On intercepte `language-mermaid` dans le composant `pre`/`code`.
2. **Jamais de rendu pendant le streaming.** Notre architecture le donne
   gratuitement : `MD_COMPONENTS_STREAMING` garde le comportement actuel
   (bloc de code en clair) ; le composant Mermaid n'est branché que dans
   `MD_COMPONENTS` (message final). Aucune détection de fence requise —
   c'est plus simple que assistant-ui/Streamdown qui doivent détecter la
   fermeture du fence.
3. **Lazy import** : `import("mermaid")` dynamique au premier bloc mermaid
   rencontré (~1,5-2 MB — jamais dans le chunk principal ; vite code-split
   automatiquement les import() dynamiques). Promesse module-level partagée.
4. **Validation avant rendu** : `await mermaid.parse(code, { suppressErrors:
   true })` → si invalide, afficher le bloc de code normal (coloré) avec une
   petite mention sobre « diagramme invalide » — JAMAIS le SVG d'erreur rouge
   de mermaid. Puis `try/catch` autour du render quand même (Open WebUI s'est
   fait avoir : un diagramme invalide gelait la page — issues #18340/#2776).
   Vérifier aussi que le SVG rendu ne contient pas la classe `error-icon`
   (certains invalides « réussissent » en dessinant l'erreur).
5. **Config sécurité/compat WKWebView** (non négociable) :
   `securityLevel: "strict"` (contenu généré par LLM = non fiable) et
   `htmlLabels: false` (bug WebKit foreignObject #23113 — les labels HTML
   se positionnent mal sous Safari/WKWebView ; forcer les labels SVG natifs).
6. **Theming aux tokens** : mermaid ne lit PAS les variables CSS (issue
   mermaid #6677). Utiliser `theme: "base"` + `themeVariables` avec les
   couleurs **résolues à l'exécution** via
   `getComputedStyle(document.documentElement).getPropertyValue("--bg")` etc.
   Palette sobre : fond `--bg-side`, traits/texte `--fg2`/`--muted`,
   accent `--accent` avec parcimonie. Ré-initialiser mermaid si la signature
   de thème (concat des couleurs résolues) change entre deux rendus.
7. **IDs stables + cache** : id de rendu dérivé d'un hash du source (pas de
   Math.random ni compteur) ; cache module-level `Map<sourceHash+themeSig,
   svg>` (cap ~50, éviction du plus ancien) pour que les re-renders de la
   liste (chaque event ajouté re-rend tout) ne relancent JAMAIS mermaid sur
   un diagramme inchangé. Guard « toujours monté » dans le callback async.

### UI du bloc (design system)

Réutiliser le chrome existant des blocs de code (`.codeblock`) : barre avec
label `mermaid`, bouton copie (copie le SOURCE), plus un bouton texte discret
« code » / « diagramme » pour basculer entre le SVG rendu et le source coloré.
SVG : fond `--bg-side`, rayon `--r-m`, `max-width: 100%`, centré,
`overflow-x: auto` si plus large que la bulle. Pendant le chargement du module
mermaid : le bloc de code reste affiché (pas de spinner criard).

### Fichier

Nouveau `src/components/MermaidBlock.tsx` (composant + cache + helpers purs
exportés pour test : hash du source, construction des themeVariables depuis
une fonction `resolveToken(name)` injectable). Brancher dans `MD_COMPONENTS`
(Chat.tsx) : si `language-mermaid` → MermaidBlock, sinon MarkdownCodeBlock
actuel. `MD_COMPONENTS_STREAMING` : inchangé (code en clair).

## Chantier B — Hiérarchie des titres (CSS seul)

Actuellement h1-h4 tous à `--fs-xl` (App.css:81-84). Créer une gradation
DANS les tokens existants (aucune nouvelle valeur) :
- h1, h2 : `--fs-xl` (15) / 600 — h1 se distingue par plus de marge haute
  (ex. 18px vs 14px, multiples de ~4 ok pour les marges).
- h3 : `--fs-l` (13) / 600.
- h4 : `--fs-m` (12) / 600, `letter-spacing: 0.02em`, `color: var(--muted)`
  (style « eyebrow » sobre).
Garder `letter-spacing:-0.01em` sur h1-h3 et l'interligne 1.35 existant.

## Chantier C — Task-lists GFM (CSS seul)

remark-gfm émet déjà `<li class="task-list-item"><input type="checkbox"
disabled>`. Aujourd'hui : checkbox native moche/décalée. Fix CSS aligné sur
les checkboxes custom existantes du panneau Git (App.css:1009-1015,
`appearance:none` + coche dessinée) :
- `.msg .task-list-item { list-style: none; }` avec retrait négatif propre ;
- checkbox 13px, `appearance:none`, fond `--bg-ctl`, bordure `--border`,
  rayon 4px max (ou `--r-s` si défini), cochée = fond `--accent` + coche
  blanche dessinée en ::after (copier le pattern git-file-line) ;
- `disabled` reste (lecture seule — standard de tous les chats de référence),
  mais `opacity: 1` (pas le grisé navigateur) et `cursor: default`.

## Explicitement REJETÉ (avec raison, ne pas implémenter)

- **Ancres de titres** (rehype-slug/autolink) : collisions d'ids garanties
  entre messages d'un même DOM (deux messages avec `## Overview` → deux
  `id="overview"`), aucune valeur dans un fil éphémère. Aucun chat de
  référence ne le fait.
- **rehype-sanitize** : inutile ici — react-markdown n'exécute pas le HTML
  brut sans rehype-raw (qu'on n'utilise pas) ; le HTML des messages est déjà
  échappé.
- Footnotes/callouts/copy-table : hors scope.

## Tests (obligatoires)

- Helpers purs de MermaidBlock (hash stable, themeVariables construits depuis
  un resolveToken mocké, logique de cache/éviction) testés dans la suite
  vitest existante (`cd sidecar && npx vitest run`, pattern des tests du
  lot 1 : import direct des .ts depuis un .test.mjs).
- Le rendu mermaid lui-même (DOM/SVG) ne se teste pas en vitest node — le
  couvrir par la vérification manuelle post-build (script ou instructions).

## Vérifications finales (obligatoires)

- `npm install` propre (package.json est SAIN maintenant — ne rien y toucher
  d'autre qu'ajouter `mermaid: ^11`), `npx tsc --noEmit`, `npx vite build`
  (vérifier que mermaid est bien dans un chunk séparé du chunk principal —
  regarder la sortie de build), `cd sidecar && npx vitest run` tout vert.
- Respect strict du design system (tokens uniquement, pas de hex ; les
  couleurs passées à mermaid transitent par getComputedStyle des tokens).
