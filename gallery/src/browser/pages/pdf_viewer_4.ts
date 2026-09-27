
  // Un échec d'import module ne rejette rien tout seul : sans ce filet, main()
  // attendrait indéfiniment et la page resterait blanche.
  setTimeout(function(){ if(!window.pdfjsLib) window.__pdfjsReject(new Error("pdf.js (module) n'a pas pu être chargé")); }, 15000);
