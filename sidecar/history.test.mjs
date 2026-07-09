import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const getSessionMessagesMock = vi.fn();
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  getSessionMessages: (...args) => getSessionMessagesMock(...args),
}));

import { eventsFromSessionMessages, claudeHistory, findClaudeSessionDir } from "./history.mjs";

const user = (content) => ({ type: "user", message: { content } });
const assistant = (content) => ({ type: "assistant", message: { content } });

describe("eventsFromSessionMessages", () => {
  it("conserve un message user commençant par « < » (HTML/XML légitime)", () => {
    const events = eventsFromSessionMessages([user("<div>hello</div>")]);
    expect(events).toEqual([{ kind: "user", text: "<div>hello</div>" }]);
  });

  it("filtre les injections systèmes connues (system-reminder, command-name)", () => {
    const events = eventsFromSessionMessages([
      user("<system-reminder>ne fais pas ça</system-reminder>"),
      user("<command-name>/foo</command-name> args"),
    ]);
    expect(events).toEqual([]);
  });

  it("conserve un message user normal", () => {
    const events = eventsFromSessionMessages([user("bonjour")]);
    expect(events).toEqual([{ kind: "user", text: "bonjour" }]);
  });

  it("ignore un message user ne contenant que des tool_result", () => {
    const events = eventsFromSessionMessages([
      user([{ type: "tool_result", tool_use_id: "x", content: "résultat" }]),
    ]);
    expect(events).toEqual([]);
  });

  it("restitue le détail d'un tool_use Bash", () => {
    const events = eventsFromSessionMessages([
      assistant([{ type: "tool_use", name: "Bash", input: { command: "git status" } }]),
    ]);
    expect(events).toEqual([{ kind: "tool", name: "Bash", detail: "git status" }]);
  });

  it("émet un event texte pour un bloc texte assistant", () => {
    const events = eventsFromSessionMessages([
      assistant([{ type: "text", text: "Voici la réponse." }]),
    ]);
    expect(events).toEqual([{ kind: "text", text: "Voici la réponse." }]);
  });

  it("garde le texte user d'un array mixte (texte + tool_result)", () => {
    const events = eventsFromSessionMessages([
      user([
        { type: "text", text: "regarde ceci" },
        { type: "tool_result", tool_use_id: "x", content: "sortie" },
      ]),
    ]);
    expect(events).toEqual([{ kind: "user", text: "regarde ceci" }]);
  });
});

describe("findClaudeSessionDir", () => {
  it("trouve le dossier contenant <sessionId>.jsonl parmi les sous-dossiers de baseDir", () => {
    const base = mkdtempSync(join(tmpdir(), "claude-projects-"));
    const projectDir = join(base, "-Users-tofunori-ancien-projet");
    mkdirSync(projectDir);
    writeFileSync(join(projectDir, "abc-123.jsonl"), "");
    expect(findClaudeSessionDir("abc-123", base)).toBe(projectDir);
  });

  it("retourne null si aucun dossier ne contient la session", () => {
    const base = mkdtempSync(join(tmpdir(), "claude-projects-"));
    mkdirSync(join(base, "-Users-tofunori-autre"));
    expect(findClaudeSessionDir("inconnu", base)).toBeNull();
  });

  it("retourne null si baseDir n'existe pas", () => {
    expect(findClaudeSessionDir("abc", "/chemin/inexistant-xyz")).toBeNull();
  });
});

describe("claudeHistory — repli global par id (thread déplacé vers un autre projet)", () => {
  beforeEach(() => getSessionMessagesMock.mockReset());

  it("retombe sur une recherche globale (sans dir) si introuvable sous le cwd donné", async () => {
    const base = mkdtempSync(join(tmpdir(), "claude-projects-"));
    const projectDir = join(base, "-Users-tofunori-ancien-projet");
    mkdirSync(projectDir);
    writeFileSync(join(projectDir, "s-1.jsonl"), "");
    getSessionMessagesMock.mockImplementation((sessionId, opts) => {
      if (opts?.dir) return Promise.resolve([]); // introuvable sous le nouveau cwd
      return Promise.resolve([user("bonjour")]);
    });
    const events = await claudeHistory("s-1", "/Users/tofunori/nouveau-projet", { baseDir: base });
    expect(events).toEqual([{ kind: "user", text: "bonjour" }]);
    expect(getSessionMessagesMock).toHaveBeenCalledTimes(2);
    expect(getSessionMessagesMock).toHaveBeenNthCalledWith(1, "s-1", { dir: "/Users/tofunori/nouveau-projet" });
    expect(getSessionMessagesMock).toHaveBeenNthCalledWith(2, "s-1");
  });

  it("chemin direct trouvé : pas de repli (chemin nominal jamais ralenti)", async () => {
    getSessionMessagesMock.mockResolvedValue([user("salut")]);
    const events = await claudeHistory("s-2", "/Users/tofunori/projet");
    expect(events).toEqual([{ kind: "user", text: "salut" }]);
    expect(getSessionMessagesMock).toHaveBeenCalledTimes(1);
  });

  it("aucune trace nulle part : pas de repli, liste vide", async () => {
    const base = mkdtempSync(join(tmpdir(), "claude-projects-"));
    getSessionMessagesMock.mockResolvedValue([]);
    const events = await claudeHistory("s-3", "/Users/tofunori/projet", { baseDir: base });
    expect(events).toEqual([]);
    expect(getSessionMessagesMock).toHaveBeenCalledTimes(1);
  });

  it("sans cwd : appel direct sans dir, pas de repli possible", async () => {
    getSessionMessagesMock.mockResolvedValue([]);
    const events = await claudeHistory("s-4", null);
    expect(events).toEqual([]);
    expect(getSessionMessagesMock).toHaveBeenCalledTimes(1);
    expect(getSessionMessagesMock).toHaveBeenCalledWith("s-4", undefined);
  });
});
