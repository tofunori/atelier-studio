import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgentActivity } from "./AgentActivity.tsx";
import type { ChatItem } from "./store/types.ts";

describe("AgentActivity", () => {
  it("résume un outil en cours et garde sa commande disponible", () => {
    const item: ChatItem = {
      id: "tool:t:c1",
      turnId: "t",
      kind: "tool",
      text: "",
      durable: true,
      promoted: true,
      toolName: "Bash",
      toolInput: { command: "npm test" },
      toolStatus: "running",
    };
    render(<AgentActivity items={[item]} />);
    expect(screen.getByText("Exécute Bash…")).toBeInTheDocument();
    expect(screen.getAllByText("npm test")).toHaveLength(2);
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Exécute Bash…· 0 s");
  });
});
