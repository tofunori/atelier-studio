import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HistorySurface from "./HistorySurface";
import { setLanguage } from "../lib/i18n";

vi.mock("./AtelierDiffView", () => ({
  default: ({ before, after }: { before: string; after: string }) => <pre data-testid="diff">{before}→{after}</pre>,
}));

let socket: EventTarget;
function fakeWs() {
  const sent: any[] = [];
  socket = new EventTarget();
  const ws = Object.assign(socket, { readyState: 1, send: (raw: string) => sent.push(JSON.parse(raw)) }) as unknown as WebSocket;
  return { ws, sent };
}

function reply(detail: Record<string, unknown>) {
  act(() => { socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(detail) })); });
}

const ROOT = "/proj/these";
const now = Date.now();
const turn = {
  id: "turn:t1:u1:abcd", kind: "turn", ts: now - 60_000, title: "Corrige le chiffre de 40 %", provider: "codex",
  threadId: "t1", threadTitle: "Relire la discussion", snapshot: "abcd1234",
  files: [{ path: "results.tex", add: 2, del: 3, before: { git: "abcd1234" }, after: { turn: { threadId: "t1", turnId: "u1", sha: "abcd1234" } } }],
};
const version = {
  id: "version:feed", kind: "version", ts: now - 120_000, title: "Envoyé à Christophe", sha: "feed1234", fileCount: 1,
  files: [{ path: "main.tex", add: 1, del: 0, before: { empty: true }, after: { git: "feed1234" } }],
};

describe("HistorySurface", () => {
  beforeEach(() => { setLanguage("fr"); (globalThis as any).WebSocket ??= { OPEN: 1 }; });
  afterEach(cleanup);

  it("charge le fil, déplie une entrée sur son diff et restaure le fichier", () => {
    const { ws, sent } = fakeWs();
    render(<HistorySurface ws={ws} projectRoot={ROOT} visible onOpenFile={() => {}} />);
    const list = sent.find((m) => m.type === "projectHistory");
    expect(list).toMatchObject({ projectRoot: ROOT });
    reply({ type: "projectHistory", projectRoot: ROOT, requestId: list.requestId, repo: true, entries: [turn, version] });

    expect(screen.getByText("Aujourd’hui")).toBeTruthy();
    expect(screen.getByText("Envoyé à Christophe")).toBeTruthy();
    fireEvent.click(screen.getByText("Corrige le chiffre de 40 %"));

    const diff = sent.find((m) => m.type === "projectHistoryDiff");
    expect(diff).toMatchObject({ path: "results.tex", before: { git: "abcd1234" }, after: turn.files[0].after });
    reply({ type: "projectHistoryDiff", projectRoot: ROOT, requestId: diff.requestId, path: "results.tex",
      before: { state: "text", text: "avant" }, after: { state: "text", text: "après" } });
    expect(screen.getByTestId("diff").textContent).toBe("avant→après");

    fireEvent.click(screen.getByText("Restaurer ce fichier"));
    const restore = sent.find((m) => m.type === "projectHistoryRestore");
    expect(restore).toMatchObject({ path: "results.tex", ref: turn.files[0].after });
    expect(restore.label).toMatch(/^Corrige le chiffre de 40 %, aujourd’hui /);
  });

  it("filtre sur les versions", () => {
    const { ws, sent } = fakeWs();
    render(<HistorySurface ws={ws} projectRoot={ROOT} visible onOpenFile={() => {}} />);
    const list = sent.find((m) => m.type === "projectHistory");
    reply({ type: "projectHistory", projectRoot: ROOT, requestId: list.requestId, repo: true, entries: [turn, version] });
    fireEvent.click(screen.getByRole("radio", { name: "Versions" }));
    expect(screen.queryByText("Corrige le chiffre de 40 %")).toBeNull();
    expect(screen.getByText("Envoyé à Christophe")).toBeTruthy();
  });

  it("hors dépôt Git : le dit, et coupe versions et restauration", () => {
    const { ws, sent } = fakeWs();
    render(<HistorySurface ws={ws} projectRoot={ROOT} visible onOpenFile={() => {}} />);
    const list = sent.find((m) => m.type === "projectHistory");
    reply({ type: "projectHistory", projectRoot: ROOT, requestId: list.requestId, repo: false, entries: [] });
    expect(screen.getByText(/pas un dépôt Git/)).toBeTruthy();
    expect((screen.getByText("Enregistrer une version").closest("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("ignore la réponse d'un autre projet", () => {
    const { ws, sent } = fakeWs();
    render(<HistorySurface ws={ws} projectRoot={ROOT} visible onOpenFile={() => {}} />);
    const list = sent.find((m) => m.type === "projectHistory");
    reply({ type: "projectHistory", projectRoot: "/autre", requestId: list.requestId, repo: true, entries: [turn] });
    expect(screen.queryByText("Corrige le chiffre de 40 %")).toBeNull();
  });
  it("changer de projet repart d'un fil vide et le redemande", () => {
    const { ws, sent } = fakeWs();
    const view = render(<HistorySurface ws={ws} projectRoot={ROOT} visible onOpenFile={() => {}} />);
    const list = sent.find((m) => m.type === "projectHistory");
    reply({ type: "projectHistory", projectRoot: ROOT, requestId: list.requestId, repo: true, entries: [turn] });
    expect(screen.getByText("Corrige le chiffre de 40 %")).toBeTruthy();
    view.rerender(<HistorySurface ws={ws} projectRoot="/proj/autre" visible onOpenFile={() => {}} />);
    expect(screen.queryByText("Corrige le chiffre de 40 %")).toBeNull();
    expect(sent.filter((m) => m.type === "projectHistory").slice(-1)[0]).toMatchObject({ projectRoot: "/proj/autre" });
  });
});
