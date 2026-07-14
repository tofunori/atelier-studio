const MODES = Object.freeze({
  show: "focus",
  open: "viewer",
  compare: "selection",
  reset: "all",
});

function validRel(rel) {
  return typeof rel === "string" && rel.length > 0 && rel.length <= 2048 &&
    !rel.startsWith("/") && !rel.includes("\0") && !rel.split("/").includes("..");
}

export function validGalleryCommand(value) {
  const keys = value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [];
  const allowed = new Set(["action", "mode", "projectRoot", "requestId", "rels"]);
  if (!(keys.length === 5 && keys.every((key) => allowed.has(key)))) return false;
  const expectedMode = MODES[value.action];
  if (!expectedMode || value.mode !== expectedMode) return false;
  if (typeof value.projectRoot !== "string" || !value.projectRoot.startsWith("/")) return false;
  if (typeof value.requestId !== "string" || !value.requestId.length || value.requestId.length > 128) return false;
  if (!Array.isArray(value.rels) || value.rels.length > 100 || !value.rels.every(validRel)) return false;
  if (value.action === "reset") return value.rels.length === 0;
  if (value.action === "open") return value.rels.length === 1;
  if (value.action === "compare") return value.rels.length >= 2;
  return value.rels.length >= 1;
}
