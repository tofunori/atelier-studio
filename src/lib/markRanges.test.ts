import { describe, expect, it } from "vitest";
import { findTextRanges } from "./markRanges";
import katex from "katex";

function root(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  document.body.append(el);
  return el;
}

describe("findTextRanges", () => {
  it("trouve un passage contenu dans un seul nœud texte", () => {
    const r = findTextRanges(root("<p>les tuiles MOD10A1 sont exportées</p>"), "tuiles MOD10A1");
    expect(r).toHaveLength(1);
    expect(r[0].toString()).toBe("tuiles MOD10A1");
  });

  it("trouve un passage qui traverse du gras", () => {
    const r = findTextRanges(root("<p>la fraction <b>glaciaire</b> dynamique</p>"), "fraction glaciaire dynamique");
    expect(r).toHaveLength(1);
    expect(r[0].toString()).toBe("fraction glaciaire dynamique");
  });

  it("trouve un passage qui traverse deux paragraphes", () => {
    const r = findTextRanges(root("<p>seuil habituel</p><p>et la base</p>"), "seuil habituel\net la base");
    expect(r).toHaveLength(1);
  });

  it("trouve chaque occurrence d'un passage répété", () => {
    const r = findTextRanges(root("<p>albédo</p><p>albédo</p>"), "albédo");
    expect(r).toHaveLength(2);
  });

  it("ne renvoie rien pour un passage absent", () => {
    expect(findTextRanges(root("<p>albédo</p>"), "glacier")).toHaveLength(0);
  });

  it("ne renvoie rien pour un passage vide", () => {
    expect(findTextRanges(root("<p>albédo</p>"), "")).toHaveLength(0);
  });
});

it("ignores annotation numbers when matching quoted text", () => {
  const host = root('<p>Version 1</p><button class="anno-badge">1</button>');
  const ranges = findTextRanges(host, "1");
  expect(ranges).toHaveLength(1);
  expect(ranges[0].endContainer.parentElement?.tagName).toBe("P");
});

it("finds saved WebKit selections crossing KaTeX without matching the hidden TeX source", () => {
  const host = root(`<p>Forcing below 0.65 W m ${katex.renderToString('^{-2}')}, although summers vary.</p>`);
  const ranges = findTextRanges(host, "Forcing below 0.65 W m \n−\n2\n−2\n , although summers vary.");
  expect(ranges).toHaveLength(1);
  expect(ranges[0].startContainer.textContent).toContain("Forcing below");
  expect(ranges[0].endContainer.textContent).toContain("although summers vary");
});

it("does not loosen ordinary word boundaries just because another paragraph contains math", () => {
  const host = root(`<p>some words here</p><p>${katex.renderToString('x')}</p>`);
  expect(findTextRanges(host, "somewords here")).toHaveLength(0);
  const withMath = root(`<p>cannot ${katex.renderToString('^{-2}')} vary</p>`);
  expect(findTextRanges(withMath, "can not − 2 −2 vary")).toHaveLength(0);
});
