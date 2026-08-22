import { describe, expect, it } from "vitest";
import { findTextRanges } from "./markRanges";

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
