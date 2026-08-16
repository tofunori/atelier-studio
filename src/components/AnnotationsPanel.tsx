// Panneau Annotations — le jumeau LARGE de l'Explorateur (demande de Thierry,
// 2026-08-17) : un panneau latéral à bascule qui montre toute la bibliothèque
// annotée SANS ouvrir de PDF. Données : /pdfannot-all du serveur galerie
// (store commun + fusion de l'ancien store du projet). Le panneau DANS le
// lecteur reste — lui sert la lecture, celui-ci sert l'écriture.
import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "../lib/i18n";
import { IconButton, RowButton } from "./ui";

export type PdfAnnot = {
  id: string | number;
  page: number | string;
  kind?: string;
  text?: string;
  note?: string;
  color?: string;
  rects?: number[][];
  pin?: number[];
};

/** « Williamson et al. - 2025 - Titre.pdf » → « Williamson et al. 2025 » —
 * même règle que le lecteur et les cartes du chat. */
export function annotCiteRef(rel: string): string {
  const base = (rel.split("/").pop() ?? rel).replace(/\.[a-z0-9]+$/i, "");
  const m = /^(.{2,60}?)\s+-\s+(\d{4})\s+-\s+/.exec(base);
  if (m) return `${m[1]} ${m[2]}`;
  return base.length > 34 ? `${base.slice(0, 33)}…` : base;
}

/** Le texte d'attache au chat — même forme que le « → chat » du lecteur. */
export function annotQuoteText(rel: string, a: PdfAnnot): string {
  const quote = (a.text ?? "").replace(/\s+/g, " ").trim();
  const head = `${rel} (p.${a.page})`;
  const body = quote ? ` : « ${quote} »` : a.kind === "area" ? " : [zone capturée]" : "";
  return a.note ? `${head}${body}\nCommentaire : ${a.note}` : `${head}${body}`;
}

function matches(a: PdfAnnot, rel: string, needle: string): boolean {
  if (!needle) return true;
  const hay = `${a.text ?? ""} ${a.note ?? ""} ${annotCiteRef(rel)}`.toLowerCase();
  return hay.includes(needle);
}

const SOLID = (c?: string) => (c ?? "rgba(255,213,74,.40)").replace(",.40", ",.9");
/** Palette des surligneurs du lecteur — couleurs de DONNÉES (stockées dans
 * les annotations), pas des tokens de thème. */
const HL_COLORS = [
  "rgba(255,213,74,.40)", "rgba(120,220,140,.40)",
  "rgba(120,170,255,.40)", "rgba(255,140,160,.40)",
];

export default function AnnotationsPanel(p: {
  /** Origine du serveur galerie du projet actif (atelierUrl). */
  galleryOrigin: string | null;
  /** Ouvrir le PDF de `rel`, défilé sur l'annotation. */
  onOpenAnnot: (rel: string, annotId: string) => void;
  /** Attacher une citation au composer du chat. */
  onQuote: (text: string) => void;
}) {
  const [lib, setLib] = useState<Record<string, PdfAnnot[]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const origin = p.galleryOrigin;
  const seq = useRef(0);
  const lastJson = useRef("");

  function load() {
    if (!origin) return;
    const mySeq = ++seq.current;
    fetch(`${origin}/pdfannot-all`)
      .then((r) => r.json())
      .then((j) => {
        if (mySeq !== seq.current) return;
        const annots = j?.annots && typeof j.annots === "object" ? j.annots : {};
        setError(null);
        // ne re-rendre que si le contenu a changé (le polling relit souvent)
        const ser = JSON.stringify(annots);
        if (ser === lastJson.current) return;
        lastJson.current = ser;
        setLib(annots);
        // premier chargement : déplier l'article le plus récemment annoté
        setExpanded((prev) => {
          if (prev.size) return prev;
          const first = Object.entries(annots as Record<string, PdfAnnot[]>)
            .filter(([, l]) => Array.isArray(l) && l.length)
            .sort((x, y) => maxTs(y[1]) - maxTs(x[1]))[0];
          return first ? new Set([first[0]]) : prev;
        });
      })
      .catch(() => {
        if (mySeq !== seq.current) return;
        // un raté n'efface jamais des données déjà affichées
        if (lastJson.current === "") setError(t("annots.load-error"));
      });
  }
  useEffect(() => {
    lastJson.current = "";
    load();
    // le serveur galerie peut encore démarrer quand le panneau s'ouvre, et les
    // annotations naissent dans le viewer PDF : relire tant que le panneau est
    // ouvert (GET léger ; l'état ne bouge que si le JSON diffère).
    const timer = setInterval(load, 2500);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin]);

  function maxTs(list: PdfAnnot[]): number {
    let best = 0;
    for (const a of list) {
      const ts = parseInt(String(a.id), 10);
      if (Number.isFinite(ts) && ts > best) best = ts;
    }
    return best;
  }

  function removeAnnot(rel: string, a: PdfAnnot) {
    if (!origin || !lib) return;
    const next = (lib[rel] ?? []).filter((x) => String(x.id) !== String(a.id));
    setLib({ ...lib, [rel]: next });
    fetch(`${origin}/pdfannot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rel, annots: next }),
    }).catch(() => load());
  }

  function copyAnnot(rel: string, a: PdfAnnot) {
    const quote = (a.text ?? "").replace(/\s+/g, " ").trim();
    const ref = `${annotCiteRef(rel)}${a.page ? `, p. ${a.page}` : ""}`;
    const out = quote ? `« ${quote} » (${ref})` : `(${ref})`;
    navigator.clipboard?.writeText(out).then(() => {
      setCopiedId(String(a.id));
      window.setTimeout(() => setCopiedId((c) => (c === String(a.id) ? null : c)), 1200);
    }).catch(() => {});
  }

  const needle = search.trim().toLowerCase();
  const articles = useMemo(() => {
    if (!lib) return [];
    return Object.entries(lib)
      .map(([rel, list]) => ({
        rel,
        rows: (Array.isArray(list) ? list : [])
          .filter((a) => (!color || a.color === color) && matches(a, rel, needle))
          .slice()
          .sort((a, b) => +a.page - +b.page),
      }))
      .filter((e) => e.rows.length)
      .sort((x, y) => maxTs(y.rows) - maxTs(x.rows));
  }, [lib, color, needle]);
  const total = articles.reduce((s, e) => s + e.rows.length, 0);

  return (
    <aside className="annots-panel" aria-label={t("atelier.annotations")}>
      <div className="annots-head">
        <span className="annots-title">{t("atelier.annotations")}</span>
        {lib !== null && (
          <span className="annots-count">
            {t("annots.count", { n: total, m: articles.length })}
          </span>
        )}
        <span className="annots-hspace" />
        {HL_COLORS.map((c) => (
          <RowButton
            key={c}
            className={`annots-fdot${color === c ? " on" : ""}`}
            style={{ background: SOLID(c) }}
            aria-label={t("annots.filter-color")}
            aria-pressed={color === c}
            onClick={() => setColor((cur) => (cur === c ? null : c))}
          />
        ))}
      </div>
      <input
        className="annots-search"
        placeholder={t("annots.search")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="annots-list">
        {error && <div className="annots-empty">{error}</div>}
        {!error && lib === null && <div className="annots-empty">{t("common.loading")}</div>}
        {!error && lib !== null && !articles.length && (
          <div className="annots-empty">
            {needle || color ? t("annots.empty-filter") : t("annots.empty")}
          </div>
        )}
        {articles.map((art) => {
          const open = expanded.has(art.rel) || Boolean(needle);
          return (
            <div key={art.rel}>
              <RowButton
                className="annots-art"
                aria-expanded={open}
                onClick={() =>
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(art.rel)) next.delete(art.rel);
                    else next.add(art.rel);
                    return next;
                  })
                }
              >
                <svg className="annots-tick" width="10" height="10" viewBox="0 0 16 16" fill="none"
                  stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true">
                  {open ? <path d="M3.5 6l4.5 4.5L12.5 6" /> : <path d="M6 3.5l4.5 4.5L6 12.5" />}
                </svg>
                <span className="annots-art-title" title={art.rel}>{annotCiteRef(art.rel)}</span>
                <span className="annots-art-count">{art.rows.length}</span>
              </RowButton>
              {open && art.rows.map((a) => {
                const text = (a.text ?? "").replace(/\s+/g, " ").trim();
                return (
                  <div key={String(a.id)} className="annots-item">
                    <span className="annots-bar" style={{ background: SOLID(a.color) }} />
                    <div className="annots-body">
                      <RowButton
                        className="annots-open"
                        onClick={() => p.onOpenAnnot(art.rel, String(a.id))}
                        title={t("annots.open")}
                      >
                        {a.kind === "area" ? (
                          <span className="annots-zone">
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                              strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M2 5.2V3.4c0-.8.6-1.4 1.4-1.4h1.8M10.8 2h1.8c.8 0 1.4.6 1.4 1.4v1.8M14 10.8v1.8c0 .8-.6 1.4-1.4 1.4h-1.8M5.2 14H3.4c-.8 0-1.4-.6-1.4-1.4v-1.8" />
                            </svg>
                            {t("annots.zone")}{a.note ? ` · ${a.note}` : ""}
                          </span>
                        ) : a.kind === "note" ? (
                          <span className="annots-quote is-note">{a.note || text || "…"}</span>
                        ) : (
                          <span className="annots-quote">
                            <span className="annots-oq">«&thinsp;</span>{text}
                            <span className="annots-oq">&thinsp;»</span>
                          </span>
                        )}
                        {a.note && a.kind !== "note" && a.kind !== "area" && (
                          <span className="annots-note">{a.note}</span>
                        )}
                      </RowButton>
                      <div className="annots-foot">
                        <span className="annots-page">
                          p. {a.page}{a.kind === "note" ? ` · ${t("annots.kind-note")}` : ""}
                        </span>
                        <span className="annots-spacer" />
                        <IconButton
                          size="s"
                          label={t("annots.to-chat")}
                          title={t("annots.to-chat")}
                          className="annots-act"
                          onClick={() => p.onQuote(annotQuoteText(art.rel, a))}
                        >
                          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                            strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M14 8c0 3-2.7 5.2-6 5.2-.8 0-1.6-.1-2.3-.4L2.5 14l1-2.6C2.6 10.5 2 9.3 2 8c0-3 2.7-5.2 6-5.2S14 5 14 8z" />
                          </svg>
                        </IconButton>
                        {a.kind !== "area" && (
                          <IconButton
                            size="s"
                            label={t("annots.copy")}
                            title={t("annots.copy")}
                            className={`annots-act${copiedId === String(a.id) ? " ok" : ""}`}
                            onClick={() => copyAnnot(art.rel, a)}
                          >
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                              strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <rect x="5.2" y="5.2" width="8.3" height="8.3" rx="1.6" />
                              <path d="M10.8 5.2V3.6A1.6 1.6 0 0 0 9.2 2H3.6A1.6 1.6 0 0 0 2 3.6v5.6a1.6 1.6 0 0 0 1.6 1.6h1.6" />
                            </svg>
                          </IconButton>
                        )}
                        <IconButton
                          size="s"
                          label={t("annots.delete")}
                          title={t("annots.delete")}
                          className="annots-act danger"
                          onClick={() => removeAnnot(art.rel, a)}
                        >
                          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                            strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M2.5 4h11M6 4V2.6h4V4M4 4l.6 9.2h6.8L12 4M6.6 6.4v4.4M9.4 6.4v4.4" />
                          </svg>
                        </IconButton>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
