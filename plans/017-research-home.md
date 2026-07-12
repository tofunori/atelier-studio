# Plan 017: Construire le Research Home

> **Executor instructions**: charger `/efficient-fable` et respecter le
> blueprint 014. Remplacer uniquement l'état sans thread actif. Utiliser les
> données déjà présentes dans `App`; ne pas créer de métriques factices ni une
> nouvelle API sidecar pour remplir l'écran.
>
> **Drift check**:
> `git diff --stat 8baafca..HEAD -- src/App.tsx src/components/Chat.tsx src/components/chat src/components/ResearchHome.tsx src/styles src/App.css`
> puis `git status --short --` sur ces chemins.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plan 024
- **Category**: product surface / onboarding quotidien
- **Planned at**: commit `8baafca`, 2026-07-09

## Problème

L'état actuel « Ready for a session » propose trois actions mais ne répond pas
aux questions d'un chercheur qui rouvre l'app : où en suis-je, qu'est-ce qui a
changé, que dois-je reprendre, quels artefacts sont utiles? Le nouvel accueil
doit être un poste de reprise du travail, pas un hero marketing.

## Résultat utilisateur

En moins de cinq secondes, Thierry doit pouvoir :

1. identifier le projet actif;
2. reprendre le dernier thread pertinent;
3. voir une activité en cours ou une erreur importante;
4. rouvrir un artefact récent;
5. démarrer un nouveau chat/import sans chercher dans la navigation.

## Données autorisées

Construire une vue dérivée pure à partir des états déjà disponibles dans App :

- `projects`, `activeProject`;
- `threads`, thread courant et timestamps existants;
- `workingSince`, états running/error/done;
- `events` et `usageByThread` uniquement lorsqu'ils sont fiables selon plan 010;
- `files`, `recentFiles`, `favorites`, `highlights`;
- `atelierTabs` et dernier artefact ouvert;
- état sidecar/galerie.

Ne jamais déduire « validé scientifiquement », « analyse réussie » ou
« reproductible » d'un simple `done`. Les libellés autorisés décrivent le record :
« terminé », « interrompu », « résultats disponibles », « usage enregistré ».

## Structure cible

Créer `src/components/ResearchHome.tsx` avec une couche de sélection séparée,
par exemple `deriveResearchHomeModel`, testable sans DOM. La structure visuelle :

1. **Header projet**
   - nom du projet et chemin secondaire tronqué;
   - état de connexion compact si dégradé;
   - action « Nouveau chat » primaire;
   - import/ouverture en secondaires ou overflow.
2. **Continuer**
   - dernier thread pertinent, titre, date relative + date complète accessible;
   - statut et dernière action enregistrée;
   - bouton « Reprendre »;
   - si un tour tourne, celui-ci passe devant le dernier thread terminé.
3. **À traiter**
   - erreurs/interruption, review en attente ou sidecar indisponible;
   - maximum trois éléments, triés par sévérité puis récence;
   - pas de panneau si zéro élément.
4. **Artefacts récents**
   - 4 à 6 lignes ou vignettes compactes;
   - type, nom, projet/source et date;
   - étoile/collection seulement si disponible;
   - ouverture dans Atelier, pas dans une nouvelle fenêtre arbitraire.
5. **Démarrer**
   - Nouveau chat;
   - Ouvrir/importer un fichier;
   - Ouvrir la galerie;
   - reprendre une session seulement si le workflow existe réellement.

Le composer existant reste accessible au bas du panneau si cela correspond au
wireframe approuvé. Ne pas dupliquer un second grand champ de saisie dans le
Research Home.

## Hiérarchie et layout

- mise en page asymétrique sur 1512 px : colonne principale environ 2/3 pour
  Continuer + artefacts, colonne secondaire pour À traiter + démarrer;
- sections cardless avec séparateurs ou rythme vertical;
- une seule carte/zone élevée éventuelle pour l'action « Continuer » si approuvée;
- maximum une action orange pleine;
- textes secondaires courts, pas de paragraphes d'onboarding;
- largeur de lecture contrôlée; aucun contenu collé aux bords;
- conserver la top bar et le rail, aucun en-tête global dupliqué.

À 800×600 : une colonne, ordre Continuer → À traiter → Artefacts → Démarrer;
le contenu scrolle, l'action primaire reste dans le flux, aucune colonne étroite.

## États à implémenter

### Aucun projet

Titre factuel, explication en une phrase, action « Ouvrir un projet ». Ne pas
afficher de sections vides ni de faux exemples.

### Projet sans thread

Montrer Démarrer et les artefacts existants s'il y en a. « Nouveau chat » est
primaire. L'état ne doit pas donner l'impression d'une erreur.

### Projet actif avec historique

Afficher Continuer, récents et actions. Les dates relatives ne sont jamais la
seule date disponible.

### Tour en cours

Mettre le thread running en premier avec durée et action « Revenir au thread »;
ne pas présenter Stop sur l'accueil si l'action n'est pas sûre hors contexte.

### Erreur / sidecar indisponible

Utiliser `InlineNotice`, proposer la vraie action disponible (reconnecter,
ouvrir le diagnostic, revenir au thread). Aucun toast éphémère comme seule trace.

### Chargement

Préserver la géométrie générale avec placeholders sobres seulement si le
chargement dépasse un seuil perceptible. Pas de shimmer décoratif.

## Interactions

- Enter/Space activent lignes et boutons conformément au contrôle natif;
- ordre Tab suit la hiérarchie visuelle;
- action Reprendre sélectionne le projet/thread puis rend le focus au titre local
  ou au composer selon la convention approuvée;
- artefact ouvre le bon tab Atelier et préserve la possibilité d'ajouter au chat;
- nouveau chat ne crée pas plusieurs threads sur double clic;
- les actions indisponibles expliquent pourquoi plutôt que disparaître sans trace;
- les listes utilisent des clés stables et pas l'index.

## Tests unitaires

Tester `deriveResearchHomeModel` pour :

- zéro projet;
- projet sans thread;
- dernier thread terminé;
- thread running plus ancien mais prioritaire;
- erreur plus récente;
- artefacts du mauvais projet exclus;
- données historiques incomplètes;
- dates invalides/futures sans crash;
- nombre maximum d'éléments et tri stable.

Tests RTL : actions principales, clavier, focus après Reprendre, ouverture
artefact, absence de sections vides, texte long, sidecar offline et 800 px.

## Contrôle visuel

Captures déterministes :

- 1512×883 dark avec historique riche;
- 1512×883 light sans erreur;
- 1280×800 dark avec running;
- 800×600 dark avec projet sans thread;
- zéro projet;
- erreur sidecar.

Comparer au wireframe 014. Évaluer explicitement : premier point de regard,
nombre d'accents orange, alignements, densité, profondeur et visibilité de
l'action suivante.

## Verification

```bash
npm run test:frontend
npx tsc --noEmit
npx vite build
npm run verify
```

Puis protocole `AGENTS.md`, app buildée et parcours : aucun projet, projet vide,
projet réel, reprise thread, artefact récent, nouveau chat, light/dark, 800×600.

## Done criteria

- [ ] L'état générique actuel est remplacé uniquement quand aucun thread actif.
- [ ] Le modèle de vue est pur, typé et testé.
- [ ] Aucune nouvelle API/backend ou donnée inventée.
- [ ] Une action primaire maximum et hiérarchie lisible en cinq secondes.
- [ ] Tous les états documentés existent.
- [ ] Navigation clavier et focus fonctionnent.
- [ ] Research Home s'efface proprement dès qu'un thread est actif.
- [ ] Captures correspondent au blueprint dark/light et 800 px.

## STOP conditions

- Une section nécessite une nouvelle métrique backend uniquement pour paraître
  riche.
- L'usage/historique de plan 010 ne permet pas une attribution fiable au thread.
- L'ouverture d'un artefact contourne le modèle de tabs Atelier.
- Le Research Home force une nouvelle navigation globale ou un second composer.
- Plus de deux actions primaires semblent nécessaires : retourner au blueprint.

## Git workflow

Sans instruction, aucun commit/push. Si autorisé, branche
`fable/017-research-home`; séparer modèle/tests du rendu/styles afin de faciliter
la revue et le revert.
