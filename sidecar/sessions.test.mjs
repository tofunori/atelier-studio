import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findGrokSessionFile, grokHistory } from "./sessions.mjs";

describe("findGrokSessionFile", () => {
  it("trouve chat_history.jsonl sous n'importe quel sous-dossier de baseDir", () => {
    const base = mkdtempSync(join(tmpdir(), "grok-sessions-"));
    const sessionDir = join(base, "%2FUsers%2Ftofunori%2Fancien-projet", "sid-1");
    mkdirSync(sessionDir, { recursive: true });
    const file = join(sessionDir, "chat_history.jsonl");
    writeFileSync(file, "");
    expect(findGrokSessionFile("sid-1", base)).toBe(file);
  });

  it("retourne null si la session n'existe nulle part", () => {
    const base = mkdtempSync(join(tmpdir(), "grok-sessions-"));
    mkdirSync(join(base, "%2FUsers%2Ftofunori%2Fautre"), { recursive: true });
    expect(findGrokSessionFile("inconnu", base)).toBeNull();
  });

  it("retourne null si baseDir n'existe pas", () => {
    expect(findGrokSessionFile("sid", "/chemin/inexistant-xyz")).toBeNull();
  });
});

describe("grokHistory — repli global par id (thread déplacé vers un autre projet)", () => {
  it("retombe sur la recherche globale si la session est introuvable sous le projectRoot donné", async () => {
    const base = mkdtempSync(join(tmpdir(), "grok-sessions-"));
    const oldDir = join(base, encodeURIComponent("/Users/tofunori/ancien-projet"), "sid-42");
    mkdirSync(oldDir, { recursive: true });
    writeFileSync(
      join(oldDir, "chat_history.jsonl"),
      [
        JSON.stringify({ type: "user", content: "<user_query>bonjour</user_query>" }),
        JSON.stringify({ type: "assistant", content: "salut !" }),
      ].join("\n") + "\n",
    );
    const events = await grokHistory("sid-42", "/Users/tofunori/nouveau-projet", { baseDir: base });
    expect(events).toEqual([
      { kind: "user", text: "bonjour" },
      { kind: "text", text: "salut !" },
    ]);
  });

  it("retourne [] si la session est introuvable même après le repli", async () => {
    const base = mkdtempSync(join(tmpdir(), "grok-sessions-"));
    const events = await grokHistory("inconnu", "/Users/tofunori/nouveau-projet", { baseDir: base });
    expect(events).toEqual([]);
  });

  it("ne réaffiche jamais l'instruction interne de galerie persistée par Grok", async () => {
    const base = mkdtempSync(join(tmpdir(), "grok-sessions-"));
    const sessionDir = join(base, encodeURIComponent("/projet"), "sid-gallery");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(
      join(sessionDir, "chat_history.jsonl"),
      JSON.stringify({
        type: "user",
        content: "<user_query>question visible\n\n<atelier-gallery-integration>secret</atelier-gallery-integration></user_query>",
      }) + "\n",
    );

    await expect(grokHistory("sid-gallery", "/projet", { baseDir: base })).resolves.toEqual([
      { kind: "user", text: "question visible" },
    ]);
  });
});
