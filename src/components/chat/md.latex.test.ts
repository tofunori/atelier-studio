import { describe, expect, it } from "vitest";
import { highlightCode } from "./md";

// La grammaire latex de highlight.js ne balise que trois choses : les
// commandes (hljs-keyword), les délimiteurs math (hljs-built_in) et les
// commentaires (hljs-comment). Les accolades et les noms d'environnements
// sortent en texte nu — une post-passe les balise pour retrouver la palette
// de l'éditeur LaTeX (gallery/assets/latex_studio.css).

describe("coloration latex : post-passe accolades/environnements", () => {
  it("dore les accolades d'un argument de commande", () => {
    const html = highlightCode("\\citep{GelmanHill2007,Rounce2020JOG}", "latex");
    expect(html).toContain('<span class="hljs-keyword">\\citep</span>');
    expect(html).toContain('<span class="hljs-tex-brace">{</span>GelmanHill2007,Rounce2020JOG<span class="hljs-tex-brace">}</span>');
  });

  it("colore le nom d'environnement après \\begin et \\end", () => {
    const html = highlightCode("\\begin{equation}\nx\n\\end{equation}", "latex");
    const envs = [...html.matchAll(/<span class="hljs-tex-env">equation<\/span>/g)];
    expect(envs).toHaveLength(2);
  });

  it("ne colore pas en environnement l'argument d'une commande ordinaire", () => {
    const html = highlightCode("\\textbf{equation}", "latex");
    expect(html).not.toContain("hljs-tex-env");
  });

  it("dore aussi les crochets d'argument optionnel", () => {
    const html = highlightCode("\\documentclass[11pt]{article}", "latex");
    expect(html).toContain('<span class="hljs-tex-brace">[</span>');
    expect(html).toContain('<span class="hljs-tex-brace">]</span>');
  });

  it("laisse intactes les accolades déjà à l'intérieur d'un jeton hljs", () => {
    const html = highlightCode("% note {x} de service", "latex");
    expect(html).toContain('<span class="hljs-comment">% note {x} de service</span>');
    expect(html).not.toContain("hljs-tex-brace");
  });

  it("n'insère jamais de balise dans un attribut de span", () => {
    const html = highlightCode("\\frac{1}{2} $k^2$", "latex");
    expect(html).not.toMatch(/<span class="[^"]*<span/);
    const open = [...html.matchAll(/<span\b/g)].length;
    const close = [...html.matchAll(/<\/span>/g)].length;
    expect(open).toBe(close);
  });

  it("préserve le texte source une fois les balises retirées", () => {
    const src = "Bayesian model~\\citep{A,B}.\n\\begin{equation} % zone\n  \\alpha = $k^2$\n\\end{equation}";
    const html = highlightCode(src, "latex");
    const stripped = html.replace(/<\/?span[^>]*>/g, "");
    expect(stripped).toBe(src);
  });

  it("s'applique aux alias de latex (bib, sty, tex)", () => {
    expect(highlightCode("\\begin{equation}", "tex")).toContain("hljs-tex-env");
  });

  it("laisse les autres langages intacts", () => {
    const html = highlightCode('{"a": 1}', "json");
    expect(html).not.toContain("hljs-tex-brace");
  });
});
