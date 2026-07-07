import {EditorState, Prec} from "@codemirror/state";
import {EditorView, keymap} from "@codemirror/view";
import {defaultKeymap, historyKeymap} from "@codemirror/commands";
import {autocompletion, startCompletion} from "@codemirror/autocomplete";
import {basicSetup} from "codemirror";
import {ghostAiExtension, refreshGhost, COMMANDS, envNames, labels} from "./ghost_ai.mjs";

const params = new URLSearchParams(location.search);
const path = params.get("path") || "";
const fname = document.getElementById("fname");
const stateEl = document.getElementById("state");
const saveBtn = document.getElementById("save");
const aiBtn = document.getElementById("ai");
let diskMtime = 0;
let dirty = false;
let view = null;
let canSave = false;
let aiEnabled = localStorage.getItem("atelier.latex.cm6.ai") !== "0";

const DEMO_DOC = "\\documentclass{article}\n\\begin{\n\n";

function setState(text, cls = "") {
  stateEl.textContent = text;
  stateEl.className = cls;
}

function setAiButton() {
  if (!aiBtn) return;
  aiBtn.textContent = aiEnabled ? "AI on" : "AI off";
  aiBtn.classList.toggle("active", aiEnabled);
}

function completionSource(ctx) {
  const before = ctx.state.sliceDoc(Math.max(0, ctx.pos - 80), ctx.pos);
  let m = /\\(begin|end)\{([^}]*)$/.exec(before);
  if (m) {
    const from = ctx.pos - m[2].length;
    return {
      from,
      options: envNames(ctx.state).map((label) => ({
        label,
        type: "keyword",
        detail: "environment",
        apply: label + "}"
      })),
      validFor: /^[A-Za-z*]*$/
    };
  }
  m = /\\([A-Za-z]*)$/.exec(before);
  if (m) {
    const from = ctx.pos - m[1].length;
    return {
      from,
      options: COMMANDS.map((label) => ({label, type: "function", detail: "LaTeX"})),
      validFor: /^[A-Za-z]*$/
    };
  }
  m = /\\(?:cite[a-z]*|ref|eqref|cref|Cref)\{([^},\s]*)$/.exec(before);
  if (m) {
    const from = ctx.pos - m[1].length;
    return {
      from,
      options: labels(ctx.state).map((label) => ({label, type: "constant", detail: "label"})),
      validFor: /^[^},\s]*$/
    };
  }
  if (!ctx.explicit) return null;
  return null;
}

async function save() {
  if (!view || !path || !canSave) {
    setState("demo only");
    return false;
  }
  const r = await fetch("/codesave", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({path, text: view.state.doc.toString(), mtime: diskMtime})
  });
  const j = await r.json();
  if (j.error) {
    setState(j.error, "err");
    return false;
  }
  diskMtime = j.mtime;
  dirty = false;
  setState("saved");
  return true;
}

function mountEditor(doc) {
  if (view) view.destroy();
  view = new EditorView({
    parent: document.getElementById("editor"),
    state: EditorState.create({
      doc,
      extensions: [
        basicSetup,
        // App-owned dirty/status listener runs BEFORE the extension's ghost
        // listener so the ghost status label wins (matches the pre-refactor
        // single-listener order: "modified" set first, ghost status second).
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            dirty = true;
            setState(canSave ? "modified" : "demo edited");
          }
        }),
        ...ghostAiExtension({
          isTex: () => true,
          aiEnabled: () => aiEnabled,
          endpoint: "/latex-suggest",
          onState: (s) => setState(canSave ? s : "demo " + s)
        }),
        autocompletion({override: [completionSource], activateOnTyping: true, activateOnTypingDelay: 80, maxRenderedOptions: 40}),
        Prec.highest(keymap.of([
          {key: "Ctrl-Space", run: startCompletion},
          {key: "Mod-s", run: () => { save(); return true; }}
        ])),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.theme({
          "&": {height: "100%"},
          ".cm-content": {caretColor: "var(--accent)"}
        })
      ]
    })
  });
  window.cm6 = view;
  refreshGhost(view);
}

function loadDemo(message) {
  canSave = false;
  saveBtn.disabled = true;
  fname.textContent = "CM6 demo";
  mountEditor(DEMO_DOC);
  const pos = DEMO_DOC.indexOf("\\begin{") + "\\begin{".length;
  view.dispatch({selection: {anchor: pos}});
  view.focus();
  setState(message || "demo: try Tab");
}

async function load() {
  if (!path) {
    loadDemo("demo: try Tab");
    return;
  }
  fname.textContent = path.split("/").pop() || "CM6 LaTeX";
  const r = await fetch("/code?path=" + encodeURIComponent(path));
  const j = await r.json();
  if (j.error) {
    loadDemo(j.error);
    return;
  }
  canSave = true;
  saveBtn.disabled = false;
  diskMtime = j.mtime;
  mountEditor(j.text);
  setState("CM6 ready");
}

saveBtn.onclick = () => save();
if (aiBtn) {
  aiBtn.onclick = () => {
    aiEnabled = !aiEnabled;
    localStorage.setItem("atelier.latex.cm6.ai", aiEnabled ? "1" : "0");
    setAiButton();
    if (view) refreshGhost(view);
  };
}
setAiButton();
load();
