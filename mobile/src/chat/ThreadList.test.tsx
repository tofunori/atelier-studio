import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { relativeThreadDate, ThreadList, threadDisplayTitle } from "./ThreadList.tsx";

afterEach(cleanup);

const thread = {
  id: "thread-1",
  title: "/Users/tofunori/Documents/UTQR/Master/AI",
  provider: "claude",
  model: "claude-fable-5",
  status: "idle",
  updatedAt: "2026-07-13T16:00:00.000Z",
  projectId: null,
  lastSequence: 175,
};

describe("ThreadList new chat", () => {
  it("turns raw paths into readable conversation titles", () => {
    expect(threadDisplayTitle(thread.title, thread.id)).toBe("AI");
    expect(threadDisplayTitle("outputs/raqdps/analyses/m42a_population_", "thread-2")).toBe(
      "M42a population",
    );
    expect(threadDisplayTitle("Analyse des résultats", "thread-3")).toBe("Analyse des résultats");
  });

  it("shows useful metadata without exposing sequence or idle internals", () => {
    render(
      <ThreadList
        threads={[thread]}
        loading={false}
        error={null}
        onOpen={vi.fn()}
        onRefresh={vi.fn()}
        onCreate={vi.fn().mockResolvedValue(undefined)}
        creating={false}
      />,
    );

    expect(screen.getByText("AI")).toBeInTheDocument();
    expect(screen.getByText("Claude · Fable 5")).toBeInTheDocument();
    expect(screen.queryByText(/seq 175|idle/)).not.toBeInTheDocument();
  });

  it("formats recent dates with concise French labels", () => {
    const now = Date.parse("2026-07-13T18:00:00.000Z");
    expect(relativeThreadDate("2026-07-13T17:48:00.000Z", now)).toBe("il y a 12 min");
    expect(relativeThreadDate("2026-07-12T18:00:00.000Z", now)).toBe("hier");
  });

  it("opens provider/model selection and submits the chosen values", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(
      <ThreadList
        threads={[]}
        loading={false}
        error={null}
        onOpen={vi.fn()}
        onRefresh={vi.fn()}
        onCreate={onCreate}
        creating={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Nouveau chat" }));
    expect(screen.getByRole("dialog", { name: "Nouveau chat" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("combobox", { name: /Provider : Codex/ }));
    const grok = await screen.findByRole("option", { name: "Grok" });
    fireEvent.pointerDown(grok, { pointerType: "mouse" });
    fireEvent.click(grok);
    fireEvent.click(screen.getByRole("combobox", { name: /Modèle : Grok 4\.5/ }));
    const grokModel = await screen.findByRole("option", { name: /Grok 4\.5/ });
    fireEvent.pointerDown(grokModel, { pointerType: "mouse" });
    fireEvent.click(grokModel);
    fireEvent.click(screen.getByRole("button", { name: "Créer avec Grok" }));

    expect(onCreate).toHaveBeenCalledWith({ title: "", provider: "grok", model: "grok-4.5" });
  });

  it("offers an explicit way to close the new-chat drawer", async () => {
    render(
      <ThreadList
        threads={[]}
        loading={false}
        error={null}
        onOpen={vi.fn()}
        onRefresh={vi.fn()}
        onCreate={vi.fn().mockResolvedValue(undefined)}
        creating={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Nouveau chat" }));
    expect(screen.getByRole("dialog", { name: "Nouveau chat" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Nouveau chat" })).not.toBeInTheDocument();
    });
  });
});
