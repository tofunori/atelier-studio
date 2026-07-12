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
})();
