import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComputeJobCard, type ComputeJobEvent } from "./ComputeJobCard";

const send = vi.fn((_message: unknown) => true);
vi.mock("../../lib/wsBus", () => ({ wsSend: (message: unknown) => send(message) }));

const script = Array.from({ length: 14 }, (_, i) => `echo étape ${i + 1}`).join("\n");

function card(patch: Partial<ComputeJobEvent> = {}): ComputeJobEvent {
  return {
    kind: "compute_job",
    jobId: "a1b2c3d4e5f6",
    status: "proposed",
    job: {
      host: "narval", hostLabel: "Narval", label: "fit M42", workDir: "/scratch/u/m42", script,
      resources: { cpus: 8, time: "1:30:00", mem: "16G" },
      estimate: { wallHours: 1.5, cpuHours: 12, gpuHours: 0 },
      purpose: "Ajuster M42 sur toutes les régions",
    },
    ...patch,
  };
}

describe("ComputeJobCard", () => {
  afterEach(cleanup);
  beforeEach(() => send.mockClear());

  it("montre l'hôte, le script et le coût avant tout envoi", () => {
    render(<ComputeJobCard event={card()} />);
    expect(screen.getByText("fit M42")).toBeInTheDocument();
    expect(screen.getByText(/Narval/)).toBeInTheDocument();
    expect(screen.getByText("/scratch/u/m42")).toBeInTheDocument();
    expect(screen.getByText(/12/)).toBeInTheDocument();
    // script long : aperçu replié, dépliable
    expect(screen.queryByText(/étape 14/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /afficher|show/i }));
    expect(screen.getByText(/étape 14/)).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
  });

  it("Lancer n'envoie que l'identifiant, avec la case « toujours » si cochée", () => {
    render(<ComputeJobCard event={card()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /toujours|always/i }));
    fireEvent.click(screen.getByRole("button", { name: /^(lancer|launch)$/i }));
    expect(send).toHaveBeenCalledWith({ type: "computeJobDecision", jobId: "a1b2c3d4e5f6", decision: "launch", always: true });
    const sent = send.mock.calls[0][0] as Record<string, unknown>;
    expect(sent).not.toHaveProperty("script");
  });

  it("Refuser ferme la proposition", () => {
    render(<ComputeJobCard event={card()} />);
    fireEvent.click(screen.getByRole("button", { name: /refuser|decline/i }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ decision: "refuse", always: false }));
  });

  it("Annuler une tâche en cours demande confirmation", () => {
    render(<ComputeJobCard event={card({ status: "running", remoteId: "65700999" })} />);
    expect(screen.queryByRole("button", { name: /^(lancer|launch)$/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /annuler la tâche|cancel the job/i }));
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /oui, annuler|yes, cancel/i }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ decision: "cancel" }));
  });

  it("une tâche finie n'a plus de bouton et un refus du serveur s'affiche", () => {
    const { rerender } = render(<ComputeJobCard event={card()} />);
    fireEvent.click(screen.getByRole("button", { name: /^(lancer|launch)$/i }));
    act(() => {
      window.dispatchEvent(new CustomEvent("compute-job-decision", { detail: { jobId: "a1b2c3d4e5f6", error: "job_not_pending" } }));
    });
    expect(screen.getByRole("status")).toHaveTextContent("job_not_pending");
    rerender(<ComputeJobCard event={card({ status: "failed", exitCode: 4, message: null })} />);
    expect(screen.queryAllByRole("button").filter((b) => /lancer|launch|annuler|cancel/i.test(b.textContent ?? ""))).toHaveLength(0);
    expect(screen.getByText(/code 4/)).toBeInTheDocument();
  });
});
