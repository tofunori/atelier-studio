# Plan 043 : Purger la file d'envoi (croissance non bornée) et arrêter la reconnexion sur token révoqué

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 12e1a04..HEAD -- mobile/src/transport/sendQueue.ts mobile/src/transport/useNetworkSession.ts mobile/src/transport/networkMachine.ts mobile/src/chat/ChatScreen.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `12e1a04`, 2026-07-16

## Why this matters

Deux fuites de ressources dans le transport de l'app iOS :

1. **File d'envoi non bornée** : `purgeDurable` existe mais n'est appelé nulle part — chaque message jamais envoyé reste pour toujours dans `atelier.sendQueue.v1`, et chaque nouvelle écriture resérialise TOUTE la file en JSON vers le secure storage. Sur une installation vivante : stockage, CPU et mémoire croissent linéairement avec l'historique d'envois. Aggravation : le chemin de chargement initial de `ChatScreen` ne marque jamais les items `durable`, donc après un remount les lignes restent bloquées en `acked` à vie.
2. **Reconnexion infinie sur 401** : un token révoqué/expiré déclenche une boucle `connecting ↔ auth_expired` sans fin (backoff plafonné à 30 s), avec bannière qui clignote et batterie/réseau gaspillés sur un état que seul un ré-appairage peut résoudre. La machine réseau protège déjà `version_incompatible` de cette boucle — pas `auth_expired`.

## Current state

- `mobile/src/transport/sendQueue.ts` (147 lignes) — file idempotente pure. Statuts : `pending_local | inflight | acked | durable | failed`. La purge existe, jamais appelée (grep sur `src/` : une seule occurrence, la définition) :

```ts
// sendQueue.ts:125-130
export function purgeDurable(q: SendQueueState, maxKeep = 50): SendQueueState {
  const durable = q.items.filter((x) => x.status === "durable");
  if (durable.length <= maxKeep) return q;
  const drop = new Set(durable.slice(0, durable.length - maxKeep).map((x) => x.clientRequestId));
  return { items: q.items.filter((x) => !drop.has(x.clientRequestId)) };
}
```

- `mobile/src/transport/useNetworkSession.ts` — chaque mise à jour resérialise tout (`:51-60`) :

```ts
  const setSendQueue = useCallback(
    (q: SendQueueState | ((prev: SendQueueState) => SendQueueState)) => {
      setSendQueueState((prev) => {
        const next = typeof q === "function" ? q(prev) : q;
        void secureSet(SEND_QUEUE_STORAGE_KEY, serializeQueue(next));
        return next;
      });
    },
    [],
  );
```

  et l'auto-reconnexion ne distingue pas la cause de l'état `offline` (`:174-182`) :

```ts
  // auto-start reconnect when offline
  useEffect(() => {
    if (net.state === "offline" && opts.paired && isDocumentVisible()) {
      controllerRef.current?.start();
    }
    if (net.state === "live") {
      controllerRef.current?.stop();
      controllerRef.current?.resetBackoff();
    }
  }, [net.state, opts.paired]);
```

- `mobile/src/transport/networkMachine.ts` — `AUTH_FAIL` met `state:"offline"`, `uiReason:"auth_expired"` (`:95-101`) ; `AUTH_OK` remet `uiReason:"none"` (`:94`) — d'où le clignotement pendant la boucle. `START_CONNECT`/`GO_ONLINE` protègent déjà `version_incompatible` (`:84-92`) :

```ts
    case "START_CONNECT":
    case "GO_ONLINE":
      if (ctx.uiReason === "version_incompatible") return ctx;
      return {
        ...ctx,
        state: "connecting",
        lastError: null,
        uiReason: ctx.uiReason === "tailscale_missing" ? "none" : ctx.uiReason,
      };
```

  Cycle constaté : effet auto-start → `ReconnectController` → `tryConnect` (`useNetworkSession.ts:70-117`) → probe OK → `AUTH_OK` (efface la raison) → `listThreads` 401 → `AUTH_FAIL` → offline/auth_expired → l'effet redémarre le contrôleur, indéfiniment.

- `mobile/src/chat/ChatScreen.tsx` — `applyEvents` (`:148-163`) marque bien les items `durable` quand un événement `user` porte un `messageId` :

```ts
  const applyEvents = useCallback(
    (events: WireLikeEvent[], mode: "replace" | "delta") => {
      if (mode === "replace") {
        store.loadHistory(events);
      } else {
        for (const ev of events) store.pushEventsImmediate([ev]);
      }
      // durable acks for queue
      for (const ev of events) {
        if (ev.kind === "user" && ev.meta?.messageId) {
          p.setSendQueue((q) => markDurableByMessageId(q, String(ev.meta!.messageId)));
        }
      }
    },
    [store.loadHistory, store.pushEventsImmediate, p.setSendQueue],
  );
```

  …mais l'effet de **chargement initial** (`:220-281`) contourne `applyEvents` et appelle directement `store.loadHistory(...)` (lignes 229, 243, 250, 264) et `store.pushEventsImmediate(...)` (ligne 257) — aucun `markDurableByMessageId` sur ce chemin.

- Tests existants servant de modèles : `mobile/src/transport/sendQueue.test.ts`, `mobile/src/transport/networkMachine.test.ts` (contient déjà `it("auth fail → auth_expired phase")`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests transport | `cd mobile && npx vitest run src/transport` | tous verts |
| Suite complète | `cd mobile && npm test` | tous verts |
| Typecheck | `cd mobile && npm run typecheck` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `mobile/src/transport/sendQueue.ts` + `sendQueue.test.ts`
- `mobile/src/transport/networkMachine.ts` + `networkMachine.test.ts`
- `mobile/src/transport/useNetworkSession.ts`
- `mobile/src/chat/ChatScreen.tsx` (uniquement l'effet de chargement initial, lignes ~220-281)

**Out of scope** (do NOT touch, even though they look related):
- `reconnectController.ts`, `backoff.ts` — le contrôleur et le backoff sont corrects ; le fix est dans la *condition de démarrage*.
- `gatewayClient.ts`, `syncEngine.ts` — rien à changer ici.
- La gestion du re-pair UI (`PairingScreen.tsx`) — le déblocage passe par `refresh()` existant (foreground / action utilisateur), pas par un nouveau bouton.

## Git workflow

- Branche : `advisor/043-send-queue-purge-and-auth-stop`
- Un commit par volet (purge / auth) ; messages style repo.
- Ne pas pusher ni ouvrir de PR sans instruction de l'opérateur.

## Steps

### Step 1 : Étendre la purge aux statuts terminaux

Dans `sendQueue.ts`, remplacer `purgeDurable` par une purge des statuts terminaux (`durable` + `acked` anciens), en conservant l'export existant :

```ts
/** Purge terminal rows: keep the most recent `maxKeep` durable rows; drop
 * acked rows older than `ackedTtlMs` (gateway accepted but journal ack lost —
 * safe to drop, resend is idempotent server-side). Never touches
 * pending_local / inflight / failed. */
export function purgeDurable(
  q: SendQueueState,
  maxKeep = 50,
  ackedTtlMs = 24 * 60 * 60 * 1000,
  now = Date.now(),
): SendQueueState {
  const durable = q.items.filter((x) => x.status === "durable");
  const dropDurable = new Set(
    durable.length > maxKeep
      ? durable.slice(0, durable.length - maxKeep).map((x) => x.clientRequestId)
      : [],
  );
  const items = q.items.filter(
    (x) =>
      !dropDurable.has(x.clientRequestId) &&
      !(x.status === "acked" && now - x.updatedAt > ackedTtlMs),
  );
  return items.length === q.items.length ? q : { items };
}
```

Préserver la propriété « retourne la même référence si rien à purger » (les tests d'identité en dépendent).

**Verify**: `cd mobile && npx vitest run src/transport/sendQueue.test.ts` → verts (tests existants inchangés).

### Step 2 : Brancher la purge sur chaque persistance

Dans `useNetworkSession.ts:51-60`, appliquer la purge avant de persister :

```ts
      setSendQueueState((prev) => {
        const next = purgeDurable(typeof q === "function" ? q(prev) : q);
        void secureSet(SEND_QUEUE_STORAGE_KEY, serializeQueue(next));
        return next;
      });
```

Ajouter `purgeDurable` à l'import depuis `./sendQueue.ts`.

**Verify**: `cd mobile && npm run typecheck` → exit 0.

### Step 3 : Marquer durable sur le chemin de chargement initial

Dans l'effet de chargement initial de `ChatScreen.tsx` (`:220-281`), router l'application des événements par `applyEvents` au lieu des appels directs au store :

- ligne 229 `store.loadHistory(cache.events)` → `applyEvents(cache.events, "replace")`
- ligne 243 `store.loadHistory(result.events)` → `applyEvents(result.events, "replace")`
- ligne 250 et 264 `store.loadHistory(full.events as WireLikeEvent[])` → `applyEvents(full.events as WireLikeEvent[], "replace")`
- ligne 257 `for (const ev of result.events) store.pushEventsImmediate([ev]);` → `applyEvents(result.events, "delta")`

`applyEvents` est déclaré plus haut dans le même composant (`:148`) et est stable (useCallback). L'effet garde son `eslint-disable-next-line react-hooks/exhaustive-deps` existant — ne pas ajouter `applyEvents` aux deps (il se recrée seulement si le store change d'identité de fonctions, ce qui n'arrive pas).

**Verify**: `cd mobile && npx vitest run src/chat` → verts ; typecheck exit 0.

### Step 4 : Ne plus auto-reconnecter sur `auth_expired`

1. Dans `networkMachine.ts`, ajouter un helper pur exporté :

```ts
/** L'auto-reconnexion ne doit jamais boucler sur un état que seul
 * l'utilisateur peut résoudre (re-pair / mise à jour). */
export function shouldAutoReconnect(ctx: NetworkContext, paired: boolean, visible: boolean): boolean {
  return (
    ctx.state === "offline" &&
    paired &&
    visible &&
    ctx.uiReason !== "auth_expired" &&
    ctx.uiReason !== "version_incompatible"
  );
}
```

2. Dans `useNetworkSession.ts:174-182`, utiliser le helper :

```ts
  useEffect(() => {
    if (shouldAutoReconnect(net, opts.paired, isDocumentVisible())) {
      controllerRef.current?.start();
    }
    if (net.state === "live") {
      controllerRef.current?.stop();
      controllerRef.current?.resetBackoff();
    }
  }, [net.state, net.uiReason, opts.paired]);
```

  (noter l'ajout de `net.uiReason` aux deps). Comportement conservé : `refresh()` — déclenché par foreground, retour réseau, changement de credentials ou action utilisateur — tente toujours UNE connexion directe même en `auth_expired` (`useNetworkSession.ts:132-136` appelle `tryConnectRef.current` sans passer par le contrôleur), donc un ré-appairage réussi se débloque tout seul. Seule la boucle de fond s'arrête.

**Verify**: `cd mobile && npx vitest run src/transport/networkMachine.test.ts` → verts.

## Test plan

- `sendQueue.test.ts` (modèle : cas existants du fichier) :
  1. purge garde les 50 durable les plus récents, supprime les plus anciens ;
  2. purge supprime un `acked` plus vieux que le TTL (passer `now` explicite), garde un `acked` récent ;
  3. purge ne touche jamais `pending_local` / `inflight` / `failed` ;
  4. purge retourne la même référence quand rien n'est à purger.
- `networkMachine.test.ts` (modèle : `it("auth fail → auth_expired phase")`) :
  5. `shouldAutoReconnect` faux après `AUTH_FAIL` (offline + auth_expired) ;
  6. faux après `VERSION_INCOMPATIBLE` ; vrai après `GO_OFFLINE` simple (offline + uiReason none) ; faux si `paired === false` ou `visible === false`.
- Vérification : `cd mobile && npm test` → tous verts, ≥ 6 nouveaux tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd mobile && npm test` exit 0, ≥ 6 nouveaux tests présents
- [ ] `cd mobile && npm run typecheck` exit 0
- [ ] `grep -c "purgeDurable" mobile/src/transport/useNetworkSession.ts` ≥ 1 (la purge est branchée)
- [ ] `grep -c "shouldAutoReconnect" mobile/src/transport/useNetworkSession.ts` ≥ 1
- [ ] `grep -n "store.loadHistory(cache.events)" mobile/src/chat/ChatScreen.tsx` → 0 occurrence (chemin initial routé par applyEvents)
- [ ] `git status` : seuls les fichiers in-scope (et `plans/README.md`) modifiés

## STOP conditions

Stop and report back (do not improvise) if:

- Les extraits « Current state » ne correspondent plus (drift).
- Le Step 3 casse un test de `ChatScreen`/scroll : `applyEvents` sur le chemin initial a un effet de bord non anticipé (ex. double `markDurable` inoffensif attendu, mais un test qui compte les appels à `setSendQueue` échouerait) — reporter avec le test exact.
- Après le Step 4, un test existant attend l'auto-reconnexion post-401 (le comportement était peut-être verrouillé quelque part) — reporter au lieu d'affaiblir le helper.
- Le fix semble exiger de modifier `reconnectController.ts` — hors scope.

## Maintenance notes

- Quand le push temps réel (WS/SSE — finding DIR-01, non planifié) remplacera le poll, la condition `shouldAutoReconnect` devra couvrir aussi la reprise du canal push — la garder dans `networkMachine.ts` (pur, testé) et non dans le hook.
- Le TTL `acked` de 24 h suppose l'idempotence serveur des sends (vraie aujourd'hui : `clientRequestId` rejoué → `replay:true` côté gateway). Si cette garantie change, revoir la purge des `acked`.
- Reviewer : vérifier que la purge est bien appliquée *avant* la sérialisation (sinon la fuite persiste sur disque) et que `refresh()` reste le chemin de déblocage après ré-appairage.
