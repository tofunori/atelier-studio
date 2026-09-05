/** Shared annotation UI for documents and React-hosted chat surfaces. */
export const annotationColors = [
  {name:"amber", label:"Jaune", value:"rgba(255,213,74,.40)"},
  {name:"green", label:"Vert", value:"rgba(120,220,140,.40)"},
  {name:"blue", label:"Bleu", value:"rgba(120,170,255,.40)"},
  {name:"red", label:"Rose", value:"rgba(255,140,160,.40)"},
] as const;
const trash = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>';
export function createNoteEditor(host: HTMLElement, options: {
  value?: string; onSubmit(value: string): void; onDelete(): void;
  onDismiss?(): void; onChange?(value: string): void;
}) {
  host.classList.add("atelier-note");
  host.innerHTML = '<div class="atelier-note-row"><textarea aria-label="Commentaire sur le passage" placeholder="Ajouter une note…" rows="1"></textarea>'
    + '<button type="button" class="delete-note" title="Supprimer l’annotation" aria-label="Supprimer l’annotation">'+trash+'</button>'
    + '<button type="button" class="send2" title="Ajouter au brouillon (Entrée)" aria-label="Ajouter l’annotation au chat">↑</button></div><div class="annotation-status" role="status"></div>';
  const input = host.querySelector("textarea")!;
  const status = host.querySelector<HTMLElement>(".annotation-status")!;
  input.value = options.value || "";
  const fit = () => {input.style.height="24px";input.style.height=Math.min(88,input.scrollHeight)+"px";};
  input.oninput = () => {fit();options.onChange?.(input.value);};
  input.onkeydown = event => {
    event.stopPropagation();
    if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();options.onSubmit(input.value);}
    if(event.key==="Escape"){event.preventDefault();options.onDismiss?.();}
  };
  host.querySelector<HTMLButtonElement>(".send2")!.onclick=()=>options.onSubmit(input.value);
  host.querySelector<HTMLButtonElement>(".delete-note")!.onclick=options.onDelete;
  return {input,status,fit,focus(){fit();input.focus({preventScroll:true});},busy(value:boolean){
    input.disabled=value;host.querySelectorAll("button").forEach(button=>button.disabled=value);
  }};
}
export function createSelectionActions(host: HTMLElement, options: {
  onColor?(name: string, value: string): void; onAnnotate(): void; onAsk?(): void;
}) {
  host.classList.add("atelier-selection");host.replaceChildren();
  const doc=host.ownerDocument;
  const add=(label:string,html:string,action:()=>void,className="atelier-capsule")=>{
    const button=doc.createElement("button");button.type="button";button.className=className;
    button.setAttribute("aria-label",label);button.title=label;button.innerHTML=html;
    button.onmousedown=e=>e.preventDefault();button.onclick=e=>{e.stopPropagation();action();};host.appendChild(button);return button;
  };
  if(options.onColor) for(const color of annotationColors){
    const button=add(color.label,"",()=>options.onColor?.(color.name,color.value),"atelier-swatch");
    button.style.setProperty("--annotation-color",color.value.replace(",.40)",",1)"));
  }
  if(options.onAsk) add("Quick Ask",'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m13 2-8 12h6l-1 8 9-13h-7z"/></svg> Quick Ask',options.onAsk);
  add("Annoter",'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 4h16v12H9l-5 4z"/></svg> Annoter',options.onAnnotate);
}
