import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ThreadStore } from "./store.mjs";
import { route } from "./router.mjs";

// Invariant : un tour Claude lancé finit toujours par remettre le statut du
// thread à jour. Deux chemins vérifiés ici via le routeur avec un provider mock
// (pas le vrai SDK) et un ThreadStore réel.
function newStore() {
  const file = join(mkdtempSync(join(tmpdir(), "as-life-")), "threads.json");
  return new ThreadStore(file);
}

describe("cycle de vie d'un tour Claude", () => {
  it("un throw synchrone de send remet le thread idle et émet une erreur", async () => {
    const store = newStore();
    const emitted = [];
    const ctx = {
      send: (m) => emitted.push(m),
      broadcast: (m) => emitted.push(m),
      store,
      providers: {
        claude: {
          send: () => {
            throw new Error("boom");
          },
        },
      },
    };

    await route(
      { type: "send", provider: "claude", threadId: "t1", prompt: "x", projectRoot: "" },
      ctx,
    );

    expect(store.get("t1").status).toBe("idle");
    const err = emitted.find((m) => m.type === "event" && m.event?.kind === "error");
    expect(err).toBeTruthy();
    expect(err.event.message).toContain("boom");
  });

  it("un onEvent du routeur qui rejette ne devient pas une unhandled rejection", async () => {
    const store = newStore();
    const emitted = [];
    let guardCaught = false;
    // broadcast qui LÈVE sur l'événement done : force le onEvent async du routeur
    // à rejeter, comme le ferait un bug dans la chaîne d'enrichissement.
    const ctx = {
      send: (m) => emitted.push(m),
      broadcast: (m) => {
        if (m.type === "event" && m.event?.kind === "done") throw new Error("onEvent boom");
        emitted.push(m);
      },
      store,
      providers: {
        claude: {
          // reproduit le filet `emit` de claude.mjs : le rejet de l'onEvent async
          // du routeur est avalé au lieu de tuer le process sidecar.
          send: (opts) => {
            Promise.resolve(opts.onEvent({ kind: "done", ok: true, result: "" })).catch(() => {
              guardCaught = true;
            });
          },
        },
      },
    };

    await expect(
      route(
        { type: "send", provider: "claude", threadId: "t2", prompt: "y", projectRoot: "" },
        ctx,
      ),
    ).resolves.toBeUndefined();

    // laisser les microtâches se vider pour que le rejet soit capté par le filet
    await new Promise((r) => setTimeout(r, 10));
    expect(guardCaught).toBe(true);
  });
});
