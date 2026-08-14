// Import d'article (plan 053) — conversion, métadonnées, brouillon, écriture.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  articleSlug, buildArticlePage, convertPdf, copyToRagdoc, draftDir, dropDraft,
  findDuplicates, firstAuthorSlug, importArticle, listArticles, mineruFailure, outputName,
  parseArticleList, parseArticleMeta,
  pruneDrafts, ragdocName, readDraft, saveDraft, writeArticle,
} from "./article.mjs";
import { runKbCommand } from "./kb_cli.mjs";

const ARTICLE = `# Physically based snow albedo model for calculating broadband albedos

Aoki, T.; Kuchiki, K.; Niwano, M.

Journal of Geophysical Research: Atmospheres, doi:10.1029/2010JD015507, 2011

## Abstract

A physically based snow albedo model (PBSAM) has been developed.
`;

function fixtureDir() {
  return mkdtempSync(join(tmpdir(), "atelier-article-"));
}

function fakePdf(dir, name = "aoki-2011.pdf") {
  const path = join(dir, name);
  writeFileSync(path, "%PDF-1.4 factice");
  return path;
}

describe("métadonnées", () => {
  it("extrait titre, auteurs, année, revue et DOI", () => {
    const meta = parseArticleMeta(ARTICLE, { filename: "aoki-2011.pdf" });
    expect(meta.title).toBe("Physically based snow albedo model for calculating broadband albedos");
    expect(meta.authors).toBe("Aoki, T.; Kuchiki, K.; Niwano, M.");
    expect(meta.year).toBe(2011);
    expect(meta.doi).toBe("10.1029/2010JD015507");
    expect(meta.journal).toMatch(/Journal of Geophysical Research/);
  });

  it("retombe sur le nom de fichier quand le PDF n'a pas de titre", () => {
    const meta = parseArticleMeta("   \n\n", { filename: "/tmp/box_steffen_2001.pdf" });
    expect(meta.title).toBe("box steffen 2001");
    expect(meta.year).toBeNull();
  });

  it("ignore une année future absurde", () => {
    const meta = parseArticleMeta("# T\n\n2199 quelque chose", { filename: "x.pdf" });
    expect(meta.year).toBeNull();
  });

  it("lit le nom de famille quelle que soit la forme", () => {
    expect(firstAuthorSlug("Aoki, T.; Kuchiki, K.")).toBe("aoki");
    expect(firstAuthorSlug("T. Aoki and K. Kuchiki")).toBe("aoki");
    expect(firstAuthorSlug("")).toBe("");
  });

  it("compose un slug lisible et un nom ragdoc conventionnel", () => {
    const meta = parseArticleMeta(ARTICLE, { filename: "aoki-2011.pdf" });
    expect(articleSlug(meta)).toBe("articles/aoki-2011-physically-snow-albedo-model");
    expect(ragdocName(meta)).toBe("Aoki_2011_Physically_Snow_Albedo_Model");
  });

  it("reste valide sans auteur ni année", () => {
    const slug = articleSlug({ title: "Notes de terrain" });
    expect(slug).toBe("articles/notes-terrain");
    expect(slug).toMatch(/^[a-z0-9][a-z0-9/_.-]*$/);
  });
});

describe("page markdown", () => {
  it("porte le front-matter bibliographique et la provenance", () => {
    const page = buildArticlePage(
      { title: "Titre", authors: "Aoki, T.; Kuchiki, K.", year: 2011, journal: "JGR", doi: "10.1/x" },
      "Corps de l'article.",
      { origin: "/tmp/a.pdf", converter: "mineru" },
    );
    expect(page).toContain('title: "Titre"');
    expect(page).toContain('authors: ["Aoki, T.", "Kuchiki, K."]');
    expect(page).toContain("year: 2011");
    expect(page).toContain('doi: "10.1/x"');
    expect(page).toContain("from: atelier");
    expect(page).toContain("type: article");
    expect(page.trimEnd().endsWith("Corps de l'article.")).toBe(true);
  });

  it("omet les champs vides plutôt que d'écrire des nulls", () => {
    const page = buildArticlePage({ title: "T", authors: "" }, "corps");
    expect(page).toContain("authors: []");
    expect(page).not.toContain("journal:");
    expect(page).not.toContain("doi:");
  });
});

describe("conversion", () => {
  it("utilise MinerU quand le script produit un markdown", () => {
    const dir = fixtureDir();
    const path = fakePdf(dir);
    const name = outputName(path);
    writeFileSync(join(dir, `${name}.md`), ARTICLE);
    const out = convertPdf(path, {
      mineru: { script: "/faux/mineru.py", reason: null },
      tmp: dir,
      spawn: () => ({ status: 0, stdout: "ok", stderr: "" }),
    });
    expect(out.converter).toBe("mineru");
    expect(out.warning).toBeNull();
    expect(out.markdown).toContain("snow albedo model");
  });

  it("retombe sur l'extraction locale et explique pourquoi", () => {
    const dir = fixtureDir();
    const path = fakePdf(dir);
    const out = convertPdf(path, {
      mineru: { script: "/faux/mineru.py", reason: null },
      tmp: dir,
      spawn: () => ({ status: 1, stdout: "", stderr: "quota dépassé" }),
      extractPdf: () => ({ pages: [{ page: 1, text: "page une" }, { page: 2, text: "page deux" }], cached: false }),
    });
    expect(out.converter).toBe("local");
    expect(out.warning).toMatch(/quota dépassé/);
    expect(out.markdown).toBe("page une\n\npage deux");
  });

  it("signale un PDF sans couche texte au lieu d'écrire une page vide", () => {
    const dir = fixtureDir();
    const path = fakePdf(dir);
    expect(() => convertPdf(path, {
      mineru: { script: null, reason: "token absent" },
      extractPdf: () => ({ pages: [{ page: 1, text: "" }, { page: 2, text: "  " }], cached: false }),
    })).toThrow(/Aucun texte extrait/);
  });

  it("refuse un fichier absent ou non-PDF", () => {
    const dir = fixtureDir();
    expect(() => convertPdf(join(dir, "rien.pdf"), {})).toThrow(/introuvable/);
    const notPdf = join(dir, "notes.md");
    writeFileSync(notPdf, "x");
    expect(() => convertPdf(notPdf, {})).toThrow(/PDF est attendu/);
  });
});

describe("brouillons", () => {
  it("survit à un aller-retour et refuse un id malformé", () => {
    const dir = fixtureDir();
    const id = saveDraft(dir, ARTICLE);
    expect(readDraft(dir, id)).toBe(ARTICLE);
    expect(() => readDraft(dir, "../../etc/passwd")).toThrow(/invalide/);
    dropDraft(dir, id);
    expect(() => readDraft(dir, id)).toThrow(/expiré/);
  });

  it("purge les brouillons oubliés", () => {
    const dir = fixtureDir();
    const id = saveDraft(dir, ARTICLE);
    expect(pruneDrafts(dir, { now: Date.now() + 8 * 24 * 3600 * 1000 })).toBe(1);
    expect(() => readDraft(dir, id)).toThrow(/expiré/);
    expect(draftDir(dir).endsWith("article-drafts")).toBe(true);
  });
});

// Sortie réelle de MinerU sur un article Frontiers (cas vécu 2026-08-13) :
// balises <sup>, appareil éditorial avant le corps, revue nommée en toutes
// lettres dans la « specialty section ».
const FRONTIERS = `# Bayesian Hierarchical Models can Infer Interpretable Predictions of Leaf Area Index From Heterogeneous Datasets

Olivera Stojanović<sup>1</sup>\\*, Bastian Siegmann<sup>2</sup>, Thomas Jarmer<sup>3</sup>, Gordon Pipa<sup>1</sup> and Johannes Leugering<sup>1</sup>

<sup>1</sup>Neuroinformatics Lab, Institute of Cognitive Science, University of Osnabrück, Osnabrück, Germany

Edited by: Christos H. Halios, Public Health England, United Kingdom

Specialty section: This article was submitted to Environmental Informatics and Remote Sensing, a section of the journal Frontiers in Environmental Science

Received: 21 September 2021
Accepted: 20 December 2021
Published: 11 January 2022

doi: 10.3389/fenvs.2021.780814

Environmental scientists often face the challenge of predicting a complex phenomenon.
`;

describe("article Frontiers converti par MinerU", () => {
  const meta = parseArticleMeta(FRONTIERS, { filename: "fenvs-09-780814.pdf" });

  it("prend le titre du heading, pas la ligne « published: »", () => {
    expect(meta.title).toBe(
      "Bayesian Hierarchical Models can Infer Interpretable Predictions of Leaf Area Index From Heterogeneous Datasets",
    );
  });

  it("nettoie les appels de note collés aux auteurs", () => {
    expect(meta.authors).toBe(
      "Olivera Stojanović, Bastian Siegmann, Thomas Jarmer, Gordon Pipa and Johannes Leugering",
    );
  });

  it("nomme la revue et pas l'affiliation du premier auteur", () => {
    expect(meta.journal).toBe("Frontiers in Environmental Science");
  });

  it("retient l'année de publication, pas celle du DOI", () => {
    expect(meta.year).toBe(2022);
    expect(meta.doi).toBe("10.3389/fenvs.2021.780814");
  });

  it("compose un slug par le nom de famille du premier auteur", () => {
    expect(articleSlug(meta)).toBe("articles/stojanovic-2022-bayesian-hierarchical-models-infer");
  });
});

describe("échec MinerU", () => {
  it("cherche le markdown dans /tmp, où le script l'écrit en dur", () => {
    // le repli lit os.tmpdir() ; c'est /tmp que le script utilise
    const dir = fixtureDir();
    const path = fakePdf(dir);
    const name = outputName(path);
    writeFileSync(join("/tmp", `${name}.md`), FRONTIERS);
    const out = convertPdf(path, {
      mineru: { script: "/faux/mineru.py", reason: null },
      spawn: () => ({ status: 0, stdout: "✓ Figures: 16 images", stderr: "" }),
    });
    expect(out.converter).toBe("mineru");
    expect(out.warning).toBeNull();
  });

  it("ne présente jamais la dernière ligne de succès comme une cause d'échec", () => {
    expect(mineruFailure({ status: 1, stdout: "✓ Figures: 16 images in /tmp/x_images/", stderr: "" }))
      .toBe("code 1");
    expect(mineruFailure({ status: 1, stderr: "Error: quota exceeded (2000 pages/day)" }))
      .toMatch(/quota exceeded/);
    expect(mineruFailure({ error: { code: "ETIMEDOUT" } })).toBe("délai dépassé");
    expect(mineruFailure({ status: 0 })).toBe("markdown introuvable en sortie");
  });
});

describe("liste du corpus", () => {
  const OUTPUT = [
    "UPGRADE_AVAILABLE 0.42.26.0 0.45.11.0",
    "gbrain 0.42.26.0 -> 0.45.11.0 available. Run: gbrain self-upgrade",
    "articles/aoki-2011-snow\tarticle\t2026-08-12\tPhysically based snow albedo model",
    "articles/rounce-2023-uncertainty\tarticle\t2026-08-14\tQuantifying parameter uncertainty",
  ].join("\n");

  it("ignore les bannières du CLI et garde les quatre colonnes", () => {
    const rows = parseArticleList(OUTPUT);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      slug: "articles/aoki-2011-snow", type: "article", date: "2026-08-12",
      title: "Physically based snow albedo model",
    });
  });

  it("rend les plus récents d'abord et respecte la limite", () => {
    const rows = listArticles({ limit: 1 }, { runGbrain: () => OUTPUT });
    expect(rows).toHaveLength(1);
    expect(rows[0].slug).toBe("articles/rounce-2023-uncertainty");
  });

  it("ne rend rien plutôt que d'échouer sur une sortie vide", () => {
    expect(listArticles({}, { runGbrain: () => "" })).toEqual([]);
  });
});

describe("doublons", () => {
  const META = { title: "Physically based snow albedo model", doi: "10.1029/2010JD015507" };

  it("repère une page portant le même DOI, sous n'importe quel slug", () => {
    const dups = findDuplicates({ meta: META, slug: "articles/aoki-2011-x" }, (args) => (
      args[1] === META.doi ? "[0.91] papers/aoki-2011 -- Physically based snow albedo\n" : ""
    ));
    expect(dups).toEqual([
      { slug: "papers/aoki-2011", snippet: "Physically based snow albedo", why: "doi" },
    ]);
  });

  it("repère un titre très proche et ignore un résultat sans rapport", () => {
    const dups = findDuplicates({ meta: { title: META.title }, slug: "articles/neuf" }, () => [
      "[0.62] papers/aoki-snow-albedo-model -- physically based snow albedo model",
      "[0.41] notes/reunion-mardi -- compte rendu de la réunion",
    ].join("\n"));
    expect(dups.map((d) => d.slug)).toEqual(["papers/aoki-snow-albedo-model"]);
    expect(dups[0].why).toBe("titre");
  });

  it("n'accuse jamais le slug visé lui-même", () => {
    const dups = findDuplicates({ meta: META, slug: "papers/aoki-2011" }, () => (
      "[0.91] papers/aoki-2011 -- Physically based snow albedo model\n"
    ));
    expect(dups).toEqual([]);
  });

  it("reste muet quand le corpus est injoignable", () => {
    const dups = findDuplicates({ meta: META, slug: "articles/x" }, () => {
      throw new Error("gbrain : délai dépassé (NAS injoignable ?)");
    });
    expect(dups).toEqual([]);
  });

  it("ne cherche pas sur un titre trop court pour être distinctif", () => {
    const queries = [];
    findDuplicates({ meta: { title: "Notes" }, slug: "articles/x" }, (args) => {
      queries.push(args[1]);
      return "";
    });
    expect(queries).toEqual([]);
  });
});

describe("import et écriture", () => {
  async function importFixture(dir, { runGbrain = () => "Error [page_not_found]: nope" } = {}) {
    const path = fakePdf(dir);
    return importArticle({ path, dir }, {
      resolveArticleMeta: async ({ guessed }) => ({ meta: guessed, source: "texte" }),
      mineru: { script: null, reason: null },
      extractPdf: () => ({ pages: [{ page: 1, text: ARTICLE }], cached: false }),
      runGbrain,
    });
  }

  it("prépare une fiche sans rien écrire dans le corpus", async () => {
    const dir = fixtureDir();
    const calls = [];
    const out = await importFixture(dir, {
      runGbrain: (args) => { calls.push(args); return "Error [page_not_found]: nope"; },
    });
    // sonde d'existence + recherche de doublons, mais RIEN qui écrive
    expect(calls.every(([cmd]) => cmd === "get" || cmd === "search")).toBe(true);
    expect(out.exists).toBe(false);
    expect(out.slug).toBe("articles/aoki-2011-physically-snow-albedo-model");
    expect(out.meta.doi).toBe("10.1029/2010JD015507");
    expect(out.preview).toContain("type: article");
    expect(readDraft(dir, out.draftId)).toContain("snow albedo model");
  });

  it("signale un slug déjà pris", async () => {
    const dir = fixtureDir();
    const out = await importFixture(dir, { runGbrain: () => "---\ntitle: déjà là\n---\n" });
    expect(out.exists).toBe(true);
  });

  it("n'échoue pas quand gbrain est injoignable", async () => {
    const dir = fixtureDir();
    const out = await importFixture(dir, {
      runGbrain: () => { throw new Error("gbrain : délai dépassé (NAS injoignable ?)"); },
    });
    expect(out.ok).toBe(true);
    expect(out.warning).toMatch(/NAS injoignable/);
  });

  it("écrit la page avec les métadonnées corrigées puis efface le brouillon", async () => {
    const dir = fixtureDir();
    const imported = await importFixture(dir);
    const puts = [];
    const out = writeArticle({
      draftId: imported.draftId,
      slug: "articles/aoki-2011-snow-albedo-model",
      meta: { ...imported.meta, title: "Titre corrigé à la main", year: 2011 },
      origin: imported.path,
      converter: "local",
      dir,
    }, {
      runGbrain: (args, opts) => {
        if (args[0] === "put") { puts.push({ args, input: opts?.input }); return "ok"; }
        return "Error [page_not_found]: nope";
      },
    });
    expect(out).toMatchObject({ ok: true, written: true, updated: false, slug: "articles/aoki-2011-snow-albedo-model" });
    expect(puts).toHaveLength(1);
    expect(puts[0].input).toContain('title: "Titre corrigé à la main"');
    expect(() => readDraft(dir, imported.draftId)).toThrow(/expiré/);
  });

  it("rapporte un remplacement quand la page existait", async () => {
    const dir = fixtureDir();
    const imported = await importFixture(dir);
    const out = writeArticle({ draftId: imported.draftId, slug: "articles/x", dir }, {
      runGbrain: (args) => (args[0] === "put" ? "ok" : "---\ntitle: déjà là\n---"),
    });
    expect(out.updated).toBe(true);
  });

  it("refuse un slug invalide avant tout appel gbrain", async () => {
    const dir = fixtureDir();
    const imported = await importFixture(dir);
    expect(() => writeArticle({ draftId: imported.draftId, slug: "articles/ un espace", dir }, {
      runGbrain: () => { throw new Error("gbrain ne devrait pas être appelé"); },
    })).toThrow(/Slug invalide/);
  });

  it("propage l'échec de gbrain put", async () => {
    const dir = fixtureDir();
    const imported = await importFixture(dir);
    expect(() => writeArticle({ draftId: imported.draftId, slug: "articles/x", dir }, {
      runGbrain: (args) => (args[0] === "put" ? "Error [write_failed]: disque plein" : ""),
    })).toThrow(/write_failed/);
  });

  it("copie vers ragdoc sans bloquer sur l'indexation", async () => {
    const dir = fixtureDir();
    const imported = await importFixture(dir);
    const cmds = [];
    const out = writeArticle({
      draftId: imported.draftId, slug: "articles/x", meta: imported.meta, ragdoc: true, dir,
    }, {
      runGbrain: (args) => (args[0] === "put" ? "ok" : "Error [page_not_found]: nope"),
      spawn: (bin, args, opts) => { cmds.push({ bin, args, input: opts?.input }); return { status: 0, stdout: "", stderr: "" }; },
    });
    expect(out.ragdoc).toMatchObject({ ok: true, file: "Aoki_2011_Physically_Snow_Albedo_Model.md", indexing: true });
    expect(cmds[0].args[1]).toContain("articles_markdown/Aoki_2011_Physically_Snow_Albedo_Model.md");
    expect(cmds[0].input).toContain("type: article");
    expect(cmds[1].args[1]).toContain("index_incremental.py");
    expect(cmds[1].args[1]).toContain("nohup");
  });

  it("garde la page gbrain même si ragdoc échoue", async () => {
    const dir = fixtureDir();
    const imported = await importFixture(dir);
    const out = writeArticle({ draftId: imported.draftId, slug: "articles/x", ragdoc: true, dir }, {
      runGbrain: (args) => (args[0] === "put" ? "ok" : "Error [page_not_found]: nope"),
      spawn: () => ({ status: 255, stdout: "", stderr: "ssh: connect: Host is down" }),
    });
    expect(out.written).toBe(true);
    expect(out.ragdoc).toMatchObject({ ok: false });
    expect(out.ragdoc.message).toMatch(/Host is down/);
  });

  it("assainit le nom de fichier envoyé au NAS", () => {
    const cmds = [];
    copyToRagdoc("../../etc/passwd", "corps", {
      spawn: (bin, args) => { cmds.push(args); return { status: 0 }; },
    });
    expect(cmds[0][1]).toContain("articles_markdown/.._.._etc_passwd.md");
  });
});

describe("CLI", () => {
  it("expose article-import et article-write", async () => {
    const dir = fixtureDir();
    const path = fakePdf(dir);
    const imported = await runKbCommand(["article-import", "--path", path, "--dir", dir], {
      mineru: { script: null, reason: null },
      extractPdf: () => ({ pages: [{ page: 1, text: ARTICLE }], cached: false }),
      runGbrain: () => "Error [page_not_found]: nope",
    });
    expect(imported.ok).toBe(true);
    const written = await runKbCommand([
      "article-write", "--draft", imported.draftId, "--slug", "articles/aoki-2011-test",
      "--title", "Titre CLI", "--authors", "Aoki, T.", "--year", "2011", "--dir", dir,
    ], {
      runGbrain: (args, opts) => {
        if (args[0] === "put") { writeFileSync(join(dir, "put.md"), opts?.input ?? ""); return "ok"; }
        return "Error [page_not_found]: nope";
      },
    });
    expect(written).toMatchObject({ ok: true, slug: "articles/aoki-2011-test", updated: false });
    expect(readFileSync(join(dir, "put.md"), "utf8")).toContain('title: "Titre CLI"');
  });

  it("exige un brouillon pour écrire", async () => {
    await expect(runKbCommand(["article-write", "--slug", "articles/x"], {}))
      .rejects.toThrow(/--draft/);
  });
});
