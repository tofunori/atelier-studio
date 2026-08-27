import { describe, expect, it } from "vitest";
import { isTrustedAtelierMessage, withAtelierToken } from "./ipc";

// isTrustedAtelierMessage garde le postMessage galerie→app : origine loopback
// dans la plage de ports atelier, nonce exact, payload borné aux clés connues.
function msg(origin: string, data: unknown): MessageEvent<unknown> {
  return { origin, data } as MessageEvent<unknown>;
}

describe("isTrustedAtelierMessage", () => {
  const nonce = "nonce-123";

  it("accepte un theme-request loopback avec le bon nonce", () => {
    const e = msg("http://127.0.0.1:18790", { type: "atelier-theme-request", nonce });
    expect(isTrustedAtelierMessage(e, nonce)).toBe(true);
  });

  it("refuse un nonce inconnu", () => {
    const e = msg("http://127.0.0.1:18790", { type: "atelier-theme-request", nonce: "autre" });
    expect(isTrustedAtelierMessage(e, nonce)).toBe(false);
  });

  it("refuse une origine hors loopback ou hors plage de ports", () => {
    const payload = { type: "atelier-theme-request", nonce };
    expect(isTrustedAtelierMessage(msg("https://evil.example", payload), nonce)).toBe(false);
    expect(isTrustedAtelierMessage(msg("http://localhost:18790", payload), nonce)).toBe(false);
    expect(isTrustedAtelierMessage(msg("http://127.0.0.1:80", payload), nonce)).toBe(false);
  });

  it("refuse un payload avec des clés inattendues", () => {
    const e = msg("http://127.0.0.1:18790", { type: "atelier-theme-request", nonce, extra: 1 });
    expect(isTrustedAtelierMessage(e, nonce)).toBe(false);
  });

  it("accepte atelier-open-tab avec url bornée et refuse sans url", () => {
    const ok = msg("http://127.0.0.1:19789", { type: "atelier-open-tab", nonce, url: "/fichier.pdf" });
    const ko = msg("http://127.0.0.1:19789", { type: "atelier-open-tab", nonce });
    expect(isTrustedAtelierMessage(ok, nonce)).toBe(true);
    expect(isTrustedAtelierMessage(ko, nonce)).toBe(false);
  });

  it("accepte atelier-open-pdf avec tex+pdf et refuse un chemin manquant", () => {
    const ok = msg("http://127.0.0.1:19789", {
      type: "atelier-open-pdf", nonce,
      tex: "/projet/doc.tex", pdf: "/projet/doc.pdf", title: "doc.tex — PDF",
    });
    const ko = msg("http://127.0.0.1:19789", { type: "atelier-open-pdf", nonce, tex: "/projet/doc.tex" });
    expect(isTrustedAtelierMessage(ok, nonce)).toBe(true);
    expect(isTrustedAtelierMessage(ko, nonce)).toBe(false);
  });

  it("accepte une pièce jointe galerie structurée avec aperçu", () => {
    const e = msg("http://127.0.0.1:19000", {
      type: "atelier-add-to-chat",
      nonce,
      text: "/projet/plot.png\nLis ce fichier.",
      path: "/projet/plot.png",
      name: "plot.png",
      previewUrl: "http://127.0.0.1:19000/plot.png",
      requestId: "add-plot-1",
    });
    expect(isTrustedAtelierMessage(e, nonce)).toBe(true);
  });

  it("accepte une sélection Quick Ask venue d'un éditeur", () => {
    const e = msg("http://127.0.0.1:19000", {
      type: "atelier-quick-ask",
      nonce,
      text: "zone-specific",
      around: "Cell intercepts and slopes follow zone-specific distributions:",
      path: "manuscript/methods_en.tex",
      page: "L120-124",
    });
    expect(isTrustedAtelierMessage(e, nonce)).toBe(true);
  });

  it("refuse une sélection Quick Ask portant une clé inconnue", () => {
    const e = msg("http://127.0.0.1:19000", {
      type: "atelier-quick-ask",
      nonce,
      text: "zone-specific",
      commande: "rm -rf /",
    });
    expect(isTrustedAtelierMessage(e, nonce)).toBe(false);
  });

  it("accepte un résultat show borné et refuse les clés ou chemins invalides", () => {
    const valid = {
      type: "atelier-gallery-result",
      nonce,
      ok: true,
      action: "show",
      projectRoot: "/Users/test/projet",
      requestId: "req-1",
      matched: ["figures/a.png"],
      missing: ["figures/b.png"],
    };
    expect(isTrustedAtelierMessage(msg("http://127.0.0.1:19000", valid), nonce)).toBe(true);
    expect(isTrustedAtelierMessage(msg("http://127.0.0.1:19000", { ...valid, extra: true }), nonce)).toBe(false);
    expect(isTrustedAtelierMessage(msg("http://127.0.0.1:19000", { ...valid, matched: [""] }), nonce)).toBe(false);
    expect(isTrustedAtelierMessage(msg("http://127.0.0.1:19000", {
      ...valid, action: "compare", requestId: "req-compare", applied: true,
    }), nonce)).toBe(true);
    expect(isTrustedAtelierMessage(msg("http://127.0.0.1:19000", {
      ...valid, action: "delete",
    }), nonce)).toBe(false);
  });
});

// plan 062 étape 5 : le jeton galerie (accès hors-projet) transite par le
// fragment de l'URL de navigation, jamais par la query — jamais envoyé au
// serveur dans la requête initiale, jamais dans les logs/l'historique.
describe("withAtelierToken", () => {
  it("place le jeton dans le fragment, jamais dans la query", () => {
    const url = withAtelierToken("http://127.0.0.1:19000/.fig_thumbs/latex_studio.html?path=x", "sekret");
    const parsed = new URL(url);
    expect(parsed.search).toBe("?path=x");
    expect(parsed.searchParams.has("token")).toBe(false);
    expect(parsed.hash).toContain("atelier_token=sekret");
  });

  it("coexiste avec un nonce déjà posé dans le fragment", () => {
    const url = withAtelierToken("http://127.0.0.1:19000/x.html#atelier_nonce=abc", "sekret");
    const params = new URLSearchParams(url.split("#")[1]);
    expect(params.get("atelier_nonce")).toBe("abc");
    expect(params.get("atelier_token")).toBe("sekret");
  });
});
