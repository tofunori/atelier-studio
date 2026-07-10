# Plan 019 — notes d'exécution (Fable, 2026-07-09)

État vivant du chantier galerie. Survit à la compaction de session — TENIR À JOUR.

## Faits établis (cartographie vérifiée)

- Template unique : `gallery/assets/gallery_template.html` (1731 l.). Coquille
  regénérée à chaque GET / par `serveLiveShell()` ; données via `GET /data` ;
  état (favs/ratings/hidden/tags/hideRules/collections/workflow) via
  `GET/POST /state`, serveur autoritaire (hydratation l.581-585).
- **Workflow réel = `draft/candidate/final/rejected`** (liste blanche serveur
  core.mjs:213 + Python). Le plan 019 le nomme mal (Draft→Review→Approved→
  Published) — ON GARDE les états réels (contrat « préserver », pas renommer).
- Clic carte = OUVRE (lbOpen) aujourd'hui ; multi-select via checkbox .selbox
  (batch : cmp/hide/del/clr/collect/export, boutons header si selSet>0).
- Header : brand (Board/Notes/Settings ▾) + controls (search #q toujours
  visible, #sort, #folder, #fmtChip/#fmtMenu, #favChip, #collChip, #wfChip,
  #recChip [localStorage seul], #densitySeg, #viewMenu, #quoteClear, #rescan,
  #rateFilter, 6 boutons sélection).
- add-to-chat : `__atelierPost({type:'atelier-add-to-chat', text:'__ROOT__/'+rel+'\n…lis-le (outil Read)…'})`
  (l.503-507) — MÊME payload à réutiliser (contrat).
- Thème : postMessage `atelier-theme` (l.1611-1620) remappe les vars ; embarqué
  détecté par `window.self!==window.top` (var EMB existante ?) — vérifier.
- MAX=600 cartes ; render() = innerHTML (l.1301-1375) ; carte l.1356-1372 avec
  `data-act="lb" data-rel` (PARITÉ : parity.mjs cherche ce markup — LE GARDER).
- `/findscript` (editors.mjs:538, ripgrep) = provenance réelle possible ;
  `/thumb` pour previews ; `/open`, `/delete`, `/export` existent.
- Piège WKWebView : display:none ⇏ visibilitychange — preview de l'inspecteur
  chargé DANS le handler de sélection, abort explicite.
- Tests à réécrire EN MÊME TEMPS : gallery/tests/test_fullscreen_regression.py
  (assertions littérales sur le template : buildWorkflowChip, "Status &#9662;",
  cardMenu(, data-wfset=) ; E2E core.spec.js scénario 2 (clic = ouvre) devient
  dblclick/bouton Open. E2E tourne contre le serveur PYTHON.

## Décisions de design (arrêtées)

### Barre de commande (étape 2)
Rangée 1 : `#q` (flex dominant) · `#filtersChip` « Filters (N) » · `#sort` ·
`#densitySeg` · `#surfMore` (⋯ overflow). Board/Notes restent des chips de vue
compactes dans le brand (décision 014) ; à ≤800px elles passent dans ⋯ (CSS).
`#filtersMenu` (popover, apply immédiat — modèle actuel) regroupe : Dossier,
Formats (contenu fmtMenu), Favoris (+ étoiles min), Collections, Statut
(4 états réels), Recent. Chaque groupe : label + reset local.
Rangée 2 `#activeChips` : chips supprimables par filtre actif + « Tout
effacer » ; display:none si zéro filtre.
Overflow ⋯ : Rescan (avec état de scan inline), Réglages galerie (ex-Settings
▾ : thème/vue/santé — renommé pour lever l'ambiguïté), Clear annotation,
Board/Notes (≤800px). Les 6 boutons de sélection deviennent une barre
contextuelle `#selBar` sous la rangée 1 (visible si selSet>0) — mêmes ids.

### Sélection (étape 3)
- `selectedRel` (sélection simple, ≠ selSet batch). Clic zone média = SELECT
  (inspecteur) ; dblclick = ouvrir (lbOpen) ; bouton hover « Open » = ouvrir ;
  garder `data-act="lb"` dans le markup (parité) mais handler → select.
- Carte : `aria-selected` + classe `.sel2` (2 signaux : bordure token accent +
  fond card2). Survit au rerender si visible, sinon inspecteur fermé + focus #q.

### Inspecteur (étape 4) — aside #inspector dans le template
Sections : Preview (img /thumb, chargée à la sélection, onerror → fallback
type ; pas de PDF embed) ; Identity (name/ext/rel/size/mdate — réels) ;
Workflow (statut courant + 4 boutons setWorkflow) ; Provenance (projet
__ROOT__, script via GET /findscript à la sélection avec AbortController,
sinon « Non enregistrée ») ; Organization (collections membership + favori +
étoiles) ; Actions (Ouvrir, Ajouter au chat [EMB seulement], … rare).
- Add-to-chat : états idle→pending→added (1,8s), guard double, échec → notice
  inline persistante. Même payload texte que data-act="chat".
- Layout : body.has-insp → grid margin-right 300px ; ≤800px : overlay drawer +
  scrim. Escape : inspecteur AVANT lightbox (si lb fermée).
- Fermer si l'artefact sort du filtre ou est supprimé/caché.

### États (étape 7)
- Galerie vide / zéro résultat avec filtres (bouton reset) — bloc #emptyState.
- Rescan : notice inline « Scan en cours… » avant reload (comportement reload
  conservé) ; échec rescan → notice erreur.
- Thumb manquante : fallback icône par type + note inspecteur.

## Mapping avant→après (rapport, étape 1/6)
| Avant | Après |
|---|---|
| #searchChip (mort) | supprimé (recherche déjà permanente) |
| #sort, #densitySeg | rangée 1 (inchangés) |
| #folder, #fmtChip, #favChip, #collChip, #wfChip, #recChip, #rateFilter | groupes du popover Filters + chips actives rangée 2 |
| #rescan | overflow ⋯ (avec état de scan) |
| Settings ▾ (#viewChip) | overflow ⋯ « Réglages galerie » |
| Board/Notes | chips brand (inchangé) ; ⋯ à ≤800px |
| quoteClear | overflow ⋯ (contextuel) |
| 6 boutons sélection | #selBar contextuelle (mêmes ids/handlers) |

## Progression
- [x] Passe 1 : barre de commande + chips + selBar + overflow — suites unit(32)/diff(78)/parité/E2E(5) vertes ; vérif Playwright interactive OK (popover 6 groupes, sous-menus, chips actives, clear all)
- [ ] Passe 2 : sélection carte + inspecteur + add-to-chat + états
- [ ] Passe 3 : réécrire test_fullscreen_regression.py (assertions nouvelles),
      étendre E2E (8 scénarios plan), unit/parity/diff verts
- [ ] stage-gallery + verify + AGENTS.md + captures 1512/1280/800 + commit/push

## Gates
npm run test:gallery:unit | :parity | :diff ; npm run verify:e2e ;
npm run test:frontend ; tsc ; vite build ; npm run verify ; AGENTS.md.
