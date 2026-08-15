// Lecteur d'une source. LECTURE SEULE : ouvrir ne fait entrer rien nulle part —
// épingler (dépôt) et attacher (base) restent des gestes distincts, à côté.
//
// Deux cibles, une seule vue : une page du dépôt gbrain (par slug) ou une
// source de la base (par id). Ce qu'il montre est le texte STOCKÉ, celui qui
// part réellement dans le contexte — pas le fichier sur le disque. L'écart
// entre les deux est la raison d'être de ce lecteur : un CSV de 68 ko y entre
// sous forme de profil de 2 ko, et rien d'autre ne le dit.
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { MD_COMPONENTS, useMdPlugins } from "./md";
import { mineruTablesToMarkdown, splitFrontMatter } from "../../lib/mineruTables";
import { t } from "../../lib/i18n";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { RowButton } from "../ui/RowButton";
import { wsSend } from "../../lib/wsBus";

/** Page du dépôt, ou source de la base. */
export type ReaderTarget =
  | { kind: "gbrain"; slug: string }
  | { kind: "source"; id: string };

export type FolderFile = { rel: string; chars: number };

export type SourceReaderProps = {
  target: ReaderTarget;
  onClose(): void;
  /** Dépôt : faire entrer la page dans la base. */
  onPin?(slug: string): void;
  /** Base : bascule « contenu complet » de cette source. */
  onToggleFull?(id: string): void;
  full?: boolean;
};

type Etat =
  | { phase: "chargement" }
  | { phase: "erreur"; message: string }
  | { phase: "prete"; markdown: string; chars: number; title?: string; kind?: string;
      origin?: string; files?: FolderFile[] };

const nb = (n: number) => n.toLocaleString("fr-CA");

export default function SourceReader(p: SourceReaderProps) {
  const [etat, setEtat] = useState<Etat>({ phase: "chargement" });
  const [vue, setVue] = useState<"rendu" | "source">("rendu");
  const plugins = useMdPlugins();
  const cible = p.target;
  const clef = cible.kind === "gbrain" ? cible.slug : cible.id;

  useEffect(() => {
    setEtat({ phase: "chargement" });
    setVue("rendu");
    const attendu = cible.kind === "gbrain" ? "gbrain-page" : "source-text";
    const onReponse = (event: Event) => {
      const d = (event as CustomEvent).detail as Record<string, unknown> | undefined;
      if (!d) return;
      const recu = String(cible.kind === "gbrain" ? d.slug ?? "" : d.id ?? "");
      if (recu !== clef) return;
      if (d.error) { setEtat({ phase: "erreur", message: String(d.error) }); return; }
      setEtat({
        phase: "prete",
        markdown: String(d.markdown ?? d.text ?? ""),
        chars: Number(d.chars ?? 0),
        title: d.title ? String(d.title) : undefined,
        kind: d.kind ? String(d.kind) : undefined,
        origin: d.origin ? String(d.origin) : undefined,
        files: Array.isArray(d.files) ? (d.files as FolderFile[]) : undefined,
      });
    };
    window.addEventListener(attendu, onReponse);
    wsSend(cible.kind === "gbrain"
      ? { type: "kbGbrainPage", slug: cible.slug }
      : { type: "kbSourceText", id: cible.id });
    return () => window.removeEventListener(attendu, onReponse);
  }, [cible.kind, clef]);

  const page = useMemo(() => {
    if (etat.phase !== "prete") return null;
    const { meta, body } = splitFrontMatter(etat.markdown);
    return { meta, body, rendu: mineruTablesToMarkdown(body) };
  }, [etat]);

  const dossier = etat.phase === "prete" && etat.kind === "folder" ? etat.files ?? [] : null;
  const origine = page?.meta.origin ?? (etat.phase === "prete" ? etat.origin ?? "" : "");
  const nomFichier = origine.split("/").pop() ?? "";
  const titre = page?.meta.title
    || (etat.phase === "prete" ? etat.title : undefined)
    || clef;

  return (
    <div className="gbr">
      <div className="gbr-bar">
        <RowButton className="gbr-back" onClick={p.onClose}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
          {t(cible.kind === "gbrain" ? "gbr.back" : "gbr.back-base")}
        </RowButton>
        <span className="gbr-slug" title={clef}>{clef}</span>
        <span className="gbr-spacer" />
        {/* Un dossier n'a pas de « source » à montrer : il a des fichiers. */}
        {page && !dossier && (
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
        {cible.kind === "gbrain" && p.onPin && (
          <Button type="button" variant="ghost" className="ghost"
            onClick={() => p.onPin?.(cible.slug)}>
            {t("gbr.pin")}
          </Button>
        )}
        {/* Le réglage qui décide combien de la source entre dans le contexte se
            règle ici, en la lisant — pas dans un menu à trois niveaux. */}
        {cible.kind === "source" && p.onToggleFull && (
          <Button type="button" variant="ghost" className={`ghost ${p.full ? "on" : ""}`}
            onClick={() => p.onToggleFull?.(cible.id)}>
            {t(p.full ? "gbr.full-on" : "gbr.full-off")}
          </Button>
        )}
        {etat.phase === "prete" && (
          <IconButton
            size="s" className="ghost" label={t("gbr.copy")} title={t("gbr.copy")}
            onClick={() => { void navigator.clipboard?.writeText(etat.markdown); }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 012-2h8" />
            </svg>
          </IconButton>
        )}
      </div>

      {etat.phase === "chargement" && <div className="gbr-empty">{t("gbr.loading")}</div>}
      {etat.phase === "erreur" && (
        <div className="kb-error"><span className="kb-error-text">{etat.message}</span></div>
      )}

      {etat.phase === "prete" && (
        <>
          <div className="gbr-meta">
            <h2 className="gbr-title">{titre}</h2>
            {page?.meta.authors && <div className="gbr-authors">{page.meta.authors}</div>}
            <div className="gbr-facts">
              {page?.meta.year ? <span className="gbr-fact"><b>{page.meta.year}</b></span> : null}
              {page?.meta.journal && <span className="gbr-fact">{page.meta.journal}</span>}
              {page?.meta.doi && <span className="gbr-fact">doi <b>{page.meta.doi}</b></span>}
              {page?.meta.converter && (
                <span className="gbr-fact on">{t("gbr.converted-by", { c: page.meta.converter })}</span>
              )}
              {dossier && <span className="gbr-fact"><b>{nb(dossier.length)}</b> {t("gbr.files")}</span>}
              <span className="gbr-fact"><b>{nb(etat.chars)}</b> {t("gbr.chars-context")}</span>
              {nomFichier && <span className="gbr-fact" title={origine}>{nomFichier}</span>}
            </div>
          </div>

          <div className="gbr-doc">
            {dossier ? (
              // 103 000 caractères collés bout à bout ne se lisent pas : un
              // dossier se parcourt par ses fichiers.
              <div className="gbr-files">
                {dossier.map((file) => (
                  <div className="gbr-file" key={file.rel}>
                    <span className="gbr-file-p" title={file.rel}>{file.rel}</span>
                    <span className="gbr-file-s">{nb(file.chars)} {t("gbr.chars")}</span>
                  </div>
                ))}
              </div>
            ) : vue === "rendu" ? (
              <div className="gbr-md msg typeset">
                <ReactMarkdown
                  remarkPlugins={plugins.remark}
                  rehypePlugins={plugins.rehype}
                  components={MD_COMPONENTS as never}
                >
                  {page?.rendu ?? ""}
                </ReactMarkdown>
              </div>
            ) : (
              <pre className="gbr-src">{etat.markdown}</pre>
            )}
          </div>
        </>
      )}
    </div>
  );
}
