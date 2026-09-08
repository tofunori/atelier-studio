(function () {
  "use strict";

  var nonce = "";
  try {
    var match = (location.hash || "").match(/atelier_nonce=([\w-]+)/);
    nonce = match ? match[1] : (sessionStorage.getItem("atelier_nonce") || "");
    if (nonce) sessionStorage.setItem("atelier_nonce", nonce);
  } catch (_) {}
  // le sessionStorage des iframes cross-origin peut être purgé par WKWebView
  // (pression mémoire, onglets cachés) → les postMessage vers l'app partaient
  // sans nonce et étaient rejetés en silence (« Add to chat » mort jusqu'au
  // reload). La variable de page est la source primaire ; le parent ré-essaime.
  if (nonce) window.__atelierNonce = nonce;

  // Un clic dans une iframe ne remonte pas au workspace. Signaler sa prise
  // de focus pour que le menu de panneau vise toujours le document utilisé.
  function notifyPaneFocus() {
    if (window.parent === window) return;
    try { window.parent.postMessage({ type: "atelier-pane-focus", nonce: nonce }, "*"); } catch (_) {}
  }
  document.addEventListener("pointerdown", notifyPaneFocus, true);
  document.addEventListener("focusin", notifyPaneFocus, true);
  window.addEventListener("focus", notifyPaneFocus);
  window.addEventListener("message", function (event) {
    if (event.origin !== location.origin || event.data?.type !== "atelier-pane-focus") return;
    // Un PDF imbriqué transmet à travers son document hôte. Ne relayer que
    // les enfants réels, jamais un message arbitraire d'une autre fenêtre.
    for (var i = 0; i < window.frames.length; i++) {
      if (event.source === window.frames[i]) { notifyPaneFocus(); return; }
    }
  });

  // The message carries the canonical roles. These assignments are only the
  // compatibility bridge for legacy viewers; they are deliberately one-way so
  // an old `--card` declaration cannot become a second theme source of truth.
  var LEGACY = {
    "--surface-app": "--bg",
    "--surface-panel": "--bg",
    "--surface-raised": "--card",
    "--surface-inset": "--card2",
    "--surface-header": "--bar",
    "--text-primary": "--txt",
    "--text-secondary": "--fg",
    "--text-muted": "--muted",
    "--text-tertiary": "--muted",
    "--text-disabled": "--faint",
    "--border-subtle": "--border",
    "--border-interactive": "--border-strong",
    "--accent-base": "--accent"
  };

  // Standalone documents keep their small historical palettes in their own
  // stylesheets. The bridge fills only semantic aliases, using those palette
  // fields when present and a dark Atelier value when a viewer has none.
  var CONTRACT_FALLBACKS = {
    "--surface-app": "var(--bg, #1e2124)",
    "--surface-panel": "var(--bg, #1e2124)",
    "--surface-header": "var(--bar, var(--bg, #1e2124))",
    "--surface-canvas": "var(--bg, #1e2124)",
    "--surface-raised": "var(--card, var(--bg-pop, #24282d))",
    "--surface-inset": "var(--card2, var(--bg-ctl, #2c2f34))",
    "--surface-overlay": "var(--card, var(--bg-pop, #24282d))",
    "--surface-hover": "color-mix(in srgb, var(--txt, #dadee3) 6%, transparent)",
    "--scrim": "rgba(0,0,0,.25)",
    "--text-primary": "var(--txt, var(--fg, #dadee3))",
    "--text-secondary": "var(--fg, var(--muted, #b9bec4))",
    "--text-muted": "var(--muted, #90969d)",
    "--text-tertiary": "var(--muted, #90969d)",
    "--text-disabled": "var(--faint, var(--muted2, #62666c))",
    "--text-on-accent": "var(--text-inverse, #1a1408)",
    "--border-subtle": "var(--border, #2a2d31)",
    "--border-default": "var(--border-strong, var(--border, #43474c))",
    "--border-strong": "var(--border2, var(--border, #43474c))",
    "--border-interactive": "var(--border-strong, var(--border, #43474c))",
    "--accent-base": "var(--accent, #e77f3e)",
    "--status-success": "var(--u-ok, #98c379)",
    "--status-warning": "var(--u-warn, #e0b74a)",
    "--status-error": "var(--u-hot, #e06c75)",
    "--status-running": "var(--accent, #e77f3e)",
    "--status-info": "var(--accent, #e77f3e)",
    "--radius-control": "var(--r-s, 6px)",
    "--radius-surface": "var(--r-m, 10px)",
    "--control-height": "30px",
    "--control-height-compact": "26px",
    "--surface-header-height": "44px",
    "--elev": "0 4px 18px rgba(0,0,0,.28), 0 1px 4px rgba(0,0,0,.18)",
    "--elev-soft": "0 2px 10px rgba(0,0,0,.14), 0 1px 3px rgba(0,0,0,.10)",
    "--elevation-overlay": "var(--elev, 0 4px 18px rgba(0,0,0,.28), 0 1px 4px rgba(0,0,0,.18))",
    "--focus-ring-color": "var(--accent, #e77f3e)",
    "--focus-ring-width": "1px",
    "--focus-ring-offset": "1px",
    "--motion-fast": "120ms",
    "--motion-standard": "140ms",
    "--motion-panel": "150ms",
    "--ease-out": "cubic-bezier(0.16, 1, 0.3, 1)",
    "--z-sticky": "30",
    "--z-popover": "120",
    "--z-modal": "200",
    "--z-toast": "260",
    "--ui-font": "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    "--code-font": "ui-monospace, SFMono-Regular, Menlo, monospace",
    "--font-chrome": "var(--ui-font)",
    "--font-code": "var(--code-font)"
  };

  function ensureThemeContract(root) {
    Object.keys(CONTRACT_FALLBACKS).forEach(function (name) {
      if (!root.style.getPropertyValue(name).trim()) {
        root.style.setProperty(name, CONTRACT_FALLBACKS[name]);
      }
    });
  }

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
    "--primary-foreground": "var(--text-on-accent, var(--surface-app, var(--bg)))",
    "--secondary": "var(--surface-inset, var(--card2))",
    "--secondary-foreground": "var(--text-secondary, var(--fg, var(--txt)))",
    "--muted-foreground": "var(--text-tertiary, var(--muted))",
    "--accent-foreground": "var(--text-primary, var(--txt))",
    "--destructive": "var(--status-error, #ff7b7b)",
    "--input": "var(--border-interactive, var(--border-strong))",
    "--ring": "var(--accent-base, var(--accent))"
  };

  function applyShadcnAliases(root) {
    ensureThemeContract(root);
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
    if (vars["--ui-base-size"]) root.style.fontSize = vars["--ui-base-size"];
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
    var data = event.data;
    // réadoption : un message du parent (source de vérité) porte le nonce —
    // une page qui a perdu le sien (purge sessionStorage) redevient fonctionnelle
    if (data && typeof data.nonce === "string" && data.nonce && !nonce) {
      nonce = data.nonce;
      window.__atelierNonce = nonce;
      try { sessionStorage.setItem("atelier_nonce", nonce); } catch (_) {}
    }
    applyTheme(data);
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
