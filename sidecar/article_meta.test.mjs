// Métadonnées d'article : Zotero → Crossref → texte deviné.
import { describe, expect, it } from "vitest";
import {
  crossrefMeta, resolveArticleMeta, zoteroMeta, zoteroStorageRef,
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
    });
    expect(out.source).toBe("texte");
    expect(out.meta).toEqual(GUESSED);
  });

  it("ne remplace jamais un champ rempli par un champ vide", async () => {
    const out = await resolveArticleMeta({ path: "/tmp/a.pdf", guessed: GUESSED }, {
      zoteroMeta: () => null,
      crossrefMeta: async () => ({ title: "Titre Crossref", authors: "", journal: "", year: null, doi: "" }),
    });
    expect(out.meta.year).toBe(2022);
    expect(out.meta.journal).toBe(GUESSED.journal);
  });
});
