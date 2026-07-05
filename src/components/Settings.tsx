import { useEffect, useState } from "react";
import { Settings as S, DEFAULT_SETTINGS } from "../lib/settings";
import { THEME_PRESETS } from "../lib/themes";
import { setLanguage, t } from "../lib/i18n";
import { PlusIcon } from "./icons";

const SECTIONS = [
  { id: "general", labelKey: "settings.general" },
  { id: "apparence", labelKey: "settings.appearance" },
  { id: "modeles", labelKey: "settings.models" },
  { id: "review", labelKey: "settings.review" },
  { id: "atelier", labelKey: "settings.atelier" },
  { id: "providers", labelKey: "settings.providers" },
  { id: "avance", labelKey: "settings.advanced" },
];

const CLAUDE_MODELS = [
  { id: "", labelKey: "common.default-cli" },
  { id: "claude-fable-5", label: "Fable 5" },
  { id: "claude-opus-4-8", label: "Opus 4.8" },
  { id: "claude-sonnet-5", label: "Sonnet 5" },
  { id: "claude-sonnet-5[1m]", label: "Sonnet 5 · 1M" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
];
const CLAUDE_EFFORTS = ["", "low", "medium", "high", "xhigh", "max"];
const CODEX_EFFORTS = ["", "minimal", "low", "medium", "high", "xhigh"];

const CODEX_MODELS = [
  { id: "", labelKey: "common.default-cli" },
  { id: "gpt-5.5", label: "GPT-5.5" },
  { id: "gpt-5.4", label: "GPT-5.4" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 mini" },
  { id: "gpt-5.3-codex-spark", label: "Codex Spark" },
];

function modelLabel(m: { label?: string; labelKey?: string }) {
  return m.labelKey === "common.default-cli" ? t("common.default-cli") : m.label ?? "";
}

function Slider(p: {
  min: number; max: number; step: number; value: number;
  onChange: (v: number) => void;
}) {
  const pct = ((p.value - p.min) / (p.max - p.min)) * 100;
  return (
    <input
      type="range"
      className="slider"
      min={p.min} max={p.max} step={p.step} value={p.value}
      style={{ ["--p" as any]: `${pct}%` }}
      onChange={(e) => p.onChange(Number(e.target.value))}
    />
  );
}

function Row(p: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-row-txt">
        <div className="set-row-title">{p.title}</div>
        {p.desc && <div className="set-row-desc">{p.desc}</div>}
      </div>
      <div className="set-row-ctl">{p.children}</div>
    </div>
  );
}

export default function SettingsPage(p: {
  settings: S;
  onChange: (s: S) => void;
  onClose: () => void;
  ws: WebSocket | null;
}) {
  const [section, setSection] = useState("general");
  const [slugProv, setSlugProv] = useState<"claude" | "codex">("codex");
  const [slugText, setSlugText] = useState("");
  const [themeQuery, setThemeQuery] = useState("");
  const [status, setStatus] = useState<{ port: number | null; pastedCount: number; pasteDir: string } | null>(null);
  const [provs, setProvs] = useState<{ id: string; label: string; version: string | null; ok: boolean }[] | null>(null);
  const [retitleStatus, setRetitleStatus] = useState("");
  const s = p.settings;
  const customModels = s.customModels ?? [];
  const modelEfforts = s.modelEfforts ?? {};
  const set = (patch: Partial<S>) => p.onChange({ ...s, ...patch });

  useEffect(() => {
    if (!p.ws || p.ws.readyState !== 1) return;
    const onMsg = (e: MessageEvent) => {
      const m = JSON.parse(e.data);
      if (m.type === "status") setStatus(m);
      if (m.type === "providerStatus") setProvs(m.providers);
      if (m.type === "pastedCleared") {
        p.ws!.send(JSON.stringify({ type: "status" }));
      }
      if (m.type === "retitleAllDone") {
        setRetitleStatus(m.running ? t("settings.retitle-running") : t("settings.retitle-done", { count: m.renamed }));
      }
    };
    p.ws.addEventListener("message", onMsg);
    p.ws.send(JSON.stringify({ type: "status" }));
    p.ws.send(JSON.stringify({ type: "providerStatus" }));
    return () => p.ws?.removeEventListener("message", onMsg);
  }, [p.ws]);

  return (
    <div className="settings-page">
      <div className="set-nav">
        <button className="set-back" onClick={p.onClose}>
          {t("settings.back")}
        </button>
        {SECTIONS.map((sec) => (
          <button
            key={sec.id}
            className={`set-nav-item ${section === sec.id ? "on" : ""}`}
            onClick={() => setSection(sec.id)}
          >
            {t(sec.labelKey as any)}
          </button>
        ))}
        <span className="flex" />
        <button className="set-restore" onClick={() => p.onChange({ ...DEFAULT_SETTINGS })}>
          {t("action.restore-defaults")}
        </button>
      </div>
      <div className="set-body">
        {section === "general" && (
          <>
            <h1>{t("settings.general")}</h1>
            <p className="set-sub">{t("settings.general-sub")}</p>
            <Row title={t("language.label")}>
              <select
                value={s.language}
                onChange={(e) => {
                  const language = e.target.value as S["language"];
                  setLanguage(language);
                  set({ language });
                }}
              >
                <option value="fr">{t("language.fr")}</option>
                <option value="en">{t("language.en")}</option>
                <option value="system">{t("language.system")}</option>
              </select>
            </Row>
            <Row title={t("settings.default-provider")} desc={t("settings.default-provider-desc")}>
              <select value={s.defaultProvider} onChange={(e) => set({ defaultProvider: e.target.value as any })}>
                <option value="claude">Claude</option>
                <option value="codex">Codex</option>
              </select>
            </Row>
            <Row title={t("settings.default-claude-model")}>
              <select value={s.defaultModel.claude}
                onChange={(e) => set({ defaultModel: { ...s.defaultModel, claude: e.target.value } })}>
                {CLAUDE_MODELS.map((m) => <option key={m.id} value={m.id}>{modelLabel(m)}</option>)}
              </select>
            </Row>
            <Row title={t("settings.default-codex-model")}>
              <select value={s.defaultModel.codex}
                onChange={(e) => set({ defaultModel: { ...s.defaultModel, codex: e.target.value } })}>
                {CODEX_MODELS.map((m) => <option key={m.id} value={m.id}>{modelLabel(m)}</option>)}
              </select>
            </Row>
            <Row title={t("settings.default-claude-effort")}>
              <select value={s.defaultEffort.claude}
                onChange={(e) => set({ defaultEffort: { ...s.defaultEffort, claude: e.target.value } })}>
                {["", "low", "medium", "high", "xhigh", "max"].map((l) => (
                  <option key={l} value={l}>{l === "" ? "auto" : l}</option>
                ))}
              </select>
            </Row>
            <Row title={t("settings.default-codex-effort")}>
              <select value={s.defaultEffort.codex}
                onChange={(e) => set({ defaultEffort: { ...s.defaultEffort, codex: e.target.value } })}>
                {CODEX_EFFORTS.map((l) => (
                  <option key={l} value={l}>{l === "" ? "auto" : l}</option>
                ))}
              </select>
            </Row>
            <Row title={t("settings.permission-default")} desc={t("settings.permission-default-desc")}>
              <select value={s.defaultPermissionMode} onChange={(e) => set({ defaultPermissionMode: e.target.value })}>
                <option value="bypassPermissions">{t("permission.full")}</option>
                <option value="acceptEdits">{t("permission.accept-edits")}</option>
                <option value="default">{t("action.ask-default")}</option>
                <option value="plan">{t("permission.plan")}</option>
              </select>
            </Row>
            <Row title={t("settings.web-search")} desc={t("settings.web-search-desc")}>
              <input type="checkbox" checked={s.webSearch}
                onChange={(e) => set({ webSearch: e.target.checked })} />
            </Row>
            <Row title={t("settings.additional-dirs")} desc={t("settings.additional-dirs-desc")}>
              <textarea className="set-text" rows={3} value={s.additionalDirectories}
                onChange={(e) => set({ additionalDirectories: e.target.value })} />
            </Row>
            <Row title={t("settings.thread-order")} desc={t("settings.thread-order-desc")}>
              <select value={s.threadOrder} onChange={(e) => set({ threadOrder: e.target.value as any })}>
                <option value="recent">{t("settings.thread-order-recent")}</option>
                <option value="manual">{t("settings.thread-order-manual")}</option>
              </select>
            </Row>
            <Row title={t("settings.chat-titles")} desc={t("settings.chat-titles-desc")}>
              <button
                className="set-btn"
                disabled={p.ws?.readyState !== 1}
                onClick={() => {
                  setRetitleStatus(t("settings.running"));
                  p.ws?.send(JSON.stringify({ type: "retitleAll" }));
                }}
              >
                {t("action.generate-chat-titles")}
              </button>
              {retitleStatus && <span className="set-val wide">{retitleStatus}</span>}
            </Row>
          </>
        )}
        {section === "apparence" && (
          <>
            <h1>{t("settings.appearance")}</h1>
            <p className="set-sub">{t("settings.appearance-sub")}</p>
            <div className="theme-gallery">
              <input className="set-text" placeholder={t("settings.search-theme")} value={themeQuery}
                onChange={(e) => setThemeQuery(e.target.value)} style={{ width: "100%", marginBottom: 10 }} />
              {THEME_PRESETS
                .filter((t) => t.name.toLowerCase().includes(themeQuery.toLowerCase()))
                .map((t) => (
                  <div key={t.id}
                    className={`theme-row ${s.themePreset === t.id ? "on" : ""}`}
                    onClick={() => set({ themePreset: t.id })}>
                    <span className="theme-name">{t.name}</span>
                    <span className="theme-strip">
                      {["--bg","--bg-side","--bg-card","--bg-ctl","--border","--fg2","--muted","--accent"].map((k) => (
                        <span key={k} style={{ background: t.vars[k] }} />
                      ))}
                    </span>
                    {s.themePreset === t.id && <span className="mp-check">✓</span>}
                  </div>
                ))}
            </div>
            <Row title={t("settings.theme")} desc={t("settings.theme-desc")}>
              <div className="seg">
                {(["light", "dark", "system"] as const).map((themeOption) => (
                  <button key={themeOption} className={s.theme === themeOption ? "on" : ""}
                    onClick={() => set({ theme: themeOption })}>
                    {themeOption === "light" ? t("settings.theme-light") : themeOption === "dark" ? t("settings.theme-dark") : t("settings.theme-system")}
                  </button>
                ))}
              </div>
            </Row>
            <Row title={t("settings.accent")} desc={t("settings.accent-desc")}>
              <input type="color" value={s.accentColor || "#e8823a"}
                onChange={(e) => set({ accentColor: e.target.value })} />
              <button className="set-btn" onClick={() => set({ accentColor: "" })}>{t("action.reset")}</button>
            </Row>
            <Row title={t("settings.bg")} desc={t("settings.bg-desc")}>
              <input type="color" value={s.bgColor || "#212429"}
                onChange={(e) => set({ bgColor: e.target.value })} />
              <button className="set-btn" onClick={() => set({ bgColor: "" })}>{t("action.reset")}</button>
            </Row>
            <Row title={t("settings.text")} desc={t("settings.text-desc")}>
              <input type="color" value={s.fgColor || "#e8eaed"}
                onChange={(e) => set({ fgColor: e.target.value })} />
              <button className="set-btn" onClick={() => set({ fgColor: "" })}>{t("action.reset")}</button>
            </Row>
            <Row title={t("settings.ui-font")} desc={t("settings.ui-font-desc")}>
              <input className="set-text" placeholder="Inter" value={s.uiFont}
                onChange={(e) => set({ uiFont: e.target.value })} />
            </Row>
            <Row title={t("settings.code-font")} desc={t("settings.code-font-desc")}>
              <input className="set-text" placeholder="JetBrains Mono" value={s.codeFont}
                onChange={(e) => set({ codeFont: e.target.value })} />
            </Row>
            <Row title={t("settings.density")} desc={t("settings.density-desc")}>
              <div className="seg">
                {(["compact", "comfortable", "spacious"] as const).map((d) => (
                  <button key={d} className={s.density === d ? "on" : ""}
                    onClick={() => set({ density: d })}>
                    {d === "compact" ? t("settings.density-compact") : d === "comfortable" ? t("settings.density-comfortable") : t("settings.density-spacious")}
                  </button>
                ))}
              </div>
            </Row>
            <Row title={t("settings.base-size")} desc={t("settings.base-size-desc")}>
              <Slider min={12} max={18} step={0.5} value={s.baseFontSize} onChange={(v) => set({ baseFontSize: v })} />
              <span className="set-val">{s.baseFontSize}px</span>
            </Row>
            <Row title={t("settings.smoothing")} desc={t("settings.smoothing-desc")}>
              <input type="checkbox" checked={s.fontSmoothing}
                onChange={(e) => set({ fontSmoothing: e.target.checked })} />
            </Row>
            <Row title={t("settings.time-format")} desc={t("settings.time-format-desc")}>
              <select value={s.timeFormat} onChange={(e) => set({ timeFormat: e.target.value as any })}>
                <option value="system">{t("language.system")}</option>
                <option value="24h">24 h</option>
                <option value="12h">12 h (AM/PM)</option>
              </select>
            </Row>
            <Row title={t("settings.chat-text-size")}>
              <Slider min={12} max={19} step={0.5} value={s.chatFontSize} onChange={(v) => set({ chatFontSize: v })} />
              <span className="set-val">{s.chatFontSize}px</span>
            </Row>
            <Row title={t("settings.reading-width")}>
              <Slider min={560} max={1100} step={20} value={s.chatWidth} onChange={(v) => set({ chatWidth: v })} />
              <span className="set-val">{s.chatWidth}px</span>
            </Row>
            <Row title={t("settings.interline")}>
              <Slider min={1.4} max={2.0} step={0.05} value={s.chatLineHeight} onChange={(v) => set({ chatLineHeight: v })} />
              <span className="set-val">{s.chatLineHeight.toFixed(2)}</span>
            </Row>
          </>
        )}
        {section === "modeles" && (
          <>
            <h1>{t("settings.models")}</h1>
            <p className="set-sub">{t("settings.models-sub")}</p>
            <Row title={t("settings.slug-add")} desc={t("settings.slug-add-desc")}>
              <select value={slugProv} onChange={(e) => setSlugProv(e.target.value as any)}>
                <option value="claude">Claude</option>
                <option value="codex">Codex</option>
              </select>
              <input className="set-text" placeholder={t("settings.slug-placeholder")} value={slugText}
                onChange={(e) => setSlugText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && slugText.trim()) {
                    set({ customModels: [...customModels, { provider: slugProv, id: slugText.trim() }] });
                    setSlugText("");
                  }
                }} />
              <button className="set-btn" onClick={() => {
                if (!slugText.trim()) return;
                set({ customModels: [...customModels, { provider: slugProv, id: slugText.trim() }] });
                setSlugText("");
              }}><PlusIcon /> {t("action.add")}</button>
            </Row>
            <p className="set-sub" style={{ marginTop: 24 }}>{t("settings.model-effort-sub")}</p>
            {([
              ...CLAUDE_MODELS.filter((m) => m.id).map((m) => ({ provider: "claude" as const, ...m })),
              ...CODEX_MODELS.filter((m) => m.id).map((m) => ({ provider: "codex" as const, ...m })),
              ...customModels.map((m) => ({ provider: m.provider, id: m.id, label: m.id })),
            ]).map((m) => {
              const key = m.provider + ":" + m.id;
              const efforts = m.provider === "claude" ? CLAUDE_EFFORTS : CODEX_EFFORTS;
              return (
                <Row key={key} title={modelLabel(m)} desc={m.provider === "claude" ? "Claude" : "Codex"}>
                  <select
                    value={modelEfforts[key] ?? ""}
                    onChange={(e) => {
                      const next = { ...modelEfforts };
                      if (e.target.value) next[key] = e.target.value;
                      else delete next[key];
                      set({ modelEfforts: next });
                    }}
                  >
                    {efforts.map((l) => (
                      <option key={l} value={l}>{l === "" ? t("common.provider-default") : l}</option>
                    ))}
                  </select>
                </Row>
              );
            })}
            <p className="set-sub" style={{ marginTop: 24 }}>{t("settings.slug-saved")}</p>
            {customModels.map((m, i) => (
              <Row key={m.provider + ":" + m.id + ":" + i} title={m.id} desc={m.provider === "claude" ? "Claude" : "Codex"}>
                <button className="set-btn" onClick={() =>
                  set({ customModels: customModels.filter((_, j) => j !== i) })
                }>{t("action.remove")}</button>
              </Row>
            ))}
            {customModels.length === 0 && (
              <p className="set-sub">{t("settings.no-custom-models")}</p>
            )}
          </>
        )}
        {section === "review" && (
          <>
            <h1>{t("settings.review")}</h1>
            <p className="set-sub">{t("settings.review-sub")}</p>
            <Row title={t("settings.autoreview-enable")} desc={t("settings.autoreview-enable-desc")}>
              <input
                type="checkbox"
                checked={s.autoReview.enabled}
                onChange={(e) => set({ autoReview: { ...s.autoReview, enabled: e.target.checked } })}
              />
            </Row>
            <Row title={t("settings.autoreview-agent")} desc={t("settings.autoreview-agent-desc")}>
              <select
                value={`${s.autoReview.provider}:${s.autoReview.model}:${s.autoReview.effort}`}
                onChange={(e) => {
                  const [provider, model, effort] = e.target.value.split(":");
                  set({ autoReview: { ...s.autoReview, provider: provider as "claude" | "codex", model, effort } });
                }}
              >
                <option value="codex:gpt-5.5:high">GPT-5.5 · high</option>
                <option value="codex:gpt-5.5:medium">GPT-5.5 · medium</option>
                <option value="claude:claude-opus-4-8:high">Opus 4.8 · high</option>
                <option value="claude:claude-sonnet-5:high">Sonnet 5 · high</option>
              </select>
            </Row>
            <Row title={t("settings.autoreview-trigger")}>
              <select
                value={s.autoReview.trigger}
                onChange={(e) => set({ autoReview: { ...s.autoReview, trigger: e.target.value as "always" | "files-changed" | "manual" } })}
              >
                <option value="files-changed">{t("settings.autoreview-files")}</option>
                <option value="always">{t("settings.autoreview-always")}</option>
                <option value="manual">{t("settings.autoreview-manual")}</option>
              </select>
            </Row>
          </>
        )}
        {section === "atelier" && (
          <>
            <h1>{t("settings.atelier")}</h1>
            <p className="set-sub">{t("settings.atelier-sub")}</p>
            <Row title={t("settings.gallery-folder")} desc={t("settings.gallery-folder-desc")}>
              <input className="set-text" value={s.galleryPath}
                onChange={(e) => set({ galleryPath: e.target.value })} />
            </Row>
            <Row title={t("settings.auto-refresh")} desc={t("settings.auto-refresh-desc")}>
              <input type="checkbox" checked={s.autoRefreshAtelier}
                onChange={(e) => set({ autoRefreshAtelier: e.target.checked })} />
            </Row>
          </>
        )}
        {section === "providers" && (
          <>
            <h1>{t("settings.providers")}</h1>
            <p className="set-sub">{t("settings.providers-sub")}</p>
            {provs === null && <div className="set-row-desc">{t("settings.checking")}</div>}
            {provs?.map((pr) => (
              <Row key={pr.id} title={pr.label} desc={pr.ok ? pr.version ?? "" : t("settings.path-missing")}>
                <span className={`set-badge ${pr.ok ? "ok" : "ko"}`}>{pr.ok ? t("settings.detected") : t("settings.absent")}</span>
              </Row>
            ))}
          </>
        )}
        {section === "avance" && (
          <>
            <h1>{t("settings.advanced")}</h1>
            <p className="set-sub">{t("settings.advanced-sub")}</p>
            <Row title={t("settings.sidecar")} desc={status ? t("settings.sidecar-desc", { port: status.port }) : "…"}>
              <span className={`set-badge ${p.ws?.readyState === 1 ? "ok" : "ko"}`}>
                {p.ws?.readyState === 1 ? t("settings.connected") : t("settings.disconnected")}
              </span>
            </Row>
            <Row title={t("settings.pasted-images")} desc={status ? t("settings.pasted-images-desc", { count: status.pastedCount, dir: status.pasteDir }) : "…"}>
              <button className="set-btn"
                onClick={() => p.ws?.readyState === 1 && p.ws.send(JSON.stringify({ type: "clearPasted" }))}>
                {t("action.clear")}
              </button>
            </Row>
          </>
        )}
      </div>
    </div>
  );
}
