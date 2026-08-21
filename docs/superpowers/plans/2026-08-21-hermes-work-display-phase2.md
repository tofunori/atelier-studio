# Affichage du travail façon Hermes — phase 2 : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compléter l'affichage du travail du chat avec les quatre mécanismes Hermes restants : préférence « pensée repliée », attente universelle chronométrée, horodatage optionnel des lignes, carte « N fichiers modifiés » — plus un spike sur le signal de rédaction d'appel.

**Architecture:** Tout est frontend (React/TS, `src/components/chat` + `src/lib`), sauf le spike (T6) qui sonde le provider Rust Claude. Les réglages passent par `Settings` (localStorage) et arrivent aux composants via la prop `defaults` de `Chat` (App passe déjà l'objet `settings` entier — App.tsx:3835 : seul le TYPE est à étendre). Chaque tâche est livrable seule.

**Tech Stack:** React 18, vitest + @testing-library (jsdom), CSS tokens App.css, i18n maison (`src/lib/i18n.ts`, clés fr L7+ / en L1445+).

**Spec:** `docs/superpowers/specs/2026-08-21-hermes-work-display-phase2-design.md`

## Global Constraints

- Design system CLAUDE.md : tailles 10/11/12/13/15 px (`--fs-xs`…`--fs-xl`), gris 4 niveaux (`--fg`, `--fg2`, `--muted`, `--muted2` alias `--text-*`), rayons 6/10, motion 120-150 ms, `prefers-reduced-motion` respecté.
- Jamais de `<button>` nu hors `src/components/ui/` : utiliser `RowButton`/`Button`/`IconButton` (verrouillé par `css-contract.test.ts`).
- Toute chaîne UI en i18n fr **et** en (l'objet `en` est typé `Record<keyof typeof fr, string>` : une clé fr sans clé en = erreur tsc).
- TDD : test rouge d'abord. Vérifs finales de chaque tâche : `npx tsc --noEmit` puis `npx vitest run` (105 fichiers / 945+ tests verts au départ).
- Commits fréquents (les auto-commits galerie balaient le worktree). Ne pas pusher.
- La relance de l'app (validation .app) suit `docs/PROTOCOLE_RELANCE.md` — une seule fois, après la dernière tâche retenue, pas à chaque tâche.

---

### Task 1 : Réglages `thinkingCollapsed` + `displayTimestamps`

**Files:**
- Modify: `src/lib/settings.ts` (type `Settings` L7-60, défauts ~L82)
- Modify: `src/components/Settings.tsx` (Group « Chat », pattern Toggle L967)
- Modify: `src/lib/i18n.ts` (clés `settings.*` fr+en)
- Modify: `src/components/Chat.tsx:135` et `src/components/chat/ChatTimeline.tsx:83` (type `defaults`)
- Test: `src/lib/settings.test.ts`

**Interfaces:**
- Produces: `Settings.thinkingCollapsed: boolean` (défaut `false`), `Settings.displayTimestamps: boolean` (défaut `false`) ; type `defaults` de Chat/ChatTimeline étendu avec ces deux champs optionnels. T2 lit `defaults.thinkingCollapsed`, T4 lit `defaults.displayTimestamps`.

- [ ] **Step 1 : test rouge**

```ts
// src/lib/settings.test.ts — dans la describe existante
it("expose les préférences d'affichage du travail avec leurs défauts", () => {
  localStorage.clear();
  const s = loadSettings();
  expect(s.thinkingCollapsed).toBe(false);
  expect(s.displayTimestamps).toBe(false);
  saveSettings({ ...s, thinkingCollapsed: true, displayTimestamps: true });
  const again = loadSettings();
  expect(again.thinkingCollapsed).toBe(true);
  expect(again.displayTimestamps).toBe(true);
});
```

- [ ] **Step 2 : vérifier l'échec** — `npx vitest run src/lib/settings.test.ts` → FAIL (propriétés absentes).

- [ ] **Step 3 : implémentation**

Dans `Settings` (settings.ts, après `timeFormat`) :
```ts
  /** Pensée (vivante et durable) repliée par défaut — préférence d'affichage locale. */
  thinkingCollapsed: boolean;
  /** Horodatage début → fin sur les lignes durables du transcript (défaut off). */
  displayTimestamps: boolean;
```
Dans l'objet des défauts (~L82, à côté de `timeFormat: "system"`) :
```ts
  thinkingCollapsed: false,
  displayTimestamps: false,
```
Dans `Chat.tsx:135` et `ChatTimeline.tsx:83`, étendre le type `defaults` :
```ts
  timeFormat?: "system" | "24h" | "12h";
  thinkingCollapsed?: boolean;
  displayTimestamps?: boolean;
```
Dans `Settings.tsx`, dans le `Group` contenant le Toggle `settings.auto-refresh` (ou le Group « Chat » si distinct — suivre le groupe qui contient `chatFontSize`) :
```tsx
<Row title={t("settings.thinking-collapsed")} desc={t("settings.thinking-collapsed-desc")}>
  <Toggle label="" checked={s.thinkingCollapsed} onChange={(v) => set({ thinkingCollapsed: v })} />
</Row>
<Row title={t("settings.display-timestamps")} desc={t("settings.display-timestamps-desc")}>
  <Toggle label="" checked={s.displayTimestamps} onChange={(v) => set({ displayTimestamps: v })} />
</Row>
```
i18n fr :
```ts
"settings.thinking-collapsed": "Pensée repliée par défaut",
"settings.thinking-collapsed-desc": "Le raisonnement s'affiche en une ligne d'aperçu ; un clic le déplie.",
"settings.display-timestamps": "Horodater le travail",
"settings.display-timestamps-desc": "Début → fin sur les lignes d'outils du transcript.",
```
i18n en :
```ts
"settings.thinking-collapsed": "Collapse thinking by default",
"settings.thinking-collapsed-desc": "Reasoning shows as a one-line preview; click to expand.",
"settings.display-timestamps": "Timestamp the work",
"settings.display-timestamps-desc": "Start → end on the transcript's tool lines.",
```

- [ ] **Step 4 : vérifier le vert** — `npx vitest run src/lib/settings.test.ts` puis `npx tsc --noEmit`.
- [ ] **Step 5 : commit** — `git add src/lib/settings.ts src/lib/settings.test.ts src/components/Settings.tsx src/components/Chat.tsx src/components/chat/ChatTimeline.tsx src/lib/i18n.ts && git commit -m "feat(settings): préférences pensée repliée + horodatage du travail"`

---

### Task 2 : appliquer « pensée repliée par défaut »

**Files:**
- Modify: `src/components/chat/turnParts.tsx` (`LiveThinking` L~454, `ThinkingBlock` L~321)
- Modify: `src/components/chat/ChatTimeline.tsx` (call sites `LiveThinking`/`ThinkingBlock` — passer la préférence)
- Modify: `src/components/chat/turns.tsx` (`ActiveTurnTail` appelle `LiveThinking` L~623 : ajouter la prop)
- Test: `src/components/chat/turnAnatomy.test.tsx`

**Interfaces:**
- Consumes: `defaults.thinkingCollapsed` (T1).
- Produces: `LiveThinking({ thought, collapsedByDefault })`, `ThinkingBlock({ text, live, collapsedByDefault })` — le clic manuel garde TOUJOURS la main (état `manuel`/`replie` existant ; la préférence ne fixe que l'état initial).

- [ ] **Step 1 : test rouge**

```tsx
// turnAnatomy.test.tsx
it("la préférence replie la pensée vivante par défaut, le clic la déplie", () => {
  const evs: AgentEvent[] = [
    events.user("Réfléchis.", FIXED_TS),
    { kind: "thinking_live", text: "Une longue pensée déjà en cours.", ts: FIXED_TS + 50 } as AgentEvent,
  ];
  renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS, defaults: { thinkingCollapsed: true } })} />);
  expect(document.querySelector(".thinking-live-stream")).toBeNull();
  expect(document.querySelector(".thinking-preview")?.textContent).toContain("longue pensée");
  fireEvent.click(document.querySelector(".thinking-live-head") as HTMLButtonElement);
  expect(document.querySelector(".thinking-live-stream")).toBeTruthy();
});
```
Note : si `chatProps` ne fusionne pas `defaults`, l'étendre dans le helper du test (spread `{ ...base.defaults, ...over.defaults }`).

- [ ] **Step 2 : vérifier l'échec** — `npx vitest run src/components/chat/turnAnatomy.test.tsx` → FAIL.

- [ ] **Step 3 : implémentation**

`LiveThinking` : ajouter la prop et initialiser `replie` avec :
```ts
export function LiveThinking({ thought, collapsedByDefault = false }:
  { thought?: string | null; collapsedByDefault?: boolean } = {}) {
  const [replie, setReplie] = useState(collapsedByDefault);
```
`ThinkingBlock` : même prop ; `const open = manuel ?? (live && !collapsedByDefault);`
Plomberie : `ChatTimeline` lit `defaults.thinkingCollapsed ?? false` et le passe aux deux composants (3 call sites : ThinkingBlock L~610, LiveThinking row "working" L~442, ActiveTurnTail — ajouter une prop `thinkingCollapsed` à `ActiveTurnTail` et la relayer).

- [ ] **Step 4 : vert** — suite chat complète : `npx vitest run src/components/chat/` (les tests existants sur la pensée passent avec le défaut `false`).
- [ ] **Step 5 : commit** — `git commit -m "feat(chat): la préférence replie la pensée par défaut"`

---

### Task 3 : attente universelle chronométrée (tous les états du tour)

**Files:**
- Modify: `src/components/chat/turns.tsx` (`ActiveTurnTail` — la logique quiet existante L~600 sort du branch ticker)
- Test: `src/components/chat/turnAnatomy.test.tsx` (fake timers)

**Interfaces:**
- Consumes: `turnProgressSignature(actions, thoughtLength)` (toolPresentation, existant), clé i18n `chat.quiet-wait` (existante).
- Produces: une ligne `.turn-quiet` sous le contenu du tail, visible quand : tour actif ET aucun outil `running` ET état ≠ `waiting` (permission déjà narrée) ET signature stable ≥ 2 s. Quand l'état est `activity` (ticker visible), la ligne quiet reste DANS le ticker comme aujourd'hui — pas de double narration.

- [ ] **Step 1 : test rouge**

```tsx
it("chronomètre le silence même pendant une pensée muette", () => {
  vi.useFakeTimers();
  const evs: AgentEvent[] = [
    events.user("Réfléchis.", FIXED_TS),
    { kind: "tool", name: "__thinking" } as AgentEvent, // pensée SANS texte (headless caviardé)
  ];
  renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS })} />);
  expect(document.querySelector(".turn-quiet")).toBeNull();
  act(() => { vi.advanceTimersByTime(3100); });
  expect(document.querySelector(".turn-quiet")?.textContent).toMatch(/en attente · \d+ s/);
  vi.useRealTimers();
});
```

- [ ] **Step 2 : vérifier l'échec** — FAIL (`.turn-quiet` absent).

- [ ] **Step 3 : implémentation**

Dans `ActiveTurnTail`, la mécanique signature/interval existe déjà (refs `quietSinceRef`/`prevSignatureRef`, interval 1 s). Ajouter après le bloc `state?.kind === "answering" ? null : …` (même niveau que `stop-hint`) :
```tsx
{quietSeconds >= 2 && !running && state?.kind !== "waiting" && state?.kind !== "activity" && (
  <div className="turn-quiet">{t("chat.quiet-wait", { s: quietSeconds })}</div>
)}
```
CSS (App.css, près de `.turn-cumulative`) :
```css
.turn-quiet { color: var(--text-disabled); font-size: var(--fs-s);
  margin-left: 22px; font-variant-numeric: tabular-nums; }
```
Attention : `running` est déclaré après le bloc quiet actuel — le JSX y a déjà accès ; ne pas déplacer les déclarations.

- [ ] **Step 4 : vert** — `npx vitest run src/components/chat/turnAnatomy.test.tsx` puis suite chat.
- [ ] **Step 5 : commit** — `git commit -m "feat(chat): chaque seconde du tour est nommée — attente chronométrée hors ticker"`

---

### Task 4 : horodatage début → fin des lignes durables (gaté par réglage)

**Files:**
- Create: `src/components/chat/TimelineStamp.tsx`
- Modify: `src/components/chat/turns.tsx` (`ActivityGroup` L~650 : prop `stampMs`), `src/components/chat/ChatTimeline.tsx` (calcul premier/dernier `ts` du groupe d'actions, passage de `defaults.displayTimestamps`)
- Test: `src/components/chat/toolPresentation.test.tsx` (formatteur) + `turnAnatomy.test.tsx` (gating)

**Interfaces:**
- Consumes: `defaults.displayTimestamps` (T1) ; `AgentEvent.ts?: number` (ms epoch).
- Produces: `TimelineStamp({ startMs, endMs })` → `<span className="timeline-stamp">HH:MM → HH:MM</span>` (une seule heure si même minute ou fin absente), tooltip `title` à la seconde. `formatStampRange(startMs, endMs | null, fmt): string` exporté pour test.

- [ ] **Step 1 : test rouge (formatteur pur)**

```ts
it("formate début → fin, replié sur une heure si même minute", () => {
  const t0 = new Date(2026, 7, 21, 10, 47, 12).getTime();
  expect(formatStampRange(t0, t0 + 20_000, "24h")).toBe("10:47");
  expect(formatStampRange(t0, t0 + 3 * 60_000, "24h")).toBe("10:47 → 10:50");
  expect(formatStampRange(t0, null, "24h")).toBe("10:47");
});
```

- [ ] **Step 2 : vérifier l'échec** — FAIL (fonction absente).

- [ ] **Step 3 : implémentation**

`TimelineStamp.tsx` :
```tsx
import { fmtTime } from "./turnParts";

export function formatStampRange(startMs: number, endMs: number | null,
  fmt?: "system" | "24h" | "12h"): string {
  const start = fmtTime(startMs, fmt);
  if (endMs == null) return start;
  const end = fmtTime(endMs, fmt);
  return end === start ? start : `${start} → ${end}`;
}

export function TimelineStamp({ startMs, endMs, fmt }:
  { startMs: number; endMs: number | null; fmt?: "system" | "24h" | "12h" }) {
  const precise = (ms: number) => new Date(ms).toLocaleTimeString();
  return (
    <span className="timeline-stamp"
      title={endMs != null ? `${precise(startMs)} → ${precise(endMs)}` : precise(startMs)}>
      {formatStampRange(startMs, endMs, fmt)}
    </span>
  );
}
```
`ActivityGroup` : prop `stamp?: ReactNode` rendue via le slot `meta` de `ActivityDisclosure` (`meta={p.stamp}` — le slot existe déjà). `ChatTimeline` (chemin `item.type === "actions"`) calcule :
```ts
const tss = item.actions.map((a) => a.ts).filter((v): v is number => v != null);
const stamp = defaults.displayTimestamps && tss.length
  ? <TimelineStamp startMs={Math.min(...tss)} endMs={tss.length > 1 ? Math.max(...tss) : null} fmt={defaults.timeFormat} />
  : undefined;
```
CSS : `.timeline-stamp { color: var(--text-disabled); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }`
Test DOM (gating) : rendre un tour fini avec 2 outils portant `ts`, `defaults.displayTimestamps: true` → `.timeline-stamp` présent ; défaut → absent.

- [ ] **Step 4 : vert** — suite chat + `npx tsc --noEmit`.
- [ ] **Step 5 : commit** — `git commit -m "feat(chat): horodatage optionnel début → fin des lignes de travail"`

---

### Task 5 : carte « N fichiers modifiés » en fin de tour

**Files:**
- Create: `src/components/chat/ChangedFilesCard.tsx`
- Create: `src/components/chat/changedFiles.ts` (dérivation pure)
- Modify: `src/components/chat/turns.tsx` (`ResultCapsule` L~414 : rendre la carte au-dessus de son contenu quand `isLastDone`)
- Test: `src/components/chat/changedFiles.test.ts` + `turnAnatomy.test.tsx`

**Interfaces:**
- Consumes: events `edit` (`files: {path, add, del}[]`) du tour + `done.filesChanged: string[]` (ws.ts L155) ; `DoneDiffToggle` existant (turnParts.tsx:26) pour l'action « Voir le diff ».
- Produces: `deriveChangedFiles(turnEvents: AgentEvent[], done: DoneEvent): { path: string; name: string; add: number; del: number }[]` — cumul add/del par path depuis les `edit`, chemins de `done.filesChanged` absents des edits ajoutés avec `add/del` à 0 ; tri par (add+del) décroissant.

- [ ] **Step 1 : test rouge (dérivation pure)**

```ts
import { deriveChangedFiles } from "./changedFiles";
it("cumule les +/− par fichier et complète depuis done.filesChanged", () => {
  const turn: AgentEvent[] = [
    { kind: "edit", files: [{ path: "src/a.ts", add: 3, del: 1 }] } as AgentEvent,
    { kind: "edit", files: [{ path: "src/a.ts", add: 2, del: 0 }, { path: "src/b.ts", add: 5, del: 5 }] } as AgentEvent,
  ];
  const done = { kind: "done", ok: true, filesChanged: ["src/a.ts", "docs/c.md"] } as AgentEvent;
  const files = deriveChangedFiles(turn, done);
  expect(files).toEqual([
    { path: "src/b.ts", name: "b.ts", add: 5, del: 5 },
    { path: "src/a.ts", name: "a.ts", add: 5, del: 1 },
    { path: "docs/c.md", name: "c.md", add: 0, del: 0 },
  ]);
});
```

- [ ] **Step 2 : vérifier l'échec** — FAIL (module absent).

- [ ] **Step 3 : implémentation de la dérivation**

```ts
// src/components/chat/changedFiles.ts
import type { AgentEvent } from "../../lib/ws";

export function deriveChangedFiles(
  turnEvents: AgentEvent[],
  done: Extract<AgentEvent, { kind: "done" }> | null,
): { path: string; name: string; add: number; del: number }[] {
  const byPath = new Map<string, { add: number; del: number }>();
  for (const e of turnEvents) {
    if (e.kind !== "edit") continue;
    for (const f of e.files) {
      const cur = byPath.get(f.path) ?? { add: 0, del: 0 };
      byPath.set(f.path, { add: cur.add + (f.add ?? 0), del: cur.del + (f.del ?? 0) });
    }
  }
  for (const path of done?.filesChanged ?? []) {
    if (!byPath.has(path)) byPath.set(path, { add: 0, del: 0 });
  }
  return [...byPath.entries()]
    .map(([path, c]) => ({ path, name: path.split("/").pop() || path, ...c }))
    .sort((a, b) => (b.add + b.del) - (a.add + a.del));
}
```

- [ ] **Step 4 : composant + intégration**

```tsx
// src/components/chat/ChangedFilesCard.tsx
import { RowButton } from "../ui";
import { FileTypeIcon } from "./toolPresentation";
import { t } from "../../lib/i18n";

export function ChangedFilesCard({ files, onOpenDiff }: {
  files: { path: string; name: string; add: number; del: number }[];
  onOpenDiff: () => void;
}) {
  if (!files.length) return null;
  return (
    <div className="changed-files-card">
      <div className="changed-files-head">
        <span>{t("chat.files-changed-n", { n: files.length })}</span>
        <RowButton className="changed-files-review" onClick={onOpenDiff}>{t("chat.see-diff")}</RowButton>
      </div>
      <div className="changed-files-list">
        {files.map((f) => (
          <RowButton key={f.path} className="changed-files-row" title={f.path} onClick={onOpenDiff}>
            <FileTypeIcon ext={f.name.split(".").pop() ?? ""} />
            <span className="changed-files-name">{f.name}</span>
            <span className="diff-add">+{f.add}</span>
            <span className="diff-del">−{f.del}</span>
          </RowButton>
        ))}
      </div>
    </div>
  );
}
```
Intégration dans `ResultCapsule` (turns.tsx) : quand `isLastDone`, calculer les events du tour (du `user` précédent au `done`) côté appelant (`ChatTimeline`, qui a `events` et `i`) et passer `changedFiles` en prop à `ResultCapsule` ; la carte se rend au-dessus de la capsule. `onOpenDiff` réutilise le mécanisme de `DoneDiffToggle` (même événement/props que le toggle existant — lire turnParts.tsx:26-60 et réutiliser son handler, ne pas dupliquer la logique de diff).
i18n : fr `"chat.files-changed-n": "{n} fichiers modifiés"`, `"chat.see-diff": "Voir le diff"` ; en `"{n} files changed"`, `"See diff"`. Vérifier qu'une clé « fichiers modifiés » n'existe pas déjà (grep `files-changed` dans i18n.ts) — réutiliser le cas échéant.
CSS (App.css, tokens) :
```css
.changed-files-card { border-radius: 10px; background: var(--bg-card); padding: 8px 12px; margin: 6px 0; }
.changed-files-head { display: flex; align-items: center; justify-content: space-between;
  font-size: var(--fs-m); color: var(--fg2); }
.changed-files-review { color: var(--text-muted); font-size: var(--fs-s); cursor: pointer; }
.changed-files-list { max-height: 150px; overflow-y: auto; margin-top: 4px; }
.changed-files-row { display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 2px 4px; border-radius: 6px; font-size: var(--fs-m); color: var(--text-muted); cursor: pointer; }
.changed-files-row:hover { background: var(--bg-pop); }
.changed-files-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.diff-add, .diff-del { font-variant-numeric: tabular-nums; font-size: var(--fs-xs); }
```
`.diff-add`/`.diff-del` : si des classes sémantiques +/− existent déjà (grep `diff-add` / couleur ok/erreur documentée), les réutiliser au lieu d'en créer.
Test DOM : tour fini avec 2 edits + done → la carte liste 2 lignes triées ; clic sur « Voir le diff » déclenche le même handler que `DoneDiffToggle` (spy).

- [ ] **Step 5 : vert** — suite chat complète + `npx tsc --noEmit` + `npx vite build`.
- [ ] **Step 6 : commit** — `git commit -m "feat(chat): carte fichiers modifiés en fin de tour (+/− par fichier, accès diff)"`

---

### Task 6 : SPIKE — signal de rédaction d'appel (« Editing… » avant exécution)

Sortie = une RECOMMANDATION documentée, pas du code gardé (règle spike).

**Files:**
- Create: `docs/superpowers/specs/2026-08-XX-drafting-spike-resultat.md` (compte-rendu)

- [ ] **Step 1 : probe Claude** — lancer `claude --output-format stream-json --include-partial-messages -p "liste les fichiers du dossier courant"` dans un dossier de test ; capturer stdout ; vérifier si des événements `content_block_start` de type `tool_use` (avec `name`) arrivent AVANT le bloc complet, et mesurer l'écart temporel.
- [ ] **Step 2 : probe Codex** — sur un tour Codex réel dans Atelier, mesurer l'écart entre la fin du dernier delta de raisonnement et le premier `item/started` (les events portent `ts`). Si < 1 s en pratique, le trou de rédaction est négligeable côté Codex.
- [ ] **Step 3 : décision** — écrire le compte-rendu : signal exploitable ou non par provider, coût d'implémentation (flag CLI + parse dans `claude_parse.rs` + nouvel event `{kind:"activity", phase:"drafting"}` mappé au verbe présent côté UI, avec révélation à 200 ms comme Hermes), et recommandation GO/NO-GO. Ne rien implémenter dans ce plan.
- [ ] **Step 4 : commit** — `git add docs/superpowers/specs/*drafting* && git commit -m "docs: résultat du spike drafting (verbe avant exécution)"`

---

## Self-review (fait à l'écriture)

- Couverture spec : A→T1+T2, B→T3, C→T1+T4, D→T5, E→T6 ; hors périmètre §4 sans tâche (voulu).
- Placeholders : aucun TBD ; chaque étape code porte son extrait.
- Cohérence de types : `defaults.thinkingCollapsed`/`displayTimestamps` définis en T1, consommés en T2/T4 ; `deriveChangedFiles` défini et consommé en T5 ; `formatStampRange` défini et testé en T4.
- Risque connu : les caractérisations existantes de la pensée supposent le défaut « dépliée » — T2 ne les casse pas tant que le défaut reste `false` ; le test du helper `chatProps` (fusion `defaults`) est signalé dans T2 Step 1.
