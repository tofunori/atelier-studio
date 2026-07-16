import { beforeEach, describe, expect, it } from "vitest";
import type { AgentEvent } from "../../lib/ws";
import type { PluginCatalogEntry } from "../../lib/plugins";
import { setLanguage } from "../../lib/i18n";
import {
  activeToolLabel,
  activityIconForAction,
  distinctToolActions,
  imagePathsForActions,
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
    expect(toolCategory("Bash", "/bin/zsh -lc \"sed -n '1,80p' src/components/chat/PromptInput.tsx\"")).toBe("read");
    expect(toolCategory("list_dir", "src")).toBe("list");
    expect(toolCategory("apply_patch", "App.tsx")).toBe("edit");
    expect(toolCategory("view_image", "/tmp/a.png")).toBe("image");
    expect(toolCategory("image /tmp/legacy.png")).toBe("image");
    expect(toolCategory("agent:spawn", "reviewer")).toBe("agent");
    expect(isSummarizableTool({ kind: "tool", name: "__compacted" })).toBe(true);
  });

  it("extracts image paths from the structured and legacy Codex formats", () => {
    const structured = tool("image", "view_image", "", {
      input: { paths: ["/tmp/a.png", "/tmp/b.jpg"] },
    });
    expect(imagePathsForActions([structured, { kind: "tool", name: "image /tmp/legacy.png" }])).toEqual([
      "/tmp/a.png",
      "/tmp/b.jpg",
      "/tmp/legacy.png",
    ]);
  });

  it("présente les wrappers shell et les actions rapides comme Codex", () => {
    const reading = tool("read", "Bash", "/bin/zsh -lc \"sed -n '1,80p' src/components/chat/PromptInput.tsx\"", {
      status: "completed",
      input: { command: "/bin/zsh -lc \"sed -n '1,80p' src/components/chat/PromptInput.tsx\"" },
    });
    expect(activityIconForAction(reading).cat).toBe("read");
    expect(activeToolLabel(reading)).toBe("Reading PromptInput.tsx");

    const running = tool("test", "Bash", "npm test", { status: "inProgress" });
    const completed = tool("test", "Bash", "npm test", { status: "completed" });
    expect(activeToolLabel(running)).toBe("Running tests");
    expect(activeToolLabel(completed)).toBe("Ran tests");
  });

  it("préfère commandActions à l'heuristique shell pour les lectures Codex", () => {
    const reading = tool("read-structured", "Bash", "pwd && sed -n '1,20p' src/App.tsx", {
      status: "inProgress",
      input: {
        command: "pwd && sed -n '1,20p' src/App.tsx",
        commandActions: [
          { type: "unknown", command: "pwd" },
          { type: "read", command: "sed -n '1,20p' src/App.tsx", name: "App.tsx", path: "/repo/src/App.tsx" },
        ],
      },
    });
    expect(activityIconForAction(reading).cat).toBe("read");
    expect(activeToolLabel(reading)).toBe("Reading App.tsx");
    const completedReading = tool("read-structured", "Bash", "pwd && sed -n '1,20p' src/App.tsx", {
      status: "completed",
      input: reading.kind === "tool_update" ? reading.input : undefined,
    });
    expect(summarizeActivity([completedReading]).label).toBe("Read files");
  });

  it("présente imageGeneration comme une génération, pas comme un outil générique", () => {
    const generating = tool("image-1", "image_generation", "Scientific map", {
      status: "inProgress",
      source: "codex",
      input: { revisedPrompt: "Scientific map" },
    });
    expect(activityIconForAction(generating).cat).toBe("visualization");
    expect(activeToolLabel(generating)).toBe("Creating Scientific map");
    const completedGeneration = tool("image-1", "image_generation", "Scientific map", {
      status: "completed", source: "codex", input: { revisedPrompt: "Scientific map" },
    });
    expect(summarizeActivity([completedGeneration]).label).toBe("Created a visualization");
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
