import { describe, it, expect, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ThreadStore } from "./store.mjs";
import { route } from "./router.mjs";

// SDK Claude mocké : query() contrôlable depuis le test (feed de messages),
// pour vérifier le câblage session/dispatcher de claude.mjs sans réseau.
vi.mock("@anthropic-ai/claude-agent-sdk", () => {
  const queries = [];
  const END = Symbol("end");
  const query = (opts) => {
    const waiters = [];
    const backlog = [];
    const gen = (async function* () {
      for (;;) {
        const msg = backlog.length
          ? backlog.shift()
          : await new Promise((r) => waiters.push(r));
        if (msg === END) return;
        yield msg;
      }
    })();
    gen.setModel = async () => {};
    gen.setPermissionMode = async () => {};
    gen.interrupt = async () => {};
    const feed = (m) => {
      const w = waiters.shift();
      if (w) w(m);
      else backlog.push(m);
    };
    queries.push({ opts, feed, end: () => feed(END) });
    return gen;
  };
  return {
    query,
    getSessionMessages: async () => [],
    __queries: queries,
  };
});

import * as claudeProvider from "./providers/claude.mjs";
import * as sdkMock from "@anthropic-ai/claude-agent-sdk";

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

describe("dispatcher stable de session Claude (plan 025)", () => {
  const flush = () => new Promise((r) => setTimeout(r, 10));

  it("un second send (steer) ne remplace pas le dispatcher du premier tour", async () => {
    const ev1 = [];
    const ev2 = [];
    claudeProvider.send({
      threadId: "steer-th", cwd: "/tmp", prompt: "premier tour",
      onEvent: (e) => ev1.push(e),
    });
    claudeProvider.send({
      threadId: "steer-th", cwd: "/tmp", prompt: "correction", mode: "steer",
      onEvent: (e) => ev2.push(e),
    });

    const q = sdkMock.__queries.at(-1);
    q.feed({ type: "assistant", message: { content: [{ type: "text", text: "réponse du tour" }] } });
    await flush();

    // le routeur décide de l'attribution : le provider n'a pas le droit de
    // réattribuer les événements du run en cours au callback du steer
    expect(ev1.filter((e) => e.kind === "text")).toHaveLength(1);
    expect(ev2).toHaveLength(0);

    q.end();
    await flush();
    claudeProvider.endSession("steer-th");
  });

  it("un send en mode queue ne détourne pas non plus les événements du run", async () => {
    const ev1 = [];
    const ev2 = [];
    claudeProvider.send({
      threadId: "queue-th", cwd: "/tmp", prompt: "premier tour",
      onEvent: (e) => ev1.push(e),
    });
    claudeProvider.send({
      threadId: "queue-th", cwd: "/tmp", prompt: "pour après", mode: "queue",
      onEvent: (e) => ev2.push(e),
    });

    const q = sdkMock.__queries.at(-1);
    q.feed({ type: "assistant", message: { content: [{ type: "text", text: "en plein run" }] } });
    await flush();

    expect(ev1.filter((e) => e.kind === "text")).toHaveLength(1);
    expect(ev2).toHaveLength(0);

    q.end();
    await flush();
    claudeProvider.endSession("queue-th");
  });
});
