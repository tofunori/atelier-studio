(function(){
  /* Jeton hors projet (Atelier Studio) : si l'app a ouvert cette page avec
     #atelier_token=… (fragment — jamais la query de navigation, plan 062
     étape 5), le propager à toutes les requêtes same-origin de la page —
     y compris celles de diff_versions.js. Sans jeton : comportement inchangé. */
  var tok: string = null;
  window.__tokq = ""; /* suffixe "&token=…" pour les URLs hors fetch (pdf.js) */
  try{ var m = (location.hash||"").match(/atelier_token=([^&]+)/); tok = m ? decodeURIComponent(m[1]) : null; }catch(e){}
  if(!tok) return;
  window.__tokq = "&token=" + encodeURIComponent(tok);
  var orig = window.fetch.bind(window);
  window.fetch = function(input, init){
    try{
      var u = new URL(typeof input === "string" ? input : (input as Request).url, location.href);
      if(u.origin === location.origin && !u.searchParams.has("token")){
        u.searchParams.set("token", tok);
        input = (typeof input === "string") ? (u.pathname + u.search) : new Request(u, input as Request);
      }
    }catch(e){}
    return orig(input, init);
  };
})();