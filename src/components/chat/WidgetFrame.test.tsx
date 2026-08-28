import { render, screen, cleanup, act, waitFor } from "@testing-library/react";
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

  it("monte une iframe srcdoc verrouillée quand la coquille arrive", async () => {
    mockFetch(async () => new Response("<html>coquille</html>", { status: 200 }));
    const { container } = render(<WidgetFrame event={EVENT} threadId="t1" />);

    await waitFor(() => {
      expect(container.querySelector("iframe")).toBeTruthy();
    });
    const frame = container.querySelector("iframe") as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("srcdoc")).toContain("coquille");
    expect(frame.getAttribute("src")).toBeNull();
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
