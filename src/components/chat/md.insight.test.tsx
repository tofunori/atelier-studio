import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import remarkGfm from "remark-gfm";
import { splitInsightBlocks } from "../../lib/insightBlocks";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));
import { MD_COMPONENTS, MD_COMPONENTS_STREAMING, MdBody } from "./md";

afterEach(cleanup);
const OPEN = "`★ Insight ─────────────────────`";
const CLOSE = "`───────────────────────────────`";
const REMARK = [remarkGfm];
const REHYPE: any[] = [];
const view = (text: string, streaming = false) => <MdBody text={text} streaming={streaming}
  components={streaming ? MD_COMPONENTS_STREAMING : MD_COMPONENTS}
  remarkPlugins={REMARK} rehypePlugins={REHYPE} />;

describe("Insight presentation", () => {
  it("renders the screenshot format as prose with its own title, preserving surrounding text", () => {
    const source = `Avant.\n\n${OPEN}\nDes **groupes réguliers** et du code \`x = 1\`.\n${CLOSE}\n\nAprès.`;
    const { container, getByRole } = render(view(source));
    const note = getByRole("complementary", { name: "Insight" });
    expect(note.querySelector(".chat-insight-title")?.textContent).toBe("Insight");
    expect(note.querySelector("strong")?.textContent).toBe("groupes réguliers");
    expect(note.querySelector("code")?.textContent).toBe("x = 1");
    expect(container.textContent).not.toContain("───");
    expect(container.firstElementChild?.textContent).toBe("Avant.");
    expect(container.lastElementChild?.textContent).toBe("Après.");
  });

  it("accepts body text beside the title and multiple independent Insights", () => {
    const { getAllByRole } = render(view(`${OPEN} Première explication.\n${CLOSE}\n\n${OPEN}\nSeconde.\n${CLOSE}`));
    expect(getAllByRole("complementary")).toHaveLength(2);
    expect(getAllByRole("complementary")[0].textContent).toContain("Première explication.");
  });

  it("keeps the same surface through partial closing markers and finalization", () => {
    const { container, rerender } = render(view(`${OPEN}\nUne explication`, true));
    const note = container.querySelector("aside");
    for (const tail of [" détaillée.", " détaillée.\n`──", ` détaillée.\n${CLOSE}`]) {
      rerender(view(`${OPEN}\nUne explication${tail}`, true));
      expect(container.querySelector("aside")).toBe(note);
      expect(note?.textContent).not.toContain("──");
    }
    rerender(view(`${OPEN}\nUne explication détaillée.\n${CLOSE}`));
    expect(container.querySelector("aside")).toBe(note);
  });

  it("preserves multiline lists, paragraphs and fenced code inside the note", () => {
    const body = `- Premier point.\n- Deuxième point.\n\nUn paragraphe.\n\n\`\`\`text\n${CLOSE}\n\`\`\``;
    const { getByRole } = render(view(`${OPEN}\n${body}\n${CLOSE}`));
    const note = getByRole("complementary");
    expect(note.querySelectorAll("li")).toHaveLength(2);
    expect(note.querySelector("pre")?.textContent).toContain(CLOSE);
  });

  it("preserves an indented code block at the start of the body", () => {
    const { getByRole } = render(view(`${OPEN}\n\n    const x = 1;\n    const y = 2;\n${CLOSE}`));
    expect(getByRole("complementary").querySelector("pre")?.textContent).toBe("const x = 1;\nconst y = 2;\n");
  });

  it("recognizes a note after an unmatched backtick in a separate paragraph", () => {
    const { getByRole } = render(view(`Un caractère \` isolé.\n\n${OPEN}\nUne explication.\n${CLOSE}`));
    expect(getByRole("complementary").textContent).toContain("Une explication.");
  });

  it("preserves inline header content with Windows line endings", () => {
    const { getByRole } = render(view(`${OPEN} Explication.\r\n${CLOSE}\r\n`));
    expect(getByRole("complementary").textContent).toContain("Explication.");
  });

  it.each(["```markdown", "~~~~markdown", "````markdown"])("never transforms an example inside %s", (fence) => {
    const source = `${fence}\n${OPEN}\nExemple.\n${CLOSE}\n${fence.match(/^[`~]+/)![0]}`;
    expect(splitInsightBlocks(source, false)).toEqual([{ kind: "markdown", start: 0, text: source, complete: true }]);
  });

  it("leaves quoted, indented and multiline inline-code examples alone", () => {
    for (const source of [
      `    ${OPEN}\n    Exemple.\n    ${CLOSE}`,
      `> ${OPEN}\n> Exemple.\n> ${CLOSE}`,
      `\`\`exemple\n${OPEN}\nTexte\n${CLOSE}\n\`\``,
      "Un `★ Insight ───` cité dans une phrase.",
    ]) expect(splitInsightBlocks(source, false).every((block) => block.kind === "markdown")).toBe(true);
  });

  it("does not consume a final message with an unmatched opening delimiter", () => {
    const source = `Avant.\n\n${OPEN}\nTexte sans fermeture.`;
    expect(splitInsightBlocks(source, false)).toEqual([{ kind: "markdown", start: 0, text: source, complete: true }]);
    expect(splitInsightBlocks(source, true).slice(-1)[0]?.kind).toBe("insight");
  });
});
