// Lecteur d'une page du dépôt : ce qu'il demande, ce qu'il montre, et surtout
// ce qu'il n'écrit pas.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import GbrainReader from "./GbrainReader";
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

describe("GbrainReader", () => {
  const props = () => ({
    slug: "articles/greuell-2003-narrowband-broadband-albedo-conversion",
    onClose: vi.fn(),
    onPin: vi.fn(),
  });

  it("demande la page au montage, sans rien écrire dans la base", () => {
    renderUi(<GbrainReader {...props()} />);
    expect(envoyes).toEqual([{
      type: "kbGbrainPage",
      slug: "articles/greuell-2003-narrowband-broadband-albedo-conversion",
    }]);
    // aucun kbAdd : lire n'épingle pas
    expect(envoyes.some((m) => (m as { type: string }).type === "kbAdd")).toBe(false);
  });

  it("transforme le front matter en fiche au lieu de l'afficher en YAML", () => {
    const p = props();
    renderUi(<GbrainReader {...p} />);
    repond(p.slug);
    expect(screen.getByText(/Narrowband-to-broadband albedo conversion/)).toBeTruthy();
    expect(screen.getByText("Wouter Greuell, Johannes Oerlemans")).toBeTruthy();
    expect(screen.getByText("2003")).toBeTruthy();
    expect(screen.getByText(/converti par mineru/)).toBeTruthy();
    // le corps ne commence pas par de la plomberie
    expect(screen.queryByText(/^type: article/)).toBeNull();
  });

  it("rend le tableau HTML de MinerU comme un vrai tableau", () => {
    const p = props();
    const { container } = renderUi(<GbrainReader {...p} />);
    repond(p.slug);
    const table = container.querySelector(".gbr-md table");
    expect(table).toBeTruthy();
    expect(table?.textContent).toContain("90±36");
    // et surtout : pas de balises à l'écran
    expect(container.textContent).not.toContain("<td>");
  });

  it("bascule vers la source, qui montre le markdown brut", () => {
    const p = props();
    const { container } = renderUi(<GbrainReader {...p} />);
    repond(p.slug);
    fireEvent.click(screen.getByRole("tab", { name: "Source" }));
    const src = container.querySelector(".gbr-src");
    expect(src?.textContent).toContain("type: article");
    expect(src?.textContent).toContain("<table>");
    expect(container.querySelector(".gbr-md")).toBeNull();
  });

  it("ignore une réponse qui concerne une autre page", () => {
    const p = props();
    renderUi(<GbrainReader {...p} />);
    repond("articles/quelqu-un-d-autre");
    expect(screen.getByText("Lecture de la page…")).toBeTruthy();
  });

  it("dit l'échec au lieu de rester sur un écran vide", () => {
    const p = props();
    renderUi(<GbrainReader {...p} />);
    act(() => {
      window.dispatchEvent(new CustomEvent("gbrain-page", {
        detail: { slug: p.slug, markdown: "", error: "Page gbrain introuvable" },
      }));
    });
    expect(screen.getByText("Page gbrain introuvable")).toBeTruthy();
  });

  it("épingle et revient au dépôt sur demande explicite", () => {
    const p = props();
    renderUi(<GbrainReader {...p} />);
    repond(p.slug);
    fireEvent.click(screen.getByText("Épingler"));
    expect(p.onPin).toHaveBeenCalledWith(p.slug);
    fireEvent.click(screen.getByText("Dépôt"));
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });
});
