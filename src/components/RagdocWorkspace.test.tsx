import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderUi } from "../test/render";
import RagdocWorkspace from "./RagdocWorkspace";
import { requestRagdoc, type RagdocReview } from "../lib/ragdocWorkspace";
import { resetArticleImportForTests, startArticleImport, articleImportSnapshot, markArticleRecovered } from "../lib/articleImports";
import { wsSend } from "../lib/wsBus";
vi.mock("../lib/wsBus",()=>({wsReady:()=>true,wsSend:vi.fn(()=>true)}));
vi.mock("../lib/notify",()=>({notifyArticleReady:vi.fn()}));
vi.mock("./ui/toast",()=>({showUndo:vi.fn()}));
vi.mock("../lib/ragdocWorkspace",async importOriginal=>({...await importOriginal<typeof import("../lib/ragdocWorkspace")>(),requestRagdoc:vi.fn()}));
const props={articles:[],galleryUrl:"http://127.0.0.1:19000/figures_index.html#atelier_nonce=test",onRead:vi.fn(),search:{query:"",results:[],error:null,searching:false,searched:false,onQueryChange:vi.fn(),onSearch:vi.fn(),onPin:vi.fn()}};
const review:RagdocReview={draftId:"aabbccddeeff",markdown:"Texte complet",pages:[],artifacts:[{artifact_id:"chart",type:"chart",caption:"Courbe test"}],pdfAvailable:true,referenceOnly:false,pageLocationsVerified:false};
beforeEach(()=>{localStorage.clear();sessionStorage.clear();resetArticleImportForTests();vi.clearAllMocks();});
afterEach(cleanup);
function readyJob(){
  startArticleImport("/tmp/paper.pdf",{background:true});const id=articleImportSnapshot().jobs[0].requestId;
  window.dispatchEvent(new CustomEvent("article-imported",{detail:{requestId:id,draftId:"aabbccddeeff",slug:"paper.md",meta:{title:"Article test"}}}));
}
it("reviews inline, includes MinerU charts and approves only on explicit click",async()=>{
  readyJob();vi.mocked(requestRagdoc).mockResolvedValue(review);renderUi(<RagdocWorkspace {...props}/>);
  fireEvent.click(screen.getByRole("button",{name:/À vérifier/}));
  await screen.findByTitle("PDF original");
  expect(screen.getByTitle("PDF original").getAttribute("src")).toContain("file=ragdoc-draft%2Faabbccddeeff%2Foriginal.pdf");
  expect(wsSend).not.toHaveBeenCalledWith(expect.objectContaining({type:"articleWrite"}));
  fireEvent.click(screen.getByRole("tab",{name:"Figures"}));expect(screen.getByText(/Courbe test/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Approuver et indexer"}));
  expect(wsSend).toHaveBeenCalledWith(expect.objectContaining({type:"articleWrite",draftId:"aabbccddeeff"}));
  expect(articleImportSnapshot().jobs[0].phase).toBe("writing");
});
it("keeps a missing-PDF extraction readable but blocks approval",async()=>{
  readyJob();vi.mocked(requestRagdoc).mockResolvedValue({...review,pdfAvailable:false});renderUi(<RagdocWorkspace {...props}/>);
  fireEvent.click(screen.getByRole("button",{name:/À vérifier/}));await screen.findByText("Texte complet");
  expect(screen.getByRole("button",{name:"Approuver et indexer"})).toBeDisabled();
});
it("allows dismissing an expired draft without losing the other jobs",async()=>{
  readyJob();vi.mocked(requestRagdoc).mockRejectedValue(new Error("Brouillon expiré"));renderUi(<RagdocWorkspace {...props}/>);
  fireEvent.click(screen.getByRole("button",{name:/À vérifier/}));fireEvent.click(await screen.findByRole("button",{name:"Écarter ce brouillon indisponible"}));
  expect(articleImportSnapshot().jobs[0].phase).toBe("rejected");
});
it("recovers an indexing receipt without issuing another write",async()=>{
  readyJob();vi.mocked(requestRagdoc).mockResolvedValue({...review,indexed:{slug:"paper.md",ragdoc:{verified:true}}});renderUi(<RagdocWorkspace {...props}/>);
  fireEvent.click(screen.getByRole("button",{name:/À vérifier/}));
  await waitFor(()=>expect(articleImportSnapshot().jobs[0].phase).toBe("done"));
  expect(wsSend).not.toHaveBeenCalledWith(expect.objectContaining({type:"articleWrite"}));
});
it("shows canonical import status, filters it and prevents reselecting indexed PDFs",async()=>{
  vi.mocked(requestRagdoc).mockResolvedValue({items:[
    {key:"indexed",title:"Déjà indexé",path:"/tmp/indexed.pdf",identity:"1",ragdocStatus:"indexed",ragdocSource:"indexed.md"},
    {key:"missing",title:"Nouveau PDF",path:"/tmp/new.pdf",identity:"2",ragdocStatus:"missing"},
    {key:"unknown",title:"PDF inaccessible",path:"/tmp/no.pdf",identity:"3",ragdocStatus:"unknown"},
  ]});
  renderUi(<RagdocWorkspace {...props}/>);fireEvent.click(screen.getByRole("button",{name:"Depuis Zotero"}));
  await screen.findByText("Déjà importé");
  expect(requestRagdoc).toHaveBeenCalledWith("ragdocZotero",{checkIndexed:true});
  expect(screen.getByRole("checkbox",{name:/Déjà indexé/})).toBeDisabled();
  expect(screen.getByRole("checkbox",{name:/Nouveau PDF/})).not.toBeDisabled();
  fireEvent.click(screen.getByRole("button",{name:"Lire"}));expect(props.onRead).toHaveBeenCalledWith("indexed.md");
  fireEvent.change(screen.getByRole("combobox",{name:"Filtrer par statut Ragdoc"}),{target:{value:"missing"}});
  expect(screen.queryByText("Déjà indexé")).toBeNull();expect(screen.getByText("Nouveau PDF")).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox",{name:/Nouveau PDF/}));fireEvent.click(screen.getByRole("button",{name:"Ajouter à la file (1)"}));
  expect(articleImportSnapshot().jobs).toHaveLength(1);expect(articleImportSnapshot().jobs[0].phase).toBe("queued");
});
it("keeps unknown status on a failed index check and marks existing queue entries",async()=>{
  startArticleImport("/tmp/active.pdf",{background:true});
  vi.mocked(requestRagdoc).mockResolvedValue({statusError:"Connexion interrompue",items:[
    {key:"active",title:"En conversion",path:"/tmp/active.pdf",identity:"1",ragdocStatus:"unknown"},
    {key:"unknown",title:"Statut inconnu",path:"/tmp/unknown.pdf",identity:"2",ragdocStatus:"unknown"},
  ]});
  renderUi(<RagdocWorkspace {...props}/>);fireEvent.click(screen.getByRole("button",{name:"Depuis Zotero"}));
  await screen.findByText(/Statut Ragdoc indisponible/);
  expect(screen.getByRole("checkbox",{name:/En conversion/})).toBeDisabled();
  expect(screen.getByRole("checkbox",{name:/Statut inconnu/})).not.toBeDisabled();
  expect(screen.queryByText("Non retrouvé dans Ragdoc")).toBeNull();
});

it("refreshes open Zotero status after a confirmed import",async()=>{
  readyJob();
  const item={key:"paper",title:"Article test",path:"/tmp/paper.pdf",identity:"1"};
  vi.mocked(requestRagdoc).mockResolvedValueOnce({items:[{...item,ragdocStatus:"missing"}]}).mockResolvedValueOnce({items:[{...item,ragdocStatus:"indexed",ragdocSource:"paper.md"}]});
  renderUi(<RagdocWorkspace {...props}/>);fireEvent.click(screen.getByRole("button",{name:"Depuis Zotero"}));
  await screen.findByRole("checkbox",{name:/Article test/});
  act(()=>markArticleRecovered(articleImportSnapshot().jobs[0].requestId,"paper.md"));
  await screen.findByText("Déjà importé");expect(requestRagdoc).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("checkbox",{name:/Article test/})).toBeDisabled();
});

it("does not reopen Zotero when a refresh finishes after adding to the queue",async()=>{
  const item={key:"paper",title:"PDF à importer",path:"/tmp/new.pdf",identity:"1",ragdocStatus:"missing"};
  let finish!:(value:unknown)=>void;
  vi.mocked(requestRagdoc).mockResolvedValueOnce({items:[item]}).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  renderUi(<RagdocWorkspace {...props}/>);fireEvent.click(screen.getByRole("button",{name:"Depuis Zotero"}));
  await screen.findByRole("checkbox",{name:/PDF à importer/});
  fireEvent.click(screen.getByRole("button",{name:"Actualiser les statuts"}));
  fireEvent.click(screen.getByRole("checkbox",{name:/PDF à importer/}));
  fireEvent.click(screen.getByRole("button",{name:"Ajouter à la file (1)"}));
  await act(async()=>{finish({items:[item]});});
  expect(screen.queryByRole("region",{name:"Sélection Zotero"})).toBeNull();
  expect(articleImportSnapshot().jobs[0].phase).toBe("queued");
});
