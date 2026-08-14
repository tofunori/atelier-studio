import { describe, expect, it } from "vitest";
import { csvDigest, parseRows, sniffDelimiter, splitLine } from "./csv_digest.mjs";

describe("séparateur", () => {
  it("préfère celui qui découpe régulièrement", () => {
    expect(sniffDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(sniffDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(sniffDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
  });

  it("ne se laisse pas prendre par de la prose pleine de virgules", () => {
    const raw = "titre;note\nGlacier;Une phrase, avec, beaucoup, de, virgules\nAutre;Encore, une, autre";
    expect(sniffDelimiter(raw)).toBe(";");
  });
});

describe("découpage", () => {
  it("respecte les guillemets et les doubles guillemets", () => {
    expect(splitLine('a,"b,c",d', ",")).toEqual(["a", "b,c", "d"]);
    expect(splitLine('a,"il a dit ""oui""",b', ",")).toEqual(["a", 'il a dit "oui"', "b"]);
  });

  it("recolle un champ qui contient un retour à la ligne", () => {
    const rows = parseRows('a,b\n"ligne\nsuivante",2', ",");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(["ligne\nsuivante", "2"]);
  });
});

describe("csvDigest", () => {
  const petit = "region,annee,albedo\n01,2002,0.42\n02,2003,0.55\n";

  it("rend un petit tableau tel quel — rien à résumer", () => {
    const out = csvDigest(petit, { name: "albedo.csv" });
    expect(out).toContain("albedo.csv — 2 lignes × 3 colonnes (séparateur : virgule)");
    expect(out).toContain("01,2002,0.42");
    expect(out).toContain("```csv");
  });

  it("profile un gros tableau au lieu de le déverser", () => {
    const lignes = Array.from({ length: 400 }, (_, i) =>
      `0${(i % 2) + 1},${2002 + (i % 22)},${(0.3 + (i % 50) / 200).toFixed(3)},${i % 7 ? "ok" : ""}`);
    const raw = `region,annee,albedo,statut\n${lignes.join("\n")}\n`;
    const out = csvDigest(raw, { name: "gros.csv", fullMax: 500 });

    expect(out).toContain("gros.csv — 400 lignes × 4 colonnes");
    expect(out).toContain("## Colonnes");
    // le type et l'étendue sont dits, pas devinés par le lecteur
    expect(out).toMatch(/albedo \| nombre \| complète \| 0\.3 → /);
    expect(out).toMatch(/annee \| nombre \| complète \| 2002 → 2023/);
    // les trous sont comptés
    expect(out).toMatch(/statut \| texte \| \d+ vides/);
    // et surtout : la troncature est avouée
    expect(out).toContain("des 400 lignes sont montrées");
    expect(out).not.toContain("```csv");
  });

  it("repère une colonne de dates et son étendue", () => {
    const lignes = Array.from({ length: 200 }, (_, i) => `2020-0${(i % 9) + 1}-15,${i}`);
    const out = csvDigest(`date,valeur\n${lignes.join("\n")}`, { fullMax: 100 });
    expect(out).toMatch(/date \| date \| complète \| 2020-01-15 → 2020-09-15/);
  });

  it("refuse un fichier vide plutôt que de créer une source creuse", () => {
    expect(() => csvDigest("   ")).toThrow(/vide/);
  });
});
