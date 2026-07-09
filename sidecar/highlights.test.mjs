import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HighlightStore } from "./highlights.mjs";
import { route } from "./router.mjs";
import { buildHighlightContext } from "../src/lib/highlightContext.ts";

function tmpFile() {
  return join(mkdtempSync(join(tmpdir(), "as-hl-")), "highlights.json");
}

describe("HighlightStore", () => {
  it("ajoute une fiche : id/createdAt générés par le store (source de vérité)", () => {
    const s = new HighlightStore(tmpFile());
    const h = s.add({ text: "passage surligné", kind: "hl", projectRoot: "/p", threadId: "t1" });
    expect(h.id).toBeTruthy();
    expect(h.createdAt).toBeTruthy();
    expect(s.list()).toHaveLength(1);
  });
  it("génère des ids uniques pour deux ajouts successifs", () => {
    const s = new HighlightStore(tmpFile());
    const a = s.add({ text: "x", kind: "hl" });
    const b = s.add({ text: "y", kind: "hl" });
    expect(a.id).not.toBe(b.id);
  });
  it("trie les fiches du plus récent au plus ancien", () => {
    const file = tmpFile();
    writeFileSync(file, JSON.stringify([
      { id: "a", text: "premier", kind: "hl", createdAt: "2020-01-01T00:00:00.000Z" },
      { id: "b", text: "second", kind: "hl", createdAt: "2024-01-01T00:00:00.000Z" },
    ]));
    const s = new HighlightStore(file);
    expect(s.list().map((x) => x.text)).toEqual(["second", "premier"]);
  });
  it("persiste sur disque via writeFileAtomic et relit après réinstanciation", () => {
    const file = tmpFile();
    const s1 = new HighlightStore(file);
    s1.add({ text: "durable", kind: "ul", projectRoot: "/proj", context: "…autour…" });
    const s2 = new HighlightStore(file);
    expect(s2.list()).toHaveLength(1);
    expect(s2.list()[0]).toMatchObject({ text: "durable", kind: "ul", projectRoot: "/proj", context: "…autour…" });
  });
  it("remove retire la fiche et persiste l'absence", () => {
    const file = tmpFile();
    const s1 = new HighlightStore(file);
    const h = s1.add({ text: "à retirer", kind: "hl" });
    expect(s1.remove(h.id)).toBe(true);
    expect(s1.list()).toHaveLength(0);
    const s2 = new HighlightStore(file);
    expect(s2.list()).toHaveLength(0);
  });
  it("remove d'un id inconnu renvoie false sans écrire", () => {
    const s = new HighlightStore(tmpFile());
    expect(s.remove("inconnu")).toBe(false);
  });
  it("rejette un texte vide ou blanc", () => {
    const s = new HighlightStore(tmpFile());
    expect(() => s.add({ text: "   ", kind: "hl" })).toThrow();
  });
  it("normalise un kind invalide en hl", () => {
    const s = new HighlightStore(tmpFile());
    const h = s.add({ text: "x", kind: "autre" });
    expect(h.kind).toBe("hl");
  });
});

describe("route — cases highlights", () => {
  it("addHighlight ajoute et diffuse la liste complète à tous les clients", async () => {
    const store = new HighlightStore(tmpFile());
    const sent = [];
    await route(
      { type: "addHighlight", highlight: { text: "abc", kind: "hl", threadId: "t1", projectRoot: "/p" } },
      { send: (m) => sent.push(m), broadcast: (m) => sent.push(m), highlights: store },
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].type).toBe("highlights");
    expect(sent[0].highlights).toHaveLength(1);
    expect(sent[0].highlights[0]).toMatchObject({ text: "abc", kind: "hl", threadId: "t1" });
  });
  it("addHighlight invalide répond une erreur sans planter le routeur", async () => {
    const store = new HighlightStore(tmpFile());
    const sent = [];
    await route(
      { type: "addHighlight", highlight: { text: "" } },
      { send: (m) => sent.push(m), highlights: store },
    );
    expect(sent[0].type).toBe("error");
    expect(store.list()).toHaveLength(0);
  });
  it("removeHighlight retire une fiche et diffuse la liste mise à jour", async () => {
    const store = new HighlightStore(tmpFile());
    const h = store.add({ text: "à virer", kind: "ul" });
    const sent = [];
    await route(
      { type: "removeHighlight", id: h.id },
      { send: (m) => sent.push(m), broadcast: (m) => sent.push(m), highlights: store },
    );
    expect(sent.at(-1)).toEqual({ type: "highlights", highlights: [] });
  });
  it("listHighlights répond avec la liste courante (sans broadcast)", async () => {
    const store = new HighlightStore(tmpFile());
    store.add({ text: "un", kind: "hl" });
    const sent = [];
    await route({ type: "listHighlights" }, { send: (m) => sent.push(m), highlights: store });
    expect(sent).toHaveLength(1);
    expect(sent[0].type).toBe("highlights");
    expect(sent[0].highlights).toHaveLength(1);
  });
});

describe("buildHighlightContext", () => {
  it("renvoie vide si la sélection est introuvable dans le message", () => {
    expect(buildHighlightContext("un message quelconque", "absent")).toBe("");
  });
  it("renvoie vide si le message ou la sélection est vide", () => {
    expect(buildHighlightContext("", "x")).toBe("");
    expect(buildHighlightContext("x", "")).toBe("");
  });
  it("renvoie le message entier (trimmé, sans ellipses) s'il tient déjà dans la cible", () => {
    const msg = "Un court message avec un passage important dedans.";
    expect(buildHighlightContext(msg, "passage important")).toBe(msg);
  });
  it("centre une fenêtre ~280 caractères autour du passage dans un long message", () => {
    const before = "a".repeat(500);
    const after = "b".repeat(500);
    const sel = "PASSAGE";
    const msg = before + sel + after;
    const ctx = buildHighlightContext(msg, sel);
    expect(ctx).toContain(sel);
    expect(ctx.startsWith("…")).toBe(true);
    expect(ctx.endsWith("…")).toBe(true);
    expect(ctx.length).toBeLessThan(320);
  });
  it("ne met pas d'ellipse de tête quand la sélection est en tout début de message", () => {
    const sel = "DÉBUT";
    const msg = sel + "x".repeat(600);
    const ctx = buildHighlightContext(msg, sel);
    expect(ctx.startsWith("…")).toBe(false);
    expect(ctx.endsWith("…")).toBe(true);
  });
  it("ne met pas d'ellipse de fin quand la sélection est en tout fin de message", () => {
    const sel = "FIN";
    const msg = "x".repeat(600) + sel;
    const ctx = buildHighlightContext(msg, sel);
    expect(ctx.startsWith("…")).toBe(true);
    expect(ctx.endsWith("…")).toBe(false);
  });
});
