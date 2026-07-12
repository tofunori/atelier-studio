# Plan 002: Garantir qu'un tour Claude se termine toujours par un événement done/error (pas de spinner fantôme, pas de crash sidecar)

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
- **Effort**: M
- **Risk**: MED (touche la boucle d'événements centrale)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `fe78ede`, 2026-07-07

## Why this matters

La fiabilité perçue de l'app (« puis-je me fier au statut et aux résultats ? ») repose sur un invariant : **chaque tour lancé finit par un événement `done` ou `error` atteignant le front**, qui remet le statut du thread à jour. Trois chemins cassent cet invariant aujourd'hui :

1. **Fin d'itérateur sans `result`** : dans `sidecar/providers/claude.mjs:235-325`, la boucle `for await (const msg of q)` peut se terminer proprement sans avoir produit de message `result` (session fermée par `endSession` pendant un tour, CLI qui sort proprement après une erreur interne). Le `finally` nettoie la Map mais **n'émet rien** → le thread reste `status: "running"` dans `threads.json`, spinner fantôme jusqu'au redémarrage du sidecar (le purge de démarrage `index.mjs:100-104` le confirme comme problème connu).
2. **Throw synchrone après le passage en "running"** : dans `sidecar/router.mjs`, case `"send"`, le store passe le thread en `running` (`router.mjs:835-841`) **avant** `p.send(...)`. Si `p.send` lève (ex. `query()` du SDK jette immédiatement), l'exception remonte au `catch` de `index.mjs:610-614` qui envoie `{type:"error"}` — que le front se contente de logger en console (`src/App.tsx:766-767`). Statut jamais remis, aucun message visible.
3. **Rejet non géré dans `onEvent`** : `claude.mjs` appelle `s.onEvent(event)` sans await ni catch (`claude.mjs:255, 270, 303…`), et le `onEvent` du routeur est `async` (`router.mjs:863-888`). Un throw dedans (ex. `store.upsert` sur disque plein, `writeFileAtomic` qui échoue) devient une **unhandled rejection → le process sidecar meurt** (comportement Node par défaut), tuant tous les runs en cours.

## Current state

- `sidecar/providers/claude.mjs` — provider Claude ; sessions streaming persistantes (Map `sessions`, ligne 40).
  - Boucle consommatrice, lignes 235-325 :
    ```js
    (async () => {
      const pendingEdits = new Map();
      try {
        for await (const msg of q) {
          ...
          if (msg.type === "result") {
            s.onEvent({ kind: "done", ok: msg.subtype === "success", result: msg.result ?? "", usage: {...} });
          }
        }
      } catch (e) {
        s.onEvent({ kind: "error", message: String(e) });
      } finally {
        s.close();
        sessions.delete(threadId);
      }
    })();
    ```
    Note : rien ne trace si un `done`/`error` a été émis avant la fin de la boucle.
- `sidecar/router.mjs` — case `"send"`, branche claude :
  - `ctx.store.upsert({ id: threadId, ..., status: "running" })` lignes 835-841, puis `p.send({ ..., onEvent: async (event) => { ... } })` lignes 849-889. Le `onEvent` fait des `await` (`enrichDoneEvent`) et des `store.upsert` ; c'est lui qui remet `status` à `done`/`idle` lignes 873-878.
- `sidecar/index.mjs:610-614` — le catch global de `route()` envoie `{type:"error", threadId, message}` sans toucher au store.
- Conventions : ESM `.mjs`, commentaires français courts, try/catch silencieux (`catch {}`) réservés aux chemins best-effort ; tests vitest à côté (`sidecar/router.test.mjs`, `sidecar/store.test.mjs` comme modèles).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Tests sidecar | `cd sidecar && npx vitest run` | tous verts |
| Typecheck front | `npx tsc --noEmit` | exit 0 (garde-fou, front non touché) |

## Scope

**In scope** :
- `sidecar/providers/claude.mjs` (boucle consommatrice + appels `s.onEvent`)
- `sidecar/router.mjs` (case `"send"` branche claude : filet d'erreur autour de `p.send`)
- `sidecar/claude.test.mjs` (à créer) et/ou `sidecar/router.test.mjs`

**Out of scope** :
- `src/App.tsx` et tout le front — améliorer l'affichage de `{type:"error"}` est un chantier séparé ; ici on garantit seulement que les événements `done`/`error` par-thread partent toujours.
- Les providers codex/grok/opencode (le chemin `run().catch` du routeur les couvre déjà, `router.mjs:940-944`).
- `endSession`/revert : ne pas changer leur sémantique ; le tour interrompu par revert doit finir par un `error` silencieusement absorbable, pas par un nouveau comportement.

## Git workflow

- Branche : `advisor/002-turn-lifecycle-hardening`
- Messages : style repo, ex. `fix(sidecar): événement done/error garanti en fin de tour Claude`
- Ne pas pusher sans demande explicite.

## Steps

### Step 1: Filet « fin de boucle sans résultat » dans claude.mjs

Dans la IIFE consommatrice (`claude.mjs:235-325`) :
1. Déclarer `let sawTerminal = false;` avant le `try`.
2. Passer `sawTerminal = true` juste avant le `s.onEvent({kind:"done", ...})` du bloc `msg.type === "result"` et dans le `catch` avant l'émission de `{kind:"error"}`.
3. Dans le `finally`, avant `s.close()` :
   ```js
   if (!sawTerminal) {
     try { s.onEvent({ kind: "error", message: "session terminée sans résultat (interrompue ou fermée)" }); } catch {}
   }
   ```
   Le routeur traite déjà `kind:"error"` : statut → `idle`, spinner arrêté, notification (`router.mjs:873-878`, `App.tsx:561-577`).

**Verify**: `cd sidecar && npx vitest run` → verts.

### Step 2: Protéger chaque appel à s.onEvent contre les rejets

Dans `claude.mjs`, introduire un helper local dans `send()` juste après la création de `s` :

```js
// onEvent du routeur est async : un rejet non attrapé tuerait le sidecar
const emit = (ev) => { try { Promise.resolve(s.onEvent(ev)).catch(() => {}); } catch {} };
```

Remplacer tous les `s.onEvent(...)` de la boucle consommatrice (et du `catch`/`finally` du Step 1) par `emit(...)`. **Attention** : `s.onEvent` est réassigné à chaque `send()` sur session existante (`claude.mjs:157`) — le helper doit lire `s.onEvent` au moment de l'appel (c'est le cas dans la forme ci-dessus, ne pas capturer la fonction dans une variable).

**Verify**: `grep -n "s.onEvent(" sidecar/providers/claude.mjs` → ne reste que l'affectation `s.onEvent = onEvent` (ligne ~157) et la définition du helper ; tous les sites d'émission passent par `emit`.

### Step 3: Filet autour de p.send dans le routeur

Dans `router.mjs`, case `"send"`, branche claude : entourer l'appel `p.send({...})` d'un `try/catch` qui, en cas de throw synchrone :

```js
} catch (e) {
  ctx.store.upsert({ id: threadId, status: "idle" });
  emit({ type: "event", threadId, event: { kind: "error", message: String(e?.message ?? e) } });
  emit({ type: "threads", threads: ctx.store.list() });
}
```

C'est le miroir exact du `.catch` déjà présent sur le chemin `p.run` des autres providers (`router.mjs:940-944`) — s'y conformer.

**Verify**: `cd sidecar && npx vitest run` → verts.

### Step 4: Tests

Créer `sidecar/claude_lifecycle.test.mjs` (vitest, modèle : `sidecar/router.test.mjs` pour le style mock-objet). Le SDK réel ne doit pas être invoqué : tester via le routeur avec un provider mock, plus un test unitaire du helper si extrait.

1. **Throw synchrone de send** : `route({type:"send", provider:"claude", threadId:"t1", prompt:"x"}, ctx)` avec `ctx.providers.claude.send = () => { throw new Error("boom"); }` et un store réel (`ThreadStore` sur tmpdir, cf. `store.test.mjs`) → le store finit avec `status:"idle"` pour `t1` ET un événement `{kind:"error"}` a été émis.
2. **onEvent qui rejette ne tue pas le process** : provider mock dont `send` appelle `opts.onEvent({kind:"done", ok:true, result:""})` ; faire échouer `ctx.store.upsert` au premier appel (mock) → `route()` ne rejette pas / aucun unhandledRejection (utiliser `process.on("unhandledRejection")` capturé dans le test, ou vérifier simplement que l'await de `route` résout). NB : ce test cible le routeur ; le filet `emit` de claude.mjs (Step 2) n'est testable qu'indirectement — le noter dans le test.
3. Si l'exécuteur préfère tester Step 1 directement : extraire le helper `emit` et la logique `sawTerminal` est acceptable UNIQUEMENT si l'extraction reste dans `claude.mjs` (pas de nouveau fichier partagé).

**Verify**: `cd sidecar && npx vitest run` → tous verts, incluant les nouveaux.

## Done criteria

- [ ] `cd sidecar && npx vitest run` exit 0, ≥2 nouveaux tests lifecycle
- [ ] `grep -c "emit(" sidecar/providers/claude.mjs` ≥ 8 (tous les sites d'émission de la boucle)
- [ ] Un `try/catch` entoure `p.send` dans la branche claude de `router.mjs` et remet `status:"idle"`
- [ ] `npx tsc --noEmit` exit 0
- [ ] `git status` : seuls les fichiers in-scope modifiés
- [ ] Ligne de statut mise à jour dans `plans/README.md`

## STOP conditions

- Les extraits « Current state » ne correspondent plus (drift) — notamment si la boucle consommatrice de `claude.mjs` a été restructurée.
- L'ajout du filet Step 1 fait émettre un `error` **après** un `done` légitime sur un chemin normal (si les tests ou une lecture attentive montrent qu'un tour normal termine la boucle après `result` — c'est le cas ! la boucle continue après un `result` pour les tours suivants de la session). ⚠ Précision cruciale : `sawTerminal` ne doit PAS être un simple booléen « au moins un résultat vu » remis à faux ; comme la session est multi-tours, l'invariant correct est « le DERNIER événement émis avant la fin de la boucle était done ou error ». Implémenter `sawTerminal` comme « le dernier emit était terminal » (le remettre à `false` sur tout événement non-terminal, à `true` sur done/error). Si cette sémantique s'avère impossible à établir proprement, STOP et rapporter.
- Un test existant casse sans cause évidente.

## Maintenance notes

- Tout nouveau `s.onEvent(...)` ajouté plus tard dans `claude.mjs` doit passer par `emit` — à vérifier en review de tout futur diff sur ce fichier.
- Si un jour le front affiche les `{type:"error"}` globaux (bannière), le message du filet Step 1 (« session terminée sans résultat ») apparaîtra lors des reverts pendant un tour — formulation à garder neutre.
- Reporté hors plan : affichage front des erreurs top-level (`src/App.tsx:766` ne fait que `console.error`) ; statut « running » non rétabli quand un message `priority:"next"` enchaîne un second tour (cosmétique).
