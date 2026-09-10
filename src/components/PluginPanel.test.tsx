import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderUi, resetTestState } from "../test/render";
import { setLanguage } from "../lib/i18n";
import PluginPanel from "./PluginPanel";

beforeEach(() => { resetTestState(); setLanguage("en"); });
afterEach(cleanup);

describe("plugin catalog states", () => {
  it("distinguishes loading and failure from an empty catalog", () => {
    const retry = vi.fn();
    const view = renderUi(<PluginPanel plugins={[]} loading onClose={() => {}} />);
    expect(screen.getByText("Loading plugins…")).toBeTruthy();
    expect(screen.queryByText("No installed plugins found in Codex.")).toBeNull();
    view.rerender(<PluginPanel plugins={[]} error="test failure" onRetry={retry} onClose={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("test failure");
    expect(screen.queryByText("No installed plugins found in Codex.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("only offers mentions for attachable plugins", () => {
    const skill = { name: "draw", path: "/tmp/SKILL.md" };
    renderUi(<PluginPanel onClose={() => {}} plugins={[
      { id: "enabled", name: "enabled", displayName: "Enabled", description: "", enabled: true, skills: [skill], primarySkill: skill },
      { id: "disabled", name: "disabled", displayName: "Disabled", description: "", enabled: false, skills: [skill], primarySkill: skill },
      { id: "mcp", name: "mcp", displayName: "MCP", description: "", enabled: true, skills: [] },
    ]} />);
    expect(screen.getByText("@enabled")).toBeTruthy();
    expect(screen.queryByText("@disabled")).toBeNull();
    expect(screen.getByText("No attachable skill")).toBeTruthy();
  });
});

it("shows native mentions only for callable apps", () => {
  const app = { id: "app", name: "app-drive", displayName: "Drive", description: "", kind: "app" as const,
    enabled: true, skills: [], callable: true, appMention: { type: "mention" as const, name: "Drive", path: "app://drive" } };
  const view = renderUi(<PluginPanel plugins={[app]} onClose={() => {}} />);
  expect(screen.getByText("@app-drive")).toBeTruthy();
  expect(screen.getByText("Tools available")).toBeTruthy();
  view.rerender(<PluginPanel plugins={[{ ...app, callable: false }]} onClose={() => {}} />);
  expect(screen.queryByText("@app-drive")).toBeNull();
  expect(screen.getByText("Tools unavailable")).toBeTruthy();
});

it("refreshes the visible app catalog after an external connection", () => {
  class Socket extends EventTarget { readyState = 1; send = vi.fn(); }
  const socket = new Socket();
  const refresh = vi.fn();
  renderUi(<PluginPanel plugins={[]} onClose={() => {}} onRetry={refresh} socket={socket as unknown as WebSocket} />);
  fireEvent.click(screen.getByRole("button", { name: "Browse apps" }));
  expect(socket.send).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  expect(refresh).toHaveBeenCalledOnce();
  expect(socket.send).toHaveBeenCalledTimes(2);
});
