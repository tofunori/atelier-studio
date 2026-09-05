// Coquille des réglages (lot 1). Elle ne connaît AUCUN réglage : nav, mode
// compact, Échap, restauration des défauts, routage. Chaque section reçoit
// exactement ce dont elle a besoin — jamais l'objet de props entier.
import React, { Suspense, useEffect, useRef, useState } from "react";
import { confirm as tauriConfirm } from "@tauri-apps/plugin-dialog";
import { Settings as S, DEFAULT_SETTINGS } from "../../lib/settings";
import { t } from "../../lib/i18n";
import { Button, RowButton } from "../ui";
import { Select } from "../Select";
import { lazyWithRetry } from "../LazyBoundary";
import { SavedIndicator, useSavedFlash } from "./primitives";
import { SECTIONS, resolveSection, type SectionId } from "./sections";
import type { SectionProps } from "./shared";
import { Input } from "../shadcn/input";
import { ArrowLeft, Search, SlidersHorizontal, Contrast, Cpu, Images, FileText, RotateCcw, ChevronRight } from "lucide-react";
import { searchSettings } from "./search";
import { SettingsSearchTarget, type SearchTarget } from "./searchTarget";
import "../../styles/settings-refined.css";

const SECTION_ICONS = { general: SlidersHorizontal, apparence: Contrast, modeles: Cpu, atelier: Images, consignes: FileText };

// lazyWithRetry (pas React.lazy nu) : React.lazy mémorise un import rejeté,
// donc un chunk de section en échec resterait mort jusqu'au redémarrage de
// l'app même après un clic sur « Réessayer » dans la LazyBoundary parente
// (App.tsx). Voir LazyBoundary.tsx pour le détail du mécanisme.
const General = lazyWithRetry(() => import("./sections/General"));
const Models = lazyWithRetry(() => import("./sections/Models"));
const Appearance = lazyWithRetry(() => import("./sections/Appearance"));
const Atelier = lazyWithRetry(() => import("./sections/Atelier"));
const Consignes = lazyWithRetry(() => import("./sections/Consignes"));

type PanelComponent = React.ComponentType<SectionProps>;

const PANELS: Record<SectionId, PanelComponent> = {
  general: General, modeles: Models, apparence: Appearance, atelier: Atelier, consignes: Consignes,
};

export default function SettingsPage(p: {
  settings: S;
  onChange: (s: S) => void;
  onClose: () => void;
  ws: WebSocket | null;
  projects?: string[];
  /** Racine du projet actif — transmise telle quelle à `SectionProps`
   *  (tâche 11, bouton Reformuler de Consignes.tsx). */
  projectRoot?: string;
  initialSection?: string;
  /** Vrai quand la page est posée dans `SettingsSheet` (lot A) : elle ne doit
   *  plus occuper toute la fenêtre ni gérer Échap elle-même — la feuille
   *  porte ce contrat via le Dialog Base UI. Comportement par défaut
   *  (absent/`false`) strictement inchangé — `SetBench` en dépend. */
  embedded?: boolean;
}) {
  const [section, setSection] = useState<SectionId>(() => resolveSection(p.initialSection));
  // ≤880 px : la nav colonne écraserait le contenu — select compact au-dessus.
  const [narrow, setNarrow] = useState(() =>
    typeof window !== "undefined" && window.matchMedia?.("(max-width: 880px)")?.matches === true);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { visible: saved, flash } = useSavedFlash();
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<SearchTarget>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const chooseSection = (next: SectionId) => {
    setQuery(""); setTarget(null); setSection(next);
    bodyRef.current?.scrollTo?.({ top: 0 });
  };
  const results = searchSettings(query);
  const searching = !!query.trim();

  // Conservé verbatim de l'ancien Settings.tsx:263-269 : abonnement matchMedia.
  // En mode embarqué la page vit dans une feuille flottante (`min(1100px,
  // 94vw)`), pas dans la fenêtre : mesurer la fenêtre créerait une bande
  // morte (fenêtre 881–936px avec une feuille déjà sous 880px) — voir
  // l'effet ResizeObserver ci-dessous pour ce cas.
  useEffect(() => {
    if (p.embedded) return;
    const mq = window.matchMedia?.("(max-width: 880px)");
    if (!mq) return;
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [p.embedded]);

  // Mode embarqué : mesurer la feuille elle-même plutôt que la fenêtre.
  useEffect(() => {
    if (!p.embedded) return;
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (typeof width === "number") setNarrow(width <= 880);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [p.embedded]);

  // Conservé verbatim de l'ancien Settings.tsx:271-285 : Échap ferme la page
  // (convention app) — jamais pendant une saisie, et capturé en amont du
  // handler global d'App qui utilise Échap pour interrompre un tour actif.
  // `embedded` (lot A) : posée dans SettingsSheet, c'est le Dialog Base UI
  // qui porte ce contrat — installer aussi cet écouteur ferait doublon.
  useEffect(() => {
    if (p.embedded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      p.onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [p.onClose, p.embedded]);

  useEffect(() => {
    const onFind = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); event.stopImmediatePropagation(); searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onFind, true);
    return () => window.removeEventListener("keydown", onFind, true);
  }, []);

  const set = (patch: Partial<S>) => p.onChange({ ...p.settings, ...patch });
  const Panel = PANELS[section];

  const restore = async () => {
    const ok = await tauriConfirm(t("settings.restore-confirm"), { kind: "warning" }).catch(() => false);
    if (ok) { p.onChange({ ...DEFAULT_SETTINGS }); flash(); }
  };
  const searchField = (
    <div className="set-search">
      <Search aria-hidden="true" />
      <Input ref={searchRef} type="search" aria-label={t("settings.search")}
        placeholder={t("settings.search")} value={query}
        onChange={event => setQuery(event.target.value)}
        onKeyDown={event => {
          if (event.key === "Escape" && query) {
            event.preventDefault(); event.stopPropagation(); setQuery("");
          }
        }} />
    </div>
  );
  const close = <Button variant="ghost" className="set-close" aria-label={t("settings.back")} title={t("settings.back")} onClick={p.onClose}><ArrowLeft aria-hidden="true" /></Button>;

  return (
    <div ref={rootRef} className={`settings-page settings-refined ${narrow ? "narrow" : ""} ${p.embedded ? "embedded" : ""}`}>
      {narrow ? (
        <div className="set-nav-compact">
          <div className="set-compact-heading">{close}<span>{t("settings.title")}</span>
            <Select compact title={t("settings.section")} value={section}
              onChange={value => chooseSection(value as SectionId)}
              options={SECTIONS.map(sec => ({ value: sec.id, label: t(sec.labelKey) }))} />
          </div>
          {searchField}
        </div>
      ) : (
        <div className="set-nav">
          <div className="set-identity"><div><strong>Atelier</strong><span>{t("settings.title")}</span></div>{close}</div>
          {searchField}
          <nav aria-label={t("settings.section")}>
            {SECTIONS.map(sec => {
              const Icon = SECTION_ICONS[sec.id];
              return <RowButton key={sec.id} className={`set-nav-item ${section === sec.id ? "on" : ""}`}
                aria-current={section === sec.id ? "true" : undefined} onClick={() => chooseSection(sec.id)}>
                <Icon aria-hidden="true" />{t(sec.labelKey)}
              </RowButton>;
            })}
          </nav>
          <div className="set-nav-footer">
            <span>{t("settings.autosave-note")}</span>
            <Button variant="ghost" className="set-restore" onClick={restore}><RotateCcw aria-hidden="true" />{t("action.restore-defaults")}</Button>
          </div>
        </div>
      )}
      <div ref={bodyRef} className="set-body" tabIndex={-1}>
        <div className="set-body-status"><SavedIndicator visible={saved} /></div>
        {searching ? <div className="set-search-results">
          <h1>{t("settings.search-title")}</h1>
          <p className="set-sub" role="status">{t(results.length === 1 ? "settings.search-one" : "settings.search-count", { count: results.length })}</p>
          {results.length ? results.map((result, index) => <RowButton key={`${result.section}-${index}`} className="set-search-result" aria-label={`${result.label} — ${result.category}`}
            onClick={() => {
              setSection(result.section); setQuery("");
              bodyRef.current?.focus({ preventScroll: true });
              setTarget(result.target ? { label: result.target, request: Date.now() } : null);
              bodyRef.current?.scrollTo?.({ top: 0 });
            }}>
            <span>{result.label}<small>{result.category}</small></span><ChevronRight aria-hidden="true" />
          </RowButton>) : <p className="set-empty">{t("settings.search-empty")}</p>}
        </div> : <SettingsSearchTarget.Provider value={target}>
          <Suspense fallback={<p className="set-empty">{t("settings.checking")}</p>}>
            <Panel s={p.settings} set={set} ws={p.ws} onSaved={flash} projects={p.projects}
              projectRoot={p.projectRoot} narrow={narrow} />
          </Suspense>
        </SettingsSearchTarget.Provider>}
        {narrow && !searching && <div className="set-mobile-footer"><Button variant="ghost" className="set-restore" onClick={restore}>{t("action.restore-defaults")}</Button></div>}
      </div>
    </div>
  );
}
