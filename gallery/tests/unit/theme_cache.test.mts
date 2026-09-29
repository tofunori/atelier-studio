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
