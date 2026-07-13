(function () {
  "use strict";

  var nonce = "";
  try {
    var match = (location.hash || "").match(/atelier_nonce=([\w-]+)/);
    nonce = match ? match[1] : (sessionStorage.getItem("atelier_nonce") || "");
    if (nonce) sessionStorage.setItem("atelier_nonce", nonce);
  } catch (_) {}

  var LEGACY = {
    "--surface-app": "--bg",
    "--surface-panel": "--card",
    "--surface-raised": "--card",
    "--surface-inset": "--card2",
    "--surface-header": "--bar",
    "--text-primary": "--txt",
    "--text-secondary": "--fg",
    "--text-tertiary": "--muted",
    "--text-disabled": "--faint",
    "--border-subtle": "--border",
    "--border-interactive": "--border-strong"
  };

  /* Semantic aliases shared with Atelier's shadcn/Base UI primitives. Keep
     the historical --accent untouched because legacy editors still use it as
     a brand color; new gallery UI should consume --primary and --ring. */
  var SHADCN = {
    "--background": "var(--surface-app, var(--bg))",
    "--foreground": "var(--text-primary, var(--txt))",
    "--card-foreground": "var(--text-primary, var(--txt))",
    "--popover": "var(--surface-overlay, var(--surface-raised, var(--card)))",
    "--popover-foreground": "var(--text-primary, var(--txt))",
    "--primary": "var(--accent-base, var(--accent))",
    "--primary-foreground": "var(--surface-app, var(--bg))",
    "--secondary": "var(--surface-inset, var(--card2))",
    "--secondary-foreground": "var(--text-secondary, var(--fg, var(--txt)))",
    "--muted-foreground": "var(--text-tertiary, var(--muted))",
    "--accent-foreground": "var(--text-primary, var(--txt))",
    "--destructive": "var(--status-error, #ff7b7b)",
    "--input": "var(--border-interactive, var(--border-strong))",
    "--ring": "var(--accent-base, var(--accent))"
  };

  function applyShadcnAliases(root) {
    Object.keys(SHADCN).forEach(function (name) {
      root.style.setProperty(name, SHADCN[name]);
    });
    root.dataset.shadcnContract = "gallery-v1";
  }

  function applyTheme(message) {
    if (!message || message.type !== "atelier-theme") return;
    if (message.nonce && nonce && message.nonce !== nonce) return;
    var vars = message.vars || {};
    var root = document.documentElement;
    Object.keys(vars).forEach(function (name) {
      if (/^--[a-z0-9-]+$/i.test(name) && typeof vars[name] === "string") {
        root.style.setProperty(name, vars[name]);
      }
    });
    Object.keys(LEGACY).forEach(function (semantic) {
      if (vars[semantic]) root.style.setProperty(LEGACY[semantic], vars[semantic]);
    });
    applyShadcnAliases(root);
    root.dataset.atelierTheme = String(message.version || 1);
    root.style.colorScheme = message.colorScheme === "light" ? "light" : "dark";
    window.__atelierTheme = message;
    window.dispatchEvent(new CustomEvent("atelier-theme-applied", { detail: message }));
    for (var i = 0; i < window.frames.length; i++) {
      try { window.frames[i].postMessage(message, location.origin); } catch (_) {}
    }
  }

  window.addEventListener("message", function (event) {
    if (event.source !== window.top && event.source !== window.parent) return;
    applyTheme(event.data);
  });

  function requestTheme() {
    try { window.top.postMessage({ type: "atelier-theme-request", nonce: nonce }, "*"); } catch (_) {}
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", requestTheme, { once: true });
  } else {
    requestTheme();
  }
  applyShadcnAliases(document.documentElement);
})();
