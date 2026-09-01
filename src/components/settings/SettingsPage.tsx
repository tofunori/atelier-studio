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

  const set = (patch: Partial<S>) => p.onChange({ ...p.settings, ...patch });
  const Panel = PANELS[section];

  return (
    <div ref={rootRef} className={`settings-page ${narrow ? "narrow" : ""} ${p.embedded ? "embedded" : ""}`}>
      {narrow ? (
        <div className="set-nav-compact">
          <Button variant="ghost" className="set-back" onClick={p.onClose}>{t("settings.back")}</Button>
          <Select
            compact
            title={t("settings.section")}
            value={section}
            onChange={(value) => setSection(value as SectionId)}
            options={SECTIONS.map((sec) => ({ value: sec.id, label: t(sec.labelKey) }))}
          />
        </div>
      ) : (
        <div className="set-nav">
          <Button variant="ghost" className="set-back" onClick={p.onClose}>{t("settings.back")}</Button>
          {SECTIONS.map((sec) => (
            <RowButton
              key={sec.id}
              className={`set-nav-item ${section === sec.id ? "on" : ""}`}
              aria-current={section === sec.id ? "true" : undefined}
              onClick={() => setSection(sec.id)}
            >
              {t(sec.labelKey)}
            </RowButton>
          ))}
          <span className="flex" />
          <Button variant="ghost" className="set-restore" onClick={async () => {
            // Conservé verbatim : confirmation obligatoire, et une PANNE du
            // dialogue bloque l'action destructive (SettingsPage.test.tsx).
            const ok = await tauriConfirm(t("settings.restore-confirm"), { kind: "warning" }).catch(() => false);
            if (ok) { p.onChange({ ...DEFAULT_SETTINGS }); flash(); }
          }}>{t("action.restore-defaults")}</Button>
        </div>
      )}

      <div className="set-body">
        <div className="set-body-status"><SavedIndicator visible={saved} /></div>
        <Suspense fallback={<p className="set-empty">{t("settings.checking")}</p>}>
          <Panel s={p.settings} set={set} ws={p.ws} onSaved={flash} projects={p.projects}
            projectRoot={p.projectRoot} narrow={narrow} />
        </Suspense>
      </div>
    </div>
  );
}
