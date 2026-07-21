import { test, expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import zlib from 'node:zlib';
import { removeTempRoot } from './temp-root.js';

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

async function waitForGallery(port) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/figures_index.html`);
      if (res.ok && (await res.text()).includes('const INLINE_FILES =')) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`gallery on ${port} did not finish indexing`);
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
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'cmux-gallery-e2e-')));
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
    server = spawn(process.execPath, [path.join(REPO, 'server', 'main.mjs')], {
      cwd: root,
      env: {
        ...process.env,
        GALLERY_ROOT: root,
        FIG_PORT: String(port),
        ATELIER_STUDIO: '1',
        GALLERY_NO_THUMBS: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await waitForPing(port);
    await waitForGallery(port);
    await run({ root, port, url: `http://127.0.0.1:${port}/figures_index.html` });
  } finally {
    if (server) {
      server.kill('SIGTERM');
      await new Promise(resolve => server.once('exit', resolve));
    }
    await removeTempRoot(root);
  }
}

test('browse: search filters the generated gallery cards', async ({ page }) => {
  await withGallery(async ({ url }) => {
    await page.goto(url);
    await expect(page.locator('#grid .card')).toHaveCount(3);
    await expect(page.locator('.brand .stat')).toContainText('4 files');

    await page.getByRole('button', { name: 'Search files' }).click();
    await expect(page.locator('[data-gallery-command="search"]')).toBeVisible();
    const searchGroup = page.locator('[data-gallery-command-group="search"]');
    await expect(searchGroup).toHaveAttribute('data-slot', 'input-group');
    await expect(searchGroup.locator('[data-slot="input-group-addon"]')).toBeVisible();
    expect((await searchGroup.boundingBox()).width).toBeLessThanOrEqual(361);
    await page.locator('[data-gallery-command="search"]').fill('alpha');

    await expect(page.locator('#grid .card')).toHaveCount(2);
    await expect(page.locator('#grid')).toContainText('plot-alpha.svg');
    await expect(page.locator('#grid')).toContainText('preview-alpha.png');
    await expect(page.locator('#grid')).not.toContainText('plot-beta.svg');

    // La recherche par nom ignore le masque de formats par défaut : le code
    // reste trouvable sans activer manuellement la catégorie Code.
    await page.locator('[data-gallery-command="search"]').fill('analysis.py');
    await expect(page.locator('#grid .card')).toHaveCount(1);
    await expect(page.locator('#grid')).toContainText('analysis.py');

    // Les extensions individuelles restent disponibles dans le gestionnaire
    // de types, sans sous-menu ni compteurs de fichiers.
    await page.locator('[data-gallery-command="filters"]').click();
    const typePanel = page.locator('[data-gallery-file-type-panel]');
    await expect(typePanel).toBeVisible();
    await typePanel.getByRole('button', { name: 'All file types' }).click();
    await expect(typePanel.locator('[data-gallery-file-type="py"]')).toContainText('Python');
    await typePanel.locator('[data-gallery-file-type="svg"]').click();

    // Un type désactivé explicitement se combine avec la requête texte.
    await page.getByRole('button', { name: /Search files/ }).click();
    await page.locator('[data-gallery-command="search"]').fill('plot-alpha.svg');
    await expect(page.locator('#grid .empty')).toContainText('No matching files');
  });
});

test('browse: repeated rerenders release detached code preview observers', async ({ page }) => {
  await withGallery(async ({ url }) => {
    await page.addInitScript(() => {
      const active = new Set();
      window.__activeSnippetObserverTargets = active;
      window.IntersectionObserver = class {
        observe(target) { active.add(target); }
        unobserve(target) { active.delete(target); }
        disconnect() { active.clear(); }
      };
    });
    await page.goto(url);
    await page.getByRole('button', { name: 'Search files' }).click();
    const search = page.locator('[data-gallery-command="search"]');

    for (let i = 0; i < 30; i += 1) {
      await search.fill('analysis.py');
      await expect(page.locator('#grid .card')).toHaveCount(1);
      await search.fill('plot');
      await expect(page.locator('#grid .card')).toHaveCount(2);
    }
    await search.fill('analysis.py');
    await expect(page.locator('#grid .card')).toHaveCount(1);

    expect(await page.evaluate(() => window.__activeSnippetObserverTargets.size)).toBe(1);
    await page.locator('#grid .card').click();
    await expect(page.locator('#lb')).toHaveClass(/show/);
  });
});

test('chat bridge: show focuses known figures and reports missing paths', async ({ page }) => {
  await withGallery(async ({ root, url }) => {
    const nonce = 'e2e-gallery-command';
    await page.route('**/thumb?**', route => route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: pngFixture(8, 8),
    }));
    await page.goto(`${url}?embedded=atelier#atelier_nonce=${nonce}`);
    await expect(page.locator('#grid .card')).toHaveCount(3);

    const result = await page.evaluate(({ projectRoot, nonce }) => new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('gallery result timeout')), 3000);
      const onMessage = event => {
        if (event.data?.type !== 'atelier-gallery-result' || event.data.requestId !== 'e2e-show-1') return;
        window.clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        resolve(event.data);
      };
      window.addEventListener('message', onMessage);
      window.postMessage({
        type: 'atelier-gallery-command',
        nonce,
        action: 'show',
        mode: 'focus',
        projectRoot,
        requestId: 'e2e-show-1',
        rels: ['plot-alpha.svg', 'plot-beta.svg', 'missing.svg'],
      }, window.location.origin);
    }), { projectRoot: root, nonce });

    expect(result).toMatchObject({
      ok: true,
      action: 'show',
      projectRoot: root,
      requestId: 'e2e-show-1',
      matched: ['plot-alpha.svg', 'plot-beta.svg'],
      missing: ['missing.svg'],
    });
    await expect(page.locator('#grid .card')).toHaveCount(2);
    await expect(page.locator('#grid .selbox.on')).toHaveCount(2);
    await expect(page.locator('#activeChips')).toContainText('Chat focus: 2');
    // Arrêter les chargements de miniatures avant que withGallery supprime le
    // projet temporaire; sinon macOS peut recréer .fig_thumbs pendant rmSync.
    await page.goto('about:blank');
  });
});

test('chat bridge: open, compare and reset drive the existing gallery surfaces', async ({ page }) => {
  await withGallery(async ({ root, url }) => {
    const nonce = 'e2e-gallery-actions';
    await page.route('**/thumb?**', route => route.fulfill({
      status: 200, contentType: 'image/png', body: pngFixture(8, 8),
    }));
    await page.goto(`${url}?embedded=atelier#atelier_nonce=${nonce}`);

    const send = async (action, mode, rels, requestId) => page.evaluate(
      ({ action, mode, rels, requestId, projectRoot, nonce }) => new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('gallery result timeout')), 3000);
        const onMessage = event => {
          if (event.data?.type !== 'atelier-gallery-result' || event.data.requestId !== requestId) return;
          window.clearTimeout(timer);
          window.removeEventListener('message', onMessage);
          resolve(event.data);
        };
        window.addEventListener('message', onMessage);
        window.postMessage({
          type: 'atelier-gallery-command', nonce, action, mode, projectRoot, requestId, rels,
        }, window.location.origin);
      }),
      { action, mode, rels, requestId, projectRoot: root, nonce },
    );

    const openedTab = page.evaluate(() => new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('open tab timeout')), 3000);
      const onMessage = event => {
        if (event.data?.type !== 'atelier-open-tab') return;
        window.clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        resolve(event.data);
      };
      window.addEventListener('message', onMessage);
    }));
    await expect(send('open', 'viewer', ['plot-alpha.svg'], 'e2e-open')).resolves.toMatchObject({
      ok: true, action: 'open', applied: true, matched: ['plot-alpha.svg'],
    });
    await expect(openedTab).resolves.toMatchObject({
      type: 'atelier-open-tab', title: 'plot-alpha.svg',
    });

    await expect(send('compare', 'selection', ['plot-alpha.svg', 'plot-beta.svg'], 'e2e-compare')).resolves.toMatchObject({
      ok: true, action: 'compare', applied: true, matched: ['plot-alpha.svg', 'plot-beta.svg'],
    });
    await expect(page.locator('#cmp')).toHaveClass(/show/);
    await expect(page.locator('#cmpInner .cmpCell')).toHaveCount(2);
    await expect(page.locator('#activeChips')).toContainText('Chat focus: 2');

    await expect(send('reset', 'all', [], 'e2e-reset')).resolves.toMatchObject({
      ok: true, action: 'reset', applied: true, matched: [], missing: [],
    });
    await expect(page.locator('#cmp')).not.toHaveClass(/show/);
    await expect(page.locator('#grid .card')).toHaveCount(3);
    await expect(page.locator('#activeChips')).not.toContainText('Chat focus');
    await page.goto('about:blank');
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
    const gridTopBefore = await page.locator('#grid').evaluate(element => element.getBoundingClientRect().top);
    await page.locator('[data-act="sel"][data-rel="plot-beta.svg"]').click();
    await expect(page.locator('[data-gallery-toolbar-state="selection"]')).toBeVisible();
    const gridTopAfter = await page.locator('#grid').evaluate(element => element.getBoundingClientRect().top);
    expect(Math.abs(gridTopAfter - gridTopBefore)).toBeLessThanOrEqual(1);

    await page.locator('[data-gallery-selection-action="export"]').click();
    await page.locator('[data-exp="zip"]').click();
    await expect.poll(() => calls.export).toEqual({ mode: 'zip', rels: ['plot-beta.svg'] });

    await page.getByRole('button', { name: 'More selection actions' }).click();
    await page.getByRole('menuitem', { name: 'Move to Trash' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Move 1 file to Trash?' })).toBeVisible();
    await expect(page.getByRole('alertdialog')).toContainText('You can recover it from Trash.');
    await expect(page.locator('[data-slot="alert-dialog-media"]')).toBeVisible();
    await page.locator('[data-gallery-confirm="accept"]').click();
    await expect.poll(() => calls.delete).toEqual({ rels: ['plot-beta.svg'] });
    await expect(page.locator('#grid')).not.toContainText('plot-beta.svg');
  });
});

test('annotate: launcher draws a rectangle and sends from the contextual capsule', async ({ page }) => {
  await withGallery(async ({ root, url }) => {
    let savePayload = null;
    page.on('request', request => {
      if (request.url().endsWith('/save')) savePayload = request.postDataJSON();
    });

    await page.goto(url);
    await page.locator('[data-act="lb"][data-rel="preview-alpha.png"]').click();
    await expect(page.locator('#lbImg')).toBeVisible();
    await expect(page.locator('#lbAnnot')).toHaveAttribute('aria-label', 'Ajouter une annotation');
    await page.locator('#lbAnnot').click();
    await expect(page.locator('#lb')).toHaveClass(/annot/);
    await expect(page.locator('#annotBar')).toBeHidden();

    const cv = await page.locator('#annotCv').boundingBox();
    await page.mouse.move(cv.x + cv.width / 2 - 30, cv.y + cv.height / 2 - 20);
    await page.mouse.down();
    await page.mouse.move(cv.x + cv.width / 2 + 30, cv.y + cv.height / 2 + 20);
    await page.mouse.up();
    await expect(page.locator('#annotNote')).toBeVisible();
    await page.locator('#annotNote textarea').fill('note e2e');
    await page.locator('#annotNote .anSave').click();
    await expect.poll(() => savePayload && savePayload.name).toBe('preview-alpha.png');
    expect(savePayload.dataURL).toMatch(/^data:image\/png;base64,/);
    expect(savePayload.notes).toEqual([{ n: 1, text: 'note e2e' }]);
    await expect(page.locator('#annotNote')).toBeHidden();
    await expect(page.locator('#lb')).not.toHaveClass(/annot/);

    const previewDir = path.join(root, '.fig_thumbs', 'annotation-previews');
    await expect.poll(() => existsSync(previewDir) ? readdirSync(previewDir).filter(name => name.endsWith('.png')).length : 0).toBe(1);
    expect(existsSync(path.join(root, 'annotations'))).toBe(false);
    await page.request.post(`${url}/rescan`, { data: {} });
    await expect(page.locator('#grid .card')).toHaveCount(3);
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

    await page.locator('[data-gallery-command="status"]').click();
    await page.locator('[data-gallery-status="draft"]').click();

    await expect(page.locator('#activeChips .fchip').first()).toContainText('Status: Draft');
    await expect(page.locator('[data-gallery-command="filters"]')).toContainText('Filters 1');
    await expect(page.locator('#grid .empty')).toContainText('No matching files');

    // suppression via la chip → grille restaurée, compteur remis à zéro
    await page.locator('[data-gallery-filter-chip="wf"]').click();
    await expect(page.locator('#grid .card')).toHaveCount(3);
    await expect(page.locator('[data-gallery-command="filters"]')).not.toContainText(' 1');
  });
});

test('file types: quick types and custom presets persist only for the project', async ({ page }) => {
  await withGallery(async ({ root, url }) => {
    await page.goto(url);
    await page.locator('[data-gallery-command="filters"]').click();
    const dialog = page.getByRole('dialog', { name: 'File types' });
    await expect(dialog).toBeVisible();
    await expect(dialog).not.toContainText(/\b\d+ files?\b/i);

    await dialog.getByRole('button', { name: 'Customize' }).click();
    const shell = dialog.locator('[data-gallery-customize-type="sh"]');
    await expect(shell).toHaveAttribute('aria-pressed', 'false');
    await shell.click();
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog.locator('[data-gallery-quick-type="sh"]')).toBeVisible();

    await dialog.locator('[data-gallery-new-preset]').click();
    await dialog.getByRole('textbox', { name: 'New preset name' }).fill('Manuscript');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByRole('button', { name: 'Manuscript', exact: true })).toBeVisible();

    const scopedKeys = await page.evaluate(projectRoot => Object.keys(localStorage).filter(key => key.includes(projectRoot)), root);
    expect(scopedKeys.some(key => key.startsWith('galleryPinnedFileTypesV1:'))).toBe(true);
    expect(scopedKeys.some(key => key.startsWith('galleryFileTypePresetsV1:'))).toBe(true);

    await page.reload();
    await page.locator('[data-gallery-command="filters"]').click();
    await expect(page.locator('[data-gallery-quick-type="sh"]')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'File types' }).getByRole('button', { name: 'Manuscript', exact: true })).toBeVisible();
  });
});

test('file types: an explicit type selection filters favorites too', async ({ page }) => {
  await withGallery(async ({ url }) => {
    await page.goto(url);

    for (const rel of ['preview-alpha.png', 'plot-alpha.svg']) {
      await page.locator(`.card[data-card="${rel}"]`).hover();
      await page.locator(`[data-act="fav"][data-rel="${rel}"]`).click();
    }

    await page.locator('[data-gallery-command="favorites"]').click();
    await expect(page.locator('#grid .card')).toHaveCount(2);

    await page.locator('[data-gallery-command="filters"]').click();
    const typePanel = page.locator('[data-gallery-file-type-panel]');
    await typePanel.locator('[data-gallery-quick-type="svg"]').click();

    await expect(page.locator('#grid .card')).toHaveCount(1);
    await expect(page.locator('#grid')).toContainText('preview-alpha.png');
    await expect(page.locator('#grid')).not.toContainText('plot-alpha.svg');
  });
});

test('file types: compact popover stays inside narrow gallery viewports', async ({ page }) => {
  await withGallery(async ({ url }) => {
    for (const viewport of [{ width: 375, height: 667 }, { width: 520, height: 795 }]) {
      await page.setViewportSize(viewport);
      await page.goto(url);
      await page.locator('[data-gallery-command="filters"]').click();

      const geometry = await page.locator('[data-slot="popover-content"]').evaluate(element => {
        const panel = element.getBoundingClientRect();
        const footer = element.querySelector('.gallery-filter-panel-foot').getBoundingClientRect();
        return {
          panel: { left: panel.left, right: panel.right, top: panel.top, bottom: panel.bottom, width: panel.width },
          footerBottom: footer.bottom,
          viewport: { width: innerWidth, height: innerHeight },
          documentWidth: document.documentElement.scrollWidth,
        };
      });

      expect(geometry.panel.left).toBeGreaterThanOrEqual(0);
      expect(geometry.panel.right).toBeLessThanOrEqual(geometry.viewport.width);
      expect(geometry.panel.bottom).toBeLessThanOrEqual(geometry.viewport.height);
      expect(geometry.panel.width).toBeLessThanOrEqual(360);
      expect(geometry.panel.bottom - geometry.panel.top).toBeLessThanOrEqual(360);
      expect(geometry.footerBottom).toBeLessThanOrEqual(geometry.viewport.height);
      expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport.width);
      await expect(page.getByRole('button', { name: 'Reset filters' })).toBeVisible();
    }
  });
});

test('command bar: filter and display controls form one compact left-aligned cluster', async ({ page }) => {
  await withGallery(async ({ url }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(url);

    const filterGroup = page.getByRole('group', { name: 'Search and filter gallery' });
    const displayGroup = page.getByRole('group', { name: 'Sort and display gallery' });
    const [filterBox, displayBox] = await Promise.all([filterGroup.boundingBox(), displayGroup.boundingBox()]);

    expect(filterBox).not.toBeNull();
    expect(displayBox).not.toBeNull();
    expect(displayBox.x - (filterBox.x + filterBox.width)).toBeGreaterThanOrEqual(0);
    expect(displayBox.x - (filterBox.x + filterBox.width)).toBeLessThanOrEqual(10);

    const sort = page.getByRole('combobox', { name: /Sort project files:/ });
    await expect(sort).toBeVisible();
    await expect(sort.locator('[data-icon="select-chevron"]')).toBeHidden();
  });
});

test('viewer: one click opens a figure without the inspector', async ({ page }) => {
  await withGallery(async ({ url }) => {
    await page.goto(url);
    await page.locator('[data-act="lb"][data-rel="plot-alpha.svg"]').click();
    await expect(page.locator('#lb')).toHaveClass(/show/);
    await expect(page.locator('body')).not.toHaveClass(/has-insp/);
    await expect(page.locator('#lbPdf')).toHaveAttribute('src', /svg_viewer\.html.*plot-alpha\.svg/);
  });
});

test('workflow: status set from the card menu survives a reload (server-backed)', async ({ page }) => {
  await withGallery(async ({ url }) => {
    await page.goto(url);
    await page.locator('.card[data-card="plot-alpha.svg"]').hover();
    await page.locator('[data-act="more"][data-rel="plot-alpha.svg"]').click();
    await page.locator('[data-wfset="candidate"]').click();
    await expect(page.locator('.card[data-card="plot-alpha.svg"] .tag.wf')).toContainText('candidate');
    // le POST /state est débouncé (400 ms) — attendre qu'il parte
    await page.waitForTimeout(700);

    await page.reload();
    await expect(page.locator('.card[data-card="plot-alpha.svg"] .tag.wf')).toContainText('candidate');
    await page.locator('.card[data-card="plot-alpha.svg"]').hover();
    await page.locator('[data-act="more"][data-rel="plot-alpha.svg"]').click();
    await expect(page.locator('[data-wfset="candidate"]').locator('..')).toHaveClass(/on/);
  });
});

test('add-to-chat from an embedded gallery card is idempotent on rapid double activation', async ({ page }) => {
  await withGallery(async ({ root, port }) => {
    // la galerie doit se croire embarquée (window.self !== window.top) : une
    // page hôte servie par le MÊME serveur l'encadre et capture les postMessage
    writeFileSync(path.join(root, 'host.html'), `<!doctype html><body style="margin:0">
<script>window.__msgs=[];window.addEventListener('message',e=>{if(e.data&&e.data.type){window.__msgs.push(e.data);if(e.data.type==='atelier-add-to-chat')e.source.postMessage({type:'atelier-add-to-chat-ack',nonce:e.data.nonce,requestId:e.data.requestId,ok:true},e.origin)}});</script>
<iframe id="g" src="/figures_index.html#atelier_nonce=test-nonce" style="width:1200px;height:800px;border:0"></iframe></body>`);
    await page.goto(`http://127.0.0.1:${port}/host.html`);
    const g = page.frameLocator('#g');
    await g.locator('#grid .card').first().waitFor();

    const card = g.locator('.card[data-card="preview-alpha.png"]');
    await card.hover();
    const chat = card.locator('[data-act="chat"]');
    await expect(chat).toBeVisible();
    await chat.click();
    await chat.click(); // double activation rapide — bloquée par data-add-state
    await expect(chat).toContainText('✓');

    await expect.poll(() => page.evaluate(() => window.__msgs.filter(m => m.type === 'atelier-add-to-chat').length)).toBe(1);
    const msg = await page.evaluate(() => window.__msgs.find(m => m.type === 'atelier-add-to-chat'));
    expect(msg.text).toContain('preview-alpha.png');
    expect(msg.text).toContain('lis-le (outil Read)');
    expect(realpathSync(msg.path)).toBe(realpathSync(path.join(root, 'preview-alpha.png')));
    expect(msg.name).toBe('preview-alpha.png');
    expect(msg.previewUrl).toBe(`http://127.0.0.1:${port}/preview-alpha.png`);
    expect(msg.requestId).toBeTruthy();
  });
});

test('add-to-chat retries when the host misses the first postMessage during startup', async ({ page }) => {
  await withGallery(async ({ root, port }) => {
    writeFileSync(path.join(root, 'host.html'), `<!doctype html><body style="margin:0">
<script>window.__msgs=[];window.addEventListener('message',e=>{if(e.data&&e.data.type==='atelier-add-to-chat'){window.__msgs.push(e.data);if(window.__msgs.length>1)e.source.postMessage({type:'atelier-add-to-chat-ack',nonce:e.data.nonce,requestId:e.data.requestId,ok:true},e.origin)}});</script>
<iframe id="g" src="/figures_index.html#atelier_nonce=test-nonce" style="width:1200px;height:800px;border:0"></iframe></body>`);
    await page.goto(`http://127.0.0.1:${port}/host.html`);
    const g = page.frameLocator('#g');
    const card = g.locator('.card[data-card="preview-alpha.png"]');
    await card.waitFor();
    await card.hover();
    const chat = card.locator('[data-act="chat"]');
    await chat.click();

    await expect.poll(() => page.evaluate(() => window.__msgs.length)).toBe(2);
    await expect(chat).toContainText('✓');
    const ids = await page.evaluate(() => window.__msgs.map(m => m.requestId));
    expect(new Set(ids).size).toBe(1);
  });
});

test('keyboard: arrows move the selection, Enter opens, Escape closes in cascade', async ({ page }) => {
  await withGallery(async ({ url }) => {
    await page.goto(url);
    await page.locator('#grid').focus();
    await page.keyboard.press('ArrowRight');
    const first = page.locator('#grid .card[aria-selected="true"]');
    await expect(first).toHaveCount(1);
    const firstRel = await first.getAttribute('data-card');

    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#grid .card[aria-selected="true"]')).not.toHaveAttribute('data-card', firstRel);
    await expect(page.locator('body')).not.toHaveClass(/has-insp/);

    await page.keyboard.press('Enter');
    await expect(page.locator('#lb')).toHaveClass(/show/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#lb')).not.toHaveClass(/show/);
    await expect(page.locator('body')).not.toHaveClass(/has-insp/);
  });
});

test('shadcn command bar: popover returns focus and view menu controls density', async ({ page }) => {
  await withGallery(async ({ url }) => {
    let rescanRequests = 0;
    await page.route('**/rescan', async route => {
      rescanRequests += 1;
      await new Promise(resolve => setTimeout(resolve, 250));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false }) });
    });
    await page.goto(url);
    const filters = page.locator('[data-gallery-command="filters"]');
    await filters.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'File types' })).toBeVisible();
    await page.locator('#grid').click({ position: { x: 2, y: 2 } });
    await expect(page.getByRole('dialog', { name: 'File types' })).toBeHidden();

    // La fermeture extérieure ne casse pas le retour de focus au trigger.
    await filters.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'File types' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(filters).toBeFocused();

    const tools = page.getByRole('button', { name: 'Gallery tools' });
    await tools.hover();
    await expect(page.getByRole('tooltip', { name: 'Gallery tools' })).toBeVisible();
    await tools.click();
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Gallery settings…' })).toBeVisible();
    await page.keyboard.press('Escape');

    const rescan = page.getByRole('button', { name: 'Rescan project' });
    await expect(rescan).toHaveAttribute('data-gallery-command', 'rescan');
    await rescan.click();
    await expect.poll(() => rescanRequests).toBe(1);

    const favorites = page.locator('[data-gallery-command="favorites"]');
    await expect(favorites).toHaveAttribute('data-gallery-command', 'favorites');
    await expect(favorites).toHaveAttribute('aria-pressed', 'false');
    await favorites.click();
    await expect(favorites).toHaveAttribute('aria-pressed', 'true');

    const sort = page.getByRole('combobox', { name: 'Sort project files' });
    await sort.click();
    const openSelect = page.locator('[data-slot="select-content"][data-open]');
    await expect(openSelect).toBeVisible();
    await page.locator('#grid').click({ position: { x: 2, y: 2 } });
    await expect(openSelect).toHaveCount(0);

    await page.getByRole('button', { name: 'View options' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Large' }).click();
    await expect(page.locator('#densitySeg [data-d="l"]')).toHaveClass(/on/);
  });
});

test('705x795: command bar stays on one row and viewer opens without a drawer', async ({ page }) => {
  await withGallery(async ({ url }) => {
    await page.setViewportSize({ width: 705, height: 795 });
    await page.goto(url);
    const toolbarBoxes = await page.locator('.gallery-command-bar > *').evaluateAll((elements) =>
      elements
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => rect.width > 4 && rect.height > 4)
        .map((rect) => ({ top: Math.round(rect.top), right: Math.round(rect.right) })),
    );
    expect(Math.max(...toolbarBoxes.map((box) => box.top)) - Math.min(...toolbarBoxes.map((box) => box.top))).toBeLessThanOrEqual(2);
    expect(Math.max(...toolbarBoxes.map((box) => box.right))).toBeLessThanOrEqual(705);
    await page.locator('#grid .card [data-act="lb"]').first().click();
    await expect(page.locator('#lb')).toHaveClass(/show/);
    await expect(page.locator('body')).not.toHaveClass(/has-insp/);
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(706);
    await page.locator('#lbClose').click();
    await expect(page.locator('#lb')).not.toHaveClass(/show/);
  });
});

test('missing file: viewer opens and the grid stays intact', async ({ page }) => {
  await withGallery(async ({ url, root }) => {
    await page.goto(url);
    // La coquille charge /data après la navigation. Attendre la carte prouve
    // que la suppression arrive bien après le scan initial, comme le scénario
    // que ce test cherche à reproduire.
    const missingPreview = page.locator('[data-act="lb"][data-rel="preview-alpha.png"]');
    await expect(missingPreview).toBeVisible();
    // le fichier disparaît du disque APRÈS le scan (cas réel : suppression externe)
    rmSync(path.join(root, 'preview-alpha.png'));
    await missingPreview.click();
    await expect(page.locator('#lb')).toHaveClass(/show/);
    await expect(page.locator('#grid .card')).toHaveCount(3);
  });
});
