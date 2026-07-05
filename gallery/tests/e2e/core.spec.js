import { test, expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import zlib from 'node:zlib';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForPing(port) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/ping`);
      if (res.ok) return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  throw new Error(`server on ${port} did not answer /ping`);
}

function writeFixtureProject(root) {
  writeFileSync(path.join(root, 'preview-alpha.png'), pngFixture(96, 64));
  writeFileSync(path.join(root, 'plot-alpha.svg'), `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="140" viewBox="0 0 240 140">
  <rect id="background" width="240" height="140" fill="#ffffff"/>
  <text id="alpha_label" x="30" y="38" font-size="20">Alpha snow</text>
  <path id="alpha_curve" d="M20 115 C70 30 130 120 220 45" fill="none" stroke="#1f77b4" stroke-width="5"/>
</svg>
`);
  writeFileSync(path.join(root, 'plot-beta.svg'), `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 200 120">
  <rect width="200" height="120" fill="#fff7ed"/>
  <text id="beta_label" x="24" y="42" font-size="18">Beta soot</text>
</svg>
`);
  writeFileSync(path.join(root, 'analysis.py'), 'print("alpha snow analysis")\n');
}

function pngFixture(width, height) {
  const chunks = [];
  const append = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const name = Buffer.from(type);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
    chunks.push(len, name, data, crc);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;   // bit depth
  header[9] = 6;   // RGBA
  append('IHDR', header);
  const row = Buffer.alloc(1 + width * 4);
  const raw = Buffer.alloc(row.length * height);
  for (let y = 0; y < height; y += 1) {
    row[0] = 0;
    for (let x = 0; x < width; x += 1) {
      const i = 1 + x * 4;
      row[i] = 224 - Math.floor((x / width) * 70);
      row[i + 1] = 238 - Math.floor((y / height) * 70);
      row[i + 2] = 247;
      row[i + 3] = 255;
    }
    row.copy(raw, y * row.length);
  }
  append('IDAT', zlib.deflateSync(raw));
  append('IEND', Buffer.alloc(0));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks]);
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let k = 0; k < 8; k += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function withGallery(run) {
  const root = mkdtempSync(path.join(tmpdir(), 'cmux-gallery-e2e-'));
  let server;
  try {
    writeFixtureProject(root);
    execFileSync('python3', [path.join(REPO, 'build_gallery.py')], {
      cwd: root,
      env: { ...process.env, GALLERY_ROOT: root, GALLERY_NO_THUMBS: '1' },
      stdio: 'pipe',
    });
    execFileSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(REPO)}); import cmux_gallery; cmux_gallery.provision_viewers(${JSON.stringify(root)})`], {
      cwd: REPO,
      stdio: 'pipe',
    });
    const port = await freePort();
    server = spawn('python3', [path.join(REPO, 'fig_annotate_server.py')], {
      cwd: root,
      env: { ...process.env, GALLERY_ROOT: root, FIG_PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await waitForPing(port);
    await run({ root, port, url: `http://127.0.0.1:${port}/figures_index.html` });
  } finally {
    if (server) {
      server.kill('SIGTERM');
      await new Promise(resolve => server.once('exit', resolve));
    }
    rmSync(root, { recursive: true, force: true });
  }
}

test('browse: search filters the generated gallery cards', async ({ page }) => {
  await withGallery(async ({ url }) => {
    await page.goto(url);
    await expect(page.locator('#grid .card')).toHaveCount(3);
    await expect(page.locator('.brand .stat')).toContainText('4 files');

    await page.locator('#searchChip').click();
    await page.locator('#q').fill('alpha');

    await expect(page.locator('#grid .card')).toHaveCount(2);
    await expect(page.locator('#grid')).toContainText('plot-alpha.svg');
    await expect(page.locator('#grid')).toContainText('preview-alpha.png');
    await expect(page.locator('#grid')).not.toContainText('plot-beta.svg');
  });
});

test('view: opens an SVG artifact in the lightbox viewer', async ({ page }) => {
  await withGallery(async ({ url }) => {
    await page.goto(url);

    await page.locator('[data-act="lb"][data-rel="plot-alpha.svg"]').click();

    await expect(page.locator('#lb')).toHaveClass(/show/);
    await expect(page.locator('#lbPdf')).toBeVisible();
    await expect(page.locator('#lbCap')).toContainText('plot-alpha.svg');
    await expect(page.locator('#lbPdf')).toHaveAttribute('src', /\.fig_thumbs\/svg_viewer\.html\?file=plot-alpha\.svg/);
  });
});

test('export and delete use selected files without mutating disk when endpoints are mocked', async ({ page }) => {
  await withGallery(async ({ url }) => {
    const calls = { export: null, delete: null };
    await page.route('**/export', async route => {
      calls.export = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, path: '_gallery_exports/mock', count: 1 }) });
    });
    await page.route('**/delete', async route => {
      calls.delete = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ deleted: calls.delete.rels }) });
    });

    await page.goto(url);
    await page.locator('[data-act="sel"][data-rel="plot-beta.svg"]').click();
    await expect(page.locator('#exportSel')).toBeVisible();

    await page.locator('#exportSel').click();
    await page.locator('[data-exp="zip"]').click();
    await expect.poll(() => calls.export).toEqual({ mode: 'zip', rels: ['plot-beta.svg'] });
    await expect(page.locator('#exportSel')).toContainText('✓ 1');

    await page.locator('#delSel').click();
    await page.locator('#confirmOk').click();
    await expect.poll(() => calls.delete).toEqual({ rels: ['plot-beta.svg'] });
    await expect(page.locator('#grid')).not.toContainText('plot-beta.svg');
  });
});

test('annotate: image lightbox posts an annotated PNG payload', async ({ page }) => {
  await withGallery(async ({ url }) => {
    let savePayload = null;
    await page.route('**/save', async route => {
      savePayload = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, sentToClaude: false, path: 'annotations/mock.png' }) });
    });

    await page.goto(url);
    await page.locator('[data-act="lb"][data-rel="preview-alpha.png"]').click();
    await expect(page.locator('#lbImg')).toBeVisible();
    await page.locator('#lbCap button', { hasText: 'Annotate' }).click();
    await expect(page.locator('#lb')).toHaveClass(/annot/);

    await page.locator('#annotSend').click();
    await expect.poll(() => savePayload && savePayload.name).toBe('preview-alpha.png');
    expect(savePayload.dataURL).toMatch(/^data:image\/png;base64,/);
    expect(savePayload.notes).toEqual([]);
  });
});

test('annotate: SVG viewer posts save and PNG export payloads', async ({ page }) => {
  await withGallery(async ({ port }) => {
    const calls = { save: null, exportPng: null };
    await page.route('**/save-svg', async route => {
      calls.save = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, path: 'plot-alpha.svg' }) });
    });
    await page.route('**/export-png', async route => {
      calls.exportPng = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, path: 'plot-alpha.png', dpi: calls.exportPng.dpi }) });
    });

    await page.goto(`http://127.0.0.1:${port}/.fig_thumbs/svg_viewer.html?file=plot-alpha.svg`);
    await expect(page.locator('#plot svg')).toBeVisible();
    await expect(page.locator('#plot')).toContainText('Alpha snow');

    await page.locator('#savesvg').click();
    await expect.poll(() => calls.save && calls.save.rel).toBe('plot-alpha.svg');
    expect(calls.save.svg).toContain('alpha_curve');
    expect(calls.save.edits).toEqual([]);

    await page.locator('#dpi').selectOption('600');
    await page.locator('#exportpng').click();
    await expect.poll(() => calls.exportPng && calls.exportPng.dpi).toBe(600);
    expect(calls.exportPng.svg).toContain('Alpha snow');
  });
});
