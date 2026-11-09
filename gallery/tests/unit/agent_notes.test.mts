// Notes posées par l'agent (outil atelier_annotate) : reconnaissance, fil,
// proposition en cours, message au chat et bloc affiché dans l'éditeur LaTeX.
import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {fileURLToPath} from "node:url";
import {JSDOM} from "jsdom";

const out = await build({entryPoints: [fileURLToPath(new URL("../../src/studio/features/latex/agent_notes.ts", import.meta.url))],
  bundle: true, write: false, format: "esm"});
const agent = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0]!.text).toString("base64")}`);

const base = {id: "a1", by: "agent", author: "Claude", comment: "Phrase longue.", text: "Smoke lowers albedo.",
  from: {line: 4, ch: 0}, to: {line: 4, ch: 20}};

test("seules les notes de l'agent ou de Claude Desktop sont reconnues", () => {
  assert.equal(agent.isAgentNote({by: "agent"}), true);
  assert.equal(agent.isAgentNote({by: "claude"}), true);
  assert.equal(agent.isAgentNote({}), false);
  assert.equal(agent.isAgentNote(null), false);
  assert.equal(agent.authorOf({}), "Claude");
  assert.equal(agent.authorOf({author: "Codex"}), "Codex");
});

test("la proposition en cours est la dernière du fil, sinon celle de la note", () => {
  assert.equal(agent.currentSuggestion(base), null);
  const note = {...base, suggest: {text: "Smoke darkens ice.", reason: "Plus court."}};
  assert.equal(agent.currentSuggestion(note).text, "Smoke darkens ice.");
  const later = {...note, thread: [{id: "m1", by: "user", text: "Plus précis ?", at: 1},
    {id: "m2", by: "agent", text: "Voici.", suggest: {text: "Smoke lowers glacier albedo."}, at: 2}]};
  assert.deepEqual(agent.currentSuggestion(later), {text: "Smoke lowers glacier albedo.", reason: "Voici."});
});

test("non lu, en attente de l'agent, et fils fusionnés par id", () => {
  const thread = [{id: "m1", by: "user", text: "Pourquoi ?", at: 10}];
  assert.equal(agent.waitsForAgent({...base, thread}), true);
  assert.equal(agent.hasUnread({...base, thread}), false);
  const answered = [...thread, {id: "m2", by: "agent", text: "Parce que.", at: 20}];
  assert.equal(agent.hasUnread({...base, thread: answered}), true);
  assert.equal(agent.hasUnread({...base, thread: answered, seen: 20}), false);
  assert.equal(agent.waitsForAgent({...base, thread: answered}), false);
  const merged = agent.mergeThreads(thread, answered);
  assert.deepEqual(merged.map((m: {id: string}) => m.id), ["m1", "m2"]);
  assert.deepEqual(agent.mergeThreads(undefined, thread).map((m: {id: string}) => m.id), ["m1"]);
});

test("la réponse au chat nomme la note, le passage et l'outil, sans toucher au fichier", () => {
  const text = agent.replyRequest("/p/main.tex", base, "Garde le chiffre.");
  assert.match(text, /^Réponse sur ta note \[a1\] dans main\.tex \(ligne 5\) : Garde le chiffre\./);
  assert.match(text, /Passage : « Smoke lowers albedo\. »/);
  assert.match(text, /atelier_annotate, action reply \(path « \/p\/main\.tex », id « a1 »\)/);
  assert.match(text, /Ne modifie pas le fichier toi-même/);
});

test("le bloc d'une remarque montre le fil et câble Résoudre, Retirer et Répondre", () => {
  const {document} = new JSDOM("").window;
  const calls: string[] = [];
  const actions = {accept: () => calls.push("accept"), reject: () => calls.push("reject"), resolve: () => calls.push("resolve"),
    remove: () => calls.push("remove"), reply: (w: string) => calls.push("reply:" + w), seen: () => calls.push("seen")};
  const note = {...base, thread: [{id: "m1", by: "user", text: "<b>ok</b> ?", at: 1}]};
  const block = agent.agentBlock(document, {note, lineBefore: "", lineAfter: ""}, actions);
  assert.equal(block.querySelectorAll(".texa-msg").length, 1);
  assert.equal(block.querySelector(".texa-msg-text").textContent, "<b>ok</b> ?");
  assert.match(block.querySelector(".texa-wait").textContent, /Claude lit ta réponse/);
  assert.equal(block.querySelector(".texr-accept"), null);
  block.querySelector(".texa-resolve").click();
  block.querySelector(".texa-remove").click();
  block.querySelector(".texa-answer").click();
  const input = block.querySelector(".texr-input");
  input.value = "Merci";
  block.querySelector(".texr-send").click();
  assert.deepEqual(calls, ["resolve", "remove", "reply:Merci"]);
});

test("le bloc d'une proposition montre le diff et câble Accepter et Rejeter", () => {
  const {document} = new JSDOM("").window;
  const calls: string[] = [];
  const actions = {accept: () => calls.push("accept"), reject: () => calls.push("reject"), resolve: () => calls.push("resolve"),
    remove: () => calls.push("remove"), reply: () => calls.push("reply"), seen: () => calls.push("seen")};
  const note = {...base, suggest: {text: "Smoke lowers glacier albedo.", reason: "Plus précis."}};
  const block = agent.agentBlock(document, {note, lineBefore: "", lineAfter: ""}, actions);
  assert.match(block.querySelector(".texr-new").innerHTML, /<b>glacier<\/b>/);
  assert.equal(block.querySelector(".texr-why").textContent, "Plus précis.");
  assert.equal(block.querySelector(".texa-resolve"), null);
  block.querySelector(".texr-accept").click();
  block.querySelector(".texa-reject").click();
  assert.deepEqual(calls, ["accept", "reject"]);
  const head = agent.agentHeader(document, 3, note);
  assert.equal(head.querySelector(".is-agent").textContent, "3");
  assert.equal(head.querySelector(".texa-who").textContent, "Claude");
});
