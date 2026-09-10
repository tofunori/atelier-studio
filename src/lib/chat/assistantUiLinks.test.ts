import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumePendingPassageOpen,
  resetPendingPassageOpenForTests,
} from "../pendingPassageOpen";
import {
  handleAssistantUiLink,
  parseAssistantUiGbrainPassageRef,
  parseAssistantUiKnowledgeSourceRef,
  parseAssistantUiZoteroPassageRef,
} from "./assistantUiLinks";
import { openUrl } from "@tauri-apps/plugin-opener";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(() => Promise.resolve()),
}));

const openUrlMock = vi.mocked(openUrl);

function listen<T>(name: string): { value: T | undefined; stop: () => void } {
  let value: T | undefined;
  const listener = (event: Event) => {
    value = (event as CustomEvent<T>).detail;
  };
  window.addEventListener(name, listener);
  return { get value() { return value; }, stop: () => window.removeEventListener(name, listener) };
}

describe("assistant-ui markdown link navigation", () => {
  beforeEach(() => {
    resetPendingPassageOpenForTests();
    openUrlMock.mockClear();
  });

  it("opens a local file reference from href or visible label", () => {
    const event = listen<{ rel: string; line: string | null; diff: boolean; baseSha: string | null }>("chat-open-file");
    expect(handleAssistantUiLink("src/App.tsx:12-14")).toBe(true);
    expect(event.value).toEqual({ rel: "src/App.tsx", line: "12-14", diff: false, baseSha: null });
    expect(handleAssistantUiLink("#file", "README.md:4")).toBe(true);
    expect(event.value).toEqual({ rel: "README.md", line: "4", diff: false, baseSha: null });
    event.stop();
  });

  it("treats href as authoritative and normalizes local URI-encoded paths", () => {
    const event = listen<{ rel: string; line: string | null }>("chat-open-file");
    expect(handleAssistantUiLink("/full/results.tex", "results.tex")).toBe(true);
    expect(event.value).toMatchObject({ rel: "/full/results.tex", line: null });

    expect(handleAssistantUiLink("/Users/thierry/My%20Notes/results%20final.tex:10")).toBe(true);
    expect(event.value).toMatchObject({ rel: "/Users/thierry/My Notes/results final.tex", line: "10" });

    expect(handleAssistantUiLink("file:///Users/thierry/My%20Notes/results%20final.tex")).toBe(true);
    expect(event.value).toMatchObject({ rel: "/Users/thierry/My Notes/results final.tex", line: null });

    expect(handleAssistantUiLink("tauri://localhost/Users/thierry/My%20Notes/results%20final.tex:12-14")).toBe(true);
    expect(event.value).toMatchObject({ rel: "/Users/thierry/My Notes/results final.tex", line: "12-14" });
    event.stop();
  });

  it("dispatches Zotero and gbrain passages and records retry state", () => {
    const zoteroEvent = listen<unknown>("chat-open-zotero-passage");
    const gbrainEvent = listen<unknown>("kb-open-gbrain-passage");
    const zotero = "#atelier-zotero-passage?key=ITEM1&file=paper.pdf&page=4&quote=exact";
    expect(handleAssistantUiLink(zotero)).toBe(true);
    expect(zoteroEvent.value).toMatchObject({ kind: "zotero", key: "ITEM1", page: 4, quote: "exact" });
    expect(consumePendingPassageOpen()).toMatchObject({ kind: "zotero" });

    const gbrain = "#atelier-gbrain-passage?slug=papers%2Facp-19-1393-2019&quote=quoted%20text";
    expect(handleAssistantUiLink(gbrain)).toBe(true);
    expect(gbrainEvent.value).toEqual({ slug: "papers/acp-19-1393-2019", quote: "quoted text" });
    expect(consumePendingPassageOpen()).toEqual({
      kind: "gbrain",
      detail: { slug: "papers/acp-19-1393-2019", quote: "quoted text" },
      ts: expect.any(Number),
    });
    zoteroEvent.stop();
    gbrainEvent.stop();
  });

  it("opens knowledge-base citations and external HTTP links", async () => {
    const citeEvent = listen<{ id: string | null; loc: string | null }>("kb-cite-open");
    expect(handleAssistantUiLink("#atelier-kb-src?id=src-1&loc=p.4", "source")).toBe(true);
    expect(citeEvent.value).toEqual({ id: "src-1", loc: "p.4" });
    expect(parseAssistantUiKnowledgeSourceRef("#atelier-kb-src?id=src-1")).toEqual({ kind: "kb-source", id: "src-1", loc: null });

    expect(handleAssistantUiLink("https://example.com/docs")).toBe(true);
    expect(handleAssistantUiLink("https://example.com/paper", "paper.pdf")).toBe(true);
    await Promise.resolve();
    expect(openUrlMock).toHaveBeenNthCalledWith(1, "https://example.com/docs");
    expect(openUrlMock).toHaveBeenNthCalledWith(2, "https://example.com/paper");
    citeEvent.stop();
  });

  it("rejects unsafe or malformed targets", () => {
    expect(handleAssistantUiLink("javascript:alert(1)")).toBe(false);
    expect(handleAssistantUiLink("file://remote-host/Users/t/results.tex")).toBe(false);
    expect(handleAssistantUiLink("#atelier-zotero-passage?pdfKey=ONLY_PDF")).toBe(false);
    expect(handleAssistantUiLink("#atelier-gbrain-passage?slug=../secret&quote=nope")).toBe(false);
    expect(parseAssistantUiZoteroPassageRef("#atelier-zotero-passage?key=ITEM1&page=0")).toBeNull();
    expect(parseAssistantUiGbrainPassageRef("#atelier-gbrain-passage?slug=ok&quote=")).toBeNull();
    expect(openUrlMock).not.toHaveBeenCalled();
  });
});
