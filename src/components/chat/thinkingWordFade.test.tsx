// Fade par mots de la pensée EN DIRECT : ThinkingProse fade enveloppe chaque
// mot dans <span class="sw"> (même contrat que rehypeWordFade côté réponse),
// sans toucher au texte lu ni au rendu des blocs terminés.
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ThinkingProse } from "./turnParts";

describe("ThinkingProse — fade par mots", () => {
  it("sans fade : aucun span de mot (blocs terminés, rendu inchangé)", () => {
    const { container } = render(<ThinkingProse text={"Je vérifie d'abord."} />);
    expect(container.querySelectorAll("span.sw")).toHaveLength(0);
    expect(container.textContent).toBe("Je vérifie d'abord.");
  });

  it("avec fade : un span par mot, blancs et texte préservés", () => {
    const { container } = render(<ThinkingProse fade text={"Je vérifie d'abord."} />);
    const mots = [...container.querySelectorAll("span.sw")].map((n) => n.textContent);
    expect(mots).toEqual(["Je", "vérifie", "d'abord."]);
    expect(container.textContent).toBe("Je vérifie d'abord.");
  });

  it("le gras et le code inline restent hors du découpage", () => {
    const { container } = render(<ThinkingProse fade text={"un **mot gras** et `du code` ici"} />);
    expect(container.querySelector("strong")?.textContent).toBe("mot gras");
    expect(container.querySelector("code")?.textContent).toBe("du code");
    expect(container.textContent).toBe("un mot gras et du code ici");
  });

  it("les puces gardent leur marqueur en colonne", () => {
    const { container } = render(<ThinkingProse fade text={"- premier point"} />);
    expect(container.querySelector(".thinking-marker")?.textContent).toBe("-");
    const mots = [...container.querySelectorAll(".thinking-item-body span.sw")].map((n) => n.textContent);
    expect(mots).toEqual(["premier", "point"]);
  });
});
