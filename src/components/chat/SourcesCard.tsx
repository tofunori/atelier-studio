// Carte « Sources » sous la réponse d'un tour qui a cherché sur le web
// (maquette « Narration du tour », 2026-08-27). Les liens sont MOISSONNÉS dans
// le markdown du message : aucun réseau, aucune donnée inventée. Domaine en
// avant, pas de favicon (système sobre : SVG monochrome), plafond 6 + « n de
// plus ». Clic = navigateur d'ATELIER (surface browser, même canal que les
// citations kb) ; ⌘clic = navigateur système via le <a target="_blank">.
import type { MouseEvent } from "react";
import { t } from "../../lib/i18n";
import { harvestWebSources } from "../../lib/webSources";

import { LucideGlobe } from "lucide-react";
function GlobeIcon() {
  return (
    <LucideGlobe size={12} />
  );
}

function openInAtelier(e: MouseEvent<HTMLAnchorElement>, url: string) {
  // ⌘/Ctrl/molette : laisser le lien faire son travail (navigateur système).
  if (e.metaKey || e.ctrlKey || e.button !== 0) return;
  e.preventDefault();
  window.dispatchEvent(new CustomEvent("chat-open-web-url", { detail: { url } }));
}

export function SourcesCard({ markdown }: { markdown: string }) {
  const { sources, more } = harvestWebSources(markdown);
  if (sources.length === 0) return null;
  return (
    <div className="sources-card" data-testid="sources-card">
      <div className="sources-card-label">{t("chat.sources")}</div>
      <div className="sources-card-row">
        {sources.map((s) => (
          <a
            key={s.url}
            className="source-chip"
            href={s.url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => openInAtelier(e, s.url)}
            title={t("chat.sources-open", { url: s.label ? `${s.label} — ${s.url}` : s.url })}
          >
            <GlobeIcon />
            <span className="source-chip-domain">{s.domain}</span>
            {s.label ? <span className="source-chip-label">{s.label}</span> : null}
          </a>
        ))}
        {more > 0 ? (
          <span className="sources-card-more">{t("chat.sources-more", { n: more })}</span>
        ) : null}
      </div>
    </div>
  );
}
