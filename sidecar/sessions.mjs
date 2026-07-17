import { readdirSync, statSync, existsSync, createReadStream } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import readline from "node:readline";
import { stripHandoff } from "./handoff.mjs";
import { stripGalleryToolInstruction } from "./gallery_tool_prompt.mjs";
import { stripZoteroPassageInstruction } from "./zotero_passage_prompt.mjs";
import { stripKbBlock } from "./kb_prompt.mjs";
import { listSessions as listKimiSessions } from "./providers/kimi.mjs";

function stripAtelierToolInstructions(text) {
  return stripKbBlock(stripZoteroPassageInstruction(stripGalleryToolInstruction(text)));
}

// Lister les sessions existantes (CLI + Studio) pour reprise.

async function firstUserText(path, isCodex) {
  const rl = readline.createInterface({ input: createReadStream(path) });
  let n = 0;
  for await (const line of rl) {
    if (++n > 80) break;
    try {
      const d = JSON.parse(line);
      if (!isCodex && d.type === "user" && d.message?.content) {
        const c = d.message.content;
        const text = typeof c === "string" ? c
          : Array.isArray(c) ? c.filter((b) => b.type === "text").map((b) => b.text).join(" ") : "";
        const t = text.trim();
        if (t && !t.startsWith("<")) { rl.close(); return t.slice(0, 70); }
      }
      if (isCodex) {
        const payload = d.payload ?? d;
        if (payload?.type === "user_message" && payload.message) { rl.close(); return String(payload.message).slice(0, 70); }
        if (payload?.role === "user") {
          const c = payload.content;
          const text = Array.isArray(c) ? c.map((b) => b.text ?? "").join(" ") : String(c ?? "");
          const t = text.trim();
          if (t) { rl.close(); return t.slice(0, 70); }
        }
      }
    } catch {}
  }
  rl.close();
  return null;
}

// --- Grok (~/.grok/sessions/<cwd encodé>/<session-uuid>/) ---
// Encodage observé (scratchpad grok-stdio-probe) : cwd complet passé tel quel
// à encodeURIComponent, "/" -> "%2F". Le vrai message utilisateur est
// enveloppé dans <user_query>…</user_query> au milieu d'entrées "user"
// synthétiques (contexte système injecté par le CLI : <user_info>,
// <system-reminder>…) — on ne garde que celles qui matchent ce wrapper.
function grokProjectDir(projectRoot) {
  return join(homedir(), ".grok", "sessions", encodeURIComponent(String(projectRoot || homedir())));
}

function extractUserQuery(text) {
  const m = /<user_query>\s*([\s\S]*?)\s*<\/user_query>/.exec(String(text ?? ""));
  return m ? m[1].trim() : null;
}

function grokUserQueryFromContent(content) {
  const text = Array.isArray(content)
    ? content.filter((b) => b?.type === "text").map((b) => b.text ?? "").join(" ")
    : String(content ?? "");
  return extractUserQuery(text);
}

async function firstGrokUserText(path) {
  const rl = readline.createInterface({ input: createReadStream(path) });
  let n = 0;
  for await (const line of rl) {
    // les premiers tours grok incluent pas mal de contexte système
    // (user_info, system-reminder…) avant le vrai premier message utilisateur
    if (++n > 200) break;
    try {
      const d = JSON.parse(line);
      if (d.type !== "user") continue;
      const query = grokUserQueryFromContent(d.content);
      if (query) { rl.close(); return stripAtelierToolInstructions(query).slice(0, 70); }
    } catch {}
  }
  rl.close();
  return null;
}

export async function listSessions(provider, projectRoot) {
  const out = [];
  if (provider === "claude") {
    const slug = String(projectRoot || homedir()).replace(/\//g, "-");
    const dir = join(homedir(), ".claude", "projects", slug);
    if (!existsSync(dir)) return [];
    const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
    const withM = files.map((f) => ({ f, m: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m).slice(0, 25);
    for (const { f, m } of withM) {
      const id = f.replace(/\.jsonl$/, "");
      out.push({ id, mtime: m, title: (await firstUserText(join(dir, f), false)) ?? id.slice(0, 8) });
    }
  } else if (provider === "kimi") {
    // Branche EXPLICITE (plan 046 étape 8) : listing natif session/list ACP —
    // il est interdit de tomber sur le parser de fichiers Codex ci-dessous.
    return listKimiSessions(projectRoot);
  } else if (provider === "grok") {
    const dir = grokProjectDir(projectRoot);
    if (!existsSync(dir)) return [];
    const dirs = readdirSync(dir).filter((name) => {
      try { return statSync(join(dir, name)).isDirectory(); } catch { return false; }
    });
    const withM = dirs.map((id) => ({ id, m: statSync(join(dir, id)).mtimeMs }))
      .sort((a, b) => b.m - a.m).slice(0, 25);
    for (const { id, m } of withM) {
      const chatFile = join(dir, id, "chat_history.jsonl");
      const title = existsSync(chatFile) ? await firstGrokUserText(chatFile) : null;
      out.push({ id, mtime: m, title: title ?? id.slice(0, 8) });
    }
  } else {
    const base = join(homedir(), ".codex", "sessions");
    if (!existsSync(base)) return [];
    const files = [];
    const walk = (d, depth) => {
      if (depth > 4) return;
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        const st = statSync(p);
        if (st.isDirectory()) walk(p, depth + 1);
        else if (e.startsWith("rollout-") && e.endsWith(".jsonl")) files.push({ p, m: st.mtimeMs });
      }
    };
    walk(base, 0);
    files.sort((a, b) => b.m - a.m);
    for (const { p, m } of files.slice(0, 25)) {
      const mm = /rollout-.*-([0-9a-f-]{36})\.jsonl$/.exec(p);
      if (!mm) continue;
      out.push({ id: mm[1], mtime: m, title: (await firstUserText(p, true)) ?? mm[1].slice(0, 8) });
    }
  }
  return out;
}

/** Historique d'un rollout Codex → événements affichables. */
export async function codexHistory(sessionId) {
  const base = join(homedir(), ".codex", "sessions");
  if (!existsSync(base)) return [];
  let file = null;
  const walk = (d, depth) => {
    if (file || depth > 4) return;
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p, depth + 1);
      else if (e.includes(sessionId) && e.endsWith(".jsonl")) { file = p; return; }
    }
  };
  walk(base, 0);
  if (!file) return [];
  const events = [];
  const rl = readline.createInterface({ input: createReadStream(file) });
  for await (const line of rl) {
    try {
      const d = JSON.parse(line);
      const p = d.payload ?? d;
      if (p.type === "user_message" && p.message) {
        const t = stripHandoff(String(p.message).trim());
        if (t && !t.startsWith("<") && !t.startsWith("# AGENTS")) {
          events.push({ kind: "user", text: t });
        }
      }
      if (p.type === "agent_message" && p.message) {
        events.push({ kind: "text", text: String(p.message) });
      }
    } catch {}
  }
  return events;
}

/** Cherche `<sessionId>/chat_history.jsonl` sous tous les sous-dossiers projet
 *  de baseDir (existence du chemin seulement). Repli utilisé quand un thread
 *  déplacé vers un autre projet ne retrouve plus sa session sous le nouveau
 *  cwd encodé (la session vit toujours sous le dossier de l'ANCIEN
 *  projectRoot). `baseDir` injectable pour les tests (mkdtemp) ; par défaut
 *  `~/.grok/sessions`. */
export function findGrokSessionFile(sessionId, baseDir = join(homedir(), ".grok", "sessions")) {
  let entries;
  try {
    entries = readdirSync(baseDir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = join(baseDir, entry.name, sessionId, "chat_history.jsonl");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Historique d'une session Grok (chat_history.jsonl ACP) → événements
 * affichables, forme alignée sur codexHistory ci-dessus (kind:"user"/"text"),
 * plus kind:"tool" pour les tool_calls assistant. "system"/"reasoning"/
 * "tool_result" ne sont pas affichés (parité codexHistory, qui ne montre pas
 * non plus les sorties d'outils). Chemin direct d'abord (cas nominal) ; repli
 * sur la recherche globale par id seulement si introuvable (thread déplacé) —
 * listSessions n'a PAS ce repli (hors scope). */
export async function grokHistory(sessionId, projectRoot, opts = {}) {
  const dir = grokProjectDir(projectRoot);
  let file = join(dir, sessionId, "chat_history.jsonl");
  if (!existsSync(file)) {
    const found = findGrokSessionFile(sessionId, opts.baseDir);
    if (!found) return [];
    file = found;
  }
  const events = [];
  const rl = readline.createInterface({ input: createReadStream(file) });
  for await (const line of rl) {
    try {
      const d = JSON.parse(line);
      if (d.type === "user") {
        const query = grokUserQueryFromContent(d.content);
        // handoff inter-provider : ne montrer que le vrai message tapé,
        // comme claudeHistory/codexHistory (le préambule part au modèle,
        // jamais à l'écran)
        if (query) events.push({
          kind: "user",
          text: stripAtelierToolInstructions(stripHandoff(query)),
        });
      } else if (d.type === "assistant") {
        const text = String(d.content ?? "").trim();
        if (text) events.push({ kind: "text", text });
        for (const tc of d.tool_calls ?? []) {
          if (tc?.name) events.push({ kind: "tool", name: String(tc.name) });
        }
      }
    } catch {}
  }
  return events;
}
