import { readdirSync, statSync, existsSync, createReadStream } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import readline from "node:readline";
import { stripHandoff } from "./handoff.mjs";

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
