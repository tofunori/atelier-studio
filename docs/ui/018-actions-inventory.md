# Plan 018 — étape 1 : carte des actions et reclassement

Inventaire réalisé le 2026-07-09 (agent d'exploration, vérifié par
l'intégrateur). Détail complet par surface : TopBar (9 actions), Rail (~15),
Sidebar (~25), Chat (0 en-tête local avant 018 — constat central), AtelierPane
(onglets + menu contextuel, pas de toolbar de surface), WorkspaceShell (1
poignée). Raccourcis globaux : ⌘K/⌘P (palette), ⌥⌘K (Quick Ask), ⌘1/⌘0/⌘2
(layout), ⌘⇧A (chat↔split), Échap (interrompre le tour).

## Constats structurants

- **Aucun en-tête local** : ni le chat (titre/statut du thread jamais rendus —
  `threadTitle`/`threadProvider` n'étaient que des métadonnées sidecar), ni la
  galerie hôte, ni les documents. → étape 2.
- **Statuts ad hoc** : `rail-dot`, `arc`, `busy`, `activity-pulse`,
  `review-badge v-*`, `tool-status` — six conventions locales, aucune partagée.
  → `presentStatus` (étape 3).
- **`data-tauri-drag-region`** : `.topbar`, `.topbar-left`, `.side-top`
  uniquement — aucune n'est touchée par 018.
- **add-to-chat** : 5 producteurs (iframe atelier, bandeau annotation, browser
  ×2, Zotero, citation chat) convergent vers `addAttachment` (dédup par texte).
  Payloads `atelier-add-to-chat` inchangés (contrat 018 étape 5 respecté).

## Reclassements effectués (notes de QA)

| Action | Avant | Après | Justification | Raccourci |
|---|---|---|---|---|
| Recharger la galerie (`action.refresh-hard`) | TopBar (visible seulement si surface atelier + onglet galerie — condition invisible pour l'utilisateur) | `GalleryHeader` de la surface galerie | action de SURFACE, pas globale (étape 6) ; même `title`, même icône | aucun (inchangé) |
| Inspecter un fichier | n'existait pas | menu contextuel d'onglet + bouton du `DocumentHeader` (accès clavier) | sélection explicite (étape 4) | aucun |

Bilan TopBar : 9 → 8 actions visibles (**diminue**, critère étape 6 satisfait).
Explorateur/Git restent en TopBar : remontés du rail par une décision
antérieure documentée dans le code, sans raccourci à casser — les reclasser à
nouveau contredirait « ne déplacer que si la destination reste identifiable ».

## Limites documentées

- « Nombre/état de scan » du header galerie : l'état de scan vit dans l'iframe
  galerie ; aucun flux React n'existe — non affiché plutôt qu'inventé
  (règle « si réel »). Candidat plan 019 (inspecteur scientifique).
- Menu contextuel d'onglet : pattern `div onClick` préexistant, non accessible
  clavier — l'accès clavier à l'inspecteur passe par le bouton du
  `DocumentHeader` ; la refonte a11y du ctx-menu est une dette séparée.
- Renommage de thread : le workflow vit dans la sidebar (édition inline) ;
  aucune fonction App invocable — le `ChatHeader` expose l'overflow (menu ⋯)
  mais App ne fournit pas encore `onRename` (branche prête pour le plan 020).
