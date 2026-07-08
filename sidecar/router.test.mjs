import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock du provider d'images : pas d'appel réseau réel dans les tests du routeur.
vi.mock("./providers/images.mjs", () => ({
  generateImage: async () => ({
    b64: Buffer.from("fake-png-bytes").toString("base64"),
    size: "1024x1024",
    model: "seedream-test",
    usage: { generated_images: 1 },
  }),
  resolveArkApiKey: () => "sk-test",
  resolveArkModel: () => "seedream-test",
}));

import { route } from "./router.mjs";

describe("route", () => {
  it("répond pong au ping", async () => {
    const sent = [];
    await route({ type: "ping" }, { send: (m) => sent.push(m) });
    expect(sent).toEqual([{ type: "pong" }]);
  });
  it("signale un type inconnu", async () => {
    const sent = [];
    await route({ type: "nope" }, { send: (m) => sent.push(m) });
    expect(sent[0].type).toBe("error");
  });
  it("répond zotero-introuvable quand la base Zotero manque", async () => {
    const sent = [];
    await route(
      { type: "zoteroSearch", query: "albedo" },
      { send: (m) => sent.push(m), zotero: { available: () => false } },
    );
    expect(sent[0]).toEqual({ type: "zoteroItems", items: [], error: "zotero-introuvable" });
  });
  it("ajoute citeKey et fav aux résultats Zotero", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-zotero-"));
    const favsPath = join(dir, "zotero-favs.json");
    const sent = [];
    const item = {
      key: "ABC12345",
      title: "Smoke deposition",
      creators: "Smith",
      year: "2024",
      publication: "",
      tags: [],
      hasPdf: true,
      pdfKey: "PDF12345",
      pdfFile: "paper.pdf",
    };
    await route({ type: "zoteroFav", key: item.key, on: true }, {
      send: (m) => sent.push(m),
      zoteroFavsPath: favsPath,
    });
    await route({ type: "zoteroSearch", query: "smoke" }, {
      send: (m) => sent.push(m),
      zoteroFavsPath: favsPath,
      zotero: {
        available: () => true,
        search: () => [item],
        citeKey: () => "smith2024",
      },
    });
    expect(JSON.parse(readFileSync(favsPath, "utf8"))).toEqual([item.key]);
    expect(sent.at(-1)).toMatchObject({
      type: "zoteroItems",
      items: [{ key: item.key, citeKey: "smith2024", fav: true }],
    });
  });
  it("retitre les conversations aux titres bruts ou dupliqués", async () => {
    const threads = new Map([
      ["a", {
        id: "a",
        title: "/Users/tofunori/projet",
        provider: "claude",
        projectRoot: "/Users/tofunori/projet",
        sessionId: "s-a",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }],
      ["b", {
        id: "b",
        title: "allo",
        provider: "codex",
        projectRoot: "",
        sessionId: "s-b",
        updatedAt: "2026-01-02T00:00:00.000Z",
      }],
      ["c", {
        id: "c",
        title: "allo",
        provider: "claude",
        projectRoot: "",
        sessionId: "s-c",
        updatedAt: "2026-01-03T00:00:00.000Z",
      }],
      ["d", {
        id: "d",
        title: "Titre propre",
        provider: "claude",
        projectRoot: "",
        sessionId: "s-d",
        updatedAt: "2026-01-04T00:00:00.000Z",
      }],
    ]);
    const emitted = [];
    const ctx = {
      send: (m) => emitted.push(m),
      broadcast: (m) => emitted.push(m),
      store: {
        list: () => [...threads.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        get: (id) => threads.get(id),
        upsert: (patch) => threads.set(patch.id, { ...threads.get(patch.id), ...patch }),
      },
      providers: {
        claude: {
          titleConversation: async (text) => `Titre ${text.slice(0, 5)}`,
        },
      },
      history: {
        claudeHistory: async (sessionId) => [{ kind: "user", text: `claude ${sessionId}` }],
      },
      sessions: {
        codexHistory: async (sessionId) => [{ kind: "user", text: `codex ${sessionId}` }],
      },
    };

    await route({ type: "retitleAll" }, ctx);

    expect(threads.get("a").title).toBe("Titre claud");
    expect(threads.get("b").title).toBe("Titre codex");
    expect(threads.get("c").title).toBe("Titre claud");
    expect(threads.get("d").title).toBe("Titre propre");
    expect(emitted.filter((m) => m.type === "threads")).toHaveLength(3);
    expect(emitted.at(-1)).toMatchObject({ type: "retitleAllDone", scanned: 3, renamed: 3 });
  });
});

describe("quickAsk", () => {
  // laisse se dérouler les microtâches du .then/.catch de p.run(...)
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("isole chaque qaId dans sa propre session (jamais threadId null)", async () => {
    const calls = [];
    const ctx = {
      send: () => {},
      providers: {
        claude: {
          run: (opts) => {
            calls.push(opts);
            return Promise.resolve({ sessionId: "s-" + opts.threadId });
          },
          endSession: () => {},
        },
      },
    };
    await route({ type: "quickAsk", qaId: "a", prompt: "salut" }, ctx);
    await route({ type: "quickAsk", qaId: "b", prompt: "coucou" }, ctx);
    await flush();
    expect(calls.map((c) => c.threadId)).toEqual(["qa:a", "qa:b"]);
    expect(calls.some((c) => c.threadId === null)).toBe(false);
  });

  it("ferme la session (endSession) après le tour, keyée par qaId", async () => {
    const ended = [];
    const ctx = {
      send: () => {},
      providers: {
        claude: {
          run: () => Promise.resolve({ sessionId: "1234-abcd" }),
          endSession: (tid) => ended.push(tid),
        },
      },
    };
    await route({ type: "quickAsk", qaId: "a", prompt: "salut" }, ctx);
    await flush();
    expect(ended).toContain("qa:a");
  });

  it("passe permissionMode bypassPermissions au provider", async () => {
    let captured;
    const ctx = {
      send: () => {},
      providers: {
        claude: {
          run: (opts) => {
            captured = opts;
            return Promise.resolve({ sessionId: "x" });
          },
          endSession: () => {},
        },
      },
    };
    await route({ type: "quickAsk", qaId: "a", prompt: "salut" }, ctx);
    await flush();
    expect(captured.permissionMode).toBe("bypassPermissions");
  });

  it("generateImage répond via broadcast (survit à la socket fermée), pas via send", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-gen-"));
    const sent = [];
    const emitted = [];
    await route(
      { type: "generateImage", prompt: "un glacier", size: "1K", projectRoot: dir },
      { send: (m) => sent.push(m), broadcast: (m) => emitted.push(m) },
    );
    // La réponse DOIT passer par broadcast : une génération de ~140 s survit
    // souvent à la socket qui l'a demandée. ctx.send la perdrait silencieusement.
    const onBroadcast = emitted.find((m) => m.type === "imageGenerated");
    expect(onBroadcast).toBeTruthy();
    expect(onBroadcast.error).toBeUndefined();
    expect(onBroadcast.path).toContain("generated");
    expect(onBroadcast.projectRoot).toBe(dir);
    expect(sent.find((m) => m.type === "imageGenerated")).toBeUndefined();
    // fichier PNG + provenance JSON réellement écrits
    expect(readFileSync(onBroadcast.metaPath, "utf8")).toContain("un glacier");
  });
});
