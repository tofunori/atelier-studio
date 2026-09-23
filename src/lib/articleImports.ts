import type { ZoteroPDF } from "./ragdocWorkspace";
// Import d'article (plan 053) — l'état VIT HORS DU DIALOGUE, et il est PLURIEL.
// Une conversion MinerU dure des minutes : fermer la fiche doit rendre
// l'atelier (chat, LaTeX, galerie) sans rien interrompre, et rien ne doit
// empêcher d'en déposer un deuxième pendant ce temps — ni une conversion en
// cours, ni un échec qu'on n'a pas encore rangé.
import { showUndo } from "../components/ui/toast";
import { t } from "./i18n";
import { notifyArticleReady } from "./notify";
import { wsSend } from "./wsBus";

export type ArticleMetaPayload = {
  title?: string;
  authors?: string;
  year?: number | string | null;
  journal?: string;
  doi?: string;
};

export type ArticleDuplicate = { slug: string; snippet?: string; why?: string };

export type ArticleImported = {
  requestId?: string | null;
  draftId?: string;
  path?: string;
  meta?: ArticleMetaPayload;
  slug?: string;
  exists?: boolean;
  duplicate?: boolean;
  chars?: number;
  preview?: string;
  converter?: string;
  /** d'où viennent les métadonnées : "zotero" | "crossref" | "texte" */
  metaSource?: string | null;
  duplicates?: ArticleDuplicate[];
  warning?: string | null;
};

/** Étapes annoncées par la conversion, dans l'ordre où elles arrivent. */
export type ArticleStage =
  | "upload" | "ocr" | "converting" | "download" | "figures" | "meta" | "duplicates";

export type ArticleJob = {
  requestId: string;
  path: string;
  startedAt: number;
  phase: "queued" | "converting" | "ready" | "writing" | "done" | "error" | "rejected" | "duplicate";
  converter?: "mistral" | "mineru";
  zotero?: ZoteroPDF;
  imported: ArticleImported | null;
  message: string | null;
  /** Page écrite (phase "done") — la trace qui reste une fois le travail fait. */
  writtenSlug?: string | null;
  writtenUpdated?: boolean;
  /** Instant de l'écriture : le rail range la pastille après un court délai,
   *  la surface Connaissances garde la rangée jusqu'à ce qu'on la range. */
  doneAt?: number;
  /** Dernière étape reçue, et son détail (secondes de conversion, figures). */
  stage?: ArticleStage | null;
  stageSeconds?: number | null;
  stageCount?: number | null;
};

const AUTO_KEY = "atelier-studio.ragdoc-auto";

/** Mode automatique : convertir ET écrire sans confirmation. */
export function isAutoWrite() {
  try {
    return localStorage.getItem(AUTO_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAutoWrite(on: boolean) {
  try {
    localStorage.setItem(AUTO_KEY, on ? "1" : "0");
  } catch { /* stockage indisponible : le mode reste celui de la session */ }
  emit({ ...current });
}

export type ArticleImportState = {
  jobs: ArticleJob[];
  /** requestId de la fiche affichée, null = écran de dépôt */
  focused: string | null;
  open: boolean;
};

const EMPTY: ArticleImportState = { jobs: [], focused: null, open: false };

const JOBS_KEY = "atelier-studio.ragdoc-jobs-v1";
export function restoreArticleJobs(raw: string | null): ArticleJob[] {
  try {
    const value: unknown = JSON.parse(raw || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((job): job is ArticleJob => job && typeof job.requestId === "string" && typeof job.path === "string" && typeof job.startedAt === "number" && ["queued","ready","writing","converting","done","error","rejected","duplicate"].includes(job.phase)).map(job => {
      if (job.phase === "writing" || job.phase === "converting") return { ...job, phase: job.imported?.draftId ? "ready" : "error", message: "Traitement interrompu. Vérifiez la bibliothèque avant de réessayer." };
      return job;
    });
  } catch { return []; }
}
let savedJobs: ArticleJob[] = [];
try { savedJobs = restoreArticleJobs(localStorage.getItem(JOBS_KEY)); } catch { /* storage unavailable */ }
let current: ArticleImportState = { ...EMPTY, jobs: savedJobs };
const listeners = new Set<() => void>();

function emit(next: ArticleImportState) {
  current = next;
  try { localStorage.setItem(JOBS_KEY, JSON.stringify(next.jobs)); } catch { /* durable backend drafts remain available */ }
  for (const listener of listeners) listener();
}

export function subscribeArticleImport(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function articleImportSnapshot() {
  return current;
}

export function fileName(path: string) {
  return String(path).split("/").pop() ?? String(path);
}

/** La fiche à montrer : celle demandée, sinon la première prête. */
export function focusedJob(state: ArticleImportState = current) {
  if (state.focused) return state.jobs.find((job) => job.requestId === state.focused) ?? null;
  return state.jobs.find((job) => job.phase === "ready") ?? null;
}

/** Secondes écoulées depuis le dépôt — le seul repère avant la 1re étape. */
export function elapsedSeconds(job: ArticleJob, now = Date.now()) {
  return Math.max(0, Math.round((now - job.startedAt) / 1000));
}

/** Ce que la conversion est en train de faire, en clair. Un seul libellé pour
 *  le dialogue, la surface Connaissances et l'infobulle du rail : trois
 *  formulations différentes du même état donneraient trois vérités. */
export function stageLabel(job: ArticleJob, now = Date.now()) {
  const seconds = elapsedSeconds(job, now);
  switch (job.stage) {
    case "upload": return t("article.stage-upload");
    case "ocr": return t("article.stage-ocr");
    case "download": return t("article.stage-download");
    case "figures": return t("article.stage-figures", { n: job.stageCount ?? 0 });
    case "meta": return t("article.stage-meta");
    case "duplicates": return t("article.stage-duplicates");
    case "converting":
      // le compteur du script est plus juste que le nôtre : il ne compte que
      // le temps passé chez MinerU, pas l'attente d'envoi
      return t("article.stage-converting", { s: job.stageSeconds ?? seconds });
    default:
      // aucune étape reçue : le travail n'a pas encore commencé (file, spawn)
      // — dire « conversion en cours » serait un mensonge (vécu 2026-08-16).
      return t("article.waiting", { s: seconds });
  }
}

export function openArticleDialog(requestId?: string) {
  emit({ ...current, open: true, focused: requestId ?? current.focused });
}

/** Ferme la vue SANS toucher aux conversions en cours. */
export function backgroundArticleDialog() {
  emit({ ...current, open: false });
}

/** Jette un import (conversion abandonnée, fiche écrite, échec rangé). Le
 *  dialogue reste ouvert : la fiche suivante prend la place, ou l'écran de
 *  dépôt revient — on peut toujours en déposer un autre. */
export function dismissArticleImport(requestId: string) {
  emit({
    jobs: current.jobs.filter((job) => job.requestId !== requestId),
    focused: current.focused === requestId ? null : current.focused,
    open: current.open,
  });
}

/** Ferme le dialogue et oublie tout ce qui est terminé (garde les conversions). */
export function closeArticleDialog() {
  emit({
    jobs: current.jobs,
    focused: null,
    open: false,
  });
}

/** Fiche de référence par DOI — même cycle de vie qu'un import de PDF. */
export function startDoiImport(doi: string, opts: {background?: boolean} = {}) {
  return startArticleImport(`doi:${doi.trim()}`, { doi: doi.trim(), ...opts });
}

export function startArticleImport(path: string, opts: { doi?: string; converter?: "mistral" | "mineru"; background?: boolean; zotero?: ZoteroPDF } = {}) {
  const requestId = `art-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const message = opts.doi
    ? { type: "articleImportDoi", doi: opts.doi, requestId }
    : { type: "articleImport", path, requestId, ...(opts.converter ? {converter:opts.converter} : {}), ...(opts.zotero?{zotero:opts.zotero}:{}) };
  if (!wsSend(message)) {
    emit({
      ...current,
      open: opts.background ? current.open : true,
      focused: requestId,
      jobs: [...current.jobs, {
        requestId, path, converter:opts.converter, zotero:opts.zotero, startedAt: Date.now(), phase: "error",
        imported: null, message: t("kb.error-generic"),
      }],
    });
    return false;
  }
  emit({
    ...current,
    open: opts.background ? current.open : true,
    // le nouveau dépôt prend la vue : c'est le geste qu'on vient de faire
    focused: requestId,
    jobs: [...current.jobs, {
      requestId, path, converter:opts.converter, zotero:opts.zotero, startedAt: Date.now(), phase: "converting",
      imported: null, message: null,
    }],
  });
  return true;
}

function patch(requestId: string, change: Partial<ArticleJob>) {
  const job = current.jobs.find((entry) => entry.requestId === requestId);
  if (!job) return null;
  emit({
    ...current,
    jobs: current.jobs.map((entry) => (entry.requestId === requestId ? { ...entry, ...change } : entry)),
  });
  return job;
}

// Un import garde son identité PDF. Un DOI commun ne permet pas d’écraser une autre version.
export function autoTargetSlug(imported: ArticleImported) {
  return String(imported.slug || "").trim();
}

/** writeRequestId → requestId du job, pour les écritures lancées seules. */
const autoWrites = new Map<string, string>();

function autoWrite(job: ArticleJob, imported: ArticleImported) {
  const slug = autoTargetSlug(imported);
  if (!slug || !imported.draftId) {
    patch(job.requestId, { phase: "ready" });
    return false;
  }
  const writeId = `artw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const meta = imported.meta ?? {};
  const sent = wsSend({
    type: "articleWrite",
    requestId: writeId,
    draftId: imported.draftId,
    slug,
    path: job.path,
    converter: imported.converter ?? "",
    ragdoc: true,
    meta: { ...meta, year: meta.year ? Number(meta.year) : null },
  });
  if (!sent) {
    patch(job.requestId, { phase: "ready" });
    return false;
  }
  trackArticleWrite(writeId, job.requestId);
  return true;
}

export function trackArticleWrite(writeId: string, jobId: string) {
  autoWrites.set(writeId, jobId);
  patch(jobId, { phase: "writing", message: null });
}

function onAutoWritten(event: Event) {
  const detail = (event as CustomEvent).detail as
    | { requestId?: string | null; slug?: string; updated?: boolean }
    | undefined;
  const writeId = String(detail?.requestId ?? "");
  const jobId = autoWrites.get(writeId);
  if (!jobId) return;
  autoWrites.delete(writeId);
  const job = current.jobs.find((entry) => entry.requestId === jobId);
  const guessed = job?.imported?.metaSource === "texte";
  const slug = String(detail?.slug ?? "");
  // PIÈGE (vécu) : on effaçait la fiche dès l'écriture. Le toast s'efface
  // seul, la notification système ne part que si l'app n'a PAS le focus — donc
  // quand Thierry regardait l'app, l'import se terminait sans laisser la
  // moindre trace à l'écran. La fiche reste maintenant, marquée « ajouté ».
  patch(jobId, {
    phase: "done", writtenSlug: slug, writtenUpdated: detail?.updated === true,
    message: null, doneAt: Date.now(),
  });
  // le sort de la page est dit en clair : créée, mise à jour, et si les
  // métadonnées ont été devinées, l'invitation à relire suit
  void showUndo(
    t(detail?.updated ? "article.auto-updated" : "article.auto-written", { slug })
    + (guessed ? t("article.auto-guessed") : ""),
    () => { void openGbrainPage(slug); },
    t("article.open-page"),
  );
  void notifyArticleReady({
    file: job ? fileName(job.path) : slug,
    ok: true,
    detail: t(detail?.updated ? "article.auto-updated" : "article.auto-written", { slug }),
  });
}

function onAutoWriteError(event: Event) {
  const detail = (event as CustomEvent).detail as { requestId?: string | null; message?: string } | undefined;
  const writeId = String(detail?.requestId ?? "");
  const jobId = autoWrites.get(writeId);
  if (!jobId) return;
  autoWrites.delete(writeId);
  // l'écriture a échoué : la fiche redevient manuelle, rien n'est perdu
  patch(jobId, { phase: "ready", message: detail?.message ?? t("kb.error-generic") });
  void showUndo(
    t("article.auto-failed", { message: detail?.message ?? "" }),
    () => openArticleDialog(jobId),
    t("article.open-review"),
  );
}

/** Épingle le document Ragdoc dans les sources de la conversation. */
export async function openGbrainPage(slug: string) {
  if (!slug) return;
  wsSend({ type: "kbAdd", kind: "ragdoc", origin: slug });
}

function onImported(event: Event) {
  const detail = (event as CustomEvent).detail as ArticleImported | undefined;
  const requestId = String(detail?.requestId ?? "");
  if (!detail || !requestId) return;
  if(detail.duplicate) {patch(requestId,{phase:"duplicate",imported:detail,writtenSlug:detail.slug,message:"PDF déjà présent dans Ragdoc."});return;}
  const wasOpen = current.open;
  const focusedBefore = focusedJob();
  const job = patch(requestId, { phase: "ready", imported: detail, message: null });
  if (!job) return;
  const file = fileName(String(detail.path ?? job.path));
  // Mode automatique : la page part sans confirmation. Les toasts et la
  // notification annoncent uniquement une indexation vérifiée.
  if (isAutoWrite() && autoWrite({ ...job, phase: "ready", imported: detail }, detail)) return;
  // notification système : elle ne part QUE si l'app n'a pas le focus (garde de
  // notify.ts) — c'est le seul rappel qui rattrape Thierry parti ailleurs
  void notifyArticleReady({
    file, ok: true,
    detail: t("article.notify-ready", { n: Number(detail.chars ?? 0) }),
  });
  // Le dialogue ne se met à jour sous les doigts de personne : s'il montre déjà
  // une autre fiche, celle-ci attend son tour et se signale par un toast.
  if (!wasOpen || (focusedBefore && focusedBefore.requestId !== requestId)) {
    void showUndo(
      t("article.ready-toast", { file: fileName(String(detail.path ?? job.path)) }),
      () => openArticleDialog(requestId),
      t("article.open-review"),
    );
  }
}

// L'étape n'est qu'un affichage : elle ne fait avancer aucune phase, elle dit
// seulement où en est la conversion. Un job déjà prêt ou en échec l'ignore —
// une étape en retard ne doit pas ressusciter une fiche terminée.
function onProgress(event: Event) {
  const detail = (event as CustomEvent).detail as
    | { requestId?: string | null; stage?: string | null; seconds?: number | null; count?: number | null }
    | undefined;
  const requestId = String(detail?.requestId ?? "");
  if (!detail || !requestId) return;
  const job = current.jobs.find((entry) => entry.requestId === requestId);
  if (!job || job.phase !== "converting") return;
  patch(requestId, {
    stage: (detail.stage ?? null) as ArticleStage | null,
    stageSeconds: typeof detail.seconds === "number" ? detail.seconds : null,
    stageCount: typeof detail.count === "number" ? detail.count : null,
  });
}

function onError(event: Event) {
  const detail = (event as CustomEvent).detail as { requestId?: string | null; message?: string } | undefined;
  const requestId = String(detail?.requestId ?? "");
  if (!detail || !requestId) return;
  const wasOpen = current.open;
  const focusedBefore = focusedJob();
  const job = patch(requestId, { phase: "error", message: detail.message ?? t("kb.error-generic") });
  if (!job) return;
  void notifyArticleReady({ file: fileName(job.path), ok: false, detail: detail.message });
  if (!wasOpen || (focusedBefore && focusedBefore.requestId !== requestId)) {
    void showUndo(
      t("article.failed-toast", { file: fileName(job.path) }),
      () => openArticleDialog(requestId),
      t("article.open-review"),
    );
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("article-progress", onProgress);
  window.addEventListener("article-imported", onImported);
  window.addEventListener("article-error", onError);
  window.addEventListener("article-written", onAutoWritten);
  window.addEventListener("article-error", onAutoWriteError);
}

/** Tests : réinitialise l'état partagé entre deux cas (abonnés conservés). */
export function resetArticleImportForTests() {
  autoWrites.clear();
  queueRunning = false;
  emit(EMPTY);
}

let queueRunning = false;
export function enqueueArticlePaths(paths: string[], converter: "mistral"|"mineru", zotero: ZoteroPDF[] = []) {
  const known = new Set(current.jobs.filter(j=>["queued","converting","ready","writing"].includes(j.phase)).map(j=>j.path));
  const jobs = [...new Set(paths)].filter(path=>!known.has(path)&&/\.pdf$/i.test(path)).map(path=>({
    requestId: `queued-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    path, startedAt:Date.now(),phase:"queued" as const, imported:null,message:null,converter,zotero:zotero.find(item=>item.path===path),
  }));
  emit({...current,jobs:[...current.jobs,...jobs]});
}
export function runArticleQueue() { queueRunning=true; pumpQueue(); }
export function pauseArticleQueue() { queueRunning=false; }
function pumpQueue() {
  if(!queueRunning || current.jobs.some(j=>j.phase==="converting"))return;
  const job=current.jobs.find(j=>j.phase==="queued");if(!job){queueRunning=false;return;}
  dismissArticleImport(job.requestId);
  startArticleImport(job.path,{converter:job.converter,zotero:job.zotero,background:true});
}
export function rejectArticleJob(id:string) {patch(id,{phase:"rejected",message:"Écarté de ce lot. Le fichier original est conservé."});}
export function updateArticleMetadata(id:string, meta:ArticleMetaPayload) {
  const job=current.jobs.find(j=>j.requestId===id);if(job?.imported)patch(id,{imported:{...job.imported,meta}});
}
export function approveArticleJob(id:string) {
  const job=current.jobs.find(j=>j.requestId===id);
  if(!job?.imported || job.phase!=="ready")return false;
  return autoWrite(job,job.imported);
}
if(typeof window!=="undefined") {
  for(const event of ["article-imported","article-error"])window.addEventListener(event,()=>queueMicrotask(pumpQueue));
}

export function markArticleRecovered(id:string,slug:string) {
  patch(id,{phase:"done",writtenSlug:slug,doneAt:Date.now(),message:null});
}
