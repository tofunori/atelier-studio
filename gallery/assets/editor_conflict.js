(function () {
  "use strict";

  function create(options) {
    options = options || {};
    const anchor = options.anchor || document.querySelector("header");
    if (!anchor) throw new Error("AtelierConflictGuard: anchor missing");

    if (!document.getElementById("atelier-conflict-style")) {
      const style = document.createElement("style");
      style.id = "atelier-conflict-style";
      style.textContent = `
        .atelier-conflict[hidden]{display:none!important}
        .atelier-conflict{box-sizing:border-box;display:flex;align-items:center;gap:14px;
          flex:0 0 auto;padding:10px 14px;
          background:var(--surface-panel,var(--card,#1a1d22));
          border-bottom:1px solid var(--border-subtle,var(--border,#333a45));
          color:var(--text-primary,var(--txt,#dbdfe5));
          font:12px/1.35 var(--ui-font,-apple-system,BlinkMacSystemFont,sans-serif);
          box-shadow:0 5px 18px rgba(0,0,0,.22);z-index:120}
        .atelier-conflict-copy{min-width:180px;flex:1}
        .atelier-conflict-title{font-weight:700;color:var(--text-primary,var(--txt,#dbdfe5));margin-bottom:2px}
        .atelier-conflict-detail{color:var(--text-muted,var(--muted,#868d9a))}
        .atelier-conflict-actions{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap}
        .atelier-conflict button{border:1px solid var(--border-subtle,var(--border,#333a45));border-radius:var(--radius-control,4px);
          background:transparent;color:var(--text-muted,var(--muted,#868d9a));
          padding:6px 10px;font:600 11px/1 var(--ui-font,-apple-system,BlinkMacSystemFont,sans-serif);cursor:pointer}
        .atelier-conflict button:hover{border-color:var(--border-default,var(--border-strong,#3f4652));
          background:var(--surface-inset,var(--border,#333a45));color:var(--text-primary,var(--txt,#dbdfe5))}
        .atelier-conflict button:focus-visible{outline:2px solid var(--text-muted,var(--muted,#868d9a));outline-offset:2px}
        .atelier-conflict button:disabled{opacity:.55;cursor:progress}
        .atelier-conflict .atelier-conflict-reload{background:var(--surface-inset,var(--border,#333a45));
          border-color:var(--border-default,var(--border-strong,#3f4652));color:var(--text-primary,var(--txt,#dbdfe5))}
        .atelier-conflict .atelier-conflict-overwrite.armed{background:#8f302b;border-color:#d96960;color:#fff}
        @media(max-width:760px){.atelier-conflict{align-items:flex-start;flex-direction:column;gap:8px}
          .atelier-conflict-actions{justify-content:flex-start}}
      `;
      document.head.appendChild(style);
    }

    const root = document.createElement("section");
    root.className = "atelier-conflict";
    root.hidden = true;
    root.tabIndex = -1;
    root.setAttribute("role", "alert");
    root.setAttribute("aria-live", "assertive");
    root.innerHTML = `
      <div class="atelier-conflict-copy">
        <div class="atelier-conflict-title">Conflit avec le fichier sur disque</div>
        <div class="atelier-conflict-detail">L'agent et l'éditeur ont modifié la même zone. La sauvegarde est bloquée jusqu'à ton choix.</div>
      </div>
      <div class="atelier-conflict-actions">
        <button type="button" data-conflict-action="compare">Comparer</button>
        <button type="button" class="atelier-conflict-reload" data-conflict-action="reload">Recharger le disque</button>
        <button type="button" class="atelier-conflict-overwrite" data-conflict-action="overwrite">Écraser le disque…</button>
      </div>`;
    anchor.insertAdjacentElement("afterend", root);

    const detail = root.querySelector(".atelier-conflict-detail");
    const compare = root.querySelector('[data-conflict-action="compare"]');
    const reload = root.querySelector('[data-conflict-action="reload"]');
    const overwrite = root.querySelector('[data-conflict-action="overwrite"]');
    const buttons = [compare, reload, overwrite];
    let pending = null;
    let armed = false;
    let armTimer = null;
    let busy = false;

    function setBusy(next) {
      busy = Boolean(next);
      buttons.forEach((button) => { button.disabled = busy; });
    }

    function disarm() {
      armed = false;
      clearTimeout(armTimer);
      armTimer = null;
      overwrite.classList.remove("armed");
      overwrite.textContent = "Écraser le disque…";
    }

    function set(snapshot) {
      const mtime = Number(snapshot && snapshot.mtime);
      const text = snapshot && snapshot.text;
      if (!Number.isFinite(mtime) || typeof text !== "string") return false;
      const same = pending && Math.abs(pending.mtime - mtime) <= 0.001 && pending.text === text;
      pending = {mtime, text};
      root.hidden = false;
      if (!same) {
        disarm();
        detail.textContent = "L'agent et l'éditeur ont modifié la même zone. La sauvegarde est bloquée jusqu'à ton choix.";
      }
      if (typeof options.onPending === "function") options.onPending(pending);
      return true;
    }

    function clear() {
      pending = null;
      disarm();
      setBusy(false);
      root.hidden = true;
    }

    function blockSave() {
      if (!pending) return false;
      detail.textContent = "Sauvegarde bloquée : choisis d'abord comment résoudre le conflit.";
      root.focus({preventScroll: false});
      return true;
    }

    compare.addEventListener("click", () => {
      if (!pending || busy) return;
      disarm();
      if (typeof options.onCompare === "function") options.onCompare({...pending});
      detail.textContent = "Comparaison ouverte. Le conflit reste bloqué jusqu'à une résolution explicite.";
    });

    reload.addEventListener("click", async () => {
      if (!pending || busy) return;
      disarm();
      setBusy(true);
      const snapshot = {...pending};
      let ok = false;
      try { ok = !options.onReload || (await options.onReload(snapshot)) !== false; }
      catch (error) {
        detail.textContent = `Rechargement impossible : ${error && error.message ? error.message : error}`;
      }
      finally { setBusy(false); }
      if (ok && pending && Math.abs(pending.mtime - snapshot.mtime) <= 0.001) clear();
    });

    overwrite.addEventListener("click", async () => {
      if (!pending || busy) return;
      if (!armed) {
        armed = true;
        overwrite.classList.add("armed");
        overwrite.textContent = "Confirmer l'écrasement";
        detail.textContent = "Attention : le second clic remplacera la version de l'agent par le texte affiché.";
        armTimer = setTimeout(disarm, 6000);
        return;
      }
      clearTimeout(armTimer);
      armTimer = null;
      setBusy(true);
      const snapshot = {...pending};
      let ok = false;
      try { ok = typeof options.onOverwrite === "function" && (await options.onOverwrite(snapshot)) === true; }
      catch (error) {
        detail.textContent = `Écrasement impossible : ${error && error.message ? error.message : error}`;
      }
      finally { setBusy(false); }
      if (ok && pending && Math.abs(pending.mtime - snapshot.mtime) <= 0.001) clear();
      else if (!ok) disarm();
    });

    return {
      set,
      clear,
      blockSave,
      isPending: () => Boolean(pending),
      pending: () => pending && ({...pending}),
      element: root,
    };
  }

  window.AtelierConflictGuard = {create};
})();
