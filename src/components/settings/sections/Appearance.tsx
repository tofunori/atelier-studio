// Section Apparence (lot 1) : thème, couleurs, typographie, mise en page,
// puis un repli « Avancé » pour les deux rangées les moins consultées
// (fondu du streaming, horodatages). Migration verbatim depuis
// Settings.tsx:673-789 — trois helpers locaux à consommateur unique
// (SettingSlider, hexLuma, ColorField) déménagent ici avec les rangées
// qui les utilisent. L'aperçu vivant arrive au lot 7.
import { useState } from "react";
import { Advanced, Group, Row, Toggle } from "../primitives";
import type { SectionProps } from "../shared";
import type { Settings } from "../../../lib/settings";
import { t } from "../../../lib/i18n";
import { THEME_PRESETS } from "../../../lib/themes";
import { Select } from "../../Select";
import { Button, SegmentedControl } from "../../ui";
import { Input } from "../../shadcn/input";
import { Slider as ShadcnSlider } from "../../shadcn/slider";

// Curseur de réglage numérique — copié tel quel de Settings.tsx:136-150.
function SettingSlider(p: {
  min: number; max: number; step: number; value: number;
  onChange: (v: number) => void;
}) {
  return (
    <ShadcnSlider
      min={p.min}
      max={p.max}
      step={p.step}
      value={p.value}
      aria-label="Setting value"
      onValueChange={p.onChange}
    />
  );
}

// pastille couleur façon Codex : fond = couleur, hex lisible par-dessus
// — copié tel quel de Settings.tsx:164-169.
function hexLuma(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
// Copié tel quel de Settings.tsx:170-185.
function ColorField(p: { value: string; fallback: string; onChange: (v: string) => void; onReset: () => void }) {
  const v = p.value || p.fallback;
  const dark = hexLuma(v) > 0.55;
  return (
    <>
      <label className="color-pill" style={{ background: v, color: dark ? "#1c1e22" : "#f4f5f7" }}>
        <input type="color" value={v} onChange={(e) => p.onChange(e.target.value)} />
        <span className="color-dot" />
        {v.toUpperCase()}
      </label>
      {p.value && (
        <Button variant="ghost" className="set-btn quiet" onClick={p.onReset}>{t("action.reset")}</Button>
      )}
    </>
  );
}

export default function Appearance(p: SectionProps) {
  const save = (patch: Partial<Settings>) => { p.set(patch); p.onSaved(); };
  const s = p.s;

  // État local de la recherche de thème — seul consommateur : la galerie
  // ci-dessous (Settings.tsx:223, 342-345).
  const [themeQuery, setThemeQuery] = useState("");
  const themeMatches = THEME_PRESETS.filter((th) =>
    th.name.toLowerCase().includes(themeQuery.toLowerCase()));
  const currentTheme = themeMatches.find((th) => th.id === s.themePreset);
  const otherThemes = themeMatches.filter((th) => th.id !== s.themePreset);

  // Copié tel quel de Settings.tsx:419-435.
  function themeRow(th: (typeof THEME_PRESETS)[number]) {
    const on = s.themePreset === th.id;
    return (
      <Button key={th.id} type="button" variant="ghost"
        className={`theme-row ${on ? "on" : ""}`}
        aria-pressed={on}
        onClick={() => save({ themePreset: th.id })}>
        <span className="theme-name">{th.name}</span>
        <span className="theme-strip">
          {["--bg", "--bg-side", "--bg-card", "--bg-ctl", "--border", "--fg2", "--muted", "--accent"].map((k) => (
            <span key={k} style={{ background: th.vars[k] }} />
          ))}
        </span>
        <span className="theme-check">{on ? "✓" : ""}</span>
      </Button>
    );
  }

  return (
    <>
      <h1>{t("settings.appearance")}</h1>
      <p className="set-sub">{t("settings.appearance-sub")}</p>

      {/* Settings.tsx:677-685 — galerie de préréglages : div brute (pas de
          .set-card), non enveloppée par la primitive Group. */}
      <div className="set-group">
        <div className="set-group-label">{t("settings.group.theme")}</div>
        <Input className="theme-search" placeholder={t("settings.search-theme")} value={themeQuery}
          onChange={(e) => setThemeQuery(e.target.value)} />
        <div className="theme-gallery">
          {currentTheme && <div className="theme-current">{themeRow(currentTheme)}</div>}
          {otherThemes.map(themeRow)}
        </div>
      </div>

      {/* Settings.tsx:686-699 */}
      <Group>
        <Row title={t("settings.theme")} desc={t("settings.theme-desc")}>
          <SegmentedControl
            label={t("settings.theme")}
            value={s.theme}
            onChange={(v) => save({ theme: v as Settings["theme"] })}
            options={[
              { value: "light", label: t("settings.theme-light") },
              { value: "dark", label: t("settings.theme-dark") },
              { value: "system", label: t("settings.theme-system") },
            ]}
          />
        </Row>
      </Group>

      {/* Settings.tsx:700-713 */}
      <Group label={t("settings.group.colors")}>
        <Row title={t("settings.accent")} desc={t("settings.accent-desc")}>
          <ColorField value={s.accentColor} fallback="#e77f3e"
            onChange={(v) => save({ accentColor: v })} onReset={() => save({ accentColor: "" })} />
        </Row>
        <Row title={t("settings.bg")} desc={t("settings.bg-desc")}>
          <ColorField value={s.bgColor} fallback="#1e2124"
            onChange={(v) => save({ bgColor: v })} onReset={() => save({ bgColor: "" })} />
        </Row>
        <Row title={t("settings.text")} desc={t("settings.text-desc")}>
          <ColorField value={s.fgColor} fallback="#e8eaed"
            onChange={(v) => save({ fgColor: v })} onReset={() => save({ fgColor: "" })} />
        </Row>
      </Group>

      {/* Settings.tsx:714-729 (fontSmoothing) — streamFade (Settings.tsx:730-732)
          déménage sous le repli « Avancé » ci-dessous. */}
      <Group label={t("settings.group.typography")}>
        <Row title={t("settings.ui-font")} desc={t("settings.ui-font-desc")}>
          <Input className="set-text" placeholder="Inter" value={s.uiFont}
            onChange={(e) => save({ uiFont: e.target.value })} />
        </Row>
        <Row title={t("settings.code-font")} desc={t("settings.code-font-desc")}>
          <Input className="set-text" placeholder="JetBrains Mono" value={s.codeFont}
            onChange={(e) => save({ codeFont: e.target.value })} />
        </Row>
        <Row title={t("settings.base-size")} desc={t("settings.base-size-desc")}>
          <SettingSlider min={12} max={18} step={0.5} value={s.baseFontSize} onChange={(v) => save({ baseFontSize: v })} />
          <span className="set-val">{s.baseFontSize}px</span>
        </Row>
        <Row title={t("settings.smoothing")} desc={t("settings.smoothing-desc")}>
          <Toggle label={t("settings.smoothing")} checked={s.fontSmoothing} onChange={(v) => save({ fontSmoothing: v })} />
        </Row>
      </Group>

      {/* Settings.tsx:734-747, 751-756, 771-783 — density, curseurs de fil,
          format d'heure (:759, migré ici — Task 5 l'avait à tort placé hors
          de sa portée) et vue de la transcription. displayTimestamps
          (:784-786) déménage sous « Avancé ». */}
      <Group label={t("settings.group.layout")}>
        <Row title={t("settings.density")} desc={t("settings.density-desc")}>
          <SegmentedControl
            label={t("settings.density")}
            value={s.density}
            onChange={(v) => save({ density: v as Settings["density"] })}
            options={[
              { value: "compact", label: t("settings.density-compact") },
              { value: "comfortable", label: t("settings.density-comfortable") },
              { value: "spacious", label: t("settings.density-spacious") },
            ]}
          />
        </Row>
        <Row title={t("settings.chat-text-size")}>
          <SettingSlider min={12} max={19} step={0.5} value={s.chatFontSize} onChange={(v) => save({ chatFontSize: v })} />
          <span className="set-val">{s.chatFontSize}px</span>
        </Row>
        <Row title={t("settings.reading-width")}>
          <SettingSlider min={560} max={1600} step={20} value={s.chatWidth} onChange={(v) => save({ chatWidth: v })} />
          <span className="set-val">{s.chatWidth}px</span>
        </Row>
        <Row title={t("settings.interline")}>
          <SettingSlider min={1.4} max={2.0} step={0.05} value={s.chatLineHeight} onChange={(v) => save({ chatLineHeight: v })} />
          <span className="set-val">{s.chatLineHeight.toFixed(2)}</span>
        </Row>
        <Row title={t("settings.time-format")} desc={t("settings.time-format-desc")}>
          <Select
            title={t("settings.time-format")}
            value={s.timeFormat}
            onChange={(value) => save({ timeFormat: value as Settings["timeFormat"] })}
            options={[
              { value: "system", label: t("language.system") },
              { value: "24h", label: "24 h" },
              { value: "12h", label: "12 h (AM/PM)" },
            ]}
          />
        </Row>
        <Row title={t("chat.transcript-view")} desc={t("settings.transcript-view-desc")}>
          <Select
            title={t("chat.transcript-view")}
            value={s.transcriptView}
            onChange={(value) => save({ transcriptView: value as Settings["transcriptView"] })}
            options={[
              { value: "normal", label: t("chat.transcript-view.normal") },
              { value: "reflexion", label: t("chat.transcript-view.reflexion") },
              { value: "detaille", label: t("chat.transcript-view.detaille") },
              { value: "resume", label: t("chat.transcript-view.resume") },
            ]}
          />
        </Row>
      </Group>

      {/* Repli « Avancé » : les deux rangées les moins consultées de la
          section — Settings.tsx:730-732 (fondu du streaming) et :784-786
          (horodatages). Nouveau regroupement (pas de repli dans la source),
          demandé par le brief de la tâche 6. */}
      <Advanced count={2}>
        <Group>
          <Row title={t("settings.stream-fade")} desc={t("settings.stream-fade-desc")}>
            <Toggle label={t("settings.stream-fade")} checked={s.streamFade} onChange={(v) => save({ streamFade: v })} />
          </Row>
          <Row title={t("settings.display-timestamps")} desc={t("settings.display-timestamps-desc")}>
            <Toggle label={t("settings.display-timestamps")} checked={s.displayTimestamps} onChange={(v) => save({ displayTimestamps: v })} />
          </Row>
        </Group>
      </Advanced>
    </>
  );
}
