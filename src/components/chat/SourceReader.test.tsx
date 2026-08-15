// Lecteur d'une page du dépôt : ce qu'il demande, ce qu'il montre, et surtout
// ce qu'il n'écrit pas.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import SourceReader from "./SourceReader";
import { renderUi, resetTestState } from "../../test/render";
import { setLanguage } from "../../lib/i18n";

const envoyes: unknown[] = [];
vi.mock("../../lib/wsBus", () => ({
  wsSend: (msg: unknown) => { envoyes.push(msg); return true; },
}));

const PAGE = `---
type: article
title: >-
  Narrowband-to-broadband albedo conversion for glacier ice and snow: equations
  based on modeling and ranges of validity of the equations
year: 2003
doi: 10.1016/j.rse.2003.10.010
origin: >-
  /Users/tofunori/Downloads/Articles_scientifiques/1-s2.0-S003442570300275X-main.pdf
authors:
  - 'Wouter Greuell, Johannes Oerlemans'
converter: mineru
---

## 1. Introduction

The surface albedo is the fraction of the incident solar radiative flux.

<table><tr><td>Study</td><td>RCP2.6</td></tr><tr><td>This study</td><td>90±36</td></tr></table>
`;

function repond(slug: string, extra: Record<string, unknown> = {}) {
  act(() => {
    window.dispatchEvent(new CustomEvent("gbrain-page", {
      detail: { slug, markdown: PAGE, chars: PAGE.length, ...extra },
    }));
  });
}

beforeEach(() => { resetTestState(); setLanguage("fr"); envoyes.length = 0; });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("SourceReader — page du dépôt", () => {
  const SLUG = "articles/greuell-2003-narrowband-broadband-albedo-conversion";
  const props = () => ({
    target: { kind: "gbrain" as const, slug: SLUG },
    onClose: vi.fn(),
    onPin: vi.fn(),
  });

  it("demande la page au montage, sans rien écrire dans la base", () => {
    renderUi(<SourceReader {...props()} />);
    expect(envoyes).toEqual([{ type: "kbGbrainPage", slug: SLUG }]);
    // aucun kbAdd : lire n'épingle pas
    expect(envoyes.some((m) => (m as { type: string }).type === "kbAdd")).toBe(false);
  });

  it("transforme le front matter en fiche au lieu de l'afficher en YAML", () => {
    const p = props();
    renderUi(<SourceReader {...p} />);
    repond(SLUG);
    expect(screen.getByText(/Narrowband-to-broadband albedo conversion/)).toBeTruthy();
    expect(screen.getByText("Wouter Greuell, Johannes Oerlemans")).toBeTruthy();
    expect(screen.getByText("2003")).toBeTruthy();
    expect(screen.getByText(/converti par mineru/)).toBeTruthy();
    // le corps ne commence pas par de la plomberie
    expect(screen.queryByText(/^type: article/)).toBeNull();
  });

  it("rend le tableau HTML de MinerU comme un vrai tableau", () => {
    const p = props();
    const { container } = renderUi(<SourceReader {...p} />);
    repond(SLUG);
    const table = container.querySelector(".gbr-md table");
    expect(table).toBeTruthy();
    expect(table?.textContent).toContain("90±36");
    // et surtout : pas de balises à l'écran
    expect(container.textContent).not.toContain("<td>");
  });

  it("bascule vers la source, qui montre le markdown brut", () => {
    const p = props();
    const { container } = renderUi(<SourceReader {...p} />);
    repond(SLUG);
    fireEvent.click(screen.getByRole("tab", { name: "Source" }));
    const src = container.querySelector(".gbr-src");
    expect(src?.textContent).toContain("type: article");
    expect(src?.textContent).toContain("<table>");
    expect(container.querySelector(".gbr-md")).toBeNull();
  });

  it("ignore une réponse qui concerne une autre page", () => {
    const p = props();
    renderUi(<SourceReader {...p} />);
    repond("articles/quelqu-un-d-autre");
    expect(screen.getByText("Lecture de la page…")).toBeTruthy();
  });

  it("dit l'échec au lieu de rester sur un écran vide", () => {
    const p = props();
    renderUi(<SourceReader {...p} />);
    act(() => {
      window.dispatchEvent(new CustomEvent("gbrain-page", {
        detail: { slug: SLUG, markdown: "", error: "Page gbrain introuvable" },
      }));
    });
    expect(screen.getByText("Page gbrain introuvable")).toBeTruthy();
  });

  it("épingle et revient au dépôt sur demande explicite", () => {
    const p = props();
    renderUi(<SourceReader {...p} />);
    repond(SLUG);
    fireEvent.click(screen.getByText("Épingler"));
    expect(p.onPin).toHaveBeenCalledWith(SLUG);
    fireEvent.click(screen.getByText("Dépôt"));
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });
});

describe("SourceReader — source de la base", () => {
  const ID = "cc54233a";
  const props = (over = {}) => ({
    target: { kind: "source" as const, id: ID },
    onClose: vi.fn(),
    onToggleFull: vi.fn(),
    full: false,
    ...over,
  });

  const CSV = `lexique_syntaxe.csv — 1188 lignes × 5 colonnes (séparateur : virgule)

## Colonnes

| colonne | type | remplissage | étendue / valeurs |
| --- | --- | --- | --- |
| frequence | nombre | complète | 1 → 9 (moy. 1.399) |
`;

  function repondSource(detail: Record<string, unknown>) {
    act(() => {
      window.dispatchEvent(new CustomEvent("source-text", { detail: { id: ID, ...detail } }));
    });
  }

  it("demande le texte stocké, pas le fichier — et n'attache rien", () => {
    renderUi(<SourceReader {...props()} />);
    expect(envoyes).toEqual([{ type: "kbSourceText", id: ID }]);
    expect(envoyes.some((m) => (m as { type: string }).type === "kbAdd")).toBe(false);
  });

  it("montre le profil du CSV — ce qui entre vraiment dans le contexte", () => {
    const { container } = renderUi(<SourceReader {...props()} />);
    repondSource({ kind: "file", title: "lexique_syntaxe.csv", chars: 2223, text: CSV });
    expect(screen.getByText("lexique_syntaxe.csv")).toBeTruthy();
    // le compte est dit en clair : 68 ko sur disque, 2 223 car. ici
    expect(screen.getByText("2 223")).toBeTruthy();
    expect(container.querySelector(".gbr-md table")?.textContent).toContain("1 → 9");
  });

  it("un dossier se parcourt par ses fichiers, pas en bloc collé", () => {
    const { container } = renderUi(<SourceReader {...props()} />);
    repondSource({
      kind: "folder", title: "manuscript_ch1", chars: 103094,
      files: [{ rel: "CEE_RULES.md", chars: 13290 }, { rel: "discussion_en.tex", chars: 1730 }],
    });
    expect(container.querySelectorAll(".gbr-file").length).toBe(2);
    expect(screen.getByText("CEE_RULES.md")).toBeTruthy();
    expect(screen.getByText("13 290 car.")).toBeTruthy();
    // rien à basculer : un dossier n'a pas de « source » à montrer
    expect(screen.queryByRole("tab", { name: "Source" })).toBeNull();
  });

  it("règle le contenu complet depuis la lecture", () => {
    const p = props();
    renderUi(<SourceReader {...p} />);
    repondSource({ kind: "file", title: "lexique_syntaxe.csv", chars: 2223, text: CSV });
    fireEvent.click(screen.getByText("Contenu complet"));
    expect(p.onToggleFull).toHaveBeenCalledWith(ID);
  });

  it("ignore la réponse d'une autre source", () => {
    renderUi(<SourceReader {...props()} />);
    act(() => {
      window.dispatchEvent(new CustomEvent("source-text", {
        detail: { id: "quelqu-un-d-autre", text: "pas moi" },
      }));
    });
    expect(screen.getByText("Lecture de la page…")).toBeTruthy();
  });
});
