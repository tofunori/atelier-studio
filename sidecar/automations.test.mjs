import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AutomationManager, nextRunAt } from "./automations.mjs";

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "atelier-automations-"));
  const thread = {
    id: "thread-1",
    title: "Suivi",
    provider: "codex",
    projectRoot: "/tmp/project",
    status: "idle",
    lastTurn: { model: "gpt-5", effort: "high", permissionMode: "workspace-write" },
  };
  return {
    file: join(dir, "automations.json"),
    thread,
    manager: new AutomationManager(join(dir, "automations.json"), { get: (id) => id === thread.id ? thread : null }),
  };
}

describe("AutomationManager", () => {
  it("persiste un heartbeat et interdit deux heartbeats actifs sur le même chat", () => {
    const { manager, file } = fixture();
    const created = manager.create({
      name: "Veille",
      prompt: "Vérifie les changements",
      kind: "heartbeat",
      targetThreadId: "thread-1",
      rrule: "FREQ=MINUTELY;INTERVAL=30",
    });

    expect(created.nextRunAt).toBeGreaterThan(Date.now());
    expect(JSON.parse(readFileSync(file, "utf8"))).toHaveLength(1);
    expect(() => manager.create({
      name: "Doublon",
      prompt: "Encore",
      kind: "heartbeat",
      targetThreadId: "thread-1",
      rrule: "FREQ=MINUTELY;INTERVAL=30",
    })).toThrow(/déjà un heartbeat actif/);
  });

  it("réutilise le contexte du chat et clôt l’historique d’exécution", async () => {
    const { manager } = fixture();
    const automation = manager.create({
      name: "Veille",
      prompt: "Vérifie les changements",
      kind: "heartbeat",
      targetThreadId: "thread-1",
      rrule: "FREQ=MINUTELY;INTERVAL=30",
    });
    const route = vi.fn(async () => {});
    const broadcast = vi.fn();

    await manager.execute(automation.id, { broadcast }, route);
    const message = route.mock.calls[0][0];
    expect(message).toMatchObject({
      threadId: "thread-1",
      provider: "codex",
      projectRoot: "/tmp/project",
      model: "gpt-5",
      effort: "high",
      permissionMode: "plan",
    });
    expect(message.prompt).toContain("<heartbeat>");
    manager.recordEvent("thread-1", { kind: "done", ok: true }, broadcast);
    expect(manager.get(automation.id).runs[0].status).toBe("COMPLETED");
  });

  it("calcule toujours une échéance strictement future", () => {
    const at = new Date("2026-07-15T12:30:00.000Z").getTime();
    expect(nextRunAt("FREQ=MINUTELY;INTERVAL=30", at)).toBe(new Date("2026-07-15T13:00:00.000Z").getTime());
  });
});
