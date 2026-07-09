import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
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

function transientNetworkError(error) {
  return ["ECONNRESET", "EPIPE", "ECONNREFUSED"].includes(error?.code) ||
    String(error?.message || "").includes("socket hang up");
}

async function request(port, route, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await requestOnce(port, route, options);
    } catch (error) {
      lastError = error;
      if (!transientNetworkError(error) || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
  throw lastError;
}

function requestOnce(port, route, { method = "GET", body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === null ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: route,
      method,
      headers: {
        ...(data ? { "Content-Type": "application/json", "Content-Length": String(data.length) } : {}),
        ...headers,
      },
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
  fs.writeFileSync(path.join(root, "main.tex"), "\\documentclass{article}\n\\begin{document}\n\\input{section}\n\\end{document}\n");
  fs.writeFileSync(path.join(root, "section.tex"), "Section body\n");
  fs.writeFileSync(path.join(root, "figure.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\"><rect width=\"10\" height=\"10\"/></svg>\n");
}

function pngDimensions(buf) {
  assert.equal(buf.toString("ascii", 1, 4), "PNG");
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

function assertJsonClose(a, b, ctx) {
  if (typeof a === "number" && typeof b === "number") {
    assert.ok(Math.abs(a - b) < 1e-3, `${ctx}: ${a} !== ${b}`);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    assert.equal(a.length, b.length, `${ctx} length`);
    a.forEach((v, i) => assertJsonClose(v, b[i], `${ctx}[${i}]`));
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), `${ctx} keys`);
    for (const k of Object.keys(a)) assertJsonClose(a[k], b[k], `${ctx}.${k}`);
    return;
  }
  assert.deepEqual(a, b, ctx);
}

function assertSameRoute(route, py, node) {
  assert.equal(node.status, py.status, `${route} status`);
  // parité stricte des corps sur les succès ; sur les erreurs, seule la
  // sémantique compte (la page d'erreur HTML de BaseHTTPRequestHandler
  // n'est pas un contrat — le front ne la lit jamais)
  if (py.status < 400) {
    // JSON : comparaison structurelle avec tolérance sur les flottants
    // (mtime : getmtime() Python et mtimeMs/1000 Node divergent à la 6e décimale)
    let pj = null, nj = null;
    try { pj = JSON.parse(py.body.toString()); nj = JSON.parse(node.body.toString()); } catch {}
    if (pj !== null && nj !== null) assertJsonClose(nj, pj, route);
    else assert.deepEqual(node.body, py.body, `${route} body`);
  }
}

function findChrome() {
  for (const p of [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ]) {
    if (fs.existsSync(p)) return p;
  }
  for (const name of ["google-chrome", "chromium-browser", "chromium", "chrome"]) {
    const r = spawnSync("which", [name], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim().split(/\r?\n/)[0];
  }
  return null;
}

function renderCardsWithChrome(chrome, url) {
  const r = spawnSync(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--virtual-time-budget=3000",
    "--dump-dom",
    url,
  ], { encoding: "utf8", timeout: 10000 });
  assert.equal(r.status, 0, `chrome render ${url}: ${r.stderr}`);
  return [...r.stdout.matchAll(/data-act="lb" data-rel="([^"]+)"/g)].map((m) => m[1]).sort();
}

function inlineHtmlFromTemplate(root, payload) {
  const template = fs.readFileSync(path.join(GALLERY_DIR, "assets", "gallery_template.html"), "utf8");
  const escHtml = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const rootJs = root.replaceAll("\\", "\\\\").replaceAll("'", "\\'").replaceAll("\n", "\\n").replaceAll("\r", "").replaceAll("</", "<\\/");
  return template
    .replaceAll("__TITLE__", escHtml(payload.title))
    .replaceAll("__WORDMARK__", escHtml(payload.wordmark))
    .replaceAll("__PROJECT__", escHtml(payload.project))
    .replaceAll("__COUNT__", payload.countLabel)
    .replaceAll("__GEN__", payload.gen)
    .replaceAll("__VER__", payload.ver)
    .replaceAll("__DATA__", JSON.stringify(payload.files).replaceAll("</", "<\\/"))
    .replaceAll("__FOLDERS__", JSON.stringify(payload.folders).replaceAll("</", "<\\/"))
    .replaceAll("__FAVS__", JSON.stringify(payload.favs).replaceAll("</", "<\\/"))
    .replaceAll("__ROOT__", rootJs);
}

async function main() {
  // realpath : /var → /private/var sur macOS ; en prod GALLERY_ROOT n'est jamais
  // un symlink, on normalise pour que les deux serveurs voient le même chemin
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "gallery-node-parity-")));
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "gallery-node-home-")));
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

    const healthRes = await request(nodePort, "/health");
    assert.equal(healthRes.status, 200, "GET /health status");
    const health = JSON.parse(healthRes.body.toString());
    assert.equal(health.service, "atelier-gallery");
    assert.equal(health.projectRoot, root);
    assert.equal(health.pid, node.pid);
    assert.equal(health.tokenRequired, false);
    assert.equal(typeof health.startedAt, "string");
    assert.equal(typeof health.bundleHash, "string");
    assert.ok(health.bundleHash.length >= 16, "health has bundle hash");

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
      "/rev",
      `/texroot?path=${encodeURIComponent("section.tex")}`,
      `/code?path=${encodeURIComponent("script.py")}`,
      `/findscript?stem=${encodeURIComponent("alpha")}`,
      `/lint?path=${encodeURIComponent(path.join(root, "script.py"))}`,
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
    // boot-build : le serveur bâtit la galerie au démarrage si absente
    assert.equal(rootRes.status, 200, "node / serves the boot-built index");

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
    r = await request(nodePort, "/state");
    assert.deepEqual(JSON.parse(r.body.toString()).workflow, { "plot.png": "final" }, "GET /state relit le workflow persisté");

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

    // --- Frontière d'origine (plan 005) : requêtes inter-origines refusées
    // --- avant tout routage ; sans Origin (probes, navigation) rien ne change.
    const externalOrigin = "https://evil.example";
    const samePortOrigin = `http://127.0.0.1:${nodePort}`;
    const otherPortOrigin = `http://127.0.0.1:${pyPort}`;

    r = await request(nodePort, `/raw?path=${encodeURIComponent("script.py")}`, {
      headers: { Origin: externalOrigin },
    });
    assert.equal(r.status, 403, "GET /raw cross-origin → 403");
    assert.ok(!r.body.toString("utf8").includes("alpha"), "corps 403 sans contenu du fichier");

    r = await request(nodePort, `/raw?path=${encodeURIComponent("script.py")}`, {
      headers: { Origin: samePortOrigin },
    });
    assert.equal(r.status, 200, "GET /raw même origine → 200");

    r = await request(nodePort, "/state", { headers: { Origin: otherPortOrigin } });
    assert.equal(r.status, 403, "GET /state autre port loopback → 403");

    const annotsPath = path.join(root, ".fig_thumbs", "pdf_annots.json");
    const annotsBefore = fs.readFileSync(annotsPath, "utf8");
    r = await request(nodePort, "/pdfannot", {
      method: "POST",
      body: { rel: "doc.pdf", annots: [{ page: 9, text: "evil" }] },
      headers: { Origin: externalOrigin },
    });
    assert.equal(r.status, 403, "POST /pdfannot cross-origin → 403 (plus d'exemption)");
    assert.equal(fs.readFileSync(annotsPath, "utf8"), annotsBefore, "pdfannot cross-origin ne mute rien");

    const statePath = path.join(root, ".fig_state.json");
    const stateBefore = fs.readFileSync(statePath, "utf8");
    r = await request(nodePort, "/state", {
      method: "POST",
      body: { favs: ["evil.png"] },
      headers: { Origin: externalOrigin },
    });
    assert.equal(r.status, 403, "POST /state cross-origin → 403");
    assert.equal(fs.readFileSync(statePath, "utf8"), stateBefore, "state cross-origin ne mute rien");

    r = await request(nodePort, "/state", { headers: { Origin: "null" } });
    assert.equal(r.status, 403, "Origin null (iframe sandboxée) → 403");

    r = await request(nodePort, "/ping", { headers: { Origin: "tauri://localhost" } });
    assert.equal(r.status, 200, "origine webview de l'app autorisée");

    r = await request(nodePort, "/ping");
    assert.equal(r.status, 200, "GET sans Origin → 200");
    assert.equal(r.headers["access-control-allow-origin"], undefined, "aucun ACAO wildcard");

    r = await request(nodePort, "/state", { method: "OPTIONS" });
    assert.equal(r.status, 200, "OPTIONS sans Origin → 200");
    assert.equal(r.headers["access-control-allow-origin"], undefined, "OPTIONS sans CORS permissif");

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
    assert.equal(fs.existsSync(path.join(root, "figures_data.json")), true);
    assert.equal((fs.readFileSync(path.join(root, "figures_index.html"), "utf8").match(/<\/script>/g) || []).length, 1);
    assert.equal(fs.readFileSync(path.join(root, "figures_index.html"), "utf8").includes('"plot.png"'), false, "shell has no inline scanned data");
    r = await request(nodePort, "/data");
    assert.equal(r.status, 200, "GET /data");
    assert.equal(r.headers["cache-control"], "no-cache", "GET /data no-cache");
    const payload = JSON.parse(r.body.toString());
    assert.ok(payload.files.some((f) => f.rel === "plot.png"), "data includes plot.png");
    const inlineHtml = inlineHtmlFromTemplate(root, payload);
    fs.writeFileSync(path.join(root, "figures_inline.html"), inlineHtml);
    const chrome = findChrome();
    if (chrome) {
      assert.deepEqual(
        renderCardsWithChrome(chrome, `http://127.0.0.1:${nodePort}/figures_index.html`),
        renderCardsWithChrome(chrome, `http://127.0.0.1:${nodePort}/figures_inline.html`),
        "fetched and inline data modes render the same cards",
      );
    }
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
