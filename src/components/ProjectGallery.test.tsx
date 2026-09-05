import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent, cleanup, act } from "@testing-library/react";
import ProjectGallery, { sourceFileIdentity } from "./ProjectGallery";
import { renderUi } from "../test/render";
import { setLanguage } from "../lib/i18n";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue("http://127.0.0.1:18790/") }));

class Socket extends EventTarget {
  readyState = 1;
  send = vi.fn();
  reply(sources: unknown[]) { const request = JSON.parse(this.send.mock.calls.slice(-1)[0][0]); this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ ...request, sources }) })); }
}
afterEach(cleanup);
describe("project gallery", () => {
  it("keeps same-name files distinct and opens the source folder", async () => {
    setLanguage("fr"); const socket = new Socket(); const onOpen = vi.fn().mockResolvedValue(undefined);
    renderUi(<ProjectGallery root="/main" config={{ mainGallery: true, folders: [{ path: "/data", name: "Données", access: "read", gallery: true }] }} ws={socket as unknown as WebSocket} mainGallery={<div>Galerie native</div>} onManage={() => {}} onOpen={onOpen} reloadKey={0}/>);
    await act(async () => socket.reply([{ root: "/main", name: "Main", files: ["plot.png"] }, { root: "/data", name: "Données", files: ["plot.png"] }]));
    expect(screen.getAllByText("plot.png").length).toBe(4);
    expect(sourceFileIdentity("/main", "plot.png")).not.toBe(sourceFileIdentity("/data", "plot.png"));
    fireEvent.click(screen.getByRole("button", { name: "Dossiers" }));
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Données" }));
    fireEvent.click(screen.getByTitle("/data/plot.png"));
    expect(onOpen).toHaveBeenCalledWith("/data", "plot.png");
  });
  it("uses the native toolbar bridge and accepts only its frame and known folders", async () => {
    setLanguage("fr");
    const onManage = vi.fn();
    const { container } = renderUi(<ProjectGallery root="/main" config={{ mainGallery: true, folders: [{ path: "/data", name: "Data", access: "read", gallery: true }] }} ws={new Socket() as unknown as WebSocket} mainGallery={<iframe title="gallery" data-atelier-role="gallery" src="http://localhost:19000/"/>} onManage={onManage} onOpen={async () => {}} reloadKey={0}/>);
    fireEvent.click(screen.getByRole("button", { name: "Dossiers" }));
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "main" }));
    const frame = container.querySelector("iframe")!;
    expect(container.querySelector(".project-gallery-toolbar")).toBeNull();
    const post = vi.spyOn(frame.contentWindow!, "postMessage");
    const receive = (data: object, origin = "http://localhost:19000", source = frame.contentWindow) => act(() => { window.dispatchEvent(new MessageEvent("message", { data, origin, source })); });
    receive({ type: "atelier-folder-ready" });
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "atelier-folder-state", state: expect.objectContaining({ selected: "/main" }) }), "http://localhost:19000");
    receive({ type: "atelier-folder-manage" }, "https://untrusted.example");
    receive({ type: "atelier-folder-manage" }, "http://localhost:19000", window);
    expect(onManage).not.toHaveBeenCalled();
    receive({ type: "atelier-folder-select", path: "/unknown" });
    expect(container.querySelector(".project-gallery-toolbar")).toBeNull();
    receive({ type: "atelier-folder-manage" });
    expect(onManage).toHaveBeenCalledOnce();
    receive({ type: "atelier-folder-select", path: "all" });
    expect(container.querySelectorAll(".project-gallery-toolbar")).toHaveLength(1);
    expect(container.querySelector("iframe")).toBe(frame);
    fireEvent.click(screen.getByRole("button", { name: "Dossiers" }));
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "main" }));
    expect(container.querySelector(".project-gallery-toolbar")).toBeNull();
    expect(container.querySelector("iframe")).toBe(frame);
  });
  it("keeps the native gallery for a single folder instead of offering an all-folders catalog", () => {
    const { container } = renderUi(<ProjectGallery root="/main" ws={new Socket() as unknown as WebSocket} mainGallery={<div>Native gallery</div>} onManage={() => {}} onOpen={async () => {}} reloadKey={0}/>);
    expect(screen.getByText("Native gallery")).toBeVisible();
    expect(container.querySelector(".project-gallery-catalog")).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
  });
  it("ignores stale catalog replies after a project change", async () => {
    const socket = new Socket(); const props = { config: { mainGallery: false, folders: [] }, ws: socket as unknown as WebSocket, mainGallery: null, onManage: () => {}, onOpen: async () => {}, reloadKey: 0 };
    const { rerender } = renderUi(<ProjectGallery {...props} root="/a"/>);
    const stale = JSON.parse(socket.send.mock.calls.slice(-1)[0][0]);
    rerender(<ProjectGallery {...props} root="/b"/>);
    await act(async () => socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ ...stale, sources: [{ root: "/a", name: "A", files: ["old.pdf"] }] }) })));
    expect(screen.queryByText("old.pdf")).toBeNull();
  });
});
