import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPendingPassageOpen, consumePendingPassageOpen, resetPendingPassageOpenForTests, setPendingPassageOpen,
} from "./pendingPassageOpen";

beforeEach(() => resetPendingPassageOpenForTests());
afterEach(() => vi.restoreAllMocks());

describe("pendingPassageOpen — filet de rattrapage du premier clic perdu", () => {
  it("absent au départ : consume renvoie null", () => {
    expect(consumePendingPassageOpen()).toBeNull();
  });

  it("set puis consume renvoie l'entrée posée", () => {
    setPendingPassageOpen({ kind: "gbrain", detail: { slug: "s-1", quote: "q" }, ts: Date.now() });
    expect(consumePendingPassageOpen()).toEqual({ kind: "gbrain", detail: { slug: "s-1", quote: "q" }, ts: expect.any(Number) });
  });

  it("consume = efface : un second appel renvoie null", () => {
    setPendingPassageOpen({ kind: "zotero", detail: { key: "K" }, ts: Date.now() });
    consumePendingPassageOpen();
    expect(consumePendingPassageOpen()).toBeNull();
  });

  it("entrée périmée (> maxAgeMs) : consume renvoie null et l'efface quand même", () => {
    setPendingPassageOpen({ kind: "gbrain", detail: {}, ts: Date.now() - 10_000 });
    expect(consumePendingPassageOpen(5000)).toBeNull();
    // effacée : même en repoussant l'horloge, plus rien à consommer
    expect(consumePendingPassageOpen(60_000)).toBeNull();
  });

  it("clearPendingPassageOpen efface sans retourner l'entrée", () => {
    setPendingPassageOpen({ kind: "zotero", detail: {}, ts: Date.now() });
    clearPendingPassageOpen();
    expect(consumePendingPassageOpen()).toBeNull();
  });

  it("un set écrase une entrée précédente non consommée", () => {
    setPendingPassageOpen({ kind: "zotero", detail: { key: "A" }, ts: Date.now() });
    setPendingPassageOpen({ kind: "gbrain", detail: { slug: "B" }, ts: Date.now() });
    expect(consumePendingPassageOpen()).toEqual(
      expect.objectContaining({ kind: "gbrain", detail: { slug: "B" } }),
    );
  });
});
