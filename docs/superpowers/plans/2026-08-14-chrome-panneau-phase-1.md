# Chrome des panneaux Atelier — phase 1 : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une pastille de commutation d'onglets apparaît dans l'en-tête natif de toutes les surfaces, et la bande d'onglets cesse d'être rendue pour elles — la navigation ne disparaît plus jamais.

**Architecture:** On généralise un patron déjà en place : quatre surfaces reçoivent déjà un `ReactNode` du shell qu'elles rendent dans leur propre en-tête (`paneControls`). On renomme ce passager unique en objet à deux passagers (`paneChrome`), on ajoute la pastille à gauche, on étend le slot aux surfaces qui ne l'ont pas, puis on retire la bande d'onglets pour toutes les surfaces. Les documents la gardent : ils relèvent de la phase 2.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library, CSS à tokens (`src/styles/tokens.css`), primitives Base UI enveloppées dans `src/components/ui/`.

**Spec:** `docs/superpowers/specs/2026-08-14-chrome-panneau-atelier-design.md`

## Global Constraints

Reprises de `CLAUDE.md` — elles s'appliquent à **chaque** tâche :

- Tailles de texte : 10 / 11 / 12 / 13 / 15 px uniquement, via `--fs-*`. Aucune autre valeur.
- Poids : 400, 500, 600. Rien d'autre.
- Rayons : `--radius-control` (6), `--radius-surface` (10), `--radius-pill` (999).
- Espacement : multiples de 4, via `--sp-1`..`--sp-8`.
- Couleurs : toujours par variable CSS, jamais de hex en dur dans un composant.
- Motion : `var(--motion-fast|standard|panel)` uniquement. `primitives.css` ne doit contenir **aucune** durée littérale en ms — `css-contract.test.ts` l'assère.
- `primitives.css` doit garder **exactement une** `@keyframes` (`ui-spin`) — assertion existante.
- Aucun `<button>` nu hors `src/components/ui/` et `src/components/shadcn/` : utiliser `Button`, `IconButton` ou `RowButton`.
- L'accent orange est interdit pour la navigation : l'onglet actif se marque par contraste de surface (`ATELIER_DESIGN.md` §5).

Vérification exigée à chaque commit :

```bash
npx tsc --noEmit
npx vite build
npx vitest run
```

## Fichiers

| Fichier | Responsabilité |
|---|---|
| `src/components/ui/PaneSwitcher.tsx` *(créer)* | Primitive présentationnelle : pastille + menu. Ne connaît aucun type workspace. |
| `src/components/ui/PaneSwitcher.test.tsx` *(créer)* | Tests de la primitive. |
| `src/styles/primitives.css` | Habillage `.ui-pane-switcher`. |
| `src/components/ui/index.ts` | Export. |
| `src/components/ui/SurfaceHeader.tsx` | Nouvel emplacement `headerStart`. |
| `src/components/AtelierPane.tsx` | Construit les items, remplace `paneControls` par `paneChrome`, cesse de rendre la `TabList` pour les surfaces. |
| `src/components/{TerminalSurface,BrowserTab,BiblioSurface,KnowledgeSurface}.tsx` | Passent de `paneControls` à `paneChrome`. |
| `src/components/{GitSurface,NarvalSurface,GeneratorSurface}.tsx` | Reçoivent le slot pour la première fois. |
| `src/App.tsx` | Raccourcis onglet précédent/suivant/fermer. |
| `src/components/ui/css-contract.test.ts` | Verrouille le résultat. |

---

### Task 1 : la primitive `PaneSwitcher`

**Files:**
- Create: `src/components/ui/PaneSwitcher.tsx`
- Create: `src/components/ui/PaneSwitcher.test.tsx`
- Modify: `src/styles/primitives.css` (ajout en fin de fichier)
- Modify: `src/components/ui/index.ts`

**Interfaces:**
- Consumes: `RowButton` (`./RowButton`), `LazyDropdownMenu` (`./LazyDropdownMenu`).
- Produces:
  ```ts
  export type PaneSwitcherItem = {
    id: string;
    label: string;
    icon?: React.ReactNode;
    active: boolean;
    onSelect: () => void;
    onClose?: () => void;   // absent = onglet non fermable
  };
  export function PaneSwitcher(props: {
    items: PaneSwitcherItem[];
    label: string;          // nom accessible du déclencheur
    className?: string;
  }): React.ReactElement | null;
  ```

Note de conception : la primitive vit dans `ui/`, où `surfaceLabel` et `surfaceIcon` ne sont **pas** accessibles (fonctions locales non exportées de `AtelierPane.tsx:124` et `:130`). Elle reste donc purement présentationnelle et reçoit sa liste toute faite, comme `Tabs`.

- [ ] **Step 1 : écrire le test qui échoue**

```tsx
// src/components/ui/PaneSwitcher.test.tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PaneSwitcher, type PaneSwitcherItem } from "./PaneSwitcher";

function items(over: Partial<PaneSwitcherItem>[] = []): PaneSwitcherItem[] {
  const base: PaneSwitcherItem[] = [
    { id: "a", label: "main.tex", active: true, onSelect: vi.fn(), onClose: vi.fn() },
    { id: "b", label: "notes.md", active: false, onSelect: vi.fn(), onClose: vi.fn() },
    { id: "c", label: "zsh", active: false, onSelect: vi.fn(), onClose: vi.fn() },
  ];
  return base.map((item, i) => ({ ...item, ...(over[i] ?? {}) }));
}

describe("PaneSwitcher", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("nomme l'onglet actif et compte les onglets du panneau", () => {
    render(<PaneSwitcher items={items()} label="Onglets du panneau" />);
    const trigger = screen.getByRole("button", { name: /Onglets du panneau/ });
    expect(trigger).toHaveTextContent("main.tex");
    expect(trigger).toHaveTextContent("3");
  });

  it("n'affiche pas de compteur quand le panneau n'a qu'un onglet", () => {
    render(<PaneSwitcher items={[items()[0]]} label="Onglets du panneau" />);
    expect(screen.getByRole("button", { name: /Onglets du panneau/ })).not.toHaveTextContent("1");
  });

  it("ne rend rien quand le panneau est vide", () => {
    const { container } = render(<PaneSwitcher items={[]} label="Onglets du panneau" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("active l'onglet choisi dans le menu", async () => {
    const list = items();
    render(<PaneSwitcher items={list} label="Onglets du panneau" />);
    await userEvent.click(screen.getByRole("button", { name: /Onglets du panneau/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /notes\.md/ }));
    expect(list[1].onSelect).toHaveBeenCalledTimes(1);
    expect(list[0].onSelect).not.toHaveBeenCalled();
  });

  it("annonce l'état du menu au lecteur d'écran", () => {
    render(<PaneSwitcher items={items()} label="Onglets du panneau" />);
    const trigger = screen.getByRole("button", { name: /Onglets du panneau/ });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
```

- [ ] **Step 2 : lancer le test pour vérifier qu'il échoue**

Run : `npx vitest run src/components/ui/PaneSwitcher.test.tsx`
Expected : FAIL — `Failed to resolve import "./PaneSwitcher"`.

- [ ] **Step 3 : écrire la primitive**

```tsx
// src/components/ui/PaneSwitcher.tsx
// Pastille de commutation d'onglets — emplacement standardisé à gauche de la
// barre de CHAQUE surface (spec 2026-08-14). Présentationnelle : elle ne
// connaît ni les types workspace ni les libellés de surface, qui vivent dans
// AtelierPane. L'onglet actif est marqué par contraste de surface, jamais par
// l'accent (ATELIER_DESIGN §5 : la navigation est neutre).
import { useRef, useState, type ReactNode } from "react";
import { RowButton } from "./RowButton";
import { LazyDropdownMenu } from "./LazyDropdownMenu";

export type PaneSwitcherItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  active: boolean;
  onSelect: () => void;
  onClose?: () => void;
};

export function PaneSwitcher({
  items,
  label,
  className,
}: {
  items: PaneSwitcherItem[];
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  if (items.length === 0) return null;
  const current = items.find((item) => item.active) ?? items[0];

  return (
    <LazyDropdownMenu
      open={open}
      onOpenChange={setOpen}
      label={label}
      align="start"
      className="pane-switcher-menu"
      triggerRef={triggerRef}
      trigger={
        <RowButton
          ref={triggerRef}
          className={`ui-pane-switcher${className ? ` ${className}` : ""}`}
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          title={current.label}
        >
          {current.icon && <span className="ui-pane-switcher-icon">{current.icon}</span>}
          <span className="ui-pane-switcher-label">{current.label}</span>
          <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor"
            strokeWidth="1.7" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
          {items.length > 1 && <span className="ui-pane-switcher-count">{items.length}</span>}
        </RowButton>
      }
      items={items.map((item) => ({
        key: item.id,
        className: item.active ? "pane-switcher-row is-active" : "pane-switcher-row",
        label: (
          <>
            {item.icon && <span className="ui-pane-switcher-icon">{item.icon}</span>}
            <span className="ui-pane-switcher-row-label">{item.label}</span>
          </>
        ),
        onSelect: item.onSelect,
      }))}
    />
  );
}
```

- [ ] **Step 4 : ajouter l'habillage**

Ajouter en fin de `src/styles/primitives.css`. Aucune durée littérale : le contrat l'interdit dans ce fichier.

```css
/* ---- PaneSwitcher — emplacement de navigation, identique sur toute surface -- */
.ui-pane-switcher {
  display: inline-flex; align-items: center; gap: var(--sp-1);
  max-width: 220px; height: var(--control-height-compact);
  padding: 0 var(--sp-2); border-radius: var(--radius-control);
  background: var(--surface-inset); color: var(--text-secondary);
  font: 500 var(--fs-body-s)/1 var(--font-chrome);
  transition: background-color var(--motion-fast) var(--ease-out),
              color var(--motion-fast) var(--ease-out);
}
.ui-pane-switcher:hover { color: var(--text-primary); }
.ui-pane-switcher-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ui-pane-switcher-icon { display: inline-flex; flex: none; color: var(--text-muted); }
.ui-pane-switcher-count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 15px; height: 15px; padding: 0 4px; flex: none;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--text-muted) 28%, transparent);
  color: var(--text-secondary);
  font: 500 var(--fs-caption)/1 var(--font-chrome);
  font-variant-numeric: tabular-nums;
}
.pane-switcher-row { display: flex; align-items: center; gap: var(--sp-2); }
.pane-switcher-row.is-active { background: var(--surface-inset); color: var(--text-primary); }
.ui-pane-switcher-row-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

Puis exporter dans `src/components/ui/index.ts`, à côté de `TabList` :

```ts
export { PaneSwitcher, type PaneSwitcherItem } from "./PaneSwitcher";
```

- [ ] **Step 5 : lancer les tests**

Run : `npx vitest run src/components/ui/PaneSwitcher.test.tsx src/components/ui/css-contract.test.ts`
Expected : PASS. Si `css-contract` échoue sur « aucune durée en ms », c'est qu'une durée littérale s'est glissée dans le CSS — la remplacer par un token.

- [ ] **Step 6 : commit**

```bash
git add src/components/ui/PaneSwitcher.tsx src/components/ui/PaneSwitcher.test.tsx \
        src/styles/primitives.css src/components/ui/index.ts
git commit -m "feat(ui): PaneSwitcher, pastille de commutation d'onglets"
```

---

### Task 2 : `SurfaceHeader` accepte un emplacement de tête

**Files:**
- Modify: `src/components/ui/SurfaceHeader.tsx:7-19`
- Modify: `src/components/ui/surfaces.test.tsx`

**Interfaces:**
- Produces: `SurfaceHeader` accepte désormais `headerStart?: React.ReactNode`, rendu **avant** le bloc `.titles`.

Aujourd'hui la signature est exactement `{ title, eyebrow, actions, className }` — il n'existe aucun emplacement de tête.

- [ ] **Step 1 : écrire le test qui échoue**

Ajouter dans `src/components/ui/surfaces.test.tsx` :

```tsx
it("rend l'emplacement de tête avant le titre", () => {
  render(
    <SurfaceHeader
      headerStart={<span data-testid="start">commutateur</span>}
      title="Galerie"
    />,
  );
  const start = screen.getByTestId("start");
  const title = screen.getByRole("heading", { name: "Galerie" });
  expect(start.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
```

- [ ] **Step 2 : lancer le test pour vérifier qu'il échoue**

Run : `npx vitest run src/components/ui/surfaces.test.tsx -t "emplacement de tête"`
Expected : FAIL — la prop est ignorée, `getByTestId("start")` ne trouve rien.

- [ ] **Step 3 : implémenter**

```tsx
export function SurfaceHeader(props: {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  headerStart?: React.ReactNode;
  className?: string;
}) {
  const { title, eyebrow, actions, headerStart, className } = props;
  return (
    <header className={cx("ui-surface-header", className)}>
      {headerStart}
      <div className="titles">
        {eyebrow != null && <span className="eyebrow">{eyebrow}</span>}
        <h2 className="title">{title}</h2>
      </div>
```

Le reste du composant est inchangé.

- [ ] **Step 4 : lancer les tests**

Run : `npx vitest run src/components/ui/surfaces.test.tsx`
Expected : PASS, y compris les tests existants de `SurfaceHeader`.

- [ ] **Step 5 : commit**

```bash
git add src/components/ui/SurfaceHeader.tsx src/components/ui/surfaces.test.tsx
git commit -m "feat(ui): SurfaceHeader accepte un emplacement de tete"
```

---

### Task 3 : le slot passe d'un à deux passagers

**Files:**
- Modify: `src/components/TerminalSurface.tsx:23,139`
- Modify: `src/components/BrowserTab.tsx:131,540`
- Modify: `src/components/BiblioSurface.tsx:125,130,397,513`
- Modify: `src/components/KnowledgeSurface.tsx:38,213`
- Modify: `src/components/AtelierPane.tsx:653-700,812,828,856,870`

**Interfaces:**
- Produces :
  ```ts
  export type PaneChrome = { switcher: React.ReactNode; controls: React.ReactNode };
  ```
  déclaré dans `src/components/surfaces.tsx` et importé par les quatre surfaces, qui remplacent `paneControls?: ReactNode` par `paneChrome?: PaneChrome`.
- Consumes : `PaneSwitcher` (Task 1).

Un objet à deux champs plutôt qu'une seconde prop : le slot reste **une** zone, la pastille alignée à gauche et les contrôles à droite, et on ne fait pas grossir quatre signatures indépendamment.

- [ ] **Step 1 : écrire le test qui échoue**

Ajouter dans `src/components/TerminalSurface.test.tsx` :

```tsx
it("rend la pastille de commutation et les contrôles de panneau", () => {
  render(
    <TerminalSurface
      cwd="/tmp/projet"
      visible
      paneChrome={{
        switcher: <span data-testid="switcher">onglets</span>,
        controls: <span data-testid="controls">contrôles</span>,
      }}
    />,
  );
  expect(screen.getByTestId("switcher")).toBeInTheDocument();
  expect(screen.getByTestId("controls")).toBeInTheDocument();
});
```

- [ ] **Step 2 : lancer le test pour vérifier qu'il échoue**

Run : `npx vitest run src/components/TerminalSurface.test.tsx -t "pastille de commutation"`
Expected : FAIL — TypeScript rejette `paneChrome`, prop inconnue.

- [ ] **Step 3 : déclarer le type partagé**

Ajouter dans `src/components/surfaces.tsx` :

```tsx
/** Les deux passagers que le shell injecte dans l'en-tête natif d'une surface :
 *  la navigation à gauche, les contrôles de panneau à droite. */
export type PaneChrome = { switcher: React.ReactNode; controls: React.ReactNode };
```

- [ ] **Step 4 : migrer les quatre surfaces**

Dans chacune, remplacer la prop et son rendu. Exemple pour `TerminalSurface.tsx` — appliquer la même transformation aux trois autres (`BrowserTab.tsx:540`, `BiblioSurface.tsx:397` et `:513`, `KnowledgeSurface.tsx:213` qui passe par sa prop `headerEnd`) :

```tsx
// signature
paneChrome?: PaneChrome;

// rendu, à la place de {p.paneControls && <div className="workspace-pane-controls-slot">…</div>}
{p.paneChrome && (
  <>
    <span className="workspace-pane-switcher-slot">{p.paneChrome.switcher}</span>
    <span className="flex" />
    <div className="workspace-pane-controls-slot">{p.paneChrome.controls}</div>
  </>
)}
```

Pour `KnowledgeSurface`, dont l'en-tête reçoit un unique `headerEnd`, ajouter symétriquement `headerStart={p.paneChrome?.switcher}` et garder `headerEnd={p.paneChrome?.controls}`.

- [ ] **Step 5 : construire les items dans `AtelierPane`**

Ajouter, à côté de `renderPaneControls` (`AtelierPane.tsx:653`) :

```tsx
function renderPaneSwitcher(paneNode: WorkspacePaneNode) {
  const items = paneNode.tabs.map((ref) => {
    const id = workspaceTabId(ref);
    const compact = ref.kind === "surface" && ref.surface === "atelier";
    return {
      id,
      label: tabTitle(ref),
      icon: ref.kind === "surface"
        ? (compact ? <HomeIcon size={15} /> : surfaceIcon(ref.surface))
        : undefined,
      active: paneNode.activeTabId === id,
      onSelect: () => selectRef(paneNode.id, ref),
      onClose: compact ? undefined : () => closeRef(ref),
    };
  });
  return <PaneSwitcher items={items} label={t("workspace.pane-tabs")} />;
}

function renderPaneChrome(paneNode: WorkspacePaneNode, ref: WorkspaceTabRef): PaneChrome {
  return {
    switcher: renderPaneSwitcher(paneNode),
    controls: renderPaneControls(paneNode, ref, "integrated"),
  };
}
```

Remplacer les quatre appels `paneControls={renderPaneControls(paneNode, ref, "integrated")}` (lignes 812, 828, 856, 870) par `paneChrome={renderPaneChrome(paneNode, ref)}`.

Ajouter la clé i18n dans `src/lib/i18n.ts`, dans les deux tables :

```ts
"workspace.pane-tabs": "Onglets du panneau",   // FR
"workspace.pane-tabs": "Pane tabs",            // EN
```

- [ ] **Step 6 : lancer les tests**

Run : `npx vitest run src/components && npx tsc --noEmit`
Expected : PASS. TypeScript signale toute surface encore sur `paneControls`.

- [ ] **Step 7 : commit**

```bash
git add src/components/surfaces.tsx src/components/TerminalSurface.tsx src/components/BrowserTab.tsx \
        src/components/BiblioSurface.tsx src/components/KnowledgeSurface.tsx \
        src/components/AtelierPane.tsx src/components/TerminalSurface.test.tsx src/lib/i18n.ts
git commit -m "feat(atelier): la pastille d'onglets entre dans les en-tetes natifs"
```

---

### Task 4 : la galerie reçoit la pastille

**Files:**
- Modify: `src/components/AtelierHeaders.tsx:21-33`
- Modify: `src/components/AtelierPane.tsx` (rendu de la surface `atelier`)
- Modify: `src/components/AtelierHeaders.test.tsx`

**Interfaces:**
- Consumes : `SurfaceHeader.headerStart` (Task 2), `renderPaneChrome` (Task 3).
- Produces : `GalleryHeader` accepte `paneChrome?: PaneChrome`.

- [ ] **Step 1 : écrire le test qui échoue**

```tsx
// src/components/AtelierHeaders.test.tsx
it("place la pastille d'onglets avant le titre de la galerie", () => {
  render(
    <GalleryHeader
      projectName="atelier-studio"
      onRefresh={() => {}}
      paneChrome={{ switcher: <span data-testid="switcher">onglets</span>, controls: null }}
    />,
  );
  expect(screen.getByTestId("switcher")).toBeInTheDocument();
});
```

- [ ] **Step 2 : lancer le test pour vérifier qu'il échoue**

Run : `npx vitest run src/components/AtelierHeaders.test.tsx -t "pastille d'onglets"`
Expected : FAIL — prop inconnue.

- [ ] **Step 3 : implémenter**

```tsx
export function GalleryHeader(p: {
  projectName: string | null;
  onRefresh: () => void;
  paneChrome?: PaneChrome;
}) {
  const refresh = t("action.refresh-hard");
  return (
    <SurfaceHeader
      className="atelier-surface-header"
      headerStart={p.paneChrome?.switcher}
      eyebrow={p.projectName ?? undefined}
      title={t("atelier.gallery")}
      actions={
        <>
          <IconButton label={refresh} title={refresh} size="s" onClick={p.onRefresh}>
            <RefreshIcon />
          </IconButton>
          {p.paneChrome?.controls}
        </>
      }
    />
  );
}
```

Puis passer `paneChrome={renderPaneChrome(paneNode, ref)}` au `GalleryHeader` dans `AtelierPane.tsx`.

- [ ] **Step 4 : lancer les tests**

Run : `npx vitest run src/components/AtelierHeaders.test.tsx`
Expected : PASS.

- [ ] **Step 5 : commit**

```bash
git add src/components/AtelierHeaders.tsx src/components/AtelierHeaders.test.tsx src/components/AtelierPane.tsx
git commit -m "feat(galerie): pastille d'onglets dans l'en-tete de la galerie"
```

---

### Task 5 : Git, Narval et Generator reçoivent le slot

**Files:**
- Modify: `src/components/GitSurface.tsx`
- Modify: `src/components/NarvalSurface.tsx`
- Modify: `src/components/GeneratorSurface.tsx`
- Modify: `src/components/AtelierPane.tsx` (leurs trois rendus)
- Modify: `src/components/AtelierPane.workspace.test.tsx`

**Interfaces:**
- Consumes : `PaneChrome` (Task 3).
- Produces : les trois surfaces acceptent `paneChrome?: PaneChrome`.

Ces trois-là n'utilisent **pas** `SurfaceHeader` : elles ont des en-têtes maison (`.narval-files-head` et équivalents). On pose le slot à la main dans l'en-tête existant. La migration vers `SurfaceHeader` est explicitement hors périmètre (spec §3).

Note sur le choix du fichier de test : `GitSurface.test.tsx` **n'a pas** de helper de rendu, et monter `GitSurface` seul demande de simuler tout son état. Le test vit donc dans `AtelierPane.workspace.test.tsx`, qui expose déjà `renderWorkspace(overrides)` (ligne 23) et monte la vraie composition shell + surface — ce qu'on veut vérifier ici.

- [ ] **Step 1 : écrire le test qui échoue**

```tsx
// src/components/AtelierPane.workspace.test.tsx
it("montre la pastille d'onglets dans l'en-tête de Git", async () => {
  renderWorkspace();
  fireEvent.click(screen.getByRole("button", { name: t("atelier.git") }));
  await waitFor(() => {
    expect(screen.getByRole("button", { name: t("workspace.pane-tabs") })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2 : lancer le test pour vérifier qu'il échoue**

Run : `npx vitest run src/components/AtelierPane.workspace.test.tsx -t "en-tête de Git"`
Expected : FAIL — aucun bouton nommé « Onglets du panneau » : Git ne reçoit pas encore le slot.

- [ ] **Step 3 : implémenter les trois**

Dans chaque composant, ajouter la prop puis l'insérer en **premier enfant** de l'élément d'en-tête existant :

```tsx
{p.paneChrome && (
  <span className="workspace-pane-switcher-slot">{p.paneChrome.switcher}</span>
)}
```

et les contrôles en dernier enfant du même en-tête :

```tsx
{p.paneChrome?.controls && (
  <div className="workspace-pane-controls-slot">{p.paneChrome.controls}</div>
)}
```

Puis, dans `AtelierPane.tsx`, passer `paneChrome={renderPaneChrome(paneNode, ref)}` aux trois surfaces, et les ajouter à `integratesPaneControls` (`:138`) :

```tsx
function integratesPaneControls(ref: WorkspaceTabRef | null): boolean {
  return ref?.kind === "surface";
}
```

Toutes les surfaces intègrent désormais leurs contrôles : plus aucun contrôle flottant.

- [ ] **Step 4 : lancer les tests**

Run : `npx vitest run src/components && npx tsc --noEmit`
Expected : PASS.

- [ ] **Step 5 : commit**

```bash
git add src/components/GitSurface.tsx src/components/NarvalSurface.tsx \
        src/components/GeneratorSurface.tsx src/components/AtelierPane.tsx \
        src/components/AtelierPane.workspace.test.tsx
git commit -m "feat(atelier): slot de chrome dans Git, Narval et Generator"
```

---

### Task 6 : la bande d'onglets disparaît pour les surfaces

**Files:**
- Modify: `src/components/AtelierPane.tsx:134-136,898-919`
- Modify: `src/components/AtelierPane.workspace.test.tsx`

**Interfaces:**
- Consumes : toutes les tâches précédentes. **Ne pas exécuter cette tâche avant que les huit surfaces aient leur pastille** : la bande est aujourd'hui le seul moyen de changer d'onglet pour la galerie.

État intermédiaire assumé : les **documents** gardent la bande d'onglets et leur `<header>` d'iframe. C'est la phase 2 qui les traite.

- [ ] **Step 1 : écrire le test qui échoue**

```tsx
// src/components/AtelierPane.workspace.test.tsx
it("ne rend plus la bande d'onglets quand une surface est active", async () => {
  const { container } = renderWorkspace();
  fireEvent.click(screen.getByRole("button", { name: t("atelier.terminal") }));
  await waitFor(() => {
    expect(screen.getByRole("button", { name: t("workspace.pane-tabs") })).toBeInTheDocument();
  });
  expect(container.querySelector(".workspace-pane-tabs")).toBeNull();
});
```

- [ ] **Step 2 : lancer le test pour vérifier qu'il échoue**

Run : `npx vitest run src/components/AtelierPane.workspace.test.tsx -t "bande d'onglets"`
Expected : FAIL — la galerie rend encore `.workspace-pane-tabs`.

- [ ] **Step 3 : implémenter**

```tsx
// AtelierPane.tsx:134 — la galerie n'est plus l'exception : toute surface
// porte son chrome, seuls les documents dependent encore de la bande (phase 2).
function ownsNativeChrome(ref: WorkspaceTabRef | null): boolean {
  return ref?.kind === "surface";
}
```

Le rendu de `renderPane` (`:907-919`) n'a pas besoin de changer : `{!nativeChrome && <TabList …>}` suffit désormais. Supprimer en revanche la branche des contrôles flottants (`:919`), devenue inatteignable :

```tsx
{/* plus de contrôles flottants : toutes les surfaces les intègrent (Task 5) */}
```

- [ ] **Step 4 : lancer les tests**

Run : `npx vitest run && npx tsc --noEmit && npx vite build`
Expected : PASS. Des tests existants attendant `.workspace-pane-tabs` pour la galerie peuvent échouer : le contrat a changé, mettre à jour leur attente et **dire lequel** dans le message de commit.

- [ ] **Step 5 : commit**

```bash
git add src/components/AtelierPane.tsx src/components/AtelierPane.workspace.test.tsx
git commit -m "feat(atelier): une seule barre pour toutes les surfaces"
```

---

### Task 7 : raccourcis d'onglets

**Files:**
- Create: `src/lib/paneTabCycle.ts`
- Create: `src/lib/paneTabCycle.test.ts`
- Modify: `src/App.tsx:2273-2294`

**Interfaces:**
- Produces :
  ```ts
  /** Index de l'onglet à activer après un pas de `delta`, en boucle.
   *  Renvoie null quand le panneau a moins de deux onglets. */
  export function cycleTabIndex(count: number, current: number, delta: number): number | null;
  ```
- Consumes : `selectRef` / `closeRef` du workspace, déjà définis dans `AtelierPane`.

Note sur le choix du test : `App.orchestration.test.tsx` n'a **pas** de helper de rendu, et monter `App` entier pour vérifier une rotation d'index coûte cher pour ce qu'on teste. On extrait donc le calcul dans une fonction pure — même patron que `src/lib/effortOrder.ts` — et `App.tsx` ne garde que le câblage.

**Correction de la spec :** elle proposait ⌘1..9 pour les onglets. C'est une **collision** — `App.tsx:2291-2293` utilise déjà ⌘1, ⌘2 et ⌘0 pour les layouts. Liaisons retenues, vérifiées libres (aucune occurrence de `KeyW`, `BracketLeft`, `BracketRight` dans `src/`) :

| Raccourci | Effet |
|---|---|
| `⌘⇧[` | onglet précédent du panneau focalisé |
| `⌘⇧]` | onglet suivant |
| `⌘W` | ferme l'onglet actif |

⌘⇧[ / ⌘⇧] est la convention macOS (Safari, Terminal). La fermeture ayant quitté la croix de la bande, ⌘W n'est plus un confort mais le chemin principal.

- [ ] **Step 1 : écrire le test qui échoue**

```ts
// src/lib/paneTabCycle.test.ts
import { describe, expect, it } from "vitest";
import { cycleTabIndex } from "./paneTabCycle";

describe("cycleTabIndex", () => {
  it("avance d'un onglet", () => {
    expect(cycleTabIndex(3, 0, 1)).toBe(1);
  });

  it("boucle du dernier au premier", () => {
    expect(cycleTabIndex(3, 2, 1)).toBe(0);
  });

  it("boucle du premier au dernier en arrière", () => {
    expect(cycleTabIndex(3, 0, -1)).toBe(2);
  });

  it("ne fait rien quand le panneau a moins de deux onglets", () => {
    expect(cycleTabIndex(1, 0, 1)).toBeNull();
    expect(cycleTabIndex(0, 0, 1)).toBeNull();
  });

  it("tolère un index courant hors bornes", () => {
    // l'onglet actif vient d'être fermé : on repart du début plutôt que de planter
    expect(cycleTabIndex(3, -1, 1)).toBe(0);
  });
});
```

- [ ] **Step 2 : lancer le test pour vérifier qu'il échoue**

Run : `npx vitest run src/lib/paneTabCycle.test.ts`
Expected : FAIL — `Failed to resolve import "./paneTabCycle"`.

- [ ] **Step 3 : écrire la fonction pure**

```ts
// src/lib/paneTabCycle.ts
// Rotation d'onglets d'un panneau. Extrait d'App.tsx pour rester testable sans
// monter l'app entière — même patron que src/lib/effortOrder.ts.

/** Index de l'onglet à activer après un pas de `delta`, en boucle.
 *  Renvoie null quand le panneau a moins de deux onglets : il n'y a alors
 *  rien à faire, et le raccourci ne doit pas consommer l'évènement. */
export function cycleTabIndex(count: number, current: number, delta: number): number | null {
  if (count < 2) return null;
  const from = current >= 0 && current < count ? current : 0;
  return (((from + delta) % count) + count) % count;
}
```

- [ ] **Step 4 : lancer le test**

Run : `npx vitest run src/lib/paneTabCycle.test.ts`
Expected : PASS (5 tests).

- [ ] **Step 5 : câbler dans `App.tsx`**

Importer la fonction, puis ajouter dans le `onKey` existant, **après** la ligne `Digit0` (`App.tsx:2293`) :

```tsx
if (e.metaKey && e.shiftKey && (e.code === "BracketLeft" || e.code === "BracketRight")) {
  const pane = focusedPaneRef.current;
  if (!pane) return;
  const current = pane.tabs.findIndex((ref) => workspaceTabId(ref) === pane.activeTabId);
  const next = cycleTabIndex(pane.tabs.length, current, e.code === "BracketRight" ? 1 : -1);
  if (next === null) return;
  e.preventDefault();
  selectRef(pane.id, pane.tabs[next]);
  return;
}
if (e.metaKey && !e.shiftKey && e.code === "KeyW") {
  const pane = focusedPaneRef.current;
  const active = pane?.tabs.find((ref) => workspaceTabId(ref) === pane.activeTabId);
  if (!active) return;
  e.preventDefault();
  closeRef(active);
  return;
}
```

`focusedPaneRef`, `selectRef` et `closeRef` vivent dans `AtelierPane`. Les exposer par la même voie que les actions workspace déjà partagées avec `App` (chercher `onToggleExpand` dans `AtelierPane.tsx` pour le patron de remontée). Si aucune voie n'existe, ajouter une prop `onPaneTabAction?: (action: "prev" | "next" | "close") => void` plutôt que de faire fuiter l'état du workspace dans `App`.

- [ ] **Step 6 : lancer la vérification**

Run : `npx vitest run && npx tsc --noEmit`
Expected : PASS.

- [ ] **Step 7 : commit**

```bash
git add src/lib/paneTabCycle.ts src/lib/paneTabCycle.test.ts src/App.tsx src/components/AtelierPane.tsx
git commit -m "feat(atelier): raccourcis onglet precedent/suivant/fermer"
```

---

### Task 8 : verrouiller le résultat

**Files:**
- Modify: `src/components/ui/css-contract.test.ts`

**Interfaces:**
- Consumes : toutes les tâches précédentes.

- [ ] **Step 1 : écrire le test qui échoue**

```ts
it("toute surface porte la pastille de commutation, aucune ne depend de la bande", () => {
  // la bande d'onglets ne subsiste que pour les documents
  expect(appCss).toContain(".workspace-pane-tabs");
  // et la pastille a bien un habillage a tokens dans les primitives
  expect(primitives).toMatch(/\.ui-pane-switcher\s*\{[\s\S]*?height:\s*var\(--control-height-compact\)/);
  // la navigation reste neutre : jamais l'accent sur l'onglet actif
  expect(primitives).not.toMatch(/\.pane-switcher-row\.is-active[^}]*var\(--accent/);
});
```

- [ ] **Step 2 : lancer le test pour vérifier qu'il échoue**

Run : `npx vitest run src/components/ui/css-contract.test.ts -t "pastille de commutation"`
Expected : FAIL avant la Task 1, PASS après. Si le test passe d'emblée, c'est qu'il n'assère rien — le renforcer.

- [ ] **Step 3 : lancer la vérification complète**

```bash
npx tsc --noEmit
npx vite build
npx vitest run
```

Expected : trois succès. `gallery/` n'ayant pas été touché en phase 1, `diff_suite.mjs` n'est pas requis.

- [ ] **Step 4 : commit**

```bash
git add src/components/ui/css-contract.test.ts
git commit -m "test(css-contract): verrouiller la barre unique des surfaces"
```

---

## Ce que la phase 1 ne règle pas

À dire à l'utilisateur en fin d'exécution, pour qu'il ne croie pas le problème entièrement résolu :

- Les **documents** gardent leurs deux barres et le nom de fichier écrit deux fois. C'est la phase 2, qui demande un canal IPC nouveau — `galleryCommandBridge` est un canal de commandes galerie à forme fermée (`ipc.ts:57`), pas un canal de déclaration d'actions.
- L'alignement de la barre d'éditeur sur `--surface-header-height` reste donc faux tant que la phase 2 n'est pas faite.
