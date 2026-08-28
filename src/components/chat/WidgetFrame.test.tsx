import { render, screen, cleanup, act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WidgetFrame } from "./WidgetFrame";
import type { AgentEvent } from "../../lib/ws";
import { t } from "../../lib/i18n";
import { resetSidecarInfo, setSidecarInfo } from "../../lib/sidecarInfo";
import { rememberWidgetState, clearWidgetStates } from "./widgetState";

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
