import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
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

describe("base de connaissances — dossiers (T6)", () => {
  const seedVault = (root) => {
    mkdirSync(join(root, "notes"), { recursive: true });
    mkdirSync(join(root, ".obsidian"), { recursive: true });
    mkdirSync(join(root, "node_modules", "x"), { recursive: true });
    writeFileSync(join(root, "notes", "albedo.md"), "La suie des feux réduit la réflectance de surface pendant la saison chaude.");
    writeFileSync(join(root, "biblio.txt"), "Références du chapitre deux sur le bilan de masse, à compléter bientôt.");
    writeFileSync(join(root, "script.py"), "print('ignoré')");
    writeFileSync(join(root, ".obsidian", "config.md"), "caché");
    writeFileSync(join(root, "node_modules", "x", "lisez.md"), "ignoré aussi");
  };

  it("épingle un vault : filtres, tri déterministe, recherche avec fichier", async () => {
    const dir = tmp();
    const root = join(dir, "vault");
    seedVault(root);
    const store = new KnowledgeStore(dir);
    const { source } = await store.add({ kind: "folder", origin: root, title: "Vault Thèse" });
    expect(source.meta.files).toBe(2);
    expect(source.chars).toBeGreaterThan(0);
    const { passages } = store.search(source.id, "suie feux réflectance");
    expect(passages[0].file).toBe(join("notes", "albedo.md"));
    const found = await runKbCommand([
      "search", "--dir", dir, "--id", source.id, "--query", "suie feux réflectance",
    ], { store });
    expect(found.passages[0].cite).toBe(`[kb:${source.id} · ${join("notes", "albedo.md")}]`);
    expect(found.passages[0].location).toBe(join("notes", "albedo.md"));
  });

  it("re-scan mtime : modification et suppression vues sans ré-épingler", async () => {
    const dir = tmp();
    const root = join(dir, "vault");
    seedVault(root);
    const store = new KnowledgeStore(dir);
    const { source } = await store.add({ kind: "folder", origin: root });
    writeFileSync(join(root, "notes", "albedo.md"), "Nouvelle version : la poussière minérale domine le forçage de surface au printemps.");
    utimesSync(join(root, "notes", "albedo.md"), new Date(), new Date(Date.now() + 5000));
    const { passages } = store.search(source.id, "poussière minérale forçage");
    expect(passages[0].quote).toContain("poussière");
    const { rmSync } = await import("node:fs");
    rmSync(join(root, "biblio.txt"));
    store.search(source.id, "bilan de masse");
    expect(store.get(source.id).meta.files).toBe(1);
  });

  it("fullText compose des en-têtes # rel (format partagé avec Rust)", async () => {
    const dir = tmp();
    const root = join(dir, "vault");
    seedVault(root);
    const store = new KnowledgeStore(dir);
    const { source } = await store.add({ kind: "folder", origin: root });
    const text = store.fullText(source.id);
    expect(text.startsWith("# biblio.txt\n\n")).toBe(true);
    expect(text).toContain(`# ${join("notes", "albedo.md")}\n\n`);
  });

  it("dossier sans fichier texte ou introuvable : erreurs claires", async () => {
    const dir = tmp();
    const store = new KnowledgeStore(dir);
    await expect(store.add({ kind: "folder", origin: join(dir, "absent") })).rejects.toThrow(/Dossier introuvable/);
    const empty = join(dir, "vide");
    mkdirSync(empty, { recursive: true });
    writeFileSync(join(empty, "image.png"), "png");
    await expect(store.add({ kind: "folder", origin: empty })).rejects.toThrow(/Aucun fichier texte/);
  });
});

describe("base de connaissances — YouTube (T8)", () => {
  const VTT = [
    "WEBVTT",
    "Kind: captions",
    "",
    "00:00:01.000 --> 00:00:04.000",
    "Bienvenue à ce cours sur le <c>bilan</c> énergétique des glaciers.",
    "",
    "00:00:05.000 --> 00:00:08.000",
    "Bienvenue à ce cours sur le bilan énergétique des glaciers.",
    "",
    "00:00:40.000 --> 00:00:43.000",
    "L'albédo contrôle la part du rayonnement solaire absorbée en surface.",
    "",
    "01:02.000 --> 01:06.000",
    "La suie des feux de forêt assombrit la neige et accélère la fonte estivale.",
  ].join("\n");

  it("vttToPages : buckets par minute, balises et répétitions retirées", async () => {
    const { vttToPages } = await import("./knowledge.mjs");
    const pages = vttToPages(VTT);
    expect(pages).toHaveLength(2);
    expect(pages[0].page).toBe(1);
    expect(pages[0].text).toContain("bilan énergétique");
    expect(pages[0].text).not.toContain("<c>");
    expect(pages[0].text.match(/Bienvenue/g)).toHaveLength(1);
    expect(pages[1].page).toBe(2);
    expect(pages[1].text).toContain("suie des feux");
  });

  it("parseYoutubeUrl : formats acceptés et rejets", async () => {
    const { parseYoutubeUrl } = await import("./knowledge.mjs");
    expect(parseYoutubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ").href)
      .toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(parseYoutubeUrl("https://youtu.be/dQw4w9WgXcQ?t=30").id).toBe("dQw4w9WgXcQ");
    expect(parseYoutubeUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ").id).toBe("dQw4w9WgXcQ");
    expect(() => parseYoutubeUrl("https://vimeo.com/12345")).toThrow(/YouTube non reconnue/);
  });

  it("épingle une vidéo (fetch injecté) : timestamps cités et lien &t=", async () => {
    const dir = tmp();
    const store = new KnowledgeStore(dir, {
      fetchYoutube: () => ({ title: "Lecture — Glacier energy balance", duration: 2880, vtt: VTT }),
    });
    const { source } = await store.add({ kind: "youtube", origin: "https://youtu.be/dQw4w9WgXcQ" });
    expect(source.title).toBe("Lecture — Glacier energy balance");
    expect(source.origin).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(source.meta.segments).toBe(2);
    const found = await runKbCommand([
      "search", "--dir", dir, "--id", source.id, "--query", "suie feux fonte estivale",
    ], { store });
    expect(found.passages[0].location).toBe("1:00");
    expect(found.passages[0].cite).toBe(`[kb:${source.id} · 1:00]`);
    expect(found.passages[0].markdownLink).toBe(
      "[Ouvrir à 1:00](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=60s)",
    );
  });

  it("vidéo sans sous-titres : erreur claire", async () => {
    const store = new KnowledgeStore(tmp(), { fetchYoutube: () => ({ title: "Muette", duration: 10, vtt: "WEBVTT\n" }) });
    await expect(store.add({ kind: "youtube", origin: "https://youtu.be/dQw4w9WgXcQ" }))
      .rejects.toThrow(/Aucun sous-titre/);
  });
});

describe("base de connaissances — promotion gbrain (T7)", () => {
  it("capture titre + origine + extrait via gbrain capture", async () => {
    const store = new KnowledgeStore(tmp());
    const { source } = await store.add({ kind: "note", title: "Idée durable", text: LONG_NOTE });
    const calls = [];
    const { promoteToGbrain } = await import("./knowledge.mjs");
    const result = promoteToGbrain(store, source.id, {
      spawn: (cmd, args) => {
        calls.push([cmd, ...args]);
        return { status: 0, stdout: "ok", stderr: "" };
      },
    });
    expect(result).toEqual({ id: source.id, captured: true });
    expect(calls[0][0]).toBe("gbrain");
    expect(calls[0][1]).toBe("capture");
    expect(calls[0][2]).toContain("Idée durable — note");
    expect(calls[0][2]).toContain("troncature de septembre");
  });

  it("NAS injoignable ou id inconnu : erreurs propres", async () => {
    const store = new KnowledgeStore(tmp());
    const { source } = await store.add({ kind: "note", title: "Éphémère", text: LONG_NOTE });
    const { promoteToGbrain } = await import("./knowledge.mjs");
    expect(() => promoteToGbrain(store, "absent")).toThrow(/Source inconnue/);
    expect(() => promoteToGbrain(store, source.id, {
      spawn: () => ({ status: 1, stdout: "", stderr: "ssh: connect to host rorqual timed out" }),
    })).toThrow(/rorqual timed out/);
    expect(() => promoteToGbrain(store, source.id, {
      spawn: () => ({ error: new Error("ENOENT") }),
    })).toThrow(/gbrain indisponible/);
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

  it("search décore les passages : cite, location, markdownLink", async () => {
    const dir = tmp();
    const pdfPages = [
      { page: 1, text: "Abstract. Wildfire carbon deposition on glacier surfaces and albedo." },
      { page: 2, text: "Results. The albedo decreases by 2.4 percent in August after fire events." },
    ];
    const store = new KnowledgeStore(dir, { extractPdf: () => ({ pages: pdfPages, cached: false }) });
    const pdfFile = join(dir, "papier.pdf");
    writeFileSync(pdfFile, "%PDF");
    const pdf = await store.add({ kind: "pdf", origin: pdfFile });
    const found = await runKbCommand([
      "search", "--dir", dir, "--id", pdf.source.id, "--query", "albedo decrease August",
    ], { store });
    expect(found.passages[0].location).toBe("p.2");
    expect(found.passages[0].cite).toBe(`[kb:${pdf.source.id} · p.2]`);

    const web = await store.add({
      kind: "web", origin: "https://exemple.org/revue", title: "Revue",
      text: "Les rétroactions d'albédo amplifient la fonte estivale des glaciers de l'Ouest.",
    });
    const webFound = await runKbCommand([
      "search", "--dir", dir, "--id", web.source.id, "--query", "rétroactions albédo fonte",
    ], { store });
    expect(webFound.passages[0].cite).toBe(`[kb:${web.source.id}]`);
    expect(webFound.passages[0].markdownLink).toBe("[Ouvrir la page](https://exemple.org/revue)");
  });

  it("gbrain-search : parse les résultats du CLI (score, slug, extrait multi-ligne)", async () => {
    const raw = [
      "[0.3040] papers/aubry-wake-2022 -- # Fire and Ice: The Impact of Wildfire-Affected Albedo",
      "**Caroline Aubry-Wake**",
      "[0.2100] notes/albedo-feedback -- Boucle de rétroaction",
      "",
    ].join("\n");
    const out = await runKbCommand(
      ["gbrain-search", "--query", "albédo", "--limit", "5"],
      { runGbrain: () => raw },
    );
    expect(out.count).toBe(2);
    expect(out.results[0]).toMatchObject({ slug: "papers/aubry-wake-2022" });
    expect(out.results[0].snippet).toContain("Fire and Ice");
    expect(out.results[0].snippet).toContain("Aubry-Wake");
    const empty = await runKbCommand(
      ["gbrain-search", "--query", "zzz"],
      { runGbrain: () => "No results.\n" },
    );
    expect(empty).toMatchObject({ ok: true, count: 0, results: [] });
  });

  it("épingle une page gbrain : titre du front-matter (plié), cite = slug", async () => {
    const markdown = [
      "---",
      "type: concept",
      "title: >-",
      "  The influence of forest fire aerosol and air temperature on glacier",
      "  albedo, western North America",
      "year: 2021",
      "---",
      "",
      "# Résumé",
      "La suie des feux réduit l'albédo estival des glaciers de l'Ouest nord-américain.",
    ].join("\n");
    const dir = tmp();
    const store = new KnowledgeStore(dir, { runGbrain: (args) => {
      expect(args).toEqual(["get", "papers/williamson-2021"]);
      return markdown;
    } });
    const { source } = await store.add({ kind: "gbrain", origin: "papers/williamson-2021" });
    expect(source.title).toBe("The influence of forest fire aerosol and air temperature on glacier albedo, western North America");
    expect(source.meta.slug).toBe("papers/williamson-2021");
    expect(source.meta.syncedAt).toBeTruthy();
    const found = await runKbCommand(
      ["search", "--dir", dir, "--id", source.id, "--query", "suie feux albédo estival"],
      { runGbrain: () => markdown },
    );
    expect(found.passages[0].cite).toBe(`[kb:${source.id} · papers/williamson-2021]`);
    expect(found.passages[0].quote).toContain("suie");
  });

  it("page gbrain sans front-matter : titre = premier heading, sinon slug", async () => {
    const store = new KnowledgeStore(tmp(), { runGbrain: () => "# Un titre net\n\nContenu suffisant pour être indexé proprement dans le moteur." });
    const { source } = await store.add({ kind: "gbrain", origin: "notes/x" });
    expect(source.title).toBe("Un titre net");
    const store2 = new KnowledgeStore(tmp(), { runGbrain: () => "Texte brut sans structure, assez long pour produire un extrait correct." });
    const { source: s2 } = await store2.add({ kind: "gbrain", origin: "notes/brut" });
    expect(s2.title).toBe("notes/brut");
  });

  it("gbrain injoignable : erreur propre, jamais de source fantôme", async () => {
    const store = new KnowledgeStore(tmp(), { runGbrain: () => { throw new Error("gbrain : délai dépassé (NAS injoignable ?)"); } });
    await expect(store.add({ kind: "gbrain", origin: "notes/x" })).rejects.toThrow(/NAS injoignable/);
    expect(store.list()).toHaveLength(0);
  });

  it("promote-page : aperçu avec slug proposé, existence sondée, jamais d'écriture sans --write", async () => {
    const dir = tmp();
    const calls = [];
    const runGbrain = (args, opts) => {
      calls.push({ args, input: opts?.input });
      if (args[0] === "get") return "Error [page_not_found]: Page not found: x\n";
      return "ok";
    };
    const added = await runKbCommand([
      "add", "--dir", dir, "--kind", "note", "--title", "Décisions — chapitre 2 (été)", "--text", LONG_NOTE,
    ]);
    const preview = await runKbCommand(
      ["promote-page", "--dir", dir, "--id", added.source.id],
      { runGbrain },
    );
    expect(preview.slug).toBe("atelier/decisions-chapitre-2-ete");
    expect(preview.exists).toBe(false);
    expect(preview.preview).toContain("from: atelier");
    expect(preview.preview).toContain(LONG_NOTE.slice(0, 40));
    // aperçu = un seul get, aucun put
    expect(calls.map((c) => c.args[0])).toEqual(["get"]);

    const written = await runKbCommand(
      ["promote-page", "--dir", dir, "--id", added.source.id, "--slug", "atelier/decisions-v2", "--write"],
      { runGbrain },
    );
    expect(written).toMatchObject({ ok: true, written: true, slug: "atelier/decisions-v2", updated: false });
    const put = calls.find((c) => c.args[0] === "put");
    expect(put.args).toEqual(["put", "atelier/decisions-v2"]);
    expect(put.input).toContain('title: "Décisions — chapitre 2 (été)"');
    expect(put.input).toContain(LONG_NOTE);
  });

  it("promote-page : slug existant signalé, write → updated:true ; slug invalide refusé", async () => {
    const dir = tmp();
    const runGbrain = (args) => (args[0] === "get" ? "---\ntitle: x\n---\ncontenu existant" : "ok");
    const added = await runKbCommand([
      "add", "--dir", dir, "--kind", "note", "--title", "Existante", "--text", LONG_NOTE,
    ]);
    const preview = await runKbCommand(
      ["promote-page", "--dir", dir, "--id", added.source.id],
      { runGbrain },
    );
    expect(preview.exists).toBe(true);
    const written = await runKbCommand(
      ["promote-page", "--dir", dir, "--id", added.source.id, "--write"],
      { runGbrain },
    );
    expect(written.updated).toBe(true);
    await expect(runKbCommand(
      ["promote-page", "--dir", dir, "--id", added.source.id, "--slug", "slug avec espaces"],
      { runGbrain },
    )).rejects.toThrow(/Slug invalide/);
  });

  it("kind zotero : origine zotero:// résolue, meta pour liens profonds, fraîcheur pdf", async () => {
    const dir = tmp();
    const storage = join(dir, "Zotero-storage", "PBJV88DI");
    mkdirSync(storage, { recursive: true });
    const pdfPath = join(storage, "glambie 2025.pdf");
    writeFileSync(pdfPath, "%PDF");
    const pages = [
      { page: 1, text: "Abstract\nCommunity estimate of global glacier mass changes from 2000 to 2023." },
      { page: 2, text: "Results\nGlaciers worldwide lost 273 gigatonnes in mass annually from 2000 to 2023." },
    ];
    let extracted = 0;
    const resolved = [];
    const store = new KnowledgeStore(dir, {
      // le resolver reçoit ~/Zotero/storage/<pdfKey>/<pdfFile> (décodé) et
      // rend le chemin réel — ici notre stockage de test
      resolveZotero: (p) => { resolved.push(p); return pdfPath; },
      extractPdf: () => { extracted += 1; return { pages, cached: false }; },
    });
    // le chemin encodé (espace) est décodé, itemKey conservé pour les liens
    const { source } = await store.add({
      kind: "zotero",
      origin: "zotero://PBJV88DI/glambie%202025.pdf#GLKEY123",
      title: "Community estimate of global glacier mass changes",
    });
    expect(source.kind).toBe("zotero");
    expect(source.meta).toMatchObject({ pdfKey: "PBJV88DI", pdfFile: "glambie 2025.pdf", zoteroKey: "GLKEY123", pages: 2 });
    expect(resolved[0].endsWith(join("Zotero", "storage", "PBJV88DI", "glambie 2025.pdf"))).toBe(true);
    // NB : resolveZotero injecté reçoit ~/Zotero/storage/<key>/<file> — ici on
    // vérifie surtout le contrat CLI → recherche paginée + cite p.N
    const found = await runKbCommand(["search", "--dir", dir, "--id", source.id, "--query", "gigatonnes mass annually"], { store });
    expect(found.passages[0].cite).toBe(`[kb:${source.id} · p.2]`);
    expect(found.passages[0].markdownLink).toContain("#atelier-zotero-passage?");
    expect(found.passages[0].markdownLink).toContain("key=GLKEY123");
    // ré-épingler = même id (pas de doublon)
    const again = await store.add({ kind: "zotero", origin: "zotero://PBJV88DI/glambie%202025.pdf#GLKEY123" });
    expect(again.source.id).toBe(source.id);
    expect(again.refreshed).toBe(true);
    expect(extracted).toBeGreaterThanOrEqual(2);
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

describe("base de connaissances — collections & archive (plan 051)", () => {
  it("cycle complet : créer, étiqueter, filtrer, renommer, supprimer sans perdre les sources", async () => {
    const dir = tmp();
    const store = new KnowledgeStore(dir);
    const a = (await store.add({ kind: "note", title: "Note AGU", text: LONG_NOTE })).source;
    const b = (await store.add({ kind: "note", title: "Note libre", text: LONG_NOTE })).source;
    const slug = store.collectionOp({ op: "add", title: "AGU 2026" });
    expect(slug).toBe("agu-2026");
    store.tagSource(a.id, slug);
    expect(store.list({ collection: slug }).map((s) => s.id)).toEqual([a.id]);
    expect(store.list()).toHaveLength(2);
    store.collectionOp({ op: "rename", slug, title: "AGU26" });
    expect(store.collections.find((c) => c.slug === slug)?.title).toBe("AGU26");
    store.collectionOp({ op: "remove", slug });
    expect(store.list()).toHaveLength(2);
    expect(store.get(a.id).collections).toEqual([]);
    expect(store.get(b.id).collections).toEqual([]);
  });

  it("étiqueter ne remonte pas la source dans les récents (updatedAt intact)", async () => {
    const dir = tmp();
    const store = new KnowledgeStore(dir);
    const { source } = await store.add({ kind: "note", title: "Stable", text: LONG_NOTE });
    const slug = store.collectionOp({ op: "add", title: "Méthodo" });
    store.tagSource(source.id, slug);
    expect(store.get(source.id).updatedAt).toBe(source.updatedAt);
  });

  it("archive : masquée par défaut, listée via le filtre, attache préservée au refresh", async () => {
    const dir = tmp();
    const store = new KnowledgeStore(dir);
    const file = join(dir, "n.md");
    writeFileSync(file, LONG_NOTE);
    const { source } = await store.add({ kind: "file", origin: file });
    store.archiveSource(source.id);
    expect(store.list()).toHaveLength(0);
    expect(store.list({ archived: true }).map((s) => s.id)).toEqual([source.id]);
    // le re-add (refresh) préserve archived + collections
    const again = await store.add({ kind: "file", origin: file });
    expect(again.source.archived).toBe(true);
    store.archiveSource(source.id, true);
    expect(store.list()).toHaveLength(1);
  });

  it("migration douce : registre v1 lu tel quel, réécrit en v2 à la première mutation", async () => {
    const dir = tmp();
    const first = new KnowledgeStore(dir);
    const { source } = await first.add({ kind: "note", title: "V1", text: LONG_NOTE });
    // rétrograde le fichier en v1 sans champs collections/archived
    const raw = JSON.parse(readFileSync(join(dir, "knowledge.json"), "utf8"));
    for (const s of raw.sources) { delete s.collections; delete s.archived; }
    writeFileSync(join(dir, "knowledge.json"), JSON.stringify({ version: 1, sources: raw.sources }));
    const second = new KnowledgeStore(dir);
    expect(second.get(source.id).collections).toEqual([]);
    expect(second.get(source.id).archived).toBe(false);
    second.collectionOp({ op: "add", title: "Post-migration" });
    const rewritten = JSON.parse(readFileSync(join(dir, "knowledge.json"), "utf8"));
    expect(rewritten.version).toBe(2);
    expect(rewritten.collections).toHaveLength(1);
    expect(rewritten.sources[0].collections).toEqual([]);
  });

  it("youtube : la chaîne entre en méta quand yt-dlp la fournit", async () => {
    const store = new KnowledgeStore(tmp(), {
      fetchYoutube: () => ({
        title: "Talk", duration: 120, channel: "TED",
        vtt: "WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nUne phrase assez longue pour être indexée correctement ici.",
      }),
    });
    const { source } = await store.add({ kind: "youtube", origin: "https://youtu.be/abc12345678" });
    expect(source.meta.channel).toBe("TED");
  });

  it("CLI : collection/tag/archive/list filtré bout en bout", async () => {
    const dir = tmp();
    const added = await runKbCommand(["add", "--dir", dir, "--kind", "note", "--title", "N1", "--text", LONG_NOTE]);
    const coll = await runKbCommand(["collection", "--dir", dir, "--add", "Thèse ch. 2"]);
    expect(coll.slug).toBe("these-ch-2");
    await runKbCommand(["tag", "--dir", dir, "--id", added.source.id, "--collection", coll.slug]);
    const filtered = await runKbCommand(["list", "--dir", dir, "--collection", coll.slug]);
    expect(filtered.count).toBe(1);
    expect(filtered.collections).toHaveLength(1);
    await runKbCommand(["archive", "--dir", dir, "--id", added.source.id]);
    const active = await runKbCommand(["list", "--dir", dir]);
    expect(active.count).toBe(0);
    expect(active.archivedCount).toBe(1);
    expect(active.archivedSources).toHaveLength(1);
  });
});
