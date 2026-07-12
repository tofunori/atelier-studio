# Plan 018: Clarifier la hiérarchie du workspace et le contexte actif

> **Executor instructions**: charger `/efficient-fable`. Le shell global est
> validé; ce plan améliore les en-têtes locaux, le statut et le transfert de
> contexte. Ne pas déplacer top bar/rail ni réintroduire de panneaux flottants.
>
> **Drift check**:
> `git diff --stat 8baafca..HEAD -- src/components/TopBar.tsx src/components/Rail.tsx src/components/shell src/components/AtelierPane.tsx src/App.tsx src/App.css src/styles`
> puis `git status --short --` sur ces chemins.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans 016 et 017
- **Category**: information architecture / workspace UX
- **Planned at**: commit `8baafca`, 2026-07-09

## Problème

Le shell possède déjà les bonnes couches globales, mais le centre de gravité
local est souvent implicite : quel thread est actif, quel document est visible,
quelle sélection sera envoyée au chat, quel processus travaille? Les nombreuses
actions de top bar et de toolbar se concurrencent parce que les surfaces ne
portent pas toutes leur propre contexte.

## Contrat de hiérarchie

Chaque écran doit rendre lisibles quatre niveaux sans les dupliquer :

1. **Global** — Atelier, connexion et command center dans la top bar.
2. **Projet** — projet actif dans le rail/view panel et crumb existant.
3. **Surface** — Chat, Galerie, document, terminal, Settings via `SurfaceHeader`.
4. **Sélection** — artefact/source/contexte dans un inspecteur ou ContextShelf.

Un label ne doit apparaître à deux niveaux que si chacun ajoute une information
différente. Exemple acceptable : projet dans le crumb, chemin complet dans un
tooltip; exemple refusé : « Galerie » dans rail, top bar et trois headers.

## Étape 1 — Carte des actions actuelles

Inventorier TopBar, Rail, view panels, Chat header, AtelierPane et toolbars. Pour
chaque action noter : fréquence, portée global/projet/surface/sélection,
raccourci, état, destination cible. Reclasser sans supprimer :

- globales restent top bar;
- projet vont dans view panel/crumb;
- surface vont dans `SurfaceHeader`;
- sélection vont dans inspecteur ou menu contextuel;
- rares/destructives vont dans overflow avec confirmation appropriée.

Ne déplacer une action que si sa destination et son raccourci restent
identifiables. Tout changement de position est couvert par test et note de QA.

## Étape 2 — En-têtes locaux

Appliquer `SurfaceHeader` à trois surfaces pilotes :

- **Chat** : titre thread, état running/done/error, projet secondaire, actions
  rename/overflow si elles existent;
- **Atelier/document** : nom fichier, type/source, dirty/read-only si réel,
  actions propres au document;
- **Galerie host** : titre, nombre/état de scan utile, actions de surface; les
  filtres restent dans la galerie au plan 019.

Le header local :

- ne dépasse pas deux lignes;
- a un seul titre tronqué avec tooltip/accessible name complet;
- sépare statut d'une action;
- reste visible quand le body scrolle si cela ne réduit pas trop 800×600;
- ne contient pas une rangée de plus de trois actions visibles;
- conserve zones drag uniquement là où elles existaient.

## Étape 3 — Statut de travail cohérent

Créer une fonction de présentation unique pour les statuts UI : idle, running,
done, warning, error, disconnected. Elle reçoit un état métier déjà fiable et
retourne label, ton et texte accessible. Elle ne fusionne pas des concepts
scientifiques avec le succès technique.

Règles de contenu :

- `running` → « En cours » + durée si disponible;
- `done` → « Terminé » ou absence de badge après un délai selon blueprint;
- `error` → « Interrompu »/« Erreur » avec accès au détail;
- `disconnected` → « Sidecar déconnecté », jamais « Hors ligne » si la galerie
  locale fonctionne encore;
- aucun vert pour « résultat scientifique correct »;
- aucun clignotement; activité par spinner sobre ou point animé reduced-motion.

## Étape 4 — Modèle d'inspecteur commun

Installer `ContextInspector` sur le modèle `InspectorPanel` de 016. Ce plan ne
remplit pas encore toutes les métadonnées galerie; il fixe le contrat :

- ouverture par sélection explicite;
- largeur bornée et redimensionnable seulement si le shell le supporte déjà;
- header avec nom/type et fermer;
- body scrollable;
- sections Overview, Source/Provenance, Context;
- footer facultatif avec action « Ajouter au chat »;
- Escape ferme et retourne le focus à l'élément source;
- sélection suivante met à jour sans animation de page complète;
- en Split, l'inspecteur ne crée pas une quatrième colonne inutilisable.

Décider avec le blueprint le comportement à 800 px : drawer superposé temporaire
avec overlay sobre, ou navigation détail dans la surface. Documenter ce choix et
tester le retour focus.

## Étape 5 — Transfert de contexte

Un artefact ou une sélection ajoutée au chat suit le contrat :

1. action déclenchée depuis inspecteur/source;
2. état pending local empêchant le double ajout;
3. accusé visible « Ajouté au contexte »;
4. `ContextChip` apparaît dans le composer avec source/type;
5. focus reste logique : inspecteur si ajout multiple, composer si l'action dit
   explicitement « Ajouter et demander »;
6. suppression du chip ne supprime jamais le fichier/source d'origine.

Conserver les événements `atelier:add-to-chat` existants si leur payload suffit.
Ne changer le protocole qu'avec un nouveau plan séparé et des tests sidecar.

L'animation autorisée est 120–150 ms opacity + translate 2–4 px. Elle confirme
le changement d'état; aucun objet ne traverse les panneaux.

## Étape 6 — Simplifier la top bar sans la refaire

Après déplacement des actions locales, revoir la top bar :

- garder project crumb et command center;
- garder le switch Chat/Split/Atelier;
- garder uniquement les actions réellement globales;
- grouper les actions secondaires existantes dans overflow si approuvé;
- préserver raccourcis, titles et zones drag;
- ne pas ajouter logo, breadcrumb complet, avatar ou recherche concurrente.

Le nombre d'actions visibles doit diminuer ou rester stable, jamais augmenter.

## Tests

Tests RTL/intégration pour :

- bon titre/statut après changement thread/document;
- titre long/troncature avec accessible name complet;
- running → done/error sans badge bloqué;
- sélection ouvre inspecteur;
- Escape ferme et retourne le focus;
- Ajouter au chat produit un seul contexte et un accusé;
- suppression ContextChip ne touche pas la source;
- Split/Chat/Atelier conservent le contexte attendu;
- 800 px n'expose pas quatre colonnes;
- remount ne duplique pas `atelier:add-to-chat`.

## QA visuelle

Capturer au minimum :

- Chat actif + galerie à droite, 1512×883 dark;
- document + inspecteur, 1512×883 light;
- Chat running, 1280×800;
- inspecteur mobile/petite fenêtre, 800×600;
- titres projet/thread/fichier très longs;
- disconnected et error.

Vérifier que le regard suit : titre local → contenu → action, et non top bar →
toolbar → badges multiples. Compter les surfaces élevées et accents orange.

## Verification

```bash
npm run test:frontend
npx tsc --noEmit
npx vite build
npm run verify
```

Puis protocole `AGENTS.md`; app buildée avec Chat/Split/Atelier, ouverture
document/figure, transfert au chat, clavier, dark/light, petite fenêtre.

## Done criteria

- [ ] Les quatre niveaux de hiérarchie sont visibles sans duplication.
- [ ] Trois surfaces utilisent le même contrat de header.
- [ ] Statuts techniques ont un vocabulaire cohérent et honnête.
- [ ] Inspecteur commun est accessible et fonctionne à 800 px.
- [ ] Transfert de contexte est visible, réversible au niveau du composer et non
  destructif pour la source.
- [ ] Top bar/rail validés sont conservés.
- [ ] Moins ou autant d'actions globales visibles qu'avant.
- [ ] Tests et captures couvrent les transitions critiques.

## STOP conditions

- Le transfert exige un changement du payload sidecar/postMessage.
- Le shell doit adopter quatre colonnes permanentes.
- Une action ne peut pas être reclassée sans casser son raccourci ou workflow.
- Une information de statut n'est pas fiable selon les events/historiques.
- L'inspecteur masque le composer ou rend Atelier inutilisable à 800×600.

## Git workflow

Pas de commit/push sans demande. Si autorisé, branche
`fable/018-workspace-context`; séparer headers/statuts de l'inspecteur/transfert
pour permettre une revue fonctionnelle indépendante.
