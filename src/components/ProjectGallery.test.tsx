import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent, cleanup, act, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import ProjectGallery, { sourceFileIdentity } from "./ProjectGallery";
import { renderUi } from "../test/render";
import { setLanguage } from "../lib/i18n";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue("http://127.0.0.1:18790/figures_index.html") }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const config = { mainGallery: true, folders: [{ path: "/data", name: "Data", access: "read" as const, gallery: true }] };
function setup() {
  setLanguage("fr");
  const onManage = vi.fn();
  const result = renderUi(<ProjectGallery root="/main" config={config} ws={null}
    galleryUrl="http://127.0.0.1:19000/figures_index.html#atelier_nonce=test"
    mainGallery={<iframe title="main gallery" data-atelier-role="gallery" src="http://127.0.0.1:19000/"/>}
    onManage={onManage} onOpen={async () => {}} reloadKey={0}/>);
  return { ...result, onManage };
}
function message(frame: HTMLIFrameElement, data: object, origin = new URL(frame.src).origin, source = frame.contentWindow) {
  act(() => window.dispatchEvent(new MessageEvent("message", { data, origin, source })));
}
describe("project gallery", () => {
  it("uses both complete galleries in All folders, never the reduced catalog", async () => {
    const { container } = setup();
    const secondary = await screen.findByTitle("Galerie — Data") as HTMLIFrameElement;
    expect(screen.getByTitle("main gallery")).toBeVisible();
    expect(secondary).toBeVisible();
    expect(screen.getAllByRole("heading").map(h => h.textContent)).toEqual(["main", "Data"]);
    expect(container.querySelector(".project-gallery-catalog")).toBeNull();
    expect(container.querySelector(".project-gallery-grid")).toBeNull();
    expect(secondary.src).toBe("http://127.0.0.1:18790/figures_index.html?embedded=atelier#atelier_nonce=test");
    expect(invoke).toHaveBeenCalledWith("start_atelier", expect.objectContaining({ root: "/data" }));
    expect(sourceFileIdentity("/main", "plot.png")).not.toBe(sourceFileIdentity("/data", "plot.png"));
  });
  it("keeps both frame instances while selecting one folder and returning to All", async () => {
    const { container } = setup();
    const secondary = await screen.findByTitle("Galerie — Data") as HTMLIFrameElement;
    const main = screen.getByTitle("main gallery") as HTMLIFrameElement;
    message(secondary, { type: "atelier-folder-select", path: "/data" });
    expect(main).not.toBeVisible(); expect(secondary).toBeVisible();
    expect(screen.queryByRole("heading")).toBeNull();
    message(secondary, { type: "atelier-folder-select", path: "all" });
    expect(main).toBeVisible(); expect(secondary).toBeVisible();
    expect(container.querySelectorAll("iframe")).toHaveLength(2);
    expect(screen.getByTitle("Galerie — Data")).toBe(secondary);
    message(main, { type: "atelier-folder-select", path: "/main" });
    expect(main).toBeVisible(); expect(secondary).not.toBeVisible();
  });
  it("validates the frame, origin and folder in both grouped and individual modes", async () => {
    const { onManage } = setup();
    const secondary = await screen.findByTitle("Galerie — Data") as HTMLIFrameElement;
    const main = screen.getByTitle("main gallery") as HTMLIFrameElement;
    const post = vi.spyOn(secondary.contentWindow!, "postMessage");
    fireEvent.load(secondary);
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "atelier-folder-state", state: expect.objectContaining({ selected: "all" }) }), "http://127.0.0.1:18790");
    message(secondary, { type: "atelier-folder-select", path: "/main" }, "https://untrusted.example");
    message(secondary, { type: "atelier-folder-manage" }, undefined, window);
    message(secondary, { type: "atelier-folder-select", path: "/unknown" });
    expect(secondary).toBeVisible(); expect(onManage).not.toHaveBeenCalled();
    message(secondary, { type: "atelier-folder-manage" });
    expect(onManage).toHaveBeenCalledOnce();
    message(main, { type: "atelier-folder-select", path: "/main" });
    message(secondary, { type: "atelier-folder-select", path: "all" });
    expect(secondary).not.toBeVisible();
  });
  it("reveals the folder targeted by a host gallery command", async () => {
    setup();
    const secondary = await screen.findByTitle("Galerie — Data") as HTMLIFrameElement;
    message(secondary, { type: "atelier-folder-select", path: "/data" });
    act(() => window.dispatchEvent(new CustomEvent("atelier-gallery-reveal-folder", { detail: { root: "/main" } })));
    expect(screen.getByTitle("main gallery")).toBeVisible();
    expect(secondary).not.toBeVisible();
  });
  it("keeps the single-folder view without a second heading or toolbar", () => {
    const { container } = renderUi(<ProjectGallery root="/main" ws={null} mainGallery={<div>Native gallery</div>} onManage={() => {}} onOpen={async () => {}} reloadKey={0}/>);
    expect(screen.getByText("Native gallery")).toBeVisible();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(container.querySelector(".project-gallery-toolbar")).toBeNull();
  });
  it("retains folder navigation and reports a failed source startup", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error("Cannot start Data"));
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot start Data");
    expect(screen.getByRole("button", { name: "Dossiers" })).toBeVisible();
    expect(screen.getByTitle("main gallery")).toBeVisible();
  });
  it("removes a revoked folder and ignores its late startup", async () => {
    let resolve!: (url: string) => void;
    vi.mocked(invoke).mockImplementationOnce(() => new Promise(r => { resolve = r as typeof resolve; }));
    const props = { root: "/main", ws: null, mainGallery: <div>Main</div>, onManage: () => {}, onOpen: async () => {}, reloadKey: 0 };
    const { rerender } = renderUi(<ProjectGallery {...props} config={config}/>);
    rerender(<ProjectGallery {...props} config={{ mainGallery: true, folders: [] }}/>);
    await act(async () => resolve("http://127.0.0.1:18790/figures_index.html"));
    await waitFor(() => expect(screen.queryByTitle("Galerie — Data")).toBeNull());
  });
});
