import { describe, expect, it } from "vitest";
import {
  addAttachment, fileAttachment, folderAttachment, galleryFileContext, pastedTextAttachment,
  quoteAttachment, webExcerptAttachment, withZoteroDigest, zoteroAttachment, zoteroLabel,
} from "./composerAttachments";

describe("fileAttachment", () => {
  it("joint le chemin avec la consigne Read et une carte de survol", () => {
    expect(fileAttachment("src/App.tsx")).toEqual({
      name: "App.tsx",
      lines: null,
      path: "src/App.tsx",
      kind: "file",
      text: "Fichier joint (chemin local, lisible avec Read) : src/App.tsx",
      preview: { title: "App.tsx", rows: [{ label: "Type", value: "File" }, { label: "Path", value: "src/App.tsx" }] },
    });
  });

  it("sans carte pour la surface de lecture", () => {
    expect(fileAttachment("/Users/t/a.pdf", { preview: false })).not.toHaveProperty("preview");
  });
});

describe("folderAttachment", () => {
  it("liste les fichiers du dossier hors dossiers de build", () => {
    const a = folderAttachment("src/lib", ["src/lib/a.ts", "src/lib/dist/b.js", "src/libx/c.ts", "src/lib/b.ts"]);
    expect(a.name).toBe("lib/");
    expect(a.path).toBe("src/lib/");
    // le fichier sous dist/ compte comme omis sans être listé
    expect(a.lines).toBe("2 files, +1");
    expect(a.text).toContain("- src/lib/a.ts\n- src/lib/b.ts");
    expect(a.text).not.toContain("dist/b.js");
    expect(a.text).not.toContain("src/libx");
  });

  it("plafonne à 60 fichiers et annonce le reste", () => {
    const files = Array.from({ length: 65 }, (_, i) => `data/f${i}.csv`);
    const a = folderAttachment("data/", files);
    expect(a.lines).toBe("60 files, +5");
    expect(a.text).toContain("(premiers 60, 5 autres omis)");
    expect(a.preview?.rows[1]).toEqual({ label: "Files", value: "60 shown, 5 omitted" });
  });

  it("signale un dossier sans fichier indexé", () => {
    const a = folderAttachment("vide", []);
    expect(a.lines).toBe("empty");
    expect(a.text).toContain("Aucun fichier indexé dans ce dossier.");
  });
});

describe("références Zotero", () => {
  const item = { key: "ABCD", citeKey: "smith2024", title: "Albedo", year: "2024", creators: "Smith" };

  it("préfère la clé de citation, sinon la clé Zotero", () => {
    expect(zoteroLabel(item)).toBe("@smith2024");
    expect(zoteroLabel({ key: "ABCD" })).toBe("@ABCD");
  });

  it("montre « … » pour le digest tant que le serveur n'a pas répondu", () => {
    const a = zoteroAttachment(item);
    expect(a).toMatchObject({ name: "@smith2024", lines: "2024", kind: "zotero" });
    expect(a.text).toContain('citekey="smith2024"');
    expect(a.preview?.rows).toEqual([
      { label: "Citation", value: "@smith2024" },
      { label: "Authors", value: "Smith" },
      { label: "Year", value: "2024" },
      { label: "Digest", value: "…" },
    ]);
  });

  it("renseigne le digest de la seule référence visée", () => {
    const other = { name: "@smith2024", lines: null, text: "x" };
    const list = [zoteroAttachment(item), other];
    const next = withZoteroDigest(list, "@smith2024", "digest", true);
    expect(next[0].text).toBe("digest");
    expect(next[0].preview?.rows[3]).toEqual({ label: "Digest", value: "en cache" });
    expect(next[1]).toBe(other);
    expect(withZoteroDigest(list, "@smith2024", "d", false)[0].preview?.rows[3])
      .toEqual({ label: "Digest", value: "à générer par l'agent" });
  });
});

describe("texte collé et citations", () => {
  it("compte les lignes du texte collé", () => {
    expect(pastedTextAttachment("Texte collé", "a\nb\nc")).toEqual({ name: "Texte collé", lines: "3", kind: "paste", text: "a\nb\nc" });
  });

  it("cite chaque ligne et abrège le nom à 50 caractères", () => {
    const long = "x".repeat(60);
    expect(quoteAttachment(long).name).toBe(`« ${"x".repeat(50)}… »`);
    expect(quoteAttachment("un\ndeux").text).toBe("Citation de la conversation :\n> un\n> deux");
  });

  it("nomme l'extrait web par son hôte et joint la page entière telle quelle", () => {
    expect(webExcerptAttachment("a\nb", "https://nsidc.org/x")).toEqual({
      name: "nsidc.org", lines: null, text: "Extrait copié depuis https://nsidc.org/x :\n> a\n> b",
    });
    expect(webExcerptAttachment("page", "https://nsidc.org", "page").text).toBe("Source web ajoutée au contexte :\npage");
    expect(webExcerptAttachment("t", "pas une url").name).toBe("extrait web");
    expect(webExcerptAttachment("t").text).toBe("Extrait copié depuis une page web :\n> t");
  });

  it("ne duplique pas un contexte déjà joint", () => {
    const a = quoteAttachment("même");
    expect(addAttachment([a], quoteAttachment("même"))).toEqual([a]);
  });
});

describe("galleryFileContext", () => {
  it("joint le chemin absolu et une vignette servie par la galerie pour les images", () => {
    expect(galleryFileContext("/p", "figs/map.PNG", "http://127.0.0.1:4100/index.html")).toEqual({
      text: "/p/figs/map.PNG\nFichier joint depuis la galerie atelier — lis-le (outil Read) avant de répondre.",
      file: { path: "/p/figs/map.PNG", name: "map.PNG", previewUrl: "http://127.0.0.1:4100/figs/map.PNG" },
    });
  });

  it("sans vignette pour un fichier non image ou sans galerie", () => {
    expect(galleryFileContext("/p", "notes.md", "http://127.0.0.1:4100/").file.previewUrl).toBeUndefined();
    expect(galleryFileContext("/p", "a.png", null).file.previewUrl).toBeUndefined();
    expect(galleryFileContext("/p", "a.png", "::").file.previewUrl).toBeUndefined();
  });
});
