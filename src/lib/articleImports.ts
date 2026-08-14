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
  chars?: number;
  preview?: string;
  converter?: string;
  /** d'où viennent les métadonnées : "zotero" | "crossref" | "texte" */
  metaSource?: string | null;
  duplicates?: ArticleDuplicate[];
  warning?: string | null;
};

export type ArticleJob = {
  requestId: string;
  path: string;
  startedAt: number;
  phase: "converting" | "ready" | "writing" | "error";
  imported: ArticleImported | null;
  message: string | null;
};

const AUTO_KEY = "atelier-studio.article-auto";

/** Mode automatique : convertir ET écrire sans confirmation. */
export function isAutoWrite() {
  try {
    return localStorage.getItem(AUTO_KEY) !== "0";
  } catch {
    return true;
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

let current: ArticleImportState = EMPTY;
const listeners = new Set<() => void>();

function emit(next: ArticleImportState) {
  current = next;
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
    jobs: current.jobs.filter((job) => job.phase === "converting"),
    focused: null,
    open: false,
  });
}

/** Fiche de référence par DOI — même cycle de vie qu'un import de PDF. */
export function startDoiImport(doi: string) {
  return startArticleImport(`doi:${doi.trim()}`, { doi: doi.trim() });
}

export function startArticleImport(path: string, opts: { doi?: string } = {}) {
  const requestId = `art-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const message = opts.doi
    ? { type: "articleImportDoi", doi: opts.doi, requestId }
    : { type: "articleImport", path, requestId };
  if (!wsSend(message)) {
    emit({
      ...current,
      open: true,
      focused: requestId,
      jobs: [...current.jobs, {
        requestId, path, startedAt: Date.now(), phase: "error",
        imported: null, message: t("kb.error-generic"),
      }],
    });
    return false;
  }
  emit({
    ...current,
    open: true,
    // le nouveau dépôt prend la vue : c'est le geste qu'on vient de faire
    focused: requestId,
    jobs: [...current.jobs, {
      requestId, path, startedAt: Date.now(), phase: "converting",
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

// Mode automatique : la cible d'écriture se choisit sans nous. Un doublon par
// DOI, c'est le MÊME article — on écrit par-dessus la page existante plutôt
// que d'en semer une deuxième. Un « titre très proche » ne suffit pas : trop
// de faux positifs pour remplacer une page sans regarder.
export function autoTargetSlug(imported: ArticleImported) {
  const byDoi = (imported.duplicates ?? []).find((dup) => dup.why === "doi");
  return String(byDoi?.slug || imported.slug || "").trim();
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
    ragdoc: false,
    meta: { ...meta, year: meta.year ? Number(meta.year) : null },
  });
  if (!sent) {
    patch(job.requestId, { phase: "ready" });
    return false;
  }
  autoWrites.set(writeId, job.requestId);
  patch(job.requestId, { phase: "writing" });
  return true;
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
  dismissArticleImport(jobId);
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

/** Ouvre la page écrite dans la surface Connaissances (épinglage gbrain). */
async function openGbrainPage(slug: string) {
  if (!slug) return;
  wsSend({ type: "kbAdd", kind: "gbrain", origin: slug });
}

function onImported(event: Event) {
  const detail = (event as CustomEvent).detail as ArticleImported | undefined;
  const requestId = String(detail?.requestId ?? "");
  if (!detail || !requestId) return;
  const wasOpen = current.open;
  const focusedBefore = focusedJob();
  const job = patch(requestId, { phase: "ready", imported: detail, message: null });
  if (!job) return;
  const file = fileName(String(detail.path ?? job.path));
  // Mode automatique : la page part sans confirmation. Les toasts et la
  // notification disent ce qui a été écrit, et gbrain garde l'historique.
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
  window.addEventListener("article-imported", onImported);
  window.addEventListener("article-error", onError);
  window.addEventListener("article-written", onAutoWritten);
  window.addEventListener("article-error", onAutoWriteError);
}

/** Tests : réinitialise l'état partagé entre deux cas (abonnés conservés). */
export function resetArticleImportForTests() {
  emit(EMPTY);
}
