import { afterEach, describe, expect, it, vi } from "vitest";
import { createGalleryCommandBridge } from "./galleryCommandBridge";

const PROJECT = "/Users/test/thesis";
const NONCE = "nonce-123";

function setup(overrides: Partial<Parameters<typeof createGalleryCommandBridge>[0]> = {}) {
  let currentProject = PROJECT;
  const postMessage = vi.fn();
  const frame = {
    src: "http://127.0.0.1:18790/?embedded=atelier#atelier_nonce=nonce-123",
    contentWindow: { postMessage },
  };
  const onValidated = vi.fn();
  const onEmpty = vi.fn();
  const bridge = createGalleryCommandBridge({
    nonce: NONCE,
    timeoutMs: 2_000,
    getCurrentProjectRoot: () => currentProject,
    getGalleryFrame: () => frame,
    onValidated,
    onEmpty,
    ...overrides,
  });
  return {
    bridge,
    frame,
    postMessage,
    onValidated,
    onEmpty,
    setCurrentProject: (project: string) => { currentProject = project; },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("galleryCommandBridge", () => {
  it("envoie show une seule fois vers l'origine exacte de l'iframe", async () => {
    const { bridge, postMessage, onValidated } = setup();
    const request = {
      action: "show" as const,
      mode: "focus" as const,
      projectRoot: PROJECT,
      requestId: "req-1",
      rels: ["figures/a.png", "figures/b.svg"],
    };

    const first = bridge.send(request);
    const duplicate = bridge.send(request);

    expect(duplicate).toBe(first);
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: "atelier-gallery-command",
        nonce: NONCE,
        ...request,
      },
      "http://127.0.0.1:18790",
    );
    expect(onValidated).toHaveBeenCalledTimes(1);

    expect(bridge.acceptResult({
      type: "atelier-gallery-result",
      nonce: NONCE,
      ok: true,
      action: "show",
      projectRoot: PROJECT,
      requestId: "req-1",
      matched: ["figures/a.png"],
      missing: ["figures/b.svg"],
    })).toBe(true);
    await expect(first).resolves.toMatchObject({ matched: ["figures/a.png"], missing: ["figures/b.svg"] });
    expect(bridge.pendingCount()).toBe(0);
  });

  it("rejette une iframe absente ou une origine qui n'est pas loopback Atelier", async () => {
    const noFrame = setup({ getGalleryFrame: () => null }).bridge;
    await expect(noFrame.send({
      action: "show", mode: "focus", projectRoot: PROJECT, requestId: "req-no-frame", rels: ["a.png"],
    })).rejects.toMatchObject({ code: "gallery-frame-unavailable" });

    const external = setup({
      getGalleryFrame: () => ({ src: "https://evil.example/gallery", contentWindow: { postMessage: vi.fn() } }),
    }).bridge;
    await expect(external.send({
      action: "show", mode: "focus", projectRoot: PROJECT, requestId: "req-external", rels: ["a.png"],
    })).rejects.toMatchObject({ code: "gallery-origin-invalid" });
  });

  it("expire une requête sans résultat", async () => {
    vi.useFakeTimers();
    const { bridge } = setup({ timeoutMs: 50 });
    const pending = bridge.send({
      action: "show", mode: "focus", projectRoot: PROJECT, requestId: "req-timeout", rels: ["a.png"],
    });
    const assertion = expect(pending).rejects.toMatchObject({ code: "gallery-timeout" });
    await vi.advanceTimersByTimeAsync(51);
    await assertion;
    expect(bridge.pendingCount()).toBe(0);
  });

  it("annule les attentes au changement de projet et ignore leur résultat tardif", async () => {
    const { bridge, setCurrentProject } = setup();
    const pending = bridge.send({
      action: "show", mode: "focus", projectRoot: PROJECT, requestId: "req-stale", rels: ["a.png"],
    });
    const assertion = expect(pending).rejects.toMatchObject({ code: "project-changed" });
    setCurrentProject("/Users/test/other");
    bridge.reset("project-changed");
    await assertion;
    expect(bridge.acceptResult({
      type: "atelier-gallery-result",
      nonce: NONCE,
      ok: true,
      action: "show",
      projectRoot: PROJECT,
      requestId: "req-stale",
      matched: ["a.png"],
      missing: [],
    })).toBe(false);
  });

  it("signale sans erreur un résultat valide sans correspondance", async () => {
    const { bridge, onEmpty } = setup();
    const pending = bridge.send({
      action: "show", mode: "focus", projectRoot: PROJECT, requestId: "req-empty", rels: ["missing.png"],
    });
    bridge.acceptResult({
      type: "atelier-gallery-result",
      nonce: NONCE,
      ok: true,
      action: "show",
      projectRoot: PROJECT,
      requestId: "req-empty",
      matched: [],
      missing: ["missing.png"],
    });
    await expect(pending).resolves.toMatchObject({ matched: [], missing: ["missing.png"] });
    expect(onEmpty).toHaveBeenCalledTimes(1);
  });

  it("envoie open, compare et reset avec leurs formes strictes", async () => {
    const { bridge, postMessage } = setup();
    const requests = [
      { action: "open" as const, mode: "viewer" as const, projectRoot: PROJECT, requestId: "req-open", rels: ["a.png"] },
      { action: "compare" as const, mode: "selection" as const, projectRoot: PROJECT, requestId: "req-compare", rels: ["a.png", "b.png"] },
      { action: "reset" as const, mode: "all" as const, projectRoot: PROJECT, requestId: "req-reset", rels: [] },
    ];
    const promises = requests.map((request) => bridge.send(request));
    for (const request of requests) {
      expect(bridge.acceptResult({
        type: "atelier-gallery-result", nonce: NONCE, ok: true, action: request.action,
        projectRoot: PROJECT, requestId: request.requestId,
        matched: request.rels, missing: [], applied: true,
      })).toBe(true);
    }
    await expect(Promise.all(promises)).resolves.toHaveLength(3);
    expect(postMessage).toHaveBeenCalledTimes(3);
  });

  it("refuse les combinaisons action, mode et cardinalité invalides", async () => {
    const { bridge } = setup();
    await expect(bridge.send({
      action: "open", mode: "viewer", projectRoot: PROJECT, requestId: "bad-open", rels: ["a.png", "b.png"],
    })).rejects.toMatchObject({ code: "gallery-command-invalid" });
    await expect(bridge.send({
      action: "reset", mode: "all", projectRoot: PROJECT, requestId: "bad-reset", rels: ["a.png"],
    })).rejects.toMatchObject({ code: "gallery-command-invalid" });
  });

  it("ignore un résultat dont l'action ne correspond pas à la requête", async () => {
    const { bridge } = setup();
    const pending = bridge.send({
      action: "open", mode: "viewer", projectRoot: PROJECT, requestId: "req-action", rels: ["a.png"],
    });
    expect(bridge.acceptResult({
      type: "atelier-gallery-result", nonce: NONCE, ok: true, action: "show",
      projectRoot: PROJECT, requestId: "req-action", matched: ["a.png"], missing: [], applied: true,
    })).toBe(false);
    bridge.reset();
    await expect(pending).rejects.toMatchObject({ code: "gallery-bridge-reset" });
  });
});
