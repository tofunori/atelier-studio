import { describe, expect, it } from "vitest";
import {
  archivedUserEvent,
  parseGoalCommand,
  promptWithAttachments,
  providerTurnOptions,
  structuredTurnInputs,
  supportsStructuredInputs,
  userBubbleAttachmentFields,
} from "./turnPayload";
import type { DraftAttachment } from "./chatDraftStore";

const file: DraftAttachment = { name: "plot.py", lines: "3-9", text: "/p/plot.py (p.L3-9) : « … »" };
const paste: DraftAttachment = { name: "Collage", lines: null, kind: "paste", text: "a\nb\nc" };
const figure: DraftAttachment = {
  name: "albedo.png", lines: null, text: "/p/albedo.png", imageUrl: "blob:fig",
  notes: [{ n: 1, text: "pic" }] as DraftAttachment["notes"],
};
const snapshot: DraftAttachment = { name: "capture.png", lines: null, text: "/tmp/c.png", imageUrl: "blob:snap" };

describe("promptWithAttachments", () => {
  it("préfixe les pièces jointes au prompt", () => {
    expect(promptWithAttachments("Question", [])).toBe("Question");
    expect(promptWithAttachments("Question", [file, paste])).toBe(`${file.text}\n\n${paste.text}\n\nQuestion`);
    expect(promptWithAttachments("", [file])).toBe(file.text);
  });
});

describe("userBubbleAttachmentFields", () => {
  it("nomme les fichiers avec leurs lignes et garde les collages à part", () => {
    expect(userBubbleAttachmentFields([file, paste])).toEqual({
      label: "plot.py (lines 3-9)",
      pastes: [{ name: "Collage", text: "a\nb\nc" }],
    });
  });

  it("une figure annotée garde vignette, nom et notes ; une simple capture n'a que sa vignette", () => {
    expect(userBubbleAttachmentFields([figure])).toEqual({
      imageUrl: "blob:fig", label: "albedo.png", notes: figure.notes,
    });
    expect(userBubbleAttachmentFields([snapshot])).toEqual({ imageUrl: "blob:snap" });
  });
});

describe("archivedUserEvent", () => {
  it("archive le texte, le nom, les collages avec leur nombre de lignes et les images locales", () => {
    expect(archivedUserEvent({ text: "Q", ts: 5, label: "plot.py" }, [paste], ["/tmp/c.png"])).toEqual({
      kind: "user", text: "Q", ts: 5, label: "plot.py",
      pastes: [{ name: "Collage", lines: 3, text: "a\nb\nc" }],
      imagePaths: ["/tmp/c.png"],
    });
    expect(archivedUserEvent({ text: "Q", ts: 5 }, [], [])).toEqual({ kind: "user", text: "Q", ts: 5 });
  });
});

describe("entrées structurées", () => {
  it("dépendent de la capability, Codex par défaut", () => {
    expect(supportsStructuredInputs(undefined, "codex")).toBe(true);
    expect(supportsStructuredInputs(undefined, "claude")).toBe(false);
    expect(supportsStructuredInputs({ skillsAttach: true } as never, "kimi")).toBe(true);
  });

  it("ne produit rien quand le prompt texte suffit", () => {
    expect(structuredTurnInputs(true, "P", [], [], null)).toBeUndefined();
    expect(structuredTurnInputs(false, "P", ["/i.png"], [], null)).toBeUndefined();
  });

  it("joint images, skills de plugin et SKILL.md du catalogue", () => {
    const inputs = structuredTurnInputs(true, "P", ["/i.png"], [{ name: "lint", path: "/s/lint", type: "mention" }],
      { name: "figures", path: "/s/figures/SKILL.md" });
    expect(inputs?.[0]).toEqual(expect.objectContaining({ type: "text" }));
    expect((inputs?.[0] as { text: string }).text.startsWith("P\n\n")).toBe(true);
    expect(inputs?.slice(1)).toEqual([
      { type: "local_image", path: "/i.png" },
      { type: "mention", name: "lint", path: "/s/lint" },
      { type: "skill", name: "figures", path: "/s/figures/SKILL.md" },
    ]);
  });
});

describe("providerTurnOptions", () => {
  it("n'envoie Fast, recherche web et dossiers additionnels qu'à Codex", () => {
    const turn = { model: "m", effort: "", permissionMode: "ask", fastMode: true, webSearch: true, additionalDirectories: ["/d"] };
    expect(providerTurnOptions({ provider: "codex", ...turn })).toEqual({
      model: "m", permissionMode: "ask", fastMode: true, webSearch: true, additionalDirectories: ["/d"],
    });
    expect(providerTurnOptions({ provider: "claude", ...turn })).toEqual({ model: "m", permissionMode: "ask" });
  });
});

describe("parseGoalCommand", () => {
  it("lit l'objectif, l'effacement et ignore le reste", () => {
    expect(parseGoalCommand("/goal")).toEqual({ arg: "", isClear: false });
    expect(parseGoalCommand("  /goal  finir la figure 3 ")).toEqual({ arg: "finir la figure 3", isClear: false });
    expect(parseGoalCommand("/goal STOP")).toEqual({ arg: "STOP", isClear: true });
    expect(parseGoalCommand("/goals")).toBeNull();
    expect(parseGoalCommand("fixe un /goal")).toBeNull();
  });
});
