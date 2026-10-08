// Vue Codes du panneau Annotations (codage qualitatif) : arbre avec effectifs
// sous-codes compris, vue d'un code, propositions de Claude, création.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import AnnotationsPanel from "./AnnotationsPanel";
import { codeFamily, codePassages, type Code } from "./CodesView";
import { renderUi, resetTestState } from "../test/render";
import { setLanguage } from "../lib/i18n";

const WARREN = "zotero/CCCC3333/Warren - 2013 - Can black carbon.pdf";
const GARDNER = "zotero/DDDD4444/Gardner et Sharp - 2010 - A review of snow albedo.pdf";
const CODES: Code[] = [
  { id: "c1", name: "Albédo", parent: null, memo: "Tout ce qui touche la réflectance.", depth: 0, path: "Albédo" },
  { id: "c2", name: "Impuretés", parent: "c1", depth: 1, path: "Albédo › Impuretés" },
  { id: "c3", name: "Méthode", parent: null, depth: 0, path: "Méthode" },
];
const LIB = {
  [WARREN]: [
    { id: "1", page: 2, kind: "code", text: "black carbon lowers albedo", codes: ["c2"] },
    { id: "2", page: 4, kind: "hl", text: "grain size growth", codes: ["c1"], suggested: ["c3"] },
  ],
  [GARDNER]: [
    { id: "3", page: 7, kind: "code", text: "spectral albedo model", by: "claude", suggested: ["c1"] },
  ],
};

function mockFetch() {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const body = String(url).endsWith("/codebook") && !init?.method
      ? { codes: CODES, stamp: 1 }
      : String(url).endsWith("/pdfannot-all") ? { annots: LIB } : { ok: true, code: { id: "c9" }, codes: CODES };
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  }));
  return calls;
}

const posted = (calls: { url: string; init?: RequestInit }[], path: string) =>
  calls.filter((c) => c.url.endsWith(path) && c.init?.method === "POST").map((c) => JSON.parse(String(c.init!.body)));

beforeEach(() => { resetTestState(); setLanguage("fr"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("codeFamily / codePassages", () => {
  it("un code compte ses sous-codes ; propositions à part", () => {
    expect(codeFamily(CODES, "c1")).toEqual(["c1", "c2"]);
    const { kept, pending } = codePassages(LIB, codeFamily(CODES, "c1"));
    expect(kept.map((x) => x.a.id)).toEqual(["1", "2"]);
    expect(pending.map((x) => x.a.id)).toEqual(["3"]);
  });
});

describe("vue Codes", () => {
  async function openCodes() {
    const calls = mockFetch();
    const onQuote = vi.fn();
    renderUi(<AnnotationsPanel galleryOrigin="http://127.0.0.1:1" onOpenAnnot={vi.fn()} onQuote={onQuote} />);
    fireEvent.click(await screen.findByRole("radio", { name: "Codes" }));
    await screen.findByText("Impuretés");
    return { calls, onQuote };
  }

  it("l'arbre montre passages · articles, sous-codes compris, et les propositions", async () => {
    await openCodes();
    const albedo = screen.getByText("Albédo").closest("button")!;
    expect(albedo.textContent).toContain("2 · 1");
    expect(albedo.querySelector(".codes-pending")?.textContent).toBe("1");
    expect(screen.getByText("Méthode").closest("button")!.textContent).toContain("0 · 0");
  });

  it("la vue d'un code groupe par article, garde une proposition et envoie tout au chat", async () => {
    const { calls, onQuote } = await openCodes();
    fireEvent.click(screen.getByText("Albédo"));
    expect(await screen.findByText("Proposés par Claude · 1")).toBeTruthy();
    expect((screen.getByLabelText("Mémo du code") as HTMLTextAreaElement).value).toBe("Tout ce qui touche la réflectance.");
    expect(screen.getByText("Warren 2013")).toBeTruthy();
    expect(screen.getByText(/spectral albedo model/)).toBeTruthy();
    // le passage codé par le sous-code porte son nom
    expect(screen.getByText("Impuretés")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Garder" }));
    await waitFor(() => expect(posted(calls, "/pdfannot-codes")).toEqual([{ rel: GARDNER, id: "3", keep: ["c1"] }]));
    fireEvent.click(screen.getByRole("button", { name: "Tout envoyer au chat" }));
    expect(onQuote).toHaveBeenCalledWith(expect.stringContaining("Code « Albédo » : 2 passages"));
    expect(onQuote).toHaveBeenCalledWith(expect.stringContaining("« black carbon lowers albedo »"));
    fireEvent.click(screen.getByLabelText("Retour aux codes"));
    expect(await screen.findByText("Méthode")).toBeTruthy();
  });

  it("le mémo s'enregistre en quittant le champ", async () => {
    const { calls } = await openCodes();
    fireEvent.click(screen.getByText("Méthode"));
    const memo = await screen.findByLabelText("Mémo du code");
    fireEvent.change(memo, { target: { value: "Données et protocole" } });
    fireEvent.blur(memo);
    await waitFor(() => expect(posted(calls, "/codebook")).toEqual([{ op: "update", id: "c3", memo: "Données et protocole" }]));
  });

  it("crée un code à la racine depuis le bouton +", async () => {
    const { calls } = await openCodes();
    fireEvent.click(screen.getByLabelText("Nouveau code"));
    const field = screen.getByPlaceholderText("Nom du code");
    fireEvent.change(field, { target: { value: "Rétroaction" } });
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => expect(posted(calls, "/codebook")).toEqual([{ op: "create", name: "Rétroaction", parent: null }]));
  });

  it("les codes d'une annotation apparaissent dans la vue Annotations, proposés à part", async () => {
    mockFetch();
    renderUi(<AnnotationsPanel galleryOrigin="http://127.0.0.1:1" onOpenAnnot={vi.fn()} onQuote={vi.fn()} />);
    fireEvent.click(await screen.findByText("Warren 2013"));
    const kept = await screen.findByText("Albédo", { selector: ".annots-code:not(.is-pending)" });
    expect(kept).toBeTruthy();
    expect(screen.getByText("Méthode", { selector: ".annots-code.is-pending" })).toBeTruthy();
  });
});
