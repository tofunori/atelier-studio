import { getSessionMessages } from "@anthropic-ai/claude-agent-sdk";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { stripHandoff } from "./handoff.mjs";
import { stripGalleryToolInstruction } from "./gallery_tool_prompt.mjs";
import { stripZoteroPassageInstruction } from "./zotero_passage_prompt.mjs";
import { stripKbBlock } from "./kb_prompt.mjs";
import { toolDetail } from "./providers/claude.mjs";

// Les sessions natives persistent le prompt provider complet : retirer les
// blocs d'outils Atelier avant affichage (même famille que sessions.mjs).
function stripAtelierToolInstructions(text) {
  return stripKbBlock(stripZoteroPassageInstruction(stripGalleryToolInstruction(text)));
}

const DEFAULT_CLAUDE_PROJECTS_DIR = () => join(homedir(), ".claude", "projects");

// Balises d'injections systèmes à filtrer (reminders, commandes, notifications) —
// on ne rejette QUE ces familles connues, pas tout message commençant par « < ».
const SYSTEM_TAG =
  /^<(system-reminder|command-name|command-message|command-args|local-command-stdout|local-command-stderr|task-notification|system-warning)\b/;

function userText(msg) {
  const c = msg?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  }
  return "";
}

/** Point de rewind : uuid du message précédant le message utilisateur `text`
 *  (null = début de session ; found=false si introuvable). */
export async function findRevertPoint(sessionId, cwd, text) {
  const msgs = await getSessionMessages(sessionId, cwd ? { dir: cwd } : undefined);
  let target = -1;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].type === "user" && userText(msgs[i].message).trim() === text.trim()) {
      target = i;
      break;
    }
  }
  if (target < 0) return { found: false };
  for (let j = target - 1; j >= 0; j--) {
    if (msgs[j].uuid) return { found: true, uuid: msgs[j].uuid };
  }
  return { found: true, uuid: null };
}

/** Transforme les messages persistés d'une session en events d'affichage.
 *  Fonction pure (sans I/O) pour rester testable. */
export function eventsFromSessionMessages(msgs) {
  const events = [];
  for (const m of msgs) {
    const msg = m.message;
    if (!msg) continue;
    if (m.type === "user") {
      const content = msg.content;
      let text = "";
      if (typeof content === "string") text = content;
      else if (Array.isArray(content)) {
        // ignorer les tool_results ; ne garder que le texte tapé par l'utilisateur
        text = content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n");
      }
      text = stripAtelierToolInstructions(stripHandoff(text.trim()));
      // filtrer uniquement les injections systèmes connues (garder « <div>… » légitime)
      if (text && !SYSTEM_TAG.test(text)) {
        events.push({ kind: "user", text });
      }
    }
    if (m.type === "assistant" && Array.isArray(msg.content)) {
      for (const b of msg.content) {
        if (b.type === "text" && b.text?.trim()) events.push({ kind: "text", text: b.text });
        if (b.type === "tool_use")
          events.push({ kind: "tool", name: b.name, detail: toolDetail(b.name, b.input) });
      }
    }
  }
  return events;
}

/** Cherche `<sessionId>.jsonl` parmi tous les sous-dossiers de `baseDir`
 *  (existence du nom de fichier seulement — aucune lecture de contenu, cf.
 *  perf). Repli utilisé quand un thread déplacé vers un autre projet ne
 *  retrouve plus sa session sous le nouveau cwd (le fichier vit toujours sous
 *  le slug de l'ANCIEN projectRoot). `baseDir` injectable pour les tests
 *  (mkdtemp) ; par défaut `~/.claude/projects`. */
export function findClaudeSessionDir(sessionId, baseDir = DEFAULT_CLAUDE_PROJECTS_DIR()) {
  let entries;
  try {
    entries = readdirSync(baseDir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(baseDir, entry.name);
    if (existsSync(join(dir, `${sessionId}.jsonl`))) return dir;
  }
  return null;
}

/** Reconstruit les events d'affichage depuis une session Claude persistée.
 *  Chemin direct d'abord (rapide, cas nominal) ; si introuvable sous `cwd` ET
 *  qu'une trace existe ailleurs (thread déplacé), repli sur la recherche
 *  globale native du SDK (sans `dir` — cf. getSessionMessages, qui scanne
 *  alors tous les projets connus par nom de fichier). */
export async function claudeHistory(sessionId, cwd, opts = {}) {
  let msgs = await getSessionMessages(sessionId, cwd ? { dir: cwd } : undefined);
  if ((!msgs || msgs.length === 0) && cwd && findClaudeSessionDir(sessionId, opts.baseDir)) {
    msgs = await getSessionMessages(sessionId);
  }
  return eventsFromSessionMessages(msgs ?? []);
}
