// Rondes d'annotations : outils purs de revision_round.ts (diff de mots,
// demande au chat, réponses fraîches, section d'une ligne).
import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {fileURLToPath} from "node:url";
import {JSDOM} from "jsdom";

const out = await build({entryPoints: [fileURLToPath(new URL("../../src/studio/features/latex/revision_round.ts", import.meta.url))],
  bundle: true, write: false, format: "esm"});
const round = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0]!.text).toString("base64")}`);

test("sectionOf nomme le résumé et numérote les sections comme LaTeX", () => {
  const lines = ["\\begin{abstract}", "Texte.", "\\end{abstract}", "\\section*{Préface}", "a", "\\section{Introduction}", "b", "\\section[court]{Données et méthodes}", "c"];
  assert.equal(round.sectionOf(lines, 1), "Résumé");
  assert.equal(round.sectionOf(lines, 4), "Préface");
  assert.equal(round.sectionOf(lines, 6), "1 · Introduction");
  assert.equal(round.sectionOf(lines, 8), "2 · Données et méthodes");
  assert.equal(round.sectionOf(["x"], 0), "Début du document");
});

test("la demande au chat donne à l'agent les ids, le passage et la règle de l'outil", () => {
  const notes = [{id: "c1", number: 1, text: "Wildfire smoke deposits", comment: "Commencer par le résultat.", from: {line: 21, ch: 0}, to: {line: 22, ch: 4}}];
  const text = round.roundRequest("/p/main.tex", {id: "r100", n: 2}, notes, ["Résumé"]);
  assert.match(text, /^Ronde d'annotations 2 sur main\.tex : 1 note\./);
  assert.match(text, /\[c1\] lignes 22-23 · Résumé/);
  assert.match(text, /Passage : « Wildfire smoke deposits »/);
  assert.match(text, /atelier_revision \(path « \/p\/main\.tex », round « r100 »/);
  assert.match(text, /Ne modifie pas le fichier/);
  const again = round.followUp("/p/main.tex", {id: "r100", n: 2}, notes[0], "again", "plus court");
  assert.match(again, /Nouvelle proposition pour la note \[c1\] \(ronde 2, main\.tex\) : plus court/);
  assert.match(round.followUp("/p/main.tex", {id: "r100", n: 2}, notes[0], "answer", "Ren 2021"), /^Réponse à ta question sur la note \[c1\]/);
});

test("freshReplies ne garde que la ronde en cours et les seq jamais vus", () => {
  const stored = {round: "r100", seq: 3, items: {
    c1: {kind: "propose", text: "Albedo drops.", reason: "Plus direct.", author: "Codex", seq: 3},
    c2: {kind: "ask", question: "Quelle étude ?", author: "Codex", seq: 2},
    c3: {kind: "propose", seq: 1},
  }};
  const seen: Record<string, number> = {c2: 2};
  const fresh = round.freshReplies(stored, "r100", (id: string) => seen[id] || 0);
  assert.deepEqual(fresh.map((f: {id: string}) => f.id), ["c1"]);
  assert.equal(fresh[0].reply.text, "Albedo drops.");
  assert.deepEqual(round.freshReplies(stored, "r99", () => 0), []);
  assert.deepEqual(round.freshReplies(null, "r100", () => 0), []);
});

test("le diff de mots marque seulement ce qui part et ce qui arrive", () => {
  const before = "Smoke lowers albedo and enhances melt.";
  const after = "Smoke lowers glacier albedo and speeds melt.";
  const removed = round.removedRanges(before, after).map(([a, b]: [number, number]) => before.slice(a, b));
  assert.deepEqual(removed, ["enhances"]);
  assert.equal(round.insertedHtml(before, after), "Smoke lowers <b>glacier</b> albedo and <b>speeds</b> melt.");
  // mots changés voisins : un seul fond, espace compris
  assert.equal(round.insertedHtml("a b c", "a x y c"), "a <b>x y</b> c");
  assert.equal(round.insertedHtml("<x>", "<y>"), "<b>&lt;y&gt;</b>");
});

test("le bloc de proposition câble Accepter, Rejeter et Redemander", () => {
  const {window} = new JSDOM("<!doctype html><body></body>");
  const calls: string[] = [];
  const block = round.proposalBlock(window.document, {
    number: 1, comment: "c", lineBefore: "", lineAfter: "", passage: "old text", position: {index: 1, total: 3},
    reply: {kind: "propose", text: "new text", reason: "Plus net.", seq: 1},
  }, {accept: () => calls.push("acc"), reject: () => calls.push("rej"), again: (w: string) => calls.push(`again:${w}`), move: (s: number) => calls.push(`move:${s}`)});
  assert.equal(block.querySelector(".texr-new-line")!.innerHTML, "<b>new</b> text");
  assert.equal(block.querySelector(".texr-count")!.textContent, "1 sur 3");
  (block.querySelector(".texr-accept") as HTMLButtonElement).click();
  (block.querySelector(".texr-reject") as HTMLButtonElement).click();
  (block.querySelector(".texr-again") as HTMLButtonElement).click();
  assert.equal((block.querySelector(".texr-again-row") as HTMLElement).hidden, false);
  (block.querySelector(".texr-input") as HTMLInputElement).value = "plus court";
  (block.querySelector(".texr-send") as HTMLButtonElement).click();
  (block.querySelector(".texr-next") as HTMLButtonElement).click();
  assert.deepEqual(calls, ["acc", "rej", "again:plus court", "move:1"]);
  // une seule proposition : pas de navigation
  const single = round.proposalBlock(window.document, {number: 1, comment: "", lineBefore: "", lineAfter: "", passage: "a", position: {index: 1, total: 1},
    reply: {kind: "propose", text: "b", seq: 1}}, {accept() {}, reject() {}, again() {}, move() {}});
  assert.equal(single.querySelector(".texr-nav"), null);
});

test("les blocs se posent autour du paragraphe, jamais au milieu du texte fluide", () => {
  const lines = ["\\section{Intro}", "Glaciers retreat", "quickly and their albedo", "is comparable.", "", "% note", "Next paragraph.", "\\end{document}"];
  assert.deepEqual(round.paragraphOf(lines, 2, 2), {start: 1, end: 3});
  assert.deepEqual(round.paragraphOf(lines, 6, 6), {start: 6, end: 6});
  assert.deepEqual(round.paragraphOf(lines, 0, 0), {start: 0, end: 0});
  // mots retirés voisins : une seule plage, espace compris
  const before = "a b c d";
  assert.deepEqual(round.removedRanges(before, "a x d").map(([f, t]: [number, number]) => before.slice(f, t)), ["b c"]);
});
