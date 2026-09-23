import { wsReady, wsSend } from "./wsBus";

export type ZoteroPDF = { key: string; title: string; path: string; doi?: string; parentKey?:string; authors?:string; year?:string; journal?:string; identity: string; ragdocStatus?: "indexed"|"missing"|"unknown"; ragdocSource?:string; pdfSha256?:string };
export type RagdocReview = {
  draftId: string; indexed?: {slug:string;ragdoc?:{verified?:boolean}}; markdown: string; pages: {page:number; text:string}[];
  artifacts: {artifact_id:string; type:string; page?:number; label?:string; caption?:string; body?:string; image?:string}[];
  pdfAvailable: boolean; referenceOnly: boolean; pageLocationsVerified: boolean; converter?: string;
};

export function requestRagdoc<T>(type: string, extra: Record<string, unknown> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const requestId = `rd-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const cleanup = () => { clearTimeout(timer); window.removeEventListener("ragdoc-workspace-response", reply); };
    const reply = (event: Event) => {
      const data = (event as CustomEvent).detail;
      if (data?.requestId !== requestId) return;
      cleanup();
      if (data.error) reject(new Error(data.error)); else resolve(data as T);
    };
    const timer = setTimeout(() => { cleanup(); reject(new Error("Le service ne répond pas. Réessayez.")); }, 140_000);
    window.addEventListener("ragdoc-workspace-response", reply);
    if (!wsSend({type, requestId, ...extra})) {cleanup(); reject(new Error("Connexion à Atelier indisponible."));}
  });
}

const PREFS = "atelier-studio.ragdoc-workspace";
type Settings = { converter: "mistral" | "mineru"; watch: boolean; known: string[] | null };
let settings: Settings = {converter:"mistral",watch:false,known:null};
try { const saved=JSON.parse(localStorage.getItem(PREFS)||"{}"); settings={converter:saved.converter==="mineru"?"mineru":"mistral",watch:saved.watch===true,known:Array.isArray(saved.known)?saved.known:null}; } catch { /* defaults */ }
let pending: ZoteroPDF[] = [];
try { const saved=JSON.parse(localStorage.getItem(PREFS)||"{}"); pending=Array.isArray(saved.pending)?saved.pending:[]; } catch { /* defaults */ }
let state = {settings, pending, checking:false, error:"", lastChecked:0};
function persist() {try{localStorage.setItem(PREFS,JSON.stringify({...settings,pending:state.pending}));}catch{/* retain session state */}}

const listeners = new Set<()=>void>();
export const ragdocWorkspaceSnapshot = () => state;
export function subscribeRagdocWorkspace(listener:()=>void) {listeners.add(listener);return ()=>{listeners.delete(listener);};}
function emit() {state={...state,settings}; for(const listener of listeners)listener();}
export function setRagdocSettings(update: Partial<Pick<Settings,"converter"|"watch">>) {
  settings={...settings,...update,...(update.watch===true&&!settings.watch?{known:null}:{})};
  persist();emit();
  if(update.watch===true) void checkZoteroWatch();
}
export function acknowledgeZotero(keys:string[]) {state.pending=state.pending.filter(item=>!keys.includes(item.key));persist();emit();}
export async function checkZoteroWatch() {
  if(!settings.watch || state.checking || !wsReady())return;
  state.checking=true;state.error="";emit();
  try {
    const {items}=await requestRagdoc<{items:ZoteroPDF[]}>("ragdocZotero");
    if(!settings.watch)return;
    if(settings.known!==null) {
      const known=new Set(settings.known);
      const fresh=items.filter(item=>!known.has(item.identity));
      const merged=new Map(state.pending.map(item=>[item.key,item]));
      for(const item of fresh)merged.set(item.key,item);
      state.pending=[...merged.values()];
    }
    settings={...settings,known:items.map(item=>item.identity)};
    persist();
    state.lastChecked=Date.now();
  } catch(error) {state.error=String(error instanceof Error?error.message:error);}
  finally {state.checking=false;emit();}
}
export function startRagdocWatcher() {
  void checkZoteroWatch();
  const timer=setInterval(()=>{void checkZoteroWatch();},5*60_000);
  return ()=>clearInterval(timer);
}

/** Keep the gallery origin and nonce; never put a local filesystem path in an URL. */
export function draftAssetUrl(galleryUrl:string|undefined,draftId:string,asset:string):string|null {
  if(!galleryUrl || !/^[a-f0-9]{12}$/.test(draftId) || asset.split("/").some(s=>!s||s==="..") || asset.includes("\\"))return null;
  try {const url=new URL(galleryUrl);if(url.protocol!=="http:"||!["127.0.0.1","localhost"].includes(url.hostname))return null;
    return `${url.origin}/ragdoc-draft/${draftId}/${asset.split("/").map(encodeURIComponent).join("/")}`;
  } catch {return null;}
}
export function draftViewerUrl(galleryUrl:string|undefined,draftId:string,page=1) {
  const asset=draftAssetUrl(galleryUrl,draftId,"original.pdf");if(!asset)return null;
  const gallery=new URL(galleryUrl!);const url=new URL("/.fig_thumbs/pdf_viewer.html",gallery.origin);
  url.searchParams.set("file",`ragdoc-draft/${draftId}/original.pdf`);
  url.searchParams.set("page",String(page));url.hash=gallery.hash;return url.href;
}
