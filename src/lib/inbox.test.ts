import { describe, expect, it } from "vitest";
import { t } from "./i18n";
import { arrivalAttachments, arrivalFilesToOpen, arrivalOrigin, type InboxArrival } from "./inbox";

const base = { id: 1, receivedAtMs: 0 };

describe("arrivées du reste du Mac", () => {
  it("un fichier et un dossier du Finder deviennent deux pilules marquées de leur source", () => {
    const arrival: InboxArrival = {
      ...base, via: "service", sourceApp: "Finder", kind: "files", omitted: 0,
      entries: [
        { path: "/Users/t/GEO1063/TP2_Gagnon.docx", isDir: false },
        { path: "/Users/t/GEO1063/Rendus", isDir: true },
      ],
    };
    const [file, folder] = arrivalAttachments(arrival, { now: 1000 });
    expect(file).toMatchObject({
      name: "TP2_Gagnon.docx", kind: "file", path: "/Users/t/GEO1063/TP2_Gagnon.docx",
      origin: "Finder", arrivedAt: 1000,
    });
    expect(folder).toMatchObject({ name: "Rendus/", kind: "folder", path: "/Users/t/GEO1063/Rendus/", origin: "Finder" });
    expect(folder.text).toContain("Dossier joint comme contexte : /Users/t/GEO1063/Rendus/");
    // « Envoyer à » joint, n'ouvre rien
    expect(arrivalFilesToOpen(arrival)).toEqual([]);
  });

  it("« Ouvrir avec » ouvre les fichiers et ne joint que ce qui n'a pas été ouvert", () => {
    const arrival: InboxArrival = {
      ...base, via: "open", sourceApp: null, kind: "files", omitted: 0,
      entries: [{ path: "/a/rapport.pdf", isDir: false }, { path: "/a/Données", isDir: true }],
    };
    const toOpen = arrivalFilesToOpen(arrival);
    expect(toOpen).toEqual(["/a/rapport.pdf"]);
    const pills = arrivalAttachments(arrival, { skipPaths: new Set(toOpen) });
    expect(pills.map((pill) => pill.name)).toEqual(["Données/"]);
    expect(arrivalOrigin(arrival)).toBe(t("inbox.via-open"));
  });

  it("le texte sélectionné arrive en citation, avec sa source et sa troncature", () => {
    const arrival: InboxArrival = {
      ...base, via: "service", sourceApp: "Safari", kind: "text",
      text: "The darkening is concentrated in late summer,\nwhen wildfire smoke deposits black carbon.",
      truncated: true, title: null,
    };
    const [pill] = arrivalAttachments(arrival);
    expect(pill.kind).toBe("quote");
    expect(pill.origin).toBe("Safari");
    expect(pill.name).toBe("« The darkening is concentrated in late summer, when… »");
    expect(pill.text).toBe([
      "Texte envoyé depuis Safari :",
      "> The darkening is concentrated in late summer,",
      "> when wildfire smoke deposits black carbon.",
      "(texte tronqué à la réception)",
    ].join("\n"));
  });

  it("un lien atelier:// donne une pilule de page web", () => {
    const arrival: InboxArrival = {
      ...base, via: "link", sourceApp: null, kind: "link",
      url: "https://tc.copernicus.org/articles/19/2207/2025", title: null,
    };
    const [pill] = arrivalAttachments(arrival);
    expect(pill).toMatchObject({ name: "tc.copernicus.org", kind: "link", origin: t("inbox.via-link") });
    expect(pill.text).toContain("https://tc.copernicus.org/articles/19/2207/2025");
  });
});
