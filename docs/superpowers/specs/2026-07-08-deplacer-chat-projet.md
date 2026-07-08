# Déplacer un chat vers un autre projet

Date : 2026-07-08 · Validé par Thierry · Implémentation : Sonnet 5 xhigh

## Contexte

Un thread = `{id, projectRoot, provider, sessionId, title, status…}` dans le
store JSON du sidecar (`sidecar/store.mjs`, `upsert` existant). La sidebar
filtre par `projectRoot`. Déplacer = réécrire ce champ + gérer les effets de
bord (historique après redémarrage, reprise de session, cwd des tours suivants).

## Backend (sidecar)

### 1. Nouveau case ws `moveThread` (`router.mjs`)

`{type:"moveThread", threadId, projectRoot}` — s'inspirer des cases
`renameThread` (l.708) / `deleteThread` (l.690) :
- thread introuvable → `{type:"error", message}` ;
- `status === "running"` → refuser avec une erreur claire (« chat en cours
  d'exécution — attendre la fin du tour ») : changer le cwd au milieu d'un
  tour est dangereux ;
- cible identique au projectRoot actuel → no-op silencieux ;
- sinon `ctx.store.upsert({id: threadId, projectRoot: <cible>})` puis
  broadcast `{type:"threads", threads: ctx.store.list()}` (même pattern que
  rename).
- Ne PAS valider que la cible existe sur disque au-delà d'un
  `typeof === "string" && path absolu` : la liste des projets vit côté front.

### 2. Recherche d'historique par sessionId, globale (le point clé)

Après déplacement, les lookups d'historique par projectRoot pointent au
mauvais endroit. Ajouter un repli « recherche par id partout » :

- **Claude** (`history.mjs` `claudeHistory(sessionId, cwd)` l.73, qui délègue
  à `getSessionMessages(sessionId, {dir})`) : si le fichier
  `<sessionId>.jsonl` est introuvable dans le slug du cwd fourni, scanner
  `~/.claude/projects/*/<sessionId>.jsonl` (le nom de fichier EST le
  sessionId — lookup direct par répertoire, pas de lecture de contenu) et
  utiliser le premier trouvé. Regarder l'implémentation de
  `getSessionMessages` et placer le repli au niveau le plus naturel.
- **Grok** (`sessions.mjs` `grokHistory(sessionId, projectRoot)`) : si
  `~/.grok/sessions/<encode(projectRoot)>/<sessionId>/chat_history.jsonl`
  n'existe pas, scanner `~/.grok/sessions/*/<sessionId>/chat_history.jsonl`.
  Même repli dans `listSessions` n'est PAS requis (hors scope).
- **Codex** : `codexHistory` scanne déjà globalement `~/.codex/sessions` par
  id — rien à faire (le noter en commentaire du case moveThread).

### 3. Reprise de session Grok après déplacement (`providers/grok.mjs`)

`openGrokSession` fait `session/load {sessionId, cwd}` avec le NOUVEAU cwd ;
si grok refuse (session inconnue sous ce cwd), aujourd'hui l'erreur devient
`handshakeFailure` → repli silencieux vers l'ancien chemin one-shot streaming
(dégradation invisible). Corriger : si `session/load` échoue alors que le
process ACP est sain, retomber sur `session/new` (nouveau sessionId, contexte
modèle frais) au lieu de basculer en legacy — l'utilisateur garde son
historique affiché et la conversation continue. Sonder d'abord (probe
protocolaire sans appel modèle, cf. scripts dans
scratchpad grok-acp-verify/probe_load.py) si `session/load` avec un cwd
différent de l'origine marche — si OUI, ne rien changer et le documenter en
commentaire ; si NON, appliquer le repli session/new. Claude reprend par
sessionId indépendamment du cwd (aucun changement).

## Frontend

### 4. Entrée de menu « Déplacer vers… »

Dans le menu contextuel des threads de `Sidebar.tsx` (pattern `ctx-menu`
existant, voir les onContextMenu l.415-506) : entrée « Déplacer vers… » qui
ouvre un sous-menu (ou second panneau du même ctx-menu) listant les projets
du rail SAUF le projet courant du thread. Libellés : nom court du projet
(même source que le rail — `projMeta`/basename du root, regarder comment le
rail affiche les noms). Clic → `ws.send({type:"moveThread", threadId,
projectRoot})` et fermer le menu. Si le menu contextuel de thread existe
aussi dans `Rail.tsx` (flyout chats, l.176-191), ajouter la même entrée aux
deux endroits en factorisant si trivial — sinon Sidebar seulement (la
dupliquer proprement est acceptable).

### 5. Comportement après déplacement (`App.tsx`)

Le broadcast `threads` met à jour la liste. Si le thread déplacé est le
thread actif : suivre le chat — `setActiveProject(<nouveau root>)` (voir
`selectThread`/`newThread` l.1138/1206 pour le pattern). Le thread reste
sélectionné, l'utilisateur « voyage » avec lui.

### 6. i18n

Clés fr/en dans `src/lib/i18n.ts` : `thread.move` (« Déplacer vers… »),
`thread.move-running` (message d'erreur si en cours), et toute clé
nécessaire au sous-menu. Style : sobre, cohérent avec les entrées existantes.

## Design

Réutiliser `.ctx-menu` existant tel quel. Sous-menu : soit un second
`.ctx-menu` positionné à droite, soit remplacement du contenu du menu par la
liste des projets avec une ligne retour « ‹ » — choisir le plus simple qui
reste dans le système (rayons/typo/espacement existants, aucune nouvelle
valeur).

## Tests (obligatoires)

- `router.test.mjs` (ou nouveau fichier) : moveThread — déplacement d'un
  thread idle (store mis à jour + broadcast), refus si running, erreur si
  thread inconnu, no-op si même projectRoot.
- Repli historique : tests avec répertoires temporaires (mkdtemp) pour le
  scan global claude (`~/.claude/projects/*/<id>.jsonl` simulé via un
  paramètre de base dir si nécessaire — rendre le base-dir injectable plutôt
  que de hardcoder homedir dans la nouvelle logique, pour la testabilité)
  et grok (même approche).

## Vérifications finales

`npx tsc --noEmit` (ignorer src/test_auto_review*.ts), `npx vite build`,
`cd sidecar && npx vitest run` tout vert (150 existants + nouveaux).
Pas de commit (démon d'auto-commit en fond : ignorer ses commits « auto: »,
ne jamais lancer git commit soi-même).

## Hors scope

Déplacement multiple, drag-and-drop de threads entre projets, migration des
fichiers de session sur disque (le repli par id rend ça inutile),
`listSessions` global.
