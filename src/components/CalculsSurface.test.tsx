import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import CalculsSurface, { calculsDebug, type ComputeRun } from "./CalculsSurface";

const sent: any[] = [];
let online = true;

vi.mock("../lib/wsBus", () => ({
  wsSend: (message: unknown) => {
    sent.push(message);
    return online;
  },
}));

// La vue Slurm est l'ancienne surface Narval, conservée telle quelle et testée
// à part : ici un stub suffit pour vérifier la bascule.
vi.mock("./NarvalSurface", () => ({
  default: ({ visible }: { visible: boolean }) => <div data-testid="narval-stub" data-visible={visible} />,
}));

function deliver(message: Record<string, unknown>) {
  act(() => window.dispatchEvent(new CustomEvent("compute-message", { detail: message })));
}

function lastRequest(type: string) {
  return [...sent].reverse().find((message) => message.type === type);
}

const NOW = Date.parse("2026-09-06T12:00:00Z");

function run(overrides: Partial<ComputeRun> & { id: string }): ComputeRun {
  return {
    source: "atelier-run",
    host: "mac",
    label: overrides.id,
    command: "python3 scripts/fit.py --model M42",
    workDir: "/Users/tofunori/Documents/albedo",
    state: "completed",
    startedAt: "2026-09-06T10:00:00Z",
    endedAt: "2026-09-06T11:30:00Z",
    lastActivityAt: "2026-09-06T11:30:00Z",
    progress: null,
    logPath: null,
    logTail: ["epoch 9", "done"],
    remoteTasks: [],
    detail: { kind: "local", pid: 4242 },
    ...overrides,
  };
}

const RUNS: ComputeRun[] = [
  run({ id: "mac:old-fit", label: "Ajustement M41", lastActivityAt: "2026-09-05T08:00:00Z", endedAt: "2026-09-05T08:00:00Z" }),
  run({
    id: "nas:docker:gee-export", label: "Export GEE", host: "nas", source: "docker", state: "running", endedAt: null,
    lastActivityAt: "2026-09-06T11:59:30Z", progress: { current: 40, total: 100, unit: "tuiles" },
    detail: { kind: "docker", container: "gee-export" },
  }),
  run({
    id: "narval:slurm:65659188", label: "M42a-full", host: "narval", source: "slurm", state: "queued", endedAt: null,
    startedAt: "", lastActivityAt: "2026-09-06T11:50:00Z", detail: { kind: "slurm", jobId: "65659188", profile: "narval" },
  }),
];

function snapshotMessage(requestId: string, extra: Partial<{ runs: ComputeRun[]; errors: unknown[]; observedAt: string }> = {}) {
  return {
    type: "computeSnapshot",
    requestId,
    data: { observedAt: new Date(NOW).toISOString(), runs: RUNS, errors: [], ...extra },
  };
}

describe("CalculsSurface", () => {
  beforeAll(() => {
    (Element.prototype as Element & { getAnimations: () => Animation[] }).getAnimations = () => [];
  });
  beforeEach(() => {
    sent.splice(0);
    online = true;
    localStorage.clear();
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("demande un snapshot 7 jours tous hôtes, rend les runs triés running d'abord", () => {
    const { container } = render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
    const request = lastRequest("computeSnapshot");
    expect(request).toBeTruthy();
    expect(request.days).toBe(7);
    expect(request.hosts).toBeUndefined();
    expect(container.querySelector(".calculs-skeleton")).toBeTruthy();

    deliver(snapshotMessage(request.requestId));
    const rows = [...container.querySelectorAll(".calculs-run")];
    expect(rows.map((row) => row.getAttribute("data-run-state"))).toEqual(["running", "queued", "completed"]);
    expect(rows[0].textContent).toContain("Export GEE");
    expect(rows[0].textContent).toContain("NAS · docker");
    expect(rows[0].querySelector("[role=progressbar]")?.getAttribute("aria-valuenow")).toBe("40");
    expect(screen.getByText(/observé il y a 0 s|observed 0 s ago/)).toBeTruthy();
    // pas de terminal pour « Tous » : aucun hôte distant ciblé
    expect(screen.queryByRole("button", { name: /^terminal$/i })).toBeNull();
  });

  it("le filtre d'hôte relance la requête avec hosts:[…] et propose le terminal de l'hôte", () => {
    const openTerminal = vi.fn();
    render(<CalculsSurface visible onOpenTerminal={openTerminal} />);
    fireEvent.click(screen.getByRole("radio", { name: "NAS" }));
    const request = lastRequest("computeSnapshot");
    expect(request.hosts).toEqual(["nas"]);
    expect(localStorage.getItem("atelier.calculs.host")).toBe("nas");
    fireEvent.click(screen.getByRole("button", { name: /^terminal$/i }));
    expect(openTerminal).toHaveBeenCalledWith("ssh nas");

    fireEvent.click(screen.getByRole("radio", { name: "Narval" }));
    expect(lastRequest("computeSnapshot").hosts).toEqual(["narval"]);
    fireEvent.click(screen.getByRole("button", { name: /^terminal$/i }));
    expect(openTerminal).toHaveBeenLastCalledWith("ssh nas -t ssh narval-vpn");
  });

  it("ignore une réponse dont le requestId n'est plus le dernier", () => {
    const { container } = render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
    const first = lastRequest("computeSnapshot");
    fireEvent.click(screen.getByRole("button", { name: /actualiser|refresh/i }));
    const second = lastRequest("computeSnapshot");
    expect(second.requestId).not.toBe(first.requestId);
    deliver(snapshotMessage(first.requestId));
    expect(container.querySelectorAll(".calculs-run")).toHaveLength(0);
    deliver(snapshotMessage(second.requestId));
    expect(container.querySelectorAll(".calculs-run")).toHaveLength(3);
  });

  it("affiche un bandeau par hôte en erreur tout en gardant la liste", () => {
    const { container } = render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
    deliver(snapshotMessage(lastRequest("computeSnapshot").requestId, {
      errors: [{ host: "narval", code: "ssh", message: "Connection timed out" }],
    }));
    expect(container.querySelectorAll(".calculs-run")).toHaveLength(3);
    const alert = container.querySelector(".calculs-alert");
    expect(alert?.textContent).toContain("Narval");
    expect(alert?.textContent).toContain("Connection timed out");
  });

  it("conserve les derniers runs NAS au timeout puis accepte une liste vide confirmée", () => {
    localStorage.setItem("atelier.calculs.host", "nas");
    const { container } = render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
    const nasRuns = RUNS.filter((entry) => entry.host === "nas");
    deliver(snapshotMessage(lastRequest("computeSnapshot").requestId, { runs: nasRuns }));
    vi.setSystemTime(NOW + 60_000);
    deliver(snapshotMessage(lastRequest("computeSnapshot").requestId, {
      observedAt: new Date(NOW + 60_000).toISOString(), runs: [],
      errors: [{ host: "nas", code: "timeout", message: "ssh timeout" }],
    }));
    expect(container.querySelectorAll(".calculs-run")).toHaveLength(1);
    expect(container.querySelector(".calculs-alert")).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(/NAS.*actualisation en attente|NAS.*update pending/);
    expect(screen.getByText(/dernier état|last known/)).toBeTruthy();
    expect(screen.getByText(/observé il y a 60 s|observed 60 s ago/)).toBeTruthy();
    deliver(snapshotMessage(lastRequest("computeSnapshot").requestId, { runs: [] }));
    expect(container.querySelectorAll(".calculs-run")).toHaveLength(0);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText(/Aucun calcul sur 7 jours|No runs in the last 7 days/)).toBeTruthy();
  });

  it("ne confond pas un premier timeout avec une absence de calculs", () => {
    render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
    deliver(snapshotMessage(lastRequest("computeSnapshot").requestId, {
      runs: [], errors: [{ host: "nas", code: "timeout", message: "ssh timeout" }],
    }));
    expect(screen.getByText(/^Actualisation en attente$|^Update pending$/)).toBeTruthy();
    expect(screen.queryByText(/Aucun calcul sur 7 jours|No runs in the last 7 days/)).toBeNull();
  });

  it("isole le cache par hôte et renouvelle les hôtes qui répondent", () => {
    const { container } = render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
    deliver(snapshotMessage(lastRequest("computeSnapshot").requestId));
    fireEvent.click(screen.getByRole("radio", { name: "Mac" }));
    expect(container.querySelectorAll(".calculs-run")).toHaveLength(1);
    deliver(snapshotMessage(lastRequest("computeSnapshot").requestId, { runs: [] }));
    fireEvent.click(screen.getByRole("radio", { name: "NAS" }));
    expect(screen.getByText("Export GEE")).toBeTruthy();
    expect(screen.queryByText(/Aucun calcul sur 7 jours|No runs in the last 7 days/)).toBeNull();
    deliver(snapshotMessage(lastRequest("computeSnapshot").requestId, {
      runs: [], errors: [{ host: "nas", code: "unavailable", message: "offline" }],
    }));
    expect(container.querySelectorAll(".calculs-run")).toHaveLength(1);
    expect(screen.getByText("Export GEE")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Tous|All/ }));
    deliver(snapshotMessage(lastRequest("computeSnapshot").requestId, {
      runs: [], errors: [{ host: "nas", code: "timeout", message: "timeout" }],
    }));
    expect(container.querySelectorAll(".calculs-run")).toHaveLength(1);
    expect(screen.queryByText("M42a-full")).toBeNull();
  });

  it("un snapshot identique au repos ne re-rend ni la liste ni les rangées", () => {
    const { container } = render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
    const request = lastRequest("computeSnapshot");
    deliver(snapshotMessage(request.requestId));
    expect(container.querySelectorAll(".calculs-run")).toHaveLength(3);
    const rows = calculsDebug.rowRenders;
    const lists = calculsDebug.listRenders;
    // le temps passe, même contenu, observedAt différent : aucun setState
    vi.setSystemTime(NOW + 5_000);
    deliver(snapshotMessage(request.requestId, { observedAt: new Date(NOW + 5_000).toISOString() }));
    expect(calculsDebug.rowRenders).toBe(rows);
    expect(calculsDebug.listRenders).toBe(lists);
    // run vivant dont lastActivityAt suit l'instant d'observation : idem
    vi.setSystemTime(NOW + 35_000);
    const live = RUNS.map((r) => (r.state === "running" || r.state === "queued"
      ? { ...r, lastActivityAt: new Date(NOW + 35_000).toISOString() } : r));
    deliver(snapshotMessage(request.requestId, { runs: live, observedAt: new Date(NOW + 35_000).toISOString() }));
    expect(calculsDebug.rowRenders).toBe(rows);
    expect(calculsDebug.listRenders).toBe(lists);
    // l'étiquette « observé » se rafraîchit au tic d'horloge, pas à la réponse
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByText(/observé il y a 10 s|observed 10 s ago/)).toBeTruthy();
    // (le tic est le seul re-rendu périodique du conteneur ; seules les rangées
    // dont l'affichage « actif il y a » change se re-rendent)
    expect(calculsDebug.listRenders).toBe(lists + 1);
    // contenu différent : la liste se met à jour
    deliver(snapshotMessage(request.requestId, { runs: RUNS.slice(0, 2) }));
    expect(container.querySelectorAll(".calculs-run")).toHaveLength(2);
    expect(calculsDebug.listRenders).toBe(lists + 2);
  });

  it("un run terminé dont lastActivityAt change re-rend la liste", () => {
    const { container } = render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
    const request = lastRequest("computeSnapshot");
    deliver(snapshotMessage(request.requestId));
    const lists = calculsDebug.listRenders;
    const changed = RUNS.map((r) => (r.id === "mac:old-fit" ? { ...r, lastActivityAt: "2026-09-05T09:00:00Z" } : r));
    deliver(snapshotMessage(request.requestId, { runs: changed }));
    expect(calculsDebug.listRenders).toBe(lists + 1);
    expect(container.querySelectorAll(".calculs-run")).toHaveLength(3);
  });

  it("signale l'absence de service et les données périmées", () => {
    online = false;
    const { container, unmount } = render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
    expect(container.querySelector(".calculs-offline")).toBeTruthy();
    unmount();

    online = true;
    render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
    deliver(snapshotMessage(lastRequest("computeSnapshot").requestId));
    expect(screen.queryByText(/périmées|stale/)).toBeNull();
    act(() => { vi.advanceTimersByTime(70_000); });
    expect(screen.getByText(/périmées|stale/)).toBeTruthy();
  });

  it("l'onglet Log demande computeReadLog 400 lignes et affiche le journal", () => {
    const { container } = render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
    deliver(snapshotMessage(lastRequest("computeSnapshot").requestId));
    const head = container.querySelectorAll(".calculs-run-head")[0];
    fireEvent.click(head);
    expect(head.getAttribute("aria-expanded")).toBe("true");
    const body = container.querySelector(".calculs-run[data-open] .calculs-run-body");
    expect(body?.textContent).toContain("python3 scripts/fit.py");
    expect(body?.textContent).toContain("/Users/tofunori/Documents/albedo");
    expect(body?.textContent).toContain("gee-export"); // Conteneur (détail docker)
    expect(body?.textContent).toMatch(/40 \/ 100 tuiles/);
    expect(body?.textContent).toContain("40 %");
    expect(lastRequest("computeReadLog")).toBeUndefined();

    fireEvent.click(screen.getByRole("tab", { name: "Log" }));
    const logRequest = lastRequest("computeReadLog");
    expect(logRequest).toMatchObject({ runId: "nas:docker:gee-export", tailLines: 400 });
    deliver({
      type: "computeLog", requestId: logRequest.requestId, runId: "nas:docker:gee-export",
      data: { lines: ["tile 39", "tile 40"], truncated: true },
    });
    expect(container.querySelector(".calculs-run-log pre")?.textContent).toBe("tile 39\ntile 40");
    expect(screen.getByText(/tronqué|truncated/)).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector(".calculs-run[data-open]")).toBeNull();
    expect(container.querySelector(".calculs-run-body")).toBeNull();
    expect(head.getAttribute("aria-expanded")).toBe("false");
  });

  it("« Log complet » bascule sur l'onglet Log et demande le journal", () => {
    const { container } = render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
    deliver(snapshotMessage(lastRequest("computeSnapshot").requestId));
    fireEvent.click(container.querySelectorAll(".calculs-run-head")[2]);
    fireEvent.click(screen.getByRole("button", { name: /log complet|full log/i }));
    expect(lastRequest("computeReadLog")).toMatchObject({ runId: "mac:old-fit", tailLines: 400 });
    expect(screen.getByRole("tab", { name: "Log" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText(/lecture du journal|reading log/i)).toBeTruthy();
  });

  it("une seule rangée ouverte à la fois ; un second clic la replie", () => {
    const { container } = render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
    deliver(snapshotMessage(lastRequest("computeSnapshot").requestId));
    const heads = container.querySelectorAll(".calculs-run-head");
    expect(container.querySelectorAll(".calculs-run-body")).toHaveLength(0);
    fireEvent.click(heads[0]);
    expect(container.querySelectorAll(".calculs-run-body")).toHaveLength(1);
    fireEvent.click(heads[2]);
    expect(container.querySelectorAll(".calculs-run-body")).toHaveLength(1);
    expect(heads[0].getAttribute("aria-expanded")).toBe("false");
    expect(heads[2].getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(".calculs-run[data-open]")?.getAttribute("data-run-state")).toBe("completed");
    // run terminé sans progression : Fin + PID, pas de barre
    const body = container.querySelector(".calculs-run-body")!;
    expect(body.textContent).toContain("4242");
    expect(body.querySelector("[role=progressbar]")).toBeNull();
    fireEvent.click(heads[2]);
    expect(container.querySelectorAll(".calculs-run-body")).toHaveLength(0);
    expect(container.querySelector(".calculs-run[data-open]")).toBeNull();
  });

  it("le corps propose le terminal de l'hôte du run (masqué pour le Mac) et la vue Slurm pour slurm", () => {
    const openTerminal = vi.fn();
    const { container } = render(<CalculsSurface visible onOpenTerminal={openTerminal} />);
    deliver(snapshotMessage(lastRequest("computeSnapshot").requestId));
    const heads = container.querySelectorAll(".calculs-run-head");
    fireEvent.click(heads[0]); // NAS docker
    fireEvent.click(screen.getByRole("button", { name: /terminal sur nas|terminal on nas/i }));
    expect(openTerminal).toHaveBeenCalledWith("ssh nas");
    expect(screen.queryByRole("tab", { name: /fichiers|files/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /vue slurm|slurm view/i })).toBeNull();
    fireEvent.click(heads[2]); // Mac local
    expect(screen.queryByRole("button", { name: /terminal sur|terminal on/i })).toBeNull();
    fireEvent.click(heads[1]); // Narval slurm
    expect(screen.getByRole("tab", { name: /fichiers|files/i })).toBeTruthy();
    expect(container.querySelector(".calculs-run-body")?.textContent).toContain("65659188");
    fireEvent.click(screen.getByRole("button", { name: /terminal sur narval|terminal on narval/i }));
    expect(openTerminal).toHaveBeenLastCalledWith("ssh nas -t ssh narval-vpn");
  });

  it("ouvrir une rangée ne re-rend que celle-ci ; un snapshot identique reste silencieux", () => {
    const { container } = render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
    const request = lastRequest("computeSnapshot");
    deliver(snapshotMessage(request.requestId));
    const heads = container.querySelectorAll(".calculs-run-head");
    let rows = calculsDebug.rowRenders;
    fireEvent.click(heads[0]);
    expect(calculsDebug.rowRenders).toBe(rows + 1);
    rows = calculsDebug.rowRenders;
    const lists = calculsDebug.listRenders;
    // rangée ouverte, snapshot identique : aucun setState, rien ne bouge
    vi.setSystemTime(NOW + 5_000);
    deliver(snapshotMessage(request.requestId, { observedAt: new Date(NOW + 5_000).toISOString() }));
    expect(calculsDebug.rowRenders).toBe(rows);
    expect(calculsDebug.listRenders).toBe(lists);
    // changer d'onglet dans le corps ne re-rend ni la liste ni les rangées
    fireEvent.click(screen.getByRole("tab", { name: "Log" }));
    expect(calculsDebug.rowRenders).toBe(rows);
    expect(calculsDebug.listRenders).toBe(lists);
    // ouvrir B : seules A (qui se replie) et B se re-rendent
    fireEvent.click(heads[2]);
    expect(calculsDebug.rowRenders).toBe(rows + 2);
  });

  it("« Vue Slurm » bascule sur NarvalSurface puis revient", () => {
    const { container } = render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
    deliver(snapshotMessage(lastRequest("computeSnapshot").requestId));
    fireEvent.click(container.querySelectorAll(".calculs-run-head")[1]);
    fireEvent.click(screen.getByRole("button", { name: /vue slurm|slurm view/i }));
    expect(screen.getByTestId("narval-stub").getAttribute("data-visible")).toBe("true");
    expect(container.querySelector(".calculs-run")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /retour aux calculs|back to compute/i }));
    expect(screen.queryByTestId("narval-stub")).toBeNull();
    expect(container.querySelectorAll(".calculs-run")).toHaveLength(3);
  });

  it("ne sonde que lorsque la surface est visible", () => {
    const { rerender } = render(<CalculsSurface visible={false} onOpenTerminal={vi.fn()} />);
    expect(lastRequest("computeSnapshot")).toBeUndefined();
    rerender(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
    expect(lastRequest("computeSnapshot")).toBeTruthy();
    const before = sent.filter((m) => m.type === "computeSnapshot").length;
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(sent.filter((m) => m.type === "computeSnapshot").length).toBe(before + 1);
    rerender(<CalculsSurface visible={false} onOpenTerminal={vi.fn()} />);
    act(() => { vi.advanceTimersByTime(120_000); });
    expect(sent.filter((m) => m.type === "computeSnapshot").length).toBe(before + 1);
  });

  it("sonde toutes les 30 s pour le Mac, toutes les 60 s dès qu'un hôte distant est inclus", () => {
    const count = () => sent.filter((m) => m.type === "computeSnapshot").length;
    const { container } = render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
    // « Tous » inclut NAS et Slurm : 60 s
    let before = count();
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(count()).toBe(before);
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(count()).toBe(before + 1);
    // le sondage périodique est silencieux : pas d'icône qui tourne
    expect(container.querySelector(".calculs-refresh.is-loading")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Mac" }));
    before = count();
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(count()).toBe(before + 1);
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(count()).toBe(before + 2);

    fireEvent.click(screen.getByRole("radio", { name: "NAS" }));
    before = count();
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(count()).toBe(before);
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(count()).toBe(before + 1);

    fireEvent.click(screen.getByRole("radio", { name: "Narval" }));
    before = count();
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(count()).toBe(before + 1);

    // actualisation manuelle : l'icône tourne jusqu'à la réponse
    fireEvent.click(screen.getByRole("button", { name: /actualiser|refresh/i }));
    expect(container.querySelector(".calculs-refresh.is-loading")).toBeTruthy();
    deliver(snapshotMessage(lastRequest("computeSnapshot").requestId));
    expect(container.querySelector(".calculs-refresh.is-loading")).toBeNull();
  });

  describe("retirer les runs terminés", () => {
    function openRow(container: HTMLElement, index: number) {
      fireEvent.click(container.querySelectorAll(".calculs-run-head")[index]);
    }
    const forgetButton = () => screen.queryByRole("button", { name: /^retirer$|^remove$/i });
    const forgetFinishedButton = () => screen.getByRole("button", { name: /retirer les terminés|remove finished/i });
    const rowIds = (container: HTMLElement) =>
      [...container.querySelectorAll(".calculs-run-head strong")].map((el) => el.textContent);

    it("« Retirer » n'apparaît que sur les runs terminés/échoués/inconnus", () => {
      const { container } = render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
      deliver(snapshotMessage(lastRequest("computeSnapshot").requestId));
      openRow(container, 0); // running
      expect(forgetButton()).toBeNull();
      openRow(container, 1); // queued
      expect(forgetButton()).toBeNull();
      openRow(container, 2); // completed
      expect(forgetButton()).toBeTruthy();
    });

    it("un clic envoie computeForgetRun et masque la rangée aussitôt ; « unsupported » la laisse masquée", () => {
      const { container } = render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
      deliver(snapshotMessage(lastRequest("computeSnapshot").requestId));
      openRow(container, 2);
      fireEvent.click(forgetButton()!);
      const request = lastRequest("computeForgetRun");
      expect(request).toMatchObject({ runId: "mac:old-fit" });
      expect(typeof request.requestId).toBe("string");
      expect(container.querySelectorAll(".calculs-run")).toHaveLength(2);
      expect(JSON.parse(localStorage.getItem("atelier.calculs.hidden")!)).toEqual(["mac:old-fit"]);
      deliver({
        type: "computeForgotRun", requestId: request.requestId, runId: "mac:old-fit",
        error: { host: "mac", code: "unsupported", message: "cannot archive" },
      });
      expect(container.querySelectorAll(".calculs-run")).toHaveLength(2);
      expect(JSON.parse(localStorage.getItem("atelier.calculs.hidden")!)).toEqual(["mac:old-fit"]);
      // archived=true : reste masqué aussi
      deliver({ type: "computeForgotRun", requestId: request.requestId, runId: "mac:old-fit", data: { runId: "mac:old-fit", archived: true } });
      expect(container.querySelectorAll(".calculs-run")).toHaveLength(2);
    });

    it("« run_live » ré-affiche la rangée avec le message d'erreur", () => {
      const { container } = render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
      deliver(snapshotMessage(lastRequest("computeSnapshot").requestId));
      openRow(container, 2);
      fireEvent.click(forgetButton()!);
      const request = lastRequest("computeForgetRun");
      expect(container.querySelectorAll(".calculs-run")).toHaveLength(2);
      deliver({
        type: "computeForgotRun", requestId: request.requestId, runId: "mac:old-fit",
        error: { host: "mac", code: "run_live", message: "still running" },
      });
      expect(container.querySelectorAll(".calculs-run")).toHaveLength(3);
      expect(JSON.parse(localStorage.getItem("atelier.calculs.hidden")!)).toEqual([]);
      const error = container.querySelector(".calculs-forget-error");
      expect(error?.textContent).toMatch(/impossible de retirer|could not remove/i);
      expect(error?.textContent).toContain("still running");
      // une réponse à un requestId inconnu est ignorée
      deliver({ type: "computeForgotRun", requestId: "nope", runId: "mac:old-fit", error: { host: "mac", code: "x", message: "y" } });
      expect(container.querySelectorAll(".calculs-run")).toHaveLength(3);
    });

    it("« Retirer les terminés » envoie un message par run terminé visible et les masque", () => {
      const { container } = render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
      const snap = lastRequest("computeSnapshot").requestId;
      const runs = [...RUNS, run({ id: "mac:failed", label: "Échec M40", state: "failed", exitCode: 1 }),
        run({ id: "nas:unit:stale", label: "Unité", host: "nas", source: "systemd", state: "unknown", detail: { kind: "unit", unit: "fit.service" } })];
      deliver(snapshotMessage(snap, { runs }));
      expect(container.querySelectorAll(".calculs-run")).toHaveLength(5);
      const before = sent.length;
      fireEvent.click(forgetFinishedButton());
      const requests = sent.slice(before).filter((m) => m.type === "computeForgetRun");
      expect(requests.map((m) => m.runId).sort()).toEqual(["mac:failed", "mac:old-fit", "nas:unit:stale"]);
      expect(new Set(requests.map((m) => m.requestId)).size).toBe(3);
      expect(rowIds(container)).toEqual(["Export GEE", "M42a-full"]);
      expect((forgetFinishedButton() as HTMLButtonElement).disabled).toBe(true);
      // le prochain snapshot (encore avec ces runs) reste filtré
      deliver(snapshotMessage(snap, { runs, observedAt: new Date(NOW + 60_000).toISOString() }));
      expect(rowIds(container)).toEqual(["Export GEE", "M42a-full"]);
    });

    it("le bouton de barre est désactivé sans run terminé visible ; le masquage persiste au remontage", () => {
      localStorage.setItem("atelier.calculs.hidden", JSON.stringify(["mac:old-fit"]));
      const { container, unmount } = render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
      deliver(snapshotMessage(lastRequest("computeSnapshot").requestId));
      expect(rowIds(container)).toEqual(["Export GEE", "M42a-full"]);
      expect((forgetFinishedButton() as HTMLButtonElement).disabled).toBe(true);
      unmount();
      // stockage corrompu : ignoré
      localStorage.setItem("atelier.calculs.hidden", "{bad");
      const second = render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
      deliver(snapshotMessage(lastRequest("computeSnapshot").requestId));
      expect(second.container.querySelectorAll(".calculs-run")).toHaveLength(3);
    });

    it("le masquage est plafonné à 500 identifiants (plus anciens évincés)", () => {
      localStorage.setItem("atelier.calculs.hidden", JSON.stringify(Array.from({ length: 500 }, (_, i) => `old:${i}`)));
      const { container } = render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
      deliver(snapshotMessage(lastRequest("computeSnapshot").requestId));
      openRow(container, 2);
      fireEvent.click(forgetButton()!);
      const stored = JSON.parse(localStorage.getItem("atelier.calculs.hidden")!);
      expect(stored).toHaveLength(500);
      expect(stored[0]).toBe("old:1");
      expect(stored[499]).toBe("mac:old-fit");
    });

    it("snapshot identique + masquage inchangé : aucune rangée re-rendue", () => {
      const { container } = render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
      const request = lastRequest("computeSnapshot");
      deliver(snapshotMessage(request.requestId));
      openRow(container, 2);
      fireEvent.click(forgetButton()!);
      expect(container.querySelectorAll(".calculs-run")).toHaveLength(2);
      const rows = calculsDebug.rowRenders;
      const lists = calculsDebug.listRenders;
      vi.setSystemTime(NOW + 5_000);
      deliver(snapshotMessage(request.requestId, { observedAt: new Date(NOW + 5_000).toISOString() }));
      expect(calculsDebug.rowRenders).toBe(rows);
      expect(calculsDebug.listRenders).toBe(lists);
    });
  });
});
