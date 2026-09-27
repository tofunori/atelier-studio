(function(){
  try{ var m=(location.hash||'').match(/atelier_nonce=([\w-]+)/); if(m){ sessionStorage.setItem('atelier_nonce', m[1]); window.__atelierNonce = m[1]; } }catch(e){}
  /* nonce IPC : inclus dans chaque message vers l'app hôte ; l'app rejette sans lui */
  window.__atelierPost = function(p){
    try{ p = Object.assign({}, p, {nonce: (window.__atelierNonce || sessionStorage.getItem('atelier_nonce') || '')}); }catch(e){}
    try{ window.top.postMessage(p, '*'); }catch(e){}
  };
})();