import {createSelectionActions} from "../annotation_ui";
import {createLatexAnnotationsController} from "../latex/annotations";
import type {EditorSelectionContext} from "../../core/selection_bridge";
import type {StudioEditor, StudioPosition} from "../../core/editor_contract";

/** Code and LaTeX use the same durable annotation store and delivery contract. */
export function createCodeSelectionActions(editor: StudioEditor, path: string, doc: Document, win: Window) {
  const host=doc.createElement("div");host.id="selPill";host.className="code-selection-actions";host.style.display="none";
  const popover=doc.createElement("div");popover.className="code-annotation-editor";popover.style.display="none";
  const panel=doc.createElement("div");panel.hidden=true;
  const button=doc.createElement("button");
  doc.body.append(host,popover);
  const positionedEditor=editor as StudioEditor & {charCoords(position:StudioPosition, mode:"window"):{left:number;top:number;bottom:number}};
  const post=(payload:Record<string,unknown>)=>win.__atelierPost?.(payload);
  const annotations=createLatexAnnotationsController({path,getEditor:()=>positionedEditor,popover,panel,button,postToHost:post,document:doc,window:win});
  annotations.bind();
  let current:EditorSelectionContext|null=null;
  const hide=()=>{host.style.display="none";};
  const page=()=>current?`L${current.from.line+1}-${current.to.line+1}`:"";
  createSelectionActions(host,{
    onAdd(){if(!current)return;post({type:"atelier-add-to-chat",text:`${path} (${page()}) : « ${current.text} »`});hide();},
    onAnnotate(){if(!current)return;annotations.open(current);hide();},
    onAsk(){if(!current)return;post({type:"atelier-quick-ask",text:current.text,path,page:page()});hide();},
  });
  editor.on("scroll",hide);
  doc.addEventListener("keydown",event=>{if(event.key==="Escape")hide();});
  return {
    hide,
    show(selection:EditorSelectionContext){
      current=selection;
      if(win.self===win.top)return;
      const point=positionedEditor.charCoords(selection.to,"window");
      const box=editor.getWrapperElement().getBoundingClientRect();
      host.style.display="flex";
      host.style.left=`${Math.max(8,Math.min(win.innerWidth-host.offsetWidth-8,box.left+(box.width-host.offsetWidth)/2))}px`;
      host.style.top=`${Math.max(8,Math.min(win.innerHeight-host.offsetHeight-8,point.bottom+8))}px`;
    },
  };
}
