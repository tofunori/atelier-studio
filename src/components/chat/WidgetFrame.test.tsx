import { render, screen, cleanup, act, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WidgetFrame } from "./WidgetFrame";
import type { AgentEvent } from "../../lib/ws";
import { t } from "../../lib/i18n";
import { resetSidecarInfo, setSidecarInfo } from "../../lib/sidecarInfo";
import { rememberWidgetState, recallWidgetState, clearWidgetStates } from "./widgetState";

afterEach(() => cleanup());

const EVENT = {
  kind: "widget",
  id: "w_0123456789abcdef",
  title: "loi de Student — poids des résidus",
  height: 420,
} as Extract<AgentEvent, { kind: "widget" }>;

function mockFetch(impl: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

// Une promesse jamais résolue : les tests de la carte réservée ne veulent
// jamais que la coquille arrive — ils vérifient seulement le premier rendu.
function pendingFetch() {
  mockFetch(() => new Promise<Response>(() => {}));
}

describe("WidgetFrame — carte réservée", () => {
  beforeEach(() => {
    resetSidecarInfo();
    setSidecarInfo({ port: 4123 });
    pendingFetch();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("réserve la hauteur déclarée dès le premier rendu, avant tout chargement", () => {
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);
    const body = container.querySelector(".widget-body") as HTMLElement;
    expect(body.style.height).toBe("420px");
  });

  it("affiche le titre fourni par l'agent", () => {
    render(<WidgetFrame event={EVENT} threadId="t1" />);
    expect(screen.getByText(EVENT.title)).toBeTruthy();
  });

  it("reprend le châssis de .codeblock", () => {
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);
    expect(container.querySelector(".codeblock.widget-block")).toBeTruthy();
    expect(container.querySelector(".codeblock-bar")).toBeTruthy();
  });
});

describe("WidgetFrame — chargement", () => {
  beforeEach(() => {
    resetSidecarInfo();
    setSidecarInfo({ port: 4123 });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("monte une iframe src= verrouillée quand la coquille est confirmée", async () => {
    // src= et PAS srcdoc : un document srcdoc hérite de la CSP de l'app
    // (script-src 'self'), qui bloquait tous les scripts inline de la
    // coquille — widget muet en production, vu le 2026-08-29.
    mockFetch(async () => new Response("<html>coquille</html>", { status: 200 }));
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);

    await waitFor(() => {
      expect(container.querySelector("iframe")).toBeTruthy();
    });
    const frame = container.querySelector("iframe") as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("srcdoc")).toBeNull();
    expect(frame.getAttribute("src")).toBe(
      `http://127.0.0.1:4123/widgets/t1/${EVENT.id}`,
    );
  });

  it("retombe sur « expiré » et rend la hauteur quand le fichier a disparu", async () => {
    mockFetch(async () => new Response("nope", { status: 404 }));
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);

    await waitFor(() => {
      expect(screen.getByText(t("chat.widget-missing"))).toBeTruthy();
    });
    const body = container.querySelector(".widget-body") as HTMLElement | null;
    expect(body).toBeNull(); // la hauteur est rendue au fil
  });

  it("passe à « muet » si l'iframe ne dit jamais ready", async () => {
    vi.useFakeTimers();
    mockFetch(async () => new Response("<html>coquille</html>", { status: 200 }));
    render(<WidgetFrame event={EVENT} threadId="t1" />);

    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(3100); });

    expect(screen.getByText(t("chat.widget-mute"))).toBeTruthy();
    vi.useRealTimers();
  });

  it("passe à « live » et annule le minuteur muet quand ready arrive avant l'échéance", async () => {
    vi.useFakeTimers();
    mockFetch(async () => new Response("<html>coquille</html>", { status: 200 }));
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);

    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    const frame = container.querySelector("iframe") as HTMLIFrameElement;
    expect(frame).toBeTruthy();
    Object.defineProperty(frame, "contentWindow", {
      value: { postMessage: () => {} },
    });

    await act(async () => {
      window.dispatchEvent(new MessageEvent("message", {
        data: { source: "atelier-widget", type: "ready" },
        source: frame.contentWindow as Window,
      }));
    });

    expect(container.querySelector("iframe.live")).toBeTruthy();

    // le minuteur "muet" (3s) doit avoir été annulé par l'arrivée de ready :
    // le dépasser ne doit plus faire régresser la phase.
    await act(async () => { vi.advanceTimersByTime(3100); });

    expect(container.querySelector("iframe.live")).toBeTruthy();
    expect(screen.queryByText(t("chat.widget-mute"))).toBeNull();
    vi.useRealTimers();
  });

  it("va directement à « expiré » sans requête réseau quand threadId est absent", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { container } = render(<WidgetFrame event={EVENT} threadId={null} />);

    await waitFor(() => {
      expect(screen.getByText(t("chat.widget-missing"))).toBeTruthy();
    });
    expect(container.querySelector(".widget-body")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("WidgetFrame — thème et état", () => {
  beforeEach(() => {
    resetSidecarInfo();
    setSidecarInfo({ port: 4123 });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("rejoue le thème sans remonter l'iframe", async () => {
    mockFetch(async () => new Response("<html>coquille</html>", { status: 200 }));
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);
    await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy());
    const first = container.querySelector("iframe");

    await act(async () => {
      window.dispatchEvent(new CustomEvent("app-theme-changed", { detail: "nuit" }));
    });

    expect(container.querySelector("iframe")).toBe(first);
  });

  it("renvoie l'état gelé au remontage, avant de révéler la frame", async () => {
    clearWidgetStates();
    rememberWidgetState(EVENT.id, { nu: 7 });
    mockFetch(async () => new Response("<html>coquille</html>", { status: 200 }));

    const posted: unknown[] = [];
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);
    await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy());
    const frame = container.querySelector("iframe") as HTMLIFrameElement;
    Object.defineProperty(frame, "contentWindow", {
      value: { postMessage: (m: unknown) => posted.push(m) },
    });

    await act(async () => {
      window.dispatchEvent(new MessageEvent("message", {
        data: { source: "atelier-widget", type: "ready" },
        source: frame.contentWindow as Window,
      }));
    });

    expect(posted).toContainEqual(
      expect.objectContaining({ source: "atelier-host", type: "restore", state: { nu: 7 } }),
    );
  });

  it("ignore un message venu d'une autre fenêtre", async () => {
    clearWidgetStates();
    mockFetch(async () => new Response("<html>coquille</html>", { status: 200 }));
    render(<WidgetFrame event={EVENT} threadId="t1" />);

    await act(async () => {
      window.dispatchEvent(new MessageEvent("message", {
        data: { source: "atelier-widget", type: "state", state: { pirate: true } },
        source: window,
      }));
    });

    expect(recallWidgetState(EVENT.id)).toBeUndefined();
  });
});

describe("WidgetFrame — sendPrompt", () => {
  it("relaie un prompt du widget vers le composeur", async () => {
    mockFetch(async () => new Response("<html>coquille</html>", { status: 200 }));
    const recu: string[] = [];
    const ecoute = (e: Event) => recu.push((e as CustomEvent).detail.text);
    window.addEventListener("chat-compose-append", ecoute);

    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);
    await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy());
    const frame = container.querySelector("iframe") as HTMLIFrameElement;

    await act(async () => {
      window.dispatchEvent(new MessageEvent("message", {
        data: { source: "atelier-widget", type: "prompt", text: "refais avec ν = 8" },
        source: frame.contentWindow as Window,
      }));
    });

    window.removeEventListener("chat-compose-append", ecoute);
    expect(recu).toEqual(["refais avec ν = 8"]);
  });

  it("rejette un prompt hors gabarit au lieu de le tronquer", async () => {
    mockFetch(async () => new Response("<html>coquille</html>", { status: 200 }));
    const recu: string[] = [];
    const ecoute = (e: Event) => recu.push((e as CustomEvent).detail.text);
    window.addEventListener("chat-compose-append", ecoute);

    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);
    await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy());
    const frame = container.querySelector("iframe") as HTMLIFrameElement;

    await act(async () => {
      window.dispatchEvent(new MessageEvent("message", {
        data: { source: "atelier-widget", type: "prompt", text: "x".repeat(2001) },
        source: frame.contentWindow as Window,
      }));
    });

    window.removeEventListener("chat-compose-append", ecoute);
    expect(recu).toEqual([]);
  });
});

describe("WidgetFrame — actions de barre", () => {
  beforeEach(() => {
    resetSidecarInfo();
    setSidecarInfo({ port: 4123 });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("bascule vers la source lisible et revient au panneau", async () => {
    mockFetch(async () => new Response("<html>coquille lisible</html>", { status: 200 }));
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);
    await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: t("chat.widget-view-source") }));
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("pre code")?.textContent).toContain("coquille lisible");

    fireEvent.click(screen.getByRole("button", { name: t("chat.widget-view-panel") }));
    expect(container.querySelector("iframe")).toBeTruthy();
  });

  it("rend le focus à la timeline sur Échap (focus déjà sur la carte)", async () => {
    mockFetch(async () => new Response("<html>coquille</html>", { status: 200 }));
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);
    await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy());

    const card = container.querySelector(".widget-block") as HTMLElement;
    const frame = container.querySelector("iframe") as HTMLIFrameElement;
    frame.focus();
    fireEvent.keyDown(card, { key: "Escape" });

    expect(document.activeElement).not.toBe(frame);
  });

  it("rend le focus quand Échap est frappé DANS l'iframe", async () => {
    // Le scénario réel : un keydown produit dans une frame d'origine opaque
    // ne remonte PAS au document parent — le onKeyDown de la carte ne se
    // déclenchait que si le focus était déjà sur la carte. La coquille relaie
    // donc Échap par postMessage (relecture finale 2026-08-28, I7).
    mockFetch(async () => new Response("<html>coquille</html>", { status: 200 }));
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);
    await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy());

    const card = container.querySelector(".widget-block") as HTMLElement;
    const frame = container.querySelector("iframe") as HTMLIFrameElement;
    frame.focus();
    expect(document.activeElement).toBe(frame);

    await act(async () => {
      window.dispatchEvent(new MessageEvent("message", {
        data: { source: "atelier-widget", type: "escape" },
        source: frame.contentWindow as Window,
      }));
    });

    expect(document.activeElement).toBe(card);
  });

  it("ignore un « escape » venu d'une autre fenêtre", async () => {
    mockFetch(async () => new Response("<html>coquille</html>", { status: 200 }));
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);
    await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy());

    const frame = container.querySelector("iframe") as HTMLIFrameElement;
    frame.focus();
    await act(async () => {
      window.dispatchEvent(new MessageEvent("message", {
        data: { source: "atelier-widget", type: "escape" },
        source: window,
      }));
    });

    expect(document.activeElement).toBe(frame);
  });

  it("plein écran : une seule iframe montée, qui reçoit thème et état restaurés", async () => {
    clearWidgetStates();
    rememberWidgetState(EVENT.id, { nu: 7 });
    mockFetch(async () => new Response("<html>coquille</html>", { status: 200 }));
    const posted: unknown[] = [];

    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);
    await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t("chat.widget-expand") }));
    });

    // le Dialog se porte hors du container RTL (portail) : la recherche se
    // fait sur TOUT le document — c'est là qu'il faut n'en trouver qu'une.
    expect(document.querySelectorAll("iframe").length).toBe(1);
    const frame = document.querySelector("iframe") as HTMLIFrameElement;
    expect(frame.className).toContain("widget-fullscreen-frame");
    Object.defineProperty(frame, "contentWindow", {
      value: { postMessage: (m: unknown) => posted.push(m) },
    });

    await act(async () => {
      window.dispatchEvent(new MessageEvent("message", {
        data: { source: "atelier-widget", type: "ready" },
        source: frame.contentWindow as Window,
      }));
    });

    expect(document.querySelectorAll("iframe").length).toBe(1);
    expect(posted.some((m) => (m as { type?: unknown }).type === "theme")).toBe(true);
    expect(posted).toContainEqual(
      expect.objectContaining({ source: "atelier-host", type: "restore", state: { nu: 7 } }),
    );
  });

  it("réinitialise l'état gelé du widget depuis la barre du plein écran", async () => {
    // spec §F : « la réinitialisation de l'état vit dans la barre du plein
    // écran ». Elle doit oublier CE widget seulement, puis remonter l'iframe
    // pour repartir des valeurs par défaut.
    clearWidgetStates();
    rememberWidgetState(EVENT.id, { nu: 7 });
    rememberWidgetState("w_ffffffffffffffff", { autre: true });
    mockFetch(async () => new Response("<html>coquille</html>", { status: 200 }));

    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);
    await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t("chat.widget-expand") }));
    });
    const avant = document.querySelector("iframe");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t("chat.widget-reset") }));
    });

    expect(recallWidgetState(EVENT.id)).toBeUndefined();
    // l'oubli est CIBLÉ : les autres widgets gardent leur état
    expect(recallWidgetState("w_ffffffffffffffff")).toEqual({ autre: true });
    // et l'iframe est remontée : elle repart des valeurs par défaut
    expect(document.querySelector("iframe")).not.toBe(avant);
    expect(document.querySelectorAll("iframe").length).toBe(1);
  });

  it("offre « voir la source » en état muet, où lire le code compte le plus", async () => {
    vi.useFakeTimers();
    mockFetch(async () => new Response("<html>coquille muette</html>", { status: 200 }));
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);

    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(3100); });

    expect(screen.getByText(t("chat.widget-mute"))).toBeTruthy();
    const action = screen.getByRole("button", { name: t("chat.widget-view-source") });
    expect(action).not.toBeDisabled();

    act(() => { fireEvent.click(action); });
    expect(container.querySelector("pre code")?.textContent).toContain("coquille muette");
    vi.useRealTimers();
  });

  it("n'offre aucune action en état introuvable : il n'y a pas de coquille à lire", async () => {
    mockFetch(async () => new Response("nope", { status: 404 }));
    render(<WidgetFrame event={EVENT} threadId="t1" />);
    await waitFor(() => expect(screen.getByText(t("chat.widget-missing"))).toBeTruthy());
    expect(screen.queryByRole("button", { name: t("chat.widget-view-source") })).toBeNull();
  });

  it("désactive le bouton copier tant que la coquille n'est pas chargée", () => {
    pendingFetch();
    render(<WidgetFrame event={EVENT} threadId="t1" />);
    expect(screen.getByRole("button", { name: t("chat.output-copy") })).toBeDisabled();
  });
});

describe("WidgetFrame — adaptation et reprise", () => {
  beforeEach(() => {
    resetSidecarInfo();
    setSidecarInfo({ port: 4123 });
    clearWidgetStates();
    mockFetch(async () => new Response("<html>widget</html>"));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  function message(frame: HTMLIFrameElement, data: Record<string, unknown>) {
    act(() => window.dispatchEvent(new MessageEvent("message", {
      source: frame.contentWindow, data: { source: "atelier-widget", ...data },
    })));
  }

  it("réduit ou agrandit le panneau sans remonter l'iframe, avec un plafond", async () => {
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);
    await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy());
    const frame = container.querySelector("iframe")!;
    const body = container.querySelector(".widget-body") as HTMLElement;
    message(frame, { type: "resize", height: 180 });
    expect(body.style.height).toBe("180px");
    message(frame, { type: "resize", height: 560.2 });
    expect(body.style.height).toBe("561px");
    message(frame, { type: "resize", height: 2400 });
    expect(body.style.height).toBe("900px");
    message(frame, { type: "resize", height: 2 });
    expect(body.style.height).toBe("120px");
    for (const height of [NaN, Infinity, -10, "400", null]) message(frame, { type: "resize", height });
    expect(body.style.height).toBe("120px");
    expect(container.querySelector("iframe")).toBe(frame);
  });

  it("ignore les mesures et erreurs d'une autre fenêtre", async () => {
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);
    await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy());
    for (const type of ["resize", "error"]) act(() => window.dispatchEvent(new MessageEvent("message", {
      source: window, data: { source: "atelier-widget", type, height: 800 },
    })));
    expect((container.querySelector(".widget-body") as HTMLElement).style.height).toBe("420px");
    expect(screen.queryByText(t("chat.widget-error"))).toBeNull();
  });

  it("les mesures du plein écran ne changent pas la hauteur réservée dans le fil", async () => {
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);
    await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy());
    message(container.querySelector("iframe")!, { type: "resize", height: 220 });
    fireEvent.click(screen.getByRole("button", { name: t("chat.widget-expand") }));
    const expanded = document.querySelector("iframe")!;
    message(expanded, { type: "resize", height: 880 });
    expect((container.querySelector(".widget-body") as HTMLElement).style.height).toBe("220px");
    message(expanded, { type: "escape" });
    expect(container.querySelector("iframe")).toBeTruthy();
    expect((container.querySelector(".widget-body") as HTMLElement).style.height).toBe("220px");
  });

  it("annonce le chargement puis l'enlève quand le widget est prêt", async () => {
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);
    expect(screen.getByText(t("chat.widget-loading"))).toBeTruthy();
    await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy());
    message(container.querySelector("iframe")!, { type: "ready" });
    expect(screen.queryByText(t("chat.widget-loading"))).toBeNull();
  });

  it("une erreur suivie de ready reste en erreur ; Réessayer recharge et restaure l'état", async () => {
    rememberWidgetState(EVENT.id, { value: 7 });
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);
    await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy());
    const first = container.querySelector("iframe")!;
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { source: first.contentWindow, data: { source: "atelier-widget", type: "error" } }));
      window.dispatchEvent(new MessageEvent("message", { source: first.contentWindow, data: { source: "atelier-widget", type: "ready" } }));
    });
    expect(screen.getByRole("alert").textContent).toContain(t("chat.widget-error"));
    expect(container.querySelector("iframe")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: t("chat.widget-view-source") }));
    fireEvent.click(screen.getByRole("button", { name: t("chat.widget-view-panel") }));
    expect(screen.getByRole("alert").textContent).toContain(t("chat.widget-error"));
    fireEvent.click(screen.getByRole("button", { name: t("chat.widget-retry") }));
    await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy());
    const next = container.querySelector("iframe")!;
    expect(next).not.toBe(first);
    const post = vi.spyOn(next.contentWindow!, "postMessage");
    message(next, { type: "ready" });
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "restore", state: { value: 7 } }), "*");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("une panne réseau est réessayable et n'est pas présentée comme un widget supprimé", async () => {
    mockFetch(async () => { throw new Error("network"); });
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);
    await waitFor(() => expect(screen.getByText(t("chat.widget-unavailable"))).toBeTruthy());
    expect(screen.queryByText(t("chat.widget-missing"))).toBeNull();
    mockFetch(async () => new Response("<html>recovered</html>"));
    fireEvent.click(screen.getByRole("button", { name: t("chat.widget-retry") }));
    await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy());
  });

  it("une requête bloquée expire et sa réponse tardive ne réactive pas le panneau", async () => {
    vi.useFakeTimers();
    let resolve!: (r: Response) => void;
    mockFetch(() => new Promise<Response>((r) => { resolve = r; }));
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);
    await act(async () => { vi.advanceTimersByTime(10001); });
    expect(screen.getByText(t("chat.widget-unavailable"))).toBeTruthy();
    await act(async () => { resolve(new Response("late")); });
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("transmet la taille de lecture et ses changements sans remonter le widget", async () => {
    document.documentElement.style.setProperty("--chat-fs", "17px");
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);
    await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy());
    const frame = container.querySelector("iframe")!;
    const post = vi.spyOn(frame.contentWindow!, "postMessage");
    message(frame, { type: "ready" });
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "theme", tokens: expect.objectContaining({ "--widget-font-size": "17px" }) }), "*");
    document.documentElement.style.setProperty("--chat-fs", "19px");
    act(() => window.dispatchEvent(new CustomEvent("app-theme-changed")));
    expect(post).toHaveBeenLastCalledWith(expect.objectContaining({ type: "theme", tokens: expect.objectContaining({ "--widget-font-size": "19px" }) }), "*");
    expect(container.querySelector("iframe")).toBe(frame);
    document.documentElement.style.removeProperty("--chat-fs");
  });
});
