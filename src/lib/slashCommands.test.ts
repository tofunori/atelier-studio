import { describe, expect, it } from "vitest";
import {
  ATELIER_NATIVE_SLASH_COMMANDS,
  parseNativeSlashCommand,
  permissionModeFromSlash,
} from "./slashCommands";

describe("slash commands Atelier", () => {
  it("expose le premier lot Codex dans le catalogue natif", () => {
    expect(ATELIER_NATIVE_SLASH_COMMANDS).toEqual(expect.arrayContaining([
      "status", "model", "permissions", "plan", "diff", "usage", "resume",
      "compact", "goal", "review", "clear",
    ]));
  });

  it("reconnaît /resume sans l'envoyer au provider", () => {
    expect(parseNativeSlashCommand("/resume")).toMatchObject({ name: "resume", args: "" });
  });

  it("parse une commande native et préserve ses arguments", () => {
    expect(parseNativeSlashCommand(" /plan  analyse ce changement ")).toEqual({
      name: "plan",
      args: "analyse ce changement",
      raw: "/plan  analyse ce changement",
    });
  });

  it("n'intercepte pas un skill ou une commande insérée dans une phrase", () => {
    expect(parseNativeSlashCommand("/recherche albédo")).toBeNull();
    expect(parseNativeSlashCommand("utilise /status maintenant")).toBeNull();
  });

  it("normalise les alias de permissions", () => {
    expect(permissionModeFromSlash("full")).toBe("bypassPermissions");
    expect(permissionModeFromSlash("accept-edits")).toBe("acceptEdits");
    expect(permissionModeFromSlash("ask")).toBe("default");
    expect(permissionModeFromSlash("read-only")).toBe("plan");
    expect(permissionModeFromSlash("inconnu")).toBeNull();
  });
});
