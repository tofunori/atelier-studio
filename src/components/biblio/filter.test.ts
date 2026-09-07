import { describe, expect, it } from "vitest";

import { filterItems, foldText, groupByYear, groupsForSort, matchesQuery, sortItems } from "./filter";
import type { ZoteroItem } from "./types";

function item(partial: Partial<ZoteroItem> & { key: string }): ZoteroItem {
  return {
    dateAdded: "", title: "", creators: "", year: "", publication: "",
    tags: [], hasPdf: false, pdfKey: null, pdfFile: null, citeKey: "", fav: false,
    ...partial,
  };
}

const corpus = [
  item({ key: "A", title: "Zèbres et névés", creators: "Émile Durand", year: "2001", publication: "Journal of Glaciology", dateAdded: "2024-01-01" }),
  item({ key: "B", title: "Albedo of ice", creators: "Ana Blanc", year: "2020", publication: "The Cryosphere", dateAdded: "2024-03-01" }),
  item({ key: "C", title: "Melt ponds", creators: "Zoé Arctique", year: "1998", publication: "Nature", dateAdded: "2024-02-01" }),
];

describe("tri de la bibliothèque", () => {
  it("added : le plus récemment ajouté d'abord", () => {
    expect(sortItems(corpus, "added").map((i) => i.key)).toEqual(["B", "C", "A"]);
  });
  it("year : année décroissante", () => {
    expect(sortItems(corpus, "year").map((i) => i.key)).toEqual(["B", "A", "C"]);
  });
  it("author : ordre alphabétique insensible à la casse et aux accents", () => {
    expect(sortItems(corpus, "author").map((i) => i.key)).toEqual(["B", "A", "C"]);
  });
  it("title : ordre alphabétique du titre", () => {
    expect(sortItems(corpus, "title").map((i) => i.key)).toEqual(["B", "C", "A"]);
  });
  it("ne mute pas la liste d'entrée", () => {
    const before = corpus.map((i) => i.key);
    sortItems(corpus, "title");
    expect(corpus.map((i) => i.key)).toEqual(before);
  });
});

describe("recherche locale", () => {
  it("replie casse et accents", () => {
    expect(foldText("Névé ÉTÉ")).toBe("neve ete");
  });
  it("« neves » retrouve « névés » sans aller-retour serveur", () => {
    expect(matchesQuery(corpus[0], "neves")).toBe(true);
    expect(matchesQuery(corpus[1], "neves")).toBe(false);
  });
  it("cherche aussi dans auteurs, année et revue", () => {
    expect(filterItems(corpus, "emile").map((i) => i.key)).toEqual(["A"]);
    expect(filterItems(corpus, "1998").map((i) => i.key)).toEqual(["C"]);
    expect(filterItems(corpus, "cryosphere").map((i) => i.key)).toEqual(["B"]);
  });
  it("tous les mots doivent apparaître (ET)", () => {
    expect(filterItems(corpus, "ice blanc").map((i) => i.key)).toEqual(["B"]);
    expect(filterItems(corpus, "ice durand")).toEqual([]);
  });
  it("une requête vide ne filtre rien", () => {
    expect(filterItems(corpus, "   ")).toHaveLength(3);
  });
});

describe("regroupement par année (surtitres de la liste)", () => {
  it("regroupe dans l'ordre de première apparition, sans réordonner", () => {
    const groups = groupByYear(sortItems(corpus, "year"));
    expect(groups.map((g) => [g.year, g.items.map((i) => i.key)])).toEqual([
      ["2020", ["B"]],
      ["2001", ["A"]],
      ["1998", ["C"]],
    ]);
  });

  it("rassemble deux éléments de la même année même s'ils ne se suivent pas", () => {
    const mixed = [
      item({ key: "X", year: "2020" }),
      item({ key: "Y", year: "1999" }),
      item({ key: "Z", year: "2020" }),
    ];
    expect(groupByYear(mixed).map((g) => [g.year, g.items.length])).toEqual([["2020", 2], ["1999", 1]]);
  });

  it("une référence sans année tombe dans le groupe vide", () => {
    expect(groupByYear([item({ key: "N", year: "" })])).toEqual([
      { year: "", items: [expect.objectContaining({ key: "N" })] },
    ]);
  });

  it("les surtitres n'existent QUE pour les tris par date/année", () => {
    for (const sort of ["year", "added"] as const) {
      expect(groupsForSort(corpus, sort).length).toBe(3);
    }
    for (const sort of ["title", "author"] as const) {
      const groups = groupsForSort(corpus, sort);
      expect(groups).toHaveLength(1);
      expect(groups[0].items).toHaveLength(3);
    }
  });
});
