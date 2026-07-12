# Plan 001: Isoler les sessions Quick Ask (une session Claude par qaId, outils utilisables)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat fe78ede..HEAD -- sidecar/providers/claude.mjs sidecar/router.mjs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `fe78ede`, 2026-07-07

## Why this matters

Le sidecar garde les sessions Claude **persistantes** dans une Map keyée par `threadId` (`sidecar/providers/claude.mjs:40`). Le handler `quickAsk` (`sidecar/router.mjs:709-731`) appelle le provider avec `threadId: null`. Conséquence : la première Quick Ask crée une session persistante sous la clé `null`, qui **reste ouverte après le `done`**. Toute Quick Ask suivante — même avec un `qaId` différent, donc une conversation censément indépendante — trouve `sessions.get(null)` et **pousse son prompt dans la même conversation Claude** (chemin « steering » de `send()`, `claude.mjs:153-165`). Les réponses sont donc contaminées par le contexte d'une autre Quick Ask, le `sessionId` stocké pour reprise (`ctx.qaSessions`) n'est jamais réellement utilisé, et l'utilisateur ne peut pas faire confiance aux réponses.

Second défaut du même chemin : `quickAsk` passe `permissionMode: "default"` sans `onPermissionRequest`. Dans `claude.mjs`, `canUseTool` n'est installé **que** si `onPermissionRequest` est fourni (`claude.mjs:201-212`). En mode `default` non interactif, toute demande de permission d'outil est refusée silencieusement : Quick Ask répond « je ne peux pas lire ce fichier » sans que rien ne l'indique.

## Current state

- `sidecar/providers/claude.mjs` — provider Claude Agent SDK ; sessions streaming persistantes.
  - Ligne 40 : `const sessions = new Map(); // threadId -> {push, q, onEvent, close}`
  - Lignes 153-165 (dans `send()`) :
    ```js
    let s = sessions.get(threadId);
    if (s) {
      // session ouverte : priority native du SDK (now = steer, next = queue) ;
      s.onEvent = onEvent;
      ...
      s.push(userMsg(prompt, mode === "queue" ? "next" : "now"));
      return;
    }
    ```
  - Lignes 201-212 : `canUseTool` seulement si `onPermissionRequest` est fourni.
  - Lignes 329-344 : `run()` (compat one-shot) — utilisé par `quickAsk` ; résout au `done` mais **ne ferme pas la session**.
- `sidecar/router.mjs` — routeur WS.
  - Lignes 709-731, case `"quickAsk"` :
    ```js
    const { qaId, prompt, provider = "claude", model, effort } = msg;
    ...
    p.run({
      threadId: null,
      cwd: process.env.HOME,
      prompt,
      sessionId: prev?.sessionId ?? null,
      model: model || undefined,
      effort: effort || undefined,
      permissionMode: "default",
      onEvent: emitQa,
    })
    ```
- Convention repo : sidecar en ESM `.mjs`, commentaires en français, tests vitest à côté du fichier (`sidecar/router.test.mjs` comme modèle — mocks par simple objet `ctx`, `send: (m) => sent.push(m)`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Tests sidecar | `cd sidecar && npx vitest run` | tous verts |
| Typecheck front (non touché, garde-fou) | `npx tsc --noEmit` | exit 0 |

## Scope

**In scope** (seuls fichiers modifiables) :
- `sidecar/router.mjs` (case `quickAsk` uniquement)
- `sidecar/providers/claude.mjs` (uniquement si l'option A l'exige — voir Step 1)
- `sidecar/router.test.mjs` (ajout de tests)

**Out of scope** (ne pas toucher) :
- Le chemin `send` des threads normaux (case `"send"` du routeur) — le partage de session par `threadId` y est voulu.
- `src/components/QuickAsk.tsx` — le front est correct ; le bug est côté sidecar.
- Les providers codex/grok/opencode.

## Git workflow

- Brancher : `advisor/001-quickask-session-isolation`
- Style de message : conventionnel français, ex. `fix(sidecar): sessions Quick Ask isolées par qaId` (voir `git log --oneline`).
- Ne pas pusher (règle projet : jamais de push sans demande explicite).

## Steps

### Step 1: Keyer la session Quick Ask par qaId au lieu de null

Dans `sidecar/router.mjs`, case `"quickAsk"` : remplacer `threadId: null` par une clé unique et stable par Quick Ask, dérivée du `qaId` :

```js
threadId: `qa:${qaId}`,
```

Ainsi chaque fenêtre Quick Ask a sa propre session persistante dans la Map du provider, le steering d'une Quick Ask en cours continue de marcher (même `qaId` → même session), et deux Quick Ask distinctes ne se contaminent plus. Le `sessionId: prev?.sessionId ?? null` existant continue de servir à reprendre après un redémarrage du sidecar.

Aucune modification de `claude.mjs` n'est nécessaire pour cette étape (option A retenue : la Map accepte n'importe quelle clé string).

**Verify**: `cd sidecar && npx vitest run` → tous les tests existants passent.

### Step 2: Fermer la session Quick Ask à la fin du tour

Toujours dans la case `"quickAsk"` : après le `.then(({ sessionId }) => …)`, fermer la session persistante pour ne pas accumuler des process CLI Claude ouverts pour des popups éphémères. Ajouter dans le `.then` et le `.catch` :

```js
ctx.providers?.claude?.endSession?.(`qa:${qaId}`);
```

(`endSession` existe déjà : `sidecar/providers/claude.mjs:58-64`.) La conversation reste reprenables via le `sessionId` stocké dans `ctx.qaSessions` (chemin `resume` déjà en place).

Attention : ne fermer que si `provider === "claude"` ou via l'optional chaining ci-dessus (les autres providers n'ont pas de session persistante sous cette clé).

**Verify**: `cd sidecar && npx vitest run` → verts.

### Step 3: Permettre les outils en Quick Ask sans prompt de permission fantôme

Dans la case `"quickAsk"`, remplacer `permissionMode: "default"` par :

```js
permissionMode: "bypassPermissions",
```

Justification à mettre en commentaire (en français, style du fichier) : en mode `default` sans relais `canUseTool`, le SDK refuse silencieusement toute permission — Quick Ask répondait sans jamais pouvoir lire un fichier. Quick Ask tourne dans `process.env.HOME` comme les threads normaux qui utilisent déjà `bypassPermissions` par défaut (`claude.mjs:185`), donc pas d'élévation de risque nouvelle.

Si le propriétaire préfère un Quick Ask strictement sans outils, l'alternative est `permissionMode: "plan"` — mais `bypassPermissions` est le choix cohérent avec le reste de l'app. Ne pas implémenter les deux ; prendre `bypassPermissions`.

**Verify**: `grep -n "permissionMode" sidecar/router.mjs` → la case quickAsk montre `bypassPermissions`, la case `send` est inchangée.

### Step 4: Tests

Ajouter dans `sidecar/router.test.mjs` un bloc `describe("quickAsk")` sur le modèle des tests existants (mocks objet, pas de vrai SDK) :

1. **Clé de session par qaId** : provider mock `claude` dont `run` enregistre les `threadId` reçus ; deux `route({type:"quickAsk", qaId:"a"…})` et `qaId:"b"` → `run` appelé avec `qa:a` puis `qa:b` (jamais `null`).
2. **Fermeture en fin de tour** : le mock `run` résout `{sessionId:"1234…"}` ; vérifier que `endSession` du mock est appelé avec `qa:a`.
3. **Permission mode** : vérifier que `run` reçoit `permissionMode: "bypassPermissions"`.

**Verify**: `cd sidecar && npx vitest run` → tous verts, incluant les 3 nouveaux.

## Done criteria

- [ ] `cd sidecar && npx vitest run` exit 0, ≥3 nouveaux tests quickAsk
- [ ] `grep -n "threadId: null" sidecar/router.mjs` → aucun résultat dans la case quickAsk
- [ ] `grep -n 'permissionMode: "default"' sidecar/router.mjs` → aucun résultat
- [ ] `git status` : seuls `sidecar/router.mjs`, `sidecar/router.test.mjs` (et éventuellement `plans/README.md`) modifiés
- [ ] Ligne de statut mise à jour dans `plans/README.md`

## STOP conditions

- Les extraits de « Current state » ne correspondent plus au code (drift).
- `endSession` n'existe plus ou a changé de signature dans `claude.mjs`.
- Un test existant du routeur casse et la cause n'est pas évidente après une tentative de correction.
- La correction semble exiger de modifier `src/components/QuickAsk.tsx` — stop et rapporter (le contrat `qaEvent`/`qaId` ne doit pas changer).

## Maintenance notes

- Si un jour Quick Ask permet de choisir le provider Codex, la clé `qa:${qaId}` doit rester : le chemin `run` de Codex n'a pas de Map de sessions mais le `threadId` sert aux logs.
- À surveiller en review : que le steering d'une Quick Ask en cours (retaper pendant que ça stream) marche toujours — même `qaId` → même session tant que le tour n'est pas fini.
- Reporté hors plan : un bouton Stop pour Quick Ask (nécessiterait `interrupt(qa:${qaId})` + un message WS dédié).
