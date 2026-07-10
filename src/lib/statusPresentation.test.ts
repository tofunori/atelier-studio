// Tests du présenteur de statuts (plan 018) : libellés fr déterministes via
// setLanguage("fr"), tons visuels figés — done reste neutre car il décrit le
// record technique d'exécution, jamais une validation scientifique.
import { describe, it, expect, beforeEach } from "vitest";
import { setLanguage } from "./i18n";
import { presentStatus, fmtDuration, type UiStatusKind } from "./statusPresentation";

beforeEach(() => {
  setLanguage("fr");
});

describe("presentStatus — libellé et ton par kind", () => {
  const cases: Array<{ kind: UiStatusKind; label: string; tone: string }> = [
    { kind: "idle", label: "inactif", tone: "neutral" },
    { kind: "running", label: "en cours", tone: "running" },
    { kind: "done", label: "terminé", tone: "neutral" },
    { kind: "warning", label: "avertissement", tone: "warning" },
    { kind: "error", label: "erreur", tone: "error" },
    { kind: "interrupted", label: "interrompu", tone: "warning" },
    { kind: "disconnected", label: "Sidecar déconnecté", tone: "error" },
  ];

  for (const c of cases) {
    it(`${c.kind} → « ${c.label} » / ton ${c.tone}`, () => {
      const p = presentStatus({ kind: c.kind });
      expect(p.kind).toBe(c.kind);
      expect(p.label).toBe(c.label);
      expect(p.tone).toBe(c.tone);
    });
  }

  it("done n'emprunte JAMAIS le ton success (record technique, pas validation)", () => {
    expect(presentStatus({ kind: "done" }).tone).toBe("neutral");
    expect(presentStatus({ kind: "done" }).tone).not.toBe("success");
  });
});

describe("presentStatus — running avec durée injectée", () => {
  // now injecté pour rester déterministe (aucun Date.now réel)
  const NOW = 1_750_000_000_000;

  it("since 45 s avant → « en cours depuis 45 s »", () => {
    const p = presentStatus({ kind: "running", since: NOW - 45_000, now: NOW });
    expect(p.label).toBe("en cours depuis 45 s");
  });

  it("since 5 min avant → « en cours depuis 5 min »", () => {
    const p = presentStatus({ kind: "running", since: NOW - 300_000, now: NOW });
    expect(p.label).toBe("en cours depuis 5 min");
  });

  it("since 2 h 3 min avant → « en cours depuis 2 h 3 min »", () => {
    const p = presentStatus({ kind: "running", since: NOW - 7_380_000, now: NOW });
    expect(p.label).toBe("en cours depuis 2 h 3 min");
  });

  it("sans since → « en cours » sans durée", () => {
    expect(presentStatus({ kind: "running", now: NOW }).label).toBe("en cours");
    expect(presentStatus({ kind: "running", since: null, now: NOW }).label).toBe("en cours");
  });
});

describe("presentStatus — texte accessible", () => {
  it("sans detail : a11y = label seul", () => {
    const p = presentStatus({ kind: "error" });
    expect(p.a11y).toBe("erreur");
    expect(p.detail).toBeUndefined();
  });

  it("avec detail : a11y = label + « — » + detail, detail transmis tel quel", () => {
    const p = presentStatus({ kind: "error", detail: "ECONNRESET sur le sidecar" });
    expect(p.a11y).toBe("erreur — ECONNRESET sur le sidecar");
    expect(p.detail).toBe("ECONNRESET sur le sidecar");
  });
});

describe("fmtDuration", () => {
  it("45000 → « 45 s »", () => {
    expect(fmtDuration(45_000)).toBe("45 s");
  });

  it("300000 → « 5 min »", () => {
    expect(fmtDuration(300_000)).toBe("5 min");
  });

  it("7380000 → « 2 h 3 min »", () => {
    expect(fmtDuration(7_380_000)).toBe("2 h 3 min");
  });
});
