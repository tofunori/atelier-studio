# Plan 003: Fidélité de l'historique rechargé (ne plus perdre les messages utilisateur commençant par « < », garder le détail des outils)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat fe78ede..HEAD -- sidecar/history.mjs sidecar/providers/claude.mjs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `fe78ede`, 2026-07-07

## Why this matters

Après un redémarrage de l'app, le transcript d'un thread Claude est reconstruit depuis le JSONL de session (`getSessionMessages` du SDK) par `claudeHistory()` dans `sidecar/history.mjs`. Deux pertes de fidélité minent la confiance dans ce transcript :

1. **Messages utilisateur avalés** : le filtre anti-injections système est `if (text && !text.startsWith("<"))` (`history.mjs:51`). Tout message utilisateur légitime commençant par `<` — un bout de HTML/XML collé, `<div>…`, une balise LaTeX-ML, etc. — disparaît de l'historique rechargé. L'utilisateur voit une réponse de l'agent sans la question qui l'a produite.
2. **Lignes d'outil dégradées** : le rechargement émet `{kind:"tool", name}` sans `detail` (`history.mjs:58`), alors qu'en live le même événement porte `detail` (« Bash(git status) », chemin du fichier édité…) via `toolDetail()` de `sidecar/providers/claude.mjs:6-19`. Après reload, le transcript montre des lignes « Bash » nues — l'historique ne raconte plus ce qui a été fait.

## Current state

- `sidecar/history.mjs` — reconstruit les événements d'affichage depuis une session Claude persistée. Extrait (lignes 38-61) :
  ```js
  if (m.type === "user") {
    ...
    text = stripHandoff(text.trim());
    // filtrer les injections systèmes (reminders, etc.)
    if (text && !text.startsWith("<")) {
      events.push({ kind: "user", text });
    }
  }
  if (m.type === "assistant" && Array.isArray(msg.content)) {
    for (const b of msg.content) {
      if (b.type === "text" && b.text?.trim()) events.push({ kind: "text", text: b.text });
      if (b.type === "tool_use") events.push({ kind: "tool", name: b.name });
    }
  }
  ```
- `sidecar/providers/claude.mjs:6-19` — `toolDetail(name, input)` : fonction pure exportée, déjà testée pour l'usage live ; produit le détail court d'un `tool_use` à partir de son `input`.
- Les vraies injections système que le filtre vise commencent par des balises précises : `<system-reminder>`, `<command-name>`, `<command-message>`, `<local-command-stdout>`, `<task-notification>`. (Vérifiable dans n'importe quel JSONL de `~/.claude/projects/`.)
- Front : `getHistory` remplit le transcript seulement si vide (`src/App.tsx:582-587`) — pas de changement front requis, les événements rechargés ont la même forme que les événements live.
- Conventions : ESM `.mjs`, commentaires français ; tests vitest à côté du fichier (modèle : `sidecar/router.test.mjs`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Tests sidecar | `cd sidecar && npx vitest run` | tous verts |

## Scope

**In scope** :
- `sidecar/history.mjs`
- `sidecar/history.test.mjs` (à créer)

**Out of scope** :
- `sidecar/providers/claude.mjs` — on importe `toolDetail`, on ne le modifie pas.
- `src/` (front) — la forme des événements ne change pas (ajout d'un champ optionnel `detail` déjà connu du front).
- La restitution du thinking, des `edit` (±lignes) et de l'usage dans l'historique rechargé — pertes assumées pour l'instant (voir Maintenance notes).

## Git workflow

- Branche : `advisor/003-history-reload-fidelity`
- Message : ex. `fix(sidecar): historique rechargé fidèle (messages «<…» gardés, détail des outils)`
- Ne pas pusher sans demande explicite.

## Steps

### Step 1: Filtre d'injections ciblé au lieu de « commence par < »

Dans `history.mjs`, remplacer le test `!text.startsWith("<")` par un filtre sur les balises système connues :

```js
const SYSTEM_TAG = /^<(system-reminder|command-name|command-message|command-args|local-command-stdout|local-command-stderr|task-notification|system-warning)\b/;
...
if (text && !SYSTEM_TAG.test(text)) {
  events.push({ kind: "user", text });
}
```

Garder le commentaire français existant en l'adaptant (« filtrer les injections système (reminders, sorties de commandes)… »).

**Verify**: `cd sidecar && npx vitest run` → verts (les nouveaux tests du Step 3 couvrent ce comportement).

### Step 2: Restituer le détail des outils

Dans `history.mjs` :
1. Ajouter l'import : `import { toolDetail } from "./providers/claude.mjs";`
2. Remplacer la ligne `if (b.type === "tool_use") events.push({ kind: "tool", name: b.name });` par :
   ```js
   if (b.type === "tool_use") events.push({ kind: "tool", name: b.name, detail: toolDetail(b.name, b.input) });
   ```

Note : importer `./providers/claude.mjs` tire `resolveBin` au chargement du module (import top-level déjà présent partout dans le sidecar) — c'est déjà le cas via `router.mjs`, pas de nouveau coût. Si l'import crée un souci de dépendance circulaire (il ne devrait pas : `claude.mjs` n'importe pas `history.mjs`), STOP.

**Verify**: `grep -n "toolDetail" sidecar/history.mjs` → import + usage présents.

### Step 3: Tests

Créer `sidecar/history.test.mjs`. `claudeHistory` appelle `getSessionMessages` du SDK — pour rester hermétique, extraire la boucle de transformation dans une fonction pure exportée `eventsFromSessionMessages(msgs)` que `claudeHistory` appelle, et tester cette fonction (même approche pure-helpers que `f853682` dans l'historique git). Cas à couvrir :

1. Message utilisateur `"<div>hello</div>"` → **conservé** (kind user).
2. Message utilisateur `"<system-reminder>…"` et `"<command-name>/foo</command-name>…"` → **filtrés**.
3. Message utilisateur normal → conservé ; tool_result-only → ignoré (comportement existant).
4. `tool_use` Bash avec `input:{command:"git status"}` → événement `{kind:"tool", name:"Bash", detail:"git status"}`.
5. Bloc texte assistant → `{kind:"text"}` (non-régression).

`findRevertPoint` n'est pas modifié — pas de test requis.

**Verify**: `cd sidecar && npx vitest run` → tous verts, incluant ≥5 nouveaux.

## Done criteria

- [ ] `cd sidecar && npx vitest run` exit 0, nouveaux tests history présents
- [ ] `grep -n 'startsWith("<")' sidecar/history.mjs` → aucun résultat
- [ ] `grep -n "toolDetail" sidecar/history.mjs` → import + usage
- [ ] `git status` : seuls `sidecar/history.mjs`, `sidecar/history.test.mjs` (et `plans/README.md`) modifiés
- [ ] Ligne de statut mise à jour dans `plans/README.md`

## STOP conditions

- Les extraits « Current state » ne correspondent plus au code.
- L'import de `./providers/claude.mjs` dans `history.mjs` crée une dépendance circulaire ou un effet de bord au chargement (échec des tests d'un autre fichier).
- Vous découvrez dans un JSONL réel une famille d'injections système qui ne commence PAS par une des balises listées : ne pas élargir le regex au hasard — stop et rapporter avec l'exemple.

## Maintenance notes

- Si Claude Code ajoute de nouvelles balises d'injection (`<nouvelle-balise>`), les messages correspondants réapparaîtront dans l'historique — ajouter la balise au regex `SYSTEM_TAG`.
- Reporté hors plan (pertes de fidélité assumées au reload) : blocs thinking, lignes `edit` avec ±lignes, usage/coût par tour. Les restituer exigerait d'élargir `eventsFromSessionMessages` — possible plus tard sans changer le front pour thinking (kind déjà géré).
- En review : vérifier qu'un export de conversation (`exportThread`, `router.mjs:382-404`) reste correct — il consomme les mêmes événements.
