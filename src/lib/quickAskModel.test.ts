import { describe, expect, it } from "vitest";
import { chatSelection, qaPromotePayload, threadModelKey } from "./quickAskModel";

describe("threadModelKey", () => {
  it("vise la clé que le chat écrit pour un fil", () => {
    expect(threadModelKey("abc")).toBe("atelier-studio.modelSel.thread:abc");
  });

  it("ne vise rien sans fil actif", () => {
    expect(threadModelKey(null)).toBeNull();
  });
});

describe("chatSelection", () => {
  it("lit le provider, le modèle et l'effort du fil actif", () => {
    const raw = JSON.stringify({
      activeProvider: "opencode",
      byProvider: {
        opencode: { model: "glm-5.3-flash", effort: "medium", permissionMode: "ask", fastMode: false },
        grok: { model: "grok-4.6", effort: "high", permissionMode: "ask", fastMode: false },
      },
    });
    expect(chatSelection(raw)).toEqual({ provider: "opencode", model: "glm-5.3-flash", effort: "medium" });
  });

  it("comprend l'ancien objet plat", () => {
    const raw = JSON.stringify({ provider: "claude", model: "claude-opus-5", effort: "high" });
    expect(chatSelection(raw)).toEqual({ provider: "claude", model: "claude-opus-5", effort: "high" });
  });

  it("tolère un effort absent", () => {
    const raw = JSON.stringify({ activeProvider: "kimi", byProvider: { kimi: { model: "k2" } } });
    expect(chatSelection(raw)).toEqual({ provider: "kimi", model: "k2", effort: "" });
  });

  it("renvoie null quand le fil n'a rien enregistré", () => {
    expect(chatSelection(null)).toBeNull();
  });

  it("renvoie null sur du JSON illisible", () => {
    expect(chatSelection("{pas du json")).toBeNull();
  });

  it("renvoie null quand le provider actif n'a pas d'entrée", () => {
    const raw = JSON.stringify({ activeProvider: "grok", byProvider: { claude: { model: "x" } } });
    expect(chatSelection(raw)).toBeNull();
  });

  it("renvoie null quand le modèle est vide — rien à suivre", () => {
    const raw = JSON.stringify({ activeProvider: "grok", byProvider: { grok: { model: "" } } });
    expect(chatSelection(raw)).toBeNull();
  });
});

describe("qaPromotePayload", () => {
  it("rattache le fil promu au projet ouvert", () => {
    expect(
      qaPromotePayload({ qaId: "qa-1", newThreadId: "t-1", title: "va veut dire quoi", activeProject: "/proj/a" }),
    ).toEqual({
      type: "qaPromote",
      qaId: "qa-1",
      newThreadId: "t-1",
      title: "va veut dire quoi",
      projectRoot: "/proj/a",
    });
  });

  it("hors projet, la racine reste vide", () => {
    expect(
      qaPromotePayload({ qaId: "qa-1", newThreadId: "t-1", title: "x", activeProject: null }).projectRoot,
    ).toBe("");
  });
});
