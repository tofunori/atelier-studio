// Réglages visuels avec aperçu vivant et personnalisation progressive.
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../shadcn/collapsible";
import { ArrowUp, ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { Advanced, Group, Row, Toggle } from "../primitives";
import type { SectionProps } from "../shared";
import type { Settings } from "../../../lib/settings";
import { t } from "../../../lib/i18n";
import { resolveAppearanceTheme, THEME_PRESETS } from "../../../lib/themes";
import { Select } from "../../Select";
import { Button, SegmentedControl } from "../../ui";
import { Input } from "../../shadcn/input";
import { Slider as ShadcnSlider } from "../../shadcn/slider";

// Curseur de réglage numérique — copié tel quel de Settings.tsx:136-150.
function SettingSlider(p: {
  label: string; min: number; max: number; step: number; value: number;
  onChange: (v: number) => void;
}) {
  return (
    <ShadcnSlider
      min={p.min}
      max={p.max}
      step={p.step}
      value={p.value}
      aria-label={p.label}
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
function ColorField(p: { label: string; value: string; fallback: string; onChange: (v: string) => void; onReset: () => void }) {
  const v = p.value || p.fallback;
  const dark = hexLuma(v) > 0.55;
  return (
    <>
      <label className="color-pill" style={{ background: v, color: dark ? "#1c1e22" : "#f4f5f7" }}>
        <input type="color" aria-label={p.label} value={v} onChange={(e) => p.onChange(e.target.value)} />
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
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const colors = resolveAppearanceTheme(s, systemDark).vars;

  // État local de la recherche de thème — seul consommateur : la galerie
  // ci-dessous (Settings.tsx:223, 342-345).
  const [themeQuery, setThemeQuery] = useState("");
  const themeMatches = THEME_PRESETS.filter((th) =>
    th.name.toLowerCase().includes(themeQuery.toLowerCase()));
  const currentTheme = THEME_PRESETS.find((th) => th.id === s.themePreset);
  const otherThemes = themeMatches.filter((th) => th.id !== s.themePreset);

  // Copié tel quel de Settings.tsx:419-435.
  function themeRow(th: (typeof THEME_PRESETS)[number]) {
    const on = s.themePreset === th.id;
    return (
      <Button key={th.id} type="button" variant="ghost"
        className={`theme-row ${on ? "on" : ""}`}
        aria-pressed={on}
        onClick={() => save({ themePreset: th.id, theme: th.dark ? "dark" : "light" })}>
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
      <div className="set-preview-wrap">
        <div className="set-preview" role="img" aria-label={t("settings.preview")}
          style={{ "--preview-ui-size": `${s.baseFontSize * .75}px`, "--preview-chat-size": `${s.chatFontSize * .9}px`,
            "--preview-row-space": `${s.density === "compact" ? 6 : s.density === "spacious" ? 12 : 9}px`,
            "--preview-reading-width": `${s.chatWidth * .36}px`, "--preview-line-height": s.chatLineHeight } as React.CSSProperties}>
          <div className="set-preview-rail"><span className="set-preview-brand">Atelier</span>
            <span>{t("settings.group.conversations")}</span><span className="current">{t("settings.preview-title")}</span><span>{t("settings.preview-other")}</span>
          </div>
          <div className="set-preview-chat"><span className="set-preview-heading">{t("settings.preview-title")}</span>
            <p><strong>{t("settings.preview-lead")}</strong><br />{t("settings.preview-text")}</p>
            <div className="set-preview-composer"><span>{t("chat.placeholder")}</span><ArrowUp aria-hidden="true" /></div>
          </div>
        </div>
        <div className="set-preview-caption"><span>{t("settings.preview")}</span><span>{currentTheme?.name ?? "Atelier"}</span></div>
      </div>
      <Group label={t("settings.interface")}>
        <Row title={t("settings.theme")} desc={t("settings.theme-desc")}>
          <SegmentedControl
            label={t("settings.theme")}
            value={s.theme}
            onChange={(v) => save({ theme: v as Settings["theme"], themePreset: "atelier" })}
            options={[
              { value: "light", label: t("settings.theme-light") },
              { value: "dark", label: t("settings.theme-dark") },
              { value: "system", label: t("settings.theme-system") },
            ]}
          />
        </Row>
        <Row title={t("settings.base-size")} desc={t("settings.base-size-desc")}>
          <SettingSlider label={t("settings.base-size")} min={12} max={18} step={0.5} value={s.baseFontSize} onChange={(v) => save({ baseFontSize: v })} />
          <span className="set-val">{s.baseFontSize}px</span>
        </Row>
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
      </Group>
      <Group label={t("settings.reading")}>
        <Row title={t("settings.chat-text-size")}>
          <SettingSlider label={t("settings.chat-text-size")} min={12} max={19} step={0.5} value={s.chatFontSize} onChange={(v) => save({ chatFontSize: v })} />
          <span className="set-val">{s.chatFontSize}px</span>
        </Row>
        <Row title={t("settings.reading-width")}>
          <SettingSlider label={t("settings.reading-width")} min={560} max={1600} step={20} value={s.chatWidth} onChange={(v) => save({ chatWidth: v })} />
          <span className="set-val">{s.chatWidth}px</span>
        </Row>
        <Row title={t("settings.interline")}>
          <SettingSlider label={t("settings.interline")} min={1.4} max={2.0} step={0.05} value={s.chatLineHeight} onChange={(v) => save({ chatLineHeight: v })} />
          <span className="set-val">{s.chatLineHeight.toFixed(2)}</span>
        </Row>
      </Group>
      <Advanced label={t("settings.personalize")}>
        <Group label={t("settings.group.theme")}>
          {currentTheme && <div className="theme-current">{themeRow(currentTheme)}</div>}
          <Collapsible className="theme-options">
            <CollapsibleTrigger render={<Button variant="ghost" className="theme-options-trigger">{t("settings.other-themes")}<ChevronDown aria-hidden="true" /></Button>} />
            <CollapsibleContent>
              <Input className="theme-search" aria-label={t("settings.search-theme")} placeholder={t("settings.search-theme")}
                value={themeQuery} onChange={e => setThemeQuery(e.target.value)} />
              <div className="theme-gallery">{otherThemes.map(themeRow)}</div>
            </CollapsibleContent>
          </Collapsible>
        </Group>
      <Group label={t("settings.group.colors")}>
        <Row title={t("settings.accent")} desc={t("settings.accent-desc")}>
          <ColorField label={t("settings.accent")} value={s.accentColor} fallback={colors["--accent"]}
            onChange={(v) => save({ accentColor: v })} onReset={() => save({ accentColor: "" })} />
        </Row>
        <Row title={t("settings.bg")} desc={t("settings.bg-desc")}>
          <ColorField label={t("settings.bg")} value={s.bgColor} fallback={colors["--bg"]}
            onChange={(v) => save({ bgColor: v })} onReset={() => save({ bgColor: "" })} />
        </Row>
        <Row title={t("settings.text")} desc={t("settings.text-desc")}>
          <ColorField label={t("settings.text")} value={s.fgColor} fallback={colors["--fg"]}
            onChange={(v) => save({ fgColor: v })} onReset={() => save({ fgColor: "" })} />
        </Row>
      </Group>
      <Group label={t("settings.group.typography")}>
        <Row title={t("settings.ui-font")} desc={t("settings.ui-font-desc")}>
          <Input aria-label={t("settings.ui-font")} className="set-text" placeholder={t("language.system")} value={s.uiFont}
            onChange={(e) => save({ uiFont: e.target.value })} />
        </Row>
        <Row title={t("settings.code-font")} desc={t("settings.code-font-desc")}>
          <Input aria-label={t("settings.code-font")} className="set-text" placeholder="JetBrains Mono" value={s.codeFont}
            onChange={(e) => save({ codeFont: e.target.value })} />
        </Row>
        <Row title={t("settings.smoothing")} desc={t("settings.smoothing-desc")}>
          <Toggle label={t("settings.smoothing")} checked={s.fontSmoothing} onChange={(v) => save({ fontSmoothing: v })} />
        </Row>
      </Group>
      </Advanced>
      <Advanced label={t("settings.conversation-display")}>
      <Group label={t("settings.group.conversations")}>
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
