import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.dirname(TEST_DIR);
const GALLERY_DIR = path.dirname(SERVER_DIR);

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function request(port, route, { method = "GET", body = null } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === null ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: route,
      method,
      headers: data ? { "Content-Type": "application/json", "Content-Length": String(data.length) } : {},
      timeout: 7000,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error(`timeout ${method} ${route}`));
    });
    if (data) req.write(data);
    req.end();
  });
}

async function waitForPing(port) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const r = await request(port, "/ping");
      if (r.status === 200) return;
    } catch {
      // keep polling
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`server did not answer /ping on ${port}`);
}

function startServer(cmd, args, env, cwd) {
  return spawn(cmd, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function writeFixture(root) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, "plot.png"), Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  ));
  fs.writeFileSync(path.join(root, "script.py"), "print('alpha')\nprint('beta')\n");
  fs.writeFileSync(path.join(root, "notes.md"), "# Notes\n\nalpha\n");
  fs.mkdirSync(path.join(root, "nested"));
  fs.writeFileSync(path.join(root, "nested", "data.md"), "nested\n");
}

function pngDimensions(buf) {
  assert.equal(buf.toString("ascii", 1, 4), "PNG");
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

function assertSameRoute(route, py, node) {
  assert.equal(node.status, py.status, `${route} status`);
  assert.deepEqual(node.body, py.body, `${route} body`);
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-node-parity-"));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-node-home-"));
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  writeFixture(root);
  const pyPort = await freePort();
  const nodePort = await freePort();
  const commonEnv = {
    ...process.env,
    GALLERY_ROOT: root,
    ATELIER_STUDIO: "1",
    GALLERY_NO_THUMBS: "1",
    HOME: home,
  };
  const py = startServer("python3", [path.join(GALLERY_DIR, "fig_annotate_server.py")], {
    ...commonEnv,
    FIG_PORT: String(pyPort),
  }, root);
  const node = startServer(process.execPath, [path.join(SERVER_DIR, "main.mjs")], {
    ...commonEnv,
    FIG_PORT: String(nodePort),
  }, root);

  try {
    await Promise.all([waitForPing(pyPort), waitForPing(nodePort)]);

    const routes = [
      "/ping",
      "/state",
      "/ls",
      `/ls?dir=${encodeURIComponent(path.join(root, "nested"))}`,
      "/claude-targets",
      `/raw?path=${encodeURIComponent("script.py")}`,
      `/snippet?path=${encodeURIComponent("script.py")}&n=2`,
      "/pdfannot?rel=doc.pdf",
      "/quote",
    ];
    for (const route of routes) {
      const [pyRes, nodeRes] = await Promise.all([request(pyPort, route), request(nodePort, route)]);
      assertSameRoute(route, pyRes, nodeRes);
    }

    const thumbRoute = `/thumb?path=${encodeURIComponent("plot.png")}&w=64`;
    const pyThumb = await request(pyPort, thumbRoute);
    const nodeThumb = await request(nodePort, thumbRoute);
    assert.equal(nodeThumb.status, pyThumb.status, "thumb status");
    assert.deepEqual(pngDimensions(nodeThumb.body), pngDimensions(pyThumb.body), "thumb dimensions");

    const rootRes = await request(nodePort, "/");
    assert.equal(rootRes.status, 404, "node / mirrors missing index before rescan");

    let r = await request(nodePort, "/state", {
      method: "POST",
      body: {
        favs: ["plot.png"],
        ratings: { "plot.png": 5, "bad": 9 },
        hidden: ["notes.md"],
        tags: { "plot.png": [" final ", "final", ""] },
        hideRules: ["archive", ""],
        collections: { chosen: ["plot.png", "plot.png"] },
        workflow: { "plot.png": "final", "notes.md": "bogus" },
      },
    });
    assert.equal(r.status, 200, "POST /state status");
    assert.deepEqual(JSON.parse(r.body.toString()), { ok: true, favs: 1, ratings: 1, hidden: 1 });
    const state = JSON.parse(fs.readFileSync(path.join(root, ".fig_state.json"), "utf8"));
    assert.deepEqual(state.workflow, { "plot.png": "final" });

    r = await request(nodePort, "/pdfannot", {
      method: "POST",
      body: { rel: "doc.pdf", annots: [{ page: 1, text: "keep" }] },
    });
    assert.equal(r.status, 200, "POST /pdfannot save");
    r = await request(nodePort, "/pdfannot", {
      method: "POST",
      body: { rel: "doc.pdf", annots: [] },
    });
    assert.equal(r.status, 200, "POST /pdfannot clear");
    assert.ok(fs.existsSync(path.join(root, ".fig_thumbs", "pdf_annots.json.bak")), "pdf annot backup exists");

    r = await request(nodePort, "/selinfo", {
      method: "POST",
      body: { rel: "script.py", lines: [1, 2], text: "print" },
    });
    assert.equal(r.status, 200, "POST /selinfo write");
    const sel = JSON.parse(fs.readFileSync(path.join(home, ".claude", "fig-selection.json"), "utf8"));
    assert.deepEqual(sel.lines, [1, 2]);
    assert.equal(typeof sel.ts, "number");
    r = await request(nodePort, "/selinfo", { method: "POST", body: { lines: [] } });
    assert.equal(r.status, 200, "POST /selinfo clear");
    assert.equal(fs.existsSync(path.join(home, ".claude", "fig-selection.json")), false);

    fs.writeFileSync(path.join(home, ".claude", "fig-last-quote.txt"), "Annotations pending");
    r = await request(nodePort, "/clear-quote", { method: "POST", body: {} });
    assert.equal(r.status, 200, "POST /clear-quote");
    assert.equal(fs.readFileSync(path.join(home, ".claude", "fig-last-quote.txt"), "utf8"), "");

    r = await request(nodePort, "/quote", {
      method: "POST",
      body: { rel: "notes.md", page: 2, text: " selected text ", comment: "fix", embed: true },
    });
    assert.equal(r.status, 200, "POST /quote");
    assert.deepEqual(JSON.parse(r.body.toString()), {
      embedded: true,
      message: `${path.join(root, "notes.md")} (p.2) : \u00ab selected text \u00bb\nCommentaire : fix`,
    });

    r = await request(nodePort, "/rescan", { method: "POST", body: {} });
    assert.equal(r.status, 200, "POST /rescan");
    assert.equal(JSON.parse(r.body.toString()).ok, true);
    assert.equal(fs.existsSync(path.join(root, "figures_index.html")), true);
    assert.equal((fs.readFileSync(path.join(root, "figures_index.html"), "utf8").match(/<\/script>/g) || []).length, 1);
    r = await request(nodePort, "/");
    assert.equal(r.status, 200, "node / serves figures_index.html after rescan");

    console.log("parity: ok");
  } finally {
    py.kill("SIGTERM");
    node.kill("SIGTERM");
    await Promise.allSettled([
      new Promise((resolve) => py.once("exit", resolve)),
      new Promise((resolve) => node.once("exit", resolve)),
    ]);
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
