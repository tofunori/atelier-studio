// En-têtes locaux Atelier (plan 018, étape 2) — surfaces pilotes galerie et
// document. Rendu pur : aucune donnée inventée (pas de dirty/read-only, état
// indisponible côté React) ; pas de drag region — la zone de drag reste la
// TopBar. L'action recharger MIGRE ici depuis la TopBar (même title).
import { t, type I18nKey } from "../lib/i18n";
import { artefactKind, type HomeArtefactKind } from "../lib/researchHome";
import { IconButton, SurfaceHeader } from "./ui";
import { RefreshIcon } from "./icons";
import "../styles/local-headers.css";

import { InfoIcon } from "lucide-react";
/** Même vocabulaire que Research Home (017) — un artefact garde son genre. */
const KIND_KEYS: Record<HomeArtefactKind, I18nKey> = {
  figure: "home.kind.figure",
  document: "home.kind.document",
  code: "home.kind.code",
  data: "home.kind.data",
  other: "home.kind.other",
};

export function GalleryHeader(p: { projectName: string | null; onRefresh: () => void }) {
  const refresh = t("action.refresh-hard");
  return (
    <SurfaceHeader
      className="atelier-surface-header"
      eyebrow={p.projectName ?? undefined}
      title={t("atelier.gallery-title")}
      actions={
        <IconButton label={refresh} title={refresh} size="s" onClick={p.onRefresh}>
          <RefreshIcon />
        </IconButton>
      }
    />
  );
}

export function DocumentHeader(p: { rel: string; onInspect?: (rel: string) => void }) {
  const segs = p.rel.split("/");
  const name = segs[segs.length - 1] || p.rel;
  const dir = segs.slice(0, -1).join("/");
  return (
    <SurfaceHeader
      className="atelier-surface-header"
      // chemin : casse d'origine, police code (audit SHELL-21)
      eyebrow={dir ? <span className="eyebrow-path">{dir}</span> : undefined}
      // nom accessible complet : le chemin projet entier via title natif
      title={<span title={p.rel}>{name}</span>}
      actions={
        <>
          {/* méta descriptive, pas une action (règle .atelier-surface-header .kind) */}
          <span className="kind">{t(KIND_KEYS[artefactKind(p.rel)])}</span>
          {/* accès CLAVIER à l'inspecteur (le menu contextuel d'onglet ne
              l'est pas) — panel 018 */}
          {p.onInspect && (
            <IconButton label={t("inspector.open")} title={t("inspector.open")} size="s"
              onClick={() => p.onInspect!(p.rel)}>
              <InfoIcon size={14} />
            </IconButton>
          )}
        </>
      }
    />
  );
}

/** Méta du document actif intégrée à la barre d'onglets IDE. */
export function DocumentTabMeta(p: { rel: string; onInspect?: (rel: string) => void }) {
  const segs = p.rel.split("/");
  const dir = segs.slice(0, -1).join("/");
  return (
    <div className="atelier-document-meta">
      {dir && <span className="source" title={p.rel}>{dir}</span>}
      <span className="kind">{t(KIND_KEYS[artefactKind(p.rel)])}</span>
      {p.onInspect && (
        <IconButton label={t("inspector.open")} title={t("inspector.open")} size="s"
          onClick={() => p.onInspect!(p.rel)}>
          <InfoIcon size={14} />
        </IconButton>
      )}
    </div>
  );
}
