# Plan 041 : Rendre le reducer chat O(N) au chargement et alléger le coût par token streamé

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 12e1a04..HEAD -- mobile/src/chat/store/reducer.ts mobile/src/chat/store/reducer.test.ts mobile/src/chat/ChatScreen.tsx`
> Ce plan suppose que le plan 040 est DÉJÀ appliqué (la branche user-ack utilise un
> lookup direct par `msg:{mid}`). Si `reducer.ts` contient encore
> `Object.values(next.itemsById).find((it) => it.kind === "user"`, STOP : exécuter 040 d'abord.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/040-fix-optimistic-ack-ghost-turn.md
- **Category**: perf
- **Planned at**: commit `12e1a04`, 2026-07-16

## Why this matters

Le reducer durable du chat clone l'intégralité des quatre conteneurs d'état (`itemsById`, `itemOrder`, `turnsById`, `turnOrder`) **à chaque événement** : charger/resynchroniser un thread de N événements coûte O(N²) copies (`materializeHistory` rejoue N événements × clone O(N)), et chaque token streamé paie un clone proportionnel à la taille totale du thread, plus des scans linéaires `Object.values(...).find` sur `tool_update` et `interaction`. À cela s'ajoute un effet de notification dans `ChatScreen` qui rescanne **tous** les items à chaque flush. C'est la principale menace sur le budget du plan 034 (« token visible p95 < 100 ms », `plans/034-ios-companion-chat-native-fluidity.md`) indépendamment du transport.

## Current state

- `mobile/src/chat/store/reducer.ts` — reducer pur, live ≡ replay. Le contrat public à préserver : `reduceDurable(d, ev)` retourne **la même référence** si no-op (dup `eventId`, événements éphémères) et une **nouvelle référence racine** sinon.

Clone intégral par événement (`reducer.ts:63-72` et `:133`) :

```ts
function cloneDurable(d: DurableThreadState): DurableThreadState {
  return {
    threadId: d.threadId,
    itemsById: { ...d.itemsById },
    itemOrder: d.itemOrder.slice(),
    turnsById: { ...d.turnsById },
    turnOrder: d.turnOrder.slice(),
    lastSequence: d.lastSequence,
  };
}
...
export function reduceDurable(d: DurableThreadState, ev: WireLikeEvent): DurableThreadState {
  ...
  const next = cloneDurable(d);
```

Rejeu quadratique (`reducer.ts:442-446`) :

```ts
export function materializeHistory(threadId: string, events: WireLikeEvent[]): DurableThreadState {
  let d = emptyThreadState(threadId).durable;
  for (const ev of events) d = reduceDurable(d, ev);
  return d;
}
```

Scans linéaires par événement — `tool_update` (`reducer.ts:316-323`) :

```ts
  if (kind === "tool_update") {
    const itemId = (meta?.itemId as string) || (ev as { id?: string }).id || id;
    const existing = Object.values(next.itemsById).find(
      (it) => it.kind === "tool" && it.turnId === turnId && it.toolName && it.id.includes(itemId),
    );
    // identity (turnId, itemId)
    const toolKey = `tool:${turnId}:${itemId}`;
    const prev = next.itemsById[toolKey] || existing;
```

et `interaction` (`reducer.ts:392-398`) :

```ts
  if (kind === "interaction") {
    const payload = parseInteractionFromWire(ev as never);
    if (payload) {
      const existingId = Object.values(next.itemsById).find(
        (it) => it.kind === "interaction" && it.interaction?.requestId === payload.requestId,
      )?.id;
```

- `mobile/src/chat/ChatScreen.tsx:103-137` — l'effet de notification, relancé à chaque `reduceCount` (incrémenté à chaque événement), itère **tout** `itemOrder` :

```ts
  useEffect(() => {
    const prefs = loadNotifPrefs();
    if (!prefs.enabled) return;
    for (const id of store.state.durable.itemOrder) {
      if (notifiedRef.current.has(id)) continue;
      ...
  }, [store.state.presentation.metrics.reduceCount, p.threadId, p.title]);
```

- Helper de fixtures existant pour les tests de volume : `syntheticCatchUpEvents(threadId, fromSeq, count)` dans `mobile/src/transport/syncEngine.ts:100-125` (génère des événements `user`/`text` durables séquencés).
- Consommateurs des références : `mobile/src/chat/store/selectors.ts` lit `s.durable.turnOrder`, `turnsById`, `itemsById` directement ; `mobile/src/chat/store/useChatStore.ts:93-132` recalcule l'API à chaque `state` ; `Transcript.tsx:45` mappe `turnOrder`. Aucun composant ne dépend de l'identité des conteneurs *internes* entre deux états — seule l'identité racine et le contrat « même référence si no-op » comptent.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests reducer | `cd mobile && npx vitest run src/chat/store/reducer.test.ts` | tous verts |
| Suite complète | `cd mobile && npm test` | tous verts |
| Typecheck | `cd mobile && npm run typecheck` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `mobile/src/chat/store/reducer.ts`
- `mobile/src/chat/store/reducer.test.ts`
- `mobile/src/chat/ChatScreen.tsx` (uniquement l'effet de notification, lignes ~101-137)

**Out of scope** (do NOT touch, even though they look related):
- `mobile/src/chat/store/selectors.ts`, `useChatStore.ts`, `types.ts` — les structures de données (POJO + arrays) ne changent PAS dans ce plan (pas de migration vers `Map`/immer — suivi différé).
- `Transcript.tsx`, `TurnBlock.tsx`, la virtualisation — c'est un autre chantier (finding PERF-02, non planifié ici).
- Le reducer desktop `src/lib/harnessEvents.ts`.

## Git workflow

- Branche : `advisor/041-reducer-perf-structural-sharing`
- Un commit par étape ; messages style repo (ex. `perf(mobile): materializeHistory en une passe mutable`).
- Ne pas pusher ni ouvrir de PR sans instruction de l'opérateur.

## Steps

### Step 1 : Extraire `reduceInto` (mutation locale) et rendre `materializeHistory` O(N)

Refactor mécanique : renommer le corps actuel de `reduceDurable` (après le guard de dédup) en fonction interne `reduceInto(next: DurableThreadState, ev: WireLikeEvent): DurableThreadState` qui **suppose que `next` est déjà une copie privée** et la mute (c'est déjà ce que fait le code : tout passe par `next`). Puis :

```ts
export function reduceDurable(d: DurableThreadState, ev: WireLikeEvent): DurableThreadState {
  const kind = ev.kind;
  if (kind === "started" || kind === "heartbeat" || kind === "usage") return d;
  const meta = metaOf(ev);
  if (meta?.eventId && d.itemsById[meta.eventId]) return d; // idempotent
  return reduceInto(cloneDurable(d), ev);
}

export function materializeHistory(threadId: string, events: WireLikeEvent[]): DurableThreadState {
  let d = cloneDurable(emptyThreadState(threadId).durable);
  for (const ev of events) {
    const kind = ev.kind;
    if (kind === "started" || kind === "heartbeat" || kind === "usage") continue;
    const meta = metaOf(ev);
    if (meta?.eventId && d.itemsById[meta.eventId]) continue;
    d = reduceInto(d, ev); // un seul clone pour tout le rejeu
  }
  return d;
}
```

Attention : certaines branches de `reduceInto` réaffectent des conteneurs via `map`/`filter` (ex. `next.itemOrder = next.itemOrder.filter(...)`) — c'est compatible (elles remplacent le conteneur de la copie privée). Ne pas « optimiser » ces branches ici.

**Verify**: `cd mobile && npx vitest run src/chat/store/reducer.test.ts` → tous verts (le test « deltas coalesce then text final » compare déjà live et replay — il doit rester vert).

### Step 2 : Lookups O(1) pour `tool_update` et `interaction`

- `tool_update` : la clé canonique `tool:{turnId}:{itemId}` existe déjà. Remplacer le scan par : d'abord `next.itemsById[toolKey]` ; si absent, **fallback scan** uniquement au sein des items du turn courant (via `next.turnsById[turnId]?.itemIds`) au lieu de tout `itemsById` :

```ts
    const toolKey = `tool:${turnId}:${itemId}`;
    let prev = next.itemsById[toolKey];
    if (!prev) {
      const turnItems = next.turnsById[turnId]?.itemIds ?? [];
      for (const tid of turnItems) {
        const it = next.itemsById[tid];
        if (it && it.kind === "tool" && it.toolName && it.id.includes(itemId)) { prev = it; break; }
      }
    }
```

- `interaction` : même principe — chercher `existingId` en scannant `next.turnsById[turnId]?.itemIds` (une interaction est re-émise dans son propre turn) au lieu de `Object.values(next.itemsById)`. Si le test existant d'interaction (chercher dans `reducer.test.ts` et `interactionTypes.test.ts`) montre qu'une mise à jour d'interaction peut arriver sous un `turnId` différent de l'original, garder un fallback global mais ne l'exécuter que si le scan du turn échoue.

**Verify**: `cd mobile && npm test` → tous verts (notamment `préserve les détails structurés d'un outil…` dans `reducer.test.ts` et les tests d'interaction).

### Step 3 : Fast path delta — ne copier que ce qui change

Dans `reduceDurable` (pas `materializeHistory`), pour le chemin chaud du streaming (`kind === "delta" || kind === "stream_set" || kind === "thinking_delta"`), quand le turn ET l'item streaming/thinking existent déjà, éviter `cloneDurable` complet : copier seulement `itemsById` (l'unique conteneur modifié) et réutiliser les références de `itemOrder`, `turnsById`, `turnOrder` :

```ts
  // fast path : mise à jour d'un item streaming existant, aucun conteneur d'ordre ne change
  if ((kind === "delta" || kind === "stream_set" || kind === "thinking_delta") && /* item cible existant */) {
    return {
      ...d,
      itemsById: { ...d.itemsById, [target.id]: updatedTarget },
    };
  }
```

Implémentation concrète : avant le `cloneDurable`, tenter de résoudre l'item cible en lecture seule sur `d` (mêmes règles que `findStreamingForTurn`/`findThinkingLive`, `reducer.ts:89-109`) ; si trouvé, construire l'item mis à jour exactement comme la branche existante le fait, retourner l'objet ci-dessus. Sinon, retomber sur le chemin général (clone + `reduceInto`). Ne pas dupliquer la logique de contenu : extraire la construction de l'item mis à jour dans un petit helper partagé par les deux chemins.

**Verify**:
1. `cd mobile && npx vitest run src/chat/store/reducer.test.ts` → verts.
2. Nouveau test d'identité (Step 4 ci-dessous) vert.

### Step 4 : Borner l'effet de notification (ChatScreen)

Dans `mobile/src/chat/ChatScreen.tsx:103-137`, remplacer le scan complet par un high-water mark d'index, en conservant `notifiedRef` comme garde d'idempotence :

```ts
  const notifiedRef = useRef(new Set<string>());
  const notifScanIndexRef = useRef(0);
  useEffect(() => {
    const prefs = loadNotifPrefs();
    if (!prefs.enabled) return;
    const order = store.state.durable.itemOrder;
    // itemOrder est append-only sauf re-clé in place (040) et loadHistory (reset) :
    if (notifScanIndexRef.current > order.length) notifScanIndexRef.current = 0;
    const start = Math.max(0, notifScanIndexRef.current - 5); // marge : items terminaux re-clés/interactions mises à jour en place
    for (let i = start; i < order.length; i++) {
      const id = order[i];
      ... // corps existant inchangé (done / error / interaction pending)
    }
    notifScanIndexRef.current = order.length;
  }, [store.state.presentation.metrics.reduceCount, p.threadId, p.title]);
```

Nuance importante : une `interaction` passe à `pending` par **mise à jour en place** (même id, même position dans `itemOrder`) — l'événement de mise à jour porte un nouvel `eventId` mais l'item garde son id de première émission. La marge `start - 5` ne suffit pas si l'interaction originelle est ancienne. Solution : garder un second parcours **ciblé** uniquement sur les items `kind === "interaction"` non notifiés — maintenir un `Set` des ids d'interaction vus non-pending (petit, borné par le nombre d'interactions du thread) et le re-vérifier à chaque flush. Les interactions sont rares : ce parcours est O(#interactions), pas O(N).

**Verify**: `cd mobile && npx vitest run src/chat` → verts ; `cd mobile && npm run typecheck` → exit 0.

### Step 5 : Tests d'identité et de volume

Ajouter dans `reducer.test.ts` :

```ts
  it("delta ne remplace pas les conteneurs d'ordre (fast path)", () => {
    let d = emptyThreadState("t").durable;
    d = reduceDurable(d, { kind: "streaming", text: "", meta: { ...meta(1, "s1"), durable: false } });
    const before = d;
    d = reduceDurable(d, { kind: "delta", text: "Hel", meta: { ...meta(2, "d1"), durable: false } });
    expect(d).not.toBe(before);
    expect(d.itemOrder).toBe(before.itemOrder);
    expect(d.turnOrder).toBe(before.turnOrder);
    expect(d.turnsById).toBe(before.turnsById);
  });

  it("materializeHistory 3000 événements produit le même état que le rejeu pas-à-pas", () => {
    const events = syntheticCatchUpEvents("t", 0, 3000);
    const replay = materializeHistory("t", events);
    let live = emptyThreadState("t").durable;
    for (const ev of events) live = reduceDurable(live, ev);
    expect(replay.itemOrder).toEqual(live.itemOrder);
    expect(replay.turnOrder).toEqual(live.turnOrder);
    expect(replay.lastSequence).toBe(live.lastSequence);
  });
```

(Import : `import { syntheticCatchUpEvents } from "../../transport/syncEngine.ts";` — vérifier le chemin relatif réel. Adapter le premier test si le reducer exige un événement d'amorçage différent pour créer l'item streaming : lire la branche `delta` pour le fixture minimal exact.)

**Verify**: `cd mobile && npm test` → tous verts.

## Test plan

- Les deux tests du Step 5 (identité des conteneurs sur delta ; équivalence live ≡ replay sur 3000 événements — c'est aussi le garde-fou de non-régression sémantique du refactor).
- Ne PAS ajouter de test de chronométrage (flaky en CI) — l'équivalence + l'identité suffisent à verrouiller la structure.
- Modèle : `reducer.test.ts` existant.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd mobile && npm test` exit 0 (tous les tests, dont ceux du plan 040)
- [ ] `cd mobile && npm run typecheck` exit 0
- [ ] `grep -c "Object.values(next.itemsById).find" mobile/src/chat/store/reducer.ts` retourne 0
- [ ] `grep -c "cloneDurable" mobile/src/chat/store/reducer.ts` : `materializeHistory` n'appelle plus `reduceDurable` en boucle (inspection : la boucle appelle `reduceInto`)
- [ ] Les tests d'identité du Step 5 existent et passent
- [ ] `git status` : seuls les 3 fichiers in-scope (et `plans/README.md`) modifiés

## STOP conditions

Stop and report back (do not improvise) if:

- Le plan 040 n'est pas appliqué (voir drift check) — l'ordre est obligatoire.
- Le test live ≡ replay (Step 5) diverge après le Step 1 : le refactor `reduceInto` a changé la sémantique — ne pas rustiner, reporter.
- Le fast path du Step 3 exige de toucher `types.ts` ou les selectors — hors scope, s'arrêter et proposer.
- Un test de scroll/presentation (`connectionState`, `WorkingStatus`, etc.) casse : les hypothèses d'identité d'un consommateur étaient plus fortes que documenté.

## Maintenance notes

- Le vrai O(1) par token demanderait `Map` + partage structurel (ou immer) — délibérément différé : changer les structures de données casserait selectors et tests d'un coup. À réévaluer après mesure sur iPhone physique (gate E du plan 034).
- Si la virtualisation (finding PERF-02, `selectVisibleTurns` jamais branché) est câblée plus tard, elle bénéficiera directement du fast path (les références `turnOrder`/`turnsById` stables évitent des re-renders).
- Reviewer : scruter le Step 3 — c'est le seul endroit où deux chemins de code construisent le même item ; vérifier que le helper partagé est bien utilisé par les deux.
