# Réglages — Lot 1 : la coquille (plan d'implémentation)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Éclater `Settings.tsx` (1 295 l., 9 sections) en une coquille et un fichier par section, avec quatre primitives partagées, un repli « Avancé » par section et une pastille « Enregistré » — sans changer un seul comportement observable.

**Architecture:** `SettingsPage.tsx` devient une coquille : nav, mode compact, Échap, restauration des défauts, et le routage vers un composant de section. Chaque section reçoit exactement les props dont elle a besoin (`settings`, `set`, `ws`), jamais l'objet `p` entier. Les rangées existantes migrent **verbatim** — ce lot ne redessine rien, il rend le redesign possible.

**Tech Stack:** React 18, TypeScript, Vitest + Testing Library, primitives maison `src/components/ui/`, shadcn local, i18n par module (`src/lib/i18n.ts`).

**Spec:** `docs/superpowers/specs/2026-08-23-refonte-reglages-design.md`

## Périmètre de ce lot

Ce plan couvre le **lot 1** du §14 de la spec. Les six autres lots auront chacun leur plan :

| Lot | Contenu | Plan |
|---|---|---|
| **1** | **Coquille, primitives, un fichier par section, pastille « Enregistré »** | **ce document** |
| 3 | Tableau dense des modèles, défauts sur place, favoris généralisés | à écrire |
| 2 | Registre de mots-clés, recherche globale | à écrire |
| 4 | `RoutedModel` en Rust, routeur opencode | à écrire |
| 5 | Inventaire des extensions, matrice de compatibilité | à écrire |
| 6 | Dialogue d'installation, spawn Rust | à écrire |
| 7 | Aperçu vivant d'Apparence | à écrire |

**Précision par rapport à la spec.** Le §14 annonce « 5 sections » au lot 1. Ce plan en livre **quatre** — Général, Modèles, Apparence, Atelier. La cinquième (Extensions) n'a aucun contenu tant que le lot 5 n'existe pas ; une entrée de nav menant à une page vide serait une régression. La coquille est écrite pour qu'ajouter la cinquième soit une ligne dans `SECTIONS` plus un fichier.

## Global Constraints

Copiées verbatim de CLAUDE.md et de la spec. Elles s'appliquent à **chaque** tâche.

- **Aucun `<button>` nu** hors `src/components/ui/` et `src/components/shadcn/` — utiliser `Button` (action textuelle), `IconButton` (icône seule) ou `RowButton` (rangée/chip/cellule/déclencheur). Verrouillé par `src/components/ui/css-contract.test.ts`.
- **Tailles de texte** : 10 / 11 / 12 / 13 / 15 px uniquement (`--fs-xs` … `--fs-xl`). Pas de 9px, 12.5px, 14.5px.
- **Poids** : 400 (corps), 500 (accent léger), 600 (titres). Rien d'autre.
- **Rayons** : 6px (contrôles), 10px (cartes/panneaux/menus), 999px (pilules). Rien d'autre.
- **Espacement** : multiples de 4 (4/8/12/16/20/24). Paddings de panneaux : 16 ou 20.
- **Motion** : tout changement d'état visible transitionne en 120–150 ms. Jamais plus de 200 ms. Respecter `prefers-reduced-motion`.
- **Couleurs** : toute couleur passe par une variable CSS. Jamais de hex en dur dans un composant.
- **`font-variant-numeric: tabular-nums`** sur tout chiffre aligné.
- **Aucun emoji dans l'UI** ; icônes = SVG monochromes, stroke 1.3–1.5.
- **Français** pour les commentaires de code et les messages de commit, comme le reste du dépôt.
- `npx tsc --noEmit` et `npx vite build` doivent passer (ignorer `src/test_auto_review*.ts`).
- **Ne pas pusher** sans demande explicite.

## Structure de fichiers

```
src/components/settings/
  SettingsPage.tsx              Coquille : nav, compact, Échap, restauration, routage
  sections.ts                   Registre SECTIONS (id + clé i18n) — source unique
  primitives/
    Row.tsx                     Titre/desc à gauche, contrôle à droite
    Group.tsx                   Étiquette majuscule + carte à filets
    Advanced.tsx                Repli fermé par défaut                    ← NOUVEAU
    SavedIndicator.tsx          Pastille « Enregistré » + useSavedFlash    ← NOUVEAU
    index.ts                    Barrel interne des primitives
  sections/
    General.tsx                 ex-`general` + ex-`avance`
    Models.tsx                  ex-`setup` + ex-`providers` + ex-`modeles`
    Appearance.tsx              ex-`apparence`
    Atelier.tsx                 ex-`atelier` + ex-`review` + ex-`appsnap`
  shared.ts                     Types partagés entre sections (ProviderCatalogRow…)
```

`src/components/Settings.tsx` est **supprimé** à la tâche 8 ; `App.tsx:42` pointe alors sur `settings/SettingsPage`.

---

### Task 1 : Primitives `Row` et `Group` extraites

Extraction pure, sans changement de rendu. C'est le socle : toutes les sections en dépendent.

**Files:**
- Create: `src/components/settings/primitives/Row.tsx`
- Create: `src/components/settings/primitives/Group.tsx`
- Create: `src/components/settings/primitives/index.ts`
- Test: `src/components/settings/primitives/primitives.test.tsx`

**Interfaces:**
- Consumes: rien (première tâche).
- Produces:
  - `Row(props: { title: string; desc?: string; children: React.ReactNode }): JSX.Element`
  - `Group(props: { label?: string; children: React.ReactNode }): JSX.Element`
  - Barrel `index.ts` réexportant `Row`, `Group`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/components/settings/primitives/primitives.test.tsx` :

```tsx
// Primitives de réglages (lot 1) : contrat de rendu des rangées et groupes.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderUi, resetTestState } from "../../../test/render";
import { Group, Row } from "./index";

beforeEach(() => resetTestState());
afterEach(cleanup);

describe("Row", () => {
  it("rend le titre, la description et le contrôle dans leurs zones", () => {
    renderUi(
      <Row title="Langue" desc="Interface et messages">
        <span data-testid="ctl">Système</span>
      </Row>,
    );
    expect(screen.getByText("Langue")).toHaveClass("set-row-title");
    expect(screen.getByText("Interface et messages")).toHaveClass("set-row-desc");
    expect(screen.getByTestId("ctl").parentElement).toHaveClass("set-row-ctl");
  });

  it("omet la description quand elle n'est pas fournie", () => {
    const { container } = renderUi(<Row title="Langue"><span /></Row>);
    expect(container.querySelector(".set-row-desc")).toBeNull();
  });
});

describe("Group", () => {
  it("rend l'étiquette au-dessus de la carte", () => {
    const { container } = renderUi(
      <Group label="Thème"><Row title="Mode"><span /></Row></Group>,
    );
    expect(screen.getByText("Thème")).toHaveClass("set-group-label");
    expect(container.querySelector(".set-card")).not.toBeNull();
  });

  it("sans étiquette, la carte est rendue seule", () => {
    const { container } = renderUi(<Group><Row title="Mode"><span /></Row></Group>);
    expect(container.querySelector(".set-group-label")).toBeNull();
    expect(container.querySelector(".set-card")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
npx vitest run src/components/settings/primitives/primitives.test.tsx
```

Attendu : ÉCHEC — `Failed to resolve import "./index"`.

- [ ] **Step 3: Écrire les primitives**

`src/components/settings/primitives/Row.tsx` — copie verbatim de `Settings.tsx:187-197` :

```tsx
// Rangée de réglage : libellé à gauche, contrôle à droite. Extraite de
// Settings.tsx (lot 1) sans changement de rendu — la géométrie vit dans
// App.css (.set-row), pas ici.
import React from "react";

export function Row(p: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-row-txt">
        <div className="set-row-title">{p.title}</div>
        {p.desc && <div className="set-row-desc">{p.desc}</div>}
      </div>
      <div className="set-row-ctl">{p.children}</div>
    </div>
  );
}
```

`src/components/settings/primitives/Group.tsx` — copie verbatim de `Settings.tsx:200-208` :

```tsx
// Groupe = étiquette discrète + carte arrondie contenant des rangées
// séparées par des filets.
import React from "react";

export function Group(p: { label?: string; children: React.ReactNode }) {
  return (
    <div className="set-group">
      {p.label && <div className="set-group-label">{p.label}</div>}
      <div className="set-card">{p.children}</div>
    </div>
  );
}
```

`src/components/settings/primitives/index.ts` :

```ts
export { Row } from "./Row";
export { Group } from "./Group";
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
npx vitest run src/components/settings/primitives/primitives.test.tsx
```

Attendu : 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/primitives
git commit -m "refactor(settings): extraire les primitives Row et Group

Copie verbatim depuis Settings.tsx, sans changement de rendu. Socle du
découpage par section (lot 1).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2 : Primitive `Advanced` — le repli fermé par défaut

Répond au grief « trop de réglages exposés » (spec §2.6). Fermé par défaut, l'état vit en mémoire du composant — il ne se persiste pas : un repli qui se souvient d'être ouvert annule son propre bénéfice au boot suivant.

**Files:**
- Create: `src/components/settings/primitives/Advanced.tsx`
- Modify: `src/components/settings/primitives/index.ts`
- Modify: `src/lib/i18n.ts` (deux dictionnaires)
- Modify: `src/App.css` (fin du bloc `.set-*`, autour de la ligne 1399)
- Test: `src/components/settings/primitives/primitives.test.tsx` (ajout d'un `describe`)

**Interfaces:**
- Consumes: `Row`, `Group` (tâche 1).
- Produces: `Advanced(props: { children: React.ReactNode; count?: number }): JSX.Element`.

- [ ] **Step 1: Ajouter les clés i18n**

Dans `src/lib/i18n.ts`, dictionnaire **français** (à côté de `"settings.general"`, ligne ~1057) :

```ts
  "settings.advanced-toggle": "Avancé",
  "settings.advanced-count": "{count} réglages",
  "settings.saved": "Enregistré",
  "settings.save-failed": "Non enregistré sur disque",
```

Dans le dictionnaire **anglais** (à côté de `"settings.general"`, ligne ~2536) :

```ts
  "settings.advanced-toggle": "Advanced",
  "settings.advanced-count": "{count} settings",
  "settings.saved": "Saved",
  "settings.save-failed": "Not saved to disk",
```

- [ ] **Step 2: Écrire le test qui échoue**

Ajouter à la fin de `src/components/settings/primitives/primitives.test.tsx` :

```tsx
describe("Advanced", () => {
  it("est fermé par défaut : le contenu n'est pas dans le document", () => {
    renderUi(
      <Advanced count={2}>
        <Row title="Format d'heure"><span /></Row>
      </Advanced>,
    );
    expect(screen.queryByText("Format d'heure")).toBeNull();
  });

  it("le déclencheur est un bouton nommé, avec aria-expanded", () => {
    renderUi(<Advanced count={2}><Row title="Format d'heure"><span /></Row></Advanced>);
    const trigger = screen.getByRole("button", { name: /Avancé/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("cliquer déplie le contenu et bascule aria-expanded", () => {
    renderUi(<Advanced count={2}><Row title="Format d'heure"><span /></Row></Advanced>);
    const trigger = screen.getByRole("button", { name: /Avancé/ });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Format d'heure")).toBeInTheDocument();
  });

  it("annonce le nombre de réglages repliés", () => {
    renderUi(<Advanced count={3}><Row title="X"><span /></Row></Advanced>);
    expect(screen.getByRole("button", { name: /3 réglages/ })).toBeInTheDocument();
  });
});
```

Ajouter `fireEvent` à l'import Testing Library en tête de fichier, et `Advanced` à l'import de `./index` :

```tsx
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { Advanced, Group, Row } from "./index";
```

- [ ] **Step 3: Lancer le test pour vérifier qu'il échoue**

```bash
npx vitest run src/components/settings/primitives/primitives.test.tsx
```

Attendu : ÉCHEC — `"Advanced" is not exported`.

- [ ] **Step 4: Écrire la primitive**

`src/components/settings/primitives/Advanced.tsx` :

```tsx
// Repli « Avancé » (lot 1) : rien n'est supprimé de la surface des réglages,
// la moitié passe simplement sous ce repli, FERMÉ par défaut. L'état n'est
// délibérément PAS persisté — un repli qui se souvient d'être ouvert annule
// son bénéfice au démarrage suivant.
import React, { useState } from "react";
import { RowButton } from "../../ui";
import { t } from "../../../lib/i18n";

export function Advanced(p: { children: React.ReactNode; count?: number }) {
  const [open, setOpen] = useState(false);
  const label = p.count
    ? `${t("settings.advanced-toggle")} · ${t("settings.advanced-count", { count: p.count })}`
    : t("settings.advanced-toggle");
  return (
    <div className="set-advanced">
      <RowButton
        className={`set-advanced-trigger ${open ? "on" : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
        {label}
      </RowButton>
      {open && <div className="set-advanced-body">{p.children}</div>}
    </div>
  );
}
```

Ajouter à `src/components/settings/primitives/index.ts` :

```ts
export { Advanced } from "./Advanced";
```

- [ ] **Step 5: Ajouter le style**

Dans `src/App.css`, juste après la règle `.set-btn.quiet:hover` (ligne ~1399) :

```css
/* Repli « Avancé » d'une section de réglages (lot 1). Le chevron pivote,
   rien d'autre ne bouge : 140ms, sous le plafond de 200ms du système. */
.set-advanced { margin-bottom: 28px; }
.set-advanced-trigger { display: flex; align-items: center; gap: 8px;
  font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.08em;
  font-weight: 500; color: var(--text-muted); padding: 6px 2px; }
.set-advanced-trigger:hover { color: var(--text-primary); }
.set-advanced-trigger svg { transition: transform var(--ease); }
.set-advanced-trigger.on svg { transform: rotate(90deg); }
.set-advanced-body { margin-top: 8px; }
@media (prefers-reduced-motion: reduce) {
  .set-advanced-trigger svg { transition: none; }
}
```

- [ ] **Step 6: Lancer les tests pour vérifier qu'ils passent**

```bash
npx vitest run src/components/settings/primitives/primitives.test.tsx
npx vitest run src/components/ui/css-contract.test.ts
```

Attendu : 8 tests PASS pour les primitives ; le contrat CSS reste vert (aucun `<button>` nu ajouté — `RowButton` est utilisé).

- [ ] **Step 7: Commit**

```bash
git add src/components/settings/primitives src/lib/i18n.ts src/App.css
git commit -m "feat(settings): primitive Advanced, repli fermé par défaut

Répond au grief « trop de réglages exposés » : rien n'est retiré, la moitié
des rangées passe sous un repli. L'état n'est pas persisté, volontairement.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3 : Pastille « Enregistré »

Répond à « est-ce que je peux appuyer sur save ? » (spec §1.4, §10) : la persistance existe déjà, c'est le retour qui manque.

**Files:**
- Create: `src/components/settings/primitives/SavedIndicator.tsx`
- Modify: `src/components/settings/primitives/index.ts`
- Modify: `src/App.css` (après le bloc `.set-advanced`)
- Test: `src/components/settings/primitives/savedIndicator.test.tsx`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `useSavedFlash(): { visible: boolean; flash: () => void }`
  - `SavedIndicator(props: { visible: boolean; failed?: boolean }): JSX.Element`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/components/settings/primitives/savedIndicator.test.tsx` :

```tsx
// Pastille « Enregistré » (lot 1) : la persistance existe déjà (localStorage
// + miroir disque) ; ce qui manquait, c'est le retour visuel.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen } from "@testing-library/react";
import { renderUi, resetTestState } from "../../../test/render";
import { setLanguage } from "../../../lib/i18n";
import { SavedIndicator, useSavedFlash } from "./index";

beforeEach(() => { resetTestState(); setLanguage("fr"); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); cleanup(); });

function Harness() {
  const { visible, flash } = useSavedFlash();
  return (
    <>
      <SavedIndicator visible={visible} />
      <button type="button" onClick={flash}>changer</button>
    </>
  );
}

describe("SavedIndicator", () => {
  it("annonce poliment sans voler le focus", () => {
    renderUi(<SavedIndicator visible={true} />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Enregistré");
  });

  it("reste dans le document quand il est masqué, pour que aria-live fonctionne", () => {
    const { container } = renderUi(<SavedIndicator visible={false} />);
    const el = container.querySelector(".set-saved");
    expect(el).not.toBeNull();
    expect(el).not.toHaveClass("on");
  });

  it("un échec d'écriture disque dit ce qui s'est passé, pas juste une couleur", () => {
    renderUi(<SavedIndicator visible={true} failed={true} />);
    expect(screen.getByRole("status")).toHaveTextContent("Non enregistré sur disque");
  });
});

describe("useSavedFlash", () => {
  it("flash() montre la pastille puis la masque après 1,6 s", () => {
    renderUi(<Harness />);
    expect(document.querySelector(".set-saved.on")).toBeNull();

    act(() => { screen.getByText("changer").click(); });
    expect(document.querySelector(".set-saved.on")).not.toBeNull();

    act(() => { vi.advanceTimersByTime(1600); });
    expect(document.querySelector(".set-saved.on")).toBeNull();
  });

  it("un second flash relance le délai au lieu de le cumuler", () => {
    renderUi(<Harness />);
    act(() => { screen.getByText("changer").click(); });
    act(() => { vi.advanceTimersByTime(1000); });
    act(() => { screen.getByText("changer").click(); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(document.querySelector(".set-saved.on")).not.toBeNull();
    act(() => { vi.advanceTimersByTime(600); });
    expect(document.querySelector(".set-saved.on")).toBeNull();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
npx vitest run src/components/settings/primitives/savedIndicator.test.tsx
```

Attendu : ÉCHEC — `"SavedIndicator" is not exported`.

- [ ] **Step 3: Écrire la primitive**

`src/components/settings/primitives/SavedIndicator.tsx` :

```tsx
// Pastille « Enregistré » (lot 1). Il n'y a PAS de bouton Enregistrer :
// settings.ts:287 écrit dans localStorage à chaque changement et App.tsx:683
// miroite sur disque (débouncé 200ms). Ce qui manquait était le retour —
// sans lui, l'utilisateur cherche un bouton Save qui n'existe pas.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../../../lib/i18n";

const FLASH_MS = 1600;

export function useSavedFlash() {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback(() => {
    setVisible(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), FLASH_MS);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { visible, flash };
}

export function SavedIndicator(p: { visible: boolean; failed?: boolean }) {
  // Toujours monté : un nœud aria-live inséré au moment de l'annonce n'est
  // pas lu par les lecteurs d'écran.
  return (
    <span
      className={`set-saved ${p.visible ? "on" : ""} ${p.failed ? "failed" : ""}`}
      role="status"
      aria-live="polite"
    >
      {p.visible && (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {p.failed ? <path d="M12 8v5M12 17h.01" /> : <path d="M20 6L9 17l-5-5" />}
          </svg>
          {p.failed ? t("settings.save-failed") : t("settings.saved")}
        </>
      )}
    </span>
  );
}
```

Ajouter à `src/components/settings/primitives/index.ts` :

```ts
export { SavedIndicator, useSavedFlash } from "./SavedIndicator";
```

- [ ] **Step 4: Ajouter le style**

Dans `src/App.css`, après le bloc `.set-advanced-body` :

```css
/* Pastille « Enregistré » : confirme l'écriture immédiate. 140ms d'opacité,
   jamais de déplacement — la rangée ne doit pas sauter. */
.set-saved { display: inline-flex; align-items: center; gap: 5px;
  font-size: var(--fs-s); color: var(--status-success);
  opacity: 0; transition: opacity var(--ease); }
.set-saved.on { opacity: 1; }
.set-saved.failed { color: var(--status-warning); }
@media (prefers-reduced-motion: reduce) { .set-saved { transition: none; } }
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

```bash
npx vitest run src/components/settings/primitives/savedIndicator.test.tsx
```

Attendu : 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/primitives src/App.css
git commit -m "feat(settings): pastille « Enregistré »

La persistance marchait déjà (localStorage + miroir disque débouncé) ; c'est
le retour qui manquait, d'où la question « où est le bouton save ». Pas de
bouton ajouté : une confirmation.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4 : Registre des sections et types partagés

Le registre est la **source unique** des sections : la nav, le select compact et les tests le consomment. Ajouter Extensions au lot 5 sera une ligne ici.

**Files:**
- Create: `src/components/settings/sections.ts`
- Create: `src/components/settings/shared.ts`
- Test: `src/components/settings/sections.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `type SectionId = "general" | "modeles" | "apparence" | "atelier"`
  - `const SECTIONS: readonly { id: SectionId; labelKey: I18nKey }[]`
  - `function resolveSection(raw: string | undefined): SectionId`
  - `type SectionProps = { s: Settings; set: (patch: Partial<Settings>) => void; ws: WebSocket | null; onSaved: () => void; projects?: string[] }`
  - `type ProviderCatalogRow` et `type ApiProviderRow` (déplacés depuis `Settings.tsx:63-81`)

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/components/settings/sections.test.ts` :

```ts
// Registre des sections (lot 1) : source unique consommée par la nav, le
// select compact et le routage.
import { describe, expect, it } from "vitest";
import { SECTIONS, resolveSection } from "./sections";

describe("SECTIONS", () => {
  it("expose les quatre sections du lot 1, dans l'ordre de lecture", () => {
    expect(SECTIONS.map((s) => s.id)).toEqual(["general", "modeles", "apparence", "atelier"]);
  });

  it("chaque section porte une clé i18n, jamais un libellé en dur", () => {
    for (const section of SECTIONS) {
      expect(section.labelKey.startsWith("settings.")).toBe(true);
    }
  });
});

describe("resolveSection", () => {
  it("retourne la section demandée quand elle existe", () => {
    expect(resolveSection("apparence")).toBe("apparence");
  });

  it("retombe sur « general » pour une section inconnue", () => {
    // Les sections retirées (setup, providers, review, appsnap, avance) sont
    // encore citées par d'anciens deep-links et par openSettings(App.tsx:1139).
    expect(resolveSection("providers")).toBe("general");
    expect(resolveSection(undefined)).toBe("general");
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
npx vitest run src/components/settings/sections.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "./sections"`.

- [ ] **Step 3: Écrire le registre**

`src/components/settings/sections.ts` :

```ts
// Registre des sections de réglages (lot 1). Source UNIQUE : la nav colonne,
// le select compact ≤880px et le routage le consomment. Ajouter une section
// = une ligne ici + un fichier dans sections/.
import type { I18nKey } from "../../lib/i18n";

export type SectionId = "general" | "modeles" | "apparence" | "atelier";

export const SECTIONS: readonly { id: SectionId; labelKey: I18nKey }[] = [
  { id: "general", labelKey: "settings.general" },
  { id: "modeles", labelKey: "settings.models" },
  { id: "apparence", labelKey: "settings.appearance" },
  { id: "atelier", labelKey: "settings.atelier" },
] as const;

/** Les anciennes sections (setup, providers, review, appsnap, avance) sont
 *  encore citées par des deep-links : elles retombent sur « general » plutôt
 *  que d'afficher une page vide. */
export function resolveSection(raw: string | undefined): SectionId {
  return SECTIONS.some((s) => s.id === raw) ? (raw as SectionId) : "general";
}
```

`src/components/settings/shared.ts` — déplacer les types depuis `Settings.tsx:63-81` :

```ts
// Types partagés entre les sections de réglages (lot 1). Déplacés depuis
// Settings.tsx sans changement.
import type { Settings } from "../../lib/settings";

/** Props que la coquille passe à CHAQUE section. Une section ne reçoit
 *  jamais l'objet de props complet de la page. */
export type SectionProps = {
  s: Settings;
  set: (patch: Partial<Settings>) => void;
  ws: WebSocket | null;
  /** À appeler après tout changement : déclenche la pastille « Enregistré ». */
  onSaved: () => void;
  projects?: string[];
};

export type ProviderCatalogRow = {
  id: string;
  label: string;
  version: string | null;
  ok: boolean;
  kind?: "cli" | "api";
  models?: string[];
  defaultModel?: string | null;
  efforts?: string[];
};

export type ApiProviderRow = {
  id: string;
  label: string;
  baseURL: string;
  protocol: "openai" | "anthropic";
  models: string[];
  defaultModel: string;
  keySet: boolean;
  apiKeyEnv?: string | null;
  modelReasoning?: Record<string, unknown>;
};
```

- [ ] **Step 4: Vérifier que `I18nKey` est bien exporté**

```bash
grep -n "export type I18nKey" src/lib/i18n.ts
```

Attendu : une ligne. Si le type n'est pas exporté, l'exporter (`export type I18nKey = keyof typeof fr;`) sans rien changer d'autre.

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

```bash
npx vitest run src/components/settings/sections.test.ts
npx tsc --noEmit
```

Attendu : 4 tests PASS, aucune erreur TypeScript.

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/sections.ts src/components/settings/shared.ts src/components/settings/sections.test.ts
git commit -m "feat(settings): registre des sections et types partagés

Neuf sections deviennent quatre ; les anciens ids retombent sur « general »
au lieu d'afficher une page vide. Extensions s'ajoutera par une ligne.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5 : Section `General` (ex-`general` + ex-`avance`)

Première migration. Elle fixe le patron que les trois autres suivent : rangées **verbatim**, découpe essentiel / `Advanced`, `onSaved()` après chaque changement.

**Files:**
- Create: `src/components/settings/sections/General.tsx`
- Test: `src/components/settings/sections/General.test.tsx`
- Reference (à copier, ne pas modifier encore) : `src/components/Settings.tsx:478-594` (section `general`) et `:1230-1295` (section `avance`)

**Interfaces:**
- Consumes: `Row`, `Group`, `Advanced` (tâches 1-2), `SectionProps` (tâche 4).
- Produces: `export default function General(p: SectionProps): JSX.Element`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/components/settings/sections/General.test.tsx` :

```tsx
// Section Général (lot 1) : migration verbatim de general + avance, avec le
// repli « Avancé » et la remontée onSaved.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderUi, resetTestState } from "../../../test/render";
import { setLanguage } from "../../../lib/i18n";
import { DEFAULT_SETTINGS } from "../../../lib/settings";
import General from "./General";

beforeEach(() => { resetTestState(); setLanguage("fr"); vi.clearAllMocks(); });
afterEach(cleanup);

import type { SectionProps } from "../shared";

function props(over: Partial<SectionProps> = {}): SectionProps {
  return {
    s: { ...DEFAULT_SETTINGS },
    set: vi.fn(),
    ws: null,
    onSaved: vi.fn(),
    ...over,
  };
}

describe("Section Général", () => {
  it("montre les réglages essentiels sans rien déplier", () => {
    renderUi(<General {...props()} />);
    expect(screen.getByText("Recherche web")).toBeInTheDocument();
  });

  it("garde le format d'heure sous le repli « Avancé »", () => {
    renderUi(<General {...props()} />);
    expect(screen.queryByText("Format d'heure")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Avancé/ }));
    expect(screen.getByText("Format d'heure")).toBeInTheDocument();
  });

  it("changer un réglage appelle set ET onSaved", () => {
    const set = vi.fn();
    const onSaved = vi.fn();
    renderUi(<General {...props({ set, onSaved })} />);
    fireEvent.click(screen.getByRole("switch", { name: "Recherche web" }));
    expect(set).toHaveBeenCalledWith({ webSearch: true });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
npx vitest run src/components/settings/sections/General.test.tsx
```

Attendu : ÉCHEC — `Failed to resolve import "./General"`.

- [ ] **Step 3: Écrire la section**

`src/components/settings/sections/General.tsx`. Squelette et règles de migration — **copier les rangées existantes telles quelles** depuis `Settings.tsx:478-594` et `:1230-1295`, en remplaçant seulement `s.` → `p.s.`, `set(...)` → `save(...)`, et `<Group>` / `<Row>` par les imports des primitives :

```tsx
// Section Général (lot 1) : ex-« general » + ex-« avance » fusionnées. Les
// rangées sont migrées VERBATIM — ce lot ne redessine rien, il rend le
// redesign possible.
import React from "react";
import { Advanced, Group, Row } from "../primitives";
import type { SectionProps } from "../shared";
import type { Settings } from "../../../lib/settings";
import { t } from "../../../lib/i18n";
import { Switch } from "../../shadcn/switch";
import { Textarea } from "../../shadcn/textarea";
import { Select } from "../../Select";

export default function General(p: SectionProps) {
  // Un seul point de sortie : toute écriture confirme.
  const save = (patch: Partial<Settings>) => { p.set(patch); p.onSaved(); };

  return (
    <>
      <h1>{t("settings.general")}</h1>
      <p className="set-sub">{t("settings.general-sub")}</p>

      <Group>
        <Row title={t("settings.language")}>
          <Select
            title={t("settings.language")}
            value={p.s.language}
            onChange={(value) => save({ language: value as Settings["language"] })}
            options={[
              { value: "system", label: t("settings.language-system") },
              { value: "fr", label: "Français" },
              { value: "en", label: "English" },
            ]}
          />
        </Row>
        <Row title={t("settings.websearch")} desc={t("settings.websearch-desc")}>
          <Switch
            aria-label={t("settings.websearch")}
            checked={p.s.webSearch}
            onCheckedChange={(v) => save({ webSearch: v })}
          />
        </Row>
        <Row title={t("settings.extra-dirs")} desc={t("settings.extra-dirs-desc")}>
          <Textarea
            className="set-text"
            rows={3}
            value={p.s.additionalDirectories}
            onChange={(e) => save({ additionalDirectories: e.target.value })}
          />
        </Row>
        {/* … migrer ici les rangées restantes de Settings.tsx:478-594 :
            mode de permissions, ordre des fils, re-titrage. */}
      </Group>

      <Advanced count={2}>
        <Group>
          {/* … migrer ici les rangées de Settings.tsx:1230-1295 (ex-« avance ») :
              format d'heure, ordre des conversations. */}
        </Group>
      </Advanced>
    </>
  );
}
```

**Règle de migration, à appliquer rangée par rangée :** ouvrir `Settings.tsx` à la ligne indiquée, copier le JSX de la rangée sans le retoucher, puis ne changer que trois choses — `s.` devient `p.s.`, l'appel `set({…})` devient `save({…})`, et les clés i18n restent identiques. Si une rangée dépend d'un état local (`retitleStatus`), déplacer ce `useState` dans `General.tsx`.

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
npx vitest run src/components/settings/sections/General.test.tsx
npx tsc --noEmit
```

Attendu : 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/sections/General.tsx src/components/settings/sections/General.test.tsx
git commit -m "refactor(settings): section Général (general + avance)

Rangées migrées verbatim ; format d'heure et ordre des fils passent sous le
repli « Avancé ». Patron que suivent les trois autres sections.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6 : Sections `Appearance` et `Atelier`

Deux migrations qui suivent exactement le patron de la tâche 5. Regroupées : elles ne se rejettent pas l'une sans l'autre — même mécanique, aucun risque distinct.

**Files:**
- Create: `src/components/settings/sections/Appearance.tsx`
- Create: `src/components/settings/sections/Atelier.tsx`
- Test: `src/components/settings/sections/Appearance.test.tsx`
- Test: `src/components/settings/sections/Atelier.test.tsx`
- Reference : `Settings.tsx:673-789` (apparence), `:903-1005` (atelier + appsnap), `:863-902` (review)

**Interfaces:**
- Consumes: primitives (tâches 1-2), `SectionProps` (tâche 4).
- Produces:
  - `export default function Appearance(p: SectionProps): JSX.Element`
  - `export default function Atelier(p: SectionProps): JSX.Element`

- [ ] **Step 1: Écrire les tests qui échouent**

`src/components/settings/sections/Appearance.test.tsx` :

```tsx
// Section Apparence (lot 1) : migration verbatim, quatre groupes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderUi, resetTestState } from "../../../test/render";
import { setLanguage } from "../../../lib/i18n";
import { DEFAULT_SETTINGS } from "../../../lib/settings";
import type { SectionProps } from "../shared";
import Appearance from "./Appearance";

beforeEach(() => { resetTestState(); setLanguage("fr"); vi.clearAllMocks(); });
afterEach(cleanup);

function props(over: Partial<SectionProps> = {}): SectionProps {
  return { s: { ...DEFAULT_SETTINGS }, set: vi.fn(), ws: null, onSaved: vi.fn(), ...over };
}

describe("Section Apparence", () => {
  it("le mode de thème reste un radiogroup (contrat conservé du plan 021)", () => {
    renderUi(<Appearance {...props()} />);
    expect(screen.getByRole("radiogroup", { name: /thème/i })).toBeInTheDocument();
  });

  it("les vignettes de thème restent de vrais boutons focusables", () => {
    renderUi(<Appearance {...props()} />);
    const vignettes = screen.getAllByRole("button").filter((b) => b.classList.contains("theme-row"));
    expect(vignettes.length).toBeGreaterThan(0);
    vignettes[0].focus();
    expect(document.activeElement).toBe(vignettes[0]);
  });

  it("le fondu du streaming est sous le repli « Avancé »", () => {
    renderUi(<Appearance {...props()} />);
    expect(screen.queryByText(/fondu/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Avancé/ }));
    expect(screen.getByText(/fondu/i)).toBeInTheDocument();
  });

  it("changer la densité appelle set et onSaved", () => {
    const set = vi.fn(); const onSaved = vi.fn();
    renderUi(<Appearance {...props({ set, onSaved })} />);
    fireEvent.click(screen.getByRole("radio", { name: "Compact" }));
    expect(set).toHaveBeenCalledWith({ density: "compact" });
    expect(onSaved).toHaveBeenCalled();
  });
});
```

`src/components/settings/sections/Atelier.test.tsx` :

```tsx
// Section Atelier (lot 1) : atelier + review + appsnap fusionnées.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderUi, resetTestState } from "../../../test/render";
import { setLanguage } from "../../../lib/i18n";
import { DEFAULT_SETTINGS } from "../../../lib/settings";
import type { SectionProps } from "../shared";
import Atelier from "./Atelier";

beforeEach(() => { resetTestState(); setLanguage("fr"); vi.clearAllMocks(); });
afterEach(cleanup);

function props(over: Partial<SectionProps> = {}): SectionProps {
  return { s: { ...DEFAULT_SETTINGS }, set: vi.fn(), ws: null, onSaved: vi.fn(), ...over };
}

describe("Section Atelier", () => {
  it("réunit la galerie et la revue automatique sur une seule page", () => {
    renderUi(<Atelier {...props()} />);
    expect(screen.getByText(/galerie/i)).toBeInTheDocument();
    expect(screen.getByText(/revue/i)).toBeInTheDocument();
  });

  it("AppSnap explique le vrai raccourci global et sa destination locale", () => {
    // Contrat conservé de Settings.test.tsx:69 — le texte ne doit pas se
    // perdre dans la fusion.
    renderUi(<Atelier {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: /Avancé/ }));
    expect(screen.getByText(/AppSnap/)).toBeInTheDocument();
  });

  it("activer le rafraîchissement automatique appelle set et onSaved", () => {
    const set = vi.fn(); const onSaved = vi.fn();
    renderUi(<Atelier {...props({ s: { ...DEFAULT_SETTINGS, autoRefreshAtelier: false }, set, onSaved })} />);
    fireEvent.click(screen.getByRole("switch", { name: /rafraîchir/i }));
    expect(set).toHaveBeenCalledWith({ autoRefreshAtelier: true });
    expect(onSaved).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
npx vitest run src/components/settings/sections/Appearance.test.tsx src/components/settings/sections/Atelier.test.tsx
```

Attendu : ÉCHEC — imports non résolus.

- [ ] **Step 3: Écrire `Appearance.tsx`**

Même règle de migration qu'à la tâche 5 (`s.` → `p.s.`, `set(` → `save(`). Structure imposée par la spec §9 :

```tsx
// Section Apparence (lot 1) : quatre groupes — Thème, Typographie, Le fil,
// Avancé. Les contrôles sont migrés verbatim de Settings.tsx:673-789 ;
// l'aperçu vivant arrive au lot 7.
import React from "react";
import { Advanced, Group, Row } from "../primitives";
import type { SectionProps } from "../shared";
import type { Settings } from "../../../lib/settings";
import { t } from "../../../lib/i18n";

export default function Appearance(p: SectionProps) {
  const save = (patch: Partial<Settings>) => { p.set(patch); p.onSaved(); };

  return (
    <>
      <h1>{t("settings.appearance")}</h1>
      <p className="set-sub">{t("settings.appearance-sub")}</p>

      <Group label={t("settings.group.theme")}>
        {/* migrer : mode (radiogroup), vignettes de préréglage (.theme-row),
            accent/bg/fg personnalisés — Settings.tsx:677-715 */}
      </Group>

      <Group label={t("settings.group.typography")}>
        {/* migrer : uiFont, codeFont, baseFontSize, fontSmoothing
            — Settings.tsx:716-748 */}
      </Group>

      <Group label={t("settings.group.thread")}>
        {/* migrer : transcriptView, chatFontSize, chatWidth, chatLineHeight,
            density — Settings.tsx:749-789 */}
      </Group>

      <Advanced count={2}>
        <Group>
          {/* migrer : streamFade, displayTimestamps */}
        </Group>
      </Advanced>
    </>
  );
}
```

Si les clés `settings.group.typography` et `settings.group.thread` n'existent pas, les ajouter aux **deux** dictionnaires de `src/lib/i18n.ts` — fr : `"Typographie"`, `"Le fil de conversation"` ; en : `"Typography"`, `"Conversation thread"`.

- [ ] **Step 4: Écrire `Atelier.tsx`**

```tsx
// Section Atelier (lot 1) : ex-« atelier » + ex-« review » + ex-« appsnap ».
// Review et AppSnap n'étaient pas des destinations — ce sont des groupes.
import React from "react";
import { Advanced, Group, Row } from "../primitives";
import type { SectionProps } from "../shared";
import type { Settings } from "../../../lib/settings";
import { t } from "../../../lib/i18n";
import { RemoteDevicesPanel } from "../../RemoteDevicesPanel";

export default function Atelier(p: SectionProps) {
  const save = (patch: Partial<Settings>) => { p.set(patch); p.onSaved(); };

  return (
    <>
      <h1>{t("settings.atelier")}</h1>
      <p className="set-sub">{t("settings.atelier-sub")}</p>

      <Group>
        {/* migrer : galleryPath, galleryExts, autoRefreshAtelier
            — Settings.tsx:903-1005 */}
      </Group>

      <Group label={t("settings.review")}>
        {/* migrer : autoReview.{enabled,provider,model,effort,trigger,autofix}
            — Settings.tsx:863-902 */}
      </Group>

      <Advanced count={3}>
        <Group>
          {/* migrer : enableAppSnap, appSnapPlaySound et le bloc de permissions
              AppSnap (getAppSnapState / onAppSnapState / requestAppSnapPermissions) */}
        </Group>
        <RemoteDevicesPanel ws={p.ws} />
      </Advanced>
    </>
  );
}
```

L'état AppSnap (`useState<AppSnapState>` + l'abonnement `onAppSnapState`) déménage de `Settings.tsx` vers `Atelier.tsx` : c'est le seul consommateur.

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

```bash
npx vitest run src/components/settings/sections/
npx tsc --noEmit
```

Attendu : 7 tests PASS (3 General + 4 Appearance + 3 Atelier = 10 au total sur le dossier).

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/sections
git commit -m "refactor(settings): sections Apparence et Atelier

Apparence en quatre groupes (thème, typographie, fil, avancé) ; Atelier
absorbe review et appsnap, qui n'étaient pas des destinations.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7 : Section `Models` (ex-`setup` + ex-`providers` + ex-`modeles`)

La fusion la plus lourde : trois sections en une. **Le tableau dense est le lot 3** — ici on regroupe et on garde la forme en rangées.

**Files:**
- Create: `src/components/settings/sections/Models.tsx`
- Test: `src/components/settings/sections/Models.test.tsx`
- Reference : `Settings.tsx:595-672` (setup), `:790-862` (modeles), `:1006-1229` (providers)

**Interfaces:**
- Consumes: primitives, `SectionProps`, `ProviderCatalogRow`, `ApiProviderRow` (tâche 4).
- Produces: `export default function Models(p: SectionProps): JSX.Element`

- [ ] **Step 1: Écrire le test qui échoue**

```tsx
// Section Modèles (lot 1) : setup + providers + modeles fusionnées. Le
// tableau dense arrive au lot 3 ; ici on vérifie que rien n'est perdu.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderUi, resetTestState } from "../../../test/render";
import { setLanguage } from "../../../lib/i18n";
import { DEFAULT_SETTINGS } from "../../../lib/settings";
import type { SectionProps } from "../shared";
import Models from "./Models";

beforeEach(() => { resetTestState(); setLanguage("fr"); vi.clearAllMocks(); });
afterEach(cleanup);

function fakeWs() {
  const ws = new EventTarget() as WebSocket;
  Object.defineProperty(ws, "readyState", { value: WebSocket.OPEN });
  Object.defineProperty(ws, "send", { value: vi.fn() });
  return ws;
}

function emitWs(ws: WebSocket, message: unknown) {
  act(() => ws.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) })));
}

function props(over: Partial<SectionProps> = {}): SectionProps {
  return { s: { ...DEFAULT_SETTINGS }, set: vi.fn(), ws: null, onSaved: vi.fn(), ...over };
}

describe("Section Modèles", () => {
  it("réunit statut d'installation, fournisseurs et efforts sur une page", () => {
    const ws = fakeWs();
    renderUi(<Models {...props({ ws })} />);
    emitWs(ws, {
      type: "providerStatus",
      providers: [{ id: "claude", label: "Claude", version: "2.4.1", ok: true, kind: "cli", models: ["claude-opus-5[1m]"] }],
    });
    expect(screen.getByText("Claude")).toBeInTheDocument();
  });

  it("ignore une entrée de catalogue sans models au lieu de planter", () => {
    // Contrat conservé de Settings.test.tsx:159.
    const ws = fakeWs();
    renderUi(<Models {...props({ ws })} />);
    emitWs(ws, { type: "providerStatus", providers: [{ id: "aux", label: "Aux", ok: true }] });
    expect(screen.queryByText("Aux")).not.toBeNull();
  });

  it("permet de chercher et mettre un modèle OpenCode en favori", async () => {
    // Contrat conservé de Settings.test.tsx:170 — la fonctionnalité ne doit
    // pas se perdre dans la fusion (elle sera généralisée au lot 3).
    const ws = fakeWs();
    const set = vi.fn();
    renderUi(<Models {...props({ ws, set })} />);
    emitWs(ws, {
      type: "providerStatus",
      providers: [{ id: "opencode", label: "opencode", ok: true, kind: "cli", models: ["opencode/glm-5.2"] }],
    });
    const search = await screen.findByPlaceholderText(/chercher/i);
    fireEvent.change(search, { target: { value: "glm" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /favori/i })).toBeInTheDocument());
  });

  it("garde les fournisseurs API et les slugs sous le repli « Avancé »", () => {
    renderUi(<Models {...props()} />);
    expect(screen.queryByText(/fournisseurs api/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Avancé/ }));
    expect(screen.getByText(/fournisseurs api/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
npx vitest run src/components/settings/sections/Models.test.tsx
```

Attendu : ÉCHEC — import non résolu.

- [ ] **Step 3: Écrire la section**

```tsx
// Section Modèles (lot 1) : setup + providers + modeles fusionnées. Ce lot
// REGROUPE seulement — le tableau dense, les défauts sur place et les favoris
// généralisés sont le lot 3.
import React, { useEffect, useState } from "react";
import { Advanced, Group, Row } from "../primitives";
import type { ApiProviderRow, ProviderCatalogRow, SectionProps } from "../shared";
import type { Settings } from "../../../lib/settings";
import { t } from "../../../lib/i18n";

export default function Models(p: SectionProps) {
  const save = (patch: Partial<Settings>) => { p.set(patch); p.onSaved(); };
  const [provs, setProvs] = useState<ProviderCatalogRow[] | null>(null);
  const [apiProvs, setApiProvs] = useState<ApiProviderRow[]>([]);

  // Abonnement WebSocket déplacé verbatim de Settings.tsx : la section est
  // désormais le seul consommateur de providerStatus.
  useEffect(() => {
    const ws = p.ws;
    if (!ws) return;
    const onMessage = (event: MessageEvent) => {
      /* migrer ici le corps du handler de Settings.tsx (providerStatus,
         apiProviders, setupStatus), sans changement de logique */
    };
    ws.addEventListener("message", onMessage);
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: "providerStatus" }));
    return () => ws.removeEventListener("message", onMessage);
  }, [p.ws]);

  return (
    <>
      <h1>{t("settings.models")}</h1>
      <p className="set-sub">{t("settings.models-sub")}</p>

      <Group label={t("settings.providers")}>
        {/* migrer : liste des fournisseurs avec pastille détecté/absent,
            ordre ↑↓, visibilité — Settings.tsx:1006-1052 */}
      </Group>

      <Group label={t("settings.model-effort-sub")}>
        {/* migrer : table effort par modèle — Settings.tsx:818-843 */}
      </Group>

      <Group label={t("settings.opencode-models")}>
        {/* migrer : recherche + favoris opencode — Settings.tsx:1053-1114 */}
      </Group>

      <Advanced count={3}>
        <Group label={t("settings.api-providers")}>
          {/* migrer : CRUD fournisseurs API — Settings.tsx:1115-1229 */}
        </Group>
        <Group label={t("settings.slug-saved")}>
          {/* migrer : slugs personnalisés — Settings.tsx:795-817, 843-860 */}
        </Group>
      </Advanced>
    </>
  );
}
```

**Règle de migration, à réappliquer ici rangée par rangée :** ouvrir `Settings.tsx` à la ligne indiquée, copier le JSX de la rangée sans le retoucher, puis ne changer que trois choses — `s.` devient `p.s.`, l'appel `set({…})` devient `save({…})`, et les clés i18n restent identiques. Tout état local dont la rangée dépend (`slugProv`, `slugText`, `openCodeModelQuery`, `apiForm`, `apiModels`, `apiModelsBusy`, `apiModelsError`, `apiModelsQuery`, `setup`) déménage dans `Models.tsx`.

**Attention à la fusion des handlers WebSocket.** `Settings.tsx` a un seul `useEffect` qui traite `providerStatus`, `apiProviders`, `setupStatus`, `listApiModels` et `retitleStatus`. Seuls les trois premiers appartiennent à `Models` ; `retitleStatus` part dans `General`. Ne pas dupliquer l'abonnement : chaque section n'écoute que ses propres types de message et ignore les autres.

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
npx vitest run src/components/settings/sections/Models.test.tsx
npx tsc --noEmit
```

Attendu : 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/sections/Models.tsx src/components/settings/sections/Models.test.tsx
git commit -m "refactor(settings): section Modèles (setup + providers + modeles)

Trois sections en une : l'identité d'un modèle cesse d'être éclatée. Ce lot
regroupe seulement ; le tableau dense est le lot 3.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8 : La coquille, et la mort de `Settings.tsx`

Dernière tâche : `SettingsPage.tsx` assemble le tout, l'ancien fichier disparaît, `App.tsx` et la suite de tests existante suivent.

**Files:**
- Create: `src/components/settings/SettingsPage.tsx`
- Delete: `src/components/Settings.tsx`
- Modify: `src/components/Settings.test.tsx` → déplacer vers `src/components/settings/SettingsPage.test.tsx`
- Modify: `src/App.tsx:42` (import lazy)
- Modify: `src/App.tsx:1139` (`openSettings("providers")` → `openSettings("modeles")`)

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: `export default function SettingsPage(p: { settings: Settings; onChange: (s: Settings) => void; onClose: () => void; ws: WebSocket | null; projects?: string[]; initialSection?: string }): JSX.Element` — **signature identique à l'ancienne**, pour qu'`App.tsx` ne change que son chemin d'import.

- [ ] **Step 1: Adapter la suite de tests existante**

`git mv src/components/Settings.test.tsx src/components/settings/SettingsPage.test.tsx`, puis :

- corriger les imports (`./Settings` → `./SettingsPage`, `../lib/settings` → `../../lib/settings`, `../test/render` → `../../test/render`) ;
- remplacer le test `"rend les 9 sections ; la section active porte aria-current"` par :

```tsx
  it("rend les quatre sections ; la section active porte aria-current", () => {
    renderUi(<SettingsPage {...props()} />);
    const items = screen.getAllByRole("button").filter((b) => b.classList.contains("set-nav-item"));
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveAttribute("aria-current", "true");
  });

  it("un deep-link vers une section supprimée retombe sur Général", () => {
    renderUi(<SettingsPage {...props({ initialSection: "providers" })} />);
    const items = screen.getAllByRole("button").filter((b) => b.classList.contains("set-nav-item"));
    expect(items[0]).toHaveAttribute("aria-current", "true");
  });
```

- garder **inchangés** les tests d'Échap (`:79`, `:92`), de restauration confirmée (`:104-130`) et de nav compacte (`:202`) : ce sont des contrats de la coquille, pas des sections ;
- **supprimer** les tests déplacés dans les fichiers de section (thème `:132`, vignettes `:151`, catalogue auxiliaire `:159`, favori opencode `:170`, AppSnap `:69`) — ils vivent désormais à côté de leur section.

- [ ] **Step 2: Lancer la suite pour vérifier qu'elle échoue**

```bash
npx vitest run src/components/settings/SettingsPage.test.tsx
```

Attendu : ÉCHEC — `Failed to resolve import "./SettingsPage"`.

- [ ] **Step 3: Écrire la coquille**

```tsx
// Coquille des réglages (lot 1). Elle ne connaît AUCUN réglage : nav, mode
// compact, Échap, restauration des défauts, routage. Chaque section reçoit
// exactement ce dont elle a besoin — jamais l'objet de props entier.
import React, { lazy, Suspense, useEffect, useState } from "react";
import { confirm as tauriConfirm } from "@tauri-apps/plugin-dialog";
import { Settings as S, DEFAULT_SETTINGS } from "../../lib/settings";
import { t } from "../../lib/i18n";
import { Button, RowButton } from "../ui";
import { Select } from "../Select";
import { SavedIndicator, useSavedFlash } from "./primitives";
import { SECTIONS, resolveSection, type SectionId } from "./sections";
import type { SectionProps } from "./shared";

const General = lazy(() => import("./sections/General"));
const Models = lazy(() => import("./sections/Models"));
const Appearance = lazy(() => import("./sections/Appearance"));
const Atelier = lazy(() => import("./sections/Atelier"));

type PanelComponent = React.ComponentType<SectionProps>;

const PANELS: Record<SectionId, React.LazyExoticComponent<PanelComponent>> = {
  general: General, modeles: Models, apparence: Appearance, atelier: Atelier,
};

export default function SettingsPage(p: {
  settings: S;
  onChange: (s: S) => void;
  onClose: () => void;
  ws: WebSocket | null;
  projects?: string[];
  initialSection?: string;
}) {
  const [section, setSection] = useState<SectionId>(() => resolveSection(p.initialSection));
  // ≤880 px : la nav colonne écraserait le contenu — select compact au-dessus.
  const [narrow, setNarrow] = useState(() =>
    typeof window !== "undefined" && window.matchMedia?.("(max-width: 880px)")?.matches === true);
  const { visible: saved, flash } = useSavedFlash();

  // Conserver ici, verbatim de l'ancien fichier : l'abonnement matchMedia et
  // le handler Échap (qui ne doit PAS se déclencher pendant une saisie, ni se
  // propager au raccourci global d'interruption).

  const set = (patch: Partial<S>) => p.onChange({ ...p.settings, ...patch });
  const Panel = PANELS[section];

  return (
    <div className={`settings-page ${narrow ? "narrow" : ""}`}>
      {narrow ? (
        <div className="set-nav-compact">
          <Button variant="ghost" className="set-back" onClick={p.onClose}>{t("action.back")}</Button>
          <Select
            title={t("settings.section")}
            value={section}
            onChange={(value) => setSection(value as SectionId)}
            options={SECTIONS.map((sec) => ({ value: sec.id, label: t(sec.labelKey) }))}
          />
        </div>
      ) : (
        <div className="set-nav">
          <Button variant="ghost" className="set-back" onClick={p.onClose}>{t("action.back")}</Button>
          {SECTIONS.map((sec) => (
            <RowButton
              key={sec.id}
              className={`set-nav-item ${section === sec.id ? "on" : ""}`}
              aria-current={section === sec.id ? "true" : undefined}
              onClick={() => setSection(sec.id)}
            >
              {t(sec.labelKey)}
            </RowButton>
          ))}
          <Button variant="ghost" className="set-restore" onClick={async () => {
            // Conserver verbatim : confirmation obligatoire, et une PANNE du
            // dialogue bloque l'action destructive (Settings.test.tsx:121).
            const ok = await tauriConfirm(t("settings.restore-confirm"), { kind: "warning" }).catch(() => false);
            if (ok) { p.onChange({ ...DEFAULT_SETTINGS }); flash(); }
          }}>{t("settings.restore")}</Button>
        </div>
      )}

      <div className="set-body">
        <div className="set-body-status"><SavedIndicator visible={saved} /></div>
        <Suspense fallback={<p className="set-empty">{t("settings.checking")}</p>}>
          <Panel s={p.settings} set={set} ws={p.ws} onSaved={flash} projects={p.projects} />
        </Suspense>
      </div>
    </div>
  );
}
```

Ajouter le style de l'ancre de la pastille dans `src/App.css`, après `.set-saved` :

```css
.set-body-status { display: flex; justify-content: flex-end; height: 20px; margin-bottom: 4px; }
```

- [ ] **Step 4: Repointer `App.tsx`**

Ligne 42 :

```tsx
const SettingsPage = lazyWithRetry(() => import("./components/settings/SettingsPage"));
```

Ligne 1139 — la section `providers` n'existe plus :

```tsx
      onAction: () => openSettings("modeles"),
```

- [ ] **Step 5: Supprimer l'ancien fichier**

```bash
git rm src/components/Settings.tsx
```

- [ ] **Step 6: Lancer la suite complète**

```bash
npx vitest run src/components/settings/
npx vitest run src/App.settingsMirror.test.tsx src/App.settings-crash.test.tsx
npx vitest run src/components/ui/css-contract.test.ts
npx tsc --noEmit
npx vite build
```

Attendu : tout PASS. `App.settingsMirror` et `App.settings-crash` doivent passer **sans modification** — c'est la preuve que la persistance n'a pas bougé.

- [ ] **Step 7: Vérifier qu'aucune référence à l'ancien chemin ne subsiste**

```bash
grep -rn "components/Settings\"" src/ || echo "aucune référence résiduelle"
grep -rn "openSettings(\"providers\"\|openSettings(\"setup\"\|openSettings(\"review\"" src/ || echo "aucun deep-link mort"
```

Attendu : les deux messages « aucun ».

- [ ] **Step 8: Commit**

```bash
git add -A src/components/settings src/App.tsx src/App.css
git commit -m "refactor(settings): coquille et suppression de Settings.tsx

1295 lignes deviennent une coquille (nav, compact, Échap, restauration) plus
un fichier par section, chargé en lazy. Signature de page inchangée : App.tsx
ne change que son chemin d'import. Les deep-links vers les sections
supprimées retombent sur Général.

Persistance inchangée — App.settingsMirror et App.settings-crash passent sans
modification, c'est la preuve.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Vérification de fin de lot

Avant de déclarer le lot 1 terminé :

- [ ] `npx vitest run` — suite complète verte.
- [ ] `npx tsc --noEmit` — aucune erreur.
- [ ] `npx vite build` — build propre.
- [ ] `wc -l src/components/settings/**/*.tsx` — aucun fichier au-dessus de ~300 lignes ; si `Models.tsx` dépasse, c'est le signal que le lot 3 doit démarrer avant d'y toucher davantage.
- [ ] Relance de l'app selon `docs/PROTOCOLE_RELANCE.md` **à la lettre**, puis contrôle manuel : les quatre sections s'ouvrent, Échap ferme, la restauration demande confirmation, la pastille apparaît au changement d'un réglage et le réglage survit à un redémarrage.
- [ ] **Vérificateur indépendant** (règle globale de Thierry) : lancer un sous-agent qui ne voit que le diff et le critère « aucun comportement observable n'a changé, sauf l'apparition du repli Avancé et de la pastille Enregistré ».

## Ce que ce lot ne fait PAS

Rappel explicite, pour qu'aucune tâche ne déborde :

- Pas de tableau dense de modèles (lot 3).
- Pas de recherche globale (lot 2).
- Pas de découpage des routes opencode (lot 4).
- Pas de section Extensions (lot 5).
- Pas de dialogue d'installation (lot 6).
- Pas d'aperçu vivant (lot 7).
- **Aucune rangée redessinée.** Si une rangée semble mal fichue pendant la migration, la copier telle quelle et le noter — la redessiner ici masquerait une régression dans un diff de 1 300 lignes.
