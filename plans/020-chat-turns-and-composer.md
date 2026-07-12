# Plan 020: Recomposer les tours de chat et le composer

> **Executor instructions**: charger `/efficient-fable`. Travailler sur les
> composants extraits par 015 et les primitives 016. Préserver intégralement le
> streaming, les providers, permissions, modèles, effort, steering, attachments,
> goals, review et commandes. Ce plan change la hiérarchie visuelle, pas le
> protocole d'agent. Le contrat de turn, les interactions et le replay durable
> viennent obligatoirement du plan 025 validé; ne pas les réimplémenter ici.
>
> **Drift check**:
> `git diff --stat 8baafca..HEAD -- src/components/Chat.tsx src/components/chat src/App.tsx src/lib sidecar/providers sidecar/router.mjs`
> puis `git status --short --` sur ces chemins. Le drift produit par le plan 025
> est attendu uniquement s'il est DONE et validé : comparer son diff et prendre
> son commit final comme nouvelle base. Tout autre drift sidecar non expliqué est
> un STOP : ce plan ne doit pas absorber une modification de provider.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans 015, 016, 018 et 025
- **Category**: core interaction / agent UX
- **Planned at**: commit `8baafca`, 2026-07-09

## Problème

Le chat expose déjà une grande richesse : thinking, outils, sorties, texte,
review, usage, attachments et contrôles provider. Mais les unités visuelles se
ressemblent trop et le composer montre de nombreux réglages avec le même poids.
Le chercheur doit pouvoir distinguer rapidement : ce qu'il a demandé, ce que
l'agent est en train de faire, ce qu'il répond et quelles preuves techniques le
record contient réellement.

## Anatomie cible d'un tour

Chaque tour est rendu dans cet ordre stable :

1. **Demande utilisateur** — texte, contexte/attachments, timestamp secondaire.
2. **Activité** — groupe repliable thinking/outils/logs, running visible.
3. **Réponse** — prose/markdown/code avec largeur de lecture confortable.
4. **Capsule résultat** — fichiers/actions/tests/review/usage réellement
   enregistrés, avec accès au détail.
5. **Actions de tour** — copy, retry, revert ou autres capacités existantes.

Ne pas enfermer chaque bloc dans une carte. La structure vient de l'espacement,
des séparateurs et de la typographie; la capsule résultat est une entité et peut
avoir un contenant distinct.

## Étape 1 — Matrice événements → présentation

Lire `docs/AGENT_HARNESS_CONTRACT.md` livré par 025 et vérifier sa version contre
le code. Ne pas recréer une matrice concurrente. Établir le mapping de
présentation depuis les événements durables normalisés vers :

- activité running;
- activité terminée;
- réponse partielle/finale;
- preuve technique;
- erreur/interruption;
- usage;
- review.

Tout événement sans attribution fiable reste dans le journal détaillé, pas dans
la capsule synthétique. Ne pas inférer qu'un test « passe » depuis une commande
lancée sans code de sortie enregistré.

## Étape 2 — Demande utilisateur et contexte

La demande utilisateur :

- reste identifiable sans grande bulle colorée;
- montre les ContextChips/attachments sous le texte;
- sépare fichier source, figure et texte collé;
- expose nom complet/provenance au tooltip ou inspecteur;
- ne répète pas le chemin complet dans le fil;
- conserve édition/steering si déjà supportés;
- montre un état clair si un attachment historique n'est plus disponible.

Le contexte est un objet du tour historique : enlever un chip du composer après
envoi ne modifie jamais un ancien tour.

## Étape 3 — Groupe Activité

Créer un `ActivityGroup` compact :

- header « Activité » + statut + durée + nombre d'étapes;
- ouvert pendant running, repliable après terminal;
- erreurs restent visibles même replié;
- outils regroupés chronologiquement avec nom humain, statut et durée;
- thinking distingué sans dominer la réponse;
- sortie volumineuse repliée avec « Afficher plus » et copie;
- scroll interne seulement pour des sorties réellement longues;
- aucune animation infinie hors running;
- auto-collapse ne vole pas le focus ni ne ferme un détail ouvert manuellement.

Les noms d'outils bruts peuvent être accompagnés d'un label lisible, mais le nom
exact reste accessible pour diagnostic.

## Étape 4 — Réponse

La réponse :

- a une largeur de lecture cohérente;
- préserve markdown, listes, tableaux, code, Mermaid, liens et citations;
- ne force pas toutes les réponses dans une carte;
- garde actions copy/retry discrètes et accessibles au clavier/focus, pas
  exclusivement au hover;
- distingue streaming d'un résultat final sans provoquer de layout shift;
- affiche un fallback clair en cas d'erreur Mermaid/code preview;
- conserve sélection texte et menus natifs utiles à la recherche.

## Étape 5 — Capsule résultat honnête

Créer `ResultCapsule` uniquement à partir de données attribuables au tour :

- fichiers créés/modifiés avec action ouvrir/diff si existante;
- commandes/outils terminés et code de sortie si enregistré;
- tests exécutés et résultat seulement si explicitement connu;
- review/reviewer avec état et limites;
- snapshot/revert disponible;
- usage tokens/coût/durée selon fidélité de 010;
- avertissements et erreurs.

Vocabulaire obligatoire :

- « 3 fichiers modifiés », pas « changement réussi »;
- « Tests rapportés : 12 réussis », pas « code validé »;
- « Review terminée », pas « scientifiquement approuvé »;
- « Aucun test enregistré », pas un check vert absent de données;
- « Usage indisponible » si l'historique ne le possède pas.

La capsule est absente si elle n'apporte aucune donnée. Elle peut se replier mais
les erreurs et avertissements restent visibles.

## Étape 6 — Composer simplifié

Réorganiser le composer en trois niveaux :

1. **ContextShelf** — attachments/sources visibles seulement s'il y en a.
2. **PromptInput** — zone de saisie dominante, suggestions contextuelles.
3. **ControlBar** — action ajout, provider/modèle résumé, permissions résumé,
   send/stop; options avancées dans popover.

Toujours visibles : ajouter contexte, identité provider/modèle actuelle, send ou
stop. Effort, permissions détaillées, réglages rares et goal editor vont dans des
popovers/sections progressives si le blueprint l'approuve. Les valeurs actives
restent visibles par résumé; rien n'est caché sans signal.

Règles :

- une seule action primaire, Send ou Stop selon état;
- hauteur grandit avec le texte jusqu'à une limite puis scroll textarea;
- aucun saut de hauteur lorsque les chips apparaissent;
- menus s'ouvrent au-dessus du composer et des iframes;
- Enter/Shift+Enter/IME conservent leur contrat;
- permissions dangereuses ne deviennent jamais un simple toggle ambigu;
- changement provider met à jour modèles/effort atomiquement;
- Quick Ask conserve son isolation et son identité visuelle;
- goal actif reste visible et modifiable sans monopoliser la surface.

## Étape 7 — États complets

Implémenter et capturer :

- idle avec contexte vide;
- texte saisi + plusieurs attachments;
- envoi pending;
- running avec Stop;
- steering `now`/`next` si exposé;
- done avec capsule riche;
- done sans données capsule;
- error partielle avec réponse déjà reçue;
- disconnected pendant saisie et pendant running;
- historique ancien incomplet;
- contexte/fichier manquant;
- provider/modèle indisponible;
- fenêtre 800×600 et zoom 125 %.

## Tests de comportement

Tests ciblés sur les composants extraits :

- mapping event → section sans duplication;
- ordre out-of-order toléré selon contrats réels;
- activity auto-open/close et préférence manuelle;
- erreur visible groupe replié;
- capsule ne revendique pas test/review sans preuve;
- usage attaché au bon turn après reload;
- fichiers ouverts depuis capsule;
- revert/snapshot garde son garde-fou non destructif;
- composer Enter/Shift+Enter/IME;
- menu provider/modèle/effort et permissions au clavier;
- attachments idempotents et suppression;
- send/stop double clic;
- reconnect sans listener/turn dupliqué;
- thread changé pendant running.

Éviter les snapshots géants; tester le contenu, les rôles, l'état, le focus et les
callbacks. Ajouter E2E seulement pour les traversées multi-composants.

## QA visuelle

Captures déterministes à 1512×883 dark/light, 1280×800 et 800×600 :

- tour simple texte;
- tour riche outils + fichiers + tests;
- running;
- error;
- composer avec six contextes et nom long;
- code/Mermaid/tableau;
- historique incomplet.

Critères de revue : demande/réponse distinguables sans couleur excessive;
activité secondaire mais observable; capsule lisible en scan; composer reste le
point d'action principal; un seul accent orange fort.

## Verification

```bash
npm run test:frontend
npm run test:sidecar
npx tsc --noEmit
npx vite build
npm run verify
npm run verify:e2e
```

Puis protocole `AGENTS.md` et vrais tours Claude, Codex, OpenAI API et autre
provider disponible. Vérifier streaming, outils, attachment galerie, modèle,
effort, permissions, stop, steering, reload historique, review, revert, thème et
petite fenêtre.

## Done criteria

- [ ] Matrice event/provider documentée et respectée.
- [ ] Tour structuré en demande, activité, réponse et résultat.
- [ ] Aucun signal de réussite scientifique ou technique inventé.
- [ ] ActivityGroup reste inspectable sans dominer le fil.
- [ ] Capsule repose uniquement sur des données attribuables au tour.
- [ ] Composer expose l'essentiel et résume les options avancées.
- [ ] Tous les contrats provider/permissions/attachments/goals sont préservés.
- [ ] Tests couvrent streaming, historique, erreur, focus et idempotence.
- [ ] Vrais parcours multi-provider passent dans l'app buildée.

## STOP conditions

- Le contrat 025 ne permet pas d'attribuer event/usage au bon turn.
- La capsule exige une nouvelle forme d'événement sidecar.
- Une option de permission deviendrait moins explicite ou moins sûre.
- Le refactor 015 n'est pas terminé et le travail revient dans le mega Chat.
- Une vraie régression historique/streaming apparaît.
- L'amélioration visuelle exige de modifier le protocole; créer un plan séparé.

## Git workflow

Sans instruction, pas de commit/push. Si autorisé : branche
`fable/020-chat-composer`; commits séparés pour Activity/turn anatomy,
ResultCapsule et composer. Aucun changement provider/sidecar dans ces commits.
