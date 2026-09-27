
const file = new URLSearchParams(location.search).get("file") || "";
document.getElementById("fname").textContent = file.split("/").pop();
document.title = file.split("/").pop() || "SVG";
const stage = (document.getElementById("stage") as HTMLDivElement), ov = (document.getElementById("ov") as HTMLDivElement), plot = (document.getElementById("plot") as HTMLDivElement);
const stagewrap = (document.getElementById("stagewrap") as HTMLDivElement);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

let svg: SVGSVGElement = null, hbox: HTMLDivElement = null;
const CONTAINER = /^(figure|axes|matplotlib\.axis|xtick|ytick)_/;   // frames you grab INTO, not themselves
function meaningful(el){
  let g = el && el.closest ? el.closest("[id]") : null;
  while(g && CONTAINER.test(g.id)) g = g.parentElement ? g.parentElement.closest("[id]") : null;
  return g;
}
function rectIn(el: Element){                                      // bbox relative to #stage (so #ov children line up)
  const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect();
  return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
}
function showHover(el){                                   // a silent highlight of what a drag would grab (no text)
  if(!el){ if(hbox){ hbox.remove(); hbox = null; } return; }
  const b = rectIn(el);
  if(!hbox){ hbox = document.createElement("div"); hbox.className = "hbox"; ov.appendChild(hbox); }
  hbox.style.cssText = `left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px`;
}

// ---- always-on element move + a polygon-lasso multi-select ----
let drag = null, dirty = false, lassoMode = false;
let zoom = 1, spaceDown = false, panning = null;         // zoom factor (0.25–8) + space-drag pan state
let addMode = false, editing = false, addCounter = 0;
const lassoBtn = (document.getElementById("lassotoggle") as HTMLButtonElement);
function setLasso(on: boolean){
  lassoMode = on;
  lassoBtn.classList.toggle("on", on);
  document.body.classList.toggle("lasso", on);
  showHover(null); hiliteMoveSet();
  const n = (document.getElementById("msinfo") as HTMLSpanElement);
  if(n && on) n.textContent = "clique des sommets · double-clic / Entrée = fermer";
}
lassoBtn.onclick = () => setLasso(!lassoMode);
function setAdd(on: boolean){
  addMode = on;
  const b = (document.getElementById("addtext") as HTMLButtonElement);
  if(b) b.classList.toggle("on", on);
  document.body.classList.toggle("addmode", on);
  if(on){ if(lassoMode) setLasso(false); clearMoveSet(); }
  showHover(null);
}
function svgPoint(evt, ref){
  const p = svg.createSVGPoint(); p.x = evt.clientX; p.y = evt.clientY;
  return p.matrixTransform((ref || svg).getScreenCTM().inverse());
}
function grabTarget(target, whole){
  // Default: grab the element directly under the cursor. Hold Shift to grab the whole
  // enclosing legend/colorbar/axes block (move a composite legend as one unit).
  if(!target || !target.closest) return null;
  if(whole){
    const block = target.closest('[id^="legend_"], [id^="axes_"]');
    if(block) return block;
  }
  return meaningful(target);
}
let figArea = 0;
function draggable(g: SVGGraphicsElement){
  if(!(g && g.id)) return false;
  // reject the figure background / big outer frame so it can't be grabbed instead of the real elements
  try{ const b = g.getBBox(); if(figArea && b.width * b.height > 0.85 * figArea) return false; }catch(e){}
  return true;
}
let moveSet: SVGGraphicsElement[] = [];
let selBoxEl: HTMLDivElement = null, selHandleEls = [];
let lasso = null, lassoEl: SVGSVGElement = null;
function stagePt(e: { clientX: number; clientY: number; }){ const s = stage.getBoundingClientRect(); return { x: e.clientX - s.left, y: e.clientY - s.top }; }
function hiliteMoveSet(){
  ov.querySelectorAll<HTMLElement>(".movehi").forEach(b => b.remove());
  for(const el of moveSet){
    let b; try{ b = rectIn(el); }catch(err){ continue; }
    const d = document.createElement("div"); d.className = "movehi";
    d.style.cssText = `left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px`;
    ov.appendChild(d);
  }
  const n = (document.getElementById("msinfo") as HTMLSpanElement);
  if(n) n.textContent = moveSet.length ? (moveSet.length + " sélectionnés") : "";
  const cs = (document.getElementById("clearsel") as HTMLButtonElement);
  if(cs) cs.style.display = moveSet.length ? "inline-flex" : "none";
  const ds = (document.getElementById("delsel") as HTMLButtonElement);
  if(ds) ds.style.display = moveSet.length ? "inline-flex" : "none";
  const ss = (document.getElementById("sep-sel") as HTMLSpanElement);
  if(ss) ss.style.display = moveSet.length ? "" : "none";
  if(moveSet.length && !lassoMode && !addMode){ if(!selBoxEl) buildHandles(); positionHandles(); }
  else clearHandles();
  updatePropsPanel();
}
function clearMoveSet(){ moveSet = []; hiliteMoveSet(); }
// ==== contextual edit bar: fill / stroke / stroke-width / opacity / font family+size+style ====
const SHAPE_SEL = "path,rect,circle,ellipse,line,polyline,polygon,text,tspan";
const styledProps = new Map();                              // el -> { prop: value } posed during this session (feeds the v2 sidecar)
const propsPanel = (document.getElementById("ctxbar") as HTMLDivElement);
const propFill = (document.getElementById("p-fill") as HTMLInputElement), propStroke = (document.getElementById("p-stroke") as HTMLInputElement);
const propStrokeW = (document.getElementById("p-strokew") as HTMLInputElement), propOpacity = (document.getElementById("p-opacity") as HTMLInputElement);
const propFontSize = (document.getElementById("p-fontsize") as HTMLInputElement);
const propFontFam = (document.getElementById("p-fontfam") as HTMLSelectElement);
const ctxText = (document.getElementById("ctx-text") as HTMLSpanElement), ctxStroke = (document.getElementById("ctx-stroke") as HTMLSpanElement), lblFill = (document.getElementById("lbl-fill") as HTMLSpanElement);
const propBold = propsPanel.querySelector<HTMLElement>('[data-prop="font-weight"]'), propItal = propsPanel.querySelector<HTMLElement>('[data-prop="font-style"]');
function styleTargets(el){                                  // the shapes/texts a style applies to: the element itself if it's one, else its descendants
  return (el.matches && el.matches(SHAPE_SEL)) ? [el] : Array.from(el.querySelectorAll(SHAPE_SEL));
}
function collectStyleEls(prop: string|string[]){                             // union of targets across the whole selection (font-size → text/tspan only)
  const out = [];
  for(const el of moveSet){
    for(const t of styleTargets(el)){
      if(prop.indexOf("font-") === 0 && !(t.matches && t.matches("text,tspan"))) continue;   // font props only make sense on text
      if(out.indexOf(t) < 0) out.push(t);
    }
  }
  return out;
}
function selHasText(){ return moveSet.some(el => (el.matches && el.matches("text,tspan")) || (el.querySelector && el.querySelector("text,tspan"))); }
function selHasShape(){ return moveSet.some(el => styleTargets(el).some(t => !(t.matches && t.matches("text,tspan")))); }
function styleSnap(els){ return els.map((el) => ({ el, style: el.getAttribute("style") })); }   // full inline-style attribute, restored verbatim
function styleRestore(it){ if(it.style === null) it.el.removeAttribute("style"); else it.el.setAttribute("style", it.style); }
function markStyled(el, prop: string|number, val){
  el.style.setProperty(prop, val);                         // inline priority wins over matplotlib's own style attribute
  el.setAttribute("data-styled", "1");
  let m = styledProps.get(el); if(!m){ m = {}; styledProps.set(el, m); } m[prop] = val;
}
function commitStyle(prop: string, val: string){                            // one gesture = one history entry (color / number / × buttons)
  const els = collectStyleEls(prop);
  if(!els.length) return;
  const before = styleSnap(els);
  for(const el of els) markStyled(el, prop, val);
  pushUndo({ type: "style", items: before, after: styleSnap(els) });
  setDirty(true); fillPropsPanel();
  if(editing){                                              // live WYSIWYG: the inline editor follows font changes made while typing
    const inp = document.getElementById("txtedit-input"), t = firstTextEl();
    if(inp && t) applyEditFont(inp, t);
  }
}
let rangeGesture = null;                                    // coalesce a slider drag into a single 'style' entry (input = live preview, change = commit)
function rangeLive(prop: string, val){
  if(!rangeGesture){ const els = collectStyleEls(prop); if(!els.length) return; rangeGesture = { prop, els, before: styleSnap(els) }; }
  for(const el of rangeGesture.els) markStyled(el, prop, val);
  setDirty(true);
}
function rangeCommit(){ if(!rangeGesture) return; pushUndo({ type: "style", items: rangeGesture.before, after: styleSnap(rangeGesture.els) }); rangeGesture = null; }
function rgbToHex(c: string){                                       // getComputedStyle gives rgb()/rgba() → the #rrggbb a color input needs
  if(!c) return "#000000";
  if(c[0] === "#") return c.length === 7 ? c : "#000000";
  const m = c.match(/rgba?\(([^)]+)\)/); if(!m) return "#000000";
  const p = m[1].split(",").map((s) => parseFloat(s));
  const h = (n) => Math.max(0, Math.min(255, Math.round(n || 0))).toString(16).padStart(2, "0");
  return "#" + h(p[0]) + h(p[1]) + h(p[2]);
}
function firstStyleEl(){ for(const el of moveSet){ const ts = styleTargets(el); if(ts.length) return ts[0]; } return null; }
function firstTextEl(){ for(const el of moveSet){ if(el.matches && el.matches("text,tspan")) return el; const t = el.querySelector && el.querySelector("text,tspan"); if(t) return t; } return null; }
function firstFamily(ff: string){ return (ff || "").split(",")[0].trim().replace(/^["']|["']$/g, ""); }
function cssFamily(f: string){ return /^[A-Za-z][A-Za-z0-9\-]*$/.test(f) ? f : '"' + f + '"'; }   // quote families with spaces/dots
function famOption(f: string){                                       // make sure the select can show this family (figure fonts land on top)
  if(!f) return;
  for(const o of propFontFam.options) if(o.value === f) return;
  const o = document.createElement("option"); o.value = f; o.textContent = f; propFontFam.insertBefore(o, propFontFam.firstChild);
}
function fillPropsPanel(){                                  // prefill from the first relevant element (mixed values are left as-is — kept simple)
  const el = firstStyleEl();
  if(el){
    const cs = getComputedStyle(el);
    propFill.value = rgbToHex(cs.fill);
    propStroke.value = rgbToHex(cs.stroke);
    const sw = parseFloat(cs.strokeWidth); if(!isNaN(sw)) propStrokeW.value = String(sw);
    const op = parseFloat(cs.opacity); if(!isNaN(op)) propOpacity.value = String(op);
  }
  const hasText = selHasText(), hasShape = selHasShape();
  ctxText.style.display = hasText ? "" : "none";            // .cgroup default display is inline-flex
  ctxStroke.style.display = hasShape ? "" : "none";
  lblFill.textContent = (hasText && !hasShape) ? "Couleur" : "Fond";   // text-only: fill IS the text colour
  const t = hasText ? firstTextEl() : null;
  if(t){
    const cs = getComputedStyle(t);
    const fs = parseFloat(cs.fontSize); if(!isNaN(fs)) propFontSize.value = String(Math.round(fs * 10) / 10);
    const fam = firstFamily(cs.fontFamily); famOption(fam); propFontFam.value = fam;
    const w = cs.fontWeight; propBold.classList.toggle("on", w === "bold" || parseInt(w, 10) >= 600);
    propItal.classList.toggle("on", cs.fontStyle === "italic");
  }
}
function updatePropsPanel(){                                // bar slides in for a live selection, out of lasso/add/fullscreen modes
  const show = !!(moveSet.length && !lassoMode && !addMode && !document.body.classList.contains("fs-mode"));
  propsPanel.classList.toggle("show", show);
  if(show) fillPropsPanel();
  if(annotOn) setTimeout(sizeAnnot, 160);                   // the bar reflows the stage → re-anchor the annot canvas after the 140ms slide
}
propFill.addEventListener("change", () => commitStyle("fill", propFill.value));
propStroke.addEventListener("change", () => commitStyle("stroke", propStroke.value));
propStrokeW.addEventListener("change", () => { if(propStrokeW.value !== "") commitStyle("stroke-width", propStrokeW.value); });
propFontSize.addEventListener("change", () => { if(propFontSize.value !== "") commitStyle("font-size", propFontSize.value + "px"); });
propOpacity.addEventListener("input", () => rangeLive("opacity", propOpacity.value));
propOpacity.addEventListener("change", rangeCommit);
propsPanel.querySelectorAll<HTMLButtonElement>(".pnone").forEach(btn => btn.addEventListener("click", () => commitStyle(btn.getAttribute("data-prop"), "none")));
propFontFam.addEventListener("change", () => { if(propFontFam.value) commitStyle("font-family", cssFamily(propFontFam.value)); });
propBold.addEventListener("click", () => commitStyle("font-weight", propBold.classList.contains("on") ? "normal" : "bold"));
propItal.addEventListener("click", () => commitStyle("font-style", propItal.classList.contains("on") ? "normal" : "italic"));
propsPanel.addEventListener("pointerdown", e => {           // bar buttons must not steal focus: B/I/× stay usable WHILE typing in the inline editor
  if(e.target && (e.target as Element).closest && (e.target as Element).closest<HTMLButtonElement>("button")) e.preventDefault();
});
const STD_FAMILIES = ["DejaVu Sans", "DejaVu Serif", "Helvetica", "Arial", "Times New Roman", "STIXGeneral", "Georgia", "Verdana", "Courier New"];
function populateFamilies(){                                // figure's own fonts first, then the standards
  for(const f of STD_FAMILIES){ const o = document.createElement("option"); o.value = f; o.textContent = f; propFontFam.appendChild(o); }
  const seen = new Set();
  (svg as Element).querySelectorAll<HTMLElement>("text,tspan").forEach((t) => { const f = firstFamily(getComputedStyle(t).fontFamily); if(f && !seen.has(f)){ seen.add(f); famOption(f); } });
}
// ---- dirty-state (accent dot on the save button + beforeunload guard) ----
function setDirty(v: boolean){ dirty = v; const b = (document.getElementById("savesvg") as HTMLButtonElement); if(b) b.classList.toggle("dirty", v); }
// ---- undo/redo history (two stacks; each entry holds enough to undo AND redo) ----
// move       : { items:<before snapshot>, after:<after snapshot> } — restoreXf both ways
// style      : { items:<before styleSnap>, after:<after styleSnap> } — styleRestore both ways
// delete     : { items:[{el,parent,next}], removed:[<removedLog recs>] }
// add        : { el, parent, next }
// edit       : { el, before, after }
let undoStack = [], redoStack = [];
let removedLog = [];                                        // ids+labels of elements deleted from the figure (for the sidecar)
let nudgeState = null;                                      // coalesces a burst of arrow-key nudges into one history entry
function snapshot(els){ return els.map((el) => ({ el,                       // full pre-op state, restored verbatim on undo/redo
  orig: el.hasAttribute("data-orig") ? el.getAttribute("data-orig") : null,
  dx: el.hasAttribute("data-dx") ? el.getAttribute("data-dx") : null,
  dy: el.hasAttribute("data-dy") ? el.getAttribute("data-dy") : null,
  xf: el.hasAttribute("transform") ? el.getAttribute("transform") : null })); }
function restoreXf(it){
  for(const [a, v] of [["data-orig", it.orig], ["data-dx", it.dx], ["data-dy", it.dy], ["transform", it.xf]]){
    if(v === null) it.el.removeAttribute(a); else it.el.setAttribute(a, v);
  }
}
function updateHist(){                                      // buttons follow their stack's emptiness
  const u = (document.getElementById("undobtn") as HTMLButtonElement); if(u) u.disabled = undoStack.length === 0;
  const r = (document.getElementById("redobtn") as HTMLButtonElement); if(r) r.disabled = redoStack.length === 0;
}
function pushUndo(entry){ undoStack.push(entry); redoStack.length = 0; nudgeState = null; updateHist(); }  // any new action clears redo + breaks nudge burst
function reinsert(it){                                      // put a detached node back at its original DOM position
  if(it.next && it.next.parentNode === it.parent) it.parent.insertBefore(it.el, it.next);
  else it.parent.appendChild(it.el);
}
function removedForget(recs){ for(const rec of recs){ const i = removedLog.indexOf(rec); if(i >= 0) removedLog.splice(i, 1); } }
function removedReadd(recs){ for(const rec of recs){ if(removedLog.indexOf(rec) < 0) removedLog.push(rec); } }
function undo(){
  const entry = undoStack.pop();
  if(!entry) return;
  if(entry.type === "delete"){ for(const it of entry.items) reinsert(it); removedForget(entry.removed); }
  else if(entry.type === "edit"){ entry.el.textContent = entry.before; }                 // restore the previous text
  else if(entry.type === "add"){ if(entry.el.parentNode) entry.el.remove(); }            // remove the text we added
  else if(entry.type === "style"){ for(const it of entry.items) styleRestore(it); }      // restore the previous inline style attribute
  else { for(const it of entry.items) restoreXf(it); }                                   // move : back to "before"
  redoStack.push(entry); nudgeState = null;
  setDirty(true); hiliteMoveSet(); updateHist();
}
function redo(){
  const entry = redoStack.pop();
  if(!entry) return;
  if(entry.type === "delete"){ for(const it of entry.items) it.el.remove(); removedReadd(entry.removed); }
  else if(entry.type === "edit"){ entry.el.textContent = entry.after; }                  // re-apply the new text
  else if(entry.type === "add"){ reinsert(entry); }                                       // re-insert the text we added
  else if(entry.type === "style"){ for(const it of entry.after) styleRestore(it); }       // re-apply the new inline style attribute
  else { for(const it of entry.after) restoreXf(it); }                                    // move : forward to "after"
  undoStack.push(entry); nudgeState = null;
  setDirty(true); hiliteMoveSet(); updateHist();
}
function deleteSel(){                                       // remove the selected element(s) from the figure; ⌘Z restores them
  if(!moveSet.length) return;
  const items = moveSet.map(el => ({ el, parent: el.parentNode, next: el.nextSibling }));
  const removed = [];
  for(const it of items){
    const id = it.el.id, text = id ? elemText(it.el) : null;   // read the label BEFORE detaching (comment-anchored labels need the sibling)
    it.el.remove();
    if(id){ const rec = { id, text }; removedLog.push(rec); removed.push(rec); }
  }
  pushUndo({ type: "delete", items, removed });
  setDirty(true); clearMoveSet();
}
function nudge(dxu: number, dyu: number){                                   // move moveSet by whole user units in each element's parent space (like drag)
  if(!moveSet.length) return;
  const now = Date.now(), merge = nudgeState && (now - nudgeState.t) < 800;
  const before = merge ? nudgeState.before : snapshot(moveSet);
  for(const el of moveSet){
    if(!el.hasAttribute("data-orig")) el.setAttribute("data-orig", el.getAttribute("transform") || "");
    if(!el.hasAttribute("data-orig0")) el.setAttribute("data-orig0", el.getAttribute("transform") || "");   // pristine, for the edits sidecar
    const dx = parseFloat(el.getAttribute("data-dx") || "0") + dxu, dy = parseFloat(el.getAttribute("data-dy") || "0") + dyu;
    el.setAttribute("data-dx", String(dx)); el.setAttribute("data-dy", String(dy));
    el.setAttribute("transform", "translate(" + dx + "," + dy + ") " + el.getAttribute("data-orig"));
  }
  const after = snapshot(moveSet);
  if(merge){ nudgeState.entry.after = after; nudgeState.t = now; }   // same burst → keep the first "before", refresh "after"
  else { const entry = { type: "move", items: before, after }; pushUndo(entry); nudgeState = { t: now, before, entry }; }
  setDirty(true); hiliteMoveSet();
}
function applyEditFont(inp: HTMLElement, el: Element){                            // WYSIWYG: the inline editor adopts the label's real font at its on-screen size
  try{
    const cs = getComputedStyle(el), m = (el as SVGGraphicsElement).getScreenCTM();
    const sc = m ? Math.hypot(m.a, m.b) : 1;
    const px = parseFloat(cs.fontSize) * sc;
    if(px) inp.style.font = cs.fontStyle + " " + cs.fontWeight + " " + Math.max(11, px) + "px " + cs.fontFamily;
  }catch(e){}
}
function editText(el: SVGTextElement, o){                                   // inline-edit a <text> (an existing label/title, or a freshly added one)
  o = o || {}; editing = true; showHover(null);
  moveSet = [el]; hiliteMoveSet();                          // keep the label selected → the properties panel stays up while typing
  const inp = document.createElement("input");
  inp.id = "txtedit-input"; inp.type = "text"; inp.className = "txtedit";
  inp.value = el.textContent || "";
  applyEditFont(inp, el);
  let b = null; try{ b = rectIn(el); }catch(e){}
  if(!b || !b.w) b = { x: o.x || 20, y: o.y || 20, w: 140 };
  inp.style.left = Math.max(2, b.x - 4) + "px";
  inp.style.top  = Math.max(2, b.y - 18) + "px";
  inp.style.minWidth = Math.max(90, b.w + 24) + "px";
  stage.appendChild(inp);
  // WKWebView: preventDefault() on the pointerdowns above also cancels their native
  // focus side-effect — a single synchronous focus() can silently fail and the keys
  // keep going to the app. Retry until the field really owns the keyboard.
  const grabFocus = () => { if(document.activeElement !== inp && inp.isConnected){ try{ window.focus(); }catch(e){} inp.focus({ preventScroll: true }); inp.select(); } };
  grabFocus();
  requestAnimationFrame(grabFocus);
  setTimeout(grabFocus, 80);
  const before = el.textContent || "";
  let done = false;
  function finish(keep: boolean){
    if(done) return; done = true; editing = false;
    const after = inp.value; inp.remove();
    if(keep){
      if(o.isNew){
        if(after === ""){ el.remove(); }                                                  // empty new label → discard it
        else { el.textContent = after; pushUndo({ type: "add", el, parent: el.parentNode, next: el.nextSibling }); setDirty(true); }
      } else if(after !== before){
        el.textContent = after; pushUndo({ type: "edit", el, before, after }); setDirty(true);
      }
    } else if(o.isNew){ el.remove(); }                                                     // Esc on a new label → discard
    if(!el.parentNode) clearMoveSet(); else hiliteMoveSet();                               // discarded label → drop the dead selection
  }
  inp.addEventListener("keydown", ev => { ev.stopPropagation();                            // keep Del/F/⌘Z/Esc out of the canvas handlers
    if(ev.key === "Enter"){ ev.preventDefault(); finish(true); }
    else if(ev.key === "Escape"){ ev.preventDefault(); finish(false); }
    else if((ev.metaKey || ev.ctrlKey) && (ev.key === "b" || ev.key === "B")){ ev.preventDefault(); propBold.click(); }     // style while typing
    else if((ev.metaKey || ev.ctrlKey) && (ev.key === "i" || ev.key === "I")){ ev.preventDefault(); propItal.click(); } });
  inp.addEventListener("blur", () => finish(true));
}
function placeTextAt(e){                                    // create a new <text> at the click, then open it for typing
  const NS = "http://www.w3.org/2000/svg";
  const p = svgPoint(e, svg);
  const t = document.createElementNS(NS, "text");
  const proto = (svg as Element).querySelector<HTMLElement>("text");                 // inherit the figure's font family/weight when there is one
  if(proto && proto.getAttribute("style")) t.setAttribute("style", proto.getAttribute("style"));
  t.style.fill = "#000"; t.style.textAnchor = "start"; t.style.fontSize = "12px";
  t.setAttribute("x", String(p.x)); t.setAttribute("y", String(p.y));
  t.setAttribute("id", "added_text_" + (++addCounter));
  svg.appendChild(t);
  const s = stagePt(e);
  editText(t, { isNew: true, x: s.x, y: s.y });
}
function inPoly(x: number, y: number, pts){                               // ray-casting point-in-polygon
  let c = false;
  for(let i = 0, j = pts.length - 1; i < pts.length; j = i++){
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if(((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
  }
  return c;
}
function lassoStart(p: string[]|number[]){
  lasso = { pts: [p] };
  const NS = "http://www.w3.org/2000/svg";
  lassoEl = document.createElementNS(NS, "svg");
  lassoEl.setAttribute("class", "lassosvg");
  lassoEl.style.cssText = "position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none";
  lassoEl.appendChild(document.createElementNS(NS, "polyline"));
  const dot = document.createElementNS(NS, "circle");          // first-vertex handle: click it (or dbl-click / Enter) to close
  dot.setAttribute("r", "5"); dot.setAttribute("cx", String(p[0])); dot.setAttribute("cy", String(p[1]));
  lassoEl.appendChild(dot);
  ov.appendChild(lassoEl);
}
function lassoUpdate(cursor?: number[]){                                   // polygon so far + a rubber-band edge to the cursor
  const pts = cursor ? lasso.pts.concat([cursor]) : lasso.pts;
  (lassoEl.firstChild as SVGElement).setAttribute("points", pts.map((p) => p[0] + "," + p[1]).join(" "));
}
function lassoRemove(){ if(lassoEl){ lassoEl.remove(); lassoEl = null; } }
function segInt(a, b, c, d){                              // do segments ab and cd cross? (orientation test)
  const ccw = (p: number[], q: number[], r: number[]) => (r[1] - p[1]) * (q[0] - p[0]) > (q[1] - p[1]) * (r[0] - p[0]);
  return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
}
function rectPolyHit(b, pts){                             // true rect↔polygon intersection (not just centre-in-poly)
  const c = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
  for(const p of c) if(inPoly(p[0], p[1], pts)) return true;                       // a rect corner inside the polygon
  for(const p of pts) if(p[0] >= b.x && p[0] <= b.x + b.w && p[1] >= b.y && p[1] <= b.y + b.h) return true;  // a polygon vertex inside the rect
  for(let i = 0; i < pts.length; i++){                                            // a polygon edge crossing a rect edge
    const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
    for(let j = 0; j < 4; j++) if(segInt(p1, p2, c[j], c[(j + 1) % 4])) return true;
  }
  return false;
}
function selectInPoly(pts){                               // elements whose bbox intersects the lasso polygon
  if(pts.length < 3){ clearMoveSet(); return; }
  const skip = /^(figure|matplotlib\.axis|xtick|ytick)_/;
  const cands = Array.from((svg as Element).querySelectorAll<SVGGraphicsElement>("[id]")).filter(el => el.id && !skip.test(el.id) && draggable(el));
  const inside = cands.filter(el => {
    let b; try{ b = rectIn(el); }catch(err){ return false; }
    return b.w && b.h && rectPolyHit(b, pts);
  });
  moveSet = inside.filter(el => !inside.some(o => o !== el && o.contains(el)));  // keep outermost units only
  hiliteMoveSet();
}
function finishPoly(){                                          // close the polygon → select what's inside it
  if(!lasso) return;
  const pts = lasso.pts; lasso = null; lassoRemove();
  selectInPoly(pts);
  setLasso(false);                                             // leave polygon mode once the selection is made
}
// ---- resize the selection with corner/edge handles (scale, baked into the transform) ----
function clientToUser(cx, cy, ref){
  const p = svg.createSVGPoint(); p.x = cx; p.y = cy;
  return p.matrixTransform((ref || svg).getScreenCTM().inverse());
}
function selBBox(){                                       // union bbox of the selection, in #stage coords
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for(const el of moveSet){
    let b; try{ b = rectIn(el); }catch(e){ continue; }
    if(!b.w || !b.h) continue;
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
  }
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
const HANDLES = [   // px/py = handle position (0/.5/1); ax/ay = the FIXED opposite anchor; sx/sy = which axes scale
  { k:"nw", px:0,   py:0,   ax:1,   ay:1,   sx:1, sy:1, cur:"nwse-resize" },
  { k:"n",  px:0.5, py:0,   ax:0.5, ay:1,   sx:0, sy:1, cur:"ns-resize"   },
  { k:"ne", px:1,   py:0,   ax:0,   ay:1,   sx:1, sy:1, cur:"nesw-resize" },
  { k:"e",  px:1,   py:0.5, ax:0,   ay:0.5, sx:1, sy:0, cur:"ew-resize"   },
  { k:"se", px:1,   py:1,   ax:0,   ay:0,   sx:1, sy:1, cur:"nwse-resize" },
  { k:"s",  px:0.5, py:1,   ax:0.5, ay:0,   sx:0, sy:1, cur:"ns-resize"   },
  { k:"sw", px:0,   py:1,   ax:1,   ay:0,   sx:1, sy:1, cur:"nesw-resize" },
  { k:"w",  px:0,   py:0.5, ax:1,   ay:0.5, sx:1, sy:0, cur:"ew-resize"   },
];
function buildHandles(){
  selBoxEl = document.createElement("div"); selBoxEl.className = "selbox"; ov.appendChild(selBoxEl);
  selHandleEls = HANDLES.map(h => {
    const d = document.createElement("div"); d.className = "selhandle"; d.style.cursor = h.cur; d._spec = h;
    d.addEventListener("pointerdown", ev => startResize(ev, h));
    d.addEventListener("pointermove", onResizeMove);
    d.addEventListener("pointerup", endResize);
    d.addEventListener("pointercancel", endResize);
    ov.appendChild(d); return d;
  });
}
function clearHandles(){ if(selBoxEl){ selBoxEl.remove(); selBoxEl = null; } selHandleEls.forEach(d => d.remove()); selHandleEls = []; }
function positionHandles(){
  const b = selBBox();
  if(!b){ if(selBoxEl) selBoxEl.style.display = "none"; selHandleEls.forEach(d => d.style.display = "none"); return; }
  if(selBoxEl){ selBoxEl.style.display = ""; selBoxEl.style.left = b.x + "px"; selBoxEl.style.top = b.y + "px"; selBoxEl.style.width = b.w + "px"; selBoxEl.style.height = b.h + "px"; }
  selHandleEls.forEach(d => { const h = d._spec; d.style.display = ""; d.style.left = (b.x + h.px * b.w) + "px"; d.style.top = (b.y + h.py * b.h) + "px"; });
}
let resizing = null;
function startResize(e: PointerEvent, h){
  if(!moveSet.length || (e.button !== undefined && e.button !== 0)) return;
  e.preventDefault(); e.stopPropagation();
  const b = selBBox(); if(!b) return;
  const sr = stage.getBoundingClientRect();
  const ax = b.x + h.ax * b.w, ay = b.y + h.ay * b.h;          // fixed anchor (opposite side), stage coords
  const hx = b.x + h.px * b.w, hy = b.y + h.py * b.h;          // grabbed handle, stage coords
  resizing = { h: h, shift: e.shiftKey, ax: ax, ay: ay, hx: hx, hy: hy,
    anchorClientX: sr.left + ax, anchorClientY: sr.top + ay,
    before: snapshot(moveSet),
    members: moveSet.map(el => {
      if(!el.hasAttribute("data-orig0")) el.setAttribute("data-orig0", el.getAttribute("transform") || "");  // pristine, for the edits sidecar
      return { el: el, parent: el.parentNode, startXf: el.getAttribute("transform") || "" };
    }) };
  try{ (e.target as Element).setPointerCapture(e.pointerId); }catch(err){}
}
function onResizeMove(e: PointerEvent){
  if(!resizing) return;
  e.preventDefault();
  const R = resizing, h = R.h, p = stagePt(e);
  let fx = 1, fy = 1;
  if(h.sx && h.sy && !R.shift){                               // proportional (aspect-locked) corner = always exact
    const d0 = Math.hypot(R.hx - R.ax, R.hy - R.ay) || 1;
    fx = fy = Math.hypot(p.x - R.ax, p.y - R.ay) / d0;
  } else {                                                    // free corner (Shift) or single-axis edge
    if(h.sx) fx = (p.x - R.ax) / ((R.hx - R.ax) || 1e-6);
    if(h.sy) fy = (p.y - R.ay) / ((R.hy - R.ay) || 1e-6);
  }
  fx = Math.min(40, Math.max(0.04, Math.abs(fx)));            // no mirror, no collapse/explosion
  fy = Math.min(40, Math.max(0.04, Math.abs(fy)));
  for(const m of R.members){
    const a = clientToUser(R.anchorClientX, R.anchorClientY, m.parent);   // anchor in THIS element's parent space
    m.el.setAttribute("transform",
      "translate(" + a.x + "," + a.y + ") scale(" + fx + "," + fy + ") translate(" + (-a.x) + "," + (-a.y) + ") " + m.startXf);
  }
  setDirty(true); hiliteMoveSet();
}
function endResize(e){
  if(!resizing) return;
  const R = resizing; resizing = null;
  try{ e.target.releasePointerCapture(e.pointerId); }catch(err){}
  let changed = false;
  for(const m of R.members){
    const now = m.el.getAttribute("transform") || "";
    if(now !== m.startXf){ changed = true;                    // fold the scale into the base so later moves keep it
      m.el.setAttribute("data-orig", now); m.el.removeAttribute("data-dx"); m.el.removeAttribute("data-dy"); }
  }
  if(changed){ pushUndo({ type: "move", items: R.before, after: snapshot(R.members.map((m) => m.el)) }); setDirty(true); }
  hiliteMoveSet();
}
function startDrag(targets, e){
  const set = targets.filter((el) => !targets.some((o) => o !== el && o.contains(el)));  // never move a node whose ancestor moves too
  drag = { moved: false, before: snapshot(set), items: set.map((el) => {
    if(!el.hasAttribute("data-orig")) el.setAttribute("data-orig", el.getAttribute("transform") || "");
    if(!el.hasAttribute("data-orig0")) el.setAttribute("data-orig0", el.getAttribute("transform") || "");  // pristine, for the edits sidecar
    const ref = el.parentNode, p = svgPoint(e, ref);
    return { el, ref, sx: p.x, sy: p.y,
             dx0: parseFloat(el.getAttribute("data-dx") || "0"), dy0: parseFloat(el.getAttribute("data-dy") || "0") };
  }) };
}
function capture(e: { pointerId: number; }){ if(svg.setPointerCapture && e.pointerId != null){ try{ svg.setPointerCapture(e.pointerId); }catch(err){} } }
// WebKit (the app's WKWebView) suppresses the compatibility "click"/"dblclick" events after
// e.preventDefault() on a pointerdown — and onDown below calls it on nearly every click. That
// silently breaks the native dblclick-to-edit-text handler, so double-click detection is done
// by hand here instead, off pointerdown timing (which always fires).
let lastClickEl = null, lastClickAt = 0, dblPending = null;
function onDown(e){
  if(editing || spaceDown) return;                        // space held → the stagewrap pan handler owns this pointer
  if(!svg || (e.button !== undefined && e.button !== 0)) return;
  if(addMode){ e.preventDefault(); setAdd(false); placeTextAt(e); return; }   // place a new text label at the click (leave add mode first so the props panel can show)
  if(lassoMode){                                          // click vertices to build a polygon (dbl-click / Enter / click 1st pt = close)
    e.preventDefault();
    const s = stagePt(e);
    if(!lasso){ lassoStart([s.x, s.y]); }                 // first vertex
    else {
      const f = lasso.pts[0];
      if(lasso.pts.length >= 3 && Math.hypot(s.x - f[0], s.y - f[1]) < 12){ finishPoly(); return; }   // click near start = close
      lasso.pts.push([s.x, s.y]); lassoUpdate();
    }
    return;
  }
  if(e.metaKey || e.ctrlKey){                              // ⌘/Ctrl-click = additive toggle (works even while the selection is "locked"), no drag
    const g = grabTarget(e.target, e.shiftKey);
    if(g && draggable(g)){
      e.preventDefault();
      const i = moveSet.indexOf(g);
      if(i >= 0) moveSet.splice(i, 1); else moveSet.push(g);
      hiliteMoveSet();
    }
    return;
  }
  const textHit = e.target && e.target.closest ? e.target.closest("text") : null;
  if(textHit){                                            // manual double-click: two quick pointerdowns on the same <text>…
    const now = Date.now();
    if(lastClickEl === textHit && (now - lastClickAt) < 400) dblPending = textHit;   // …confirmed at pointerup — a drag cancels it (native dblclick semantics)
    lastClickAt = now; lastClickEl = textHit;
  } else { lastClickEl = null; }
  // clicking on/inside a selected element drags the WHOLE selection — members are blocks
  // (axes_/legend_) that grabTarget can't re-resolve, so match by containment, not equality
  if(moveSet.length && moveSet.some(m => m === e.target || (m.contains && m.contains(e.target)))){
    e.preventDefault();
    startDrag(moveSet.slice(), e); capture(e);
    return;
  }
  const g = grabTarget(e.target, e.shiftKey);             // Shift = grab the whole legend/colorbar block
  if(moveSet.length){
    // selection is LOCKED: other elements aren't grabbable, so you can move the set without
    // snatching the map / another label. Click empty (or ✕ / Esc) to deselect first.
    if(!g || !draggable(g)) clearMoveSet();
    return;
  }
  if(!g || !draggable(g)) return;
  e.preventDefault();
  startDrag([g], e);
  drag.g = g; capture(e);
}
function onMove(e){
  if(editing || spaceDown) return;                        // no grab-preview / drag while panning
  if(lasso){ const s = stagePt(e); lassoUpdate([s.x, s.y]); return; }   // rubber-band the next edge to the cursor
  if(drag){
    for(const it of drag.items){
      const p = svgPoint(e, it.ref);
      const dx = it.dx0 + (p.x - it.sx), dy = it.dy0 + (p.y - it.sy);
      it.el.setAttribute("data-dx", String(dx)); it.el.setAttribute("data-dy", String(dy));
      it.el.setAttribute("transform", "translate(" + dx + "," + dy + ") " + it.el.getAttribute("data-orig"));
    }
    drag.moved = true; setDirty(true); hiliteMoveSet();
    return;
  }
  if(lassoMode) return;                                   // no grab-preview while lassoing
  if(moveSet.length){ showHover(null); return; }          // selection locked → no grab-hover on other elements
  const g = grabTarget(e.target, e.shiftKey);
  showHover(draggable(g) ? g : null);
}
function onUp(){
  if(editing) return;
  if(lasso) return;                                      // building a polygon by clicks — pointerup does nothing
  const dp = dblPending; dblPending = null;
  if(drag){
    if(drag.moved && drag.before){ pushUndo({ type: "move", items: drag.before, after: snapshot(drag.items.map((it) => it.el)) }); }   // record for undo/redo
    else if(!drag.moved && dp){ drag = null; editText(dp, {}); return; }                  // clean double-click on a label → edit it (editText keeps it selected)
    else if(!drag.moved && drag.g){ moveSet = [drag.g]; hiliteMoveSet(); }                                // a click without a move = select it (so Del can remove a single element)
    drag = null;
  }
}
function fsActiveEl(){ return document.fullscreenElement || document.webkitFullscreenElement || null; }
function nativeFsAllowed(){
  let p=null; try{p=new URLSearchParams(location.search);}catch(e){}
  if(p&&p.get("nativeFs")==="1") return true;
  if(p&&p.get("cssFs")==="1") return false;
  // Orca's embedded WebKit accepts requestFullscreen() but ignores
  // exitFullscreen() (the pane stays stuck full-screen). Default to CSS-only
  // inside embedded shells — fills the pane, always exits cleanly.
  const brands=(navigator.userAgentData&&navigator.userAgentData.brands||[]).map((b)=>b.brand).join(" ");
  const sig=[navigator.userAgent||"",navigator.vendor||"",brands].join(" ");
  if(/\b(Orca|Electron|cmux)\b/i.test(sig)) return false;
  if(window.self!==window.top) return false;
  return false;
}
// expand = 4 corners pointing out ; compress = 4 corners pointing in (exit fullscreen)
const FS_EXPAND = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2.5H2.5V6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg>';
const FS_COMPRESS = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 5.5H6V2M13.5 5.5H10V2M10 10.5h3.5V14M6 10.5H2.5V14"/></svg>';
function setFsUi(on: boolean){
  document.body.classList.toggle("fs-mode", on);
  fsbtn.innerHTML = on ? FS_COMPRESS : FS_EXPAND;
  fsbtn.title = on ? "Quitter le plein écran (F)" : "Plein écran (F)";
  setTimeout(hiliteMoveSet, 60);
}
function fsReflow(){
  // Exiting (native) fullscreen resizes the embedded webview back to its pane a
  // frame or two later; nudge layout repeatedly so Orca's split pane re-settles.
  const kick=()=>{void document.body.offsetHeight;window.dispatchEvent(new Event("resize"));};
  kick();
  requestAnimationFrame(()=>{kick();requestAnimationFrame(kick);});
  [60,160,320,600].forEach(ms=>setTimeout(kick,ms));
}
async function leaveFS(){
  // Orca's embedded WebKit can ignore one exit path — try both, don't wait for
  // the standard call to throw before reaching the prefixed one.
  try{ await document.exitFullscreen?.(); }catch(e){}
  try{ document.webkitExitFullscreen && document.webkitExitFullscreen(); }catch(_){}
  setFsUi(false);
  fsReflow();
}
async function toggleFS(){
  if(fsActiveEl() || document.body.classList.contains("fs-mode")){ await leaveFS(); return; }
  setFsUi(true);
  if(!nativeFsAllowed()) return;
  const req=document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
  if(!req) return;
  try{ await req.call(document.documentElement); }catch(e){}
}
// ==== zoom + pan ====
// Zoom scales #plot's CSS width; #stagewrap scrolls; overlays (rectIn) follow automatically.
function clampZoom(z: number){ return Math.min(8, Math.max(0.25, z)); }
function updateZoomInfo(){ const zi = (document.getElementById("zoominfo") as HTMLSpanElement); if(zi) zi.textContent = (Math.abs(zoom - 1) < 0.001) ? "" : (Math.round(zoom * 100) + " %"); }
function afterZoom(){ updateZoomInfo(); hiliteMoveSet(); if(annotOn){ sizeAnnot(); annotApi.redraw(); } }   // keep overlays + annot canvas in sync with the new scale
function applyZoom(z: number, ax: number, ay: number){                            // ax/ay = client point to keep pinned under the cursor
  z = clampZoom(z);
  const pr = plot.getBoundingClientRect();
  let fx = 0.5, fy = 0.5, pin = false;
  if(ax != null && pr.width && pr.height){ fx = (ax - pr.left) / pr.width; fy = (ay - pr.top) / pr.height; pin = true; }
  zoom = z; plot.style.width = (zoom * 100) + "%";
  if(pin){                                               // shift scroll so the same document fraction stays under the cursor
    const pr2 = plot.getBoundingClientRect();
    stagewrap.scrollLeft += pr2.left - (ax - fx * pr2.width);
    stagewrap.scrollTop  += pr2.top  - (ay - fy * pr2.height);
  }
  afterZoom();
}
function zoomStep(f: number){ const r = stagewrap.getBoundingClientRect(); applyZoom(zoom * f, r.left + r.width / 2, r.top + r.height / 2); }  // centre on viewport
function zoomReset(){ zoom = 1; plot.style.width = "100%"; stagewrap.scrollLeft = 0; stagewrap.scrollTop = 0; afterZoom(); }           // fit width
// ⌘/pinch + wheel = zoom centred on the cursor; plain wheel stays native scroll
stagewrap.addEventListener("wheel", e => {
  if(!(e.ctrlKey || e.metaKey) || !svg) return;
  e.preventDefault();
  applyZoom(zoom * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
}, { passive: false });
// space-held pan: drag the scroll position; edit handlers are suppressed while space is down
stagewrap.addEventListener("pointerdown", e => {
  if(!spaceDown || editing) return;
  if(e.button !== undefined && e.button !== 0) return;
  panning = { x: e.clientX, y: e.clientY, sl: stagewrap.scrollLeft, st: stagewrap.scrollTop };
  document.body.classList.add("panning");
  try{ stagewrap.setPointerCapture(e.pointerId); }catch(err){}
  e.preventDefault();
});
stagewrap.addEventListener("pointermove", e => {
  if(!panning) return;
  stagewrap.scrollLeft = panning.sl - (e.clientX - panning.x);
  stagewrap.scrollTop  = panning.st - (e.clientY - panning.y);
  e.preventDefault();
});
function endPan(e: { pointerId: number; }){ if(!panning) return; panning = null; document.body.classList.remove("panning"); try{ stagewrap.releasePointerCapture(e.pointerId); }catch(err){} }
stagewrap.addEventListener("pointerup", endPan);
stagewrap.addEventListener("pointercancel", endPan);
document.addEventListener("keyup", e => { if(e.key === " "){ spaceDown = false; document.body.classList.remove("panready", "panning"); panning = null; } });
window.addEventListener("blur", () => { spaceDown = false; panning = null; document.body.classList.remove("panready", "panning"); });   // a lost keyup (blur) must not leave pan stuck on

document.addEventListener("keydown", e => {
  if(editing) return;
  const t = e.target; if(t && ((t as Element).closest && (t as Element).closest<HTMLDivElement>("#ctxbar") || /^(input|select|textarea)$/i.test((t as Element).tagName || ""))) return;   // any form field (edit bar, dpi select, inline edit) keeps native arrows/space/del
  if(e.key === " " && !e.metaKey && !e.ctrlKey){ if(!spaceDown){ spaceDown = true; document.body.classList.add("panready"); showHover(null); } e.preventDefault(); return; }
  if((e.metaKey || e.ctrlKey) && (e.key === "+" || e.key === "=")){ e.preventDefault(); zoomStep(1.25); return; }
  if((e.metaKey || e.ctrlKey) && e.key === "-"){ e.preventDefault(); zoomStep(1 / 1.25); return; }
  if((e.metaKey || e.ctrlKey) && e.key === "0"){ e.preventDefault(); zoomReset(); return; }
  if((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z")){ e.preventDefault(); if(e.shiftKey) redo(); else undo(); return; }
  if(moveSet.length && e.key.indexOf("Arrow") === 0){       // arrow keys nudge the selection (Shift = ×10), coalesced per burst
    const s = e.shiftKey ? 10 : 1;
    let dx = 0, dy = 0;
    if(e.key === "ArrowLeft") dx = -s; else if(e.key === "ArrowRight") dx = s;
    else if(e.key === "ArrowUp") dy = -s; else if(e.key === "ArrowDown") dy = s;
    e.preventDefault(); nudge(dx, dy); return;
  }
  if(e.key === "f" || e.key === "F"){ toggleFS(); return; }
  if(e.key === "Delete" || e.key === "Backspace"){ e.preventDefault(); if(moveSet.length) deleteSel(); return; }
  if(e.key === "Enter" && lassoMode){ e.preventDefault(); finishPoly(); return; }
  if(e.key !== "Escape") return;
  if(lasso){ lasso = null; lassoRemove(); return; }       // Esc cancels the in-progress polygon, stays in polygon mode
  if(addMode) setAdd(false);
  else if(lassoMode) setLasso(false);
  else if(moveSet.length) clearMoveSet();
});
function currentSVGText(){                                // serialize current view, minus bookkeeping attrs
  const clone = svg.cloneNode(true);
  (clone as Element).querySelectorAll<HTMLElement>("[data-orig],[data-dx],[data-dy],[data-orig0],[data-styled]").forEach((el) => {
    el.removeAttribute("data-orig"); el.removeAttribute("data-dx"); el.removeAttribute("data-dy"); el.removeAttribute("data-orig0"); el.removeAttribute("data-styled");
  });
  return '<?xml version="1.0" encoding="utf-8" standalone="no"?>\n' + new XMLSerializer().serializeToString(clone);
}
function flash(btn: HTMLElement, msg: string, ms?: number){ btn._html = btn._html || btn.innerHTML; btn.textContent = msg; setTimeout(() => { btn.innerHTML = btn._html; }, ms || 1700); }
function elemText(el){                                    // the label string: literal <text>, else matplotlib's preceding <!-- comment -->
  let t = (el.textContent || "").trim();
  if(t) return t;
  let p = el.previousSibling;
  while(p && p.nodeType === 3 && !(p.textContent || "").trim()) p = p.previousSibling;   // skip whitespace
  return (p && p.nodeType === 8) ? (p.textContent || "").trim() : "";
}
function collectEdits(){                                  // v2 sidecar: transforms (deltas) + added texts + removed ids + style overrides
  const transforms = [];
  (svg as Element).querySelectorAll<HTMLElement>("[data-orig0]").forEach((el) => {     // per moved/resized element: id + label + the editor DELTA (its own original stripped)
    const xf = el.getAttribute("transform") || "", o0 = el.getAttribute("data-orig0") || "";
    let delta = xf;
    if(o0 && xf.endsWith(o0)) delta = xf.slice(0, xf.length - o0.length).trim();   // original is always the inner suffix
    if(!delta) return;                                    // back to pristine (e.g. undone) → no edit to persist
    transforms.push({ id: el.id || null, text: elemText(el) || null, delta: delta });
  });
  const added = [];
  (svg as Element).querySelectorAll<HTMLElement>('[id^="added_text_"]').forEach((el) => {   // texts created in the editor (survive a matplotlib regen)
    added.push({ id: el.id, x: parseFloat(el.getAttribute("x")) || 0, y: parseFloat(el.getAttribute("y")) || 0,
      content: el.textContent || "", style: el.getAttribute("style") || "", transform: el.getAttribute("transform") || "" });
  });
  const styles = [];
  styledProps.forEach((m, el) => {                          // per styled element: re-read the CURRENT inline value of each prop we ever set
    if(!svg.contains(el)) return;                           // element deleted → drop it
    const props = {};
    for(const k in m){ const v = el.style.getPropertyValue(k); if(v) props[k] = v; }   // undone props read back empty → omitted
    if(!Object.keys(props).length) return;
    const id = el.id || null, text = elemText(el) || null;
    if(!id && !text){                                       // no id, no label (bare matplotlib shape) → anchor by nearest id-bearing ancestor + index
      const anc = el.parentNode && el.parentNode.closest ? el.parentNode.closest("[id]") : null;   // ascendant, never el itself
      if(anc){
        const tag = el.tagName.toLowerCase();
        styles.push({ id: null, text: null, anchor: anc.id, tag: tag,
          index: Array.from(anc.querySelectorAll(tag)).indexOf(el), props: props });
        return;
      }
    }
    styles.push({ id: id, text: text, props: props });      // has id/label, or no anchor → best-effort as before
  });
  return { version: 2, transforms: transforms, added: added, removed: removedLog.slice(), styles: styles };
}
function saveSVG(){
  if(!svg) return;
  const b = (document.getElementById("savesvg") as HTMLButtonElement);
  fetch("/save-svg", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rel: file, name: file.split("/").pop(), svg: currentSVGText(), edits: collectEdits() }) })
    .then(r => r.json()).then(j => { if(j && j.ok) setDirty(false); flash(b, (j && j.ok) ? "Enregistré ✓" : "Erreur"); })
    .catch(() => flash(b, "Erreur"));
}
function exportPNG(){
  if(!svg) return;
  const b = (document.getElementById("exportpng") as HTMLButtonElement);
  const dpi = parseInt((document.getElementById("dpi") as HTMLSelectElement).value, 10) || 300;
  b._html = b._html || b.innerHTML;
  b.textContent = "rendu…";
  fetch("/export-png", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rel: file, name: file.split("/").pop(), svg: currentSVGText(), dpi: dpi }) })
    .then(r => r.json()).then(j => flash(b, (j && j.ok) ? ("PNG ✓ " + j.dpi + "dpi") : ("Erreur: " + ((j && j.error) || "")).slice(0, 22), 2200))
    .catch(() => flash(b, "Erreur"));
}
(document.getElementById("savesvg") as HTMLButtonElement).onclick = saveSVG;
(document.getElementById("exportpng") as HTMLButtonElement).onclick = exportPNG;
(document.getElementById("undobtn") as HTMLButtonElement).onclick = undo;
(document.getElementById("redobtn") as HTMLButtonElement).onclick = redo;
window.addEventListener("beforeunload", e => { if(dirty){ e.preventDefault(); e.returnValue = ""; } });
(document.getElementById("clearsel") as HTMLButtonElement).onclick = () => clearMoveSet();
(document.getElementById("delsel") as HTMLButtonElement).onclick = deleteSel;
(document.getElementById("addtext") as HTMLButtonElement).onclick = () => setAdd(!addMode);
const fsbtn = (document.getElementById("fsbtn") as HTMLButtonElement);
fsbtn.onclick = toggleFS;
function onFullscreenChange(){ if(!fsActiveEl() && document.body.classList.contains("fs-mode")){ setFsUi(false); fsReflow(); } }
document.addEventListener("fullscreenchange", onFullscreenChange);
document.addEventListener("webkitfullscreenchange", onFullscreenChange);

async function load(){
  try{
    const ver = new URLSearchParams(location.search).get("v") || "";
    const r = await fetch("/" + file.split("/").map(encodeURIComponent).join("/") + (ver ? "?v=" + ver : ""));
    if(!r.ok) throw new Error(String(r.status));
    const txt = await r.text();
    // DOMParser handles the <?xml?> + <!DOCTYPE> prefix that innerHTML mangles; CSS sizes it via viewBox
    const doc = new DOMParser().parseFromString(txt, "image/svg+xml");
    const root = doc.querySelector<SVGSVGElement>("svg");
    if(!root || doc.querySelector<HTMLElement>("parsererror")) throw new Error("could not parse SVG");
    svg = document.importNode(root, true);
    plot.textContent = "";
    plot.appendChild(svg);
    if(!(svg as Element).getAttribute("viewBox")){                      // some exports drop the root viewBox → the SVG collapses to ~150px and clips; rebuild it from the content
      try{ const bb = svg.getBBox();
        if(bb.width && bb.height){ svg.setAttribute("viewBox", bb.x + " " + bb.y + " " + bb.width + " " + bb.height); svg.removeAttribute("width"); svg.removeAttribute("height"); }
      }catch(e){}
    }
    try{ const f = ((svg as Element).querySelector<SVGGraphicsElement>('[id^="figure"]') || svg).getBBox(); figArea = f.width * f.height; }catch(e){}
    (svg as Element).querySelectorAll<HTMLElement>('[id^="added_text_"]').forEach(el => {   // resume numbering after reload — never reuse an existing added_text id
      const n = parseInt(el.id.slice("added_text_".length), 10);
      if(n > addCounter) addCounter = n;
    });
    populateFamilies();
    svg.addEventListener("pointerdown", onDown);
    svg.addEventListener("dblclick", e => {                 // dbl-click: close the polygon, else edit a text label
      if(addMode) return;
      if(lassoMode){ e.preventDefault(); finishPoly(); return; }
      const t = e.target && (e.target as Element).closest ? (e.target as Element).closest<SVGTextElement>("text") : null;
      if(t){ e.preventDefault(); editText(t, {}); }
    });
    svg.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    svg.addEventListener("pointercancel", onUp);
    svg.addEventListener("mouseleave", () => { if(!drag && !lasso) showHover(null); });
    try{ new ResizeObserver(() => hiliteMoveSet()).observe(svg); }catch(e){}
  }catch(e){ plot.innerHTML = '<div id="err">Unable to load ' + esc(file) + ' (' + esc(e.message) + ')</div>'; }
}
window.addEventListener("resize", () => hiliteMoveSet());

// --- drawn annotation (shared AnnotKit): a transparent overlay over the rendered
//     SVG; while ON it sits on top of the editor's own pointer handlers ---
const annotBtn = (document.getElementById("annotbtn") as HTMLButtonElement);
let annotCv: HTMLCanvasElement = null, annotApi: { redraw: () => void; enable: () => void; disable: () => void; } = null, annotOn = false;
function sizeAnnot(){
  if(!annotCv || !svg) return;
  const sr = svg.getBoundingClientRect(), st = stage.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  annotCv.width = Math.max(1, Math.round(sr.width * dpr));    // device-pixel working space
  annotCv.height = Math.max(1, Math.round(sr.height * dpr));
  annotCv.style.left = (sr.left - st.left) + "px";
  annotCv.style.top = (sr.top - st.top) + "px";
  annotCv.style.width = sr.width + "px";
  annotCv.style.height = sr.height + "px";
}
function ensureAnnot(){
  if(annotApi) return annotApi;
  annotCv = document.createElement("canvas");
  annotCv.id = "annotcv";
  stage.appendChild(annotCv);                                // above #ov, covers the svg area
  sizeAnnot();
  annotApi = AnnotKit.create({
    overlay: annotCv,
    exportBase: async function(){                            // rasterize the LIVE svg into a clean, same-origin canvas
      const xml = new XMLSerializer().serializeToString(svg);
      const url = URL.createObjectURL(new Blob([xml], {type: "image/svg+xml"}));
      try{
        const img = await new Promise<HTMLImageElement>((res, rej) => {
          const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url;
        });
        const c = document.createElement("canvas");
        c.width = annotCv.width; c.height = annotCv.height;
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        return {src: c, w: c.width, h: c.height};
      } finally { URL.revokeObjectURL(url); }
    },
    name: function(){ return (file.split("/").pop() || "figure") + "-annot"; }
  });
  return annotApi;
}
function setAnnot(on: boolean){
  if(on){
    if(!svg) return;
    ensureAnnot(); sizeAnnot();
    annotApi.enable(); annotApi.redraw();
    annotOn = true; annotBtn.classList.add("on");
  } else {
    if(annotApi) annotApi.disable();
    annotOn = false; annotBtn.classList.remove("on");
  }
}
annotBtn.onclick = () => setAnnot(!annotOn);
window.addEventListener("resize", () => { if(annotOn){ sizeAnnot(); annotApi.redraw(); } });

load();
