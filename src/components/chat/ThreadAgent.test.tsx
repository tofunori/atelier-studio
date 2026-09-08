import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createThreadEventStore } from "../../lib/threadEventStore";
import type { AgentEvent } from "../../lib/ws";
import ThreadAgent from "./ThreadAgent";
import type { AgentDisplay } from "./AgentActivity";

const renders = vi.hoisted(() => ({ panel: 0 }));
vi.mock("./AgentActivity", async importOriginal => ({
  ...await importOriginal<typeof import("./AgentActivity")>(),
  AgentDetailPanel: ({ events }: { events: AgentEvent[] }) => {
    renders.panel++;
    return <output data-testid="agent-events">{JSON.stringify(events)}</output>;
  },
}));
const agent: AgentDisplay = { threadId: "child", displayName: "Review", status: "working", statusMessage: null, prompt: null, model: null, reasoningEffort: null, agentPath: null };

describe("ThreadAgent subscription and polling boundary", () => {
  it("an open agent never rerenders the workspace and a hidden agent unsubscribes", () => {
    const store = createThreadEventStore({ parent: [], child: [] });
    let root = 0;
    function Workspace({ visible }: { visible: boolean }) {
      root++;
      return <ThreadAgent store={store} agent={agent} parentThreadId="parent" parentWorkingSince={1} ws={null} visible={visible} onClose={() => {}} />;
    }
    const view = render(<Workspace visible />);
    const initial = root;
    act(() => store.update(p => ({ ...p, child: [{ kind: "text", text: "résultat" }] })));
    expect(root).toBe(initial);
    expect(screen.getByTestId("agent-events").textContent).toContain("résultat");
    view.rerender(<Workspace visible={false} />);
    const hidden = renders.panel;
    act(() => store.update({ parent: [{ kind: "streaming", text: "parent" }], child: [{ kind: "text", text: "next" }] }));
    expect(renders.panel).toBe(hidden);
    view.unmount();
  });
  it("history polling stops when hidden, unmounted or after the parent settles", () => {
    vi.useFakeTimers();
    const store = createThreadEventStore();
    const send = vi.fn();
    const ws = { readyState: WebSocket.OPEN, send } as unknown as WebSocket;
    const props = { store, agent, parentThreadId: "parent", parentWorkingSince: 1 as number | null, ws, visible: true, onClose: () => {} };
    const view = render(<ThreadAgent {...props} />);
    act(() => vi.advanceTimersByTime(5000));
    expect(send).toHaveBeenCalledTimes(3);
    view.rerender(<ThreadAgent {...props} visible={false} />);
    act(() => vi.advanceTimersByTime(5000)); expect(send).toHaveBeenCalledTimes(3);
    view.rerender(<ThreadAgent {...props} parentWorkingSince={null} />);
    expect(send).toHaveBeenCalledTimes(4);
    act(() => vi.advanceTimersByTime(5000)); expect(send).toHaveBeenCalledTimes(4);
    view.unmount(); act(() => vi.advanceTimersByTime(5000)); expect(send).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });
});
