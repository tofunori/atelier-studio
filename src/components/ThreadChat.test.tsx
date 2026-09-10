import { act, render, screen } from "@testing-library/react";
import { useState, type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { createThreadEventStore } from "../lib/threadEventStore";
import { reduceHarnessEvents } from "../lib/harnessEvents";
import type { AgentEvent } from "../lib/ws";
import ThreadChat from "./ThreadChat";
import type { Pin } from "../lib/pins";

const counts = vi.hoisted(() => new Map<string, number>());
vi.mock("./AssistantUiChat", () => ({ default: ({ threadId, events, pins }: { threadId: string; events: AgentEvent[]; pins: unknown[] }) => {
  counts.set(threadId, (counts.get(threadId) ?? 0) + 1);
  return <output data-testid={threadId}>{JSON.stringify({ events, pins })}</output>;
} }));
const props = {} as Omit<ComponentProps<typeof ThreadChat>, "eventStore" | "threadId" | "threadPins" | "setPins">;

describe("ThreadChat — production subscription boundary", () => {
  it("1000 fragments update only their transcript, with no workspace or sibling renders", () => {
    counts.clear();
    const store = createThreadEventStore({ a: [], b: [{ kind: "text", text: "stable" }] });
    let rootRenders = 0;
    function Workspace() {
      rootRenders++;
      const [, setPins] = useState<Record<string, Pin[]>>({});
      return <><ThreadChat {...props} threadId="a" eventStore={store} threadPins={undefined} setPins={setPins} />
        <ThreadChat {...props} threadId="b" eventStore={store} threadPins={undefined} setPins={setPins} /></>;
    }
    const view = render(<Workspace />);
    const baseline = { root: rootRenders, a: counts.get("a")!, b: counts.get("b")! };
    for (let index = 0; index < 1000; index++) act(() => store.update(previous => ({
      ...previous, a: reduceHarnessEvents(previous.a, [{ kind: "delta", text: "x" }]),
    })));
    expect(rootRenders).toBe(baseline.root);
    expect(counts.get("b")).toBe(baseline.b);
    expect(counts.get("a")).toBe(baseline.a + 1000);
    expect(JSON.parse(screen.getByTestId("a").textContent!).events[0].text).toBe("x".repeat(1000));
    view.unmount();
  });

  it("two simultaneous streams stay below the workspace boundary", () => {
    counts.clear();
    const store = createThreadEventStore({ a: [], b: [] });
    let root = 0;
    function Workspace() {
      root++;
      const [, setPins] = useState<Record<string, Pin[]>>({});
      return <>{["a", "b"].map(id => <ThreadChat key={id} {...props} threadId={id} eventStore={store} threadPins={undefined} setPins={setPins} />)}</>;
    }
    const view = render(<Workspace />);
    for (let index = 0; index < 1000; index++) act(() => store.update(p => ({
      ...p,
      a: reduceHarnessEvents(p.a, [{ kind: "delta", text: "a" }]),
      b: reduceHarnessEvents(p.b, [{ kind: "delta", text: "b" }]),
    })));
    expect(root).toBe(1);
    for (const id of ["a", "b"]) {
      expect(counts.get(id)).toBe(1001);
      expect(JSON.parse(screen.getByTestId(id).textContent!).events[0].text).toBe(id.repeat(1000));
    }
    view.unmount();
  });

  it("switching and eviction use the selected snapshot immediately and detach the former thread", () => {
    counts.clear();
    const store = createThreadEventStore({ a: [{ kind: "text", text: "alpha" }], b: [{ kind: "text", text: "beta" }] });
    const setPins = vi.fn();
    const view = render(<ThreadChat {...props} threadId="a" eventStore={store} threadPins={undefined} setPins={setPins} />);
    view.rerender(<ThreadChat {...props} threadId="b" eventStore={store} threadPins={undefined} setPins={setPins} />);
    const renders = counts.get("b");
    act(() => store.update(p => ({ ...p, a: [] })));
    expect(counts.get("b")).toBe(renders);
    expect(screen.getByTestId("b").textContent).toContain("beta");
    act(() => store.update(({ b: _, ...rest }) => rest));
    expect(JSON.parse(screen.getByTestId("b").textContent!).events).toEqual([]);
    view.unmount();
  });

  it("reconciles a legacy pin on history arrival in the subscribed chat", () => {
    const store = createThreadEventStore();
    let saved: unknown;
    function Workspace() {
      const [pins, setPins] = useState<Record<string, Pin[]>>({ a: [{ index: 0, label: "glacier" }] });
      saved = pins;
      return <ThreadChat {...props} threadId="a" eventStore={store} threadPins={pins.a} setPins={setPins} />;
    }
    const view = render(<Workspace />);
    act(() => store.update({ a: [{ kind: "user", text: "question" }, { kind: "text", text: "Le glacier" }] }));
    expect(saved).toEqual({ a: [{ index: 1, label: "glacier" }] });
    view.unmount();
  });
});
