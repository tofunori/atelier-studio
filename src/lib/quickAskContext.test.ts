import { describe, expect, it } from "vitest";
import { buildQuickAskPrompt, messageIndexFromNode, quoteContext } from "./quickAskContext";

describe("buildQuickAskPrompt", () => {
  it("renvoie la question seule quand il n'y a pas de contexte", () => {
    expect(buildQuickAskPrompt(null, "c'est quoi un albédo ?")).toBe("c'est quoi un albédo ?");
  });

  it("place le message entier autour de la sélection", () => {
    const prompt = buildQuickAskPrompt(
      {
        selection: "Contribution",
        message: "La section Author contributions est obligatoire chez Nature.",
        role: "assistant",
        threadTitle: "Manuscrit ch.1",
      },
      "mais cest quoi contribution?",
    );
    expect(prompt).toContain("La section Author contributions est obligatoire chez Nature.");
    expect(prompt).toContain("Contribution");
    expect(prompt).toContain("Manuscrit ch.1");
    expect(prompt).toContain("mais cest quoi contribution?");
  });

  it("part de l'extrait mais laisse ouvrir les fichiers du projet", () => {
    const prompt = buildQuickAskPrompt(
      { selection: "Contribution", message: "Author contributions.", role: "assistant" },
      "c'est quoi ?",
    );
    expect(prompt).toMatch(/Pars de cet extrait/i);
    expect(prompt).toMatch(/ouvrir les fichiers du projet/i);
    expect(prompt).not.toMatch(/n['’]ouvre pas de fichiers/i);
  });

  it("retombe sur la sélection seule quand le message n'a pas pu être retrouvé", () => {
    const prompt = buildQuickAskPrompt({ selection: "Contribution" }, "c'est quoi ?");
    expect(prompt).toContain("Contribution");
    expect(prompt).toContain("c'est quoi ?");
  });

  it("ne répète pas le message quand la sélection le couvre en entier", () => {
    const message = "La section Author contributions est obligatoire.";
    const prompt = buildQuickAskPrompt(
      { selection: message, message, role: "assistant" },
      "pourquoi ?",
    );
    expect(prompt.split(message).length - 1).toBe(1);
  });
});

describe("messageIndexFromNode", () => {
  it("remonte du nœud sélectionné jusqu'à la ligne de timeline", () => {
    document.body.innerHTML = `
      <div class="timeline-virtual-row" data-message-id="message-7">
        <p><span id="cible">Contribution</span></p>
      </div>`;
    const node = document.getElementById("cible")!.firstChild;
    expect(messageIndexFromNode(node)).toBe(7);
  });

  it("renvoie null hors d'une ligne de timeline", () => {
    document.body.innerHTML = `<p id="ailleurs">texte</p>`;
    expect(messageIndexFromNode(document.getElementById("ailleurs"))).toBeNull();
  });

  it("ignore les lignes qui ne portent pas un index numérique", () => {
    document.body.innerHTML = `
      <div data-message-id="message-working"><span id="cible">x</span></div>`;
    expect(messageIndexFromNode(document.getElementById("cible"))).toBeNull();
  });

  it("renvoie null pour un nœud absent", () => {
    expect(messageIndexFromNode(null)).toBeNull();
  });
});

describe("quoteContext", () => {
  const events = [
    { kind: "user", text: "parle-moi du manuscrit" },
    { kind: "text", text: "La section Author contributions est obligatoire." },
    { kind: "tool", name: "grep" },
  ];

  it("retrouve le message de l'agent qui porte la sélection", () => {
    const ctx = quoteContext({ text: "Contribution", messageIndex: 1 }, events, "Manuscrit ch.1");
    expect(ctx).toEqual({
      selection: "Contribution",
      message: "La section Author contributions est obligatoire.",
      role: "assistant",
      threadTitle: "Manuscrit ch.1",
    });
  });

  it("marque un message de l'utilisateur comme tel", () => {
    expect(quoteContext({ text: "manuscrit", messageIndex: 0 }, events, "X")?.role).toBe("user");
  });

  it("garde la sélection seule quand la ligne visée n'a pas de texte", () => {
    const ctx = quoteContext({ text: "grep", messageIndex: 2 }, events, "X");
    expect(ctx).toEqual({ selection: "grep", threadTitle: "X" });
  });

  it("garde la sélection seule quand l'index est hors du fil", () => {
    expect(quoteContext({ text: "x", messageIndex: 99 }, events, "X")?.message).toBeUndefined();
  });

  it("omet le titre quand le fil n'en a pas", () => {
    expect(quoteContext({ text: "x", messageIndex: null }, events, "")).toEqual({ selection: "x" });
  });

  it("ne renvoie rien sans sélection", () => {
    expect(quoteContext(null, events, "X")).toBeNull();
  });
});

describe("buildQuickAskPrompt — origine fichier", () => {
  it("nomme le fichier et les lignes plutôt qu'un fil", () => {
    const prompt = buildQuickAskPrompt({
      selection: "zone-specific",
      message: "Cell intercepts and slopes follow zone-specific distributions:",
      source: {file: "methods_en.tex", lines: "L120-124"},
    }, "ça veut dire quoi ?");
    expect(prompt).toContain("methods_en.tex");
    expect(prompt).toContain("L120-124");
    expect(prompt).toContain("Cell intercepts and slopes follow");
    expect(prompt).toContain("ça veut dire quoi ?");
  });

  it("n'attribue le passage à personne — un fichier n'a pas d'auteur dans le fil", () => {
    const prompt = buildQuickAskPrompt({
      selection: "zone-specific",
      message: "Cell intercepts follow zone-specific distributions:",
      source: {file: "methods_en.tex", lines: "L120-124"},
    }, "?");
    expect(prompt).not.toMatch(/l['’]agent a écrit|j['’]ai écrit/);
  });

  it("se passe des lignes quand elles manquent", () => {
    const prompt = buildQuickAskPrompt(
      {selection: "albedo", message: "summer mean albedo", source: {file: "notes.md"}},
      "?",
    );
    expect(prompt).toContain("notes.md");
    expect(prompt).not.toContain("(undefined)");
  });

  it("le fichier prime sur un titre de fil qui traînerait", () => {
    const prompt = buildQuickAskPrompt({
      selection: "x",
      message: "un passage",
      threadTitle: "Manuscrit",
      source: {file: "methods_en.tex", lines: "L1-2"},
    }, "?");
    expect(prompt).toContain("methods_en.tex");
    expect(prompt).not.toContain("Manuscrit");
  });

  it("garde la consigne de cadrage", () => {
    const prompt = buildQuickAskPrompt(
      {selection: "x", message: "y", source: {file: "a.tex"}},
      "?",
    );
    expect(prompt).toMatch(/Pars de cet extrait/i);
  });
});
