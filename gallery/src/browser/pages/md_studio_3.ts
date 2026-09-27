
const path = new URLSearchParams(location.search).get("path");
document.title = (path || "").split("/").pop() || "md studio";
const stateEl = document.getElementById("state");
let diskMtime = 0, dirty = false, editor = null, loading = true, selectionActions = null;

function setState(cls: string, txt: string){ stateEl.className = cls; stateEl.textContent = txt; }

fetch("/code?path=" + encodeURIComponent(path)).then(async r => {
  const j = await r.json().catch(() => ({}));
  // erreur serveur (404 hors racine / fichier absent…) : l'afficher au lieu d'un éditeur vide muet
  if(!r.ok || typeof j.text !== "string"){
    setState("dirty", "erreur");
    const esc = s => String(s).replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
    document.getElementById("ed").innerHTML = '<div style="padding:24px;color:var(--muted,#9aa3af);font:13px/1.6 -apple-system,sans-serif">' +
      'Impossible de charger <b>' + esc(path || "(aucun chemin)") + '</b><br>' +
      esc(j.error || ("HTTP " + r.status)) + '</div>';
    return;
  }
  diskMtime = j.mtime;
  editor = new toastui.Editor({
    el: document.getElementById("ed"),
    initialValue: j.text,
    initialEditType: "wysiwyg",
    previewStyle: "tab",
    height: "100%",
    theme: "dark",
    usageStatistics: false,
    hideModeSwitch: false,
    toolbarItems: [
      ["heading", "bold", "italic", "strike"],
      ["hr", "quote"],
      ["ul", "ol", "task"],
      ["table", "link", "image", "code", "codeblock"],
      // dernier groupe = état + ⌘S, poussé à droite (voir CSS :has(#mdTools))
      [{ name: "mdTools", el: document.getElementById("mdTools") }],
    ],
  });
  editor.on("change", () => {
    if(loading) return;
    dirty = true; setState("dirty", "modifié");
    if(selectionActions) selectionActions.refresh();
  });
  if(window.self !== window.top){
    selectionActions = AtelierStudioMarkdown.createMarkdownWysiwygSelection({
      path,
      getMarkdown: () => editor ? editor.getMarkdown() : "",
    });
  }
  setTimeout(() => { loading = false; }, 300);
  setState("", "");
  document.getElementById("mdTools").classList.add("mounted");
});

async function save(){
  if(!editor) return;
  const r = await fetch("/codesave", {method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({path, text: editor.getMarkdown(), mtime: diskMtime})});
  const j = await r.json();
  if(j.error === "conflit"){ setState("dirty", "conflit disque — re-⌘S pour écraser"); diskMtime = j.mtime; return; }
  diskMtime = j.mtime; dirty = false; setState("", "sauvegardé " + new Date().toLocaleTimeString());
}
(document.getElementById("save") as HTMLButtonElement).onclick = save;
document.addEventListener("keydown", (e) => {
  if((e.metaKey || e.ctrlKey) && e.key === "s"){ e.preventDefault(); save(); }
});

// reload auto si Claude modifie le fichier sur disque (buffer propre seulement)
setInterval(async () => {
  try{
    const j = await (await fetch("/code?path=" + encodeURIComponent(path) + "&statonly=1")).json();
    if(j.mtime && Math.abs(j.mtime - diskMtime) > 0.001){
      if(dirty){ setState("dirty", "le fichier a changé sur disque (Claude ?)"); return; }
      const full = await (await fetch("/code?path=" + encodeURIComponent(path))).json();
      loading = true;
      diskMtime = full.mtime;
      editor.setMarkdown(full.text, false);
      if(selectionActions) selectionActions.refresh();
      setTimeout(() => { loading = false; }, 300);
      setState("", "rechargé (modifié sur disque)");
    }
  }catch(e){}
}, 2000);
