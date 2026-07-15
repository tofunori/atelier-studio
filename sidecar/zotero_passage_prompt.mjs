const BLOCK = /\n*<atelier-zotero-passages\b[^>]*>[\s\S]*?<\/atelier-zotero-passages>\s*/gi;

export function withZoteroPassageInstruction(prompt, { toolPath }) {
  if (!toolPath) return String(prompt ?? "");
  return `${String(prompt ?? "")}\n\n<atelier-zotero-passages>\nWhen the user asks for important or relevant passages from an attached Zotero article, use the exact PDF metadata inside <zotero-reference> and call the terminal tool exactly once:\n${JSON.stringify(toolPath)} search --pdf <absolute-pdf-path> --zotero-key <zotero-key> --pdf-key <pdf-key> --pdf-file <pdf-file> --query <user-question> --limit 5\nRead its JSON stdout. For every passage you cite, reproduce its markdownLink exactly so the user can open the PDF at that page with automatic highlighting. The displayed verbatim excerpt immediately associated with that link MUST be exactly the result's quote field: do not shorten, translate, normalize, or replace it with another sentence from context. You may explain it separately. Never invent a passage or link. If the article has no attached local PDF metadata, ask the user to attach it from Zotero. Do not call this tool for ordinary bibliography or metadata questions.\n</atelier-zotero-passages>`;
}

export function stripZoteroPassageInstruction(prompt) {
  return String(prompt ?? "").replace(BLOCK, "").trimEnd();
}
