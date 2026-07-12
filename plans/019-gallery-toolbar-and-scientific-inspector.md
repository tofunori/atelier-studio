# Plan 019: Simplifier la galerie et ajouter l'inspecteur scientifique

> **Executor instructions**: charger `/efficient-fable`. Toute modification se
> fait dans `gallery/`, jamais directement dans `src-tauri/gallery-dist/`. Le
> workflow 4 états, Recent, collections, favoris, board/notes et parité serveur
> restaurés par 007 sont des contrats à préserver.
>
> **Drift check**:
> `git diff --stat 8baafca..HEAD -- gallery src/components/AtelierPane.tsx src/components/shell src-tauri/gallery-dist`
> puis `git status --short --` sur ces chemins. Si `gallery-dist` contient un
> diff manuel, STOP et corriger la source/staging avant de commencer.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans 016 et 018
- **Category**: scientific artifacts / gallery UX
- **Planned at**: commit `8baafca`, 2026-07-09

## Problème

La galerie est fonctionnellement riche, mais sa toolbar distribue recherche,
tri, dossiers, formats, favoris, collections, statut, recent, densité, refresh,
Settings, Board et Notes sur plusieurs rangées. L'utilisateur voit tous les
leviers avant de voir la sélection et sa provenance. Le plan réduit le chrome
visible sans supprimer les capacités, puis fait de l'inspecteur le centre du
travail scientifique sur un artefact.

## Contrats à ne pas casser

- grid déterministe et formats actuels;
- workflow figure `Draft → Review → Approved → Published`;
- filtres de statut et Recent;
- favoris, collections et persistance;
- Board et Notes;
- rescan sécurisé/allowlist de plan 005;
- menus carte et commandes serveur;
- protocole d'ouverture et `add-to-chat`;
- parité source/bundle et fonctionnement hors réseau;
- navigation clavier existante si présente.

## Étape 1 — Mesurer les usages et le chrome

Avant modification, inventorier chaque contrôle : action, fréquence présumée,
état persistant, raccourci, nombre de clics vers le résultat. Capturer la toolbar
à 1512, 1280 et 800 px. Établir trois catégories :

- **toujours visible** : recherche, Filters, tri, densité ou vue, overflow;
- **visible si actif** : chips dossiers/formats/favoris/collections/statut/recent;
- **dans popover/overflow** : contrôles rares, refresh, configuration, Board/Notes
  selon décision 014.

Ne retirer aucun contrôle sans indiquer précisément sa nouvelle destination.

## Étape 2 — Nouvelle barre de commande

Créer une première rangée unique :

1. champ Recherche flexible et dominant;
2. bouton `Filtres` avec compteur des filtres actifs;
3. tri compact avec label accessible;
4. densité/vue;
5. overflow de surface.

Une seconde rangée n'existe que lorsque des filtres sont actifs. Elle contient
des chips supprimables individuellement et `Tout effacer`. À zéro filtre, elle
disparaît sans laisser de hauteur vide.

Le popover Filtres groupe : dossier, format, favori, collection, workflow,
Recent/date. Chaque groupe : label, valeurs, compte si disponible, bouton reset
local. Apply est immédiat seulement si le comportement actuel l'est; sinon
Apply/Cancel explicites. Ne pas mélanger les deux modèles dans le même popover.

À 800 px : recherche sur première ligne; actions compactes sur seconde si
nécessaire; jamais scroll horizontal de toute la page.

## Étape 3 — Sélection de carte

Séparer clairement :

- clic principal sélectionne la carte et ouvre/met à jour l'inspecteur;
- double clic ou action dédiée ouvre l'artefact si ce geste est fiable et
  documenté; préférer un bouton explicite si ambigu;
- checkbox/multi-select seulement si une action batch réelle existe;
- menu `…` garde actions secondaires;
- workflow/favori restent manipulables sans ouvrir accidentellement le fichier.

La sélection utilise deux signaux visuels et `aria-selected`. Elle survit à un
rerender de filtre si l'artefact reste visible; sinon l'inspecteur se ferme avec
un retour focus logique. Pas d'accent orange sur toutes les cartes.

## Étape 4 — Inspecteur scientifique

Implémenter l'inspecteur selon le contrat 018, alimenté uniquement par les
métadonnées réelles. Ordre des sections :

1. **Preview** — rendu existant ou miniature; fallback stable par type.
2. **Identity** — nom, type, chemin/source, taille et date si disponibles.
3. **Workflow** — statut courant et transition autorisée.
4. **Provenance** — projet, fichier source, génération/commande si enregistrée;
   afficher « Non enregistrée » plutôt qu'inventer.
5. **Organization** — collections, favori, tags existants.
6. **Actions** — Ouvrir, Ajouter au chat, Comparer seulement si réel, menu rare.

L'inspecteur ne prétend pas valider une figure. `Approved` est un statut de
workflow utilisateur, pas une validation statistique.

Le preview ne doit pas charger un PDF/vidéo/HTML lourd pour chaque simple hover.
Charger au moment de la sélection avec abort/cleanup lors d'un changement rapide.

## Étape 5 — Ajouter au chat

Réutiliser le contrat de transfert 018 :

- payload contient l'identifiant/path/source déjà accepté par Atelier;
- bouton passe en pending puis « Ajouté »;
- double clic rapide ne duplique pas l'attachment;
- échec produit un InlineNotice persistant dans l'inspecteur;
- le composer montre un ContextChip avec type + nom + provenance courte;
- l'utilisateur peut ajouter plusieurs artefacts sans fermer l'inspecteur;
- aucune lecture arbitraire de fichier ou exposition hors racine autorisée.

## Étape 6 — Actions de surface

Selon l'approbation 014 :

- Refresh va dans le header de surface ou overflow, avec statut de scan visible;
- Settings ouvre le vrai Settings, il ne reste pas un bouton galerie ambigu;
- Board/Notes restent des modes de la galerie ou passent dans l'overflow de
  surface, mais leur état/persistance et leur accessibilité sont conservés;
- Collections peuvent rester dans le filtre et l'inspecteur, sans troisième
  navigation parallèle.

Documenter le mapping avant/après dans le rapport.

## Étape 7 — États et contenu

Implémenter :

- galerie vide pour un projet vide;
- zéro résultat avec filtres actifs + reset;
- scan en cours sans bloquer les artefacts déjà présents;
- erreur scan avec détail/action;
- preview non supporté;
- fichier manquant;
- métadonnées partielles;
- grand nombre d'artefacts;
- collection supprimée pendant sélection.

Les erreurs ne doivent pas disparaître dans la console ou un `alert()`.

## Tests galerie

Étendre les suites existantes plutôt que créer un deuxième moteur de fixtures :

- tests unitaires Python pour état/filter/workflow/persistance;
- `parity.mjs` pour source vs serveur;
- `diff_suite.mjs` pour comportements galerie;
- Playwright E2E pour toolbar, filtre, sélection, inspecteur, workflow,
  add-to-chat, Board/Notes et 800 px.

Scénarios E2E minimum :

1. rechercher → filtrer workflow → chip actif → reset;
2. sélectionner deux cartes successives → inspecteur à jour → focus correct;
3. changer Draft→Review → reload → état conservé;
4. ajouter au chat deux fois rapidement → un seul contexte;
5. artefact manquant → erreur locale sans crash grille;
6. clavier : recherche, filtres, grille, inspecteur, Escape;
7. 800×600 : toolbar utilisable, inspecteur accessible;
8. dark/light si la galerie suit les variables du host.

## Contrôle performance

Mesurer avant/après : temps rendu initial, interaction recherche, sélection,
chargement preview et mémoire après dix sélections. Aucun objectif artificiel,
mais les critères suivants sont des alertes :

- filtre perceptiblement bloquant sur le corpus réel;
- preview précédent non annulé;
- listeners/observers croissent à chaque sélection;
- re-render de toutes les previews au changement de workflow;
- layout shift important à l'ouverture inspecteur.

## Verification obligatoire

```bash
npm run test:gallery:unit
npm run test:gallery:parity
npm run test:gallery:diff
npm run verify:e2e
npm run test:frontend
npx tsc --noEmit
npx vite build
npm run verify
```

Puis protocole `AGENTS.md`. `stage-gallery.sh` doit régénérer le bundle. Vérifier
dans l'app buildée que les process galerie ont été tués avant le rebuild.

Parcours manuel : recherche, tous filtres, workflow, Recent, favoris,
collections, Board, Notes, ouverture formats, add-to-chat, rescan, thème,
1512/1280/800 px.

## Done criteria

- [ ] Première rangée limitée aux contrôles fréquents.
- [ ] Filtres actifs visibles et réversibles, capacités existantes préservées.
- [ ] Sélection et ouverture ont des gestes non ambigus.
- [ ] Inspecteur montre identité, workflow, provenance et actions réelles.
- [ ] Add-to-chat est idempotent et visible dans le composer.
- [ ] Tous les états d'erreur/empty/loading sont traités inline.
- [ ] Workflow, Recent, collections, favoris, Board/Notes restent fonctionnels.
- [ ] Unit, parity, diff, E2E, verify et app buildée passent.
- [ ] Aucun edit direct de `gallery-dist`.

## STOP conditions

- Une capacité existante n'a pas de nouvelle destination claire.
- Les métadonnées nécessaires à la provenance ne sont pas stockées; afficher
  « Non enregistrée » et créer un plan backend séparé si nécessaire.
- Add-to-chat exige d'élargir la racine de fichiers autorisée.
- Le preview nécessite une dépendance lourde nouvelle.
- Parité/diff échoue pour une raison non comprise.
- Un ancien serveur galerie reste vivant après le protocole de relance.

## Git workflow

Sans instruction, pas de commit/push. Si autorisé, branche
`fable/019-gallery-inspector`; séparer toolbar, sélection/inspecteur et transfert
de contexte en commits vérifiables. Le bundle généré suit la politique Git
existante, jamais un patch manuel.
