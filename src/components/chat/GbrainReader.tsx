// Lecteur d'une page du dépôt gbrain. LECTURE SEULE : ouvrir une page ne la
// fait pas entrer dans la base — épingler reste un geste distinct, à côté.
// Deux vues, parce qu'on n'ouvre pas une page pour la même raison : lire
// l'article (Rendu) ou vérifier ce que le convertisseur en a fait (Source).
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { MD_COMPONENTS, useMdPlugins } from "./md";
import { mineruTablesToMarkdown, splitFrontMatter } from "../../lib/mineruTables";
import { t } from "../../lib/i18n";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { RowButton } from "../ui/RowButton";
import { wsSend } from "../../lib/wsBus";

export type GbrainReaderProps = {
  slug: string;
  onClose(): void;
  onPin(slug: string): void;
  onOpenOrigin?(path: string): void;
};

type Etat =
  | { phase: "chargement" }
  | { phase: "erreur"; message: string }
  | { phase: "prete"; markdown: string; chars: number };

export default function GbrainReader(p: GbrainReaderProps) {
  const [etat, setEtat] = useState<Etat>({ phase: "chargement" });
  const [vue, setVue] = useState<"rendu" | "source">("rendu");
  const plugins = useMdPlugins();

  useEffect(() => {
    setEtat({ phase: "chargement" });
    setVue("rendu");
    const onPage = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { slug?: string; markdown?: string; chars?: number; error?: string }
        | undefined;
      if (!detail || detail.slug !== p.slug) return;
      if (detail.error) { setEtat({ phase: "erreur", message: detail.error }); return; }
      setEtat({
        phase: "prete",
        markdown: String(detail.markdown ?? ""),
        chars: Number(detail.chars ?? 0),
      });
    };
    window.addEventListener("gbrain-page", onPage);
    wsSend({ type: "kbGbrainPage", slug: p.slug });
    return () => window.removeEventListener("gbrain-page", onPage);
  }, [p.slug]);

  const page = useMemo(() => {
    if (etat.phase !== "prete") return null;
    const { meta, body } = splitFrontMatter(etat.markdown);
    return { meta, body, rendu: mineruTablesToMarkdown(body) };
  }, [etat]);

  const origine = page?.meta.origin ?? "";
  const nomFichier = origine.split("/").pop() ?? "";

  return (
    <div className="gbr">
      <div className="gbr-bar">
        <RowButton className="gbr-back" onClick={p.onClose}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
          {t("gbr.back")}
        </RowButton>
        <span className="gbr-slug" title={p.slug}>{p.slug}</span>
        <span className="gbr-spacer" />
        {page && (
          <span className="gbr-seg" role="tablist" aria-label={t("gbr.views")}>
            {(["rendu", "source"] as const).map((cle) => (
              <RowButton
                key={cle}
                role="tab"
                aria-selected={vue === cle}
                className={`gbr-seg-tab ${vue === cle ? "on" : ""}`}
                onClick={() => setVue(cle)}
              >
                {t(cle === "rendu" ? "gbr.view-rendered" : "gbr.view-source")}
              </RowButton>
            ))}
          </span>
        )}
        <Button type="button" variant="ghost" className="ghost" onClick={() => p.onPin(p.slug)}>
          {t("gbr.pin")}
        </Button>
        {origine && p.onOpenOrigin && (
          <Button type="button" variant="ghost" className="ghost"
            title={origine} onClick={() => p.onOpenOrigin?.(origine)}>
            {t("gbr.open-origin")}
          </Button>
        )}
        {page && (
          <IconButton
            size="s" className="ghost" label={t("gbr.copy")} title={t("gbr.copy")}
            onClick={() => { void navigator.clipboard?.writeText(etat.phase === "prete" ? etat.markdown : ""); }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 012-2h8" />
            </svg>
          </IconButton>
        )}
      </div>

      {etat.phase === "chargement" && <div className="gbr-empty">{t("gbr.loading")}</div>}
      {etat.phase === "erreur" && <div className="kb-error"><span className="kb-error-text">{etat.message}</span></div>}

      {page && (
        <>
          {/* Le front matter devient une fiche : ouvrir un article sur douze
              lignes de YAML, c'est commencer par la plomberie. */}
          <div className="gbr-meta">
            <h2 className="gbr-title">{page.meta.title || p.slug}</h2>
            {page.meta.authors && <div className="gbr-authors">{page.meta.authors}</div>}
            <div className="gbr-facts">
              {page.meta.year ? <span className="gbr-fact"><b>{page.meta.year}</b></span> : null}
              {page.meta.journal && <span className="gbr-fact">{page.meta.journal}</span>}
              {page.meta.doi && <span className="gbr-fact">doi <b>{page.meta.doi}</b></span>}
              {page.meta.converter && (
                <span className="gbr-fact on">{t("gbr.converted-by", { c: page.meta.converter })}</span>
              )}
              <span className="gbr-fact"><b>{etat.phase === "prete" ? etat.chars.toLocaleString("fr-CA") : 0}</b> {t("gbr.chars")}</span>
              {nomFichier && <span className="gbr-fact" title={origine}>{nomFichier}</span>}
            </div>
          </div>

          <div className="gbr-doc">
            {vue === "rendu" ? (
              <div className="gbr-md msg typeset">
                <ReactMarkdown
                  remarkPlugins={plugins.remark}
                  rehypePlugins={plugins.rehype}
                  components={MD_COMPONENTS as never}
                >
                  {page.rendu}
                </ReactMarkdown>
              </div>
            ) : (
              <pre className="gbr-src">{etat.phase === "prete" ? etat.markdown : ""}</pre>
            )}
          </div>
        </>
      )}
    </div>
  );
}
