import { describe, it, expect } from "vitest";
import { eventsFromSessionMessages } from "./history.mjs";

const user = (content) => ({ type: "user", message: { content } });
const assistant = (content) => ({ type: "assistant", message: { content } });

describe("eventsFromSessionMessages", () => {
  it("conserve un message user commençant par « < » (HTML/XML légitime)", () => {
    const events = eventsFromSessionMessages([user("<div>hello</div>")]);
    expect(events).toEqual([{ kind: "user", text: "<div>hello</div>" }]);
  });

  it("filtre les injections systèmes connues (system-reminder, command-name)", () => {
    const events = eventsFromSessionMessages([
      user("<system-reminder>ne fais pas ça</system-reminder>"),
      user("<command-name>/foo</command-name> args"),
    ]);
    expect(events).toEqual([]);
  });

  it("conserve un message user normal", () => {
    const events = eventsFromSessionMessages([user("bonjour")]);
    expect(events).toEqual([{ kind: "user", text: "bonjour" }]);
  });

  it("ignore un message user ne contenant que des tool_result", () => {
    const events = eventsFromSessionMessages([
      user([{ type: "tool_result", tool_use_id: "x", content: "résultat" }]),
    ]);
    expect(events).toEqual([]);
  });

  it("restitue le détail d'un tool_use Bash", () => {
    const events = eventsFromSessionMessages([
      assistant([{ type: "tool_use", name: "Bash", input: { command: "git status" } }]),
    ]);
    expect(events).toEqual([{ kind: "tool", name: "Bash", detail: "git status" }]);
  });

  it("émet un event texte pour un bloc texte assistant", () => {
    const events = eventsFromSessionMessages([
      assistant([{ type: "text", text: "Voici la réponse." }]),
    ]);
    expect(events).toEqual([{ kind: "text", text: "Voici la réponse." }]);
  });

  it("garde le texte user d'un array mixte (texte + tool_result)", () => {
    const events = eventsFromSessionMessages([
      user([
        { type: "text", text: "regarde ceci" },
        { type: "tool_result", tool_use_id: "x", content: "sortie" },
      ]),
    ]);
    expect(events).toEqual([{ kind: "user", text: "regarde ceci" }]);
  });
});
