# Réglages — Lot B1 : la section Modèles en console (plan d'implémentation)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Les modèles cessent d'être des rangées de formulaire éclatées sur trois anciennes sections et deviennent un tableau dense comparable, où le modèle par défaut, le favori et l'effort se règlent sur la ligne même.

**Architecture:** Un composant de présentation `ModelsGrid` reçoit des lignes déjà dérivées et n'a aucune connaissance du WebSocket ; une fonction pure `buildModelRows` fusionne le catalogue des fournisseurs, les slugs personnalisés, les favoris et les efforts en une liste de lignes ; `Models.tsx` se réduit à l'abonnement, la dérivation et le rendu. La double liste de fournisseurs héritée du lot 1 disparaît par construction.

**Tech Stack:** React 18, TypeScript, Vitest + Testing Library, primitives `src/components/settings/primitives/`, jetons CSS d'`App.css`.

**Spec:** `docs/superpowers/specs/2026-08-23-refonte-reglages-design.md` — §6.1, §6.2 et la direction « Console » de l'artefact des cinq directions.

## Découpage du lot B

Le lot B reconstruit l'apparence de toutes les sections. Il est découpé, chaque sous-lot étant livrable et vérifiable seul :

| Sous-lot | Contenu | Plan |
|---|---|---|
| **B1** | **Section Modèles en tableau dense, défauts sur place, favoris généralisés** | **ce document** |
| B2 | Routeur opencode : `RoutedModel` en Rust, regroupement par modèle, épinglage par route | à écrire |
| B3 | Recherche globale traversant les sections | à écrire |
| B4 | Section Extensions : skills, plugins, MCP, matrice, installation | à écrire |
| B5 | Apparence : groupes et contrôles vivants | à écrire |

B1 d'abord parce que la sélection des modèles est le grief numéro un, et parce que c'est la section qui dimensionne la feuille.

## Ce que le lot A a rendu possible

Deux corrections du lot A sont des **prérequis mécaniques** de ce lot, déjà en place :

- `.settings-page.embedded .set-body` n'a plus de plafond à 860 px ni les rembourrages de plein écran — la largeur de la feuille atteint enfin le contenu.
- Le seuil de nav compacte mesure la **feuille** et non la fenêtre (`ResizeObserver`), donc le repli en cartes de ce lot s'appuiera sur une mesure vraie.

Et une leçon du lot A vaut pour tout ce lot : **jsdom ne calcule aucune mise en page**. Aucun test ne prouvera qu'un tableau tient dans la largeur disponible. Les points de contrôle visuels par Thierry sont donc inscrits dans le plan, pas repoussés à la fin.

## Global Constraints

Copiées verbatim de CLAUDE.md. Elles s'appliquent à **chaque** tâche.

- **Aucun `<button>` nu** hors `src/components/ui/` et `src/components/shadcn/` — `Button`, `IconButton`, `RowButton`. Verrouillé par `src/components/ui/css-contract.test.ts`.
- **Tailles de texte** : 10 / 11 / 12 / 13 / 15 px uniquement (`--fs-xs` … `--fs-xl`).
- **Poids** : 400 / 500 / 600. **Rayons** : 6 / 10 / 999 px. **Espacements** : multiples de 4.
- **`font-variant-numeric: tabular-nums` sur tout chiffre aligné** — colonnes de contexte, compteurs.
- **Couleurs** : toute couleur via variable CSS, jamais de hex en dur.
- **Aucun emoji** ; icônes = SVG monochromes, stroke 1.3–1.5.
- **Motion** : 120–150 ms, jamais plus de 200 ms ; `prefers-reduced-motion` respecté.
- **Français** pour les commentaires de code et les messages de commit.
- `npx tsc --noEmit` et `npx vite build` doivent passer.
- **Ne pas pusher** sans demande explicite.

## Structure de fichiers

```
src/test/fixtures/sidecar.ts        MODIFIÉ  — FakeWS devient un EventTarget
src/components/settings/models/
  buildModelRows.ts                 NOUVEAU  — dérivation pure, testable sans React
  buildModelRows.test.ts            NOUVEAU
  ModelsGrid.tsx                    NOUVEAU  — tableau dense, présentationnel
  ModelsGrid.test.tsx               NOUVEAU
src/components/settings/sections/
  Models.tsx                        MODIFIÉ  — abonnement + dérivation + rendu
src/App.css                         MODIFIÉ  — styles du tableau
```

---

### Task 1 : `FakeWS` devient un `EventTarget`

**Prérequis bloquant.** Les sections s'abonnent par `addEventListener`, mais le double de test n'expose que des `onmessage`. Aujourd'hui, monter `Models` avec un socket ouvert **plante** — les tests du lot 1 contournent en gardant le socket en `CONNECTING`, ce qui interdit de tester quoi que ce soit qui dépende du catalogue.

**Files:**
- Modify: `src/test/fixtures/sidecar.ts`
- Test: `src/test/fixtures/sidecar.test.ts` (créer s'il n'existe pas)

**Interfaces:**
- Produces: `FakeWS` supportant **à la fois** `addEventListener("message"|"open"|"close"|"error")` et les anciens `onmessage`/`onopen`/`onclose`/`onerror`, plus une méthode d'émission utilisable par les tests.

- [ ] **Step 1: Écrire le test qui échoue**

```ts
// FakeWS doit se comporter comme un vrai WebSocket : les sections des réglages
// s'abonnent par addEventListener, pas par onmessage.
import { describe, expect, it, vi } from "vitest";
import { FakeWS } from "./sidecar";

describe("FakeWS", () => {
  it("délivre les messages aux écouteurs addEventListener", () => {
    const ws = new FakeWS("ws://test");
    const vu: unknown[] = [];
    ws.addEventListener("message", (e) => vu.push(JSON.parse((e as MessageEvent).data)));
    ws.emit({ type: "providerStatus", providers: [] });
    expect(vu).toEqual([{ type: "providerStatus", providers: [] }]);
  });

  it("continue de délivrer à onmessage — l'ancien style reste valide", () => {
    const ws = new FakeWS("ws://test");
    const vu: unknown[] = [];
    ws.onmessage = (e) => vu.push(JSON.parse(e.data));
    ws.emit({ type: "ping" });
    expect(vu).toEqual([{ type: "ping" }]);
  });

  it("removeEventListener détache réellement", () => {
    const ws = new FakeWS("ws://test");
    const fn = vi.fn();
    ws.addEventListener("message", fn);
    ws.removeEventListener("message", fn);
    ws.emit({ type: "ping" });
    expect(fn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

```bash
npx vitest run src/test/fixtures/sidecar.test.ts
```

Attendu : ÉCHEC — `ws.addEventListener is not a function`.

- [ ] **Step 3: Implémenter**

Faire hériter `FakeWS` d'`EventTarget`, conserver les propriétés `onmessage`/`onopen`/`onclose`/`onerror` en les branchant sur les mêmes événements, et exposer `emit(payload: unknown)` qui construit un `MessageEvent` avec `data: JSON.stringify(payload)` et le dispatche.

**Ne casse pas l'existant** : d'autres tests du dépôt utilisent déjà `FakeWS` avec `onmessage` et `FakeWS.instances`. Lance la suite complète pour le vérifier, pas seulement les tests des réglages.

- [ ] **Step 4: Vérifier**

```bash
npx vitest run src/test/fixtures/sidecar.test.ts
npx vitest run          # suite complète : aucun test existant ne doit casser
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/test/fixtures/sidecar.ts src/test/fixtures/sidecar.test.ts
git commit -m "test(infra): FakeWS devient un EventTarget

Les sections des réglages s'abonnent par addEventListener ; le double ne
supportait que onmessage, ce qui faisait planter Models avec un socket ouvert
et interdisait de tester quoi que ce soit dépendant du catalogue.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2 : `buildModelRows`, la dérivation pure

Toute la logique de fusion vit ici, hors de React, donc testable exhaustivement et sans montage.

**Files:**
- Create: `src/components/settings/models/buildModelRows.ts`
- Test: `src/components/settings/models/buildModelRows.test.ts`

**Interfaces:**
- Consumes: `ProviderCatalogRow` (`../shared`), `Settings` (`../../../lib/settings`).
- Produces:

```ts
export type ModelRow = {
  key: string;            // "provider:modelId", identifiant stable de ligne
  provider: string;
  providerLabel: string;
  modelId: string;
  label: string;          // libellé humain (modelDisplayLabel)
  isDefault: boolean;     // défaut DE SON fournisseur
  isFavorite: boolean;
  effort: string;         // "" = défaut du CLI
  efforts: string[];      // paliers proposés par ce fournisseur
  status: "ready" | "auth" | "absent";
  version: string | null;
  custom: boolean;        // slug ajouté à la main
};

export function buildModelRows(
  provs: ProviderCatalogRow[] | null,
  s: Settings,
): { rows: ModelRow[]; unavailable: ProviderCatalogRow[] };
```

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
// Dérivation des lignes de modèles (lot B1) : fusionne catalogue, slugs
// personnalisés, favoris et efforts. Pure, donc testable sans montage.
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../../lib/settings";
import type { ProviderCatalogRow } from "../shared";
import { buildModelRows } from "./buildModelRows";

const claude: ProviderCatalogRow = {
  id: "claude", label: "Claude Code", version: "2.4.1", ok: true, kind: "cli",
  models: ["claude-opus-5[1m]", "claude-sonnet-5[1m]"],
  defaultModel: "claude-opus-5[1m]", efforts: ["", "low", "high", "xhigh"],
};

describe("buildModelRows", () => {
  it("produit une ligne par modèle du catalogue", () => {
    const { rows } = buildModelRows([claude], { ...DEFAULT_SETTINGS });
    expect(rows.map((r) => r.modelId)).toEqual(["claude-opus-5[1m]", "claude-sonnet-5[1m]"]);
  });

  it("marque comme défaut le modèle retenu POUR CE FOURNISSEUR", () => {
    const s = { ...DEFAULT_SETTINGS, defaultModel: { ...DEFAULT_SETTINGS.defaultModel, claude: "claude-sonnet-5[1m]" } };
    const { rows } = buildModelRows([claude], s);
    expect(rows.filter((r) => r.isDefault).map((r) => r.modelId)).toEqual(["claude-sonnet-5[1m]"]);
  });

  it("un seul défaut par fournisseur, même si deux fournisseurs coexistent", () => {
    const codex: ProviderCatalogRow = {
      id: "codex", label: "Codex", version: "0.58", ok: true, kind: "cli",
      models: ["gpt-5.6-sol"], defaultModel: "gpt-5.6-sol", efforts: ["", "medium"],
    };
    const { rows } = buildModelRows([claude, codex], { ...DEFAULT_SETTINGS });
    const parProvider = rows.filter((r) => r.isDefault).map((r) => r.provider);
    expect(new Set(parProvider).size).toBe(parProvider.length);
  });

  it("reporte les favoris de TOUS les fournisseurs, pas seulement opencode", () => {
    const s = { ...DEFAULT_SETTINGS, favoriteModels: { claude: ["claude-sonnet-5[1m]"] } };
    const { rows } = buildModelRows([claude], s);
    expect(rows.find((r) => r.modelId === "claude-sonnet-5[1m]")?.isFavorite).toBe(true);
    expect(rows.find((r) => r.modelId === "claude-opus-5[1m]")?.isFavorite).toBe(false);
  });

  it("reporte l'effort par modèle depuis la clé « provider:modelId »", () => {
    const s = { ...DEFAULT_SETTINGS, modelEfforts: { "claude:claude-opus-5[1m]": "xhigh" } };
    const { rows } = buildModelRows([claude], s);
    expect(rows.find((r) => r.modelId === "claude-opus-5[1m]")?.effort).toBe("xhigh");
  });

  it("ajoute les slugs personnalisés et les marque comme tels", () => {
    const s = { ...DEFAULT_SETTINGS, customModels: [{ provider: "claude", id: "claude-experimental" }] };
    const { rows } = buildModelRows([claude], s);
    const custom = rows.find((r) => r.modelId === "claude-experimental");
    expect(custom?.custom).toBe(true);
  });

  it("sépare les fournisseurs indisponibles au lieu de les mêler aux lignes", () => {
    const grok: ProviderCatalogRow = { id: "grok", label: "Grok CLI", version: null, ok: false, kind: "cli", models: [] };
    const { rows, unavailable } = buildModelRows([claude, grok], { ...DEFAULT_SETTINGS });
    expect(rows.every((r) => r.provider !== "grok")).toBe(true);
    expect(unavailable.map((p) => p.id)).toEqual(["grok"]);
  });

  it("ne plante pas sur un catalogue nul ni sur une entrée sans models", () => {
    expect(() => buildModelRows(null, { ...DEFAULT_SETTINGS })).not.toThrow();
    const aux: ProviderCatalogRow = { id: "aux", label: "Aux", version: null, ok: true };
    expect(() => buildModelRows([aux], { ...DEFAULT_SETTINGS })).not.toThrow();
  });

  it("les clés de ligne sont uniques et stables", () => {
    const { rows } = buildModelRows([claude], { ...DEFAULT_SETTINGS });
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
    expect(rows[0].key).toBe("claude:claude-opus-5[1m]");
  });
});
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

```bash
npx vitest run src/components/settings/models/buildModelRows.test.ts
```

Attendu : ÉCHEC — module introuvable.

- [ ] **Step 3: Implémenter**

Écrire `buildModelRows` en respectant les tests ci-dessus. Réutilise `modelDisplayLabel` et `providerModels` de `src/components/settings/models.ts` — **ne duplique pas** ces helpers, le lot 1 vient justement de les dédupliquer. Le statut se dérive de `ok` et du champ d'authentification du catalogue ; si le catalogue ne distingue pas « absent » de « non connecté », ne l'invente pas : réduis à deux états et note-le dans le rapport.

- [ ] **Step 4: Vérifier**

```bash
npx vitest run src/components/settings/models/buildModelRows.test.ts
npx tsc --noEmit
```

Attendu : 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/models
git commit -m "feat(reglages): dérivation pure des lignes de modèles

Fusionne catalogue, slugs personnalisés, favoris et efforts en une liste de
lignes. Les favoris cessent d'être réservés à opencode.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3 : `ModelsGrid`, le tableau dense

Composant **présentationnel** : il reçoit des lignes et des rappels, ne connaît ni WebSocket ni `Settings`.

**Files:**
- Create: `src/components/settings/models/ModelsGrid.tsx`
- Test: `src/components/settings/models/ModelsGrid.test.tsx`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: `ModelRow` (tâche 2).
- Produces:

```ts
export function ModelsGrid(props: {
  rows: ModelRow[];
  onSetDefault: (row: ModelRow) => void;
  onToggleFavorite: (row: ModelRow) => void;
  onSetEffort: (row: ModelRow, effort: string) => void;
  filter: string;
  onFilterChange: (value: string) => void;
}): JSX.Element;
```

- [ ] **Step 1: Écrire les tests qui échouent**

```tsx
// Tableau dense des modèles (lot B1) : colonnes comparables, actions sur la
// ligne. Présentationnel — aucune connaissance du socket ni des réglages.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { renderUi, resetTestState } from "../../../test/render";
import { setLanguage } from "../../../lib/i18n";
import type { ModelRow } from "./buildModelRows";
import { ModelsGrid } from "./ModelsGrid";

beforeEach(() => { resetTestState(); setLanguage("fr"); vi.clearAllMocks(); });
afterEach(cleanup);

const row = (over: Partial<ModelRow> = {}): ModelRow => ({
  key: "claude:opus", provider: "claude", providerLabel: "Claude Code",
  modelId: "claude-opus-5[1m]", label: "Opus 5 · 1M", isDefault: false,
  isFavorite: false, effort: "", efforts: ["", "low", "high"], status: "ready",
  version: "2.4.1", custom: false, ...over,
});

function props(over = {}) {
  return {
    rows: [row()], onSetDefault: vi.fn(), onToggleFavorite: vi.fn(),
    onSetEffort: vi.fn(), filter: "", onFilterChange: vi.fn(), ...over,
  };
}

describe("ModelsGrid", () => {
  it("rend un tableau avec un en-tête nommé pour chaque colonne", () => {
    renderUi(<ModelsGrid {...props()} />);
    const table = screen.getByRole("table");
    const entetes = within(table).getAllByRole("columnheader").map((h) => h.textContent?.trim());
    expect(entetes).toContain("Modèle");
    expect(entetes).toContain("Fournisseur");
  });

  it("une ligne par modèle, identifiée par son libellé", () => {
    renderUi(<ModelsGrid {...props({ rows: [row(), row({ key: "claude:sonnet", modelId: "s", label: "Sonnet 5" })] })} />);
    expect(screen.getAllByRole("row").length).toBe(3); // en-tête + 2
  });

  it("le marqueur de défaut est un contrôle nommé, pas une pastille muette", () => {
    const onSetDefault = vi.fn();
    renderUi(<ModelsGrid {...props({ onSetDefault })} />);
    const marqueur = screen.getByRole("radio", { name: /défaut/i });
    fireEvent.click(marqueur);
    expect(onSetDefault).toHaveBeenCalledWith(expect.objectContaining({ modelId: "claude-opus-5[1m]" }));
  });

  it("le favori est un interrupteur à état accessible", () => {
    const onToggleFavorite = vi.fn();
    renderUi(<ModelsGrid {...props({ rows: [row({ isFavorite: true })], onToggleFavorite })} />);
    const etoile = screen.getByRole("button", { name: /favori/i });
    expect(etoile).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(etoile);
    expect(onToggleFavorite).toHaveBeenCalled();
  });

  it("le filtre remonte la saisie sans filtrer lui-même", () => {
    const onFilterChange = vi.fn();
    renderUi(<ModelsGrid {...props({ onFilterChange })} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "opus" } });
    expect(onFilterChange).toHaveBeenCalledWith("opus");
  });

  it("annonce le compte de lignes affichées", () => {
    renderUi(<ModelsGrid {...props({ rows: [row(), row({ key: "k2" })] })} />);
    expect(screen.getByText(/2 modèles/)).toBeInTheDocument();
  });

  it("sans aucune ligne, dit pourquoi au lieu de rendre un tableau vide", () => {
    renderUi(<ModelsGrid {...props({ rows: [] })} />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText(/aucun modèle/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

```bash
npx vitest run src/components/settings/models/ModelsGrid.test.tsx
```

- [ ] **Step 3: Implémenter le composant**

Colonnes, dans l'ordre : **défaut · modèle · fournisseur · identifiant · effort · état · favori**.

**Écart assumé par rapport à l'artefact des directions :** la colonne « contexte » y figurait avec des valeurs illustratives. **Ne l'ajoute pas** — le catalogue ne fournit pas cette donnée aujourd'hui, et inventer un chiffre serait pire que de ne rien afficher. Note-le dans ton rapport.

Points d'exécution :
- l'identifiant s'affiche en `var(--code-font)`, taille `--fs-s`, tronqué avec `text-overflow: ellipsis` et son texte complet en `title` ;
- l'en-tête est **collant** (`position: sticky; top: 0`) dans le conteneur défilant ;
- le marqueur de défaut est un `role="radio"` par ligne, groupés **par fournisseur** en `role="radiogroup"` — c'est ce qui traduit « un seul défaut par fournisseur » aux technologies d'assistance ;
- le favori est un `RowButton` avec `aria-pressed` ;
- l'effort utilise le `Select` maison existant ;
- tous les chiffres alignés portent `font-variant-numeric: tabular-nums` ;
- aucun `<button>` nu : `RowButton` pour les cellules activables.

- [ ] **Step 4: Écrire le style**

Dans `src/App.css`, à la suite des règles `.set-*`. Utiliser exclusivement les jetons existants (`--fs-xs/s/m/l`, `--r-s/m`, `--border`, `--bg-card`, `--text-muted`, `--accent`, `--ease`). Espacements multiples de 4 ; survol de ligne en 140 ms ; ligne sélectionnée marquée par un filet d'accent à gauche (`box-shadow: inset 2px 0 0 var(--accent)`), jamais par la couleur seule.

- [ ] **Step 5: Vérifier**

```bash
npx vitest run src/components/settings/models/
npx vitest run src/components/ui/css-contract.test.ts
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/models src/App.css
git commit -m "feat(reglages): tableau dense des modèles

Colonnes comparables et actions sur la ligne : défaut, favori, effort. Le
marqueur de défaut est un radiogroup par fournisseur, ce qui traduit « un seul
défaut par fournisseur » aux technologies d'assistance.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4 : Câbler dans `Models.tsx` et supprimer la double liste

C'est ici que la dette du lot 1 se solde : les groupes ex-`setup` et ex-`providers` rendaient **le même ensemble de fournisseurs l'un sous l'autre**.

**Files:**
- Modify: `src/components/settings/sections/Models.tsx`
- Modify: `src/components/settings/sections/Models.test.tsx`

**Interfaces:**
- Consumes: `buildModelRows` (tâche 2), `ModelsGrid` (tâche 3), `FakeWS` en `EventTarget` (tâche 1).

- [ ] **Step 1: Écrire les tests qui échouent**

Maintenant que `FakeWS` est un `EventTarget`, ces tests peuvent enfin monter la section avec un socket **ouvert** :

```tsx
it("affiche les modèles du catalogue reçu par le socket", async () => {
  const ws = fakeWsOuvert();
  renderUi(<Models {...props({ ws })} />);
  ws.emit({ type: "providerStatus", providers: [/* claude avec 2 modèles */] });
  expect(await screen.findByText("Opus 5 · 1M")).toBeInTheDocument();
});

it("ne rend qu'UNE liste de fournisseurs, plus deux", () => {
  // La dette du lot 1 : ex-setup et ex-providers rendaient le même ensemble.
  const ws = fakeWsOuvert();
  renderUi(<Models {...props({ ws })} />);
  ws.emit({ type: "providerStatus", providers: [/* claude */] });
  expect(screen.getAllByText("Claude Code")).toHaveLength(1);
});

it("choisir un défaut appelle set avec le modèle de CE fournisseur", () => { /* … */ });
it("mettre en favori écrit dans favoriteModels du bon fournisseur", () => { /* … */ });
it("les fournisseurs indisponibles portent l'action qui débloque", () => { /* … */ });
```

Écris ces cinq tests complètement, sur le modèle de ceux des tâches 2 et 3. Ajoute un helper `fakeWsOuvert()` qui construit un `FakeWS` en `readyState: 1`.

- [ ] **Step 2: Lancer pour vérifier l'échec**

```bash
npx vitest run src/components/settings/sections/Models.test.tsx
```

- [ ] **Step 3: Réécrire la section**

`Models.tsx` se réduit à : l'abonnement WebSocket (inchangé), la dérivation via `buildModelRows`, et le rendu.

Structure de la page, dans l'ordre :
1. **Au lancement d'une conversation** — segmenté « fournisseur de départ » (`defaultProvider`) et une rangée récapitulative en lecture seule décrivant ce que donnera un fil neuf ;
2. **le tableau** — `ModelsGrid` ;
3. **Non disponibles** — les fournisseurs absents ou non connectés, avec l'action qui débloque ;
4. **Avancé** — fournisseurs API, slugs personnalisés, ordre du sélecteur.

**Supprime** les deux anciens groupes de fournisseurs. **Corrige aussi la hiérarchie de titres** relevée par la revue du lot 1 : chaque bloc porte son intertitre, plus de bloc posé nu.

- [ ] **Step 4: Vérifier**

```bash
npx vitest run src/components/settings/
npx vitest run src/App.settingsMirror.test.tsx src/App.settings-crash.test.tsx
npx tsc --noEmit && npx vite build
```

Les deux tests de persistance doivent passer **sans modification**.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/sections
git commit -m "refactor(reglages): la section Modèles adopte le tableau dense

La double liste de fournisseurs héritée du lot 1 disparaît : un fournisseur
n'apparaît plus qu'une fois. Les titres de sous-blocs sont rétablis.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5 : Le repli en cartes sous le seuil

Un tableau à sept colonnes est illisible dans une feuille étroite. Le lot A a rendu le seuil **vrai** (il mesure la feuille) : on s'appuie dessus.

**Files:**
- Modify: `src/components/settings/models/ModelsGrid.tsx`
- Modify: `src/components/settings/models/ModelsGrid.test.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Écrire le test**

`ModelsGrid` reçoit une prop `compact?: boolean`. Quand elle est vraie, il rend une **liste de cartes** — une carte par modèle, portant les mêmes actions — et **aucun `role="table"`**. Les mêmes rappels doivent fonctionner dans les deux formes : écris un test qui vérifie que cliquer le favori en mode compact appelle bien `onToggleFavorite`.

- [ ] **Step 2 → 4 : implémenter, brancher sur le seuil de la section, vérifier**

`Models.tsx` passe `compact` depuis l'état `narrow` déjà calculé par la coquille. Si cet état n'est pas accessible depuis la section, **ne le recalcule pas en double** : fais-le descendre par `SectionProps` et dis-le dans ton rapport.

- [ ] **Step 5: Commit**

---

### Task 6 : Point de contrôle visuel

**Cette tâche ne s'exécute pas seule.** Aucun test ne peut prouver qu'un tableau tient dans une largeur — jsdom ne calcule aucune mise en page, et le projet interdit le pilotage d'écran. Le lot A l'a payé : un bug de défilement a traversé trois revues avant que l'utilisateur l'ouvre.

- [ ] **Step 1: Reconstruire et relancer**

Suivre `docs/PROTOCOLE_RELANCE.md` **à la lettre**.

- [ ] **Step 2: Demander le contrôle à Thierry**, en listant précisément :

- le tableau tient-il dans la largeur de la feuille, sans défilement horizontal ;
- la colonne « identifiant » est-elle lisible, ou écrase-t-elle les autres ;
- l'en-tête reste-t-il visible pendant le défilement vertical ;
- le marqueur de défaut se comprend-il sans explication ;
- en fenêtre étroite, le repli en cartes se déclenche-t-il, et au bon moment ;
- les chiffres sont-ils alignés (chasse tabulaire).

- [ ] **Step 3: Rapporter ce qu'il a observé**, pas ce qui devrait se produire.

---

## Vérification de fin de lot

- [ ] `npx vitest run` — pas de nouvel échec par rapport à l'état d'avant le lot.
- [ ] `npx tsc --noEmit` et `npx vite build` propres.
- [ ] `App.settingsMirror` et `App.settings-crash` passent **sans modification**.
- [ ] Un fournisseur n'apparaît qu'**une seule fois** dans la section.
- [ ] Les favoris fonctionnent pour **tous** les fournisseurs, pas seulement opencode.
- [ ] Contrôle visuel de la tâche 6 fait, et ses constats reportés.

## Ce que ce lot ne fait PAS

- Pas de routeur opencode (B2) — la section liste les modèles opencode comme les autres, sans regroupement par passerelle.
- Pas de recherche globale (B3) — le filtre du tableau ne concerne que les modèles.
- Pas de section Extensions (B4), pas de refonte d'Apparence (B5).
- Pas de colonne « contexte » : le catalogue ne fournit pas cette donnée.
