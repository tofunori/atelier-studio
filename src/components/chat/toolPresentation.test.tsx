import { beforeEach, describe, expect, it } from "vitest";
import type { AgentEvent } from "../../lib/ws";
import type { PluginCatalogEntry } from "../../lib/plugins";
import { setLanguage } from "../../lib/i18n";
import {
  activityIconForAction,
  distinctToolActions,
  isSummarizableTool,
  summarizeActivity,
  toolCategory,
} from "./toolPresentation";

type ToolAction = Extract<AgentEvent, { kind: "tool" | "tool_update" }>;

function tool(id: string, name: string, detail: string, over: Partial<Extract<AgentEvent, { kind: "tool_update" }>> = {}): ToolAction {
  return {
    kind: "tool_update",
    id,
    name,
    detail,
    input: over.input ?? { command: detail },
    output: over.output ?? "",
    status: over.status ?? "completed",
    source: over.source ?? "codex",
    ...over,
  };
}

beforeEach(() => setLanguage("en"));

describe("Codex-style activity presentation", () => {
  it("orders exploration before commands and uses the first exploration item as icon", () => {
    const readFirst = summarizeActivity([
      tool("cmd", "Bash", "npm test"),
      tool("read", "Bash", "cat src/App.tsx"),
    ]);
    expect(readFirst.label).toBe("Read files, ran a command");
    expect(readFirst.icon?.cat).toBe("read");

    const searchFirst = summarizeActivity([
      tool("search", "Bash", "rg -n activity src"),
      tool("read", "Bash", "cat src/App.tsx"),
      tool("cmd", "Bash", "npm test"),
    ]);
    expect(searchFirst.label).toBe("Read files, ran a command");
    expect(searchFirst.icon?.cat).toBe("search");
  });

  it("deduplicates streaming updates by item id and keeps the final state", () => {
    const actions = [
      tool("same", "Bash", "npm test", { status: "inProgress" }),
      tool("same", "Bash", "npm test", { status: "interrupted" }),
    ];
    expect(distinctToolActions(actions)).toHaveLength(1);
    const summary = summarizeActivity(actions);
    expect(summary.actionCount).toBe(1);
    expect(summary.label).toBe("Ran a command");
    expect(summary.icon?.cat).toBe("interrupted");
  });

  it("normalizes provider-specific names into the same typed activities", () => {
    expect(toolCategory("Read", "src/App.tsx")).toBe("read");
    expect(toolCategory("Bash", "rg -n chat src")).toBe("search");
    expect(toolCategory("list_dir", "src")).toBe("list");
    expect(toolCategory("apply_patch", "App.tsx")).toBe("edit");
    expect(toolCategory("view_image", "/tmp/a.png")).toBe("image");
    expect(toolCategory("agent:spawn", "reviewer")).toBe("agent");
    expect(isSummarizableTool({ kind: "tool", name: "__compacted" })).toBe(true);
  });

  it("uses the real catalog image for a matching MCP/plugin source", () => {
    const plugins: PluginCatalogEntry[] = [{
      id: "google-drive",
      name: "google-drive",
      displayName: "Google Drive",
      description: "Drive",
      enabled: true,
      icon: "https://example.test/drive.svg",
      skills: [],
    }];
    const action = tool("mcp", "google-drive/search", "search", { source: "mcp" });
    expect(activityIconForAction(action, plugins)).toEqual({
      cat: "integration",
      imageUrl: "https://example.test/drive.svg",
      label: "Google Drive",
    });
  });
});
