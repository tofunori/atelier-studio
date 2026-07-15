import { describe, expect, it } from "vitest";
import { appSnapContextText, type AppSnapCapture } from "./appSnap";

function capture(overrides: Partial<AppSnapCapture> = {}): AppSnapCapture {
  return {
    id: "capture-1",
    path: "/private/appsnap.png",
    name: "AppSnap.png",
    capturedAt: "2026-07-15T12:00:00Z",
    sourceAppName: "Safari",
    sourceBundleIdentifier: "com.apple.Safari",
    sourceAppIconDataUrl: null,
    sourceWindowTitle: "Documentation",
    accessibilitySnapshot: null,
    accessibilityElementCount: null,
    accessibilitySnapshotTruncated: null,
    ...overrides,
  };
}

describe("AppSnap context", () => {
  it("joint l'instantané d'accessibilité au texte envoyé au modèle", () => {
    const text = appSnapContextText(capture({
      accessibilitySnapshot: "[button] Search\n[static text] Documentation",
      accessibilityElementCount: 2,
      accessibilitySnapshotTruncated: false,
    }), "Safari", "Documentation");

    expect(text).toContain("Inspect the attached image");
    expect(text).toContain("Accessibility snapshot of the visible interface");
    expect(text).toContain("[button] Search");
  });

  it("n'invente aucun texte d'interface lorsque macOS n'en fournit pas", () => {
    const text = appSnapContextText(capture(), "Safari", "Documentation");
    expect(text).not.toContain("Accessibility snapshot");
  });
});
