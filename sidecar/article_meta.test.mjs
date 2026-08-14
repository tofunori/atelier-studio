// Métadonnées d'article : Zotero → Crossref → texte deviné.
import { describe, expect, it } from "vitest";
import {
  crossrefByTitle, crossrefMeta, resolveArticleMeta, titleOverlap, zoteroMeta, zoteroStorageRef,
} from "./article_meta.mjs";

const GUESSED = {
  title: "published: 11 January 2022",
  authors: "",
  journal: "Geosciences, Plant Sciences (IBG-2), Jülich",
  doi: "10.3389/fenvs.2021.780814",
  year: 2022,
};

const CROSSREF_PAYLOAD = {
  message: {
    title: ["Bayesian Hierarchical Models can Infer Interpretable Predictions"],
    author: [
      { family: "Stojanović", given: "Olivera" },
      { family: "Siegmann", given: "Bastian" },
      { name: "MinerU Consortium" },
    ],
    "container-title": ["Frontiers in Environmental Science"],
    published: { "date-parts": [[2022, 1, 11]] },
    DOI: "10.3389/fenvs.2021.780814",
  },
};

describe("Zotero", () => {
  it("reconnaît une pièce jointe du stockage Zotero", () => {
    expect(zoteroStorageRef("/Users/t/Zotero/storage/8KQ2WXYZ/aoki-2011.pdf"))
      .toEqual({ key: "8KQ2WXYZ", file: "aoki-2011.pdf" });
    expect(zoteroStorageRef("/Users/t/Downloads/aoki.pdf")).toBeNull();
  });

  it("compose la notice depuis la base, auteurs dans l'ordre", () => {
    const queries = [];
    const meta = zoteroMeta("/Users/t/Zotero/storage/8KQ2WXYZ/aoki-2011.pdf", {
      zoteroDb: "/dev/null", // existe toujours : la lecture est simulée
      spawn: (_bin, args) => {
        queries.push(args[2]);
        const rows = args[2].includes("creators")
          ? [{ last: "Aoki", first: "T." }, { last: "Kuchiki", first: "K." }]
          : [
            { name: "title", value: "Physically based snow albedo model" },
            { name: "date", value: "2011-06-00 6/2011" },
            { name: "publicationTitle", value: "J. Geophys. Res. Atmos." },
            { name: "DOI", value: "10.1029/2010JD015507" },
          ];
        return { status: 0, stdout: JSON.stringify(rows), stderr: "" };
      },
    });
    expect(meta).toEqual({
      title: "Physically based snow albedo model",
      authors: "Aoki, T.; Kuchiki, K.",
      journal: "J. Geophys. Res. Atmos.",
      doi: "10.1029/2010JD015507",
      year: 2011,
    });
    // lecture seule, base jamais verrouillée
    expect(queries.every((q) => /^\s*select/i.test(q))).toBe(true);
  });

  it("ne rend rien quand la pièce jointe est inconnue", () => {
    const meta = zoteroMeta("/Users/t/Zotero/storage/ZZZZZZZZ/x.pdf", {
      zoteroDb: "/dev/null",
      spawn: () => ({ status: 0, stdout: "[]", stderr: "" }),
    });
    expect(meta).toBeNull();
  });

  it("survit à une base absente ou illisible", () => {
    expect(zoteroMeta("/Users/t/Zotero/storage/AAAAAAAA/x.pdf", {
      zoteroDb: "/chemin/inexistant.sqlite",
    })).toBeNull();
    expect(zoteroMeta("/Users/t/Zotero/storage/AAAAAAAA/x.pdf", {
      zoteroDb: "/dev/null",
      spawn: () => ({ status: 1, stderr: "database is locked" }),
    })).toBeNull();
  });
});

describe("Crossref", () => {
  it("normalise une notice", async () => {
    const meta = await crossrefMeta("10.3389/fenvs.2021.780814", {
      fetchJson: async () => CROSSREF_PAYLOAD,
    });
    expect(meta).toEqual({
      // le résumé sert à l'import par DOI (fiche de référence sans PDF)
      abstract: "",
      title: "Bayesian Hierarchical Models can Infer Interpretable Predictions",
      authors: "Stojanović, Olivera; Siegmann, Bastian; MinerU Consortium",
      journal: "Frontiers in Environmental Science",
      doi: "10.3389/fenvs.2021.780814",
      year: 2022,
    });
  });

  it("accepte un DOI collé en URL", async () => {
    const seen = [];
    await crossrefMeta("https://doi.org/10.1029/2010JD015507", {
      fetchJson: async (url) => { seen.push(url); return CROSSREF_PAYLOAD; },
    });
    expect(seen[0]).toContain("works/10.1029%2F2010JD015507");
  });

  it("refuse ce qui n'est pas un DOI, sans appel réseau", async () => {
    let called = false;
    const meta = await crossrefMeta("aoki-2011.pdf", {
      fetchJson: async () => { called = true; return CROSSREF_PAYLOAD; },
    });
    expect(meta).toBeNull();
    expect(called).toBe(false);
  });

  it("rend null hors ligne plutôt que d'échouer", async () => {
    const meta = await crossrefMeta("10.1/x", {
      fetchJson: async () => { throw new Error("ENOTFOUND api.crossref.org"); },
    });
    expect(meta).toBeNull();
  });
});

describe("Crossref par titre", () => {
  const TITRE = "Marginal or conditional regression models for correlated non-normal data";
  const work = (titre, familles) => ({
    DOI: "10.1111/2041-210X.12623",
    title: [titre],
    author: familles.map((family) => ({ family, given: "X." })),
    "container-title": ["Methods in Ecology and Evolution"],
    issued: { "date-parts": [[2016]] },
  });

  it("retient une notice dont le titre recouvre franchement", async () => {
    const out = await crossrefByTitle({ title: TITRE, authors: "Muff, S." }, {
      fetchJson: async () => ({ message: { items: [work(TITRE, ["Muff"])] } }),
    });
    expect(out.year).toBe(2016);
    expect(out.doi).toBe("10.1111/2041-210X.12623");
    expect(out.journal).toBe("Methods in Ecology and Evolution");
  });

  // Le cas qui compte : Crossref répond TOUJOURS. Une notice étrangère
  // acceptée est pire qu'une devinette — elle a l'air sûre.
  it("refuse une notice qui parle d'autre chose", async () => {
    const out = await crossrefByTitle({ title: TITRE, authors: "Muff, S." }, {
      fetchJson: async () => ({
        message: { items: [work("Generalized linear mixed models for ecologists", ["Bolker"])] },
      }),
    });
    expect(out).toBeNull();
  });

  it("refuse quand le premier auteur ne s'y retrouve pas", async () => {
    const out = await crossrefByTitle({ title: TITRE, authors: "Muff, S." }, {
      fetchJson: async () => ({ message: { items: [work(TITRE, ["Tremblay", "Gagnon"])] } }),
    });
    expect(out).toBeNull();
  });

  it("prend la bonne notice plus bas dans la liste", async () => {
    const out = await crossrefByTitle({ title: TITRE, authors: "" }, {
      fetchJson: async () => ({
        message: { items: [work("Something else entirely about birds", ["Autre"]), work(TITRE, ["Muff"])] },
      }),
    });
    expect(out?.title).toBe(TITRE);
  });

  it("ne touche pas au réseau pour un titre trop court", async () => {
    let appele = false;
    const out = await crossrefByTitle({ title: "Introduction" }, {
      fetchJson: async () => { appele = true; return {}; },
    });
    expect(out).toBeNull();
    expect(appele).toBe(false);
  });

  it("mesure le recouvrement en ignorant les mots outils", () => {
    expect(titleOverlap("The energy balance of a glacier", "Energy balance of the glacier")).toBe(1);
    expect(titleOverlap("Glacier albedo trends", "Bayesian inference in ecology")).toBe(0);
  });
});

describe("résolution", () => {
  it("préfère Zotero, la notice corrigée à la main", async () => {
    let crossrefCalled = false;
    const out = await resolveArticleMeta({ path: "/Zotero/storage/K/a.pdf", guessed: GUESSED }, {
      zoteroMeta: () => ({ title: "Titre Zotero", authors: "Aoki, T.", journal: "JGR", year: 2011, doi: "" }),
      crossrefMeta: async () => { crossrefCalled = true; return null; },
    });
    expect(out.source).toBe("zotero");
    expect(out.meta.title).toBe("Titre Zotero");
    // le DOI lu dans le PDF survit quand Zotero n'en a pas
    expect(out.meta.doi).toBe(GUESSED.doi);
    expect(crossrefCalled).toBe(false);
  });

  it("interroge Crossref par titre quand le PDF n'imprime pas son DOI", async () => {
    const out = await resolveArticleMeta({ path: "/tmp/a.pdf", guessed: { ...GUESSED, doi: "" } }, {
      zoteroMeta: () => null,
      crossrefMeta: async () => null,
      crossrefByTitle: async () => ({
        title: "Vrai titre", authors: "Muff, S.", journal: "MEE", year: 2016,
        doi: "10.1111/2041-210X.12623",
      }),
    });
    expect(out.source).toBe("crossref-titre");
    expect(out.meta.year).toBe(2016);
    // le DOI récupéré rend la détection de doublons à nouveau fiable
    expect(out.meta.doi).toBe("10.1111/2041-210X.12623");
  });

  it("passe à Crossref hors de Zotero", async () => {
    const out = await resolveArticleMeta({ path: "/tmp/a.pdf", guessed: GUESSED }, {
      zoteroMeta: () => null,
      crossrefMeta: async () => ({
        title: "Titre Crossref", authors: "Stojanović, Olivera",
        journal: "Frontiers in Environmental Science", year: 2022, doi: GUESSED.doi,
      }),
    });
    expect(out.source).toBe("crossref");
    expect(out.meta.title).toBe("Titre Crossref");
    expect(out.meta.journal).toBe("Frontiers in Environmental Science");
  });

  it("garde les devinettes quand aucune source ne répond", async () => {
    const out = await resolveArticleMeta({ path: "/tmp/a.pdf", guessed: GUESSED }, {
      zoteroMeta: () => null,
      crossrefMeta: async () => null,
      crossrefByTitle: async () => null,
    });
    expect(out.source).toBe("texte");
    expect(out.meta).toEqual(GUESSED);
  });

  it("ne remplace jamais un champ rempli par un champ vide", async () => {
    const out = await resolveArticleMeta({ path: "/tmp/a.pdf", guessed: GUESSED }, {
      zoteroMeta: () => null,
      crossrefByTitle: async () => null,
      crossrefMeta: async () => ({ title: "Titre Crossref", authors: "", journal: "", year: null, doi: "" }),
    });
    expect(out.meta.year).toBe(2022);
    expect(out.meta.journal).toBe(GUESSED.journal);
  });
});
