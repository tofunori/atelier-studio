import { afterEach, describe, expect, it, vi } from "vitest";
import { relaySidecarMessage } from "./sidecarRelays";

function capture(event: string) {
  const seen: CustomEvent[] = [];
  const onEvent = (e: Event) => seen.push(e as CustomEvent);
  window.addEventListener(event, onEvent);
  return { seen, stop: () => window.removeEventListener(event, onEvent) };
}

describe("relaySidecarMessage", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("relaie un type connu avec le message entier en détail", () => {
    const { seen, stop } = capture("git-status");
    const msg = { type: "gitStatus", files: [] };
    expect(relaySidecarMessage(msg)).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0].detail).toBe(msg);
    stop();
  });

  it("regroupe les fins d'opérations git sous git-changed", () => {
    const { seen, stop } = capture("git-changed");
    for (const type of ["gitChanged", "gitStageDone", "gitUnstageDone", "gitRevertFileDone", "gitCommitDone", "gitUndoLastTurnDone"]) {
      relaySidecarMessage({ type });
    }
    expect(seen).toHaveLength(6);
    stop();
  });

  it("façonne le détail quand la surface attend une autre forme", () => {
    const kb = capture("kb-source-added");
    relaySidecarMessage({ type: "kbError", message: "refus" });
    expect(kb.seen[0].detail).toEqual({ ok: false, message: "refus" });
    kb.stop();

    const term = capture("term-data:7");
    relaySidecarMessage({ type: "termData", termId: 7, data: "ls\n" });
    expect(term.seen[0].detail).toBe("ls\n");
    term.stop();

    const exit = capture("term-exit:7");
    relaySidecarMessage({ type: "termExit", termId: 7 });
    expect(exit.seen[0].detail).toBeNull();
    exit.stop();

    const brain = capture("kb-gbrain-results");
    relaySidecarMessage({ type: "gbrainResults", query: "albédo" });
    expect(brain.seen[0].detail).toEqual({ query: "albédo", results: [], error: null });
    brain.stop();
  });

  it("consomme galleryCommand même sans commande, sans rien émettre", () => {
    const { seen, stop } = capture("atelier-gallery-command");
    expect(relaySidecarMessage({ type: "galleryCommand" })).toBe(true);
    expect(seen).toHaveLength(0);
    relaySidecarMessage({ type: "galleryCommand", command: { action: "open" } });
    expect(seen[0].detail).toEqual({ action: "open" });
    stop();
  });

  it("laisse passer les types que l'App traite elle-même", () => {
    const spy = vi.spyOn(window, "dispatchEvent");
    for (const type of ["event", "history", "threads", "error", "zoteroItems", "usage", "toString", "constructor"]) {
      expect(relaySidecarMessage({ type })).toBe(false);
    }
    expect(spy).not.toHaveBeenCalled();
  });
});
