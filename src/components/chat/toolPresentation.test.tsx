import { beforeEach, describe, expect, it } from "vitest";
import type { AgentEvent } from "../../lib/ws";
import type { PluginCatalogEntry } from "../../lib/plugins";
import { setLanguage, t } from "../../lib/i18n";
import {
  activeToolLabel,
  activitySegments,
  activityIconForAction,
  distinctToolActions,
  fmtToolDur,
  imagePathsForActions,
  isSummarizableTool,
  stripAnsi,
  summarizeActivity,
  tickerRows,
  toolCategory,
  turnProgressSignature,
  truncateToolOutput,
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
    expect(readFirst.label).toBe("Read App.tsx, ran a command");
    expect(readFirst.icon?.cat).toBe("read");

    const searchFirst = summarizeActivity([
      tool("search", "Bash", "rg -n activity src"),
      tool("read", "Bash", "cat src/App.tsx"),
      tool("cmd", "Bash", "npm test"),
    ]);
    expect(searchFirst.label).toBe("Read 2 files, ran a command");
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

  // Nommage de cible façon Hermes (run-summary.ts, MIT) : une catégorie qui ne
  // tient qu'un seul élément nomme sa cible ; plusieurs = un compte ; une
  // commande seule reste comptée (elle n'a d'intérêt nominatif qu'en direct).
  it("nomme la cible d'un singleton, compte les groupes, sauf les commandes", () => {
    const single = summarizeActivity([
      tool("edit", "apply_patch", "src/config.rs", { input: { path: "src/config.rs" } }),
    ]);
    expect(single.label).toBe("Edited config.rs");

    const counted = summarizeActivity([
      tool("r1", "Read", "src/a.ts", { input: { path: "src/a.ts" } }),
      tool("r2", "Read", "src/b.ts", { input: { path: "src/b.ts" } }),
      tool("c1", "Bash", "npm test"),
      tool("c2", "Bash", "npm run build"),
      tool("c3", "Bash", "git status"),
    ]);
    expect(counted.label).toBe("Read 2 files, ran 3 commands");

    const lonelyCommand = summarizeActivity([tool("cmd", "Bash", "npm test")]);
    expect(lonelyCommand.label).toBe("Ran a command");
  });

  it("nomme la cible en français aussi", () => {
    setLanguage("fr");
    const single = summarizeActivity([
      tool("edit", "apply_patch", "src/config.rs", { input: { path: "src/config.rs" } }),
    ]);
    expect(single.label).toBe("Config.rs modifié");
    const counted = summarizeActivity([
      tool("r1", "Read", "src/a.ts", { input: { path: "src/a.ts" } }),
      tool("r2", "Read", "src/b.ts", { input: { path: "src/b.ts" } }),
    ]);
    expect(counted.label).toBe("2 fichiers consultés");
    setLanguage("en");
  });

  it("formate les durées d'outil du ms à la minute", () => {
    expect(fmtToolDur(320)).toBe("320 ms");
    expect(fmtToolDur(1400)).toBe("1,4 s");
    expect(fmtToolDur(12_000)).toBe("12 s");
    expect(fmtToolDur(125_000)).toBe("2 min 5 s");
    expect(fmtToolDur(120_000)).toBe("2 min");
  });

  it("le ticker garde une clé stable par appel, sans fenêtre glissante", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      tool(`cmd-${i}`, "Bash", `echo ${i}`, { status: i === 19 ? "inProgress" : "completed" }));
    const rows = tickerRows(many);
    expect(rows).toHaveLength(20);
    expect(rows[rows.length - 1].key).toBe("tick:cmd-19");
    // La même action re-signalée (update de statut) garde sa ligne.
    const updated = tickerRows([...many, tool("cmd-19", "Bash", "echo 19", { status: "completed" })]);
    expect(updated[updated.length - 1].key).toBe("tick:cmd-19");
    expect(updated).toHaveLength(20);
  });

  it("la signature de progrès bouge quand un outil se termine, pas au re-render", () => {
    const running = [tool("cmd", "Bash", "npm test", { status: "inProgress" })];
    const settled = [tool("cmd", "Bash", "npm test", { status: "completed" })];
    expect(turnProgressSignature(running, 0)).toBe(turnProgressSignature([...running], 0));
    expect(turnProgressSignature(running, 0)).not.toBe(turnProgressSignature(settled, 0));
    expect(turnProgressSignature(settled, 0)).not.toBe(turnProgressSignature(settled, 42));
    expect(turnProgressSignature(settled, 0)).not.toBe(
      turnProgressSignature([...settled, tool("next", "Read", "src/a.ts")], 0));
    // F1 : la longueur de la réponse en streaming fait aussi partie de la
    // signature — sinon le minuteur d'attente ignore un texte qui grossit.
    expect(turnProgressSignature(settled, 0, 0)).toBe(turnProgressSignature(settled, 0));
    expect(turnProgressSignature(settled, 0, 0)).not.toBe(turnProgressSignature(settled, 0, 12));
  });

  it("segmente le bilan cumulatif et éclaire la catégorie la plus récente", () => {
    const segments = activitySegments([
      tool("r1", "Read", "src/a.ts", { input: { path: "src/a.ts" } }),
      tool("r2", "Read", "src/b.ts", { input: { path: "src/b.ts" } }),
      tool("c1", "Bash", "npm test"),
    ]);
    expect(segments.map((s) => s.text)).toEqual(["read 2 files", "ran a command"]);
    expect(segments.map((s) => s.live)).toEqual([false, true]);
    expect(activitySegments([])).toEqual([]);
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
    expect(summarizeActivity([completedReading]).label).toBe("Read App.tsx");
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
    expect(summarizeActivity([completedGeneration]).label).toBe("Created Scientific map");
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

describe("truncateToolOutput", () => {
  it("laisse la sortie intacte quand elle fait 6000 caractères ou moins", () => {
    const short = "a".repeat(6000);
    expect(truncateToolOutput(short)).toBe(short);
    expect(truncateToolOutput("")).toBe("");
    expect(truncateToolOutput("petite sortie")).toBe("petite sortie");
  });

  it("garde tête et queue alignées sur des lignes avec un marqueur i18n indiquant le nombre de lignes omises", () => {
    const line = "a".repeat(9); // + "\n" = 10 caractères par ligne
    const raw = Array.from({ length: 1000 }, () => `${line}\n`).join("");
    expect(raw.length).toBe(10000);

    const head = raw.slice(0, 1510); // 151 lignes complètes (0..150), tête étendue à la fin de ligne
    const tail = raw.slice(5510); // lignes 551..999 (449 lignes), queue démarrant à un début de ligne

    const result = truncateToolOutput(raw);
    expect(result).toBe(`${head}${t("chat.output-omitted", { n: 400 })}\n${tail}`);
    expect(result.startsWith(head)).toBe(true);
    expect(result.endsWith(tail)).toBe(true);
    expect(result).toContain("400 lines omitted");
  });

  it("traduit le marqueur selon la langue active", () => {
    const raw = "x".repeat(7000);
    setLanguage("fr");
    expect(truncateToolOutput(raw)).toContain("lignes omises");
    setLanguage("en");
    expect(truncateToolOutput(raw)).toContain("lines omitted");
  });
});

describe("stripAnsi", () => {
  it("retire les séquences SGR/curseur", () => {
    expect(stripAnsi("\x1b[31mrouge\x1b[0m normal")).toBe("rouge normal");
    expect(stripAnsi("\x1b[2K\x1b[1Gligne")).toBe("ligne");
    expect(stripAnsi("\x1b[?25lcache\x1b[?25h")).toBe("cache");
  });

  it("retire les séquences OSC (titre de fenêtre, hyperliens)", () => {
    expect(stripAnsi("\x1b]0;titre\x07reste")).toBe("reste");
    expect(stripAnsi("avant\x1b]8;;http://example.com\x1b\\après")).toBe("avantaprès");
  });

  it("laisse le texte sans séquences ANSI inchangé", () => {
    expect(stripAnsi("texte normal\nsur deux lignes")).toBe("texte normal\nsur deux lignes");
  });
});
