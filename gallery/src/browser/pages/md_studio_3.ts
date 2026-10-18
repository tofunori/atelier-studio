
const path = new URLSearchParams(location.search).get("path");
document.title = (path || "").split("/").pop() || "md studio";
const stateEl = (document.getElementById("state") as HTMLSpanElement);
let diskMtime = 0, dirty = false, editor = null, loading = true, selectionActions: { refresh: () => void; } = null, saving = false, polling = false, localRevision = 0;
/* Version disque sur laquelle le tampon est tapé (base du brouillon de secours). */
let baseText: string = null;

function setState(cls: string, txt: string){ stateEl.className = cls; stateEl.textContent = txt; }

/* Brouillon de secours (audit 2026-10-18, problème 1) : le tampon modifié
   survit au démontage de l'iframe et revient, modifié, à la réouverture ;
   l'état « modifié » est publié à l'app, qui confirme avant de fermer.
   Sans le bundle partagé (chargement raté), l'éditeur reste utilisable,
   simplement sans filet. */
const studioCore = typeof AtelierStudioCore === "undefined" ? null : AtelierStudioCore;
const drafts = studioCore ? studioCore.createDraftKeeper({
  path,
  getText: () => editor ? editor.getMarkdown() : "",
  getBase: () => ({text: baseText, mtime: diskMtime}),
  isDirty: () => dirty,
  postToHost: (payload) => { if(window.__atelierPost) window.__atelierPost(payload); },
}) : {
  noteChange(){}, setDirty(_dirty: boolean){}, announce(){},
  restore: async (_adopt: unknown) => ({outcome: "none" as const, savedAt: null as number | null}),
};
function setDirty(next: boolean){
  if(dirty === next) return;
  dirty = next;
  drafts.setDirty(next);
}

async function loadDocument(){
  const loadState = (document.getElementById("loadState") as HTMLDivElement);
  const message = (document.getElementById("loadMessage") as HTMLDivElement);
  const retry = (document.getElementById("loadRetry") as HTMLButtonElement);
  retry.hidden = true;
  message.textContent = "Chargement…";
  loadState.hidden = false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const r = await fetch("/code?path=" + encodeURIComponent(path), {signal: controller.signal});
    const j = await r.json();
    if(!r.ok || j.error || typeof j.text !== "string" || !Number.isFinite(j.mtime)){
      throw new Error(j.error || ("Réponse invalide (HTTP " + r.status + ")"));
    }
    (document.getElementById("ed") as HTMLDivElement).hidden = false;
    diskMtime = j.mtime;
    baseText = j.text;
    editor = new toastui.Editor({
      el: (document.getElementById("ed") as HTMLDivElement),
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
        [{ name: "mdTools", el: (document.getElementById("mdTools") as HTMLDivElement) }],
      ],
    });
    editor.on("change", () => {
      if(loading) return;
      localRevision += 1; setDirty(true); drafts.noteChange(); setState("dirty", "modifié");
      if(selectionActions) selectionActions.refresh();
    });
    if(window.self !== window.top){
      selectionActions = AtelierStudioMarkdown.createMarkdownWysiwygSelection({
        path,
        getMarkdown: () => editor ? editor.getMarkdown() : "",
      });
    }
    loading = false;
    setState("", "");
    (document.getElementById("mdTools") as HTMLDivElement).classList.add("mounted");
    loadState.hidden = true;
    const restored = await drafts.restore((draft) => {
      const plan = studioCore.planDraftRestore(draft, {text: j.text, mtime: j.mtime});
      if(plan.outcome === "none") return "none";
      loading = true;
      editor.setMarkdown(plan.text, false);
      loading = false;
      baseText = plan.base; diskMtime = plan.baseMtime; localRevision += 1;
      setDirty(true);
      return plan.outcome;
    });
    if(restored.outcome !== "none"){
      const when = studioCore.formatDraftTime(restored.savedAt);
      setState("dirty", "brouillon non enregistré" + (when ? " du " + when : "") + " restauré"
        + (restored.outcome === "conflict" ? " — le fichier a changé depuis, ⌘S signalera le conflit" : " — ⌘S pour l'enregistrer"));
      if(selectionActions) selectionActions.refresh();
    }
  } catch(error) {
    (document.getElementById("ed") as HTMLDivElement).hidden = true;
    message.textContent = "Impossible de charger le document : " + (error.name === "AbortError" ? "délai dépassé" : error.message);
    retry.hidden = false;
  } finally { clearTimeout(timeout); }
}
(document.getElementById("loadRetry") as HTMLButtonElement).onclick = loadDocument;
void loadDocument();

async function save(){
  if(!editor || loading || saving) return;
  const text = editor.getMarkdown();
  const button = (document.getElementById("save") as HTMLButtonElement);
  saving = true; button.disabled = true; button.setAttribute("aria-busy", "true");
  setState("", "sauvegarde…");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const r = await fetch("/codesave", {method:"POST", signal:controller.signal, headers:{"Content-Type":"application/json"},
      body: JSON.stringify({path, text, mtime: diskMtime})});
    const j = await r.json();
    if(j.error === "conflit"){
      if(Number.isFinite(j.mtime)) diskMtime = j.mtime;
      setDirty(true); setState("dirty", "conflit disque — re-⌘S pour écraser"); return;
    }
    if(!r.ok || j.error || !Number.isFinite(j.mtime)) throw new Error(j.error || ("Réponse invalide (HTTP " + r.status + ")"));
    diskMtime = j.mtime; localRevision += 1; baseText = text;
    // Une retouche faite pendant l'écriture n'appartient pas au texte confirmé.
    setDirty(editor.getMarkdown() !== text);
    setState(dirty ? "dirty" : "", dirty ? "modifié" : "sauvegardé " + new Date().toLocaleTimeString());
  } catch(error) {
    setDirty(true);
    setState("dirty", "Échec de la sauvegarde : " + (error.name === "AbortError" ? "délai dépassé — réessayer" : error.message));
  } finally {
    clearTimeout(timeout); saving = false; button.disabled = false; button.removeAttribute("aria-busy");
  }
}
(document.getElementById("save") as HTMLButtonElement).onclick = save;
document.addEventListener("keydown", (e) => {
  if((e.metaKey || e.ctrlKey) && e.key === "s"){ e.preventDefault(); save(); }
});

// Recharge les changements externes seulement tant que le tampon reste propre.
setInterval(async () => {
  if(!editor || loading || saving || polling) return;
  polling = true;
  const revision = localRevision;
  try{
    const j = await (await fetch("/code?path=" + encodeURIComponent(path) + "&statonly=1")).json();
    if(j.mtime && Math.abs(j.mtime - diskMtime) > 0.001){
      if(dirty || saving){ setState("dirty", "le fichier a changé sur disque"); return; }
      const full = await (await fetch("/code?path=" + encodeURIComponent(path))).json();
      if(revision !== localRevision || dirty || saving || typeof full.text !== "string" || !Number.isFinite(full.mtime)) return;
      loading = true;
      diskMtime = full.mtime; baseText = full.text;
      editor.setMarkdown(full.text, false);
      if(selectionActions) selectionActions.refresh();
      loading = false;
      setState("", "rechargé (modifié sur disque)");
    }
  }catch(e){} finally { polling = false; loading = false; }
}, 2000);

