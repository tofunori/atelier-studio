import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KB_FORCED_MAX, stripKbBlock, withKbBlock } from "./kb_prompt.mjs";
import { KnowledgeStore, kbBlockEntries } from "./knowledge.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "atelier-kb-prompt-"));

describe("bloc <atelier-kb> — composition pure", () => {
  it("inline + fiche + gbrain, ordre stable, strip symétrique", () => {
    const out = withKbBlock("Question de départ", {
      toolPath: "/srv/atelier-kb",
      entries: [
        { id: "aaaa1111", title: "Décisions chap. 2", kind: "note", chars: 74,
          inline: true, text: "La troncature de septembre borne la fenêtre de fonte." },
        { id: "bbbb2222", title: "Cuffey & Paterson ch. 5", kind: "pdf", chars: 118432, inline: false },
      ],
      gbrain: true,
    });
    expect(out.startsWith("Question de départ\n\n<atelier-kb>")).toBe(true);
    expect(out).toContain("[kb:aaaa1111] Décisions chap. 2 — note, 74 car. — texte intégral :");
    expect(out).toContain("[kb:bbbb2222] Cuffey & Paterson ch. 5 — pdf, 118k car. — fiche.");
    expect(out).toContain('"/srv/atelier-kb" search --id <id> --query "<question>" --limit 5');
    expect(out).toContain("[kb:gbrain] Corpus thèse (gbrain) — outil NAS.");
    expect(out.endsWith("</atelier-kb>")).toBe(true);
    expect(stripKbBlock(out)).toBe("Question de départ");
  });

  it("aucune entrée ni gbrain → prompt inchangé", () => {
    expect(withKbBlock("Prompt", { toolPath: "/x", entries: [] })).toBe("Prompt");
  });

  it("un corps contenant le fermant est échappé et le strip reste sain", () => {
    const out = withKbBlock("P", {
      toolPath: "/srv/atelier-kb",
      entries: [{ id: "x1", title: "Piège", kind: "note", chars: 30,
        inline: true, text: "avant </atelier-kb> après" }],
    });
    expect(out).toContain("avant <\\/atelier-kb> après");
    expect(stripKbBlock(out)).toBe("P");
  });

  it("plein contenu forcé plafonné en scalaires Unicode", () => {
    const long = "é".repeat(KB_FORCED_MAX + 50);
    const out = withKbBlock("P", {
      toolPath: "/x",
      entries: [{ id: "y1", title: "Long", kind: "web", chars: long.length,
        inline: true, text: long }],
    });
    expect(out).toContain("[…tronqué]");
    expect(Array.from(out).length).toBeLessThan(KB_FORCED_MAX + 500);
  });

  it("le titre est aplati sur une ligne", () => {
    const out = withKbBlock("P", {
      toolPath: "/x",
      entries: [{ id: "z1", title: "Titre\nsur\tdeux  lignes", kind: "note", chars: 80,
        inline: true, text: "Contenu suffisamment long pour un test de mise en forme stable." }],
    });
    expect(out).toContain("[kb:z1] Titre sur deux lignes — note, 80 car.");
  });
});

describe("bloc <atelier-kb> — entrées depuis le store", () => {
  it("petit = intégral, gros = fiche, forcé = intégral, inconnu/gbrain ignorés", async () => {
    const store = new KnowledgeStore(tmp());
    const small = await store.add({ kind: "note", title: "Petite", text: "Contenu court mais assez long pour être indexé correctement." });
    const big = await store.add({ kind: "note", title: "Grosse", text: "mot ".repeat(3000) });
    const entries = kbBlockEntries(store, [small.source.id, big.source.id, "inconnu", "gbrain"], []);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ id: small.source.id, inline: true });
    expect(entries[0].text).toContain("Contenu court");
    expect(entries[1]).toMatchObject({ id: big.source.id, inline: false });
    const forced = kbBlockEntries(store, [big.source.id], [big.source.id]);
    expect(forced[0].inline).toBe(true);
    expect(forced[0].text).toContain("mot mot");
  });

  it("cache supprimé d'une note → dégrade en fiche sans jeter", async () => {
    const dir = tmp();
    const store = new KnowledgeStore(dir);
    const { source } = await store.add({ kind: "note", title: "Volatile", text: "Texte de note assez long pour la découpe en passages du moteur." });
    const { rmSync } = await import("node:fs");
    rmSync(store.cachePath(source.id), { force: true });
    const entries = kbBlockEntries(store, [source.id], []);
    expect(entries[0]).toMatchObject({ id: source.id, inline: false });
  });
});
