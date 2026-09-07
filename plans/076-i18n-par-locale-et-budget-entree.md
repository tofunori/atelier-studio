# Plan 076 : L'entrée ne charge qu'une langue, et le budget de 1 024 Ko retrouve sa marge

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat b70ac4b3..HEAD -- src/lib/i18n.ts src/main.tsx scripts/check_entry_budget.mjs`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/071 (le test de parité protège le découpage)
- **Category**: perf
- **Planned at**: commit `b70ac4b3`, 2026-09-06

## Why this matters

Le chunk d'entrée pèse **1 023 Ko pour un budget CI de 1 024 Ko** : la
prochaine dépendance casse la CI, et rien n'est prévu. Le garde-fou lui-même
désigne la suite : « découper i18n.ts par locale (151 KB de source, fr+en
chargés ensemble) avant de toucher à cette valeur ». Aujourd'hui `t()` lit
`currentLanguage === "en" ? en : fr` sur deux dictionnaires embarqués ; un
utilisateur charge et parse les deux langues à chaque démarrage. Après ce plan,
seule la locale résolue est dans l'entrée (l'autre est un chunk paresseux),
`t()` reste synchrone, et le budget regagne ~60-70 Ko.

## Current state

- `src/lib/i18n.ts` : `const fr = {…}` (l.7-1690), `const en: Record<keyof typeof fr, string> = {…}` (l.1692-~3360) ; `export type I18nKey = keyof typeof fr` ; `setLanguage(next)` (l.3401-3407) pose `languageSetting`/`currentLanguage` et émet `LANGUAGE_CHANGED_EVENT` ; `t()` (l.3409-3414) :
  ```ts
  const dict = currentLanguage === "en" ? en : fr;
  const template = dict[key] ?? fr[key] ?? key;
  ```
  `resolveLanguage`, `readStoredLanguage` (localStorage `SETTINGS_KEY`), `getResolvedLanguage()` existent.
- `src/main.tsx` : plusieurs `ReactDOM.createRoot(…).render(…)` (l.94-178, un par banc + l'app réelle en dernier, l.~178) — le rendu de l'app est synchrone ; `t()` est appelé dès le premier rendu (`App.tsx` importe `setLanguage, t` l.83 et fait 184 appels).
- `scripts/check_entry_budget.mjs` : `BUDGET_KB = 1024` (l.16), entrée = plus gros `dist/assets/index-*.js`, signatures interdites (`xterm`, `katex-version`, `math-inline`), refus des chunks de banc.
- Contrainte : `t()` doit rester synchrone (184 appels dans App.tsx seul, des centaines ailleurs) — pas d'API async pour les composants.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Budget | `npx vite build && node scripts/check_entry_budget.mjs` | `✓ entrée … ≤ 1024 KB` avec un chiffre **< 960 Ko** |
| Tests | `npx vitest run src/lib/i18n.test.ts src/App.settings-sheet.test.tsx src/components/settings` | 0 failed |
| Vérif globale | `npm run verify` | exit 0 |

## Scope

**In scope**: `src/lib/i18n.ts`, `src/lib/i18n/fr.ts` et `src/lib/i18n/en.ts` (créer), `src/main.tsx`, `src/lib/i18n.test.ts` (adapter), `scripts/check_entry_budget.mjs` (uniquement pour ajouter la signature qui garantit que la seconde langue n'est PAS dans l'entrée).
**Out of scope**: tout composant qui appelle `t()` ; les libellés eux-mêmes ; la valeur du budget (`BUDGET_KB` reste 1024 — la marge doit venir du découpage).

## Git workflow

Branche `advisor/076-i18n-par-locale` ; commits par étape (`refactor(i18n): dictionnaires par fichier`, `perf(i18n): locale chargée à la demande`, `build: signature anti-retour de la seconde langue`) ; ne pas pousser.

## Steps

### Step 1 : Dictionnaires dans leurs fichiers, sans changement de comportement
Déplacer `fr` dans `src/lib/i18n/fr.ts` (`export default { … } as const`) et `en` dans `src/lib/i18n/en.ts` (`export default { … } satisfies Record<keyof typeof fr, string>` — importer le type de `fr`). `i18n.ts` les importe statiquement pour l'instant (`import fr from "./i18n/fr"`) et réexporte `fr`/`en` (le test de parité du plan 071 les lit).
**Verify**: `npx tsc --noEmit` → exit 0 ; `npx vitest run src/lib/i18n.test.ts` → vert ; budget inchangé (≈1 023 Ko).

### Step 2 : Chargement paresseux de la langue non active
Dans `i18n.ts` : un registre `const dictionaries: Partial<Record<Lang, Dictionary>> = {}` ; `fr` reste importé statiquement **seulement si** la locale par défaut est `fr` — pour ne rien embarquer d'inutile, faire les deux paresseux : `export async function loadLanguage(lang: Lang): Promise<void>` fait `dictionaries[lang] ??= (await import(\`./i18n/${lang}.ts\`)).default` (écrire les deux branches explicites `lang === "en" ? import("./i18n/en") : import("./i18n/fr")` pour que Vite crée deux chunks). `t()` lit `dictionaries[currentLanguage] ?? dictionaries.fr ?? {}` et retombe sur `key` — jamais d'exception si un dictionnaire manque. `setLanguage(next)` devient : résoudre, `await loadLanguage(...)`, puis poser `currentLanguage` et émettre l'événement (signature `Promise<void>` ; vérifier les appelants par `grep -rn "setLanguage(" src` et ajouter `void`/`await` où nécessaire — s'il y en a plus de 5, STOP et rapporte).
**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3 : La langue est prête avant le premier rendu
Dans `src/main.tsx`, avant le `createRoot(...).render(<App/>)` de l'app réelle (pas les bancs) : `await loadLanguage(getResolvedLanguage())` (le module est déjà en top-level `async` ou passer par une IIFE `void (async () => { … })()` — imiter ce que fait déjà le fichier pour les bancs paresseux si c'est le cas). Les bancs (`#uibench`, `#chatbench`…) chargent `fr` de la même façon.
**Verify**: `npx vite build && node scripts/check_entry_budget.mjs` → ✓ avec entrée < 960 Ko et présence de deux chunks `fr-*.js`/`en-*.js` dans `dist/assets` (`ls dist/assets | grep -E "^(fr|en)-"`).

### Step 4 : Garde-fou
Dans `check_entry_budget.mjs`, ajouter à la liste des signatures interdites une chaîne présente **uniquement** dans `en.ts` (choisir un libellé anglais long et stable, ex. la valeur d'une clé de réglages ; documenter en commentaire) : si elle revient dans l'entrée, la CI échoue.
**Verify**: `node scripts/check_entry_budget.mjs` → ✓ ; puis, temporairement, importer `en` statiquement dans `i18n.ts`, rebuild → ✗ « est revenu dans l'entrée » ; retirer l'import temporaire.

### Step 5 : Tests
Adapter/compléter `src/lib/i18n.test.ts` : (a) `t()` avant tout `loadLanguage` retourne la clé sans planter ; (b) après `await loadLanguage("en")` + `await setLanguage("en")`, `t()` renvoie l'anglais ; (c) la parité FR/EN (plan 071) lit maintenant les deux fichiers.
**Verify**: `npx vitest run src/lib/i18n.test.ts src/App.settings-sheet.test.tsx src/components/settings` → 0 failed ; `npm run verify` → exit 0 (si des tests frontend échouent en **timeout** seulement, les rejouer seuls — flake connu sous charge).

## Done criteria

- [ ] `node scripts/check_entry_budget.mjs` → entrée < 960 Ko, signature EN absente.
- [ ] `ls dist/assets | grep -E "^(fr|en)-"` → deux chunks.
- [ ] `npx tsc --noEmit` → exit 0 ; `npm run verify` → exit 0.
- [ ] `git status --short` limité au scope.

## STOP conditions

- Plus de 5 appelants de `setLanguage` à adapter, ou un appelant qui exige un retour synchrone.
- Un test de composant dépend d'un libellé anglais rendu **avant** que `loadLanguage` ait pu s'exécuter (jsdom) — rapporte le test ; ne mets pas `en` en import statique pour le contourner.
- Le budget ne descend pas sous 1 000 Ko après l'étape 3 (le découpage n'a pas l'effet escompté) — rapporte les tailles réelles des chunks.

## Maintenance notes

Ajouter une troisième langue = un fichier `src/lib/i18n/<lang>.ts` et une branche dans `loadLanguage` ; le test de parité doit être étendu à chaque nouveau dictionnaire. Reviewer : vérifier qu'aucun composant n'importe `fr`/`en` directement (grep) — seul `t()` doit lire les dictionnaires.
