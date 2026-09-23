import type { Thread } from "./ws";
import type { HighlightEntry } from "../components/Rail";
import { t } from "./i18n";
import { projectDisplayName } from "./projectStorage";

const MARKS_MIGRATED_KEY = "atelier-studio.marksMigrated";
const MARKS_PREFIX = "atelier-studio.marks.";

// migration one-shot (lot 2) : les marks locaux posés avant la fiche durable
// (localStorage, rendu in-chat §3) deviennent des fiches sidecar. Les clés
// locales restent intactes — le rendu in-chat en dépend toujours — seul un
// flag localStorage borne la migration à une fois par machine.
export function migrateLocalMarks(threadList: Thread[], send: (msg: unknown) => void) {
  if (localStorage.getItem(MARKS_MIGRATED_KEY)) return;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(MARKS_PREFIX)) continue;
    const threadId = key.slice(MARKS_PREFIX.length);
    let marks: { text?: string; kind?: string }[] = [];
    try {
      marks = JSON.parse(localStorage.getItem(key) ?? "[]");
    } catch {
      continue;
    }
    if (!Array.isArray(marks)) continue;
    const th = threadList.find((t) => t.id === threadId);
    for (const m of marks) {
      if (!m?.text?.trim() || (m.kind !== "hl" && m.kind !== "ul")) continue;
      send({
        type: "addHighlight",
        highlight: {
          text: m.text,
          context: "", // contexte introuvable pour les marks migrés (spec §1)
          kind: m.kind,
          projectRoot: th?.projectRoot ?? "",
          projectName: th?.projectRoot ? projectDisplayName(th.projectRoot) : "",
          threadId,
          threadTitle: th?.title ?? "",
          provider: th?.provider ?? "",
        },
      });
    }
  }
  localStorage.setItem(MARKS_MIGRATED_KEY, "1");
}

// date relative sobre pour le pied des fiches Surlignés (mêmes clés i18n que
// le "il y a …" des threads dans Sidebar.tsx — dupliqué ici pour rester dans
// le scope App.tsx sans créer de dépendance croisée nouvelle)
export function hlRelativeDate(value: string): string {
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return "";
  const diff = Date.now() - ts;
  if (diff < 60_000) return t("time.just-now");
  const min = Math.floor(diff / 60_000);
  if (min < 60) return t("time.minutes-ago", { count: min });
  const hours = Math.floor(min / 60);
  if (hours < 24) return t("time.hours-ago", { count: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t("time.yesterday");
  if (days < 7) return `${days} j`;
  return new Date(ts).toLocaleDateString([], { day: "2-digit", month: "2-digit" });
}

// export .md groupé par projet puis chat (spec §6) — passage en citation,
// contexte en italique s'il a été photographié
export function buildHighlightsMarkdown(list: HighlightEntry[]): string {
  const byProject = new Map<string, Map<string, HighlightEntry[]>>();
  for (const h of list) {
    const projKey = h.projectName || h.projectRoot || t("highlights.no-project");
    const chatKey = h.threadTitle || h.threadId || "";
    if (!byProject.has(projKey)) byProject.set(projKey, new Map());
    const chats = byProject.get(projKey)!;
    if (!chats.has(chatKey)) chats.set(chatKey, []);
    chats.get(chatKey)!.push(h);
  }
  const lines: string[] = [];
  for (const [proj, chats] of byProject) {
    lines.push(`## ${proj}`, "");
    for (const [chatTitle, items] of chats) {
      const date = items[0]?.createdAt ? new Date(items[0].createdAt).toLocaleDateString() : "";
      lines.push(`### ${chatTitle || "—"}${date ? ` — ${date}` : ""}`, "");
      for (const h of items) {
        lines.push(`> ${h.text.split("\n").join("\n> ")}`);
        if (h.context) lines.push("", `*${h.context}*`);
        lines.push("");
      }
    }
  }
  return lines.join("\n").trim() + "\n";
}
