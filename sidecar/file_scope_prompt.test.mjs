import { describe, expect, it } from "vitest";
import { stripFileScopeInstruction, withFileScopeInstruction } from "./file_scope_prompt.mjs";

describe("file scope prompt", () => {
  it("conserve la demande et interdit les écritures d’automatisation et git add -A", () => {
    const enriched = withFileScopeInstruction("surveille ERA5");
    expect(enriched.startsWith("surveille ERA5")).toBe(true);
    expect(enriched).toContain("Automated, heartbeat, monitoring, status, and wait turns are read-only");
    expect(enriched).toContain("Never use git add -A");
    expect(enriched).toContain("pre-existing worktree change");
  });

  it("retire tous les blocs internes des messages restaurés", () => {
    const restored = "question\n\n<atelier-file-scope>old</atelier-file-scope>\n\n" +
      "<atelier-file-scope>new</atelier-file-scope>";
    expect(stripFileScopeInstruction(restored)).toBe("question");
  });
});
