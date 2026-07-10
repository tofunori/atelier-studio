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

    // refonte sobre : le chip de recherche est masqué (#searchChip{display:none}),
    // #q est un champ inline toujours visible (raccourci « / ») — remplir direct.
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

    // plan 019 : le clic SÉLECTIONNE (inspecteur) — l'ouverture passe par le
    // double-clic (ou Enter / bouton View de l'inspecteur)
    await page.locator('[data-act="lb"][data-rel="plot-alpha.svg"]').dblclick();

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
    await page.locator('[data-act="lb"][data-rel="preview-alpha.png"]').dblclick();
    await expect(page.locator('#lbImg')).toBeVisible();
    // refonte sobre : l'entrée est l'icône ✎ (#lbAnnot) et l'envoi passe par la
    // pilule (#annotPillSend), visible seulement avec ≥1 commentaire — on dessine
    // une ellipse sur le canvas puis on saisit une note avant d'envoyer.
    await page.locator('#lbAnnot').click();
    await expect(page.locator('#lb')).toHaveClass(/annot/);

    const cv = await page.locator('#annotCv').boundingBox();
    await page.mouse.move(cv.x + cv.width / 2 - 30, cv.y + cv.height / 2 - 20);
    await page.mouse.down();
    await page.mouse.move(cv.x + cv.width / 2 + 30, cv.y + cv.height / 2 + 20);
    await page.mouse.up();
    await expect(page.locator('#annotNote')).toBeVisible();
    await page.locator('#annotNote textarea').fill('note e2e');
    await page.locator('#annotNote .anSave').click();

    await page.locator('#annotPillSend').click();
    await expect.poll(() => savePayload && savePayload.name).toBe('preview-alpha.png');
    expect(savePayload.dataURL).toMatch(/^data:image\/png;base64,/);
    expect(savePayload.notes).toEqual([{ n: 1, text: 'note e2e' }]);
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
    // format v2 : objet d'édits structuré (vide) plutôt que l'ancien tableau
    expect(calls.save.edits).toMatchObject({ version: 2, added: [], removed: [], styles: [], transforms: [] });

    await page.locator('#dpi').selectOption('600');
    await page.locator('#exportpng').click();
    await expect.poll(() => calls.exportPng && calls.exportPng.dpi).toBe(600);
    expect(calls.exportPng.svg).toContain('Alpha snow');
  });
});

// ============ plan 019 — barre de commande, sélection/inspecteur, transfert ==

test('filters: workflow filter via popover shows an active chip, reset restores the grid', async ({ page }) => {
  await withGallery(async ({ url }) => {
    await page.goto(url);
    await expect(page.locator('#grid .card')).toHaveCount(3);

    await page.locator('#filtersChip').click();
    await expect(page.locator('#filtersMenu')).toBeVisible();
    // le sous-menu Statut s'ouvre SANS fermer le popover
    await page.locator('#wfChip').click();
    await expect(page.locator('#filtersMenu')).toBeVisible();
    await page.locator('#wfMenu [data-wfpick="draft"]').click();

    await expect(page.locator('#activeChips .fchip').first()).toContainText('Status: Draft');
    await expect(page.locator('#filtersChip')).toContainText('Filters (1)');
    await expect(page.locator('#grid .empty')).toContainText('No matching files');

    // suppression via la chip → grille restaurée, compteur remis à zéro
    await page.locator('#activeChips [data-fx="wf"]').click();
    await expect(page.locator('#grid .card')).toHaveCount(3);
    await expect(page.locator('#filtersChip')).not.toContainText('(1)');
  });
});

test('select: click selects with aria-selected and the inspector follows across two cards', async ({ page }) => {
  await withGallery(async ({ url }) => {
    await page.goto(url);
    await page.locator('[data-act="lb"][data-rel="plot-alpha.svg"]').click();
    await expect(page.locator('body')).toHaveClass(/has-insp/);
    await expect(page.locator('#lb')).not.toHaveClass(/show/);
    await expect(page.locator('#inspTitle')).toContainText('plot-alpha.svg');
    await expect(page.locator('.card[aria-selected="true"]')).toHaveCount(1);

    await page.locator('[data-act="lb"][data-rel="plot-beta.svg"]').click();
    await expect(page.locator('#inspTitle')).toContainText('plot-beta.svg');
    await expect(page.locator('.card[aria-selected="true"]')).toHaveCount(1);

    // sections réelles de l'inspecteur, provenance honnête
    await expect(page.locator('#inspBody h3')).toHaveText(['Identity', 'Workflow', 'Provenance', 'Organization', 'Actions']);
  });
});

test('workflow: status set from the inspector survives a reload (server-backed)', async ({ page }) => {
  await withGallery(async ({ url }) => {
    await page.goto(url);
    await page.locator('[data-act="lb"][data-rel="plot-alpha.svg"]').click();
    await page.locator('[data-iwf="candidate"]').click();
    await expect(page.locator('.card[data-card="plot-alpha.svg"] .tag.wf')).toContainText('candidate');
    // le POST /state est débouncé (400 ms) — attendre qu'il parte
    await page.waitForTimeout(700);

    await page.reload();
    await expect(page.locator('.card[data-card="plot-alpha.svg"] .tag.wf')).toContainText('candidate');
    await page.locator('[data-act="lb"][data-rel="plot-alpha.svg"]').click();
    await expect(page.locator('[data-iwf="candidate"]')).toHaveClass(/on/);
  });
});

test('add-to-chat from the inspector is idempotent on rapid double activation', async ({ page }) => {
  await withGallery(async ({ root, port }) => {
    // la galerie doit se croire embarquée (window.self !== window.top) : une
    // page hôte servie par le MÊME serveur l'encadre et capture les postMessage
    writeFileSync(path.join(root, 'host.html'), `<!doctype html><body style="margin:0">
<script>window.__msgs=[];window.addEventListener('message',e=>{if(e.data&&e.data.type)window.__msgs.push(e.data)});</script>
<iframe id="g" src="/figures_index.html" style="width:1200px;height:800px;border:0"></iframe></body>`);
    await page.goto(`http://127.0.0.1:${port}/host.html`);
    const g = page.frameLocator('#g');
    await g.locator('#grid .card').first().waitFor();

    await g.locator('[data-act="lb"][data-rel="preview-alpha.png"]').click();
    const chat = g.locator('#inspChat');
    await expect(chat).toBeVisible();
    await chat.click();
    await chat.click(); // double activation rapide — bloquée par pending/added
    await expect(chat).toContainText('Added to chat');

    await expect.poll(() => page.evaluate(() => window.__msgs.filter(m => m.type === 'atelier-add-to-chat').length)).toBe(1);
    const msg = await page.evaluate(() => window.__msgs.find(m => m.type === 'atelier-add-to-chat'));
    expect(msg.text).toContain('preview-alpha.png');
    expect(msg.text).toContain('lis-le (outil Read)');
  });
});

test('keyboard: arrows move the selection, Enter opens, Escape closes in cascade', async ({ page }) => {
  await withGallery(async ({ url }) => {
    await page.goto(url);
    await page.locator('#grid .card [data-act="lb"]').first().click();
    const first = await page.locator('#inspTitle').textContent();
    await page.locator('#grid').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#inspTitle')).not.toHaveText(first);

    await page.keyboard.press('Enter');
    await expect(page.locator('#lb')).toHaveClass(/show/);
    await page.keyboard.press('Escape');           // 1er Escape : lightbox
    await expect(page.locator('#lb')).not.toHaveClass(/show/);
    await expect(page.locator('body')).toHaveClass(/has-insp/);
    await page.keyboard.press('Escape');           // 2e : inspecteur
    await expect(page.locator('body')).not.toHaveClass(/has-insp/);
  });
});

test('800x600: command bar usable, inspector overlays as a drawer, no horizontal scroll', async ({ page }) => {
  await withGallery(async ({ url }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto(url);
    await page.locator('#grid .card [data-act="lb"]').first().click();
    await expect(page.locator('#inspector')).toBeVisible();
    await expect(page.locator('#inspScrim')).toBeVisible();
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(801);
    // le scrim ferme le tiroir
    await page.locator('#inspScrim').click({ position: { x: 10, y: 300 } });
    await expect(page.locator('body')).not.toHaveClass(/has-insp/);
  });
});

test('missing file: inspector shows a local error, the grid stays intact', async ({ page }) => {
  await withGallery(async ({ url, root }) => {
    await page.goto(url);
    // le fichier disparaît du disque APRÈS le scan (cas réel : suppression externe)
    rmSync(path.join(root, 'preview-alpha.png'));
    await page.locator('[data-act="lb"][data-rel="preview-alpha.png"]').click();
    await expect(page.locator('#inspNotice')).toContainText('Preview unavailable');
    await expect(page.locator('#grid .card')).toHaveCount(3);
  });
});
