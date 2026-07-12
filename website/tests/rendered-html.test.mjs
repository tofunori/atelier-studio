import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the finished Atelier Studio site", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Atelier Studio — Native research workspace<\/title>/i);
  assert.match(html, /Research, with every tool/);
  assert.match(html, /Read\. Code\. Annotate\. Steer agents\./);
  assert.match(html, /Every function, mapped\./);
  assert.match(html, /Technical specification/);
  assert.match(html, /Claude Code/);
  assert.match(html, /Zotero library/);
  assert.match(html, /og:image[^>]+\/og\.png/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps interactive islands focused and removes starter artifacts", async () => {
  const [page, header, explorer, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/SiteHeader.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/SurfaceExplorer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /^"use client"/);
  assert.match(page, /<SiteHeader/);
  assert.match(page, /<SurfaceExplorer \/>/);
  assert.match(header, /^"use client"/);
  assert.match(explorer, /^"use client"/);
  assert.match(layout, /generateMetadata/);
  assert.match(layout, /\/og\.png/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  await Promise.all([
    access(new URL("../public/atelier-hero.png", import.meta.url)),
    access(new URL("../public/atelier-icon.png", import.meta.url)),
    access(new URL("../public/og.png", import.meta.url)),
  ]);
});
