import { describe, it, expect } from "vitest";
import { probeHealth, readLock, resolveSingleInstance } from "./single_instance.mjs";

const PID_FILE = "/tmp/test/sidecar.pid";
const LOCK_FILE = "/tmp/test/sidecar.lock";
const HASH = "abc123";

function makeKill(alivePids = []) {
  const alive = new Set(alivePids);
  const signals = [];
  const kill = (pid, sig) => {
    if (sig === 0) {
      if (!alive.has(pid)) throw new Error("ESRCH");
      return true;
    }
    signals.push([pid, sig]);
    return true;
  };
  return { kill, signals };
}

function makeReadFile(files) {
  return (path) => {
    if (!(path in files)) throw new Error("ENOENT");
    return files[path];
  };
}

function healthyFetch(health) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, json: async () => health };
  };
  return { fetchImpl, calls };
}

const LOCK = JSON.stringify({ port: 4567, token: "tok", identity: { pid: 111 } });
const GOOD_HEALTH = { ok: true, pid: 111, bundleHash: HASH };

function resolve({ files, kill, fetchImpl }) {
  return resolveSingleInstance({
    pidFile: PID_FILE,
    lockFile: LOCK_FILE,
    selfPid: 999,
    bundleHash: HASH,
    readFile: makeReadFile(files),
    kill,
    fetchImpl,
    timeoutMs: 50,
  });
}

describe("resolveSingleInstance", () => {
  it("pas de pid file → none, aucun signal", async () => {
    const { kill, signals } = makeKill();
    const out = await resolve({ files: {}, kill });
    expect(out.action).toBe("none");
    expect(signals).toEqual([]);
  });

  it("pid file = notre propre pid → none", async () => {
    const { kill, signals } = makeKill([999]);
    const out = await resolve({ files: { [PID_FILE]: "999" }, kill });
    expect(out.action).toBe("none");
    expect(signals).toEqual([]);
  });

  it("ancien pid mort → none, aucun signal", async () => {
    const { kill, signals } = makeKill();
    const out = await resolve({ files: { [PID_FILE]: "111" }, kill });
    expect(out.action).toBe("none");
    expect(signals).toEqual([]);
  });

  it("ancien vivant sans lock → SIGTERM (orphelin jamais vérifié)", async () => {
    const { kill, signals } = makeKill([111]);
    const out = await resolve({ files: { [PID_FILE]: "111" }, kill });
    expect(out.action).toBe("kill");
    expect(signals).toEqual([[111, "SIGTERM"]]);
  });

  it("lock pointant un autre pid → SIGTERM sans sonder le health", async () => {
    const { kill, signals } = makeKill([111]);
    const { fetchImpl, calls } = healthyFetch(GOOD_HEALTH);
    const lock = JSON.stringify({ port: 4567, token: "tok", identity: { pid: 222 } });
    const out = await resolve({
      files: { [PID_FILE]: "111", [LOCK_FILE]: lock },
      kill,
      fetchImpl,
    });
    expect(out.action).toBe("kill");
    expect(signals).toEqual([[111, "SIGTERM"]]);
    expect(calls).toEqual([]);
  });

  it("ancien sain, même bundle → defer, JAMAIS de SIGTERM", async () => {
    const { kill, signals } = makeKill([111]);
    const { fetchImpl, calls } = healthyFetch(GOOD_HEALTH);
    const out = await resolve({
      files: { [PID_FILE]: "111", [LOCK_FILE]: LOCK },
      kill,
      fetchImpl,
    });
    expect(out.action).toBe("defer");
    expect(out.oldPid).toBe(111);
    expect(signals).toEqual([]);
    expect(calls[0].url).toBe("http://127.0.0.1:4567/health");
    expect(calls[0].opts.headers["x-atelier-token"]).toBe("tok");
  });

  it("ancien sain mais AUTRE bundle → SIGTERM (build périmé)", async () => {
    const { kill, signals } = makeKill([111]);
    const { fetchImpl } = healthyFetch({ ...GOOD_HEALTH, bundleHash: "autre" });
    const out = await resolve({
      files: { [PID_FILE]: "111", [LOCK_FILE]: LOCK },
      kill,
      fetchImpl,
    });
    expect(out.action).toBe("kill");
    expect(signals).toEqual([[111, "SIGTERM"]]);
  });

  it("health répondant avec un pid différent du lock → SIGTERM", async () => {
    const { kill, signals } = makeKill([111]);
    const { fetchImpl } = healthyFetch({ ...GOOD_HEALTH, pid: 222 });
    const out = await resolve({
      files: { [PID_FILE]: "111", [LOCK_FILE]: LOCK },
      kill,
      fetchImpl,
    });
    expect(out.action).toBe("kill");
    expect(signals).toEqual([[111, "SIGTERM"]]);
  });

  it("health injoignable (fetch rejette) → SIGTERM", async () => {
    const { kill, signals } = makeKill([111]);
    const fetchImpl = async () => {
      throw new Error("ECONNREFUSED");
    };
    const out = await resolve({
      files: { [PID_FILE]: "111", [LOCK_FILE]: LOCK },
      kill,
      fetchImpl,
    });
    expect(out.action).toBe("kill");
    expect(signals).toEqual([[111, "SIGTERM"]]);
  });

  it("health HTTP non-200 → SIGTERM", async () => {
    const { kill, signals } = makeKill([111]);
    const fetchImpl = async () => ({ ok: false, json: async () => ({}) });
    const out = await resolve({
      files: { [PID_FILE]: "111", [LOCK_FILE]: LOCK },
      kill,
      fetchImpl,
    });
    expect(out.action).toBe("kill");
    expect(signals).toEqual([[111, "SIGTERM"]]);
  });

  it("pid file illisible (contenu non numérique) → none", async () => {
    const { kill, signals } = makeKill([111]);
    const out = await resolve({ files: { [PID_FILE]: "pas-un-pid" }, kill });
    expect(out.action).toBe("none");
    expect(signals).toEqual([]);
  });
});

describe("readLock", () => {
  it("lock valide → objet", () => {
    expect(readLock(LOCK_FILE, makeReadFile({ [LOCK_FILE]: LOCK }))).toMatchObject({ port: 4567 });
  });

  it("absent, JSON invalide ou sans port numérique → null", () => {
    expect(readLock(LOCK_FILE, makeReadFile({}))).toBeNull();
    expect(readLock(LOCK_FILE, makeReadFile({ [LOCK_FILE]: "{oops" }))).toBeNull();
    expect(readLock(LOCK_FILE, makeReadFile({ [LOCK_FILE]: '{"port":"4567"}' }))).toBeNull();
  });
});

describe("probeHealth", () => {
  it("sonde qui ne répond jamais → abort → null", async () => {
    const fetchImpl = (_url, { signal }) =>
      new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    const out = await probeHealth({ port: 4567 }, { fetchImpl, timeoutMs: 20 });
    expect(out).toBeNull();
  });
});
