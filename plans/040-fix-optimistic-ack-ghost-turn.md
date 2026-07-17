# Plan 040 : Corriger l'ack optimiste qui laisse un turn fantôme et un doublon dans itemOrder

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 12e1a04..HEAD -- mobile/src/chat/store/reducer.ts mobile/src/chat/store/reducer.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (mais 039 branche la CI qui protège ce fix)
- **Category**: bug
- **Planned at**: commit `12e1a04`, 2026-07-16

## Why this matters

Dans l'app iOS companion, **chaque message envoyé avec succès corrompt l'état durable du chat** : le turn local provisoire (`turn-local-<messageId>`) reste dans `turnOrder` avec un `itemIds` pointant vers un item supprimé, et l'id serveur est poussé **deux fois** dans `itemOrder`. Conséquence visible : un `TurnBlock` vide rendu par `Transcript.tsx` pour chaque message envoyé (nœud parasite + hauteur estimée réservée puis effondrée → flicker de layout), et un état interne faux sur lequel s'appuient les scans inverses du reducer et la future virtualisation. Le test existant passe car il n'asserte que « un item user avec le bon texte existe », jamais l'intégrité de `turnOrder`/`itemOrder`.

## Current state

- `mobile/src/chat/store/reducer.ts` — reducer durable du chat (633 lignes), copie sémantique volontaire du reducer desktop (`docs/mobile/ADR-002-ios-ui-runtime.md` : « Un seul reducer pour live et replay »). Deux blocs concernés :

L'action locale crée l'item provisoire sous un turn local (`reducer.ts:510-524`) :

```ts
    case "optimistic_user": {
      const turnId = `turn-local-${action.messageId}`;
      const item: ChatItem = {
        id: `msg:${action.messageId}`,
        turnId,
        kind: "user",
        text: action.text,
        durable: false,
        provisional: true,
        promoted: true,
        ts: Date.now(),
      };
      const d = cloneDurable(state.durable);
      const turn = ensureTurn(d, turnId);
      putItem(d, item, turn);
```

Le ack serveur re-clé l'item mais contre le **mauvais turn** (`reducer.ts:133-166`) — noter que `turn` est ici le turn **serveur** créé par `ensureTurn(next, turnId)` deux lignes plus haut :

```ts
  const next = cloneDurable(d);
  const turnId = turnIdOf(ev);
  const turn = ensureTurn(next, turnId);
  ...
  // optimistic user ack by messageId
  if (kind === "user" && meta?.messageId) {
    const mid = meta.messageId as string;
    const existing = Object.values(next.itemsById).find(
      (it) => it.kind === "user" && it.provisional && it.id === `msg:${mid}`,
    );
    if (existing) {
      const updated: ChatItem = {
        ...existing,
        id: eventId || existing.id,
        eventId,
        sequence: seq,
        provisional: false,
        durable: true,
        text: textOf(ev) || existing.text,
      };
      // re-key if eventId different
      if (updated.id !== existing.id) {
        delete next.itemsById[existing.id];
        next.itemOrder = next.itemOrder.map((x) => (x === existing.id ? updated.id : x));
        turn.itemIds = turn.itemIds.map((x) => (x === existing.id ? updated.id : x));
      }
      putItem(next, updated, turn);
      return next;
    }
  }
```

**Trace du bug** (avec le fixture du test existant `reducer.test.ts:45-66` : optimistic `m1` puis ack `eventId:"server-u"`, `turnId:"turn-1"`) :
1. `existing.id === "msg:m1"` vit dans `turn-local-m1.itemIds`, PAS dans `turn-1.itemIds` → le `turn.itemIds.map(...)` est un no-op sur le turn serveur, et `turn-local-m1.itemIds` garde `["msg:m1"]` (item supprimé).
2. `putItem(next, updated, turn)` (`reducer.ts:74-87`) voit `isNew === true` (l'id `server-u` n'est pas dans `itemsById` car seul `msg:m1` a été supprimé) → il **push** `server-u` dans `itemOrder`… qui contient déjà `server-u` via le `map` de re-clé.
3. Résultat : `itemOrder === ["server-u","server-u"]`, `turnOrder === ["turn-local-m1","turn-1"]` avec `turn-local-m1` orphelin, et `updated.turnId` vaut toujours `"turn-local-m1"` (le spread de `existing` conserve l'ancien turnId).

- `mobile/src/chat/Transcript.tsx:45` rend un `TurnBlock` par entrée de `turnOrder` (`store.turnOrder.map(...)`) → le turn orphelin devient un bloc vide permanent.
- `putItem` (`reducer.ts:74-87`) :

```ts
function putItem(d: DurableThreadState, item: ChatItem, turn: TurnEntity): void {
  const isNew = !d.itemsById[item.id];
  d.itemsById[item.id] = item;
  if (isNew) {
    d.itemOrder.push(item.id);
    turn.itemIds = [...turn.itemIds, item.id];
    d.turnsById[turn.turnId] = { ...turn };
  } else {
    d.turnsById[turn.turnId] = { ...turn };
  }
  if (item.sequence && item.sequence > d.lastSequence) {
    d.lastSequence = item.sequence;
  }
}
```

- Convention repo : reducer pur, retourne la même référence sur no-op, mutations uniquement sur le clone local (`cloneDurable`). Tests dans `mobile/src/chat/store/reducer.test.ts` (vitest, helpers `meta(seq, eventId, turnId)` en tête de fichier — les réutiliser).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests reducer seulement | `cd mobile && npx vitest run src/chat/store/reducer.test.ts` | tous verts |
| Suite mobile complète | `cd mobile && npm test` | ~101+ tests verts |
| Typecheck | `cd mobile && npm run typecheck` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `mobile/src/chat/store/reducer.ts` (uniquement la branche ack `kind === "user" && meta?.messageId`, lignes ~141-166)
- `mobile/src/chat/store/reducer.test.ts` (nouveaux cas)

**Out of scope** (do NOT touch, even though they look related):
- `putItem`, `cloneDurable`, `ensureTurn` et toutes les autres branches du reducer — le plan 041 (perf) les retravaille ; ne pas créer de conflit.
- `mobile/src/chat/Transcript.tsx`, `TurnBlock.tsx` — le rendu est correct, c'est l'état qui est faux.
- Le reducer desktop (`src/lib/harnessEvents.ts`) — le desktop n'a pas de turn local optimiste de cette forme ; ne rien y « synchroniser ».

## Git workflow

- Branche : `advisor/040-fix-optimistic-ack-ghost-turn`
- Commits par étape logique, messages style repo (ex. `fix(mobile): migrer l'item optimiste vers le turn serveur au ack`).
- Ne pas pusher ni ouvrir de PR sans instruction de l'opérateur.

## Steps

### Step 1 : Test rouge d'abord — caractériser le bug

Dans `reducer.test.ts`, ajouter un cas dans le describe existant (réutiliser le helper `meta`) :

```ts
  it("ack migre l'item provisoire dans le turn serveur sans doublon ni turn fantôme", () => {
    let s = emptyThreadState("t");
    s = reduceChat(s, { type: "optimistic_user", messageId: "m1", text: "Bonjour", clientRequestId: "c1" });
    s = reduceChat(s, {
      type: "event",
      event: { kind: "user", text: "Bonjour", meta: { ...meta(1, "server-u"), messageId: "m1", turnId: "turn-1" } },
    });
    expect(s.durable.itemOrder).toEqual(["server-u"]);
    expect(s.durable.turnOrder).toEqual(["turn-1"]);
    expect(s.durable.turnsById["turn-local-m1"]).toBeUndefined();
    expect(s.durable.turnsById["turn-1"].itemIds).toEqual(["server-u"]);
    expect(s.durable.itemsById["server-u"].turnId).toBe("turn-1");
    expect(s.durable.itemsById["server-u"].provisional).toBe(false);
  });
```

**Verify**: `cd mobile && npx vitest run src/chat/store/reducer.test.ts` → ce nouveau test **échoue** (itemOrder doublé, turn fantôme présent), les autres passent.

### Step 2 : Réécrire la branche ack

Remplacer le corps du bloc `if (kind === "user" && meta?.messageId) { ... }` (`reducer.ts:141-166`) par une migration complète, avec lookup direct O(1) (l'id provisoire est déterministe) :

```ts
  // optimistic user ack by messageId
  if (kind === "user" && meta?.messageId) {
    const mid = meta.messageId as string;
    const provisionalId = `msg:${mid}`;
    const existing = next.itemsById[provisionalId];
    if (existing && existing.kind === "user" && existing.provisional) {
      const localTurnId = existing.turnId;
      const newId = eventId || existing.id;
      const updated: ChatItem = {
        ...existing,
        id: newId,
        turnId,
        eventId,
        sequence: seq,
        provisional: false,
        durable: true,
        text: textOf(ev) || existing.text,
      };
      // retirer l'item du turn local et supprimer le turn local devenu vide
      if (localTurnId !== turnId) {
        const localTurn = next.turnsById[localTurnId];
        if (localTurn) {
          const remaining = localTurn.itemIds.filter((x) => x !== existing.id);
          if (remaining.length === 0) {
            delete next.turnsById[localTurnId];
            next.turnOrder = next.turnOrder.filter((x) => x !== localTurnId);
          } else {
            next.turnsById[localTurnId] = { ...localTurn, itemIds: remaining };
          }
        }
      }
      // re-clé sans double insertion (ne PAS passer par putItem ici)
      delete next.itemsById[existing.id];
      next.itemsById[newId] = updated;
      next.itemOrder = next.itemOrder.map((x) => (x === existing.id ? newId : x));
      if (!turn.itemIds.includes(newId)) {
        turn.itemIds = [...turn.itemIds, newId];
      }
      next.turnsById[turn.turnId] = { ...turn };
      if (seq && seq > next.lastSequence) next.lastSequence = seq;
      return next;
    }
  }
```

Points de vigilance :
- `turnId` (serveur) et `turn` viennent des lignes existantes juste au-dessus (`turnIdOf(ev)` / `ensureTurn`), ne pas les redéclarer.
- Cas `eventId` absent : `newId === existing.id`, le `map` est un no-op, le `delete`+réinsertion sur le même id est inoffensif, et l'append dans `turn.itemIds` migre quand même l'item — c'est voulu.
- Conserver le comportement : si l'item provisoire n'existe pas (message venu d'un autre appareil), on tombe dans le chemin générique plus bas — inchangé.

**Verify**: `cd mobile && npx vitest run src/chat/store/reducer.test.ts` → **tous** les tests passent, y compris celui du Step 1 et l'ancien `optimistic user then ack`.

### Step 3 : Suite complète + typecheck

**Verify**: `cd mobile && npm test` → ~102+ verts, 0 rouge. `cd mobile && npm run typecheck` → exit 0.

## Test plan

- Nouveau test du Step 1 (régression du bug exact).
- Ajouter un second cas : **double ack** (deux événements `user` avec le même `messageId` mais des `eventId` différents `server-u` puis `server-u2`) → après le premier ack l'item n'est plus `provisional`, le second événement suit le chemin générique ; asserter qu'il n'y a **pas** de crash et que `turnOrder` reste `["turn-1"]`. (Comportement actuel : un second item user peut apparaître — c'est le comportement pré-existant, l'asserter tel quel pour le caractériser.)
- Modèle structurel : les `it()` existants de `reducer.test.ts` (helpers `meta`, `emptyThreadState`).
- Vérification : `cd mobile && npx vitest run src/chat/store/reducer.test.ts` → tous verts.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd mobile && npm test` exit 0
- [ ] `cd mobile && npm run typecheck` exit 0
- [ ] Le test « ack migre l'item provisoire… » existe et passe
- [ ] `grep -n "Object.values(next.itemsById).find" mobile/src/chat/store/reducer.ts` ne matche plus dans la branche user-ack (les occurrences tool_update/interaction restent — plan 041)
- [ ] `git status` : seuls `reducer.ts`, `reducer.test.ts` (et `plans/README.md`) modifiés
- [ ] Ligne de statut mise à jour dans `plans/README.md`

## STOP conditions

Stop and report back (do not improvise) if:

- Les extraits « Current state » ne correspondent plus au code (drift — notamment si le plan 041 est passé avant celui-ci).
- Le test existant `optimistic user then ack` (`reducer.test.ts:45`) échoue après le Step 2 et la cause n'est pas une assertion devenue plus stricte.
- Le fix semble exiger de modifier `putItem` ou `cloneDurable` — hors scope, c'est le territoire du plan 041.
- Un test hors `reducer.test.ts` casse (ex. tests de scroll/presentation) — le comportement observable a changé plus que prévu.

## Maintenance notes

- Le plan 041 (perf reducer) retravaille les scans `Object.values(...).find` restants et le clonage — il doit être exécuté **après** ce plan et re-passer ces tests.
- Reviewer : vérifier qu'aucun chemin ne peut plus laisser un id présent deux fois dans `itemOrder` (c'est l'invariant que le nouveau test verrouille).
- Suivi différé : le cas « second ack avec eventId différent » crée un doublon visuel potentiel (comportement pré-existant, hérité du desktop) — à traiter si observé en réel.
