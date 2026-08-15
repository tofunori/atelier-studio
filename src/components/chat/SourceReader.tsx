// Lecteur d'une source. LECTURE SEULE : ouvrir ne fait entrer rien nulle part —
// épingler (dépôt) et attacher (base) restent des gestes distincts, à côté.
//
// Deux cibles, une seule vue : une page du dépôt gbrain (par slug) ou une
// source de la base (par id). Ce qu'il montre est le texte STOCKÉ, celui qui
// part réellement dans le contexte — pas le fichier sur le disque. L'écart
// entre les deux est la raison d'être de ce lecteur : un CSV de 68 ko y entre
// sous forme de profil de 2 ko, et rien d'autre ne le dit.
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { MD_COMPONENTS, useMdPlugins } from "./md";
import { mineruTablesToMarkdown, splitFrontMatter } from "../../lib/mineruTables";
import { t } from "../../lib/i18n";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { RowButton } from "../ui/RowButton";
import { wsSend } from "../../lib/wsBus";

// ---- surlignage d'une citation (tâche 6) -----------------------------------
// Custom Highlight API si `CSS.highlights` existe (mêmes classes que
// ::highlight(chat-hl), Chat.tsx), sinon repli DOM `<mark class="reader-quote">`
// (jsdom, et tout navigateur sans le support). Le match est normalisé (NFKD,
// minuscules, espaces réduits) sur les ~80 premiers caractères de la citation
// — le texte RENDU (markdown → DOM) peut différer légèrement de la citation
// telle qu'émise (espaces, accents perdus au copier-coller, casse).

const DIACRITIC = /[\u0300-\u036f]/;
const WORD_CHAR = /[a-z0-9]/;

/** Normalise `raw` pour la comparaison, en gardant pour chaque caractère
 * normalisé conservé l'index du caractère d'ORIGINE dont il provient — la
 * seule façon de reconstruire ensuite un Range DOM valide (offsets dans le
 * texte réel, accents/casse intacts). */
function normalizeWithMap(raw: string): { text: string; map: number[] } {
  const text: string[] = [];
  const map: number[] = [];
  let lastWasSpace = true; // pas d'espace de tête
  for (let i = 0; i < raw.length; i++) {
    for (const ch of raw[i].normalize("NFKD")) {
      if (DIACRITIC.test(ch)) continue;
      const lower = ch.toLowerCase();
      const isWord = WORD_CHAR.test(lower);
      const outCh = isWord ? lower : " ";
      if (outCh === " ") {
        if (lastWasSpace) continue;
        lastWasSpace = true;
      } else {
        lastWasSpace = false;
      }
      text.push(outCh);
      map.push(i);
    }
  }
  while (text.length && text[text.length - 1] === " ") {
    text.pop();
    map.pop();
  }
  return { text: text.join(""), map };
}

const normalizeQuote = (quote: string) => normalizeWithMap(quote.slice(0, 80)).text;

/** Première occurrence normalisée de `quote` dans un nœud texte descendant de
 * `root`, comme Range dans le texte D'ORIGINE — `null` si introuvable. Un seul
 * nœud texte à la fois (comme le surlignage des citations du chat, Chat.tsx) :
 * couvre l'immense majorité des passages, qui vivent dans un seul paragraphe. */
function findQuoteRange(root: HTMLElement, quote: string): Range | null {
  const needle = normalizeQuote(quote);
  if (!needle) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const { text, map } = normalizeWithMap(node.textContent ?? "");
    const idx = text.indexOf(needle);
    if (idx < 0) continue;
    const range = document.createRange();
    range.setStart(node, map[idx]);
    range.setEnd(node, map[idx + needle.length - 1] + 1);
    return range;
  }
  return null;
}

/** Retire un éventuel repli `<mark class="reader-quote">` précédent en le
 * dépliant dans son parent (texte compris), pour ne jamais empiler deux
 * surlignages quand la citation change sans démonter le lecteur. */
function clearFallbackMark(root: HTMLElement) {
  const prev = root.querySelector("mark.reader-quote");
  const parent = prev?.parentNode;
  if (!prev || !parent) return;
  while (prev.firstChild) parent.insertBefore(prev.firstChild, prev);
  parent.removeChild(prev);
  parent.normalize();
}

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

  const docRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const registry = (CSS as any).highlights as
      | { set(name: string, hl: unknown): void; delete(name: string): void }
      | undefined;
    const root = docRef.current;
    registry?.delete("reader-quote");
    if (root) clearFallbackMark(root);
    if (!root || !p.highlightQuote || etat.phase !== "prete" || dossier || vue !== "rendu") return;
    const range = findQuoteRange(root, p.highlightQuote);
    if (!range) return;
    const HighlightCtor = (window as any).Highlight;
    if (HighlightCtor && registry) {
      registry.set("reader-quote", new HighlightCtor(range));
    } else {
      const mark = document.createElement("mark");
      mark.className = "reader-quote";
      range.surroundContents(mark);
    }
    const target = range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer.parentElement
      : (range.startContainer as Element);
    target?.scrollIntoView({ block: "center" });
    return () => { registry?.delete("reader-quote"); };
  }, [p.highlightQuote, etat, vue, dossier]);

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
              <div className="gbr-md msg typeset" ref={docRef}>
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
