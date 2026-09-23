import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectChatTabs } from "./ProjectChatTabs";
import { ChatHeader } from "./ChatHeader";
import { setLanguage } from "../../lib/i18n";

afterEach(cleanup);
beforeEach(() => setLanguage("fr"));
const chats = [{ id: "a", title: "Copernicus" }, { id: "b", title: "Albédo" }, { id: "c", title: "Discussion" }];

describe("project chat navigation", () => {
  it("switches conversations and reflects selection without retaining the previous active chat", () => {
    const onSelect = vi.fn();
    const { rerender } = render(<ProjectChatTabs chats={chats} activeId="a" onSelect={onSelect} onNew={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Albédo" }));
    expect(onSelect).toHaveBeenCalledWith("b");
    rerender(<ProjectChatTabs chats={chats} activeId="b" onSelect={onSelect} onNew={() => {}} />);
    expect(screen.getByRole("button", { name: "Albédo" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Copernicus" })).not.toHaveAttribute("aria-current");
  });
  it("shows completed unread tabs, including pinned tabs, and clears their indicator on selection", () => {
    const onSelect = vi.fn();
    const controls = { openChats: chats, pinnedIds: ["b"], onClose: vi.fn(), onTogglePin: vi.fn() };
    const props = { chats, controls, unread: new Set(["a", "b"]), onSelect, onNew: vi.fn() };
    const { container, rerender } = render(<ProjectChatTabs {...props} activeId="a" />);
    expect(container.querySelectorAll(".project-chat-tab-unread")).toHaveLength(1);
    const unreadTab = screen.getByRole("button", { name: "Albédo — Tour terminé · non lu" });
    expect(unreadTab).toHaveAttribute("title", "Tour terminé · non lu");
    fireEvent.click(unreadTab);
    expect(onSelect).toHaveBeenCalledWith("b");
    rerender(<ProjectChatTabs {...props} activeId="b" unread={new Set()} />);
    expect(container.querySelector(".project-chat-tab-unread")).toBeNull();
    rerender(<ProjectChatTabs {...props} activeId="a" unread={new Set()} />);
    expect(container.querySelector(".project-chat-tab-unread")).toBeNull();
  });
  it("does not show completion on a running or active tab", () => {
    const { container } = render(<ProjectChatTabs
      chats={[{ id: "a", title: "Active" }, { id: "b", title: "Running", status: "running" }]}
      unread={new Set(["a", "b"])} activeId="a" onSelect={vi.fn()} onNew={vi.fn()} />);
    expect(container.querySelector(".project-chat-tab-unread")).toBeNull();
  });
  it("supports arrows, Home and End without navigating until activation", () => {
    const onSelect = vi.fn();
    render(<ProjectChatTabs chats={chats} activeId="a" onSelect={onSelect} onNew={() => {}} />);
    const first = screen.getByRole("button", { name: "Copernicus" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowLeft" });
    expect(screen.getByRole("button", { name: "Discussion" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "End" });
    expect(screen.getByRole("button", { name: "Discussion" })).toHaveFocus();
    expect(onSelect).not.toHaveBeenCalled();
  });
  it("keeps all chats accessible through the menu and creates a chat through the existing action", async () => {
    const onSelect = vi.fn(), onNew = vi.fn();
    render(<ProjectChatTabs chats={chats} activeId="a" onSelect={onSelect} onNew={onNew} />);
    fireEvent.click(screen.getByRole("button", { name: "Nouveau chat" }));
    expect(onNew).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Tous les chats du projet" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Discussion" }));
    expect(onSelect).toHaveBeenCalledWith("c");
  });
  it("replaces the heading in the same header and preserves transcript controls", () => {
    const { container } = render(<ChatHeader title="Copernicus" provider="codex" projectName="Projet" status={null}
      projectChats={chats} activeId="a" onSelectChat={() => {}} onNewChat={() => {}}
      onTranscriptViewChange={() => {}} />);
    expect(container.querySelectorAll("header")).toHaveLength(1);
    expect(screen.getAllByText("Copernicus")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Vue de la transcription/ })).toBeInTheDocument();
  });
});
