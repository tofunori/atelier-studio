/** Shared annotation UI for documents and React-hosted chat surfaces. */
export const annotationColors = [
  {name:"amber", label:"Jaune", value:"rgba(255,213,74,.40)"},
  {name:"green", label:"Vert", value:"rgba(120,220,140,.40)"},
  {name:"blue", label:"Bleu", value:"rgba(120,170,255,.40)"},
  {name:"red", label:"Rose", value:"rgba(255,140,160,.40)"},
] as const;
type AnnotationColor = {name: string; label: string; value: string};
/** Teintes du lecteur PDF : celles des éditeurs plus orange et violet. Même
 *  légende que le MCP atelier-annotations (`COLORS` de `highlight.rs`). */
export const pdfAnnotationColors: readonly AnnotationColor[] = [
  ...annotationColors,
  {name:"orange", label:"Orange", value:"rgba(255,160,80,.40)"},
  {name:"violet", label:"Violet", value:"rgba(185,150,255,.40)"},
];
const markIcons = {
  hl:'<path d="m9 11 8-8 4 4-8 8M9 11l4 4-3 3-4-4zM6 14l-3 6h6l1-2"/>',
  ul:'<path d="M6 3v8a6 6 0 0 0 12 0V3M4 21h16"/>',
  st:'<path d="M3 12h18M16.5 7.5C16 5.5 14.3 4 12 4 9.5 4 7.5 5.5 7.5 7.6c0 1.6 1 2.8 3 3.6M8 16.5c.6 2 2.3 3.5 4.3 3.5 2.6 0 4.3-1.6 4.3-3.6 0-.9-.3-1.7-.9-2.4"/>',
};
type MarkKind = "hl" | "ul" | "st";
const markLabels: Record<MarkKind, string> = {hl: "Surligner", ul: "Souligner", st: "Barrer"};
const selectionColors = new WeakMap<Document, string>();
const trash = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>';
const arrowUp = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
const chatBubble = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/></svg>';
const escapeText = (text: string) => text.replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]!);
/** `memo` ajoute, au-dessus du champ du chat, une note personnelle gardée avec
 *  le passage et jamais envoyée au chat (lecteur PDF). Sans `memo`, la bulle
 *  reste celle des éditeurs : un seul champ. `mark` ajoute en tête une rangée
 *  surligner / souligner / barrer et les teintes, pour changer le style d'un marquage
 *  existant (lecteur PDF). `heading` titre la bulle comme une fiche
 *  (« Annotation 3 · p. 12 ») et y range la corbeille, loin des envois. */
export function createNoteEditor(host: HTMLElement, options: {
  value?: string; onSubmit(value: string): void; onDelete(): void;
  onDismiss?(): void; onChange?(value: string): void; onSendDirect?(value: string): void;
  placeholder?: string; memo?: {value?: string}; heading?: {title: string; meta?: string};
  mark?: {kind: string; color: string; colors: readonly AnnotationColor[]; onChange(kind: MarkKind, color: string): void};
}) {
  host.classList.add("atelier-note");
  const deleteButton = '<button type="button" class="delete-note" title="Supprimer l’annotation" aria-label="Supprimer l’annotation">'+trash+'</button>';
  const heading = options.heading
    ? '<div class="atelier-note-head"><span class="atelier-note-title">'+escapeText(options.heading.title)+'</span>'
      + (options.heading.meta ? '<span class="atelier-note-meta">'+escapeText(options.heading.meta)+'</span>' : '')
      + '<span class="atelier-note-gap"></span>'+deleteButton+'</div>'
    : '';
  const mark = options.mark
    ? '<div class="atelier-mark-style" role="group" aria-label="Style du marquage">'
      + (["hl", "ul", "st"] as const).map(kind => '<button type="button" class="atelier-mark-kind" data-kind="'+kind+'" title="'
        + markLabels[kind] + '" aria-label="' + markLabels[kind]
        + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">'+markIcons[kind]+'</svg></button>').join("")
      + '<span class="atelier-mark-gap"></span>'
      + options.mark.colors.map(c => '<button type="button" class="atelier-mark-swatch" data-color="'+c.value+'" title="'+c.label+'" aria-label="'
        + c.label + '" style="--annotation-color:'+c.value.replace(".40","1")+'"></button>').join("")
      + '</div>'
    : '';
  const memo = options.memo
    ? '<div class="atelier-memo"><textarea class="atelier-memo-input" aria-label="Note personnelle, jamais envoyée au chat" title="Note personnelle, jamais envoyée au chat" placeholder="Note personnelle…" rows="1"></textarea></div>'
    : '';
  host.innerHTML = heading + mark + memo + '<div class="atelier-note-row"><div class="atelier-note-field"><textarea class="atelier-note-input" aria-label="Commentaire sur le passage" placeholder="'
    + (options.placeholder || "Ajouter une note…") + '" rows="1"></textarea>'
    + (options.onSendDirect ? '<button type="button" class="send-direct" title="Envoyer au chat" aria-label="Envoyer au chat">'+chatBubble+'</button>' : '')
    + '<button type="button" class="send2" title="Ajouter au brouillon (Entrée)" aria-label="Ajouter l’annotation au chat">'+arrowUp+'</button>'
    + '</div>' + (options.heading ? '' : deleteButton)
    + '</div><div class="annotation-status" role="status"></div>';
  const input = host.querySelector<HTMLTextAreaElement>("textarea.atelier-note-input")!;
  const memoInput = host.querySelector<HTMLTextAreaElement>("textarea.atelier-memo-input");
  const status = host.querySelector<HTMLElement>(".annotation-status")!;
  input.value = options.value || "";
  if(memoInput) memoInput.value = options.memo?.value || "";
  const field = host.querySelector<HTMLElement>(".atelier-note-field")!;
  // Au-delà d'une ligne, la bulle s'élargit en « composer » : le texte prend
  // toute la largeur, les boutons passent dessous. On mesure toujours à la
  // largeur de la pilule, sinon un texte qui tient sur une ligne élargie
  // basculerait d'une forme à l'autre à chaque frappe.
  const fit = () => {
    const wasWide = field.classList.contains("is-multiline");
    if(wasWide){field.classList.remove("is-multiline");host.classList.remove("atelier-note-wide");}
    input.style.height="24px";
    const wide = input.scrollHeight>28;
    field.classList.toggle("is-multiline",wide);host.classList.toggle("atelier-note-wide",wide);
    input.style.height="24px";
    const maxHeight = parseFloat(host.ownerDocument.defaultView?.getComputedStyle(input).maxHeight || "") || 124;
    input.style.height=Math.min(maxHeight,input.scrollHeight)+"px";
    keepInView();
  };
  // La bulle grandit vers la droite et vers le bas depuis la position choisie
  // par l'hôte : un décalage la ramène dans la fenêtre sans toucher left/top.
  const keepInView = () => {
    host.style.translate="";
    const rect=host.getBoundingClientRect();
    if(!rect.width)return;
    const view=host.ownerDocument.documentElement;
    const dx=Math.max(8-rect.left,Math.min(0,view.clientWidth-8-rect.right));
    const dy=Math.max(8-rect.top,Math.min(0,(host.ownerDocument.defaultView?.innerHeight || view.clientHeight)-8-rect.bottom));
    if(dx||dy)host.style.translate=`${Math.round(dx)}px ${Math.round(dy)}px`;
  };
  input.oninput = () => {fit();options.onChange?.(input.value);};
  input.onkeydown = event => {
    event.stopPropagation();
    if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();options.onSubmit(input.value);}
    if(event.key==="Escape"){event.preventDefault();options.onDismiss?.();}
  };
  host.querySelector<HTMLButtonElement>(".send2")!.onclick=()=>options.onSubmit(input.value);
  const directButton = host.querySelector<HTMLButtonElement>(".send-direct");
  if(directButton) directButton.onclick=()=>options.onSendDirect?.(input.value);
  host.querySelector<HTMLButtonElement>(".delete-note")!.onclick=options.onDelete;
  if(options.mark){
    const markOptions=options.mark;
    const asKind=(value: string|undefined): MarkKind|null=>value==="hl"||value==="ul"||value==="st"?value:null;
    let kind: MarkKind=asKind(markOptions.kind) || "hl", color=markOptions.color;
    const paint=()=>{
      host.querySelectorAll<HTMLButtonElement>(".atelier-mark-kind").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.kind===kind)));
      host.querySelectorAll<HTMLButtonElement>(".atelier-mark-swatch").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.color===color)));
    };
    host.querySelectorAll<HTMLButtonElement>(".atelier-mark-style button").forEach(button=>{
      button.onmousedown=e=>e.preventDefault();
      button.onclick=()=>{
        const nextKind=asKind(button.dataset.kind) || kind;
        const nextColor=button.dataset.color||color;
        if(nextKind===kind&&nextColor===color)return;
        kind=nextKind;color=nextColor;paint();markOptions.onChange(kind,color);
      };
    });
    paint();
  }
  return {input,memoInput,status,fit,focus(){fit();input.focus({preventScroll:true});},busy(value:boolean){
    input.disabled=value;if(memoInput)memoInput.disabled=value;host.querySelectorAll("button").forEach(button=>button.disabled=value);
  }};
}
export function createSelectionActions(host: HTMLElement, options: {
  onColor?(name: string, value: string): void; onAdd?(): void; onAnnotate(): void; onAsk?(): void;
  onCode?(): void;
  onHighlight?(color: string): void; highlightColor?: string; colors?: readonly AnnotationColor[];
}) {
  host.classList.add("atelier-selection");host.replaceChildren();
  const doc=host.ownerDocument;
  const add=(label:string,html:string,action:()=>void,className="atelier-capsule")=>{
    const button=doc.createElement("button");button.type="button";button.className=className;
    button.setAttribute("aria-label",label);button.title=label;button.innerHTML=html;
    button.onmousedown=e=>e.preventDefault();button.onclick=e=>{e.stopPropagation();action();};host.appendChild(button);return button;
  };
  if(options.onAdd) add("Ajouter au chat",'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 4h16v12H9l-5 4zM8 10h8M12 6v8"/></svg>',options.onAdd);
  add("Annoter",'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 4h16v12H9l-5 4z"/></svg>',options.onAnnotate);
  // Codage qualitatif (lecteur PDF) : étiquette, ouvre le menu des codes.
  if(options.onCode) add("Coder",'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.2"/></svg>',options.onCode);
  if(options.onAsk) add("Question rapide",'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m13 2-8 12h6l-1 8 9-13h-7z"/></svg>',options.onAsk);
  if(options.onHighlight) {
    const colors=options.colors || annotationColors;
    let color=colors.find(c=>c.name===(selectionColors.get(doc) || options.highlightColor))?.name || "amber";
    const group=doc.createElement("div");group.className="atelier-highlight-actions";
    const mark=add("Surligner",'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m9 11 8-8 4 4-8 8M9 11l4 4-3 3-4-4zM6 14l-3 6h6l1-2"/></svg>',()=>apply(color));
    const toggle=add("Choisir la couleur du surlignage",'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>',()=>{
      palette.hidden=!palette.hidden;toggle.setAttribute("aria-expanded",String(!palette.hidden));
      if(!palette.hidden){
        palette.style.top="";palette.style.bottom="";
        palette.style.translate="0px 0";
        const rect=palette.getBoundingClientRect(), width=doc.documentElement.clientWidth;
        palette.style.translate=`${Math.max(0,8-rect.left)-Math.max(0,rect.right-width+8)}px 0`;
        if(rect.top<8){palette.style.bottom="auto";palette.style.top="calc(100% + 6px)";}
      }
    },"atelier-capsule atelier-color-toggle");
    toggle.setAttribute("aria-expanded","false");
    const palette=doc.createElement("div");palette.className="atelier-color-palette";palette.hidden=true;
    palette.setAttribute("role","group");palette.setAttribute("aria-label","Couleur du surlignage");
    function paint(){
      const selected=colors.find(c=>c.name===color)!;
      mark.style.setProperty("--annotation-color",selected.value.replace(".40","1"));
      mark.title=`Surligner — ${selected.label}`;
      palette.querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.color===color)));
    }
    function apply(name:string){color=name;selectionColors.set(doc,color);paint();palette.hidden=true;toggle.setAttribute("aria-expanded","false");options.onHighlight?.(color);}
    for(const entry of colors){
      const swatch=add(`Surligner en ${entry.label.toLowerCase()}`,"",()=>apply(entry.name),"atelier-swatch");
      swatch.dataset.color=entry.name;swatch.style.setProperty("--annotation-color",entry.value.replace(".40","1"));palette.append(swatch);
    }
    group.append(mark,toggle,palette);host.append(group);paint();
    group.addEventListener("keydown",event=>{if(event.key==="Escape"&&!palette.hidden){event.stopPropagation();palette.hidden=true;toggle.setAttribute("aria-expanded","false");toggle.focus();}});
    group.addEventListener("focusout",event=>{if(!group.contains(event.relatedTarget as Node|null)){palette.hidden=true;toggle.setAttribute("aria-expanded","false");}});
  }
}
