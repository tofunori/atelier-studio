import { describe, expect, it } from "vitest";
import { isTrustedAtelierMessage } from "./ipc";

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

  it("accepte une pièce jointe galerie structurée avec aperçu", () => {
    const e = msg("http://127.0.0.1:19000", {
      type: "atelier-add-to-chat",
      nonce,
      text: "/projet/plot.png\nLis ce fichier.",
      path: "/projet/plot.png",
      name: "plot.png",
      previewUrl: "http://127.0.0.1:19000/plot.png",
    });
    expect(isTrustedAtelierMessage(e, nonce)).toBe(true);
  });
});
