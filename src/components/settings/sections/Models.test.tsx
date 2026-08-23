// Section Modèles (lot B1) : câblage du tableau dense (tâche 4). Utilise
// FakeWS (src/test/fixtures/sidecar.ts) plutôt qu'un mock local — depuis que
// la tâche 1 en a fait un EventTarget, on peut enfin monter la section avec
// un socket réellement OUVERT et lui envoyer un vrai providerStatus.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { renderUi, resetTestState } from "../../../test/render";
import { setLanguage, t } from "../../../lib/i18n";
import { DEFAULT_SETTINGS } from "../../../lib/settings";
import type { SectionProps } from "../shared";
import { FakeWS } from "../../../test/fixtures/sidecar";
import Models from "./Models";

// Base UI ScrollArea (favoris OpenCode) consultait l'API Web Animations,
// absente de jsdom — conservé même si le bloc opencode a disparu : d'autres
// primitives shadcn de cette section (Checkbox…) partagent la même famille.
const originalGetAnimations = Element.prototype.getAnimations;
beforeAll(() => {
  Element.prototype.getAnimations = () => [];
});
afterAll(() => {
  if (originalGetAnimations) Element.prototype.getAnimations = originalGetAnimations;
  else delete (Element.prototype as Partial<Element>).getAnimations;
});

beforeEach(() => { resetTestState(); setLanguage("fr"); vi.clearAllMocks(); FakeWS.reset(); });
afterEach(cleanup);

/** FakeWS déjà connectée (readyState OPEN) — construite directement plutôt
 *  que via installFakeSidecar()/connect(), qui suppose un cycle
 *  invoke("sidecar_port") complet que cette section ne déclenche pas
 *  elle-même (le socket lui est fourni tout fait par la coquille). */
function fakeWsOuvert(): FakeWS & WebSocket {
  const ws = new FakeWS("ws://fixture-models");
  ws.readyState = 1; // OPEN
  return ws as unknown as FakeWS & WebSocket;
}

function emit(ws: FakeWS, message: unknown) {
  act(() => ws.emit(message));
}

function props(over: Partial<SectionProps> = {}): SectionProps {
  return { s: { ...DEFAULT_SETTINGS }, set: vi.fn(), ws: null, onSaved: vi.fn(), ...over };
}

describe("Section Modèles", () => {
  it("réunit statut d'installation et fournisseurs sur une page", () => {
    const ws = fakeWsOuvert();
    renderUi(<Models {...props({ ws })} />);
    emit(ws, {
      type: "providerStatus",
      providers: [{ id: "claude", label: "Claude Code", version: "2.4.1", ok: true, kind: "cli", models: ["claude-opus-5"], efforts: [""] }],
    });
    expect(screen.getAllByText("Claude Code").length).toBeGreaterThan(0);
  });

  it("ignore une entrée de catalogue sans models au lieu de planter", () => {
    // Contrat conservé de Settings.test.tsx:159 — rendu maintenant dans
    // « Non disponibles » (buildModelRows.unavailable), pas dans un groupe setup.
    const ws = fakeWsOuvert();
    renderUi(<Models {...props({ ws })} />);
    emit(ws, { type: "providerStatus", providers: [{ id: "aux", label: "Aux", ok: true }] });
    expect(screen.queryByText("Aux")).not.toBeNull();
  });

  it("sans sidecar : notice d'avertissement (role=status), pas couleur seule", () => {
    // Contrat conservé de Settings.test.tsx:142.
    renderUi(<Models {...props({ ws: null })} />);
    const notice = document.querySelector(".ui-notice--warning");
    expect(notice).toBeTruthy();
    expect(notice!.getAttribute("role")).toBe("status");
    expect(notice!.textContent).toContain(t("settings.sidecar-disconnected-notice"));
  });

  it("garde les fournisseurs API et les slugs sous le repli « Avancé »", () => {
    renderUi(<Models {...props()} />);
    expect(screen.queryByText(/providers api/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Avancé/ }));
    expect(screen.getByText(/providers api/i)).toBeInTheDocument();
  });

  it("permet de chercher et mettre en favori un modèle depuis le tableau (généralisé, plus seulement opencode)", () => {
    // Remplace le contrat de Settings.test.tsx:170 : la recherche et les
    // favoris étaient réservés à opencode ; ModelsGrid (tâche 3) les
    // généralise à TOUS les fournisseurs (spec §6.2), donc le bloc de
    // recherche opencode dédié disparaît — c'est le tableau qui filtre.
    const ws = fakeWsOuvert();
    const set = vi.fn();
    renderUi(<Models {...props({ ws, set })} />);
    emit(ws, {
      type: "providerStatus",
      providers: [{ id: "opencode", label: "opencode", ok: true, kind: "cli", models: ["opencode/glm-5.2"], efforts: [""] }],
    });
    const search = screen.getByPlaceholderText(t("settings.models-grid.filter-ph"));
    fireEvent.change(search, { target: { value: "glm" } });
    const favori = screen.getByRole("button", { name: /favori/i });
    fireEvent.click(favori);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      favoriteModels: expect.objectContaining({ opencode: ["opencode/glm-5.2"] }),
    }));
  });

  // --- Tâche 4 : les cinq tests esquissés par le brief, écrits en entier ---

  it("affiche les modèles du catalogue reçu par le socket", async () => {
    const ws = fakeWsOuvert();
    renderUi(<Models {...props({ ws })} />);
    emit(ws, {
      type: "providerStatus",
      providers: [{
        id: "claude", label: "Claude Code", version: "2.4.1", ok: true, kind: "cli",
        models: ["claude-opus-5", "claude-sonnet-5"], efforts: ["", "low", "high"],
      }],
    });
    // "claude-opus-5" est mappé par BUILTIN_MODEL_LABELS (src/lib/modelCatalog.ts) → "Opus 5".
    expect(await screen.findByText("Opus 5")).toBeInTheDocument();
  });

  it("ne rend qu'UNE liste de fournisseurs, plus deux", () => {
    // La dette du lot 1 : ex-setup (installé/version/auth) et ex-providers
    // (détecté/absent, ordre, visibilité) listaient le MÊME ensemble de
    // fournisseurs l'un sous l'autre. Le fournisseur de départ segmenté
    // utilise volontairement "Claude"/"Codex" (pas le libellé du catalogue)
    // pour rester un sélecteur distinct du tableau, pas une 2e liste — voir
    // le commentaire de Models.tsx sur providerLabelFor.
    const ws = fakeWsOuvert();
    renderUi(<Models {...props({ ws })} />);
    emit(ws, {
      type: "providerStatus",
      providers: [{ id: "claude", label: "Claude Code", version: "2.4.1", ok: true, kind: "cli", models: ["claude-opus-5"], efforts: [""] }],
    });
    expect(screen.getAllByText("Claude Code")).toHaveLength(1);
  });

  it("choisir un défaut appelle set avec le modèle de CE fournisseur", () => {
    const ws = fakeWsOuvert();
    const set = vi.fn();
    renderUi(<Models {...props({ ws, set })} />);
    emit(ws, {
      type: "providerStatus",
      providers: [{
        id: "claude", label: "Claude Code", ok: true, kind: "cli",
        models: ["claude-opus-5", "claude-sonnet-5"], efforts: [""],
      }],
    });
    // Aucun des deux modèles n'est le défaut courant (DEFAULT_SETTINGS pointe
    // sur "claude-opus-5[1m]", absent de ce catalogue) : cliquer le premier
    // radio du TABLEAU doit donc appeler onSetDefault. Scopé à la table :
    // le segmenté « fournisseur de départ » ci-dessus est AUSSI un
    // role="radio" (SegmentedControl), getAllByRole seul le confondrait.
    const table = screen.getByRole("table");
    const [premier] = within(table).getAllByRole("radio");
    fireEvent.click(premier);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      defaultModel: expect.objectContaining({ claude: "claude-opus-5" }),
    }));
  });

  it("mettre en favori écrit dans favoriteModels du bon fournisseur", () => {
    const ws = fakeWsOuvert();
    const set = vi.fn();
    renderUi(<Models {...props({ ws, set })} />);
    emit(ws, {
      type: "providerStatus",
      providers: [{ id: "codex", label: "Codex", ok: true, kind: "cli", models: ["gpt-5.6-sol"], efforts: [""] }],
    });
    const favori = screen.getByRole("button", { name: /favori/i });
    fireEvent.click(favori);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      favoriteModels: expect.objectContaining({ codex: ["gpt-5.6-sol"] }),
    }));
    // Le fournisseur voisin (claude) n'est pas touché par erreur.
    const patch = set.mock.calls[0][0] as { favoriteModels: Record<string, string[]> };
    expect(patch.favoriteModels.claude).toBeUndefined();
  });

  it("les fournisseurs indisponibles portent l'action qui débloque", () => {
    const ws = fakeWsOuvert();
    renderUi(<Models {...props({ ws })} />);
    emit(ws, {
      type: "providerStatus",
      providers: [{ id: "grok", label: "Grok CLI", ok: false, kind: "cli", models: [] }],
    });
    emit(ws, {
      type: "setupStatus",
      status: {
        runtime: { node: "22.0.0", version: "1.0.0", bundled: true },
        sidecar: { pid: 1, startedAt: "", appVersion: "1.0.0", bundleHash: "x", dir: "/x" },
        providers: [{
          id: "grok", label: "Grok CLI", kind: "cli", installed: false, version: null,
          binPath: null, auth: "login_needed", models: 0, loginCommand: "grok login",
        }],
      },
    });
    expect(screen.getByText("Grok CLI")).toBeInTheDocument();
    const bouton = screen.getByRole("button", { name: t("settings.setup-login-terminal") });

    let capture: CustomEvent | null = null;
    const onCommand = (e: Event) => { capture = e as CustomEvent; };
    window.addEventListener("atelier-terminal-command", onCommand);
    fireEvent.click(bouton);
    window.removeEventListener("atelier-terminal-command", onCommand);

    expect(capture).not.toBeNull();
    expect((capture as unknown as CustomEvent).detail).toEqual({ command: "grok login" });
  });
});
