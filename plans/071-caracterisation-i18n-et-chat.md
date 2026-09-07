# Plan 071 (v2) : Les dictionnaires FR/EN ne peuvent plus diverger et `Chat.tsx` a un filet de caractérisation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b70ac4b3..HEAD -- src/lib/i18n.ts src/components/Chat.tsx src/components/chat/ChatTimeline.characterization.test.tsx`
> Un écart sur `i18n.ts` limité à des clés `biblio.*` ajoutées/retirées n'est
> pas un drift bloquant ; tout écart sur `Chat.tsx` en est un.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `b70ac4b3`, 2026-09-06 — **v2 du 2026-09-06** après un premier STOP justifié (voir « Historique »)

## Historique

La v1 décrivait deux câblages qui n'existent pas dans `Chat.tsx` (un
glisser-déposer de fichiers ; un Quick Ask qui passerait par `wsSend`) et une
règle de parité des variables trop stricte pour l'accord français
(`{stagedPlural}`). L'exécuteur a stoppé à raison. Cette v2 est écrite à partir
du code lu ligne à ligne.

## Why this matters

`src/lib/i18n.ts` porte deux dictionnaires ; `en` est typé sur les clés de
`fr`, donc une clé FR sans pendant EN est une erreur de compilation — mais une
clé EN orpheline, une valeur vide, ou une variable `{x}` utilisée dans une langue
et absente de l'autre passent sans bruit. `src/components/Chat.tsx` (1 153
lignes) orchestre le composer, les surlignages, le Quick Ask, les annotations et
l'état par fil, et n'a **aucun test dédié**. Ce plan pose les deux filets ; il
est prérequis à tout découpage de `Chat.tsx`.

## Current state

- `src/lib/i18n.ts` : `export type LanguageSetting = "fr" | "en" | "system"` (l.1) ; `const fr = {…}` (l.7) ; `const en: Record<keyof typeof fr, string> = {…}` (l.~1692) ; `export type I18nKey = keyof typeof fr` ; `resolveLanguage(setting)`, `getResolvedLanguage()`, `setLanguage(next)` (l.~3401 : pose `currentLanguage`, émet `LANGUAGE_CHANGED_EVENT`), `t(key, vars?)` (l.~3409 : `dict[key] ?? fr[key] ?? key`, puis `.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ""))` — une variable absente devient une chaîne vide, sans exception). Les dictionnaires ne sont pas exportés.
- **Fait établi par la v1** : `git.staging-summary` a en FR `"{staged} indexé{stagedPlural} · {untracked} non suivi{untrackedPlural}"` et en EN `"{staged} staged · {untracked} untracked"` — les variables `*Plural` n'existent qu'en FR (accord). C'est légitime : la règle de parité doit tolérer des variables FR supplémentaires dont le nom finit par `Plural`.
- `src/components/Chat.tsx` — câblages **réels** (lignes au `b70ac4b3`) :
  - props (l.88-140) : `events`, `workingSince`, `injectText` / `onInjected` (l.102-103), `threadId` (l.113), `onPasteImage(dataURL)` / `onPasteText(text)` / `onStop` (l.117-119), `highlights: HighlightEntry[]`, `attachments`, `onRemoveAttachment`, `onQuote`, `layout`, `usage`, …
  - `injectText` : `useEffect` l.635-639 → `setText(p.injectText); p.onInjected();`.
  - Surlignage : l.475-487 `wsSend({ type: "addHighlight", …, context: buildHighlightContext(findEventTextContaining(txt), txt), threadId: p.threadId ?? "" })` ; retrait l.518-519 : `const match = p.highlights.find(h => h.threadId === p.threadId && h.text === txt); if (match) wsSend({ type: "removeHighlight", id: match.id });`.
  - Quick Ask : sélection de texte dans le fil → `setQuote({…})` (l.616-624) → `const quoteCtx = quoteContext(quote, p.events, p.threadTitle ?? "")` (l.983) → passé à `ChatTimeline` ; le bouton « Ask » (`ChatTimeline.tsx` ~l.315, `onAsk`) fait `window.dispatchEvent(new CustomEvent("quick-ask-open", { detail: { context: quoteCtx } }))` — **aucun `wsSend`** dans ce chemin.
  - Marques par fil : l.443-450 — au changement de `p.threadId`, `setMarks(migrateMarks(JSON.parse(localStorage.getItem("atelier-studio.marks." + p.threadId) ?? "[]")))` ; l'écriture va dans la même clé.
  - Effets au changement de fil : l.421-422 (`setBarOpen(false)…`, `setReview(null)`), l.546 (`setGoalDismissed(null)`).
  - `onStop` → `ChatComposer` (`working={{ onStop: p.onStop }}`, l.1047 / 1095) ; `onPasteImage`/`onPasteText` → `ChatComposer` (l.1065).
  - **Il n'existe aucun glisser-déposer de fichiers** dans `Chat.tsx` (les seuls `onDrop` du repo sont `KbSurface.tsx` et `QueuedTurns.tsx`).
- Exemplaire : `src/components/chat/ChatTimeline.characterization.test.tsx` l.1-60 (`vi.mock("@tauri-apps/api/core", …)`, `import Chat from "../Chat"`, `renderUi`/`resetTestState` de `src/test/render`, fixtures `events`/`makeTurnEvents`/`FIXED_TS`, fabrique `chatProps(over)`).
- Conventions : vitest + RTL, jsdom, tests en français, pas de `<button>` nu.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` (ignorer `src/test_auto_review*`) | exit 0 |
| i18n | `npx vitest run src/lib/i18n.test.ts` | all pass |
| Chat | `npx vitest run src/components/Chat.characterization.test.tsx` | all pass |
| Suite | `npx vitest run src/components src/lib` | 0 failed |

## Scope

**In scope**: `src/lib/i18n.ts` (uniquement `export const fr` / `export const en`), `src/lib/i18n.test.ts` (créer), `src/components/Chat.characterization.test.tsx` (créer).
**Out of scope**: `src/components/Chat.tsx` — aucune modification ; `ChatTimeline.tsx`, `ChatComposer.tsx` ; les libellés eux-mêmes.

## Git workflow

Branche `advisor/071-caracterisation-i18n-chat` ; commits `test(i18n): parité FR/EN et interpolation` puis `test(chat): caractérisation du câblage` ; ne pas pousser.

## Steps

### Step 1 : Exporter les dictionnaires
`const fr =` → `export const fr =` ; `const en: Record<…> =` → `export const en: Record<…> =`.
**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2 : Test de parité i18n
`src/lib/i18n.test.ts`, 6 tests : (a) mêmes ensembles de clés dans `fr` et `en` (message listant les orphelines) ; (b) aucune valeur vide ni identique à sa clé ; (c) variables : pour chaque clé, `vars(en) ⊆ vars(fr)` et toute variable présente en FR mais absente en EN a un nom terminé par `Plural` (accord français) — message listant les écarts ; (d) `t()` interpole et remplace une variable absente par `""` sans exception ; (e) `resolveLanguage("system")` suit `navigator.language` (mock par `Object.defineProperty`) ; (f) `setLanguage("en")` change `t()` pour une clé connue (restaurer la langue en `afterEach`).
**Verify**: `npx vitest run src/lib/i18n.test.ts` → 6 verts. Si (a)/(b)/(c) échoue sur des données réelles **autres** que le cas `Plural` documenté : STOP et rapporte les clés.

### Step 3 : Caractériser `Chat.tsx`
`src/components/Chat.characterization.test.tsx`, modèle `ChatTimeline.characterization.test.tsx`, fabrique `chatProps`. Huit cas, écrits tels que le code se comporte :
1. `events: []` → timeline et composer rendus, aucune bulle.
2. `injectText: "bonjour"` → le composer affiche « bonjour » et `onInjected` est appelé une fois (re-rendre avec `injectText: null` : pas de second appel).
3. Coller une image dans le composer (`fireEvent.paste` avec un `DataTransfer`/`clipboardData.items` contenant un `File` `image/png`) → `onPasteImage` reçoit une data-URL (regarde comment `ChatComposer`/`PromptInput` lit le presse-papiers pour construire l'événement exact ; si jsdom ne sait pas produire la data-URL, mocker `FileReader`).
4. Coller un texte long → `onPasteText` appelé avec ce texte (seuil : lire la condition dans `ChatComposer`).
5. Quick Ask : sélectionner du texte d'une bulle assistant (mocker `window.getSelection` pour retourner un `Range` dans la bulle, puis `fireEvent.mouseUp`) → le bouton « Ask » apparaît ; clic → `window.dispatchEvent` reçoit un `CustomEvent` `quick-ask-open` dont `detail.context` contient le texte sélectionné (espionner `window.dispatchEvent` avec `vi.spyOn`).
6. Surlignage : même sélection, action « surligner » (repère le libellé via `t(...)` dans `ChatTimeline`/le menu de sélection) → `wsSend` (mocké via `vi.mock("../lib/wsBus", …)`) reçoit `{type:"addHighlight", threadId:"thread-A", …}` avec le texte ; avec `highlights: [{threadId:"thread-A", text: <même texte>, id:"h1"}]`, l'action inverse envoie `{type:"removeHighlight", id:"h1"}`.
7. `workingSince: Date.now()` → le bouton d'arrêt est rendu et `onStop` est appelé au clic.
8. Marques par fil : `localStorage.setItem("atelier-studio.marks.thread-A", JSON.stringify([<mark minimal — forme dans src/lib/annotations.ts migrateMarks>]))` → rendu avec `threadId:"thread-A"` montre la marque ; re-rendu `threadId:"thread-B"` → aucune ; retour à `"thread-A"` → la marque revient.
Chaque `it` porte un commentaire « caractérisation : comportement actuel » quand le comportement surprend.
**Verify**: `npx vitest run src/components/Chat.characterization.test.tsx` → 8 verts.

### Step 4 : Suite
**Verify**: `npx vitest run src/components src/lib` → 0 failed (timeout isolé → relancer seul ; s'il passe, flake sous charge, le noter).

## Test plan

- `i18n.test.ts` : 6 tests ; `Chat.characterization.test.tsx` : 8 tests. Modèle : `ChatTimeline.characterization.test.tsx`.

## Done criteria

- [ ] `npx tsc --noEmit` → exit 0.
- [ ] `npx vitest run src/lib/i18n.test.ts src/components/Chat.characterization.test.tsx` → 14 verts.
- [ ] `git diff --stat -- src/components/Chat.tsx` → vide.
- [ ] `git status --short` limité aux trois fichiers in scope.

## STOP conditions

- `Chat.tsx` a changé depuis `b70ac4b3` (drift).
- Un cas de l'étape 3 exige de modifier `Chat.tsx` (ex. sélection impossible à simuler sans `data-testid`) — rapporte lequel, n'ajoute rien au composant ; livre les autres cas.
- Le test de parité révèle un écart hors du cas `Plural` documenté.

## Maintenance notes

Tout découpage de `Chat.tsx` doit laisser ces 8 tests verts sans les modifier. Reviewer : refuser un test qui n'assert qu'un `vi.fn()` appelé sans regarder ses arguments (cas 5, 6).
