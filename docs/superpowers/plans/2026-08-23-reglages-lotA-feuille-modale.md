# Réglages — Lot A : la feuille modale (plan d'implémentation)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Les réglages cessent de remplacer l'application entière et deviennent une feuille modale posée dessus, l'interface restant visible et montée derrière.

**Architecture:** `App.tsx` cesse de faire `return` quand `showSettings` est vrai : l'arbre normal reste rendu et la feuille arrive en surcouche à côté. Un composant mince `SettingsSheet` enveloppe `SettingsPage` dans le `Dialog` Base UI déjà présent dans `shadcn/`. `SettingsPage` n'apprend rien des modales : elle reste la coquille livrée au lot 1.

**Tech Stack:** React 18, TypeScript, Base UI (`@base-ui/react/dialog`) via `src/components/shadcn/dialog.tsx`, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-23-refonte-reglages-design.md` — ce lot ajoute une décision de présentation absente de la spec, consignée en §14 de ce plan.

## Pourquoi ce lot existe

`src/App.tsx:3675` fait aujourd'hui :

```tsx
if (showSettings) {
  return ( <SettingsPage … /> );   // tout le reste de l'app disparaît
}
```

L'application entière est démontée — chat, atelier, galerie. `.settings-page`
fait `height: 100vh` avec un fond opaque, ce qui donne l'illusion d'une
surcouche alors que rien ne subsiste derrière. Deux conséquences :

1. **La typographie du fil se règle à l'aveugle.** Taille du texte, largeur de
   colonne, interligne, densité : le fil n'est plus à l'écran quand on les
   modifie. C'est ce manque qui justifiait l'« aperçu vivant » de la spec §9.1.
2. **Le retour coûte un remontage complet** — position de défilement perdue.

**Conséquence sur la spec :** l'aperçu vivant du §9.1 devient sans objet. Le
vrai fil, visible derrière le voile, est un meilleur aperçu que n'importe quelle
maquette. La tâche 5 de ce plan retire cette section de la spec plutôt que de
la laisser traîner.

## Global Constraints

Copiées verbatim de CLAUDE.md. Elles s'appliquent à **chaque** tâche.

- **Aucun `<button>` nu** hors `src/components/ui/` et `src/components/shadcn/` — `Button`, `IconButton` ou `RowButton`. Verrouillé par `src/components/ui/css-contract.test.ts`.
- **Tailles de texte** : 10 / 11 / 12 / 13 / 15 px uniquement (`--fs-xs` … `--fs-xl`).
- **Poids** : 400 / 500 / 600. **Rayons** : 6 / 10 / 999 px. **Espacements** : multiples de 4.
- **Profondeur** : surfaces élevées = fond + ombre douce via `--elevation-overlay` ; voile de modale via `--scrim`. Verrouillé par `css-contract.test.ts`.
- **Motion** : 120–150 ms, jamais plus de 200 ms ; respecter `prefers-reduced-motion`.
- **Couleurs** : toute couleur via variable CSS, jamais de hex en dur.
- **Aucun emoji** ; icônes = SVG monochromes, stroke 1.3–1.5.
- **Français** pour les commentaires de code et les messages de commit.
- `npx tsc --noEmit` et `npx vite build` doivent passer.
- **Ne pas pusher** sans demande explicite.

## Le point délicat : le contrat d'Échap

`SettingsPage` porte un contrat **verrouillé par les tests** (`SettingsPage.test.tsx`) :

> Échap ferme la page — **mais jamais pendant une saisie** — et ne se propage
> pas au raccourci global d'interruption.

Le `Dialog` de Base UI ferme sur Échap **sans condition**. Posé naïvement, ce
lot casse un comportement testé : tu tapes un chemin de dossier, tu appuies sur
Échap pour annuler ta saisie, et toute la feuille se ferme.

**Mécanisme Base UI** (à vérifier dans la version installée avant de coder) :
`Dialog.Root` accepte `onOpenChange(open, eventDetails)` où `eventDetails.reason`
vaut `"escape-key"` pour une fermeture au clavier, et `eventDetails.cancel()`
annule la fermeture. La tâche 2 commence par une sonde qui établit l'API réelle
— **ne pas supposer**, la forme diffère entre versions.

## Structure de fichiers

```
src/components/settings/
  SettingsSheet.tsx        NOUVEAU — enveloppe Dialog + contrat d'Échap
  SettingsSheet.test.tsx   NOUVEAU
  SettingsPage.tsx         MODIFIÉ — perd son écouteur clavier, gagne `embedded`
src/App.tsx                MODIFIÉ — le `return` devient un rendu côte à côte
src/App.css                MODIFIÉ — `.settings-page` perd `height: 100vh`
```

---

### Task 1 : Sonde de l'API Base UI (spike)

Avant d'écrire quoi que ce soit, établir **comment** Base UI expose la raison de
fermeture dans la version installée. Une supposition fausse ici casse un contrat
testé.

**Files:**
- Test (jetable) : `src/components/settings/SettingsSheet.probe.test.tsx`

**Interfaces:**
- Consumes: `src/components/shadcn/dialog.tsx`.
- Produces: la signature exacte d'annulation, reportée dans le rapport et consommée par la tâche 2.

- [ ] **Step 1: Lire la version installée**

```bash
grep -n '"@base-ui' package.json
ls node_modules/@base-ui/react/dialog/ 2>/dev/null | head
```

- [ ] **Step 2: Écrire une sonde qui affiche la forme réelle**

```tsx
// Sonde jetable (lot A, tâche 1) : établit comment Base UI signale la raison
// d'une fermeture. SUPPRIMÉE à la fin de la tâche 2.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderUi, resetTestState } from "../../test/render";
import { Dialog, DialogContent } from "../shadcn/dialog";

describe("sonde Base UI", () => {
  it("expose la raison de fermeture à onOpenChange", () => {
    resetTestState();
    const onOpenChange = vi.fn();
    renderUi(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent><input aria-label="champ" /></DialogContent>
      </Dialog>,
    );
    fireEvent.keyDown(screen.getByLabelText("champ"), { key: "Escape" });
    // Affiche la forme réelle des arguments : c'est le but de la sonde.
    console.log("ARGS:", JSON.stringify(onOpenChange.mock.calls, null, 2));
    expect(onOpenChange).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Lancer la sonde et lire la sortie**

```bash
npx vitest run src/components/settings/SettingsSheet.probe.test.tsx
```

Noter dans le rapport : le nombre d'arguments, le nom du champ portant la raison,
sa valeur pour une fermeture au clavier, et **s'il existe un moyen d'annuler**
(`cancel()`, `preventDefault()`, ou retour de valeur). Si aucun mécanisme
d'annulation n'existe sur `onOpenChange`, inspecter les props de
`DialogPrimitive.Popup` (`onKeyDown`, `onEscapeKeyDown`) et reporter ce qui est
disponible.

- [ ] **Step 4: Commit de la sonde**

```bash
git add src/components/settings/SettingsSheet.probe.test.tsx
git commit -m "test(reglages): sonde de l'API de fermeture Base UI

Établit comment annuler une fermeture sur Échap avant de coder la feuille —
le contrat « Échap ne ferme pas pendant une saisie » en dépend.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2 : `SettingsSheet` et le contrat d'Échap

**Files:**
- Create: `src/components/settings/SettingsSheet.tsx`
- Create: `src/components/settings/SettingsSheet.test.tsx`
- Delete: `src/components/settings/SettingsSheet.probe.test.tsx`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: la signature établie en tâche 1 ; `SettingsPage` ; `Dialog`/`DialogContent`.
- Produces: `SettingsSheet(props: { open: boolean; onClose: () => void; settings: Settings; onChange: (s: Settings) => void; ws: WebSocket | null; projects?: string[]; initialSection?: string }): JSX.Element`

- [ ] **Step 1: Écrire les tests qui échouent**

```tsx
// Feuille modale des réglages (lot A) : l'app reste montée derrière.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderUi, resetTestState } from "../../test/render";
import { setLanguage } from "../../lib/i18n";
import { DEFAULT_SETTINGS } from "../../lib/settings";
import { SettingsSheet } from "./SettingsSheet";

beforeEach(() => { resetTestState(); setLanguage("fr"); vi.clearAllMocks(); });
afterEach(cleanup);

function props(over = {}) {
  return {
    open: true,
    onClose: vi.fn(),
    settings: { ...DEFAULT_SETTINGS },
    onChange: vi.fn(),
    ws: null,
    ...over,
  };
}

describe("SettingsSheet", () => {
  it("ne rend rien quand elle est fermée", () => {
    const { container } = renderUi(<SettingsSheet {...props({ open: false })} />);
    expect(container.querySelector(".settings-page")).toBeNull();
  });

  it("Échap ferme la feuille quand le focus n'est pas dans un champ", () => {
    const onClose = vi.fn();
    renderUi(<SettingsSheet {...props({ onClose })} />);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Échap NE ferme PAS pendant une saisie — contrat verrouillé", () => {
    const onClose = vi.fn();
    renderUi(<SettingsSheet {...props({ onClose })} />);
    const champ = document.createElement("input");
    document.body.appendChild(champ);
    champ.focus();
    fireEvent.keyDown(champ, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("pose le voile et l'élévation par leurs jetons, pas en dur", () => {
    const { baseElement } = renderUi(<SettingsSheet {...props()} />);
    const html = baseElement.innerHTML;
    expect(html).not.toMatch(/rgba\(0,\s*0,\s*0/);
  });
});
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

```bash
npx vitest run src/components/settings/SettingsSheet.test.tsx
```

Attendu : ÉCHEC — `"SettingsSheet" is not exported`.

- [ ] **Step 3: Écrire la feuille**

Squelette ; **la mécanique d'annulation d'Échap suit ce que la tâche 1 a établi**,
pas ce qui est esquissé ici :

```tsx
// Feuille modale des réglages (lot A). Les réglages ne remplacent plus
// l'application : elle reste montée derrière le voile, ce qui rend visibles
// en direct les réglages de typographie du fil.
import React from "react";
import { Dialog, DialogContent } from "../shadcn/dialog";
import SettingsPage from "./SettingsPage";
import type { Settings } from "../../lib/settings";
import { t } from "../../lib/i18n";

/** Le contrat verrouillé : Échap ferme, JAMAIS pendant une saisie. Base UI
 *  ferme sans condition, donc on annule nous-mêmes quand le focus est dans un
 *  champ — sinon annuler une saisie fermerait toute la feuille. */
function focusDansUnChamp(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function SettingsSheet(p: {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onChange: (s: Settings) => void;
  ws: WebSocket | null;
  projects?: string[];
  initialSection?: string;
}) {
  if (!p.open) return null;
  return (
    <Dialog
      open
      onOpenChange={(open, details) => {
        // Forme exacte de `details` établie par la sonde de la tâche 1.
        if (!open && focusDansUnChamp()) return;
        if (!open) p.onClose();
      }}
    >
      <DialogContent
        className="settings-sheet"
        showCloseButton={false}
        aria-label={t("settings.title")}
      >
        <SettingsPage
          settings={p.settings}
          onChange={p.onChange}
          onClose={p.onClose}
          ws={p.ws}
          projects={p.projects}
          initialSection={p.initialSection}
          embedded
        />
      </DialogContent>
    </Dialog>
  );
}
```

Si la clé i18n `settings.title` n'existe pas, l'ajouter aux **deux**
dictionnaires de `src/lib/i18n.ts` (fr : « Réglages », en : « Settings »).

- [ ] **Step 4: Ajouter le style de la feuille**

Dans `src/App.css`, à la suite du bloc `.set-*` :

```css
/* Feuille modale des réglages (lot A). Large à dessein : la section Modèles
   porte un tableau dense qu'un panneau étroit rendrait illisible. */
.settings-sheet { width: min(1100px, 94vw); height: min(760px, 90vh);
  max-width: min(1100px, 94vw); padding: 0; overflow: hidden;
  box-shadow: var(--elevation-overlay); border-radius: var(--r-m); }
/* Intégrée dans la feuille, la page ne prend plus toute la fenêtre. */
.settings-sheet .settings-page { height: 100%; border-radius: var(--r-m); }
```

- [ ] **Step 5: Rendre `SettingsPage` intégrable**

Ajouter la prop optionnelle `embedded?: boolean` à `SettingsPage`. Quand elle
est vraie : **ne pas** installer l'écouteur clavier d'Échap (la feuille s'en
charge) et **ne pas** poser `height: 100vh`. Le reste est inchangé — nav,
restauration, pastille, routage. Conserver le comportement actuel quand la prop
est absente, pour que `SetBench` continue de fonctionner.

- [ ] **Step 6: Supprimer la sonde et lancer les tests**

```bash
git rm src/components/settings/SettingsSheet.probe.test.tsx
npx vitest run src/components/settings/
npx tsc --noEmit
```

Attendu : tous les tests PASS, dont les quatre nouveaux.

- [ ] **Step 7: Commit**

```bash
git add -A src/components/settings src/App.css src/lib/i18n.ts
git commit -m "feat(reglages): feuille modale, l'app reste montée derrière

Le contrat « Échap ne ferme pas pendant une saisie » est réimplémenté sur la
feuille : Base UI ferme sans condition, on annule quand le focus est dans un
champ.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3 : Basculer `App.tsx`

**Files:**
- Modify: `src/App.tsx:3675-3700`
- Test: `src/App.settings-sheet.test.tsx` (nouveau)

**Interfaces:**
- Consumes: `SettingsSheet` (tâche 2).
- Produces: rien de nouveau ; `showSettings` cesse d'être un aiguillage de rendu.

- [ ] **Step 1: Écrire le test qui prouve le gain**

C'est **le** test du lot : il échoue aujourd'hui et ne peut passer qu'une fois
l'app maintenue montée.

```tsx
// Le gain du lot A : l'application reste montée derrière la feuille, donc les
// réglages de typographie du fil s'appliquent sous les yeux de l'utilisateur.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderUi, resetTestState } from "./test/render";
import { setLanguage } from "./lib/i18n";
import App from "./App";

beforeEach(() => { resetTestState(); setLanguage("fr"); });
afterEach(cleanup);

describe("Réglages en feuille modale", () => {
  it("l'interface principale reste dans le document quand les réglages s'ouvrent", async () => {
    renderUi(<App />);
    const railAvant = document.querySelector(".rail");
    expect(railAvant).not.toBeNull();

    // Ouvrir les réglages via la palette ou le raccourci exposé par l'app :
    // adapter au déclencheur réel trouvé dans App.tsx (bouton de rail, menu…).
    fireEvent.click(await screen.findByRole("button", { name: /réglages/i }));

    await waitFor(() => expect(document.querySelector(".settings-page")).not.toBeNull());
    // Le cœur du test : le rail n'a PAS été démonté.
    expect(document.querySelector(".rail")).not.toBeNull();
  });
});
```

Si aucun déclencheur n'est atteignable par le rôle dans l'app montée, piloter
`showSettings` par le chemin le plus proche du réel plutôt que d'exposer une
prop de test — et le noter dans le rapport.

- [ ] **Step 2: Lancer pour vérifier l'échec**

```bash
npx vitest run src/App.settings-sheet.test.tsx
```

Attendu : ÉCHEC — le rail est absent après ouverture (l'app fait `return`).

- [ ] **Step 3: Supprimer l'aiguillage**

Dans `src/App.tsx`, retirer le bloc `if (showSettings) { return (…) }` et rendre
la feuille dans l'arbre normal, à côté des autres surcouches (`CommandPalette`,
`UsagePopover`, `PluginPanel`) :

```tsx
<LazyBoundary fallback={null}>
  <SettingsSheet
    open={showSettings}
    onClose={() => setShowSettings(false)}
    settings={settings}
    onChange={setSettings}
    ws={ws.current}
    projects={projects}
    initialSection={settingsInitialSection}
  />
</LazyBoundary>
```

**Attention aux hooks.** Le commentaire d'`App.tsx:3635` avertit que des hooks
sont posés au-dessus du `return` précisément parce qu'il existe. En le
supprimant, vérifier qu'aucun hook ne se retrouve appelé conditionnellement —
c'est l'erreur la plus probable de cette tâche.

- [ ] **Step 4: Lancer les tests**

```bash
npx vitest run src/App.settings-sheet.test.tsx
npx vitest run src/App.settingsMirror.test.tsx src/App.settings-crash.test.tsx src/App.orchestration.test.tsx
npx vitest run src/components/settings/
npx tsc --noEmit && npx vite build
```

Les tests de persistance doivent passer **sans modification**.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.settings-sheet.test.tsx
git commit -m "feat(app): les réglages ne remplacent plus l'interface

Le rendu conditionnel devient une surcouche : le fil reste visible, donc les
réglages de typographie s'appliquent sous les yeux de l'utilisateur.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4 : Le voile ne doit pas geler ce qu'il couvre

Une modale bloque les interactions derrière elle. Ici, on **veut** que le fil
reste lisible et se re-rende en direct quand on change la typographie — mais on
ne veut pas qu'il reste cliquable.

**Files:**
- Modify: `src/components/settings/SettingsSheet.test.tsx`
- Modify: `src/App.css` si un ajustement du voile s'avère nécessaire

- [ ] **Step 1: Écrire le test**

```tsx
it("le voile laisse voir le fond sans le rendre opaque", () => {
  const { baseElement } = renderUi(<SettingsSheet {...props()} />);
  const voile = baseElement.querySelector('[data-slot="dialog-overlay"]');
  expect(voile).not.toBeNull();
  const bg = getComputedStyle(voile as Element).backgroundColor;
  // Un voile totalement opaque annulerait tout l'intérêt du lot.
  expect(bg).not.toBe("rgb(0, 0, 0)");
});
```

- [ ] **Step 2: Vérifier à l'œil, pas seulement au test**

jsdom ne calcule pas les variables CSS comme un navigateur. Après le build,
relancer l'app selon `docs/PROTOCOLE_RELANCE.md` **à la lettre** et vérifier :
le fil est lisible derrière le voile ; changer la taille du texte du fil se voit
immédiatement derrière ; le fond n'est pas cliquable.

Reporter ce qui a été observé, pas ce qui devrait l'être.

- [ ] **Step 3: Commit**

```bash
git add -A src/components/settings src/App.css
git commit -m "test(reglages): le voile laisse voir le fil derrière la feuille

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5 : Retirer l'aperçu vivant de la spec

Le §9.1 de la spec décrit un aperçu vivant dans la section Apparence. Ce lot le
rend **sans objet** : le vrai fil est visible derrière la feuille.

**Files:**
- Modify: `docs/superpowers/specs/2026-08-23-refonte-reglages-design.md`

- [ ] **Step 1: Réécrire le §9.1**

Remplacer la description de l'aperçu par le constat : la feuille modale laisse
le fil visible, donc l'aperçu n'a plus lieu d'être. Garder la trace de la
décision et de sa date — une spec qui perd une section sans dire pourquoi laisse
croire à un oubli.

Mettre également à jour le tableau des lots du §14 : le lot 7 (« Cockpit ») perd
sa raison d'être ; dire ce qu'il devient.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-08-23-refonte-reglages-design.md
git commit -m "docs(spec): l'aperçu vivant devient sans objet

La feuille modale laisse le vrai fil visible derrière les réglages : c'est un
meilleur aperçu que n'importe quelle maquette.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Vérification de fin de lot

- [ ] `npx vitest run` — pas de nouvel échec par rapport à l'état d'avant le lot (5 fichiers flakent déjà sous charge : `App.orchestration`, `AtelierPane.workspace`, `GitSurface`, `NarvalSurface`, `toast.contract` — les relancer isolément pour confirmer qu'ils passent).
- [ ] `npx tsc --noEmit` et `npx vite build` propres.
- [ ] `App.settingsMirror` et `App.settings-crash` passent **sans modification**.
- [ ] Relance selon `docs/PROTOCOLE_RELANCE.md` **à la lettre**, puis à l'œil :
  - la feuille s'ouvre par-dessus, le fil reste lisible derrière ;
  - **changer la taille du texte du fil se voit en direct derrière la feuille** — c'est le gain du lot ;
  - Échap ferme la feuille, mais **pas** quand le curseur est dans un champ ;
  - la position de défilement du fil est intacte à la fermeture ;
  - la nav latérale et la section Modèles ne sont pas à l'étroit.

## Lot B — périmètre arrêté, plan à écrire après

Le lot B reconstruit l'apparence de chaque section. Son plan s'écrira **une fois
la feuille en place**, parce que ses largeurs réelles conditionnent le dessin du
tableau dense. Périmètre déjà arrêté par la spec et l'artefact des directions :

| Surface | Cible |
|---|---|
| **Modèles** | Tableau dense (direction Console) : une ligne par modèle — défaut, nom, fournisseur, identifiant, contexte, effort, état, favori. En-tête collant, chips de filtre avec compteurs, barre d'état basse. Fournisseur et modèle de départ réglables sur place. |
| **opencode** | Routeur (direction Routeur) : `RoutedModel` découpé **en Rust**, regroupement par modèle avec routes repliées, filtre par passerelle, épinglage par route, rien affiché tant qu'on n'a pas filtré. |
| **Recherche** | Champ traversant les cinq sections, étiquetant la provenance de chaque résultat, incluant les rangées repliées sous « Avancé ». |
| **Apparence** | Groupes Thème / Typographie / Le fil / Avancé, avec segmentés, pastilles de préréglage et curseurs à valeur tabulaire. **Sans aperçu vivant** — le fil est derrière. |
| **Extensions** | Cinquième section : skills, plugins, serveurs MCP sous une grammaire de ligne unique, matrice de compatibilité par fournisseur, dialogue d'installation qui appelle la commande du CLI. |
| **Général · Atelier** | Rangées sobres, resserrées. |

Deux dettes du lot 1 à solder au passage, déjà identifiées par la revue finale :
la **double liste de fournisseurs** dans Modèles (ex-`setup` et ex-`providers`
rendent le même ensemble l'un sous l'autre), et les **titres de sous-blocs**
manquants dans cette même section.
