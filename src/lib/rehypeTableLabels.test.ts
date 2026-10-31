import { describe, expect, it } from "vitest";
import rehypeTableLabels from "./rehypeTableLabels";

const el = (tagName: string, children: any[] = [], properties: Record<string, unknown> = {}) =>
  ({ type: "element", tagName, properties, children });
const txt = (value: string) => ({ type: "text", value });

describe("rehypeTableLabels", () => {
  it("donne à chaque cellule l'en-tête de sa colonne et enveloppe les valeurs", () => {
    const table = el("table", [
      el("thead", [el("tr", [el("th", [txt("Méthode")]), el("th", [el("em", [txt("Source")]), txt(" (lue)")])])]),
      el("tbody", [el("tr", [el("td", [txt("Couche")]), el("td", [el("em", [txt("ACP")]), txt(", p. 5")])])]),
    ]);
    rehypeTableLabels()(el("root", [el("div", [table])]) as any);
    const [first, second] = (table.children[1] as any).children[0].children;
    expect(first.properties.dataLabel).toBe("Méthode");
    expect(first.children).toEqual([txt("Couche")]);
    expect(second.properties.dataLabel).toBe("Source (lue)");
    expect(second.children).toHaveLength(1);
    expect(second.children[0].tagName).toBe("span");
    expect(second.children[0].children).toHaveLength(2);
  });

  it("laisse intact un tableau sans en-têtes", () => {
    const td = el("td", [txt("x")]);
    const table = el("table", [el("thead", [el("tr", [el("th")])]), el("tbody", [el("tr", [td])])]);
    rehypeTableLabels()(table as any);
    expect(td.properties).toEqual({});
  });
});
