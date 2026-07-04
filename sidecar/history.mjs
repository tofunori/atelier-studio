import { getSessionMessages } from "@anthropic-ai/claude-agent-sdk";

/** Reconstruit les events d'affichage depuis une session Claude persistée. */
export async function claudeHistory(sessionId, cwd) {
  const msgs = await getSessionMessages(sessionId, cwd ? { dir: cwd } : undefined);
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
      text = text.trim();
      // filtrer les injections systèmes (reminders, etc.)
      if (text && !text.startsWith("<")) {
        events.push({ kind: "text", text: `**Toi :** ${text}` });
      }
    }
    if (m.type === "assistant" && Array.isArray(msg.content)) {
      for (const b of msg.content) {
        if (b.type === "text" && b.text?.trim()) events.push({ kind: "text", text: b.text });
        if (b.type === "tool_use") events.push({ kind: "tool", name: b.name });
      }
    }
  }
  return events;
}
