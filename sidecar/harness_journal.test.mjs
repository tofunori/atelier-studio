import { describe, it, expect, vi, afterEach } from "vitest";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createHarnessJournal, MAX_LINE_BYTES, SESSION_BOUNDARY_NAME } from "./harness_journal.mjs";

const TID = "thread-1";
const hashOf = (id) => createHash("sha256").update(String(id), "utf8").digest("hex");

function setup(opts = {}) {
  const base = mkdtempSync(join(tmpdir(), "harness-journal-"));
  const journal = createHarnessJournal({ baseDir: base, ...opts });
  const dir = join(base, "harness-history");
  return { base, dir, journal, file: (id = TID) => join(dir, `${hashOf(id)}.jsonl`) };
}

// Événements décorés comme le ferait harness_events (meta schema v1).
let autoSeq = 0;
let autoId = 0;
function ev(kind, extra = {}, metaOver = {}) {
  const sequence = metaOver.sequence ?? ++autoSeq;
  return {
    kind,
    ...extra,
    meta: {
      schemaVersion: 1,
      eventId: `ev-${++autoId}`,
      provider: "claude",
      threadId: TID,
      turnId: "t1",
      sequence,
      ts: 1000 + sequence,
      durable: true,
      origin: "provider",
      ...metaOver,
    },
  };
}

const rawLines = (path) => readFileSync(path, "utf8").split("\n").filter(Boolean);
const quietWarn = () => vi.spyOn(console, "warn").mockImplementation(() => {});

afterEach(() => vi.restoreAllMocks());

describe("stockage et sécurité du chemin", () => {
  it("openThread crée dossier+fichier avec header, idempotent", async () => {
    const { journal, file } = setup();
    await journal.openThread({ threadId: TID, provider: "claude" });
    await journal.openThread({ threadId: TID, provider: "claude" });
    const lines = rawLines(file());
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      schemaVersion: 1,
      threadId: TID,
      provider: "claude",
    });
    expect(typeof JSON.parse(lines[0]).createdAt).toBe("string");
  });

  it("append ouvre le thread automatiquement (header via meta.provider)", async () => {
    const { journal, file } = setup();
    await journal.append(ev("text", { text: "salut" }, { provider: "codex" }));
    const lines = rawLines(file());
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).provider).toBe("codex");
  });

  it("threadId hostile (../../../etc/passwd) reste DANS harness-history, rien ailleurs", async () => {
    const { journal, base, dir } = setup();
    const hostile = "../../../etc/passwd";
    await journal.openThread({ threadId: hostile, provider: "claude" });
    await journal.append(ev("text", { text: "x" }, { threadId: hostile }));
    expect(readdirSync(dir)).toEqual([`${hashOf(hostile)}.jsonl`]);
    expect(readdirSync(base)).toEqual(["harness-history"]);
    expect(journal.hasJournal(hostile)).toBe(true);
  });

  it("threadId avec caractères spéciaux → fichier hashé valide", async () => {
    const { journal, dir } = setup();
    const weird = "th/EAD\\bizarre *?%$éà\n";
    await journal.openThread({ threadId: weird, provider: "claude" });
    expect(readdirSync(dir)).toEqual([`${hashOf(weird)}.jsonl`]);
  });

  it("permissions : dossier 0700, fichier 0600", async () => {
    const { journal, dir, file } = setup();
    await journal.openThread({ threadId: TID, provider: "claude" });
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(file()).mode & 0o777).toBe(0o600);
  });
});

describe("append", () => {
  it("round-trip de toutes les familles durables", async () => {
    const { journal } = setup();
    const kinds = [
      ["user", { text: "question" }],
      ["text", { text: "réponse" }],
      ["thinking", { text: "réflexion" }],
      ["tool", { name: "Bash", detail: "ls" }],
      ["tool_update", { id: "call_1", name: "Bash", detail: "ls", state: "completed", output: "ok" }],
      ["edit", { files: [{ path: "a.txt", add: 1, del: 0 }] }],
      ["todos", { items: [{ label: "faire", done: false }] }],
      ["goal", { text: "objectif" }],
      ["interaction", { requestId: "req-1", interactionType: "approval", title: "OK ?", state: "pending" }],
      ["usage", { inputTokens: 10, outputTokens: 20 }],
      ["done", { ok: true, result: "réponse" }],
      ["error", { message: "boom" }],
    ];
    for (const [kind, extra] of kinds) await journal.append(ev(kind, extra, { itemId: kind === "tool_update" ? "call_1" : undefined }));
    const { header, events } = await journal.load(TID);
    expect(header.threadId).toBe(TID);
    expect(events.map((e) => e.kind)).toEqual(kinds.map(([k]) => k));
    const replay = await journal.materialize(TID);
    expect(replay.map((e) => e.kind)).toEqual(kinds.map(([k]) => k));
  });

  it("refuse une ligne > 512 KiB avec diagnostic, sans throw ni écriture", async () => {
    const warn = quietWarn();
    const { journal, file } = setup();
    await journal.openThread({ threadId: TID, provider: "claude" });
    const ok = await journal.append(ev("text", { text: "x".repeat(MAX_LINE_BYTES) }));
    expect(ok).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("ligne refusée"));
    expect(rawLines(file())).toHaveLength(1); // header seul
  });

  it("refuse un événement éphémère (durable:false) et un event sans meta.threadId", async () => {
    const warn = quietWarn();
    const { journal } = setup();
    expect(await journal.append(ev("delta", { text: "d" }, { durable: false }))).toBe(false);
    expect(await journal.append({ kind: "text", text: "orphelin" })).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(journal.hasJournal(TID)).toBe(false);
  });

  it("50 appends concurrents → 50 lignes valides, aucune entrelacée", async () => {
    const { journal, file } = setup();
    await journal.openThread({ threadId: TID, provider: "claude" });
    const events = Array.from({ length: 50 }, (_, i) =>
      ev("text", { text: `${"x".repeat(2048)}-${i}` }),
    );
    await Promise.all(events.map((e) => journal.append(e)));
    const lines = rawLines(file());
    expect(lines).toHaveLength(51); // header + 50
    const parsed = lines.slice(1).map((l) => JSON.parse(l)); // throw si entrelacé
    expect(new Set(parsed.map((e) => e.meta.eventId)).size).toBe(50);
  });
});

describe("load — robustesse aux crashs", () => {
  it("ignore la DERNIÈRE ligne tronquée avec diagnostic", async () => {
    const warn = quietWarn();
    const { journal, dir, file } = setup();
    mkdirSync(dir, { recursive: true });
    const header = JSON.stringify({ schemaVersion: 1, threadId: TID, createdAt: "2026-01-01", provider: "claude" });
    const good = JSON.stringify(ev("text", { text: "complet" }));
    writeFileSync(file(), `${header}\n${good}\n{"kind":"text","te`); // crash pendant write
    const { events } = await journal.load(TID);
    expect(events).toHaveLength(1);
    expect(events[0].text).toBe("complet");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("tronquée"));
  });

  it("saute une ligne intermédiaire corrompue avec diagnostic", async () => {
    const warn = quietWarn();
    const { journal, dir, file } = setup();
    mkdirSync(dir, { recursive: true });
    const header = JSON.stringify({ schemaVersion: 1, threadId: TID, createdAt: "2026-01-01", provider: "claude" });
    const e1 = JSON.stringify(ev("text", { text: "un" }));
    const e2 = JSON.stringify(ev("text", { text: "deux" }));
    writeFileSync(file(), `${header}\n${e1}\ngarbage{{{\n${e2}\n`);
    const { events } = await journal.load(TID);
    expect(events.map((e) => e.text)).toEqual(["un", "deux"]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("corrompue"));
  });

  it("un append après crash répare la fin de fichier (pas de fusion de lignes)", async () => {
    const quiet = quietWarn();
    const { journal, dir, file } = setup();
    mkdirSync(dir, { recursive: true });
    const header = JSON.stringify({ schemaVersion: 1, threadId: TID, createdAt: "2026-01-01", provider: "claude" });
    writeFileSync(file(), `${header}\n{"kind":"text","te`); // fragment sans \n
    await journal.append(ev("text", { text: "après crash" }));
    const { events } = await journal.load(TID);
    expect(events.map((e) => e.text)).toEqual(["après crash"]);
    expect(quiet).toHaveBeenCalled(); // le fragment devient une ligne corrompue diagnostiquée
  });

  it("thread inconnu : { header: null, events: [] } sans erreur", async () => {
    const { journal } = setup();
    expect(await journal.load("inconnu")).toEqual({ header: null, events: [] });
    expect(await journal.materialize("inconnu")).toEqual([]);
  });
});

describe("materialize — ordre, dédup, compactage", () => {
  it("ordonne par meta.sequence même si les appends sont désordonnés", async () => {
    const { journal } = setup();
    await journal.append(ev("text", { text: "c" }, { sequence: 3 }));
    await journal.append(ev("text", { text: "a" }, { sequence: 1 }));
    await journal.append(ev("text", { text: "b" }, { sequence: 2 }));
    const replay = await journal.materialize(TID);
    expect(replay.map((e) => e.text)).toEqual(["a", "b", "c"]);
  });

  it("déduplique par eventId (reconnexion/replay idempotent)", async () => {
    const { journal } = setup();
    const e = ev("text", { text: "unique" });
    await journal.append(e);
    await journal.append({ ...e, text: "doublon" }); // même eventId
    const replay = await journal.materialize(TID);
    expect(replay).toHaveLength(1);
    expect(replay[0].text).toBe("unique");
  });

  it("compacte tool_update par (turnId,itemId) : dernier état, position de départ", async () => {
    const { journal } = setup();
    await journal.append(ev("text", { text: "avant" }));
    await journal.append(ev("tool_update", { id: "c1", name: "Bash", state: "running", output: "" }, { itemId: "c1" }));
    await journal.append(ev("text", { text: "pendant" }));
    await journal.append(ev("tool_update", { id: "c1", name: "Bash", state: "completed", output: "fini" }, { itemId: "c1" }));
    const replay = await journal.materialize(TID);
    expect(replay.map((e) => e.kind)).toEqual(["text", "tool_update", "text"]);
    expect(replay[1].state).toBe("completed");
    expect(replay[1].output).toBe("fini");
  });

  it("même itemId dans deux turns différents = deux items distincts", async () => {
    const { journal } = setup();
    await journal.append(ev("tool_update", { state: "completed", output: "a" }, { itemId: "c1", turnId: "t1" }));
    await journal.append(ev("tool_update", { state: "completed", output: "b" }, { itemId: "c1", turnId: "t2" }));
    expect(await journal.materialize(TID)).toHaveLength(2);
  });

  it("ne garde que le dernier todos et le dernier goal", async () => {
    const { journal } = setup();
    await journal.append(ev("todos", { items: [{ label: "v1" }] }));
    await journal.append(ev("text", { text: "milieu" }));
    await journal.append(ev("todos", { items: [{ label: "v2" }] }));
    await journal.append(ev("goal", { text: "but v1" }));
    await journal.append(ev("goal", { text: "but v2" }));
    const replay = await journal.materialize(TID);
    expect(replay.map((e) => e.kind)).toEqual(["text", "todos", "goal"]);
    expect(replay[1].items[0].label).toBe("v2");
    expect(replay[2].text).toBe("but v2");
  });

  it("filtre par sécurité les kinds éphémères même journalisés par erreur", async () => {
    const { journal } = setup();
    for (const kind of ["delta", "thinking_delta", "stream_set", "streaming", "started", "heartbeat"]) {
      await journal.append(ev(kind, { text: "fantôme" })); // durable:true forcé (défaut du helper)
    }
    await journal.append(ev("text", { text: "réel" }));
    const replay = await journal.materialize(TID);
    expect(replay.map((e) => e.kind)).toEqual(["text"]);
  });

  it("usage appartient au turn : jamais compacté entre turns", async () => {
    const { journal } = setup();
    await journal.append(ev("usage", { inputTokens: 1 }, { turnId: "t1" }));
    await journal.append(ev("usage", { inputTokens: 2 }, { turnId: "t2" }));
    expect((await journal.materialize(TID)).map((e) => e.meta.turnId)).toEqual(["t1", "t2"]);
  });
});

describe("interaction — dernier état par requestId et garde-fou secret", () => {
  it("ne garde que le dernier état d'un requestId", async () => {
    const { journal } = setup();
    await journal.append(ev("interaction", { requestId: "req-1", title: "OK ?", state: "pending" }));
    await journal.append(ev("text", { text: "entre" }));
    await journal.append(ev("interaction", { requestId: "req-1", title: "OK ?", state: "answered", answerSummary: "Allow" }));
    const replay = await journal.materialize(TID);
    expect(replay.map((e) => e.kind)).toEqual(["interaction", "text"]);
    expect(replay[0].state).toBe("answered");
  });

  it("retire response et fields[].value avant écriture, sans muter l'objet émis", async () => {
    const { journal, file } = setup();
    const original = ev("interaction", {
      requestId: "req-2",
      state: "answered",
      answerSummary: "1 réponse",
      response: { token: "SECRET-XYZ" },
      fields: [{ id: "q1", question: "Mot de passe ?", secret: true, value: "SECRET-ABC" }],
    });
    await journal.append(original);
    const raw = readFileSync(file(), "utf8");
    expect(raw).not.toContain("SECRET-XYZ");
    expect(raw).not.toContain("SECRET-ABC");
    expect(raw).toContain("1 réponse"); // le résumé non secret reste
    const [loaded] = (await journal.load(TID)).events;
    expect(loaded.response).toBeUndefined();
    expect(loaded.fields[0]).toEqual({ id: "q1", question: "Mot de passe ?", secret: true });
    // l'objet broadcast au frontend n'est pas muté
    expect(original.response).toEqual({ token: "SECRET-XYZ" });
    expect(original.fields[0].value).toBe("SECRET-ABC");
  });
});

describe("seedLegacy", () => {
  const legacy = [
    { kind: "text", text: "préambule" },
    { kind: "user", text: "question 1" },
    { kind: "text", text: "réponse 1" },
    { kind: "tool", name: "Bash", detail: "ls" },
    { kind: "user", text: "question 2" },
    { kind: "text", text: "réponse 2" },
  ];

  it("meta synthétique : un turnId legacy par message user, sequence/eventId numérotés", async () => {
    const { journal } = setup();
    expect(await journal.seedLegacy(TID, "claude", legacy)).toBe(true);
    const replay = await journal.materialize(TID);
    expect(replay.map((e) => e.meta.turnId)).toEqual([
      "legacy-0", "legacy-1", "legacy-1", "legacy-1", "legacy-2", "legacy-2",
    ]);
    expect(replay.map((e) => e.meta.eventId)).toEqual([
      "legacy-1", "legacy-2", "legacy-3", "legacy-4", "legacy-5", "legacy-6",
    ]);
    expect(replay.map((e) => e.meta.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const e of replay) {
      expect(e.meta).toMatchObject({ schemaVersion: 1, provider: "claude", threadId: TID, durable: true, origin: "legacy-import" });
      expect(typeof e.meta.ts).toBe("number");
    }
  });

  it("un second seed sur le même thread est un no-op", async () => {
    const { journal, file } = setup();
    await journal.seedLegacy(TID, "claude", legacy);
    const before = rawLines(file()).length;
    expect(await journal.seedLegacy(TID, "claude", legacy)).toBe(false);
    expect(rawLines(file())).toHaveLength(before);
  });
});

describe("markSessionBoundary", () => {
  it("écrit une frontière visible au replay (/clear Codex, même thread Atelier)", async () => {
    const { journal } = setup();
    await journal.append(ev("text", { text: "avant clear" }));
    const boundary = await journal.markSessionBoundary(TID, "/clear Codex");
    expect(boundary).toMatchObject({ kind: "tool", name: SESSION_BOUNDARY_NAME, detail: "/clear Codex" });
    await journal.append(ev("text", { text: "après clear" }, { sequence: boundary.meta.sequence + 1 }));
    const replay = await journal.materialize(TID);
    expect(replay.map((e) => e.kind)).toEqual(["text", "tool", "text"]);
    expect(replay[1].name).toBe(SESSION_BOUNDARY_NAME);
    expect(replay[1].meta.origin).toBe("atelier");
  });

  it("sans journal existant : no-op diagnostiqué", async () => {
    const warn = quietWarn();
    const { journal } = setup();
    expect(await journal.markSessionBoundary("inconnu", "x")).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("frontière ignorée"));
  });
});

describe("truncateFrom — revert non destructif", () => {
  it("exclut du replay les événements dont sequence >= point de revert, sans réécrire le fichier", async () => {
    const { journal, file } = setup();
    const e1 = ev("text", { text: "un" });
    const e2 = ev("text", { text: "deux" });
    const e3 = ev("text", { text: "trois" });
    const e4 = ev("text", { text: "quatre" });
    for (const e of [e1, e2, e3, e4]) await journal.append(e);
    expect(await journal.truncateFrom(TID, e3.meta.eventId)).toBe(true);
    const replay = await journal.materialize(TID);
    expect(replay.map((e) => e.text)).toEqual(["un", "deux"]);
    // le fichier n'est JAMAIS réécrit : les lignes brutes y sont encore
    const raw = readFileSync(file(), "utf8");
    expect(raw).toContain('"trois"');
    expect(raw).toContain('"quatre"');
    expect(raw).toContain(`"fromEventId":"${e3.meta.eventId}"`);
  });

  it("les événements append-és APRÈS le tombstone restent vivants (nouvelle timeline)", async () => {
    const { journal } = setup();
    const e1 = ev("text", { text: "un" });
    const e2 = ev("text", { text: "deux" });
    await journal.append(e1);
    await journal.append(e2);
    await journal.truncateFrom(TID, e2.meta.eventId);
    // post-revert, la sequence continue de croître au-delà du point tronqué
    await journal.append(ev("text", { text: "reprise" }, { sequence: e2.meta.sequence + 1 }));
    const replay = await journal.materialize(TID);
    expect(replay.map((e) => e.text)).toEqual(["un", "reprise"]);
  });

  it("eventId introuvable : no-op diagnostiqué, aucun tombstone écrit", async () => {
    const warn = quietWarn();
    const { journal, file } = setup();
    await journal.append(ev("text", { text: "seul" }));
    expect(await journal.truncateFrom(TID, "fantome")).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("introuvable"));
    expect(readFileSync(file(), "utf8")).not.toContain("tombstone");
  });
});

describe("copyThread — fork", () => {
  it("copie jusqu'au point de fork inclus, header neuf, meta.threadId réécrit", async () => {
    const { journal, file } = setup();
    const e1 = ev("user", { text: "q" });
    const e2 = ev("text", { text: "r" });
    const e3 = ev("text", { text: "suite" });
    for (const e of [e1, e2, e3]) await journal.append(e);
    expect(await journal.copyThread(TID, "fork-1", e2.meta.eventId)).toBe(true);
    const header = JSON.parse(rawLines(file("fork-1"))[0]);
    expect(header).toMatchObject({
      schemaVersion: 1,
      threadId: "fork-1",
      provider: "claude",
      forkedFrom: TID,
      forkPoint: e2.meta.eventId,
    });
    const replay = await journal.materialize("fork-1");
    expect(replay.map((e) => e.text)).toEqual(["q", "r"]);
    for (const e of replay) expect(e.meta.threadId).toBe("fork-1");
    // la source est intacte
    expect((await journal.materialize(TID)).map((e) => e.text)).toEqual(["q", "r", "suite"]);
  });

  it("respecte les tombstones de la source et refuse une destination existante", async () => {
    const warn = quietWarn();
    const { journal } = setup();
    const e1 = ev("text", { text: "garde" });
    const e2 = ev("text", { text: "reverté" });
    await journal.append(e1);
    await journal.append(e2);
    await journal.truncateFrom(TID, e2.meta.eventId);
    expect(await journal.copyThread(TID, "fork-2")).toBe(true);
    expect((await journal.materialize("fork-2")).map((e) => e.text)).toEqual(["garde"]);
    expect(await journal.copyThread(TID, "fork-2")).toBe(false); // destination existe déjà
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("destination existe déjà"));
  });
});

describe("garde-fou secret : inputs d'outils bornés/scrubés au journal (plan 025 — params MCP sensibles)", () => {
  it("caviarde aussi les secrets courts, URL query/fragment et détails d'interaction", async () => {
    const { journal, file } = setup();
    await journal.append(ev("tool_update", {
      id: "mcp-short", name: "mcp__oauth__login", source: "mcp",
      input: {
        apiKey: "SECRET-SHORT",
        authorization: "Bearer TOKEN-SHORT",
        url: "https://auth.example/callback?state=STATE-SHORT&code=CODE-SHORT#frag",
      },
      output: "ok",
    }));
    await journal.append(ev("interaction", {
      requestId: "approval-short", interactionType: "approval", state: "pending",
      title: "Autoriser Bash ?",
      detail: "curl -H 'Authorization: Bearer DETAIL-SECRET' https://x.test?a=QUERY-SECRET",
    }));
    const raw = readFileSync(file(), "utf8");
    expect(raw).not.toMatch(/SECRET-SHORT|TOKEN-SHORT|STATE-SHORT|CODE-SHORT|DETAIL-SECRET|QUERY-SECRET|#frag/);
    expect(raw).toContain("https://auth.example/callback");
  });

  it("un tool_update avec un input MCP volumineux est borné dans le journal, pas écrit intégralement", async () => {
    const { journal, file } = setup();
    const bigSecret = "SECRET-" + "z".repeat(200 * 1024);
    await journal.append(ev("tool_update", {
      id: "mcp-1", name: "mcp__vault__read", source: "mcp",
      input: { token: bigSecret }, output: "ok",
    }));
    const raw = readFileSync(file(), "utf8");
    // la valeur intégrale du secret ne doit PAS être écrite sur disque
    expect(raw.length).toBeLessThan(120 * 1024);
    expect(raw.includes(bigSecret)).toBe(false);
    // l'item reste rejouable (borné)
    const mat = await journal.materialize(TID);
    const tu = mat.find((e) => e.kind === "tool_update");
    expect(tu).toBeTruthy();
    expect(JSON.stringify(tu).length).toBeLessThan(120 * 1024);
  });

  it("une sortie d'outil énorme est bornée dans le journal", async () => {
    const { journal, file } = setup();
    await journal.append(ev("tool_update", {
      id: "cmd-1", name: "Bash", output: "y".repeat(300 * 1024), input: { command: "cat gros" },
    }));
    const raw = readFileSync(file(), "utf8");
    expect(raw.length).toBeLessThan(120 * 1024);
  });
});

describe("sécurité du fichier journal", () => {
  it("répare un journal existant en 0600 à chaque première ouverture", async () => {
    const first = setup();
    await first.journal.openThread({ threadId: TID, provider: "claude" });
    chmodSync(first.file(), 0o644);
    const restarted = createHarnessJournal({ baseDir: first.base });
    await restarted.openThread({ threadId: TID, provider: "claude" });
    expect(statSync(first.file()).mode & 0o777).toBe(0o600);
  });

  it("refuse un journal qui est un lien symbolique", async () => {
    const { base, dir, journal, file } = setup();
    mkdirSync(dir, { recursive: true });
    const target = join(base, "target.txt");
    writeFileSync(target, "NE-PAS-MODIFIER\n");
    symlinkSync(target, file());

    expect(await journal.append(ev("text", { text: "intrusion" }))).toBe(false);
    expect(readFileSync(target, "utf8")).toBe("NE-PAS-MODIFIER\n");
  });
});

describe("deleteThread et cycle de vie", () => {
  it("supprime le fichier hashé, idempotent, ré-append possible ensuite", async () => {
    const { journal, file } = setup();
    await journal.append(ev("text", { text: "x" }));
    expect(journal.hasJournal(TID)).toBe(true);
    expect(await journal.deleteThread(TID)).toBe(true);
    expect(journal.hasJournal(TID)).toBe(false);
    expect(existsSync(file())).toBe(false);
    expect(await journal.deleteThread(TID)).toBe(false);
    await journal.append(ev("text", { text: "renaissance" }));
    expect((await journal.materialize(TID)).map((e) => e.text)).toEqual(["renaissance"]);
  });

  it("restart : une nouvelle instance relit le même journal (lastSequence pour rebrancher)", async () => {
    const { journal, base } = setup();
    await journal.append(ev("user", { text: "q" }));
    await journal.append(ev("text", { text: "r" }));
    const reborn = createHarnessJournal({ baseDir: base });
    expect((await reborn.materialize(TID)).map((e) => e.kind)).toEqual(["user", "text"]);
    expect(await reborn.lastSequence(TID)).toBeGreaterThanOrEqual(2);
    expect(await reborn.lastSequence("inconnu")).toBe(0);
  });
});
