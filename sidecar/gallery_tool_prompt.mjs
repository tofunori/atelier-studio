export function withGalleryToolInstruction(prompt, { projectRoot, toolPath }) {
  if (!projectRoot || !toolPath) return String(prompt ?? "");
  return `${String(prompt ?? "")}\n\n<atelier-gallery-integration>\nWhen the user explicitly asks to control the Atelier Gallery, resolve exact project-relative paths and call the terminal tool exactly once. Supported forms:\n${JSON.stringify(toolPath)} show --project-root ${JSON.stringify(projectRoot)} -- <file> [more-files...]\n${JSON.stringify(toolPath)} open --project-root ${JSON.stringify(projectRoot)} -- <file>\n${JSON.stringify(toolPath)} compare --project-root ${JSON.stringify(projectRoot)} -- <file> <file> [more-files...]\n${JSON.stringify(toolPath)} reset --project-root ${JSON.stringify(projectRoot)}\nUse show to display only requested files, open for the viewer/lightbox, compare for the comparison surface, and reset for the full gallery. Do not merely list paths. Use only files inside the active project. Do not call this command when files are only discussed, edited, or summarized.\n</atelier-gallery-integration>`;
}

export function stripGalleryToolInstruction(prompt) {
  return String(prompt ?? "")
    .replace(/\n*<atelier-gallery-integration\b[^>]*>[\s\S]*?<\/atelier-gallery-integration>\s*/gi, "")
    .trimEnd();
}
