// Campagne de bout en bout du cahier Jupyter : VRAI serveur Rust
// (atelier-studio-server), VRAI onglet NotebookTab servi par Vite, VRAI noyau
// ipykernel, piloté par Playwright (Chromium). Mac et Linux.
//
//   node tests/notebook-e2e/campaign.mts
//
// Prérequis : `cargo build --bin atelier-studio-server` (ou ATELIER_SERVER_BIN),
// python3 (crée un .venv avec ipykernel, ou NB_E2E_VENV=<venv existant>).
// Voir README.md.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "@playwright/test";
import { createServer } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const TOKEN = "nb-e2e";

function serverBinary(): string {
  const exe = process.platform === "win32" ? ".exe" : "";
  const candidates = [
    process.env.ATELIER_SERVER_BIN,
    path.join(repo, "rust/target/debug/atelier-studio-server" + exe),
    path.join(repo, "rust/target/release/atelier-studio-server" + exe),
  ].filter(Boolean) as string[];
  const found = candidates.find((c) => fs.existsSync(c));
  if (!found) {
    console.error("atelier-studio-server introuvable : cargo build --manifest-path rust/Cargo.toml --bin atelier-studio-server");
    process.exit(2);
  }
  return found;
}

let python = "python3";
function pythonHas(mod: string): boolean {
  return spawnSync(python, ["-c", `import ${mod}`], { stdio: "ignore" }).status === 0;
}

// Le noyau : celui du .venv du projet (Atelier le choisit d'office). On le
// prend dans NB_E2E_VENV s'il est donné, sinon on en crée un avec ipykernel.
function prepareVenv(project: string) {
  const venv = path.join(project, ".venv");
  const bin = (v: string) => path.join(v, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  if (process.env.NB_E2E_VENV) {
    fs.symlinkSync(path.resolve(process.env.NB_E2E_VENV), venv, "dir");
  } else {
    console.log("création du .venv du projet (ipykernel, matplotlib)…");
    spawnSync("python3", ["-m", "venv", venv], { stdio: "inherit" });
    spawnSync(bin(venv), ["-m", "pip", "install", "-q", "ipykernel", "matplotlib"], { stdio: "inherit" });
  }
  python = bin(venv);
}

const code = (source: string) => ({ cell_type: "code", metadata: {}, execution_count: null, outputs: [], source });
const md = (source: string) => ({ cell_type: "markdown", metadata: {}, source });

// Indices 1-based, comme data-cell-index.
const C = { set: 2, print: 3, long: 4, error: 5, figure: 6, input: 7, loop: 8, after: 9, display: 10, last: 0 };
function notebook() {
  const cells = [
    md("# Campagne de bout en bout"),
    code("x = 21\ny = x * 2"),
    code("print('y =', y)"),
    code("import time\nfor i in range(3):\n    print('pas', i, flush=True)\n    time.sleep(0.8)"),
    code("def f(a):\n    return a / 0\n\nf(3)"),
    code("%matplotlib inline\nimport matplotlib.pyplot as plt\nplt.plot([0, 1], [0.6, 0.5])\nplt.show()"),
    code("nom = input('Ton nom ? ')\nprint('Bonjour', nom)"),
    code("import time\nwhile True:\n    time.sleep(0.2)"),
    code("print('après interruption')"),
    code("from IPython.display import HTML\ndisplay(HTML('<b id=\"riche\">gras</b>'))"),
  ];
  for (let i = 0; i < 8; i++) {
    cells.push(md(`## Remplissage ${i}\n` + "Texte de remplissage pour allonger la page. ".repeat(12)));
    cells.push(code(`v${i} = ${i} * 10\nv${i}`));
  }
  cells.push(code("print('dernière cellule')"));
  C.last = cells.length;
  return { nbformat: 4, nbformat_minor: 5, metadata: { kernelspec: { name: "python3", display_name: "Python 3", language: "python" } }, cells };
}

const results: { name: string; ok: boolean | null; detail: string }[] = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "ok  " : "ÉCHEC"} ${name}${detail ? ` — ${detail}` : ""}`);
}
function skip(name: string, why: string) {
  results.push({ name, ok: null, detail: why });
  console.log(`--   ${name} — ignoré : ${why}`);
}

const cell = (p: Page, n: number) => p.locator(`article.nb-cell[data-cell-index="${n}"]`);
const run = (p: Page, n: number) => cell(p, n).locator('button[aria-label="Exécuter"]').click();
const outputs = (p: Page, n: number) => cell(p, n).locator(".nb-outputs").innerText().catch(() => "");
const count = (p: Page, n: number) => cell(p, n).locator(".nb-cell-num").innerText().catch(() => "");
async function until(fn: () => Promise<boolean>, ms: number): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn().catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}
const top = (p: Page, n: number) =>
  p.evaluate((n) => Math.round(document.querySelector(`article.nb-cell[data-cell-index="${n}"]`)!.getBoundingClientRect().top), n);
const place = (p: Page, n: number, y: number) =>
  p.evaluate(([n, y]) => {
    const el = document.querySelector(`article.nb-cell[data-cell-index="${n}"]`)!;
    document.querySelector(".nb-scroll")!.scrollTop += el.getBoundingClientRect().top - y;
  }, [n, y]);

// .venv sans ipykernel : Atelier prend alors son noyau de secours
// (atelier_noyau.py). On relie les paquets du .venv principal, sauf
// ipykernel et IPython, pour reproduire un environnement de calcul simple.
const BLOQUES = /^(ipykernel|ipython|comm|debugpy|jupyter|matplotlib_inline)/i;
function prepareVenvSansIpykernel(project: string) {
  const venv = path.join(project, ".venv");
  spawnSync(python, ["-m", "venv", "--without-pip", venv], { stdio: "inherit" });
  const lib = (py: string) =>
    spawnSync(py, ["-c", "import sysconfig; print(sysconfig.get_paths()['purelib'])"], { encoding: "utf8" }).stdout.trim();
  const source = lib(python);
  const dest = lib(path.join(venv, "bin/python"));
  for (const name of fs.readdirSync(source)) {
    if (BLOQUES.test(name) || fs.existsSync(path.join(dest, name))) continue;
    fs.symlinkSync(path.join(source, name), path.join(dest, name));
  }
}

const S = { nu: 1, html: 2, montre: 3, ouverte: 4, repr: 5, muet: 6, coquille: 7 };
function cahierSecours() {
  return {
    nbformat: 4, nbformat_minor: 5,
    metadata: { kernelspec: { name: "python3", display_name: "Python 3", language: "python" } },
    cells: [
      code("display('bonjour display')"),
      code("from IPython.display import HTML, Markdown\ndisplay(HTML('<b id=\"riche\">gras</b>'))\ndisplay(Markdown('*penché*'))"),
      code("%matplotlib inline\nimport matplotlib.pyplot as plt\nplt.plot([0, 1], [0.6, 0.5])\nplt.show()\nprint('après show')"),
      code("fig, ax = plt.subplots()\nax.plot([1, 2, 3])\nprint('figure ouverte')"),
      code("class Tableau:\n    def _repr_html_(self):\n        return '<table id=\"tab\"><tr><td>1</td></tr></table>'\nTableau()"),
      code("1 + 1;"),
      code("!echo coquille"),
    ],
  };
}

// Sélectionne `needle` dans le code de la cellule n et signale la fin du geste.
const selectInCode = (p: Page, n: number, needle: string) =>
  p.evaluate(([n, needle]) => {
    const pre = document.querySelector(`article.nb-cell[data-cell-index="${n}"] pre.nb-well`)!;
    const text = pre.textContent ?? "";
    const from = text.indexOf(needle as string);
    const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let seen = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const len = (node as Text).data.length;
      if (from >= seen && from <= seen + len) range.setStart(node, from - seen);
      if (from + (needle as string).length <= seen + len) { range.setEnd(node, from + (needle as string).length - seen); break; }
      seen += len;
    }
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    const r = range.getBoundingClientRect();
    document.dispatchEvent(new MouseEvent("mouseup", { clientX: r.right, clientY: r.bottom, bubbles: true }));
  }, [n, needle] as const);
const highlightSizes = (p: Page) =>
  p.evaluate(() => {
    const reg = (CSS as unknown as { highlights?: Map<string, Set<Range>> }).highlights;
    const size = (k: string) => reg?.get(k)?.size ?? 0;
    return { amber: size("nb-hl-amber"), green: size("nb-hl-green"), note: size("nb-note") };
  });

// Surlignage et note dans une cellule : la même bulle que les fichiers
// Python, gardée dans le store partagé et retrouvée à la réouverture.
async function campagneAnnotations(browser: import("@playwright/test").Browser, url: string, project: string, errors: string[]) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForSelector(".nb-cell[data-cell-index]", { timeout: 30000 });
  try {
    await place(page, C.set, 200);
    await selectInCode(page, C.set, "x = 21");
    const bar = page.locator(".sel-toolbar.nb-selection");
    await bar.waitFor({ timeout: 3000 }).catch(() => {});
    const has = async (label: string) => (await bar.locator(`button[aria-label="${label}"]`).count()) > 0;
    check("bulle du cahier : surligneur, couleurs et note", (await has("Surligner")) && (await has("Choisir la couleur du surlignage")) && (await has("Annoter")) && (await has("Ajouter au chat")));
    await bar.locator('button[aria-label="Choisir la couleur du surlignage"]').click();
    await bar.locator('button[aria-label="Surligner en vert"]').click();
    check("surligner : passage peint", await until(async () => (await highlightSizes(page)).green === 1, 5000), JSON.stringify(await highlightSizes(page)));

    await selectInCode(page, C.set, "x * 2");
    await page.locator('.sel-toolbar.nb-selection button[aria-label="Annoter"]').click();
    const note = page.locator(".nb-note-editor textarea.atelier-note-input");
    await note.waitFor({ timeout: 3000 });
    await note.fill("pourquoi doubler ?");
    await note.press("Enter");
    const store = path.join(project, ".fig_thumbs", "pdf_annots.json");
    const saved = await until(async () => fs.readFileSync(store, "utf8").includes("pourquoi doubler ?"), 5000);
    check("note : enregistrée dans le store partagé", saved && !fs.readFileSync(path.join(project, "essai.ipynb"), "utf8").includes("pourquoi"));
    const key = Object.keys(JSON.parse(fs.readFileSync(store, "utf8")));
    check("note : clé du cahier", key.includes("nb-comments:essai.ipynb"), key.join(", "));

    // Réouverture : les marques reviennent ; un clic sur la note la rouvre.
    await page.reload();
    await page.waitForSelector(".nb-cell[data-cell-index]", { timeout: 30000 });
    await place(page, C.set, 200);
    const back = await until(async () => {
      const h = await highlightSizes(page);
      return h.green === 1 && h.note === 1;
    }, 8000);
    check("réouverture : surlignage et note retrouvés", back, JSON.stringify(await highlightSizes(page)));
    const at = await page.evaluate(() => {
      const reg = (CSS as unknown as { highlights: Map<string, Set<Range>> }).highlights;
      const r = [...reg.get("nb-note")!][0].getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(at.x, at.y);
    const reopened = await until(async () => (await note.inputValue().catch(() => "")) === "pourquoi doubler ?", 3000);
    const editing = (await cell(page, C.set).locator("textarea.nb-code-input").count()) > 0;
    check("clic sur la note : fiche rouverte, pas d'édition", reopened && !editing, `édition ${editing}`);
    await page.locator('.nb-note-editor button[aria-label="Supprimer l’annotation"]').first().click();
    check("note supprimée", await until(async () => (await highlightSizes(page)).note === 0 && !fs.readFileSync(store, "utf8").includes("pourquoi"), 5000));
  } finally {
    await page.close();
  }
}

async function campagneSecours(browser: import("@playwright/test").Browser, vitePort: number, port: number, work: string, errors: string[]) {
  const project = path.join(work, "projet-secours");
  fs.mkdirSync(project, { recursive: true });
  const nbPath = path.join(project, "secours.ipynb");
  fs.writeFileSync(nbPath, JSON.stringify(cahierSecours(), null, 1));
  prepareVenvSansIpykernel(project);
  const sp = spawnSync(path.join(project, ".venv/bin/python"), ["-c", "import IPython"], { stdio: "ignore" });
  check("secours : .venv sans IPython", sp.status !== 0);

  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.on("pageerror", (e) => errors.push(e.message));
  const q = new URLSearchParams({ port: String(port), token: TOKEN, path: nbPath, root: project, theme: "dark", noanchor: "1" });
  await page.goto(`http://localhost:${vitePort}/tests/notebook-e2e/harness.html?${q}`);
  await page.waitForSelector(".nb-cell[data-cell-index]", { timeout: 30000 });
  try {
    await run(page, S.nu);
    check("secours : display() sans import", await until(async () => (await outputs(page, S.nu)).includes("'bonjour display'"), 90000), (await outputs(page, S.nu)).slice(0, 120));
    await run(page, S.html);
    check("secours : display(HTML) rendu", await until(async () => (await cell(page, S.html).locator("b#riche").count()) > 0, 15000), (await outputs(page, S.html)).slice(0, 120));
    check("secours : display(Markdown) rendu", (await cell(page, S.html).locator(".nb-outputs em").count()) > 0);
    await run(page, S.montre);
    const montre = await until(async () => (await outputs(page, S.montre)).includes("après show"), 60000);
    const imgs = await cell(page, S.montre).locator("img").count();
    const ordre = await cell(page, S.montre).evaluate((el) => {
      const img = el.querySelector(".nb-outputs img");
      const txt = [...el.querySelectorAll(".nb-outputs *")].find((n) => n.children.length === 0 && n.textContent?.includes("après show"));
      return !!img && !!txt && !!(img.compareDocumentPosition(txt) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    check("secours : plt.show() en ligne, avant le texte qui suit", montre && imgs === 1 && ordre, `${imgs} image(s)`);
    await run(page, S.ouverte);
    await until(async () => (await outputs(page, S.ouverte)).includes("figure ouverte"), 15000);
    check("secours : figure ouverte affichée en fin de cellule", await until(async () => (await cell(page, S.ouverte).locator("img").count()) === 1, 15000));
    await run(page, S.repr);
    check("secours : _repr_html_ rendu", await until(async () => (await cell(page, S.repr).locator("table#tab").count()) > 0, 15000), (await outputs(page, S.repr)).slice(0, 120));
    await run(page, S.muet);
    await until(async () => (await count(page, S.muet)).trim() !== "", 15000);
    check("secours : « ; » masque le résultat", !(await outputs(page, S.muet)).includes("2"), (await outputs(page, S.muet)).slice(0, 60));
    await run(page, S.coquille);
    check("secours : !commande", await until(async () => (await outputs(page, S.coquille)).includes("coquille"), 15000), (await outputs(page, S.coquille)).slice(0, 120));
    await page.screenshot({ path: path.join(work, "secours.png"), fullPage: true });
  } finally {
    await page.close();
  }
}

async function main() {
  const bin = serverBinary();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "nb-e2e-"));
  const project = path.join(work, "projet");
  const appDir = path.join(work, "app");
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(appDir, { recursive: true });
  const nbPath = path.join(project, "essai.ipynb");
  fs.writeFileSync(nbPath, JSON.stringify(notebook(), null, 1));
  prepareVenv(project);
  if (!pythonHas("ipykernel")) {
    console.error(`${python} sans ipykernel : NB_E2E_VENV=<venv avec ipykernel>, ou réseau pour pip`);
    process.exit(2);
  }

  let server: ChildProcess | undefined;
  const vite = await createServer({ configFile: path.join(here, "vite.config.mts") });
  // NB_E2E_CHROMIUM : un Chromium déjà installé (version de Playwright différente).
  const browser = await chromium.launch(process.env.NB_E2E_CHROMIUM ? { executablePath: process.env.NB_E2E_CHROMIUM } : {});
  try {
    server = spawn(bin, [], {
      env: { ...process.env, ATELIER_APP_DIR: appDir, ATELIER_SKIP_SINGLE_INSTANCE: "1", ATELIER_TOKEN: TOKEN },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stderr!.on("data", (d) => fs.appendFileSync(path.join(work, "server.err"), d));
    const port = await new Promise<number>((resolve, reject) => {
      let buf = "";
      const timer = setTimeout(() => reject(new Error("le serveur n'a pas annoncé son port")), 30000);
      server!.stdout!.on("data", (d) => {
        buf += String(d);
        const m = buf.match(/"port":(\d+)/);
        if (m) { clearTimeout(timer); resolve(Number(m[1])); }
      });
      server!.on("exit", (c) => reject(new Error(`serveur arrêté (${c})`)));
    });
    await vite.listen();
    const vitePort = vite.config.server.port;

    // WKWebView (Atelier sur Mac) n'a pas d'ancrage de défilement : noanchor=1.
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const q = new URLSearchParams({ port: String(port), token: TOKEN, path: nbPath, root: project, theme: "dark", noanchor: "1" });
    await page.goto(`http://localhost:${vitePort}/tests/notebook-e2e/harness.html?${q}`);
    await page.waitForSelector(".nb-cell[data-cell-index]", { timeout: 30000 });

    // 1. Exécution simple (démarre le noyau) puis enchaînée.
    await run(page, C.set);
    check("exécution simple : compteur [1]", await until(async () => (await count(page, C.set)).trim() === "1", 90000), await count(page, C.set));
    await run(page, C.print);
    check("exécution enchaînée : y = 42", await until(async () => (await outputs(page, C.print)).includes("y = 42"), 15000));
    const doneTag = await cell(page, C.print).locator('.nb-run[data-state="done"]').innerText().catch(() => "");
    check("état visible : ✓ durée · heure", /\d s\s*· \d{2}:\d{2}/.test(doneTag), doneTag.replace(/\s+/g, " "));

    // 2. Cellule longue : la sortie arrive au fil de l'eau.
    await run(page, C.long);
    const partial = await until(async () => { const o = await outputs(page, C.long); return o.includes("pas 0") && !o.includes("pas 2"); }, 5000);
    check("cellule longue : sortie progressive", partial);
    check("cellule longue : terminée", await until(async () => (await outputs(page, C.long)).includes("pas 2"), 10000));

    // 3. Erreur Python lisible.
    await run(page, C.error);
    check("erreur : ZeroDivisionError affichée", await until(async () => (await outputs(page, C.error)).includes("ZeroDivisionError"), 10000));
    check("erreur : ligne en cause indiquée", (await outputs(page, C.error)).includes("Ligne 2"));
    await cell(page, C.error).getByRole("button", { name: "Corriger avec le chat" }).click();
    const fix = await page.evaluate(() => ((window as unknown as { __chat: string[] }).__chat ?? []).at(-1) ?? "");
    check("Corriger avec le chat : code et trace envoyés", /^essai\.ipynb \[\d+\] \(L1-4\)/.test(fix) && fix.includes("ZeroDivisionError") && fix.includes("Cell In["), fix.slice(0, 50));

    // 4. Figure matplotlib.
    if (pythonHas("matplotlib")) {
      await run(page, C.figure);
      const fig = await until(async () => (await cell(page, C.figure).locator("img").count()) > 0, 60000);
      check("figure matplotlib rendue", fig, fig ? "" : (await outputs(page, C.figure)).slice(0, 120));
    } else skip("figure matplotlib rendue", "matplotlib absent");
    await run(page, C.display);
    check("display(HTML) rendu", await until(async () => (await cell(page, C.display).locator("b#riche").count()) > 0, 15000), (await outputs(page, C.display)).slice(0, 120));

    // 5. La vue reste sur la cellule relancée (Mac : pas d'ancrage natif).
    await place(page, C.long, 250);
    await page.waitForTimeout(300);
    const before = await top(page, C.long);
    await run(page, C.long);
    let drift = 0;
    for (let i = 0; i < 20; i++) { await page.waitForTimeout(150); drift = Math.max(drift, Math.abs((await top(page, C.long)) - before)); }
    check("relance : la vue reste sur la cellule", drift <= 4, `écart max ${drift} px`);
    await until(async () => (await outputs(page, C.long)).includes("pas 2"), 10000);

    // 6. Sélection dans le code → chat (bulle et capsule communes).
    await place(page, C.long, 200);
    const well = cell(page, C.long).locator("pre.nb-well");
    const box = (await well.boundingBox())!;
    // Départ dans le texte : pile au milieu du premier caractère, Chromium
    // ne commence aucune sélection (bord entre deux positions de curseur).
    await page.mouse.move(box.x + 30, box.y + 32);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + 70, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const bubble = page.locator('.sel-toolbar.atelier-selection button[aria-label="Ajouter au chat"]');
    if (await bubble.count()) {
      await bubble.click();
      const sent = await page.evaluate(() => ((window as unknown as { __chat: string[] }).__chat ?? []).at(-1) ?? "");
      check("sélection → chat : capsule nommée", /^essai\.ipynb \[\d+\] \(L\d/.test(sent), sent.slice(0, 60));
    } else {
      const sel = await page.evaluate(() => window.getSelection()?.toString() ?? "");
      check("sélection → chat : bulle affichée", false, `sélection « ${sel.slice(0, 30)} »`);
    }

    // 6 bis. Un clic dans le code l'édite, la coloration reste.
    await place(page, C.set, 200);
    const setWell = cell(page, C.set).locator("pre.nb-well");
    const sb = (await setWell.boundingBox())!;
    await page.mouse.click(sb.x + sb.width - 20, sb.y + sb.height - 12);
    const editing = await until(async () => (await cell(page, C.set).locator("textarea.nb-code-input").count()) > 0, 3000);
    const colored = await cell(page, C.set).locator(".nb-code-edit .hljs span").count();
    check("clic dans le code : édition, coloration gardée", editing && colored > 0, `${colored} jetons colorés`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);

    // 7. input().
    await place(page, C.input, 200);
    await run(page, C.input);
    const field = cell(page, C.input).locator("input");
    if (await until(async () => (await field.count()) > 0, 10000)) {
      await field.fill("Thierry");
      await field.press("Enter");
      check("input() : réponse transmise", await until(async () => (await outputs(page, C.input)).includes("Bonjour Thierry"), 10000));
    } else check("input() : champ affiché", false);

    // 8. Interruption, puis le noyau répond encore.
    await run(page, C.loop);
    await page.waitForTimeout(1200);
    await page.locator('button[aria-label="Interrompre"]').click();
    check("interruption : KeyboardInterrupt", await until(async () => (await outputs(page, C.loop)).includes("KeyboardInterrupt"), 10000));
    await run(page, C.after);
    check("après interruption : le noyau répond", await until(async () => (await outputs(page, C.after)).includes("après interruption"), 10000));

    // 9. Redémarrage : l'état Python est perdu.
    await page.locator('button[aria-label="Redémarrer le noyau"]').click();
    await page.waitForTimeout(4000);
    await run(page, C.print);
    check("redémarrage : variables effacées (NameError)", await until(async () => (await outputs(page, C.print)).includes("NameError"), 30000));
    check("redémarrage : anciens passages marqués", (await cell(page, C.set).locator('.nb-run[data-state="stale"]').count()) === 1);

    // 10. Tout exécuter s'arrête à l'erreur.
    const lastBefore = await count(page, C.last);
    await page.locator('button[aria-label="Tout exécuter"]').click();
    await until(async () => (await outputs(page, C.error)).includes("ZeroDivisionError") && (await count(page, C.error)).trim() !== "", 30000);
    await page.waitForTimeout(3000);
    check("Tout exécuter : s'arrête à la cellule en erreur", (await count(page, C.last)) === lastBefore && (await outputs(page, C.print)).includes("y = 42"));

    await page.screenshot({ path: path.join(work, "fin.png") });

    // 10 bis. Surlignage et note dans une cellule (store partagé).
    await campagneAnnotations(browser, `http://localhost:${vitePort}/tests/notebook-e2e/harness.html?${q}`, project, errors);

    // 11. Noyau de secours (.venv sans ipykernel ni IPython, comme chez
    // Thierry) : display, rendus riches, figures en ligne, !commande.
    if (pythonHas("matplotlib")) await campagneSecours(browser, vitePort, port, work, errors);
    else skip("noyau de secours", "matplotlib absent");

    check("aucune erreur JavaScript", errors.length === 0, errors.slice(0, 2).join(" | "));
    console.log(`\ntraces : ${work}`);
  } finally {
    await browser.close();
    await vite.close();
    server?.kill();
  }
  const failed = results.filter((r) => r.ok === false).length;
  console.log(failed ? `\nnotebook e2e : ${failed} échec(s)` : `\nnotebook e2e : ok (${results.filter((r) => r.ok).length} vérifications)`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
