# Rail de timeline — navigation par prompt (design)

Date : 2026-08-22. Auteur : ox-alpha. Statut : proposition, non implémentée.

## 1. Le problème

Un fil de recherche vit des heures et des centaines d'outils. Revenir à « la
question sur le glacier Aletsch de ce matin » demande de scroller à la main :
rien ne porte le nom des prompts. Hermes Desktop résout ça par un rail
latéral (`components/assistant-ui/thread/timeline.tsx`, 419 l.) : une entrée
par prompt utilisateur, l'entrée active déduite du scroll, clic → saut.
Atelier a déjà les pins épinglés à la main (`chapters`, ChatTimeline.tsx:809)
mais rien d'automatique : un fil non épinglé n'a aucune carte de navigation.

**Parti pris** : le rail liste les prompts PAR DÉFAUT (zéro action
utilisateur), les pins restent une couche au-dessus (épingler = marquer
persistant, pas « faire apparaître »).

## 2. Ce qui existe déjà chez nous (réutilisable tel quel)

| Besoin | Existant | Emplacement |
|---|---|---|
| Source des prompts | events `kind: "user"` avec `meta.messageId` | reducer harnessEvents |
| Saut + scroll fluide | `resolvePinEl(...).scrollIntoView({behavior:"smooth"})` | ChatTimeline.tsx:818 |
| Position dans la page | `tickPos: Record<number, number>` | prop `chapters` |
| Formatage horaire tabular | `formatStampRange` / `TimelineStamp` | TimelineStamp.tsx |
| Stabilité de rendu | `virtualItems` mémoïsé + keys stables | ChatTimeline.tsx:214 |

Le rail est donc **un consommateur de plus** de données déjà projetées — pas
une nouvelle source de vérité. C'est la condition pour qu'il coûte peu.

## 3. Mécanismes Hermes à reprendre (avec leurs sources)

### 3.1 Dérivation pure testable (`timeline-data.ts`, 89 l.)
`deriveTimelineEntries(messages) → [{id, preview}]` : un entry par `role:
"user"`, notifications système filtrées par regex
(`PROCESS_NOTIFICATION_RE`), preview 120 chars whitespace-collapsed.
Côté Atelier : dériver depuis `events` filtrés `kind === "user" && !error`,
preview tronqué pareil. **Pure function dans `src/lib/chat/`**, tests vitest,
aucune dépendance React — même discipline que `turnViewModel.ts`.

### 3.2 Rendre le tableau PRÉCÉDENT si inchangé (`sameTimelineEntries`)
La règle d'identité référentielle qu'on vient d'appliquer à `listExtraData`
(ChatTimeline) appliquée au rail lui-même : si deux dérivations décrivent le
même rail, rendre l'ancienne référence → zéro re-render pendant le stream
(les deltas ne créent jamais de nouveau prompt). À porter en helper partagé
si un troisième consommateur apparaît.

### 3.3 Entrée active par géométrie (`activeTimelineIndex`)
L'entrée active = dernier prompt dont l'offset viewport ≤ slack (8 px), sinon
le premier rendu. Pas d'état « section courante » maintenu à la main : la
géométrie EST la vérité. Côté Atelier : offsets mesurés via les refs des rows
LegendList déjà indexées (`message-${index}`), recalcul sur scroll throttlé
rAF (déjà le rythme du composant).

### 3.4 Hover → popover aperçu, clic → saut
Hermes sépare `onHover` (peint l'aperçu) et `onJump` (scroll). Chez nous :
hover → tooltip natif `title` d'abord (YAGNI), clic → le même
`scrollIntoView` que les pins. Le popover n'arrive que si le tooltip s'avère
insuffisant en usage.

## 4. Décisions de design (système sobre)

| # | Décision |
|---|----------|
| A | Placement : colonne fine à droite du transcript (même gouttière que les chapters existants ; les pins s'y fondent — pin = rail + marqueur persistant). Largeur fixe tokens, pas de collapse au premier jet. |
| B | Entrée = heure (`TimelineStamp`, `--fs-xs`, `--muted2`) + preview 1 ligne ellipsée (`--fs-xs`). Active : `--fg2` + puce pleine ; inactives : `--muted`. Jamais de couleur hors tokens. |
| C | Filtrage : les messages `agent_message` direction "received" et les users sans texte ne créent PAS d'entrée (même règle que le reducer). Les steers pendant un tour actif SI (ce sont de vraies intentions utilisateur). |
| D | Motion : apparition/disparition d'une entrée = fade 120 ms ; le marqueur actif glisse (transform, 140 ms). Respecte prefers-reduced-motion. |
| E | i18n fr+en obligatoire (aria-label du rail : « Navigation par message » / « Jump to message »). Rail en `aria-label` + liste `role="list"`, entrées `role="listitem"` — boutons réels (RowButton) pour focus clavier. |

## 5. Hors périmètre (assumé)

- Miniature/aperçu enrichi au hover (popover Hermes) — tooltip d'abord.
- Rail des TOOLS ou des tours (Hermes ne le fait pas non plus).
- Persistance de l'entrée active entre sessions — la géométrie recalcule.
- Mobile.

## 6. Risques connus

1. **Coût des mesures d'offsets** : lire `offsetTop` force du layout si fait
   brut à chaque rendu. Mesurer dans un rAF coalescé (pattern
   `raf-coalesce`) et invalider sur resize/fold toggle uniquement.
2. **Interaction avec la virtualisation LegendList** : les rows hors fenêtre
   n'existent pas dans le DOM. Le saut vers un prompt lointain doit passer
   par `scrollToIndex` (LegendListRef, déjà importé) plutôt que
   `scrollIntoView` sur un nœud absent — même distinction que
   `resolvePinEl` qui retourne `undefined`.
3. **Folds ouverts/fermés changent les hauteurs** : le tickPos des pins est
   déjà recalculé dans ce cas ; brancher le rail sur le même invalidation.

## 7. Plan d'implémentation suggéré (à détailler en plan superpowers)

1. T1 — `src/lib/chat/timelineRail.ts` : `deriveRailEntries(events)` +
   `sameRailEntries(a,b)` + tests (pur).
2. T2 — Composant `TimelineRail` (colonne droite, décision A/B/E),
   état local minimal, offsets via rAF-coalesce, tests jsdom du filtrage.
3. T3 — Branchement ChatTimeline : intégration chapters (décision A),
   scrollToIndex pour saut lointain, test d'anatomie turnAnatomy.
4. T4 — Bench visuel golden (rail 0 entrée / 3 entrées / actif glissé).
