# Chrome des panneaux Atelier — une barre par panneau

Design validé par Thierry le 2026-08-14 (approche A, en deux temps).
Artefact de présentation : https://claude.ai/code/artifact/a277745c-219a-4a13-b32a-a9a5b2350ab7

## 1. Problème

Le chrome d'un panneau est décidé par une seule fonction, et sa règle est inversée :

```js
// src/components/AtelierPane.tsx:134
function ownsNativeChrome(ref) {
  return ref?.kind === "surface" && ref.surface !== "atelier";
}
```

Deux symptômes, une cause :

- **Navigation qui disparaît.** Quand l'onglet actif est un terminal, la base de connaissances, le navigateur, Git ou Narval, la `TabList` n'est pas rendue du tout (`AtelierPane.tsx:908`). Les autres onglets du panneau deviennent inatteignables autrement que par le rail. Les surfaces qui portent le plus de chrome propre sont exactement celles qui effacent la navigation du shell.
- **Double barre dans l'IDE.** Pour un document, `ownsNativeChrome` est faux : la bande d'onglets est rendue, et l'éditeur ajoute son propre `<header>` dans l'iframe. Le nom du fichier est écrit deux fois — une fois dans l'onglet, une fois dans `#fname`.

L'alignement horizontal aggrave le second point. Le chat et la bande d'onglets partagent `--surface-header-height: 44px`, partage verrouillé par `css-contract.test.ts:315`. La barre réellement utilisée en édition n'est ni l'une ni l'autre : c'est une troisième rangée, de hauteur différente dans chaque éditeur, et sur un autre fond.

| Fichier | Hauteur du `<header>` | Fond |
|---|---|---|
| `gallery/assets/latex_studio.css` | `padding: 6px 10px`, aucune hauteur | `var(--card)` |
| `gallery/assets/code_editor.css` | `padding: 8px 14px` | `var(--card)` |
| `gallery/assets/md_viewer.css` | `padding: 7px 14px` | `var(--card)` |
| `gallery/assets/latex_cm6.html` | `height: 38px` | `var(--card)` |

Le chrome du shell utilise `--surface-app`. La seconde barre est donc décalée *et* d'une autre couleur.

## 2. Décision

**Chaque panneau a exactement une barre : celle de la surface active.**

Son extrémité gauche devient un emplacement standardisé sur toutes les surfaces — une pastille de commutation qui nomme l'onglet courant et ouvre la liste du panneau. Le reste de la barre appartient à la surface.

Rejetées, avec leur raison :

- **Commutateur dans le rail.** Mélange deux niveaux de contexte, projet et panneau, ce que `ATELIER_DESIGN.md` §3 interdit (« une information vit à UN seul niveau »), et fait varier le contenu du rail selon le panneau focalisé.
- **Bande révélée au survol.** Navigation invisible donc indécouvrable, et une bande qui apparaît sous le curseur réintroduit l'agitation retirée du fil de chat au plan précédent.

## 3. Architecture

### Ce qui existe déjà et qu'on réutilise

Le mécanisme d'injection est **déjà en place** : quatre surfaces acceptent un `ReactNode` du shell et le rendent dans leur propre en-tête natif.

| Surface | Point d'injection |
|---|---|
| `TerminalSurface.tsx:139` | `.workspace-pane-controls-slot` |
| `BrowserTab.tsx:540` | `.workspace-pane-controls-slot` |
| `BiblioSurface.tsx:397` et `:513` | `.workspace-pane-controls-slot` |
| `KnowledgeSurface.tsx:213` | prop `headerEnd` de son en-tête propre |

`AtelierPane.tsx:812/828/856/870` leur passe `renderPaneControls(..., "integrated")` ; `integratesPaneControls` (`:138`) décide qui y a droit, et les autres reçoivent des contrôles « flottants » (`:919`).

La phase 1 n'invente donc aucune architecture : elle généralise ce patron et lui ajoute un second passager.

### Phase 1 — la pastille entre dans les en-têtes natifs

1. Nouveau composant `PaneSwitcher` dans `src/components/ui/` : pastille `⟨icône de surface⟩ nom ⌄ ⟨compteur⟩`, ouvrant un `DropdownMenuSurface` qui liste les onglets du panneau. Chaque entrée porte son icône, son nom, et une action de fermeture. L'entrée active est marquée par le contraste de surface, jamais par l'accent (§5 : la navigation est neutre).
2. Le slot d'injection passe de un à deux passagers. Renommer la prop en `paneChrome?: { switcher: ReactNode; controls: ReactNode }` plutôt que d'ajouter une seconde prop à quatre signatures — le slot reste une seule zone, alignée à gauche pour la pastille et à droite pour les contrôles.
3. Étendre `integratesPaneControls` à **toutes** les surfaces. Elles ne partent pas du même point, et le travail est inégal :

   | Palier | Surfaces | Travail |
   |---|---|---|
   | Slot déjà présent | Terminal, Navigateur, Biblio, Connaissances | ajouter le passager `switcher` |
   | Passe par `SurfaceHeader` | Galerie (`AtelierHeaders.tsx`) | ajouter un emplacement `headerStart` à `SurfaceHeader` — il n'expose aujourd'hui que `title`, `eyebrow`, `actions`, `className` |
   | En-tête maison | Git, Narval, Generator | poser le slot à la main dans leur en-tête existant |

   Le troisième palier ne migre **pas** vers `SurfaceHeader` dans ce plan. Ces trois surfaces ont des en-têtes propres (`.narval-files-head`, en-tête Git, formulaire Generator) que `css-contract.test.ts` verrouille déjà sur `--surface-header` ; les convertir est un chantier distinct, et le mélanger ici ferait porter au design du chrome le risque d'une refonte de trois surfaces.

4. `ownsNativeChrome` devient uniformément vrai pour les surfaces, et la `TabList` n'est plus rendue pour aucune d'entre elles.

À la fin de la phase 1, la bande d'onglets ne subsiste que pour les **documents**, qui gardent donc leurs deux barres. Le trou de navigation, lui, est bouché partout.

### Phase 2 — les éditeurs rendent leur barre au shell

Les documents sont des iframes vers `gallery/assets/*.html`. Pour supprimer leur seconde barre, leurs actions doivent être rendues par le shell.

**Correction d'une estimation antérieure : le pont existant ne convient pas.** `galleryCommandBridge.ts` est un canal de commandes *de la galerie*, typé sur une forme fermée (`action`, `mode`, `projectRoot`, `requestId`, `rels` — `ipc.ts:57`), avec validation de port et nonce. Ce n'est pas un canal de déclaration d'actions. La phase 2 demande un nouveau canal, pas la réutilisation de celui-là.

Forme proposée :

- L'iframe publie au montage un **descripteur d'actions** : liste d'items `{ id, label, kind: "primary" | "secondary" | "overflow", icon, enabled, badge? }`, republié à chaque changement d'état (compilation en cours, nombre de versions, présence de commentaires).
- Le shell rend ces items avec `Button` / `IconButton` dans la barre unique, et renvoie `{ id }` à l'activation.
- L'iframe cesse de rendre son `<header>` quand le shell a confirmé la prise en charge, et le garde sinon — un éditeur ouvert hors Atelier (onglet navigateur) doit rester utilisable.

Ordre de migration : `code_editor` d'abord (barre la plus simple), puis `md_viewer`, puis `latex_studio` (la plus riche : compilation, PDF, split, versions, rewrap, commentaires, zoom).

Gain collatéral : ces barres sortent de l'illégalité vis-à-vis du système de design. Elles utilisent aujourd'hui des `<button>` nus, des styles inline, `font-size: 12px` et `padding: 4px 10px` en dur — interdits par `CLAUDE.md` mais invisibles aux tests, qui ne balaient que `src/`.

## 4. États

| État | Contrat |
|---|---|
| Panneau à un seul onglet | La pastille reste affichée, sans compteur ; elle nomme la surface et ne propose que « fermer ». Ne pas la masquer : sa position doit être stable. |
| Panneau vide | Inchangé (`workspace-empty-pane`). |
| Nom long | Troncature au milieu pour les chemins, à la fin pour les titres de surface (§6). Largeur maximale de la pastille : 220 px, comme `ContextChip`. |
| Éditeur dont le descripteur n'arrive pas | Le shell laisse l'iframe dessiner son `<header>` ; la double barre réapparaît plutôt qu'une barre vide. Dégradation visible, jamais silencieuse. |
| Onglet en cours de fermeture | Un seul indicateur d'activité par surface reste la règle (§9). |

## 5. Tests

- **`css-contract.test.ts`** — étendre l'assertion de `--surface-header-height` : le chat, la galerie *et* la barre de panneau des éditeurs partagent le token. Aujourd'hui elle ne couvre que les deux premiers.
- **`AtelierPane.test.tsx`** — la `TabList` n'est plus rendue pour aucune surface ; la pastille est présente dans les huit surfaces ; le menu liste les onglets du panneau et ferme le bon.
- **Accessibilité** — la pastille est un `RowButton` avec `aria-haspopup="menu"` et `aria-expanded` ; le menu suit le patron de `DropdownMenuSurface` (flèches, Échap, retour du focus). Aucun `<button>` nu.
- **Clavier** — ⌘1..9 activent l'onglet n du panneau focalisé, ⌘W ferme l'onglet actif. La fermeture quittant la croix de la bande, le raccourci n'est plus un confort mais le chemin principal.
- **`diff_suite.mjs`** — obligatoire dès que `gallery/` change, donc à chaque étape de la phase 2.

## 6. Hors périmètre

- Le glisser-déposer d'onglets entre panneaux (`workspaceDrag.ts`) reste inchangé ; la poignée vit déjà dans les contrôles de panneau.
- La disposition en splits, le rail et la TopBar ne bougent pas.
- Aucune modification des tailles, rayons, durées ou couleurs du système.

## 7. Risques

- **La fermeture d'onglet perd son affordance directe.** Elle passe dans le menu de la pastille et sur ⌘W. C'est le seul recul ergonomique assumé du design ; à revoir si l'usage montre que la fermeture est fréquente.
- **La phase 2 touche `gallery/`**, dont `docs/PIEGES_CONNUS.md` impose la lecture préalable et `diff_suite.mjs` la validation.
- **Un panneau très large ne montre plus ses onglets d'un coup d'œil.** On accepte de perdre cette vue d'ensemble contre une position stable. Réintroduire une bande complète au-delà d'une certaine largeur donnerait deux formes pour une même fonction.
