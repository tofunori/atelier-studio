// Feuille modale des réglages (lot A) : l'app reste montée derrière.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useState } from "react";
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

// Wrapper qui possède réellement l'état `open`, comme le fera App.tsx :
// SettingsSheet ne doit RIEN décider seule du montage/démontage, c'est
// Base UI qui gère la transition une fois `open` lié au vrai state React.
function Toggle(initial: boolean) {
  return function ToggleHarness() {
    const [open, setOpen] = useState(initial);
    return (
      <div>
        <button onClick={() => setOpen((o) => !o)}>toggle</button>
        <SettingsSheet
          open={open}
          onClose={() => setOpen(false)}
          settings={{ ...DEFAULT_SETTINGS }}
          onChange={vi.fn()}
          ws={null}
        />
      </div>
    );
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
    // Correction de revue : le champ doit vivre DANS la feuille (le
    // sous-arbre `.settings-sheet` du portail Base UI), pas ajouté
    // directement sur `document.body` — sinon le test protège un
    // emplacement que le vrai clavier ne peut pas atteindre pendant une
    // saisie réelle dans les réglages.
    const feuille = document.querySelector(".settings-sheet");
    expect(feuille).toBeTruthy();
    const champ = document.createElement("input");
    feuille!.appendChild(champ);
    champ.focus();
    fireEvent.keyDown(champ, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  // Contrat corrigé en revue (task-2-report.md) : `open` DOIT rester lié au
  // vrai state React (`open={p.open}`), jamais un littéral `true`, et
  // SettingsSheet ne doit JAMAIS arracher le sous-arbre elle-même via un
  // `if (!p.open) return null` prématuré — sinon la transition de sortie
  // câblée dans shadcn.css ([data-slot="dialog-content"][data-closed])
  // n'a jamais l'occasion de jouer. jsdom n'a pas le Web Animations API
  // (Element.prototype.getAnimations est absent) : Base UI le détecte et
  // saute alors sa propre attente d'anim, donc SANS ce mock la fermeture
  // semble instantanée même côté Base UI — ce test mocke `getAnimations`
  // pour forcer Base UI à réellement attendre, et vérifie que c'est SA
  // machine à états (pas la nôtre) qui retient le popup monté.
  it("la fermeture laisse Base UI jouer sa transition avant de démonter", async () => {
    let resolveFinished!: () => void;
    const finished = new Promise<void>((r) => { resolveFinished = r; });
    const fakeAnimation = { finished } as unknown as Animation;
    const originalGetAnimations = (HTMLElement.prototype as { getAnimations?: () => Animation[] }).getAnimations;
    (HTMLElement.prototype as { getAnimations?: () => Animation[] }).getAnimations = () => [fakeAnimation];
    try {
      const ToggleHarness = Toggle(true);
      const { baseElement } = renderUi(<ToggleHarness />);
      const popup = () => baseElement.querySelector('[data-slot="dialog-content"]');
      expect(popup()).not.toBeNull();
      fireEvent.click(baseElement.querySelector("button")!);
      // Synchrone, juste après le clic : Base UI n'a pas encore résolu
      // l'animation (mockée en attente) — le popup doit rester monté et
      // porter l'attribut de transition de sortie.
      expect(popup(), "le popup ne doit pas disparaître avant la fin de l'anim").not.toBeNull();
      expect(popup()?.hasAttribute("data-closed"), "data-closed doit être posé pendant l'anim").toBe(true);
      resolveFinished();
      await waitFor(() => expect(popup()).toBeNull());
    } finally {
      if (originalGetAnimations) {
        (HTMLElement.prototype as { getAnimations?: () => Animation[] }).getAnimations = originalGetAnimations;
      } else {
        delete (HTMLElement.prototype as { getAnimations?: () => Animation[] }).getAnimations;
      }
    }
  });

  it("l'ouverture anime aussi : le popup passe par l'état data-open", async () => {
    const ToggleHarness = Toggle(false);
    const { baseElement } = renderUi(<ToggleHarness />);
    const popup = () => baseElement.querySelector('[data-slot="dialog-content"]');
    expect(popup()).toBeNull();
    fireEvent.click(baseElement.querySelector("button")!);
    await waitFor(() => expect(popup()).not.toBeNull());
    expect(popup()?.hasAttribute("data-open")).toBe(true);
  });

  // jsdom ne résout jamais var(--x) : `expect(html).not.toMatch(/rgba\(/)`
  // passerait même avec une valeur inventée. On scanne la SOURCE App.css à
  // la manière de css-contract.test.ts.
  it("App.css : .settings-sheet pose le voile et l'élévation par leurs jetons, pas en dur", () => {
    const appCss = readFileSync(join(__dirname, "..", "..", "App.css"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = appCss.match(/\.settings-sheet\s*\{([^}]*)\}/);
    expect(rule, ".settings-sheet doit exister dans App.css").not.toBeNull();
    const body = rule![1];
    expect(body).toContain("var(--elevation-overlay)");
    expect(body).not.toMatch(/rgba\(/);
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  // Le brief proposait de lire `getComputedStyle(voile).backgroundColor` en
  // jsdom : ça ne peut pas échouer, jsdom ne résout pas var(--scrim) et
  // retourne une chaîne vide, jamais "rgb(0, 0, 0)" — le test passerait même
  // si le voile devenait réellement opaque. On scanne donc les SOURCES qui
  // déterminent l'opacité réelle du voile, comme pour .settings-sheet
  // ci-dessus (et comme css-contract.test.ts le fait pour les autres jetons).
  it("le voile derrière la feuille vient de --scrim et n'est pas surchargé en dur", () => {
    // DialogOverlay (composant partagé) doit peindre le voile via le jeton,
    // jamais une couleur littérale — sinon aucune section Apparence ne
    // pourrait le rendre translucide.
    const dialogSource = readFileSync(join(__dirname, "..", "shadcn", "dialog.tsx"), "utf8");
    expect(dialogSource).toContain("var(--scrim)");
    // La feuille des réglages ne doit pas passer overlayClassName pour
    // remplacer ce voile partagé par quelque chose d'opaque.
    const sheetSource = readFileSync(join(__dirname, "SettingsSheet.tsx"), "utf8");
    expect(sheetSource, "SettingsSheet ne doit pas surcharger le voile partagé").not.toMatch(
      /overlayClassName/,
    );
  });

  // Piège documenté du dépôt (voir MEMORY.md « App.css : règles écrasées
  // plus bas ») : une règle posée à un endroit peut être redéfinie plus loin
  // dans le fichier, typiquement sous un bloc [data-theme="dark"]. `.match`
  // sans drapeau global ne renvoie QUE la première occurrence — si une
  // redéfinition plus bas remontait l'alpha à 1 (voile opaque en thème
  // sombre), ce test resterait vert en ne regardant que la définition de
  // tête. `matchAll` force à vérifier TOUTES les définitions de --scrim,
  // pas seulement la première trouvée.
  it("--scrim (tokens.css) reste translucide sur TOUTES ses définitions — un voile opaque annulerait le lot", () => {
    const tokensCss = readFileSync(join(__dirname, "..", "..", "styles", "tokens.css"), "utf8");
    const matches = [...tokensCss.matchAll(/--scrim:\s*rgba?\(([^)]+)\)/g)];
    expect(matches.length, "--scrim doit être défini au moins une fois en rgb(a)(...) dans tokens.css").toBeGreaterThan(0);
    for (const match of matches) {
      const parts = match[1].split(",").map((n) => parseFloat(n.trim()));
      const alpha = parts.length === 4 ? parts[3] : 1;
      expect(alpha, `--scrim ne doit être ni totalement opaque ni transparent (définition: "${match[0]}")`).toBeGreaterThan(0);
      expect(alpha, `--scrim ne doit être ni totalement opaque ni transparent (définition: "${match[0]}")`).toBeLessThan(1);
    }
  });

  // Le voile (DialogOverlay) porte un flou d'arrière-plan préexistant et
  // volontairement LÉGER (backdrop-blur-xs). Le contrat du lot est que le
  // fil de conversation reste LISIBLE derrière la feuille de réglages — un
  // flou fort (blur-md/lg/xl/2xl/3xl) rendrait le texte du fil illisible
  // même si --scrim garde une alpha translucide et même si `var(--scrim)`
  // reste bien utilisé : les deux autres tests de ce fichier resteraient
  // verts pendant que la lisibilité, elle, aurait disparu. Ce test verrouille
  // donc la classe de flou elle-même, indépendamment de la couleur du voile.
  it("le flou du voile reste discret (backdrop-blur-xs/sm) — un flou fort rendrait le fil illisible derrière la feuille", () => {
    const dialogSource = readFileSync(join(__dirname, "..", "shadcn", "dialog.tsx"), "utf8");
    const blurMatches = [...dialogSource.matchAll(/backdrop-blur-([a-z0-9]+)/g)].map((m) => m[1]);
    expect(blurMatches.length, "aucune classe backdrop-blur trouvée dans dialog.tsx").toBeGreaterThan(0);
    const cransDiscrets = new Set(["xs", "sm"]);
    for (const cran of blurMatches) {
      expect(
        cransDiscrets.has(cran),
        `backdrop-blur-${cran} est trop fort pour le voile des réglages — seuls xs/sm gardent le fil lisible derrière`,
      ).toBe(true);
    }
  });
});
