import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KnowledgeStore, htmlToText, sourceId } from "./knowledge.mjs";
import { runKbCommand } from "./kb_cli.mjs";

const tmp = (prefix = "atelier-kb-") => mkdtempSync(join(tmpdir(), prefix));

const LONG_NOTE = "Décision de rédaction : la troncature de septembre borne la fenêtre de fonte, donc toute tendance d'albédo est rapportée sur juin-août seulement.";

describe("base de connaissances — store", () => {
  it("épingle une note et la retrouve (add/list/search)", async () => {
    const store = new KnowledgeStore(tmp());
    const { source, refreshed } = await store.add({ kind: "note", title: "Décisions chap. 2", text: LONG_NOTE });
    expect(refreshed).toBe(false);
    expect(source.chars).toBe(LONG_NOTE.length);
    expect(store.list()).toHaveLength(1);
    const { source: found, passages } = store.search(source.id, "fenêtre de fonte septembre");
    expect(found.title).toBe("Décisions chap. 2");
    expect(passages[0].page).toBe(1);
    expect(passages[0].quote).toContain("septembre");
  });

  it("id déterministe : ré-épingler la même origine met à jour sans dupliquer", async () => {
    const dir = tmp();
    const store = new KnowledgeStore(dir);
    const file = join(dir, "notes.md");
    writeFileSync(file, LONG_NOTE);
    const first = await store.add({ kind: "file", origin: file });
    const second = await store.add({ kind: "file", origin: file, title: "Renommée" });
    expect(second.source.id).toBe(first.source.id);
    expect(second.refreshed).toBe(true);
    expect(store.list()).toHaveLength(1);
    expect(store.get(first.source.id).title).toBe("Renommée");
    expect(second.source.addedAt).toBe(first.source.addedAt);
  });

  it("recharge le registre depuis le disque (nouvelle instance)", async () => {
    const dir = tmp();
    const first = new KnowledgeStore(dir);
    const { source } = await first.add({ kind: "note", title: "Persistance", text: LONG_NOTE });
    const second = new KnowledgeStore(dir);
    expect(second.get(source.id)?.title).toBe("Persistance");
    expect(second.search(source.id, "fenêtre de fonte").passages.length).toBeGreaterThan(0);
  });

  it("refuse une extension non prise en charge avec un message clair", async () => {
    const dir = tmp();
    const store = new KnowledgeStore(dir);
    const file = join(dir, "doc.docx");
    writeFileSync(file, "binaire");
    await expect(store.add({ kind: "file", origin: file })).rejects.toThrow(/Extension non prise en charge/);
  });

  it("re-lit un fichier modifié (mtime) avant la recherche", async () => {
    const dir = tmp();
    const store = new KnowledgeStore(dir);
    const file = join(dir, "brouillon.md");
    writeFileSync(file, "Première version du paragraphe : le forçage radiatif des feux domine la variabilité estivale.");
    const { source } = await store.add({ kind: "file", origin: file });
    writeFileSync(file, "Version corrigée du paragraphe : la charge de poussière minérale domine finalement le signal saisonnier.");
    utimesSync(file, new Date(), new Date(Date.now() + 5000));
    const { passages } = store.search(source.id, "poussière minérale signal saisonnier");
    expect(passages[0].quote).toContain("poussière");
    expect(store.get(source.id).chars).toBeGreaterThan(0);
    expect(store.search(source.id, "forçage radiatif des feux").passages).toHaveLength(0);
  });

  it("PDF via extracteur injecté : les vraies pages restent citables", async () => {
    const dir = tmp();
    const pages = [
      { page: 1, text: "Abstract\nWe quantify wildfire carbon deposition on glacier surfaces and its albedo response." },
      { page: 2, text: "Results\nOur results show that fire-carbon dose decreases August albedo by 2.4 percent." },
    ];
    const store = new KnowledgeStore(dir, { extractPdf: () => ({ pages, cached: false }) });
    const file = join(dir, "papier.pdf");
    writeFileSync(file, "%PDF");
    const { source } = await store.add({ kind: "pdf", origin: file });
    expect(source.meta.pages).toBe(2);
    const { passages } = store.search(source.id, "albedo decrease August");
    expect(passages[0].page).toBe(2);
    expect(passages[0].quote).toContain("2.4 percent");
  });

  it("épingle une page web via fetch injecté et nettoie le HTML", async () => {
    const store = new KnowledgeStore(tmp(), {
      fetchPage: async () => ({
        body: `<html><head><title>Albedo &amp; feedbacks — revue</title><style>p{color:red}</style>
          <script>alert("bruit")</script></head>
          <body><p>Les rétroactions d'albédo amplifient la fonte estivale des glaciers de l'Ouest.</p>
          <p>La suie des feux réduit la réflectance de surface pendant la saison chaude.</p></body></html>`,
        contentType: "text/html",
      }),
    });
    const { source } = await store.add({ kind: "web", origin: "https://exemple.org/revue" });
    expect(source.title).toBe("Albedo & feedbacks — revue");
    const text = store.fullText(source.id);
    expect(text).not.toContain("alert");
    expect(text).not.toContain("color:red");
    expect(text).toContain("rétroactions d'albédo");
  });

  it("web avec texte fourni (capture browser) : aucun fetch", async () => {
    const store = new KnowledgeStore(tmp(), {
      fetchPage: async () => { throw new Error("fetch interdit dans ce test"); },
    });
    const { source } = await store.add({
      kind: "web", origin: "https://exemple.org/page-login",
      title: "Page interne", text: LONG_NOTE,
    });
    expect(source.title).toBe("Page interne");
    expect(store.search(source.id, "fenêtre de fonte").passages.length).toBeGreaterThan(0);
  });

  it("refuse les URL non http(s)", async () => {
    const store = new KnowledgeStore(tmp());
    await expect(store.add({ kind: "web", origin: "file:///etc/hosts" })).rejects.toThrow(/http\(s\)/);
  });

  it("remove supprime registre et cache", async () => {
    const dir = tmp();
    const store = new KnowledgeStore(dir);
    const { source } = await store.add({ kind: "note", title: "Éphémère", text: LONG_NOTE });
    const cache = store.cachePath(source.id);
    expect(existsSync(cache)).toBe(true);
    store.remove(source.id);
    expect(existsSync(cache)).toBe(false);
    expect(store.list()).toHaveLength(0);
    expect(() => store.search(source.id, "fonte")).toThrow(/Source inconnue/);
  });
});

describe("base de connaissances — robustesse", () => {
  it("registre corrompu : sauvegarde .corrupt-* signalée, rien d'écrasé en silence", async () => {
    const dir = tmp();
    const seed = new KnowledgeStore(dir);
    await seed.add({ kind: "note", title: "Avant corruption", text: LONG_NOTE });
    writeFileSync(join(dir, "knowledge.json"), "{ tronqué");
    const store = new KnowledgeStore(dir);
    expect(store.warning).toMatch(/corrupt/);
    expect(store.list()).toHaveLength(0);
    const backups = readdirSync(dir).filter((name) => name.startsWith("knowledge.json.corrupt-"));
    expect(backups).toHaveLength(1);
    expect(readFileSync(join(dir, backups[0]), "utf8")).toBe("{ tronqué");
    // le processus suivant repart sur un registre sain ; la sauvegarde demeure
    const added = await runKbCommand(["add", "--dir", dir, "--kind", "note", "--title", "Après", "--text", LONG_NOTE]);
    expect(added.ok).toBe(true);
    expect(added.warning).toBeUndefined();
    expect(readdirSync(dir).filter((name) => name.startsWith("knowledge.json.corrupt-"))).toHaveLength(1);
    // et l'avertissement du processus témoin est bien relayé par le CLI
    const flagged = await runKbCommand(["list", "--dir", dir], { store });
    expect(flagged.warning).toMatch(/corrupt/);
  });

  it("PDF remplacé sur disque : ré-extraction au prochain search", async () => {
    const dir = tmp();
    let calls = 0;
    const versions = [
      [{ page: 1, text: "Preprint version: the albedo decline reaches 1.1 percent in the accumulation zone." }],
      [{ page: 1, text: "Corrected version: the albedo decline reaches 3.7 percent in the ablation zone." }],
    ];
    const store = new KnowledgeStore(dir, {
      extractPdf: () => ({ pages: versions[Math.min(calls++, 1)], cached: false }),
    });
    const file = join(dir, "papier.pdf");
    writeFileSync(file, "%PDF-version-1");
    const { source } = await store.add({ kind: "pdf", origin: file });
    expect(calls).toBe(1);
    writeFileSync(file, "%PDF-version-2-plus-longue");
    const fresh = new KnowledgeStore(dir, {
      extractPdf: () => ({ pages: versions[1], cached: false }),
    });
    const { passages } = fresh.search(source.id, "albedo decline percent");
    expect(passages[0].quote).toContain("3.7 percent");
    expect(fresh.get(source.id).meta.size).toBeGreaterThan(0);
  });

  it("ajouts concurrents depuis deux processus : aucune perte", async () => {
    const dir = tmp();
    const cli = join(process.cwd(), "kb_cli.mjs");
    const run = (title) => new Promise((resolvePromise, rejectPromise) => {
      execFile(process.execPath, [
        cli, "add", "--dir", dir, "--kind", "note", "--title", title, "--text", LONG_NOTE,
      ], (error, stdout, stderr) => (error ? rejectPromise(new Error(stderr || String(error))) : resolvePromise(stdout)));
    });
    await Promise.all([run("Note parallèle A"), run("Note parallèle B")]);
    const listed = await runKbCommand(["list", "--dir", dir]);
    expect(listed.count).toBe(2);
    const titles = listed.sources.map((entry) => entry.title).sort();
    expect(titles).toEqual(["Note parallèle A", "Note parallèle B"]);
  });

  it("web sans --origin : message explicite", async () => {
    const store = new KnowledgeStore(tmp());
    await expect(store.add({ kind: "web", text: LONG_NOTE })).rejects.toThrow(/--origin/);
  });
});

describe("base de connaissances — htmlToText", () => {
  it("extrait titre et texte, décode les entités, saute des lignes aux blocs", () => {
    const { title, text } = htmlToText(
      "<title>A &amp; B</title><body><p>Premier bloc</p><p>Deuxi&#232;me bloc</p></body>",
    );
    expect(title).toBe("A & B");
    expect(text).toBe("Premier bloc\nDeuxième bloc");
  });

  it("décode les entités hexadécimales et nommées courantes", () => {
    const { text } = htmlToText(
      "<body><p>Fonte &#x2014; bilan n&eacute;gatif&hellip; &laquo;record&raquo; &amp;&nbsp;fin</p></body>",
    );
    expect(text).toBe("Fonte — bilan négatif… «record» & fin");
  });

  it("laisse intactes les entités inconnues", () => {
    expect(htmlToText("<p>a &zorglub; b</p>").text).toBe("a &zorglub; b");
  });

  it("ignore un HTML vide", () => {
    expect(htmlToText("").text).toBe("");
  });
});

describe("base de connaissances — CLI", () => {
  it("add/list/search/remove bout en bout via --dir", async () => {
    const dir = tmp();
    const added = await runKbCommand([
      "add", "--dir", dir, "--kind", "note", "--title", "Consignes", "--text", LONG_NOTE,
    ]);
    expect(added.ok).toBe(true);
    const listed = await runKbCommand(["list", "--dir", dir]);
    expect(listed.count).toBe(1);
    const found = await runKbCommand([
      "search", "--dir", dir, "--id", added.source.id, "--query", "fenêtre de fonte", "--limit", "3",
    ]);
    expect(found.count).toBeGreaterThan(0);
    expect(found.passages[0].quote).toContain("septembre");
    const removed = await runKbCommand(["remove", "--dir", dir, "--id", added.source.id]);
    expect(removed).toEqual({ ok: true, removed: added.source.id });
  });

  it("rejette une commande inconnue et les arguments manquants", async () => {
    await expect(runKbCommand(["explode"])).rejects.toThrow(/Usage/);
    await expect(runKbCommand(["search", "--id", "x"])).rejects.toThrow(/--query/);
    await expect(runKbCommand(["add", "--kind", "vhs"])).rejects.toThrow(/Kind non pris en charge/);
  });

  it("les ids restent stables entre kinds distincts", () => {
    expect(sourceId("file", "/a/b.md")).not.toBe(sourceId("pdf", "/a/b.md"));
  });

  it("--text - lit le contenu sur stdin (gros textes, capture browser)", async () => {
    const dir = tmp();
    const { Readable } = await import("node:stream");
    const added = await runKbCommand(
      ["add", "--dir", dir, "--kind", "note", "--title", "Depuis stdin", "--text", "-"],
      { stdin: Readable.from([LONG_NOTE]) },
    );
    expect(added.ok).toBe(true);
    expect(added.source.chars).toBe(LONG_NOTE.length);
  });
});
