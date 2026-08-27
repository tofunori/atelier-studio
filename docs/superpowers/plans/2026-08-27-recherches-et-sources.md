# Recherches web : requêtes et sources — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une recherche web laisse une trace consultable : ses requêtes en pilules sous la ligne d'outil (aujourd'hui une recherche multi-requêtes affiche un détail VIDE), et une carte « Sources » sous la réponse finale, moissonnée dans les liens du message — jamais de réseau, jamais de donnée inventée.

**Architecture:** Deux couches indépendantes. (1) Rust : `web_search_update` lit `action.queries` (pluriel) en plus de `query`. (2) Frontend : pilules dans la ligne d'outil dépliée, et un module pur `harvestWebSources` + carte rendue sous le dernier message d'un tour qui a cherché. Maquette approuvée : artefact « Narration du tour » (2026-08-27).

**Tech Stack:** Rust (`atelier-providers`), React/TypeScript (vitest), CSS tokens du système.

**Spec:** ce document + la maquette. Décision produit actée : pas de favicons (système sobre — SVG monochromes), domaine en avant, clic = lien normal (le webview d'Atelier route déjà les liens), plafond 6 chips + « n de plus », carte SEULEMENT si le tour contient ≥ 1 action de recherche web.

## Global Constraints

- Rust-first (CLAUDE.md) ; tests Rust : `cd rust && cargo test -p atelier-providers --lib`.
- Front : `npx vitest run src/components/chat src/lib`, puis suite complète en Task 5.
- `npx tsc --noEmit` (ignorer `src/test_auto_review*`) et `npx vite build` verts.
- Jamais pusher ; commits petits, messages en français.
- Design : tailles 10/11/12/13/15, rayons 6/10/999, couleurs par tokens SEULS, aucun `<button>` nu.
- NE PAS toucher au chantier « étapes de raisonnement » (`__thinking-step`, `bold_spans`) — livré par une autre session ; s'il casse, s'arrêter et le signaler, pas le réparer.
- i18n : toute chaîne visible passe par `t()` avec une clé dans les DEUX blocs (fr ~ligne 1319, en ~ligne 2845) de `src/lib/i18n.ts`.

## Contexte

**Formes réelles** (rollouts du 2026-08-26) : l'item webSearch complété porte `action.queries` (liste, parfois 3) et PARFOIS un `query` racine ; jamais d'URLs de résultats. Les URLs arrivent en liens markdown dans la réponse. `web_search_update` ([rust/crates/atelier-providers/src/codex_parse.rs:512](../../../rust/crates/atelier-providers/src/codex_parse.rs)) ne lit que `query` → détail vide en multi-requêtes.

**Rendu des lignes d'outil** : `renderToolLine` ([src/components/Chat.tsx:918](../../../src/components/Chat.tsx)) délègue les `tool_update` à `ToolOutputLine`. Le fil ([ChatTimeline.tsx:970](../../../src/components/chat/ChatTimeline.tsx)) rend les `kind text` en bulles plus bas dans le même `switch` — le site exact se trouve en cherchant `kind === "text"` dans la portion rendu (~ligne 975+).

---

### Task 1: Rust — requêtes au pluriel

**Files:**
- Modify: `rust/crates/atelier-providers/src/codex_parse.rs` (fn `web_search_update`, ~512, + module tests)

**Interfaces:**
- Produces: l'événement webSearch porte `detail` = requêtes jointes par ` · ` (repli : `query` seul) et `input.queries` = liste complète. `input.query` reste (compat).

- [ ] **Step 1: Test qui échoue** (module tests du fichier) :

```rust
    /// L'item webSearch réel porte `action.queries` (liste) et souvent AUCUN
    /// `query` racine : le détail restait vide en multi-requêtes.
    #[test]
    fn web_search_multi_requetes_remplit_le_detail() {
        let item = json!({"id":"ws1","action":{"type":"search",
            "queries":["grammalecte CLI","antidote alternative"]}});
        let e = web_search_update(&item, "completed");
        assert_eq!(e["detail"], "grammalecte CLI · antidote alternative");
        assert_eq!(e["input"]["queries"][1], "antidote alternative");

        let seul = json!({"id":"ws2","query":"albedo MODIS","action":{"type":"search"}});
        let e2 = web_search_update(&seul, "inProgress");
        assert_eq!(e2["detail"], "albedo MODIS");
        assert_eq!(e2["input"]["queries"][0], "albedo MODIS");
    }
```

- [ ] **Step 2:** `cd rust && cargo test -p atelier-providers --lib web_search_multi` → FAIL (detail vide).
- [ ] **Step 3:** Implémenter : construire `queries: Vec<String>` depuis `action.queries` (chaînes non vides), sinon `[query]` si non vide ; `detail = queries.join(" · ")` ; ajouter `"queries": queries` dans `input`.
- [ ] **Step 4:** PASS + suite `atelier-providers` entière verte.
- [ ] **Step 5:** `git add … && git commit -m "fix(providers): webSearch multi-requêtes — détail et input.queries"`

### Task 2: Pilules de requêtes sous la ligne d'outil

**Files:**
- Modify: le composant `ToolOutputLine` (localiser : `grep -rn "function ToolOutputLine" src/components`) 
- Modify: `src/App.css`
- Test: le fichier de test existant du composant (même dossier ; sinon `toolPresentation.test.tsx`)

**Interfaces:**
- Consumes: `event.input.queries` (Task 1).
- Produces: quand `input.queries.length > 1`, une rangée `data-testid="tool-query-chips"` de `span.tool-query-chip` (une pilule par requête) sous la ligne, dans le détail déplié si la ligne en a un, sinon directement sous la ligne. Une seule requête = rien (le détail la montre déjà).

- [ ] **Step 1: Test qui échoue** :

```tsx
  it("une recherche multi-requêtes déplie ses requêtes en pilules", () => {
    renderUi(<ToolOutputLine event={{
      kind: "tool_update", id: "ws1", name: "web_search", status: "completed",
      detail: "a · b", output: "",
      input: { queries: ["grammalecte CLI", "antidote alternative"] },
    } as AgentEvent} />);
    const chips = screen.getByTestId("tool-query-chips");
    expect(chips.textContent).toContain("grammalecte CLI");
    expect(chips.textContent).toContain("antidote alternative");
  });
  it("une requête unique ne produit aucune pilule", () => {
    renderUi(<ToolOutputLine event={{
      kind: "tool_update", id: "ws2", name: "web_search", status: "completed",
      detail: "albedo", output: "", input: { queries: ["albedo"] },
    } as AgentEvent} />);
    expect(screen.queryByTestId("tool-query-chips")).toBeNull();
  });
```

(Adapter import/gabarit au fichier de test réel ; si `ToolOutputLine` n'est pas exporté, l'exporter.)

- [ ] **Step 2:** FAIL. **Step 3:** Implémenter + CSS :

```css
/* pilules de requêtes d'une recherche web (maquette « Narration du tour ») */
.tool-query-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 2px 0 2px 24px; }
.tool-query-chip { font-size: var(--fs-s); color: var(--text-muted);
  background: var(--surface-inset); border-radius: 999px; padding: 2px 10px;
  max-width: 38ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

- [ ] **Step 4:** PASS + `npx vitest run src/components/chat` vert + tsc.
- [ ] **Step 5:** `git commit -m "feat(chat): pilules de requêtes sous la ligne de recherche web"`

### Task 3: Module pur de moisson des liens

**Files:**
- Create: `src/lib/webSources.ts`
- Test: `src/lib/webSources.test.ts`

**Interfaces:**
- Produces: `export type WebSource = { url: string; label: string | null; domain: string };`
  `export function harvestWebSources(markdown: string, cap?: number): { sources: WebSource[]; more: number }` — liens markdown `[label](https://…)` puis URLs nues http(s) ; dédoublonnage par URL normalisée (sans fragment ni `/` final) ; `domain` = hostname sans `www.` ; `cap` défaut 6, `more` = rejetés par le plafond.

- [ ] **Step 1: Test qui échoue** (fichier complet) :

```ts
import { describe, expect, it } from "vitest";
import { harvestWebSources } from "./webSources";

describe("harvestWebSources", () => {
  it("liens markdown : url, label, domaine sans www", () => {
    const { sources } = harvestWebSources("Voir [Grammalecte](https://www.grammalecte.net/doc) et fin.");
    expect(sources).toEqual([{ url: "https://www.grammalecte.net/doc", label: "Grammalecte", domain: "grammalecte.net" }]);
  });
  it("URLs nues acceptées, ponctuation finale détachée, non-http ignoré", () => {
    const { sources } = harvestWebSources("Docs: https://a.org/x. Et file:///tmp/x, localhost aussi http://localhost:3000/y");
    expect(sources.map((s) => s.url)).toEqual(["https://a.org/x", "http://localhost:3000/y"]);
    expect(sources[0].label).toBeNull();
  });
  it("dédoublonne fragment et slash final compris", () => {
    const { sources } = harvestWebSources("[a](https://a.org/x/) puis https://a.org/x#frag");
    expect(sources).toHaveLength(1);
    expect(sources[0].label).toBe("a");
  });
  it("plafond : cap sources, le reste compté", () => {
    const md = Array.from({ length: 9 }, (_, i) => `[s${i}](https://s${i}.org)`).join(" ");
    const { sources, more } = harvestWebSources(md, 6);
    expect(sources).toHaveLength(6);
    expect(more).toBe(3);
  });
  it("URL invalide pour new URL() : ignorée sans lancer", () => {
    expect(harvestWebSources("https://").sources).toEqual([]);
  });
});
```

- [ ] **Step 2:** FAIL (module absent). **Step 3:** Implémenter (regex `\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)` puis `https?:\/\/[^\s<>()"']+` hors spans déjà pris ; strip `.,;:!?)` finaux ; `new URL` dans un try — invalide = ignoré ; le premier vu garde son label).
- [ ] **Step 4:** `npx vitest run src/lib/webSources.test.ts` → 5 PASS.
- [ ] **Step 5:** `git commit -m "feat(lib): moisson des sources web d'un message"`

### Task 4: Carte « Sources » sous la réponse d'un tour qui a cherché

**Files:**
- Create: `src/components/chat/SourcesCard.tsx`
- Modify: `src/components/chat/ChatTimeline.tsx` (site de rendu des `kind text`), `src/lib/i18n.ts` (clé `chat.sources` = "Sources" dans les DEUX blocs), `src/App.css`
- Test: `src/components/chat/SourcesCard.test.tsx`

**Interfaces:**
- Consumes: `harvestWebSources` (Task 3).
- Produces: `export function SourcesCard({ markdown }: { markdown: string })` → `null` si aucune source ; sinon `<div className="sources-card" data-testid="sources-card">` avec libellé `t("chat.sources")` et une chip `<a className="source-chip" href={url} target="_blank" rel="noreferrer">` par source : globe SVG monochrome inline (stroke 1.3), `<span className="source-chip-domain">{domain}</span>`, label en suite si présent ; « {more} de plus » en fin si `more > 0` (clé i18n `chat.sources-more` = "{n} de plus" / "{n} more").
- Branchement : au site ChatTimeline des `kind text`, rendre `<SourcesCard markdown={e.text} />` sous la bulle UNIQUEMENT si un événement `tool`/`tool_update` situé entre le `user` précédent et ce texte a la sémantique recherche web (réutiliser le prédicat de nom de [toolPresentation.tsx:297](../../../src/components/chat/toolPresentation.tsx) — l'extraire en helper exporté `isWebSearchName(name)` plutôt que dupliquer la liste).

- [ ] **Step 1: Tests qui échouent** :

```tsx
  it("rend les chips de domaine et le plafond", () => {
    renderUi(<SourcesCard markdown={"Voir [G](https://www.grammalecte.net/doc) et https://a.org/x"} />);
    const carte = screen.getByTestId("sources-card");
    expect(carte.textContent).toContain("grammalecte.net");
    expect(carte.textContent).toContain("a.org");
    expect(carte.querySelectorAll("a.source-chip")).toHaveLength(2);
  });
  it("aucune source → aucun rendu", () => {
    renderUi(<SourcesCard markdown={"Pas de lien ici."} />);
    expect(screen.queryByTestId("sources-card")).toBeNull();
  });
```

Plus un test d'intégration au niveau `Chat` (gabarit `turnAnatomy.test.tsx`) : `[user, tool_update web_search, text avec lien]` → `sources-card` présent ; `[user, text avec lien]` sans recherche → absent.

- [ ] **Step 2:** FAIL. **Step 3:** Implémenter + CSS :

```css
/* carte Sources (maquette « Narration du tour ») : chips domaine, SVG monochrome */
.sources-card { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border);
  display: flex; flex-direction: column; gap: 6px; }
.sources-card-label { font-size: var(--fs-s); letter-spacing: .05em;
  text-transform: uppercase; color: var(--text-disabled); font-weight: 500; }
.sources-card-row { display: flex; flex-wrap: wrap; gap: 6px; }
.source-chip { display: inline-flex; align-items: center; gap: 6px;
  font-size: var(--fs-m); color: var(--text-muted); background: var(--bg-card);
  border: 1px solid var(--border); border-radius: 999px; padding: 3px 11px 3px 8px;
  max-width: 34ch; text-decoration: none;
  transition: color var(--motion-fast) ease, border-color var(--motion-fast) ease; }
.source-chip:hover { color: var(--fg); border-color: var(--border2); }
.source-chip svg { width: 12px; height: 12px; flex: none; color: var(--text-disabled); }
.source-chip-domain { font-weight: 500; color: var(--fg); }
.source-chip-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

- [ ] **Step 4:** PASS (composant + intégration) + `npx vitest run src/components/chat` vert.
- [ ] **Step 5:** `git commit -m "feat(chat): carte Sources sous la réponse d'un tour avec recherche web"`

### Task 5: Validation finale

- [ ] `cd rust && cargo test -p atelier-providers --lib` — vert (les tests __thinking-step de l'autre session inclus : s'ils cassent, STOP et signaler).
- [ ] `npx vitest run src/components src/lib` — vert.
- [ ] `npx tsc --noEmit` et `npx vite build` — verts.
- [ ] `cd sidecar && npx vitest run` — vert.
- [ ] Pas de relance d'app (session principale). Commit final si miettes.
