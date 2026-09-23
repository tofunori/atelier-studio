// Messages sidecar que l'App ne traite pas elle-même : chacun est relayé tel
// quel aux surfaces intéressées (Git, Zotero, KB, articles, terminal…) par un
// CustomEvent sur `window`. Ajouter ici un type purement relayé plutôt que
// d'allonger handleMessage.

type Relay = (msg: any) => { event: string; detail?: unknown };

const forward = (event: string): Relay => (msg) => ({ event, detail: msg });

const RELAYS: Record<string, Relay> = {
  frameChecked: forward("frame-checked"),
  // base de connaissances (plan 049) : retour d'épinglage relayé aux
  // surfaces intéressées (bouton browser, picker du composer)
  kbAdded: (msg) => ({
    event: "kb-source-added",
    detail: { ok: true, source: msg.source, refreshed: msg.refreshed, warning: msg.warning },
  }),
  kbError: (msg) => ({ event: "kb-source-added", detail: { ok: false, message: msg.message } }),
  kbSources: forward("kb-sources"),
  turnContextPreview: forward("turn-context-preview"),
  kbPromoted: (msg) => ({ event: "kb-source-promoted", detail: { id: msg.id } }),
  // page directe gbrain (plan 050 P4) : dialogue de la surface
  kbPagePreview: forward("kb-page-preview"),
  kbPageWritten: forward("kb-page-written"),
  articleDraftText: forward("article-draft-text"),
  // espace Ragdoc : revue d'article, état du corpus, PDF Zotero à importer
  articleReview: forward("ragdoc-workspace-response"),
  ragdocStatus: forward("ragdoc-workspace-response"),
  ragdocZotero: forward("ragdoc-workspace-response"),
  // import d'article (plan 053) : le dialogue corrèle par requestId
  articleImported: forward("article-imported"),
  articleWritten: forward("article-written"),
  articleError: forward("article-error"),
  // étape de conversion en direct (upload, conversion, métadonnées…)
  articleProgress: forward("article-progress"),
  articleListed: forward("article-listed"),
  // lecture seule d'une page du dépôt : le lecteur corrèle par slug
  gbrainPage: forward("gbrain-page"),
  ragdocPage: forward("ragdoc-page"),
  ragdocResults: forward("kb-ragdoc-results"),
  // texte stocké d'une source de la base : le lecteur corrèle par id
  sourceText: forward("source-text"),
  // recherche du corpus NAS (plan 050 P3) — consommée par la surface
  // Connaissances ; l'échec voyage dans detail.error, en place
  gbrainResults: (msg) => ({
    event: "kb-gbrain-results",
    detail: { query: msg.query, results: msg.results ?? [], error: msg.error ?? null },
  }),
  localServers: (msg) => ({ event: "local-servers", detail: msg.servers }),
  termData: (msg) => ({ event: `term-data:${msg.termId}`, detail: msg.data }),
  termExit: (msg) => ({ event: `term-exit:${msg.termId}` }),
  gitStatus: forward("git-status"),
  gitDiff: forward("git-diff"),
  gitLog: forward("git-log"),
  gitCommitDetails: forward("git-commit-details"),
  gitCommitFileDiff: forward("git-commit-file-diff"),
  gitHistoryActionDone: forward("git-history-action"),
  gitCommitError: forward("git-commit-error"),
  commitMsg: forward("commit-msg"),
  // Forward the request id so the instruction editor ignores stale replies.
  consigneReformulee: forward("consigne-reformulee"),
  imageGenerated: forward("image-generated"),
  ledger: forward("ledger"),
  zoteroCollections: forward("zotero-collections"),
  zoteroFav: forward("zotero-fav"),
  zoteroAddResult: forward("zotero-add-result"),
  gitChanged: forward("git-changed"),
  gitStageDone: forward("git-changed"),
  gitUnstageDone: forward("git-changed"),
  gitRevertFileDone: forward("git-changed"),
  gitCommitDone: forward("git-changed"),
  gitUndoLastTurnDone: forward("git-changed"),
  gitUndoLastTurnError: forward("git-undo-error"),
  gitSyncDone: forward("git-sync-done"),
  qaPromoteError: forward("qa-promote-error"),
  reviews: forward("reviews-list"),
  qaEvent: forward("qa-event"),
  zoteroChanged: () => ({ event: "zotero-changed" }),
  sessions: (msg) => ({ event: "sessions-list", detail: msg.sessions }),
  narvalStatus: forward("narval-message"),
  narvalSnapshot: forward("narval-message"),
  narvalDirectory: forward("narval-message"),
  narvalJobDetail: forward("narval-message"),
  narvalRunFiles: forward("narval-message"),
  narvalText: forward("narval-message"),
  computeSnapshot: forward("compute-message"),
  computeLog: forward("compute-message"),
  computeForgotRun: forward("compute-message"),
};

/** Relaie `msg` s'il est d'un type purement relayé ; renvoie `true` si c'est le cas. */
export function relaySidecarMessage(msg: any): boolean {
  if (msg.type === "galleryCommand") {
    if (msg.command) window.dispatchEvent(new CustomEvent("atelier-gallery-command", { detail: msg.command }));
    return true;
  }
  const relay = Object.prototype.hasOwnProperty.call(RELAYS, msg.type) ? RELAYS[msg.type] : undefined;
  if (!relay) return false;
  const out = relay(msg);
  window.dispatchEvent("detail" in out ? new CustomEvent(out.event, { detail: out.detail }) : new CustomEvent(out.event));
  return true;
}
