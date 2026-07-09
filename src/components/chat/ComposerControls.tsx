// ComposerControls (plan 015, slice 5) : barre du composer — menu +, mode de
// permission, anneau de contexte, sélecteurs provider/modèle/effort, envoi/
// stop/queue. JSX déplacé verbatim ; états et catalogues restent chez Chat.
import React from "react";
import { t } from "../../lib/i18n";
import { Select } from "../Select";
import { PlusIcon, ProviderIcon, ZapIcon } from "../icons";
import { ProviderInfo, orderedVisibleProviders } from "../../lib/providers";

const PERMISSION_MODES = [
  { id: "bypassPermissions", labelKey: "permission.full" },
  { id: "acceptEdits", labelKey: "permission.accept-edits" },
  { id: "default", labelKey: "action.ask-default" },
  { id: "plan", labelKey: "permission.plan" },
];

type ModelEntry = { id: string; label: string };

export function ComposerControls(p: {
  // état composer (possédé par Chat)
  text: string;
  setText: React.Dispatch<React.SetStateAction<string>>;
  provider: string;
  setProvider: (v: string) => void;
  model: string;
  setModel: React.Dispatch<React.SetStateAction<string>>;
  effort: string;
  setEffort: (v: string) => void;
  permissionMode: string;
  setPermissionMode: React.Dispatch<React.SetStateAction<string>>;
  plusOpen: boolean;
  setPlusOpen: React.Dispatch<React.SetStateAction<boolean>>;
  menuOpen: boolean;
  setMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  modelMenuProvider: string;
  setModelMenuProvider: (v: string) => void;
  effortMenuOpen: boolean;
  setEffortMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setGoalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  attachFiles: () => void;
  // catalogues/helpers (closures Chat)
  providerInfo: (pv?: string) => ProviderInfo | undefined;
  resolvedModelId: (pv?: string, modelId?: string) => string;
  autoReasoningLabel: (info: ProviderInfo | undefined, modelId: string) => string;
  levelsFor: (pv: string, modelId: string) => string[];
  effortFor: (pv: string, modelId: string) => string;
  modelsFor: (pv: string) => ModelEntry[];
  sortByFav: (models: ModelEntry[], pv: string) => ModelEntry[];
  modelLabel: (m: ModelEntry, pv: string) => string;
  modelButtonLabel: string;
  favModels: string[];
  toggleFavModel: (key: string) => void;
  // hôte (mêmes clés que les p.* du JSX d'origine)
  usage: { context: number; output: number; cost: number | null; turns: number | null; window?: number | null } | null;
  disabled: boolean;
  workingSince: number | null;
  onStop: () => void;
  onSubmit: (prompt: string, provider: string, model: string, effort: string, permissionMode: string, mode: "steer" | "queue") => void;
  onGoal?: (action: "set" | "clear", objective?: string) => void;
  defaults: {
    autoReview?: { enabled: boolean };
    providerOrder?: string[];
    hiddenProviders?: string[];
  };
  providers?: ProviderInfo[];
}) {
  const {
    text, setText, provider, setProvider, model, setModel, effort, setEffort,
    permissionMode, setPermissionMode, plusOpen, setPlusOpen, menuOpen, setMenuOpen,
    modelMenuProvider, setModelMenuProvider, effortMenuOpen, setEffortMenuOpen,
    setGoalOpen, attachFiles, providerInfo, resolvedModelId, autoReasoningLabel,
    levelsFor, effortFor, modelsFor, sortByFav, modelLabel, modelButtonLabel,
    favModels, toggleFavModel,
  } = p;
  return (
    <>
        <div className="composer-bar">
          <span className="plus-wrap" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="ghost qa-zap-btn" title={t("qa.open") + " (⌥⌘K)"}
              onClick={() => window.dispatchEvent(new CustomEvent("quick-ask-toggle"))}>
              <ZapIcon />
            </button>
            <button type="button" className="ghost" title={t("action.add-file-image")} onClick={() => setPlusOpen((v) => !v)}>
              <PlusIcon />
            </button>
            {plusOpen && (
              <div className="mp-menu plus-up">
                <div className="mp-item" onClick={() => { setPlusOpen(false); attachFiles(); }}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                    <path d="M13.5 7.5l-5 5a3.2 3.2 0 0 1-4.5-4.5l5.5-5.5a2.2 2.2 0 0 1 3.1 3.1l-5.5 5.5a1.1 1.1 0 0 1-1.6-1.6l5-5" />
                  </svg>
                  <span>{t("action.add-file-image")}</span>
                </div>
                <div className="mp-item" onClick={() => setPermissionMode(permissionMode === "plan" ? "bypassPermissions" : "plan")}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                    <path d="M2.5 4h2M6.5 4h7M2.5 8h2M6.5 8h7M2.5 12h2M6.5 12h7" />
                  </svg>
                  <span>{t("permission.plan")}</span>
                  <span className={`toggle ${permissionMode === "plan" ? "on" : ""}`}>
                    <span className="knob" />
                  </span>
                </div>
                <div className="mp-item" onClick={() =>
                  window.dispatchEvent(new CustomEvent("autoreview-toggle"))
                }>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 1.8l5 2v4c0 3.2-2.2 5.4-5 6.4-2.8-1-5-3.2-5-6.4v-4z" />
                    <path d="M5.8 8l1.6 1.6L10.5 6.3" />
                  </svg>
                  <span>Auto-review</span>
                  <span className={`toggle ${p.defaults.autoReview?.enabled ? "on" : ""}`}>
                    <span className="knob" />
                  </span>
                </div>
                {provider === "codex" && p.onGoal && (
                  <div className="mp-item" onClick={() => { setPlusOpen(false); setGoalOpen((v) => !v); }}>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                      <circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="2.4" />
                    </svg>
                    <span>{t("goal.menu")}</span>
                  </div>
                )}
              </div>
            )}
          </span>
          <Select
            compact
            title={t("settings.permission-default")}
            value={permissionMode}
            onChange={setPermissionMode}
            options={PERMISSION_MODES.map((m) => ({ value: m.id, label: t(m.labelKey as any) }))}
          />
          <span className="flex" />
          {p.usage && (
            <span className="ctx-ring-wrap">
              {(() => {
                // Priorité : window fourni par le provider (Codex, Grok registry),
                // sinon heuristique modèle (Claude [1m], Grok 4.5 = 500k docs xAI),
                // sinon défaut historique 200k.
                const WINDOW = p.usage.window
                  ?? (model.includes("[1m]") ? 1_000_000
                    : /^grok-4\.5\b/.test(model) ? 500_000
                    : 200_000);
                const pct = Math.min(100, Math.round((p.usage.context / WINDOW) * 100));
                const r = 6.5, c = 2 * Math.PI * r;
                const windowLabel = WINDOW >= 1_000_000
                  ? `${(WINDOW / 1_000_000).toFixed(WINDOW % 1_000_000 === 0 ? 0 : 1)}M`
                  : `${Math.round(WINDOW / 1000)}k`;
                return (
                  <>
                    <svg className="ctx-ring" width="18" height="18" viewBox="0 0 18 18">
                      <circle cx="9" cy="9" r={r} fill="none" stroke="var(--bg-ctl)" strokeWidth="2.4" />
                      <circle cx="9" cy="9" r={r} fill="none"
                        stroke={pct > 80 ? "#e06c75" : pct > 60 ? "#e0b74a" : "var(--muted)"}
                        strokeWidth="2.4" strokeLinecap="round"
                        strokeDasharray={`${(pct / 100) * c} ${c}`}
                        transform="rotate(-90 9 9)" />
                    </svg>
                    <span className="ctx-pop">
                      <b>{t("chat.context-window")}</b>
                      <span>{t("chat.context-used", { pct, used: Math.round(p.usage.context / 1000), window: windowLabel })}</span>
                      <span>{t("chat.last-output", { tokens: Math.round(p.usage.output / 1000 * 10) / 10 })}</span>
                      {p.usage.turns != null && <span>{t("chat.session-turns", { turns: p.usage.turns })}</span>}
                      {p.usage.cost != null && <span>{t("chat.cost", { cost: p.usage.cost.toFixed(2) })}</span>}
                    </span>
                  </>
                );
              })()}
            </span>
          )}
          <span className="model-pick" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="mp-btn"
              onClick={() => { setMenuOpen((v) => !v); setModelMenuProvider(""); setEffortMenuOpen(false); }}
            >
              <ProviderIcon provider={provider} />
              <span className={!model ? "mp-dim" : undefined}>{modelButtonLabel}</span>
            </button>
            {menuOpen && (() => {
              const visibleProviders = orderedVisibleProviders(
                p.providers?.length ? p.providers : ([
                  { id: "claude", label: "Claude", kind: "cli", version: null, ok: true, models: [], defaultModel: "", efforts: [] },
                  { id: "codex", label: "Codex", kind: "cli", version: null, ok: true, models: [], defaultModel: "", efforts: [] },
                ] as ProviderInfo[]),
                { providerOrder: p.defaults.providerOrder ?? [], hiddenProviders: p.defaults.hiddenProviders ?? [] },
                provider,
              );
              const menuInfo = visibleProviders.find((info) => info.id === modelMenuProvider) ?? null;
              const menuProvider = menuInfo?.id ?? provider;
              const menuModels = sortByFav(modelsFor(menuProvider), menuProvider);
              return (
                <div className="mp-menu model-menu">
                  <div className="model-provider-list">
                    {visibleProviders.map((info) => {
                      const pv = info.id;
                      const active = pv === menuProvider;
                      const selected = pv === provider;
                      const count = Math.max(0, modelsFor(pv).length - 1);
                      return (
                        <button
                          key={pv}
                          type="button"
                          className={`model-provider-row ${active ? "active" : ""} ${selected ? "selected" : ""}`}
                          onClick={() => setModelMenuProvider(active ? "" : pv)}
                        >
                          <ProviderIcon provider={pv} size={12} />
                          <span>{info.label}</span>
                          <small className="mp-chev">{count ? count : ""} ›</small>
                        </button>
                      );
                    })}
                  </div>
                  {menuInfo && (
                  <div className="model-list">
                    <div className="model-list-head">
                      <span>
                        <ProviderIcon provider={menuProvider} size={11} /> {menuInfo?.label ?? menuProvider}
                      </span>
                      {menuInfo?.kind === "api" && !menuInfo.ok && (
                        <small>{t("settings.key-missing")}</small>
                      )}
                    </div>
                    {menuModels.map((m) => {
                      const key = menuProvider + ":" + m.id;
                      const active = provider === menuProvider && model === m.id;
                      const fav = favModels.includes(key);
                      return (
                        <div
                          key={key}
                          className={`mp-item model-row ${active ? "active" : ""}`}
                          onClick={() => {
                            setProvider(menuProvider);
                            setModel(m.id);
                            setEffort(effortFor(menuProvider, m.id));
                          }}
                        >
                          <span>{modelLabel(m, menuProvider)}</span>
                          <span className="mp-end">
                            {active && <span className="mp-check">✓</span>}
                            <span
                              className={`mp-star ${fav ? "on" : ""}`}
                              title={fav ? t("action.remove-favorite") : t("action.add-favorite")}
                              onClick={(e) => { e.stopPropagation(); toggleFavModel(key); }}
                            >
                              {fav ? "★" : "☆"}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                    {menuProvider === "claude" && (
                      <>
                        <div className="mp-sep" />
                        <div className="mp-hd">{t("chat.context")}</div>
                        {[
                          { id: "200k", label: t("chat.context-200k"), on: provider === "claude" && !model.includes("[1m]") },
                          { id: "1m", label: "1M", on: provider === "claude" && model.includes("[1m]") },
                        ].map((ctx) => (
                          <div key={ctx.id} className="mp-item model-row"
                            onClick={() => {
                              setProvider("claude");
                              if (ctx.id === "1m" && !model.includes("[1m]")) {
                                setModel((model || "claude-sonnet-5") + "[1m]");
                              } else if (ctx.id === "200k" && model.includes("[1m]")) {
                                setModel(model.replace(/\[1m\]$/, ""));
                              }
                            }}>
                            <span>{ctx.label}</span>
                            {ctx.on && <span className="mp-check">✓</span>}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                  )}
                </div>
              );
            })()}
          </span>
          <span className="model-pick" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="mp-btn mp-effort"
              title={providerInfo()?.kind === "api" ? t("chat.thinking") : t("chat.effort")}
              onClick={() => { setEffortMenuOpen((v) => !v); setMenuOpen(false); }}
            >
              <span className={!effort ? "mp-dim" : undefined}>
                {effort || (providerInfo()?.kind === "api"
                  ? autoReasoningLabel(providerInfo(), resolvedModelId())
                  : t("common.auto-default"))}
              </span>
            </button>
            {effortMenuOpen && (() => {
              const info = providerInfo();
              const effortTitle = info?.kind === "api" ? t("chat.thinking") : t("chat.effort");
              const lvls = levelsFor(provider, resolvedModelId());
              const labels: Record<string, string> = {
                "": info?.kind === "api" ? autoReasoningLabel(info, resolvedModelId()) : t("common.auto-default"),
                none: "Off", low: "Low", medium: "Medium", high: "High",
                xhigh: "Extra High", max: "Max", minimal: "Minimal",
              };
              const idx = Math.max(0, lvls.indexOf(effort));
              // slider continu : glisser déplace le pouce, le libellé suit en direct
              const pick = (e: React.PointerEvent) => {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const i = Math.min(lvls.length - 1, Math.max(0,
                  Math.round(((e.clientX - r.left) / r.width) * (lvls.length - 1))));
                if (lvls[i] !== effort) setEffort(lvls[i]);
              };
              return (
                <div className="mp-menu effort-pop">
                  <div className="ef-title">{effortTitle} <b>{labels[effort] ?? effort}</b></div>
                  <div className="ef-scale"><span>{t("effort.faster")}</span><span>{t("effort.smarter")}</span></div>
                  <div className="ef-track"
                    onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); pick(e); }}
                    onPointerMove={(e) => { if (e.buttons) pick(e); }}
                  >
                    <div className="ef-fill" style={{ width: `${(idx / (lvls.length - 1)) * 100}%` }} />
                    {lvls.map((lvl, i) => (
                      <span key={lvl} className={`ef-dot ${i === lvls.length - 1 ? "last" : ""}`}
                        style={{ left: `${(i / (lvls.length - 1)) * 100}%` }} />
                    ))}
                    <div className="ef-thumb" style={{ left: `${(idx / (lvls.length - 1)) * 100}%` }} />
                  </div>
                </div>
              );
            })()}
          </span>
          {p.workingSince != null ? (
            text.trim() ? (
              <>
                <button
                  type="button"
                  className="queue-btn"
                  disabled={p.disabled}
                  title={t("action.queue-title")}
                  onClick={() => {
                    if (!text.trim()) return;
                    p.onSubmit(text, provider, model, effort, permissionMode, "queue");
                    setText("");
                  }}
                >
                  ⏱ {t("action.queue")}
                </button>
                <button className="send steer" disabled={p.disabled} title={t("action.send-now")}>
                  ↑
                </button>
              </>
            ) : (
              <button
                type="button"
                className="send stop"
                disabled={p.disabled}
                title={t("action.interrupt")}
                onClick={p.onStop}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" fill="currentColor" />
                </svg>
              </button>
            )
          ) : (
            <button className="send" disabled={p.disabled} title={t("action.send")}>
              ↑
            </button>
          )}
        </div>
    </>
  );
}
