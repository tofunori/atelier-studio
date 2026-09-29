/* sel_pill.js — pilule de sélection partagée : comportement UNIQUE pour les
   trois hôtes (pdf_viewer.html, latex_studio.html, sel_overlay.js dans les
   rapports HTML). Une seule implémentation de : restyle Studio « Add to chat »
   (embarqué dans l'app), picker de session cible (/claude-targets →
   localStorage claudeTargetV1), envoi /quote direct:true (+ message
   atelier-add-to-chat en mode embarqué), textarea auto-taille, Entrée/Échap.
   L'hôte garde ce qui lui est propre : capture de la sélection, payload
   (rel/page/text), nettoyage à l'annulation, positionnement spécifique.

   API : SelPill.attach({pill, menu, getQuote, onSent?, onCancel?, embedExtras?})
     pill        élément pilule (textarea + .go, et si présents .del/.tgt/.nb)
     menu        élément menu du picker de cible (peut être null : picker inactif)
     getQuote()  → {rel, page, text} ou null (rien à envoyer)
     onSent(j)   après un envoi réussi (nettoyer marques/surlignage hôte)
     onCancel()  après annulation (nettoyer sélection hôte + /selinfo)
     embedExtras(go)  mode embarqué : boutons supplémentaires à côté de .go
   → {send, cancel, hide, placeAt(rect), renewSelection(), ta, go, embedded}
   renewSelection() signale une nouvelle sélection quand l'hôte place la pilule. */
function installSelPillApi() {
  if (window.SelPill) return;

  function ct(){ try{ return JSON.parse(localStorage.getItem("claudeTargetV1") || "null"); }catch(e){ return null; } }
  function esc(s: string){ return String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
  const EMBEDDED = (function(){ try{ return window.self !== window.top; }catch(e){ return true; } })();

  let coreLoading: Promise<typeof AtelierStudioCore>;
  function chatCore(){
    if(window.AtelierStudioCore?.requestChatAttachment) return Promise.resolve(window.AtelierStudioCore);
    // Les rapports HTML chargent la pilule à la demande, sans les bundles éditeur.
    if(!coreLoading) coreLoading = new Promise<typeof AtelierStudioCore>((resolve,reject) => {
      const script = document.createElement("script");
      script.src = "/.fig_thumbs/studio_core.bundle.js";
      const timeout = setTimeout(() => {script.remove(); reject(new Error("Ajout au chat indisponible — réessayer"));},10000);
      script.onload = () => {clearTimeout(timeout); window.AtelierStudioCore?.requestChatAttachment ? resolve(window.AtelierStudioCore) : reject(new Error("Ajout au chat indisponible"));};
      script.onerror = () => {clearTimeout(timeout); reject(new Error("Ajout au chat indisponible"));};
      document.head.appendChild(script);
    }).catch(error => {coreLoading = null; throw error;});
    return coreLoading;
  }

  function attach(opts){
    const pill = opts.pill;
    const ta = pill.querySelector("textarea");
    const go = pill.querySelector(".go");
    let sending = false, selectionVersion = 0, confirmationTimer: ReturnType<typeof setTimeout> | number = 0;
    let goHTML = null;   // rendu « Add to chat » du mode Studio, reposé après ⏳/✓/!
    function goReset(){ if (goHTML) go.innerHTML = goHTML; else go.textContent = "↑"; }

    // Mode Studio : pilule simple « Add to chat » (comme la sélection du chat) —
    // pas de commentaire ni corbeille, le texte part en puce dans le composer.
    if (EMBEDDED){
      ["textarea", ".del", ".tgt", ".nb"].forEach(sel => {
        const el = pill.querySelector(sel); if (el) el.style.display = "none";
      });
      pill.style.cssText += ";background:transparent;border:none;box-shadow:none;padding:0;min-width:0;width:auto";
      go.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" style="vertical-align:-2px"><path d="M14 8c0 3-2.7 5.2-6 5.2-.8 0-1.6-.1-2.3-.4L2.5 14l1-2.6C2.6 10.5 2 9.3 2 8c0-3 2.7-5.2 6-5.2S14 5 14 8z"/></svg>';
      go.style.cssText = "width:34px;min-width:34px;height:34px;border-radius:6px;padding:0;font-size:var(--fs-body, 13px);white-space:nowrap;background:var(--card2,#2c313a);color:var(--txt,#dbdfe5);border:1px solid var(--border-strong,#3a414d);box-shadow:0 6px 18px rgba(0,0,0,0.5);cursor:pointer";
      go.setAttribute("aria-label", "Ajouter au chat");
      go.title = "Ajouter au chat";
      goHTML = go.innerHTML;
      if (opts.embedExtras) opts.embedExtras(go);
    }

    function hide(){ pill.style.display = "none"; }
    function renewSelection(){
      selectionVersion += 1; clearTimeout(confirmationTimer);
      if(!sending){ goReset(); go.title = "Ajouter au chat"; }
    }
    // positionnement générique près d'un rectangle viewport (pdf_viewer,
    // rapports) — latex_studio garde son placement borné à l'éditeur
    function placeAt(rect: { left: number; width: number; bottom: number; top: number; }){
      renewSelection();
      pill.style.display = "flex";
      const w = pill.offsetWidth, h = pill.offsetHeight;
      const x = Math.min(Math.max(8, rect.left + rect.width / 2 - w / 2), innerWidth - w - 8);
      let y = rect.bottom + 10;
      if (y + h > innerHeight - 8) y = rect.top - h - 10;
      pill.style.left = x + "px"; pill.style.top = Math.max(8, y) + "px";
    }
    function cancel(){
      selectionVersion += 1; clearTimeout(confirmationTimer);
      ta.value = ""; hide();
      if (opts.onCancel) opts.onCancel();
    }
    async function send(){
      const q = opts.getQuote && opts.getQuote();
      if (sending || !q || !q.text) return;
      clearTimeout(confirmationTimer);
      const version = selectionVersion;
      const comment = ta.value.trim();
      sending = true; go.disabled = true; go.setAttribute("aria-busy", "true");
      go.textContent = "…"; go.title = "Ajout au chat en cours…";
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(),20000);
      try {
        const response = await fetch("/quote", {method:"POST", signal:controller.signal, headers:{"Content-Type":"application/json"},
          body:JSON.stringify(Object.assign({comment:comment || "",direct:true,target:ct(),embed:EMBEDDED},q))});
        const j = await response.json();
        clearTimeout(timeout);
        if(!response.ok || j.error) throw new Error(j.error || "Impossible d'ajouter la sélection");
        if(EMBEDDED){
          if(!j.message || !window.__atelierPost) throw new Error("Ajout au chat indisponible");
          const core = await chatCore();
          await core.requestChatAttachment({window, postToHost:window.__atelierPost, payload:{type:"atelier-add-to-chat",text:j.message}});
        }
        if(version !== selectionVersion){ goReset(); go.title = "Ajouter au chat"; return; }
        if(opts.onSent) opts.onSent(j);
        go.textContent = "✓"; go.title = "Ajouté au chat";
        confirmationTimer = setTimeout(() => {
          goReset(); go.title = "Ajouter au chat";
          if(version === selectionVersion){ ta.value = ""; hide(); }
        },1200);
      } catch(error) {
        go.textContent = "!"; go.title = error.message || "Ajout non confirmé — réessayer";
      } finally {
        clearTimeout(timeout);
        sending = false; go.disabled = false; go.removeAttribute("aria-busy");
      }
    }
    // Conserver la sélection du document quand on active une commande.
    pill.addEventListener("mousedown", (e) => { if(e.target !== ta) e.preventDefault(); });
    go.onclick = () => send();
    const del = pill.querySelector(".del");
    if (del) del.onclick = (e) => { e.stopPropagation(); cancel(); };
    ta.addEventListener("input", () => { selectionVersion += 1; clearTimeout(confirmationTimer); if(!sending) goReset(); ta.style.height = "20px"; ta.style.height = Math.min(120, ta.scrollHeight) + "px"; });
    ta.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && !e.shiftKey){ e.preventDefault(); send(); }
      else if (e.key === "Escape"){ e.preventDefault(); cancel(); }
    });

    /* ---- picker de session Claude cible (localStorage claudeTargetV1) ---- */
    (function(){
      const tgtBtn = pill.querySelector(".tgt"), menu = opts.menu;
      if (!tgtBtn || !menu) return;
      if (EMBEDDED) tgtBtn.style.display = "none";
      const markTgt = () => tgtBtn.classList.toggle("set", !!ct());
      markTgt();
      menu.addEventListener("mousedown", (e) => e.preventDefault());   // garder la sélection
      tgtBtn.onclick = async (e) => {
        e.stopPropagation();
        const cur = ct();
        let html = '<div class="hd">Envoyer vers</div>'
          + '<div class="it' + (cur ? "" : " on") + '" data-i="-1"><span class="app">auto</span>'
          + '<span class="t">Session du projet (auto)</span></div>';
        try{
          const j = await (await fetch("/claude-targets")).json();
          (j.targets || []).forEach((t, i: string) => {
            const on = cur && cur.app === t.app && cur.id === t.id;
            html += '<div class="it' + (on ? " on" : "") + '" data-i="' + i + '"><span class="app">'
              + esc(t.app) + '</span><span class="t">' + esc(t.title || t.id)
              + (t.inProject ? "" : " — " + esc(String(t.cwd || "").split("/").pop())) + "</span></div>";
          });
          menu.innerHTML = html;
          menu.style.display = "flex";
          const r = tgtBtn.getBoundingClientRect();
          menu.style.left = Math.max(8, Math.min(r.left - 120, innerWidth - menu.offsetWidth - 8)) + "px";
          menu.style.top = Math.max(8, r.top - menu.offsetHeight - 10) + "px";
          menu.querySelectorAll(".it").forEach((it) => {
            it.onclick = (ev) => {
              ev.stopPropagation();
              const i = +it.dataset.i;
              if (i < 0) localStorage.removeItem("claudeTargetV1");
              else localStorage.setItem("claudeTargetV1", JSON.stringify({app: j.targets[i].app, id: j.targets[i].id, title: j.targets[i].title}));
              markTgt(); menu.style.display = "none";
            };
          });
          document.addEventListener("click", function h(){ menu.style.display = "none"; document.removeEventListener("click", h); });
        }catch(err){ console.warn("claude-targets failed", err); }
      };
    })();

    return {send, cancel, hide, placeAt, renewSelection, ta, go, embedded: EMBEDDED};
  }

  const publicApi = {attach, embedded: EMBEDDED, target: ct};
  window.SelPill = publicApi;
  return publicApi;
}
installSelPillApi();
export type SelPillApi = ReturnType<typeof installSelPillApi>;
