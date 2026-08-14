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
  phase: "converting" | "ready" | "error";
  imported: ArticleImported | null;
  message: string | null;
};

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

export function startArticleImport(path: string) {
  const requestId = `art-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (!wsSend({ type: "articleImport", path, requestId })) {
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

function onImported(event: Event) {
  const detail = (event as CustomEvent).detail as ArticleImported | undefined;
  const requestId = String(detail?.requestId ?? "");
  if (!detail || !requestId) return;
  const wasOpen = current.open;
  const focusedBefore = focusedJob();
  const job = patch(requestId, { phase: "ready", imported: detail, message: null });
  if (!job) return;
  const file = fileName(String(detail.path ?? job.path));
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
}

/** Tests : réinitialise l'état partagé entre deux cas (abonnés conservés). */
export function resetArticleImportForTests() {
  emit(EMPTY);
}
