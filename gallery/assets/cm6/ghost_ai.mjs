// Reusable CM6 ghost-suggestion + AI-autocomplete extension.
//
// Extracted from the LaTeX gallery prototype (latex_cm6_src.js) so a second
// consumer (the main studio editor) can reuse the same ghost/AI machinery.
// The logic is UNCHANGED from the shipped prototype; only the app-globals
// (aiEnabled, view, canSave, setState, dirty) were replaced by the `config`
// callbacks passed to `ghostAiExtension`.
//
// Module-level mutable state (aiTimer/aiController/aiSeq/aiCache and `config`)
// is per-module: this assumes ONE editor per page, which holds for both the
// gallery and studio consumers today. If two editors ever mount on the same
// page, this state would need to move into an instance/StateField.

import {StateEffect, StateField, Prec} from "@codemirror/state";
import {EditorView, Decoration, WidgetType, keymap} from "@codemirror/view";
import {insertTab} from "@codemirror/commands";
import {acceptCompletion, closeCompletion} from "@codemirror/autocomplete";
import {advanceGhost, LruCache} from "./ghost_logic.mjs";

// Set by ghostAiExtension(config). Sensible no-op defaults so the module is
// safe to import before the factory runs.
let config = {
  isTex: () => true,
  aiEnabled: () => true,
  endpoint: "/latex-suggest",
  onState: () => {}
};

let aiTimer = 0;
let aiController = null;
let aiSeq = 0;

const aiCache = new LruCache(50);

function aiCacheKey(ctx) {
  return ctx.before + "\u0000" + ctx.after;
}

export const COMMANDS = [
  "abstract", "author", "begin", "bibliography", "bibliographystyle", "caption",
  "chapter", "cite", "citep", "citet", "clearpage", "cref", "documentclass",
  "emph", "end", "eqref", "figure", "footnote", "includegraphics", "item",
  "label", "maketitle", "newpage", "paragraph", "ref", "section", "subsection",
  "subsubsection", "table", "textbf", "textit", "texttt", "title", "url"
];

const ENVS = [
  "document", "abstract", "figure", "table", "itemize", "enumerate",
  "equation", "equation*", "align", "align*", "gather", "gather*",
  "tabular", "center", "quote", "verbatim", "thebibliography"
];

const WORDS = [
  "albedo", "analysis", "approach", "background", "because", "between",
  "compared", "consistent", "decrease", "effect", "estimated", "figure",
  "however", "important", "increase", "indicates", "method", "model",
  "observed", "regional", "response", "results", "section", "significant",
  "snow", "surface", "therefore", "using", "whereas", "which"
];

const NEXT = {
  albedo: ["response", "change", "signal"],
  because: ["the", "this", "we"],
  however: ["the", "this", "we"],
  analysis: ["shows", "indicates", "suggests"],
  model: ["shows", "estimates", "includes"],
  our: ["results", "analysis", "model"],
  results: ["show", "suggest", "indicate"],
  surface: ["albedo", "response", "conditions"],
  the: ["model", "results", "analysis", "surface", "observed"],
  these: ["results", "patterns", "estimates"],
  this: ["suggests", "indicates", "section", "result"],
  therefore: ["the", "we", "this"],
  using: ["the", "a", "this"],
  which: ["suggests", "indicates", "is"],
  we: ["find", "estimate", "show", "use"]
};

function textOf(state) {
  return state.doc.toString();
}

function lineBefore(state) {
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  return {pos, line, before: line.text.slice(0, pos - line.from), after: line.text.slice(pos - line.from)};
}

function cleanText(src) {
  return String(src || "")
    .replace(/(^|[^\\])%.*$/gm, "$1")
    .replace(/\\(?:begin|end|cite[a-z]*|ref|eqref|cref|label|url|includegraphics)\{[^}]*\}/g, " ")
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?(?:\{[^}]*\})?/g, " ")
    .replace(/[{}[\]$^_~&#]/g, " ")
    .replace(/[.,;:!?()"]/g, " ");
}

function tokens(state) {
  return cleanText(textOf(state)).toLowerCase().match(/[a-z][a-z'-]{2,}/g) || [];
}

export function labels(state) {
  const out = [];
  const re = /\\(?:label|bibitem)\{([^}]+)\}/g;
  let m;
  const src = textOf(state);
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}

export function envNames(state) {
  const out = ENVS.slice();
  const re = /\\begin\{([^}]+)\}/g;
  let m;
  const src = textOf(state);
  while ((m = re.exec(src))) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

function openEnvironment(src) {
  const stack = [];
  const re = /\\(begin|end)\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[1] === "begin") stack.push(m[2]);
    else {
      const i = stack.lastIndexOf(m[2]);
      if (i >= 0) stack.splice(i, 1);
    }
  }
  return stack[stack.length - 1] || "";
}

function bestWord(state, prefix) {
  if (prefix.length < 2) return "";
  const score = Object.create(null);
  const all = tokens(state);
  all.forEach((word, i) => {
    if (word !== prefix && word.startsWith(prefix)) {
      score[word] = (score[word] || 0) + 2 + Math.min(5, i / Math.max(1, all.length));
    }
  });
  return Object.keys(score).sort((a, b) => score[b] - score[a] || a.length - b.length)[0]
    || WORDS.find((word) => word.startsWith(prefix) && word !== prefix)
    || "";
}

function bestNext(state, prev) {
  if (!prev || prev.length < 3) return "";
  const all = tokens(state);
  const score = Object.create(null);
  for (let i = 0; i < all.length - 1; i += 1) {
    if (all[i] === prev && all[i + 1] !== prev) score[all[i + 1]] = (score[all[i + 1]] || 0) + 1;
  }
  return Object.keys(score).sort((a, b) => score[b] - score[a] || a.length - b.length)[0]
    || (NEXT[prev] || [])[0]
    || "";
}

function ghostFor(state) {
  if (!config.isTex()) return null;
  const sel = state.selection.main;
  if (!sel.empty) return null;
  const {pos, line, before, after} = lineBefore(state);
  if (/\S/.test(after.slice(0, 1))) return null;
  if (/^\s*%/.test(before)) return null;
  if (((before.match(/(^|[^\\])\$/g) || []).length % 2) === 1) return null;

  let m = before.match(/\\(begin|end)\{([^}]*)$/);
  if (m) {
    const envs = envNames(state);
    const first = m[1] === "end" ? openEnvironment(textOf(state).slice(0, pos)) : "";
    const ordered = first ? [first].concat(envs.filter((x) => x !== first)) : envs;
    const hit = ordered.find((env) => env.startsWith(m[2]) && env !== m[2]);
    return hit ? {pos, text: hit.slice(m[2].length) + "}"} : null;
  }

  m = before.match(/\\([A-Za-z]*)$/);
  if (m) {
    const hit = COMMANDS.find((cmd) => cmd.startsWith(m[1]) && cmd !== m[1]);
    return hit ? {pos, text: hit.slice(m[1].length)} : null;
  }

  m = before.match(/\\(?:cite[a-z]*|ref|eqref|cref|Cref)\{([^},\s]*)$/);
  if (m) {
    const hit = labels(state).find((label) => label.startsWith(m[1]) && label !== m[1]);
    return hit ? {pos, text: hit.slice(m[1].length)} : null;
  }

  m = before.match(/([A-Za-z][A-Za-z'-]{1,})$/);
  if (m) {
    const typed = m[1].toLowerCase();
    const next = bestNext(state, typed);
    if (next) return {pos, text: " " + next};
    const hit = bestWord(state, typed);
    return hit ? {pos, text: hit.slice(m[1].length)} : null;
  }

  m = before.match(/([A-Za-z][A-Za-z'-]{2,})\s+$/);
  if (m) {
    const hit = bestNext(state, m[1].toLowerCase());
    return hit ? {pos, text: hit} : null;
  }

  return null;
}

function aiContext(state) {
  if (!config.isTex() || !config.aiEnabled() || !state.selection.main.empty) return null;
  const {pos, line, before, after} = lineBefore(state);
  if (/\S/.test(after.slice(0, 1))) return null;
  if (/^\s*%/.test(before)) return null;
  if (((before.match(/(^|[^\\])\$/g) || []).length % 2) === 1) return null;
  if (/\\(?:begin|end|cite[a-z]*|ref|eqref|cref|Cref|label|url|includegraphics)\{[^}]*$/.test(before)) return null;
  if (/\\[A-Za-z]*$/.test(before)) return null;
  const wordAtEnd = /([A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'-]{1,})$/.exec(before);
  if (!/[A-Za-zÀ-ÖØ-öø-ÿ]{2,}\s*$/.test(before) && !wordAtEnd) return null;
  const doc = textOf(state);
  const needsLeadingSpace = Boolean(wordAtEnd);
  return {
    pos,
    key: `${pos}:${doc.length}:${before.slice(-80)}:${after.slice(0, 40)}`,
    before: doc.slice(Math.max(0, pos - 2200), pos) + (needsLeadingSpace ? " " : ""),
    needsLeadingSpace,
    after: doc.slice(pos, Math.min(doc.length, pos + 500))
  };
}

function cancelAiGhost() {
  aiSeq += 1;
  clearTimeout(aiTimer);
  aiTimer = 0;
  if (aiController) aiController.abort();
  aiController = null;
}

function normalizeAiText(text) {
  return String(text || "")
    .split(/\r?\n/)[0]
    .replace(/^["'`«»“”\s]+|["'`«»“”\s]+$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 120)
    .trim();
}

function scheduleAiGhost(v, ctx) {
  clearTimeout(aiTimer);
  const seq = ++aiSeq;

  // Instant path: this exact context was completed before (backspace/retype,
  // revisited spot). No debounce, no network.
  const cached = aiCache.get(aiCacheKey(ctx));
  if (cached) {
    const text = ctx.needsLeadingSpace ? " " + cached : cached;
    v.dispatch({effects: setGhost.of({pos: ctx.pos, text, source: "ai"})});
    config.onState("AI ready");
    return;
  }

  aiTimer = setTimeout(async () => {
    if (!config.aiEnabled() || !v.dom.isConnected) return;
    const live = aiContext(v.state);
    if (!live || live.key !== ctx.key) return;
    if (aiController) aiController.abort();
    aiController = new AbortController();
    config.onState("AI...");
    try {
      const r = await fetch(config.endpoint, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({before: ctx.before, after: ctx.after}),
        signal: aiController.signal
      });
      const j = await r.json();
      if (seq !== aiSeq || !v.dom.isConnected) return;
      if (j.superseded) return; // a newer request replaced this one server-side
      const now = aiContext(v.state);
      if (!now || now.key !== ctx.key || ghostFor(v.state)) return;
      const bare = normalizeAiText(j.text);
      const text = bare && ctx.needsLeadingSpace ? " " + bare : bare;
      if (j.ok && text) {
        aiCache.set(aiCacheKey(ctx), bare);
        v.dispatch({effects: setGhost.of({pos: ctx.pos, text, source: "ai"})});
        config.onState("AI ready");
      } else if (!j.ok && j.error) {
        const fallback = ghostFor(v.state);
        if (fallback) {
          v.dispatch({effects: setGhost.of(fallback)});
          config.onState("local ready");
        } else {
          config.onState("AI slow");
        }
      } else {
        config.onState("");
      }
    } catch (error) {
      if (error?.name !== "AbortError") config.onState("AI unavailable");
    }
  }, 350);
}

class GhostWidget extends WidgetType {
  constructor(text, source = "") {
    super();
    this.text = text;
    this.source = source;
  }
  eq(other) {
    return this.text === other.text && this.source === other.source;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = this.source === "ai" ? "cm-ghostText cm-ghostText-ai" : "cm-ghostText";
    span.textContent = this.text;
    return span;
  }
}

const setGhost = StateEffect.define();

function ghostValue(pos, text, source) {
  const deco = text
    ? Decoration.set([Decoration.widget({widget: new GhostWidget(text, source), side: 1}).range(pos)])
    : Decoration.none;
  return {pos, text: text || "", source: source || "", deco};
}

// If the transaction is a single plain insertion exactly at the ghost anchor
// and the inserted text matches the ghost prefix, advance the ghost instead of
// dropping it. Returns the new field value, or null when the ghost cannot
// survive this change.
function advancedGhostValue(value, changes) {
  let single = null;
  let count = 0;
  changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
    count += 1;
    single = {fromA, toA, text: inserted.toString()};
  });
  if (count !== 1 || !single || single.fromA !== single.toA) return null; // not a plain insertion
  if (single.fromA !== value.pos) return null;                            // typed elsewhere
  const rest = advanceGhost(value.text, single.text);
  if (rest === null) return null;                                         // mismatch
  return ghostValue(value.pos + single.text.length, rest, value.source);
}

const ghostField = StateField.define({
  create() {
    return ghostValue(0, "", "");
  },
  update(value, tr) {
    if (tr.docChanged && value.text) {
      const advanced = advancedGhostValue(value, tr.changes);
      value = advanced || ghostValue(tr.changes.mapPos(value.pos), "", "");
    } else if (tr.docChanged) {
      value = {...value, pos: tr.changes.mapPos(value.pos), deco: value.deco.map(tr.changes)};
    }
    for (const effect of tr.effects) {
      if (effect.is(setGhost)) {
        const next = effect.value || {pos: 0, text: ""};
        value = ghostValue(next.pos, next.text, next.source);
      }
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.deco)
});

export function refreshGhost(v) {
  const local = ghostFor(v.state);
  v.dispatch({effects: setGhost.of(local)});
  if (local) {
    config.onState("local ready");
    cancelAiGhost();
    return;
  }
  const ctx = aiContext(v.state);
  if (ctx) scheduleAiGhost(v, ctx);
  else cancelAiGhost();
}

export function acceptGhost(v) {
  const ghost = v.state.field(ghostField, false);
  if (!ghost || !ghost.text) return false;
  cancelAiGhost();
  v.dispatch({
    changes: {from: ghost.pos, insert: ghost.text},
    selection: {anchor: ghost.pos + ghost.text.length},
    effects: setGhost.of(null),
    userEvent: "input.complete"
  });
  return true;
}

// Factory: wires the ghost/AI machinery to a host editor via `config` and
// returns the CM6 extensions to spread into EditorState.create.
//   config = {
//     isTex: () => boolean,     // enable prose ghost+AI only for .tex buffers
//     aiEnabled: () => boolean, // live AI on/off toggle
//     endpoint: string,         // POST endpoint for AI suggestions
//     onState: (label) => void  // raw status label ("AI ready", "local ready",
//                               //   "AI...", "AI slow", "AI unavailable", "")
//   }
export function ghostAiExtension(cfg) {
  config = cfg;
  const updateListenerExt = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      const kept = update.state.field(ghostField, false);
      if (kept && kept.text) {
        // The ghost auto-advanced in the field (user typed its prefix):
        // keep it, cancel any pending AI request, skip recomputation.
        cancelAiGhost();
        config.onState(kept.source === "ai" ? "AI ready" : "local ready");
      } else {
        refreshGhost(update.view);
      }
    } else if (update.selectionSet) {
      refreshGhost(update.view);
    }
  });
  const keymapExt = Prec.highest(keymap.of([
    {key: "Tab", run: (v) => acceptGhost(v) || acceptCompletion(v) || insertTab(v)},
    {key: "Escape", run: (v) => {
      const ghost = v.state.field(ghostField, false);
      if (ghost?.text) {
        v.dispatch({effects: setGhost.of(null)});
        return true;
      }
      return closeCompletion(v);
    }}
  ]));
  return [ghostField, updateListenerExt, keymapExt];
}
