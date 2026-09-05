import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";


test("exports the finished Atelier Studio site for GitHub Pages", async () => {
  const html = await readFile(new URL('../out/index.html', import.meta.url), 'utf8');
  assert.match(html, /https:\/\/tofunori.github.io\/atelier-studio\//);
  assert.doesNotMatch(html, /(?:src|href|poster)="\/(?:media|_next|atelier-icon)/);
  const paths = [...html.matchAll(/(?:src|href|poster)="(\/atelier-studio\/[^"?#]+)"/g)];
  assert.ok(paths.length > 5, 'Export should reference its CSS, JavaScript and media');
  for (const [, path] of paths) await access(new URL('../out/' + path.replace('/atelier-studio/', ''), import.meta.url));
  assert.match(html, /<title>Atelier Studio — A workspace for scientific research<\/title>/i);
  assert.match(html, /Your thesis,/);
  assert.match(html, /in one workspace/);
  assert.match(html, /From research question/);
  assert.match(html, /A few things to know/);
  assert.match(html, /PhD candidates/);
  assert.match(html, /Read the literature/);
  assert.match(html, /Develop the analysis/);
  assert.match(html, /thesis chapters/);
  assert.match(html, /Claude Code/);
  assert.match(html, /Zotero library/);
  assert.match(html, /og:image[^>]+\/media\/workspace\.png/i);
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
  assert.match(page, /<SurfaceExplorer\s*\/>/);
  assert.match(header, /^"use client"/);
  assert.match(explorer, /^"use client"/);
  assert.match(layout, /generateMetadata/);
  assert.match(layout, /\/media\/workspace\.png/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  await Promise.all([
    access(new URL("../public/media/workspace.png", import.meta.url)),
    access(new URL("../public/atelier-icon.png", import.meta.url)),
    access(new URL("../public/media/gallery.png", import.meta.url)),
  ]);
});

test("public media is complete, mirrored, and uses reviewed demo content", async () => {
  const manifest = JSON.parse(await readFile(new URL("../../docs/media/public/manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.scenes.length, 11);
  const galleryText = manifest.scenes.find(scene => scene.name === 'gallery').visibleText;
  assert.equal(new Set(galleryText.replace(/\s/g, "").match(/[a-z]+(?:-[a-z]+)*\.png/g) ?? []).size, 12, 'The public gallery must show all twelve demo figures');
  for (const scene of manifest.scenes) {
    assert.doesNotMatch(scene.visibleText, /tofunori|Thierry|UTQR|FRQNT|\/Users\/|échec de persistance|failed to load/i);
    const filename = `${scene.name}.png`;
    const [source, asset] = await Promise.all([
      readFile(new URL(`../../docs/media/public/${filename}`, import.meta.url)),
      readFile(new URL(`../public/media/${filename}`, import.meta.url)),
    ]);
    assert.deepEqual(asset, source, `${filename} must match its reviewed capture`);
    assert.equal(asset.readUInt32BE(16), 1600);
    assert.equal(asset.readUInt32BE(20), 1000);
  }
  const [video, publishedVideo] = await Promise.all([
    readFile(new URL("../../docs/media/public/atelier-tour.mp4", import.meta.url)),
    readFile(new URL("../public/media/atelier-tour.mp4", import.meta.url)),
  ]);
  assert.deepEqual(video, publishedVideo);
  assert.ok(video.length > 10000);
});
