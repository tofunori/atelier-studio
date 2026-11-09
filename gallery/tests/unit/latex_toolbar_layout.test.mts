// Barre LaTeX épurée et personnalisable (2026-11-08) : règles pures de
// toolbar_layout.ts (réglage relu, bascule, ordre par zone, `order` CSS).
import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {fileURLToPath} from "node:url";

const out = await build({entryPoints: [fileURLToPath(new URL("../../src/studio/features/latex/toolbar_layout.ts", import.meta.url))],
  bundle: true, write: false, format: "esm"});
const tb = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0]!.text).toString("base64")}`);

type Entry = {key: string; on: boolean};
const keys = (layout: Entry[]) => layout.map(entry => entry.key);
const shown = (layout: Entry[]) => layout.filter(entry => entry.on).map(entry => entry.key);

test("par défaut : éditeur visuel et Diff à gauche ; Références, Annotations, chat et Compiler à droite", () => {
  const layout = tb.defaultToolbarLayout();
  assert.deepEqual(shown(layout), ["visual", "diff", "references", "annotations", "chat", "compile"]);
  for (const key of ["wrap", "poppdf", "console", "outline", "find", "rewrapall"]) {
    assert.equal(layout.find((entry: Entry) => entry.key === key).on, false, `${key} attend dans « … »`);
  }
});

test("un réglage abîmé ou ancien retombe sur ses pieds", () => {
  assert.deepEqual(tb.normalizeToolbarLayout(null), tb.defaultToolbarLayout());
  assert.deepEqual(tb.normalizeToolbarLayout("x"), tb.defaultToolbarLayout());
  // Clé inconnue écartée, doublon ignoré, outil manquant remis à sa place.
  const layout = tb.normalizeToolbarLayout({v: 1, items: [
    {k: "compile", on: true}, {k: "nope", on: true}, {k: "chat", on: false}, {k: "chat", on: true}, {k: "visual", on: false},
  ]});
  assert.equal(new Set(keys(layout)).size, tb.LATEX_TOOLBAR_ITEMS.length);
  assert.equal(layout.find((entry: Entry) => entry.key === "chat").on, false);
  assert.equal(layout.find((entry: Entry) => entry.key === "visual").on, false);
  // La gauche passe toujours avant la droite, quel que soit l'ordre reçu.
  const zones = layout.map((entry: Entry) => tb.LATEX_TOOLBAR_ITEMS.find((item: {key: string}) => item.key === entry.key).zone);
  assert.deepEqual(zones, [...zones].sort((a: string, b: string) => (a === "left" ? 0 : 1) - (b === "left" ? 0 : 1)));
  // compile reste avant chat (ordre de l'utilisateur), les absents suivent leur voisin.
  assert.ok(keys(layout).indexOf("compile") < keys(layout).indexOf("chat"));
});

test("cocher, déplacer, décaler : un outil ne change jamais de côté", () => {
  let layout = tb.defaultToolbarLayout();
  layout = tb.toggleToolbarItem(layout, "wrap");
  assert.equal(layout.find((entry: Entry) => entry.key === "wrap").on, true);
  layout = tb.moveToolbarItem(layout, "chat", "references");
  assert.deepEqual(shown(layout).slice(3, 6), ["chat", "references", "annotations"]);
  assert.deepEqual(tb.moveToolbarItem(layout, "chat", "visual"), layout, "pas de passage à gauche");
  layout = tb.moveToolbarItem(layout, "references", null);
  assert.equal(keys(layout).at(-1), "references");
  layout = tb.nudgeToolbarItem(layout, "references", -1);
  assert.equal(keys(layout).at(-2), "references");
  assert.deepEqual(tb.nudgeToolbarItem(layout, "visual", -1), layout, "déjà en tête de sa zone");
  const orders = tb.toolbarOrders(layout);
  assert.ok(orders.visual < 50 && orders.diff < 50, "la gauche reste avant l'espaceur (50)");
  assert.ok(orders.compile > 50 && orders.chat > 50 && orders.compile < 100, "la droite reste avant « … » (100)");
  assert.deepEqual(tb.normalizeToolbarLayout(tb.serializeToolbarLayout(layout)), layout, "le réglage enregistré se relit tel quel");
});
