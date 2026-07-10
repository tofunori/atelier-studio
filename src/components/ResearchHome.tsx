// Research Home (plan 017) — poste de reprise du travail, monté par la
// timeline quand AUCUN thread n'est actif. Rendu pur du modèle dérivé
// (lib/researchHome) : aucune requête, aucune donnée inventée ; toutes les
// actions viennent d'App (vrais workflows uniquement). Composer inchangé
// en dessous — pas de second champ de saisie ici.
import type { ReactElement } from "react";
import { t } from "../lib/i18n";
import {
  type HomeArtefactKind,
  type HomeAttentionItem,
  type HomeContinueItem,
  type HomeRelativeDate,
  type ResearchHomeModel,
} from "../lib/researchHome";
import { Button, EmptyState, InlineNotice, StatusBadge } from "./ui";
import "../styles/research-home.css";

/** Paquet passé d'App à la timeline (via Chat) — modèle dérivé + vrais workflows. */
export type ResearchHomeBundle = { model: ResearchHomeModel; actions: ResearchHomeActions };

export type ResearchHomeActions = {
  onNewChat: () => void;
  onOpenProject: () => void;
  onResume: (threadId: string, projectRoot: string) => void;
  onOpenArtefact: (rel: string) => void;
  onOpenGallery: () => void;
  onOpenPalette: () => void;
  onResumeSession: () => void;
};

function relLabel(rel: HomeRelativeDate | null): string | null {
  if (!rel) return null;
  switch (rel.kind) {
    case "now": return t("home.rel.now");
    case "minutes": return t("home.rel.min", { n: rel.n });
    case "hours": return t("home.rel.hours", { n: rel.n });
    case "days": return t("home.rel.days", { n: rel.n });
    case "date": {
      const d = new Date(rel.iso);
      return Number.isNaN(d.getTime()) ? rel.iso : d.toLocaleDateString();
    }
  }
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

const KIND_GLYPHS: Record<HomeArtefactKind, ReactElement> = {
  figure: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M4.5 10.5l2.5-3 2 2.2L11 7.5l2 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  document: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d="M4 2h5.5L13 5.5V14H4z" strokeLinejoin="round" />
      <path d="M9.5 2v3.5H13M6 8.5h4M6 11h4" strokeLinecap="round" />
    </svg>
  ),
  code: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 4.5L2.5 8 6 11.5M10 4.5L13.5 8 10 11.5" />
    </svg>
  ),
  data: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <ellipse cx="8" cy="4" rx="5" ry="2" />
      <path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" />
    </svg>
  ),
  other: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d="M4 2h5.5L13 5.5V14H4z" strokeLinejoin="round" />
    </svg>
  ),
};

// maps EXHAUSTIVES (le compilateur exige chaque variante — pas de clé i18n
// dynamique qui dégraderait en silence si un statut/type est ajouté)
type I18nKey = Parameters<typeof t>[0];
const STATUS_KEYS: Record<HomeContinueItem["status"], I18nKey> = {
  running: "home.status.running",
  done: "home.status.done",
  interrupted: "home.status.interrupted",
  idle: "home.status.idle",
};
const KIND_KEYS: Record<HomeArtefactKind, I18nKey> = {
  figure: "home.kind.figure",
  document: "home.kind.document",
  code: "home.kind.code",
  data: "home.kind.data",
  other: "home.kind.other",
};

/** Convention 014 : après « Reprendre », le focus va au composer. Exporté pour
 * être câblé par App et testé directement. */
export function focusComposer() {
  requestAnimationFrame(() =>
    document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus());
}

function ContinueCard(p: { item: HomeContinueItem; onResume: ResearchHomeActions["onResume"] }) {
  const { item } = p;
  const rel = relLabel(item.relative);
  return (
    <section className="rh-section rh-sec-continue" aria-label={t("home.continue")}>
      <h2>{t("home.continue")}</h2>
      <div className="rh-continue">
        <div className="t">{item.title}</div>
        <div className="meta">
          <span>{item.provider}</span>
          <span className="sep">·</span>
          {item.status === "running" ? (
            <StatusBadge status="running">{t("home.status.running")}</StatusBadge>
          ) : (
            <span>{t(STATUS_KEYS[item.status])}</span>
          )}
          {item.status === "running" && item.runningForMs != null && (
            <span>{t("home.running-for", { t: fmtDuration(item.runningForMs) })}</span>
          )}
          {rel && item.status !== "running" && (
            // date relative jamais seule : l'ISO du record reste accessible
            <span title={item.updatedAtIso ?? undefined}>{rel}</span>
          )}
          {item.hasUsage && (
            <>
              <span className="sep">·</span>
              <span>{t("home.usage-recorded")}</span>
            </>
          )}
        </div>
        {item.lastAction && <div className="last">{item.lastAction}</div>}
        <div className="act">
          <Button onClick={() => p.onResume(item.threadId, item.projectRoot)}>
            {item.status === "running" ? t("home.back-to-thread") : t("home.resume")}
          </Button>
        </div>
      </div>
    </section>
  );
}

function AttentionList(p: { items: HomeAttentionItem[]; onResume: ResearchHomeActions["onResume"] }) {
  if (!p.items.length) return null;
  return (
    <section className="rh-section rh-sec-attention" aria-label={t("home.attention")}>
      <h2>{t("home.attention")}</h2>
      <div className="rh-attention">
        {p.items.map((it) => {
          if (it.kind === "sidecar") {
            return <InlineNotice key={it.key} tone="error">{t("home.sidecar-offline")}</InlineNotice>;
          }
          if (it.kind === "atelier") {
            return (
              <InlineNotice key={it.key} tone="error">
                <span className="body">
                  {t("home.atelier-error")}
                  {it.detail && <span className="d">{it.detail}</span>}
                </span>
              </InlineNotice>
            );
          }
          return (
            <InlineNotice key={it.key} tone="warning">
              <span className="body">
                <span>{it.title} — {t("home.status.interrupted")}</span>
                {it.detail && <span className="d">{it.detail}</span>}
              </span>
              {it.threadId && it.projectRoot && (
                <Button variant="ghost" onClick={() => p.onResume(it.threadId!, it.projectRoot!)}>
                  {t("home.resume")}
                </Button>
              )}
            </InlineNotice>
          );
        })}
      </div>
    </section>
  );
}

export function ResearchHome(p: { model: ResearchHomeModel; actions: ResearchHomeActions }) {
  const { model, actions } = p;

  if (model.state === "no-project") {
    return (
      <div className="research-home">
        <div className="rh-noproject">
          <EmptyState
            title={t("home.no-project-title")}
            description={t("home.no-project-desc")}
            actions={
              <Button variant="primary" onClick={actions.onOpenProject}>
                {t("action.open-project")}
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const starters = (
    <section className="rh-section rh-sec-start" aria-label={t("home.start")}>
      <h2>{t("home.start")}</h2>
      <div className="rh-rows">
        <button type="button" className="rh-row" onClick={actions.onNewChat}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
            <path d="M8 3.5v9M3.5 8h9" />
          </svg>
          <span className="name">{t("action.new-chat")}</span>
        </button>
        <button type="button" className="rh-row" onClick={actions.onOpenPalette}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
            <circle cx="7" cy="7" r="4" />
            <path d="M13 13l-3-3" strokeLinecap="round" />
          </svg>
          <span className="name">{t("home.search-file")}</span>
        </button>
        <button type="button" className="rh-row" onClick={actions.onOpenGallery}>
          {KIND_GLYPHS.figure}
          <span className="name">{t("home.open-gallery")}</span>
        </button>
        <button type="button" className="rh-row" onClick={actions.onResumeSession}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 2.5v8M8 10.5L5 7.7M8 10.5l3-2.8M3 13.5h10" />
          </svg>
          <span className="name">{t("action.resume-session")}</span>
        </button>
      </div>
    </section>
  );

  const artefacts = model.artefacts.length > 0 && (
    <section className="rh-section rh-sec-artefacts" aria-label={t("home.artefacts")}>
      <h2>{t("home.artefacts")}</h2>
      <div className="rh-rows">
        {model.artefacts.map((a) => (
          <button
            key={a.rel}
            type="button"
            className="rh-row"
            title={`${t("home.open-in-atelier")} — ${a.rel}`}
            onClick={() => actions.onOpenArtefact(a.rel)}
          >
            {KIND_GLYPHS[a.kind]}
            <span className="name">{a.name}</span>
            {a.dir && <span className="src">{a.dir}</span>}
            <span className="kind">{t(KIND_KEYS[a.kind])}</span>
          </button>
        ))}
      </div>
    </section>
  );

  return (
    <div className="research-home">
      <div className="rh">
        <header className="rh-head">
          {/* identité projet = crumb TopBar uniquement (demande Thierry) ;
              le h1 reste pour la structure, invisible à l'écran */}
          <h1 className="rh-title sr-only">{model.projectName}</h1>
          <div className="spacer" />
          <div className="actions">
            {/* demande Thierry (2026-07-10) : pas de Nouveau chat ici —
                la section Démarrer et le panneau Projets le portent déjà */}
            {model.degraded && <StatusBadge status="warning">{t("home.degraded")}</StatusBadge>}
          </div>
        </header>

        <div className="rh-grid">
          <div className="rh-col">
            {model.loading ? (
              // démarrage à froid : géométrie préservée, placeholders sobres,
              // aucun shimmer (contrat plan 017 § Chargement)
              <div className="rh-skeleton rh-sec-continue" aria-hidden="true">
                <div className="bar w60" />
                <div className="bar w40" />
              </div>
            ) : model.continueItem ? (
              <ContinueCard item={model.continueItem} onResume={actions.onResume} />
            ) : (
              <p className="rh-hint rh-sec-continue">{t("home.no-threads")}</p>
            )}
            {artefacts}
          </div>
          <div className="rh-col">
            <AttentionList items={model.attention} onResume={actions.onResume} />
            {starters}
          </div>
        </div>
      </div>
    </div>
  );
}
