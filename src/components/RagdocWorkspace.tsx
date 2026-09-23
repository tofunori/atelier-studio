import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { open as pickFiles } from "@tauri-apps/plugin-dialog";
import ReactMarkdown from "react-markdown";
import { FilePlus2, Library, ListChecks, Settings2, Activity } from "lucide-react";
import { Button } from "./ui/Button";
import { Input } from "./shadcn/input";
import { MD_COMPONENTS, useMdPlugins } from "./chat/md";
import { mineruTablesToMarkdown } from "../lib/mineruTables";
import { normalizeMathDelimiters } from "../lib/markdown";
import {
  articleImportSnapshot, subscribeArticleImport, enqueueArticlePaths, runArticleQueue,
  pauseArticleQueue, approveArticleJob, rejectArticleJob, updateArticleMetadata,
  dismissArticleImport, fileName, stageLabel, isAutoWrite, setAutoWrite, startDoiImport,
  markArticleRecovered, type ArticleJob,
} from "../lib/articleImports";
import {
  requestRagdoc, draftViewerUrl, draftAssetUrl, type RagdocReview, type ZoteroPDF,
  ragdocWorkspaceSnapshot, subscribeRagdocWorkspace, setRagdocSettings, checkZoteroWatch, acknowledgeZotero,
} from "../lib/ragdocWorkspace";
import type { ArticleRow, GbrainSectionProps } from "./chat/KbPicker";
import "./RagdocWorkspace.css";

type Section = "import"|"review"|"library"|"status"|"settings";
const SECTIONS = [
  ["import","Importer",FilePlus2], ["review","À vérifier",ListChecks],
  ["library","Bibliothèque",Library], ["status","État",Activity], ["settings","Réglages",Settings2],
] as const;
const phaseLabel = (job:ArticleJob) => ({queued:"En attente",converting:stageLabel(job),ready:"À vérifier",writing:"Transfert, indexation et vérification…",done:"Indexation vérifiée",duplicate:"Déjà dans Ragdoc",error:"À reprendre",rejected:"Écarté"})[job.phase];
const messageOf = (error:unknown) => error instanceof Error ? error.message : String(error);

export default function RagdocWorkspace(p:{articles:ArticleRow[]; corpusStatus?:string|null; galleryUrl?:string; search:GbrainSectionProps; onRead:(slug:string)=>void}) {
  const imports=useSyncExternalStore(subscribeArticleImport,articleImportSnapshot);
  const prefs=useSyncExternalStore(subscribeRagdocWorkspace,ragdocWorkspaceSnapshot);
  const [section,setSection]=useState<Section>(()=>{const saved=sessionStorage.getItem("ragdoc-section");return SECTIONS.some(([id])=>id===saved)?saved as Section:"import";});
  useEffect(()=>{sessionStorage.setItem("ragdoc-section",section);},[section]);
  const [selected,setSelected]=useState<string|null>(null);
  const [query,setQuery]=useState("");
  const [doi,setDoi]=useState("");
  const [error,setError]=useState("");
  const [zotero,setZotero]=useState<ZoteroPDF[]|null>(null);
  const zoteroRequest=useRef(0);
  const completedImports=imports.jobs.filter(j=>j.phase==="done"||j.phase==="duplicate").map(j=>j.requestId).join(",");
  const observedCompletions=useRef(completedImports);
  const [zoteroFilter,setZoteroFilter]=useState("all");
  const [zoteroQuery,setZoteroQuery]=useState("");
  const [zoteroSelected,setZoteroSelected]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState<{documents?:number;chunks?:number;index_revision?:string;write_state?:string}|null>(null);
  const ready=imports.jobs.filter(job=>job.phase==="ready");
  const reviewJob=ready.find(job=>job.requestId===selected)??ready[0];
  const counts=useMemo(()=>({queued:imports.jobs.filter(j=>j.phase==="queued").length, converting:imports.jobs.filter(j=>j.phase==="converting").length,ready:ready.length,done:imports.jobs.filter(j=>j.phase==="done").length,duplicate:imports.jobs.filter(j=>j.phase==="duplicate").length,error:imports.jobs.filter(j=>j.phase==="error"||!!j.message&&j.phase==="ready").length}),[imports.jobs,ready.length]);
  useEffect(()=>{
    const show=()=>setSection("import");
    window.addEventListener("ragdoc-show-import",show);return ()=>window.removeEventListener("ragdoc-show-import",show);
  },[]);
  async function pick() {
    try {const result=await pickFiles({multiple:true,filters:[{name:"Articles PDF",extensions:["pdf"]}]});
      if(result)enqueueArticlePaths(Array.isArray(result)?result:[result],prefs.settings.converter);
    }catch(e){setError(messageOf(e));}
  }
  async function loadZotero() {
    const request=++zoteroRequest.current;
    setBusy(true);setError("");setZoteroSelected([]);
    setZotero(old=>old?.map(i=>({...i,ragdocStatus:"unknown",ragdocSource:undefined}))??null);
    try {const result=await requestRagdoc<{items:ZoteroPDF[];statusError?:string}>("ragdocZotero",{checkIndexed:true});if(request!==zoteroRequest.current)return;setZotero(result.items);if(result.statusError)setError("Statut Ragdoc indisponible : "+result.statusError);}catch(e){if(request===zoteroRequest.current)setError(messageOf(e));}finally{if(request===zoteroRequest.current)setBusy(false);}
  }
  useEffect(()=>{
    if(observedCompletions.current===completedImports)return;
    observedCompletions.current=completedImports;
    if(zotero!==null)void loadZotero();
  },[completedImports]);
  useEffect(()=>()=>{zoteroRequest.current++;},[]);
  async function checkStatus() {
    setBusy(true);setError("");setStatus(null);
    try {setStatus((await requestRagdoc<{index:NonNullable<typeof status>}>("ragdocStatus")).index);}catch(e){setError(messageOf(e));}finally{setBusy(false);}
  }
  function zoteroState(item:ZoteroPDF) {
    if(item.ragdocStatus==="indexed")return {kind:"indexed",label:"Déjà importé",blocked:true};
    const job=imports.jobs.find(j=>j.path===item.path&&["queued","converting","ready","writing","error"].includes(j.phase));
    if(job)return {kind:"queue",label:phaseLabel(job),blocked:job.phase!=="error"};
    return item.ragdocStatus==="missing"?{kind:"missing",label:"Non retrouvé dans Ragdoc",blocked:false}:{kind:"unknown",label:"Statut non vérifié",blocked:false};
  }
  function addZotero(items:ZoteroPDF[]) {
    items=items.filter(item=>!zoteroState(item).blocked);
    zoteroRequest.current++;setBusy(false);
    enqueueArticlePaths(items.map(i=>i.path),prefs.settings.converter,items);acknowledgeZotero(items.map(i=>i.key));
    setZotero(null);setSection("import");
  }
  function jobRow(job:ArticleJob) {
    return <li key={job.requestId} className="rd-job">
      <div><strong>{job.imported?.meta?.title||fileName(job.path)}</strong><span className="rd-muted">{phaseLabel(job)}{job.imported?.converter?` · ${job.imported.converter}`:""}</span>{job.message&&<span role="status" className="rd-warning">{job.message}</span>}</div>
      {job.phase==="ready"&&<Button variant="outline" onClick={()=>{setSelected(job.requestId);setSection("review");}}>Vérifier</Button>}
      {(job.phase==="done"||job.phase==="duplicate")&&job.writtenSlug&&<Button variant="ghost" onClick={()=>p.onRead(job.writtenSlug!)}>Lire</Button>}
      {job.phase==="error"&&<Button variant="outline" onClick={()=>{dismissArticleImport(job.requestId);if(job.path.startsWith("doi:"))startDoiImport(job.path.slice(4),{background:true});else enqueueArticlePaths([job.path],job.converter??prefs.settings.converter,job.zotero?[job.zotero]:[]);}}>Reprendre</Button>}
      {job.phase==="queued"&&<Button variant="ghost" onClick={()=>rejectArticleJob(job.requestId)}>Écarter</Button>}
    </li>;
  }
  const library=p.articles.filter(a=>`${a.title} ${a.slug}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="rd-workspace" aria-label="Espace Ragdoc">
    <nav className="rd-nav" aria-label="Parcours Ragdoc">{SECTIONS.map(([id,label,Icon])=><Button key={id} variant="ghost" aria-pressed={section===id} onClick={()=>{setSection(id);setError("");}}><Icon size={15}/>{label}{id==="review"&&ready.length>0&&<span className="rd-count">{ready.length}</span>}</Button>)}</nav>
    {prefs.pending.length>0&&<div className="rd-notice"><span>{prefs.pending.length} nouveau{prefs.pending.length>1?"x":""} PDF Zotero à examiner</span><Button variant="ghost" onClick={()=>{zoteroRequest.current++;setBusy(false);setZotero(prefs.pending);setZoteroSelected([]);setSection("import");}}>Examiner</Button></div>}
    {error&&<div className="rd-warning" role="alert">{error}</div>}
    <div className="rd-content">
    {section==="import"&&<>
      <header><h2>Ajouter, vérifier, indexer.</h2><p className="rd-muted">Les originaux restent intacts. Chaque conversion attend votre approbation{isAutoWrite()?" — sauf lorsque le mode automatique est activé":""}.</p></header>
      <div className="rd-intake"><Button variant="primary" onClick={()=>void pick()}>Choisir des PDF</Button><Button variant="outline" disabled={busy} onClick={()=>void loadZotero()}>Depuis Zotero</Button><span className="rd-muted">{prefs.settings.converter==="mistral"?"Mistral OCR":"MinerU"}</span></div>
      <details><summary>Ajouter une référence par DOI</summary><form className="rd-actions" onSubmit={e=>{e.preventDefault();if(doi.trim()){startDoiImport(doi.trim(),{background:true});setDoi("");}}}><Input aria-label="DOI" value={doi} onChange={e=>setDoi(e.target.value)} placeholder="10.…"/><Button disabled={!doi.trim()}>Ajouter la référence</Button></form><p className="rd-muted">Fiche bibliographique et résumé disponible, sans texte intégral.</p></details>
      {busy&&<p role="status">Lecture de Zotero et vérification dans Ragdoc…</p>}
      {zotero&&<section className="rd-zotero" aria-label="Sélection Zotero">
        <div className="rd-actions"><h3>PDF locaux dans Zotero</h3><Button variant="ghost" disabled={busy} onClick={()=>void loadZotero()}>Actualiser les statuts</Button><Button variant="ghost" onClick={()=>{zoteroRequest.current++;setBusy(false);setZotero(null);}}>Fermer</Button></div>
        <div className="rd-actions"><Input aria-label="Filtrer Zotero" placeholder="Filtrer les articles…" value={zoteroQuery} onChange={e=>setZoteroQuery(e.target.value)}/><select aria-label="Filtrer par statut Ragdoc" value={zoteroFilter} onChange={e=>setZoteroFilter(e.target.value)}><option value="all">Tous les PDF</option><option value="missing">Non retrouvés dans Ragdoc</option><option value="indexed">Déjà importés</option><option value="queue">Dans la file</option><option value="unknown">Statut non vérifié</option></select></div>
        <p className="rd-muted">{zotero.filter(i=>zoteroState(i).kind==="indexed").length} déjà importés · {zotero.filter(i=>zoteroState(i).kind==="missing").length} non retrouvés · {zotero.filter(i=>zoteroState(i).kind==="queue").length} dans la file · {zotero.filter(i=>zoteroState(i).kind==="unknown").length} non vérifiés</p>
        <ul>{zotero.filter(i=>(i.title||fileName(i.path)).toLowerCase().includes(zoteroQuery.toLowerCase())&&(zoteroFilter==="all"||zoteroState(i).kind===zoteroFilter)).map(item=>{const status=zoteroState(item);return <li key={item.key} className="rd-zotero-item"><label><input type="checkbox" disabled={status.blocked} checked={!status.blocked&&zoteroSelected.includes(item.key)} onChange={e=>setZoteroSelected(old=>e.target.checked?[...old,item.key]:old.filter(k=>k!==item.key))}/><span>{item.title||fileName(item.path)}<span className={`rd-zotero-status rd-zotero-status--${status.kind}`}>{status.label}</span></span></label>{status.kind==="indexed"&&item.ragdocSource&&<Button variant="ghost" onClick={()=>p.onRead(item.ragdocSource!)}>Lire</Button>}</li>;})}</ul>
        {!zotero.length&&<p>Aucun PDF local disponible.</p>}
        <Button disabled={!zotero.some(i=>zoteroSelected.includes(i.key)&&!zoteroState(i).blocked)} onClick={()=>addZotero(zotero.filter(i=>zoteroSelected.includes(i.key)))}>Ajouter à la file ({zotero.filter(i=>zoteroSelected.includes(i.key)&&!zoteroState(i).blocked).length})</Button>
        <p className="rd-muted">« Déjà importé » confirme le même PDF dans l’index. « Non retrouvé » signifie qu’aucune correspondance exacte n’a été confirmée. Les doublons sont revérifiés avant conversion.</p>
      </section>}
      <div className="rd-stats" aria-label="État des imports">{[[counts.queued,"en attente"],[counts.converting,"en conversion"],[counts.ready,"à vérifier"],[counts.done,"ajoutés"],[counts.duplicate,"doublons"],[counts.error,"à reprendre"]].map(([n,label])=><span key={label}><b>{n}</b> {label}</span>)}</div>
      <div className="rd-actions"><h3>File d’imports</h3><Button variant="primary" disabled={!counts.queued} onClick={runArticleQueue}>Lancer les conversions</Button><Button variant="ghost" disabled={!counts.converting} onClick={pauseArticleQueue}>Pause après ce PDF</Button></div>
      {!imports.jobs.length?<p className="rd-empty">Choisissez des PDF locaux ou des articles Zotero pour commencer.</p>:<ul className="rd-jobs">{imports.jobs.map(jobRow)}</ul>}
      {imports.jobs.some(j=>j.phase==="done"||j.phase==="rejected"||j.phase==="duplicate")&&<Button variant="ghost" onClick={()=>imports.jobs.filter(j=>j.phase==="done"||j.phase==="rejected"||j.phase==="duplicate").forEach(j=>dismissArticleImport(j.requestId))}>Effacer les terminés de la file</Button>}
    </>}
    {section==="review"&&(reviewJob?<><div className="rd-actions"><h2>À vérifier</h2><label>Document <select value={reviewJob.requestId} onChange={e=>setSelected(e.target.value)}>{ready.map(j=><option key={j.requestId} value={j.requestId}>{j.imported?.meta?.title||fileName(j.path)}</option>)}</select></label><span className="rd-muted">{ready.length} en attente</span></div><RagdocReviewPanel key={reviewJob.requestId} job={reviewJob} galleryUrl={p.galleryUrl} onError={setError}/></>:<div className="rd-empty"><h2>Aucun document à vérifier</h2><p>Les PDF convertis apparaîtront ici avant leur indexation.</p><Button onClick={()=>setSection("import")}>Voir les imports</Button></div>)}
    {section==="library"&&<><h2>Bibliothèque Ragdoc</h2><form className="rd-actions" onSubmit={e=>{e.preventDefault();p.search.onQueryChange(query);p.search.onSearch(query);}}><Input aria-label="Chercher dans Ragdoc" placeholder="Titre, mots-clés ou question…" value={query} onChange={e=>setQuery(e.target.value)}/><Button disabled={!query.trim()||p.search.searching}>Rechercher les passages</Button></form>{p.corpusStatus&&<p role="status" className="rd-muted">{p.corpusStatus}</p>}{p.search.error&&<p role="alert">{p.search.error}</p>}{query.trim()&&p.search.results.length>0&&<section><h3>Passages retrouvés</h3>{p.search.results.map(r=><article className="rd-result" key={r.slug}><Button variant="ghost" onClick={()=>p.onRead(r.slug)}>{r.title||r.slug}</Button><p>{r.snippet}</p>{r.page&&<span className="rd-muted">Page {r.page}</span>}</article>)}</section>}<p className="rd-muted">{library.length} documents</p><ul className="rd-jobs">{library.map(a=><li className="rd-job" key={a.slug}><Button variant="ghost" onClick={()=>p.onRead(a.slug)}>{a.title||a.slug}</Button><span className="rd-muted">{a.date}</span></li>)}</ul></>}
    {section==="status"&&<><h2>État de Ragdoc</h2><p className="rd-muted">Lecture de l’index distant, sans modifier le corpus.</p><Button disabled={busy} onClick={()=>void checkStatus()}>{busy?"Vérification…":"Vérifier la connexion"}</Button>{status&&<div className="rd-stats"><span><b>{status.documents}</b> documents</span><span><b>{status.chunks}</b> passages indexés</span><span>Connexion à l’index confirmée</span></div>}<p className="rd-muted">Ce contrôle confirme l’accès à l’index. L’exactitude de chaque extraction se vérifie dans l’onglet « À vérifier ».</p></>}
    {section==="settings"&&<><h2>Réglages des imports</h2><label className="rd-field">Service de conversion<select value={prefs.settings.converter} onChange={e=>setRagdocSettings({converter:e.target.value as "mistral"|"mineru"})}><option value="mistral">Mistral OCR</option><option value="mineru">MinerU</option></select></label><p className="rd-muted">Utilise les accès déjà configurés pour Ragdrop sur ce Mac. Le choix s’applique aux prochains PDF ajoutés à la file.</p><label className="rd-check"><input type="checkbox" checked={isAutoWrite()} onChange={e=>setAutoWrite(e.target.checked)}/>Approuver automatiquement après conversion</label><p className="rd-muted">Si activé, les nouvelles conversions sont indexées sans révision manuelle.</p><label className="rd-check"><input type="checkbox" checked={prefs.settings.watch} onChange={e=>setRagdocSettings({watch:e.target.checked})}/>Signaler les nouveaux PDF Zotero</label><p className="rd-muted">Vérification toutes les cinq minutes pendant qu’Atelier fonctionne. Les PDF présents à l’activation servent de référence. Aucun import automatique.</p>{prefs.settings.watch&&<Button disabled={prefs.checking} onClick={()=>void checkZoteroWatch()}>{prefs.checking?"Lecture de Zotero…":"Vérifier Zotero maintenant"}</Button>}{prefs.lastChecked>0&&<p className="rd-muted">Dernière vérification : {new Date(prefs.lastChecked).toLocaleTimeString()}</p>}{prefs.error&&<p role="alert" className="rd-warning">{prefs.error}</p>}</>}
    </div>
  </section>;
}

function RagdocReviewPanel({job,galleryUrl,onError}:{job:ArticleJob;galleryUrl?:string;onError:(error:string)=>void}) {
  const [review,setReview]=useState<RagdocReview|null>(null);
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState<"render"|"source"|"table"|"image">("render");
  const [page,setPage]=useState(0);
  const plugins=useMdPlugins();
  useEffect(()=>{let active=true;setLoading(true);requestRagdoc<RagdocReview>("articleReview",{draftId:job.imported?.draftId}).then(r=>{if(active){if(r.indexed?.ragdoc?.verified)markArticleRecovered(job.requestId,r.indexed.slug);else setReview(r);}}).catch(e=>{if(active)onError(messageOf(e));}).finally(()=>{if(active)setLoading(false);});return ()=>{active=false;};},[job.imported?.draftId,onError]);
  const markdown=review?.pages.find(p=>p.page===page)?.text??review?.markdown??"";
  const rendered=normalizeMathDelimiters(mineruTablesToMarkdown(markdown.slice(0,200_000)));
  const viewer=review?.pdfAvailable?draftViewerUrl(galleryUrl,review.draftId,page||1):null;
  const artifacts=review?.artifacts.filter(a=>(a.type===tab||(tab==="image"&&a.type==="chart"))&&(!page||a.page===page))??[];
  const meta=job.imported?.meta??{};
  const render=(text:string)=><ReactMarkdown remarkPlugins={plugins.remark} rehypePlugins={plugins.rehype} components={MD_COMPONENTS as never}>{text}</ReactMarkdown>;
  return <div className="rd-review">
    <details><summary>Métadonnées · {meta.title||fileName(job.path)}</summary><div className="rd-meta">{([['title','Titre'],['authors','Auteurs'],['year','Année'],['journal','Revue'],['doi','DOI']] as const).map(([key,label])=><label className="rd-field" key={key}>{label}<Input value={String(meta[key]??"")} onChange={e=>updateArticleMetadata(job.requestId,{...meta,[key]:e.target.value})}/></label>)}</div></details>
    {loading&&<p role="status">Chargement du PDF et de l’extraction…</p>}{!loading&&!review&&<Button variant="ghost" onClick={()=>rejectArticleJob(job.requestId)}>Écarter ce brouillon indisponible</Button>}
    {review&&<><div className="rd-actions"><span className="rd-muted">{review.converter||job.imported?.converter||"Convertisseur inconnu"}</span>{review.pages.length>0?<label>Extraction <select value={page} onChange={e=>setPage(Number(e.target.value))}><option value={0}>Texte complet</option>{review.pages.map(p=><option key={p.page} value={p.page}>Page {p.page}</option>)}</select></label>:<span className="rd-muted">Comparaison manuelle · repères de page non vérifiés</span>}</div>
    <div className="rd-compare"><section aria-label="PDF original"><h3>PDF original</h3>{viewer?<iframe title="PDF original" src={viewer}/>:<p className="rd-muted">{review.referenceOnly?"Cette fiche DOI ne contient pas le texte intégral.":!review.pdfAvailable?"PDF absent ou modifié depuis la conversion. L’approbation est suspendue.":"Le lecteur PDF nécessite la galerie du projet."}</p>}</section>
    <section aria-label="Extraction"><div className="rd-tabs" role="tablist" aria-label="Vue de l’extraction">{([['render','Rendu'],['source','Source'],['table','Tableaux'],['image','Figures']] as const).map(([id,label])=><Button key={id} role="tab" aria-selected={tab===id} variant="ghost" onClick={()=>setTab(id)}>{label}</Button>)}</div><div className="rd-extraction">{markdown.length>200_000&&<p className="rd-warning">Aperçu limité à 200 000 caractères ; choisissez une page pour examiner la suite.</p>}{tab==="source"?<pre>{markdown.slice(0,200_000)}</pre>:tab==="render"?render(rendered):artifacts.length?artifacts.map(a=><figure key={a.artifact_id}>{a.image&&draftAssetUrl(galleryUrl,review.draftId,a.image)&&<img loading="lazy" src={draftAssetUrl(galleryUrl,review.draftId,a.image)!} alt={a.caption||a.label||"Illustration"}/>}<figcaption>{a.label}{a.page?` · page ${a.page}`:""} {a.caption}</figcaption>{a.body&&render(normalizeMathDelimiters(mineruTablesToMarkdown(a.body)))}</figure>):<p className="rd-muted">Aucun {tab==="table"?"tableau":"élément graphique"} extrait pour cette sélection.</p>}</div></section></div>
    <div className="rd-review-actions"><p className="rd-muted">Vérifiez le texte, les équations et les illustrations avant l’ajout au corpus.</p><Button variant="ghost" onClick={()=>rejectArticleJob(job.requestId)}>Écarter</Button><Button variant="primary" disabled={!review.pdfAvailable&&!review.referenceOnly} onClick={()=>{if(!approveArticleJob(job.requestId))onError("Impossible de lancer l’indexation. Vérifiez la connexion et réessayez.");}}>Approuver et indexer</Button></div></>}
  </div>;
}
