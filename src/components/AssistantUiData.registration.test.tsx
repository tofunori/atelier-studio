// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

type DataRenderer = (props: {
  type: "data";
  name: string;
  data: unknown;
  status: { type: "complete" };
}) => React.ReactNode;

const registry = vi.hoisted(() => {
  const active = new Map<string, DataRenderer>();
  const registrations: { name: string; render: DataRenderer }[] = [];
  const setDataUI = vi.fn((name: string, render: DataRenderer) => {
    active.set(name, render);
    registrations.push({ name, render });
    return () => {
      if (active.get(name) === render) active.delete(name);
    };
  });
  const aui = { dataRenderers: { setDataUI } };
  return { active, registrations, setDataUI, aui };
});

vi.mock("@assistant-ui/react", async () => {
  const actual = await vi.importActual<typeof import("@assistant-ui/react")>("@assistant-ui/react");
  return { ...actual, useAui: () => registry.aui };
});

import { AssistantUiData } from "./AssistantUiData";

afterEach(() => {
  cleanup();
  registry.active.clear();
  registry.registrations.length = 0;
  registry.setDataUI.mockClear();
});

describe("AssistantUiData registration", () => {
  it("registers once per runtime while invoking the latest host callbacks", async () => {
    const firstOpenFile = vi.fn();
    const latestOpenFile = vi.fn();
    const { rerender } = render(
      <AssistantUiData threadId="thread-a" onOpenFile={firstOpenFile} />,
    );

    await waitFor(() => expect(registry.setDataUI).toHaveBeenCalledTimes(11));
    const firstRendererCount = registry.active.size;

    rerender(
      <AssistantUiData threadId="thread-b" onOpenFile={latestOpenFile} />,
    );
    await waitFor(() => expect(registry.setDataUI).toHaveBeenCalledTimes(11));
    expect(firstRendererCount).toBe(11);
    expect(registry.active.size).toBe(11);

    const EditRenderer = registry.active.get("atelier-edit");
    expect(EditRenderer).toBeDefined();
    if (!EditRenderer) throw new Error("atelier-edit renderer was not registered");
    const RegisteredEditRenderer: DataRenderer = EditRenderer;
    render(
      <RegisteredEditRenderer
        type="data"
        name="atelier-edit"
        data={{ files: [{ path: "src/main.ts", add: 1, del: 0 }] }}
        status={{ type: "complete" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir" }));
    expect(latestOpenFile).toHaveBeenCalledWith("src/main.ts", {
      diff: true,
      baseSha: null,
    });
    expect(firstOpenFile).not.toHaveBeenCalled();
  });
});
