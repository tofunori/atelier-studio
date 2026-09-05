// Lecteur d'une source. LECTURE SEULE : ouvrir ne fait entrer rien nulle part —
// épingler (dépôt) et attacher (base) restent des gestes distincts, à côté.
//
// Deux cibles, une seule vue : une page du dépôt gbrain (par slug) ou une
// source de la base (par id). Ce qu'il montre est le texte STOCKÉ, celui qui
// part réellement dans le contexte — pas le fichier sur le disque. L'écart
// entre les deux est la raison d'être de ce lecteur : un CSV de 68 ko y entre
// sous forme de profil de 2 ko, et rien d'autre ne le dit.
import { memo, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { MD_COMPONENTS, useMdPlugins } from "./md";
import { mineruTablesToMarkdown, splitFrontMatter } from "../../lib/mineruTables";
import { t } from "../../lib/i18n";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { RowButton } from "../ui/RowButton";
import { normalizeMathDelimiters } from "../../lib/markdown";
import { Input } from "../shadcn/input";
import { findDocumentRanges, highlightDocumentRanges, clearDocumentHighlights } from "../../lib/documentSearch";
import { wsSend } from "../../lib/wsBus";

// ---- surlignage d'une citation (tâche 6) -----------------------------------
// Custom Highlight API si `CSS.highlights` existe (mêmes classes que
// ::highlight(chat-hl), Chat.tsx), sinon classe sur les éléments existants
// (jsdom, et tout navigateur sans le support). Le match est normalisé (NFKD,
// minuscules, espaces réduits) sur les ~80 premiers caractères de la citation
// — le texte RENDU (markdown → DOM) peut différer légèrement de la citation
// telle qu'émise (espaces, accents perdus au copier-coller, casse).

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
  /** Citation à défiler et surligner dès que le texte rendu arrive (tâche 6,
   * carte passage gbrain) — ignorée en vue « source » et pour les dossiers. */
  highlightQuote?: string;
};

type Etat =
  | { phase: "chargement" }
  | { phase: "erreur"; message: string }
  | { phase: "prete"; markdown: string; chars: number; title?: string; kind?: string;
      origin?: string; files?: FolderFile[] };

const nb = (n: number) => n.toLocaleString("fr-CA");

// Search and outline controls must not reparse an unchanged full article.
const ArticleMarkdown = memo(function ArticleMarkdown({text}: {text: string}) {
  const plugins = useMdPlugins();
  return <ReactMarkdown remarkPlugins={plugins.remark} rehypePlugins={plugins.rehype} components={MD_COMPONENTS as never}>{text}</ReactMarkdown>;
});

export default function SourceReader(p: SourceReaderProps) {
  const [etat, setEtat] = useState<Etat>({ phase: "chargement" });
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [headings, setHeadings] = useState<Array<{title: string; id: string}>>([]);
  const [reload, setReload] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [vue, setVue] = useState<"rendu" | "source">("rendu");
  const plugins = useMdPlugins();
  const cible = p.target;
  const clef = cible.kind === "gbrain" ? cible.slug : cible.id;

  useEffect(() => {
    setEtat({ phase: "chargement" });
    setVue("rendu");
    setQuery(""); setMatchIndex(0);
    const attendu = cible.kind === "gbrain" ? "gbrain-page" : "source-text";
    let timeout: ReturnType<typeof setTimeout>;
    const onReponse = (event: Event) => {
      const d = (event as CustomEvent).detail as Record<string, unknown> | undefined;
      if (!d) return;
      const recu = String(cible.kind === "gbrain" ? d.slug ?? "" : d.id ?? "");
      if (recu !== clef) return;
      clearTimeout(timeout);
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
    const sent = wsSend(cible.kind === "gbrain"
      ? { type: "kbGbrainPage", slug: cible.slug }
      : { type: "kbSourceText", id: cible.id });
    if (!sent) setEtat({phase: "erreur", message: "Connexion indisponible. Réessaie après la reconnexion."});
    else timeout = setTimeout(() => setEtat({phase: "erreur", message: "Le document ne répond pas. Réessaie."}), 15000);
    return () => { clearTimeout(timeout); window.removeEventListener(attendu, onReponse); };
  }, [cible.kind, clef, reload]);

  const page = useMemo(() => {
    if (etat.phase !== "prete") return null;
    const { meta, body } = splitFrontMatter(etat.markdown);
    return { meta, body, rendu: normalizeMathDelimiters(mineruTablesToMarkdown(body)) };
  }, [etat]);

  const dossier = etat.phase === "prete" && etat.kind === "folder" ? etat.files ?? [] : null;
  const origine = page?.meta.origin ?? (etat.phase === "prete" ? etat.origin ?? "" : "");
  const nomFichier = origine.split("/").pop() ?? "";
  const titre = page?.meta.title
    || (etat.phase === "prete" ? etat.title : undefined)
    || clef;

  const docRef = useRef<HTMLDivElement>(null);
  const positionKey = `atelier.reader.position:${cible.kind}:${clef}:${vue}`;
  useEffect(() => {
    const root = docRef.current;
    if (!root || etat.phase !== "prete") { setHeadings([]); return; }
    const titles = Array.from(root.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6"));
    titles.forEach((heading, index) => { heading.id = `reader-section-${index}`; });
    setHeadings(titles.map(h => ({title: h.textContent || "", id: h.id})));
  }, [etat, vue, plugins]);
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || etat.phase !== "prete") return;
    try { scroller.scrollTop = Number(localStorage.getItem(positionKey) || 0); } catch { /* private storage */ }
    return () => { try { localStorage.setItem(positionKey, String(scroller.scrollTop)); } catch { /* private storage */ } };
  }, [positionKey, etat.phase]);
  useEffect(() => {
    const root = docRef.current;
    if (!root || etat.phase !== "prete" || dossier || vue !== "rendu") return;
    clearDocumentHighlights(root, "reader-quote");
    if (!p.highlightQuote) return;
    const range = findDocumentRanges(root, p.highlightQuote, 1)[0];
    if (!range) return;
    const target = range.startContainer.parentElement;
    highlightDocumentRanges(root, "reader-quote", [range]);
    target?.scrollIntoView?.({block: "center"});
    return () => clearDocumentHighlights(root, "reader-quote");
  }, [p.highlightQuote, etat, vue, dossier, plugins]);
  useEffect(() => {
    const root = docRef.current;
    if (!root) { setMatchCount(0); return; }
    clearDocumentHighlights(root, "reader-search");
    const ranges = searchOpen ? findDocumentRanges(root, query) : [];
    setMatchCount(ranges.length);
    const active = ranges.length ? ranges[matchIndex % ranges.length] : null;
    const target = active?.startContainer.parentElement;
    highlightDocumentRanges(root, "reader-search", active ? [active] : []);
    target?.scrollIntoView?.({block: "center"});
    return () => clearDocumentHighlights(root, "reader-search");
  }, [query, matchIndex, searchOpen, etat, vue, plugins]);

  return (
    <div className="gbr" onKeyDown={(event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault(); setSearchOpen(true); requestAnimationFrame(() => inputRef.current?.focus());
      }
      if (event.key === "Escape") { setSearchOpen(false); setOutlineOpen(false); }
    }}>
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
        {page && !dossier && <>
          <RowButton className="gbr-tool" aria-label="Rechercher dans l’article" aria-expanded={searchOpen} onClick={() => { setSearchOpen(v => !v); requestAnimationFrame(() => inputRef.current?.focus()); }}>Rechercher</RowButton>
          {vue === "rendu" && headings.length > 0 && <RowButton className="gbr-tool" aria-expanded={outlineOpen} onClick={() => setOutlineOpen(v => !v)}>Plan</RowButton>}
        </>}
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

      {searchOpen && <div className="gbr-search" role="search">
        <Input ref={inputRef} aria-label="Rechercher dans l’article" placeholder="Mot ou passage…" value={query} onChange={event => {setQuery(event.target.value); setMatchIndex(0);}} onKeyDown={event => {if (event.key === "Enter") {event.preventDefault(); setMatchIndex(i => matchCount ? (i + (event.shiftKey ? matchCount - 1 : 1)) % matchCount : 0);}}} />
        <span role="status">{matchCount ? `${matchIndex % matchCount + 1}/${matchCount}` : query ? "Aucun résultat" : ""}</span>
        <RowButton disabled={!matchCount} aria-label="Résultat précédent" onClick={() => setMatchIndex(i => (i + matchCount - 1) % matchCount)}>↑</RowButton>
        <RowButton disabled={!matchCount} aria-label="Résultat suivant" onClick={() => setMatchIndex(i => (i + 1) % matchCount)}>↓</RowButton>
      </div>}
      {outlineOpen && vue === "rendu" && <nav className="gbr-outline" aria-label="Plan de l’article">{headings.map(h => <RowButton key={h.id} onClick={() => {docRef.current?.querySelector(`#${h.id}`)?.scrollIntoView?.({block:"start"}); setOutlineOpen(false);}}>{h.title}</RowButton>)}</nav>}
      {etat.phase === "chargement" && <div className="gbr-empty">{t("gbr.loading")}</div>}
      {etat.phase === "erreur" && (
        <div className="kb-error"><span className="kb-error-text">{etat.message}</span><Button variant="ghost" onClick={() => setReload(v => v + 1)}>Réessayer</Button></div>
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

          <div className="gbr-doc" ref={scrollRef}>
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
              <div className="gbr-md msg typeset" ref={docRef}>
                <ArticleMarkdown text={page?.rendu ?? ""} />
              </div>
            ) : (
              <pre className="gbr-src" ref={docRef as never}>{etat.markdown}</pre>
            )}
          </div>
        </>
      )}
    </div>
  );
}
