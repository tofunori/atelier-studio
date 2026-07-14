(function installAtelierGalleryCommands(root) {
  "use strict";

  const MAX_RELS = 100;
  const MAX_REL_LENGTH = 2048;
  const MAX_REQUEST_ID_LENGTH = 128;
  const MODES = Object.freeze({ show: "focus", open: "viewer", compare: "selection", reset: "all" });

  function fail(action, projectRoot, requestId, error) {
    return {
      ok: false,
      action: MODES[action] ? action : "show",
      projectRoot: typeof projectRoot === "string" ? projectRoot : "",
      requestId: typeof requestId === "string" ? requestId : "",
      applied: false,
      error,
    };
  }

  function normalizeRel(value) {
    if (typeof value !== "string") return null;
    const rel = value.trim().replace(/^\.\/+/, "");
    if (
      !rel || rel.length > MAX_REL_LENGTH || rel.startsWith("/") || rel.includes("\0") ||
      rel.split("/").some((part) => part === "..")
    ) return null;
    return rel;
  }

  function execute(message, knownRels, adapter) {
    const projectRoot = adapter && typeof adapter.projectRoot === "string" ? adapter.projectRoot : "";
    const action = message && typeof message.action === "string" ? message.action : "show";
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      return fail(action, projectRoot, "", "invalid-payload");
    }
    const allowed = new Set(["type", "nonce", "action", "mode", "projectRoot", "requestId", "rels"]);
    if (Object.keys(message).some((key) => !allowed.has(key))) {
      return fail(action, projectRoot, message.requestId, "unexpected-key");
    }
    if (message.type !== "atelier-gallery-command" || !MODES[action]) {
      return fail(action, projectRoot, message.requestId, "unsupported-command");
    }
    if (message.mode !== MODES[action]) {
      return fail(action, projectRoot, message.requestId, "unsupported-mode");
    }
    if (!projectRoot || message.projectRoot !== projectRoot) {
      return fail(action, projectRoot, message.requestId, "project-mismatch");
    }
    if (
      typeof message.requestId !== "string" ||
      !message.requestId.length ||
      message.requestId.length > MAX_REQUEST_ID_LENGTH
    ) {
      return fail(action, projectRoot, message.requestId, "invalid-request-id");
    }
    if (!Array.isArray(message.rels) || message.rels.length > MAX_RELS) {
      return fail(action, projectRoot, message.requestId, "invalid-rels");
    }
    if (action === "reset" && message.rels.length !== 0) return fail(action, projectRoot, message.requestId, "invalid-rels");
    if (action === "show" && message.rels.length < 1) return fail(action, projectRoot, message.requestId, "invalid-rels");
    if (action === "open" && message.rels.length !== 1) return fail(action, projectRoot, message.requestId, "invalid-rels");
    if (action === "compare" && message.rels.length < 2) return fail(action, projectRoot, message.requestId, "invalid-rels");

    const requested = [];
    const seen = new Set();
    for (const value of message.rels) {
      const rel = normalizeRel(value);
      if (!rel) return fail(action, projectRoot, message.requestId, "invalid-rel");
      if (!seen.has(rel)) { seen.add(rel); requested.push(rel); }
    }
    if (action === "compare" && requested.length < 2) return fail(action, projectRoot, message.requestId, "invalid-rels");

    const known = new Set(Array.isArray(knownRels) ? knownRels : []);
    const matched = requested.filter((rel) => known.has(rel));
    const missing = requested.filter((rel) => !known.has(rel));
    let applied = false;
    if (action === "reset") {
      if (adapter && typeof adapter.reset === "function") { adapter.reset(); applied = true; }
    } else if (action === "show" && matched.length) {
      if (adapter && typeof adapter.show === "function") { adapter.show(matched); applied = true; }
    } else if (action === "open" && matched.length === 1) {
      if (adapter && typeof adapter.open === "function") { adapter.open(matched[0]); applied = true; }
    } else if (action === "compare" && matched.length >= 2) {
      if (adapter && typeof adapter.compare === "function") { adapter.compare(matched); applied = true; }
    }

    return { ok: true, action, projectRoot, requestId: message.requestId, matched, missing, applied };
  }

  root.AtelierGalleryCommands = Object.freeze({ execute });
})(typeof window === "object" ? window : globalThis);
