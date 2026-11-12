import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ReactMarkdown from "react-markdown";
import RevisionBlock from "./RevisionBlock";
import { MD_COMPONENTS } from "./md";

afterEach(cleanup);

const SOURCE = "--- avant\nthe reanalysis and MODIS aerosol optical depth (Methods). Our data are not complete; they omit dust \\citep{Menounos2025}. These omissions likely bias the fire slope low.\n+++ après\nthe reanalysis and the share of MODIS observations flagged as high aerosol (Methods). Our data are nevertheless not complete; they omit dust \\citep{Menounos2025}. Where these components follow the carbon in our data, the fire slope includes their darkening.";

describe("RevisionBlock", () => {
  it("souligne le nouveau, barre le retiré, sans gras", () => {
    const { container } = render(<RevisionBlock source={SOURCE} />);
    const added = [...container.querySelectorAll("ins.md-revision-add")].map(n => n.textContent);
    const removed = [...container.querySelectorAll("del.md-revision-del")].map(n => n.textContent);
    expect(added.join(" ")).toContain("share of");
    expect(removed.join(" ")).toContain("aerosol optical depth");
    expect(container.querySelector("b, strong")).toBeNull();
    expect(container.querySelector(".md-revision-cite")?.textContent).toBe("(Menounos, 2025)");
    // le compte n'est plus affiché : il reste dans le nom du bloc
    expect(container.querySelector(".md-revision-meta")).toBeNull();
    expect(container.querySelector(".md-revision")?.getAttribute("aria-label")).toMatch(/3 (changements|changes) · 2 (retraits|removals)$/);
    // « ancien nouveau » : une espace entre le barré et le souligné
    expect(container.querySelector(".md-revision-text")?.textContent).toContain("optical depth the share of");
  });

  it("un bloc ```revision du markdown se rend en passage révisé", async () => {
    const { container } = render(<ReactMarkdown components={MD_COMPONENTS}>{"```revision\n" + SOURCE + "\n```"}</ReactMarkdown>);
    await waitFor(() => expect(container.querySelector(".md-revision")).not.toBeNull());
    expect(container.querySelector(".codeblock")).toBeNull();
  });

  it("la suite de la ligne d'ouverture donne la provenance du passage", async () => {
    const { container } = render(<ReactMarkdown components={MD_COMPONENTS}>{"```revision revCK.docx · p. 20\n" + SOURCE + "\n```"}</ReactMarkdown>);
    await waitFor(() => expect(container.querySelector(".md-revision")).not.toBeNull());
    expect(container.querySelector(".md-revision")?.classList.contains("has-place")).toBe(true);
    expect(container.querySelector(".md-revision-place")?.textContent).toBe("revCK.docx · p. 20");
  });

  it("sans provenance, l'en-tête ne garde que copier", () => {
    const { container } = render(<RevisionBlock source={SOURCE} />);
    expect(container.querySelector(".md-revision")?.classList.contains("has-place")).toBe(false);
    expect(container.querySelector(".md-revision-place")?.textContent).toBe("");
    expect(container.querySelector(".md-revision-copy")).not.toBeNull();
  });
});
