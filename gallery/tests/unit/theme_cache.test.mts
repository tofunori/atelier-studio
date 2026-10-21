import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

// Un éditeur ouvert en thème clair ne doit plus peindre d'abord la palette
// sombre de secours : le pont applique le dernier thème reçu dès son chargement.
const bridge = await readFile(new URL("../../assets/atelier_theme.js", import.meta.url), "utf8");

function load(seed?: string) {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url: "http://127.0.0.1:18790/latex_studio.html", runScripts: "outside-only",
  });
  if (seed) dom.window.localStorage.setItem("atelier-theme-cache", seed);
  dom.window.eval(bridge);
  return dom.window;
}

test("le thème reçu de l'hôte est gardé pour le document suivant", () => {
  const win = load();
  win.dispatchEvent(new win.MessageEvent("message", {
    source: win, data: { type: "atelier-theme", version: 3, colorScheme: "light",
      vars: { "--surface-app": "#f1f4f7", "--text-primary": "#1a1d22" } },
  }));
  const cached = JSON.parse(win.localStorage.getItem("atelier-theme-cache") ?? "null");
  assert.equal(cached.colorScheme, "light");
  assert.equal(cached.vars["--surface-app"], "#f1f4f7");
});

test("au chargement, le thème en cache s'applique avant toute réponse de l'hôte", () => {
  const win = load(JSON.stringify({ type: "atelier-theme", version: 3, colorScheme: "light",
    vars: { "--surface-app": "#f1f4f7", "--text-primary": "#1a1d22" } }));
  const root = win.document.documentElement;
  assert.equal(root.style.getPropertyValue("--surface-app"), "#f1f4f7");
  assert.equal(root.style.getPropertyValue("--bg"), "#f1f4f7", "pont vers la palette historique");
  assert.equal(root.style.colorScheme, "light");
});

test("un cache illisible est ignoré sans casser le pont", () => {
  const win = load("{pas du json");
  assert.equal(win.document.documentElement.dataset.shadcnContract, "gallery-v1");
});

// ---- pages qui n'éditent pas : galerie, SVG, PDF, Markdown (GAL-03, PDF-24) --
// Le cache doit gagner sur les palettes historiques (THEMES.Default, figTheme,
// legacyTheme) : sinon un fond anthracite flashe à chaque ouverture en clair.
const LIGHT = JSON.stringify({ type: "atelier-theme", version: 3, colorScheme: "light",
  vars: { "--bg": "#faf9f5", "--bg-card": "#ffffff", "--fg": "#1f1e1d", "--accent": "#c96442",
    "--surface-app": "#faf9f5", "--text-primary": "#1f1e1d" } });
const assetText = (name: string) => readFile(new URL(`../../assets/${name}`, import.meta.url), "utf8");
const inlineScript = (html: string, source: string) => {
  const m = html.match(new RegExp(`<script[^>]*data-atelier-source="gallery/src/browser/pages/${source}"[^>]*>([\\s\\S]*?)</script>`));
  assert.ok(m, `créneau ${source} introuvable`);
  return m[1];
};
function page(url: string, seed?: string) {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { url, runScripts: "outside-only" });
  if (seed) dom.window.localStorage.setItem("atelier-theme-cache", seed);
  return dom.window;
}

test("galerie embarquée : le thème en cache s'applique dans le <head>, Default n'est qu'un repli", async () => {
  const html = await assetText("gallery_template.html");
  const head = inlineScript(html, "gallery_template_2.ts");
  assert.ok(html.indexOf("gallery_template_2.ts") < html.indexOf("</head>"), "le script doit vivre dans le <head>");
  const win = page("http://127.0.0.1:18790/figures_index.html?embedded=atelier", LIGHT);
  win.eval(head);
  const root = win.document.documentElement;
  assert.equal(root.style.getPropertyValue("--bg"), "#faf9f5");
  assert.equal(root.style.getPropertyValue("--card"), "#ffffff");
  assert.equal(root.style.getPropertyValue("--txt"), "#1f1e1d");
  assert.equal(root.style.getPropertyValue("--primary"), "#c96442");
  assert.equal(root.style.colorScheme, "light");
  // applyTheme('Default') du corps puis réapplication du cache dans la même tâche
  root.style.setProperty("--bg", "#1e2124");
  assert.equal(win.__atelierGalleryTheme.applyCached(), true);
  assert.equal(root.style.getPropertyValue("--bg"), "#faf9f5");
  assert.match(html, /\napplyTheme\(theme\);\s*\n[^\n]*\n[^\n]*\n[^\n]*\nif\(EMB && window\.__atelierGalleryTheme\) window\.__atelierGalleryTheme\.applyCached\(\);/);
});

test("galerie autonome : le cache de l'app ne remplace pas le thème choisi (figTheme)", async () => {
  const head = inlineScript(await assetText("gallery_template.html"), "gallery_template_2.ts");
  const win = page("http://127.0.0.1:18790/figures_index.html", LIGHT);
  win.eval(head);
  assert.equal(win.document.documentElement.style.getPropertyValue("--bg"), "");
});

test("galerie : un message de l'hôte met le cache à jour pour la prochaine ouverture", async () => {
  const head = inlineScript(await assetText("gallery_template.html"), "gallery_template_2.ts");
  const win = page("http://127.0.0.1:18790/figures_index.html?embedded=atelier");
  win.eval(head);
  win.__atelierGalleryTheme.remember(JSON.parse(LIGHT));
  assert.equal(JSON.parse(win.localStorage.getItem("atelier-theme-cache")).vars["--bg"], "#faf9f5");
});

for (const [name, slot] of [["svg_viewer.html", "svg_viewer_1.ts"], ["pdf_viewer.html", "pdf_viewer_5.ts"]]) {
  test(`${name} : la palette historique ne réécrit pas le thème en cache`, async () => {
    const catalogue = inlineScript(await assetText(name), slot);
    const win = page(`http://127.0.0.1:18790/.fig_thumbs/${name}`, LIGHT);
    win.eval(bridge);
    win.eval(catalogue);
    assert.equal(win.document.documentElement.style.getPropertyValue("--bg"), "#faf9f5");
    // sans cache ni hôte, la page autonome garde sa palette historique
    const alone = page(`http://127.0.0.1:18790/.fig_thumbs/${name}`);
    alone.eval(bridge);
    alone.eval(catalogue);
    assert.equal(alone.document.documentElement.style.getPropertyValue("--bg"), "#1e2124");
  });
}

test("runtime legacyTheme (Markdown, LaTeX, code) : ignoré quand le thème de l'hôte est posé", async () => {
  // bundle en "use strict" : son `var` reste local à l'eval, on l'exporte.
  const runtime = (await assetText("studio_runtime.bundle.js")) + "\nwindow.AtelierStudioRuntime = AtelierStudioRuntime;";
  const cached = page("http://127.0.0.1:18790/.fig_thumbs/md_viewer.html", LIGHT);
  cached.eval(bridge);
  cached.eval(runtime);
  cached.AtelierStudioRuntime.applyLegacyStoredTheme("blue");
  assert.equal(cached.document.documentElement.style.getPropertyValue("--bg"), "#faf9f5");
  assert.notEqual(cached.document.documentElement.style.getPropertyValue("--accent"), "#7aa2f7");
  const alone = page("http://127.0.0.1:18790/.fig_thumbs/md_viewer.html");
  alone.eval(runtime);
  alone.AtelierStudioRuntime.applyLegacyStoredTheme("blue");
  assert.equal(alone.document.documentElement.style.getPropertyValue("--accent"), "#7aa2f7");
});
