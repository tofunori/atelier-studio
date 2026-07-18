// ComposerControls (plan 015, slice 5) : barre du composer — menu +, mode de
// permission, anneau de contexte, sélecteurs provider/modèle/effort, envoi/
// stop/queue. JSX déplacé verbatim ; états et catalogues restent chez Chat.
import React, { useEffect, useRef } from "react";
import { t } from "../../lib/i18n";
import { Select } from "../Select";
import { PlusIcon, ProviderIcon, ZapIcon } from "../icons";
import { ProviderInfo } from "../../lib/providers";
import { ButtonGroup } from "../shadcn/button-group";
import { Toggle } from "../shadcn/toggle";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../shadcn/dropdown-menu";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { Tooltip } from "../ui/Tooltip";
import { RowButton } from "../ui";
import { Kbd } from "../shadcn/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "../shadcn/popover";
import type { FollowUpMode } from "../../lib/chatDraftStore";
import { KbPicker, type KbBinding } from "./KbPicker";
import { ArrowUpIcon, SquareIcon } from "lucide-react";

const PERMISSION_MODES = [
  { id: "bypassPermissions", labelKey: "permission.full" },
  { id: "acceptEdits", labelKey: "permission.accept-edits" },
  { id: "default", labelKey: "action.ask-default" },
  { id: "plan", labelKey: "permission.plan" },
];

type ModelEntry = { id: string; label: string };

export function ComposerControls(p: {
  // état composer (possédé par Chat)
  hasContent: boolean;
  provider: string;
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
  effortOpen: boolean;
  setEffortOpen: React.Dispatch<React.SetStateAction<boolean>>;
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
  followUpMode: FollowUpMode;
  onGoal?: (action: "set" | "clear", objective?: string, status?: "active" | "paused") => void;
  defaults: {
    autoReview?: { enabled: boolean };
  };
  onOpenModelSettings?: () => void;
  // base de connaissances (plan 049 T3) — picker d'attache par conversation
  kb?: KbBinding;
}) {
  const {
    provider, model, setModel, effort, setEffort,
    permissionMode, setPermissionMode, plusOpen, setPlusOpen, menuOpen, setMenuOpen,
    effortOpen, setEffortOpen,
    setGoalOpen, attachFiles, providerInfo, resolvedModelId, autoReasoningLabel,
    levelsFor, effortFor, modelsFor, sortByFav, modelLabel, modelButtonLabel,
    favModels, toggleFavModel,
  } = p;
  // Gating par capabilities sidecar (plan 025, step 9) : seuls les contrôles
  // réellement supportés apparaissent. Vieux sidecar (capabilities absentes) :
  // comportement historique conservé — sélecteur complet, goals si Codex.
  const caps = providerInfo()?.capabilities;
  const allowedPermissionModes = caps
    ? caps.permissionModes ?? []
    : PERMISSION_MODES.map((m) => m.id);
  // seuls les modes connus du front sont listés, dans l'ordre UI existant
  const permissionOptions = PERMISSION_MODES.filter((m) => allowedPermissionModes.includes(m.id));
  const goalsSupported = caps ? caps.goals === true : provider === "codex";
  const activeProviderInfo = providerInfo();
  const effortTitle = activeProviderInfo?.kind === "api" ? t("chat.thinking") : t("chat.effort");
  const effortLevels = levelsFor(provider, resolvedModelId());
  const effortLabels: Record<string, string> = {
    "": activeProviderInfo?.kind === "api"
      ? autoReasoningLabel(activeProviderInfo, resolvedModelId())
      : t("common.auto-default"),
    none: "Off",
    // thinking Kimi : valeurs natives off/on (plan 046, décision 10)
    off: "Off",
    on: "On",
    minimal: "Minimal",
    low: "Low",
    medium: "Medium",
    high: "High",
    xhigh: "Extra High",
    max: "Max",
  };
  const effortIndex = Math.max(0, effortLevels.indexOf(effort));
  const effortSummary = effortLabels[effort] ?? effort;
  const queueSupported = caps?.queue !== false;
  const steeringSupported = caps?.steering !== false;
  const preferredFollowUpMode: FollowUpMode = p.followUpMode === "steer" && steeringSupported
    ? "steer"
    : queueSupported ? "queue" : "steer";
  const alternateFollowUpMode: FollowUpMode | null = preferredFollowUpMode === "queue" && steeringSupported
    ? "steer"
    : preferredFollowUpMode === "steer" && queueSupported ? "queue" : null;
  const followUpLabel = (mode: FollowUpMode) => t(mode === "queue" ? "action.queue" : "action.steer");
  // navigation clavier des menus (plan 020, étape 6) : flèches + Échap ;
  // focus posé sur le premier item à l'ouverture, rendu au déclencheur en sortie
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const modelBtnRef = useRef<HTMLButtonElement | null>(null);
  const effortMenuRef = useRef<HTMLDivElement | null>(null);
  const effortBtnRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (menuOpen) modelMenuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [menuOpen]);
  useEffect(() => {
    if (effortOpen) effortMenuRef.current?.querySelector<HTMLElement>('[role="slider"]')?.focus();
  }, [effortOpen]);
  function menuKeys(close: () => void, anchor: React.RefObject<HTMLButtonElement | null>) {
    return (e: React.KeyboardEvent) => {
      const panel = e.currentTarget as HTMLElement;
      const items = Array.from(panel.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
      if (!items.length) return;
      const idx = items.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === "ArrowDown") { e.preventDefault(); items[(idx + 1) % items.length].focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); items[(idx - 1 + items.length) % items.length].focus(); }
      else if (e.key === "Escape") { e.stopPropagation(); close(); anchor.current?.focus(); }
    };
  }
  return (
    <>
        <div className="composer-bar">
          <DropdownMenu open={plusOpen} onOpenChange={setPlusOpen}>
            <ButtonGroup className="composer-tool-group">
              <IconButton
                size="s"
                className="ghost qa-zap-btn"
                label={t("qa.open")}
                title={t("qa.open") + " (⌥⌘K)"}
                onClick={() => window.dispatchEvent(new CustomEvent("quick-ask-toggle"))}
              >
                <ZapIcon />
              </IconButton>
              <DropdownMenuTrigger
                render={
                  <IconButton
                    size="s"
                    className="ghost"
                    label={t("action.add-file-image")}
                    title={t("action.add-file-image")}
                  >
                    <PlusIcon />
                  </IconButton>
                }
              />
              {p.kb && <KbPicker binding={p.kb} />}
            </ButtonGroup>
            <DropdownMenuContent side="top" align="start" sideOffset={8} className="plus-up tw:w-60">
                <DropdownMenuItem className="mp-item" onClick={() => attachFiles()}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                    <path d="M13.5 7.5l-5 5a3.2 3.2 0 0 1-4.5-4.5l5.5-5.5a2.2 2.2 0 0 1 3.1 3.1l-5.5 5.5a1.1 1.1 0 0 1-1.6-1.6l5-5" />
                  </svg>
                  <span>{t("action.add-file-image")}</span>
                </DropdownMenuItem>
                {allowedPermissionModes.includes("plan") && (
                <DropdownMenuCheckboxItem
                  checked={permissionMode === "plan"}
                  className="mp-item"
                  onCheckedChange={(checked) => setPermissionMode(checked ? "plan" : "bypassPermissions")}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                    <path d="M2.5 4h2M6.5 4h7M2.5 8h2M6.5 8h7M2.5 12h2M6.5 12h7" />
                  </svg>
                  <span>{t("permission.plan")}</span>
                </DropdownMenuCheckboxItem>
                )}
                <DropdownMenuCheckboxItem
                  checked={!!p.defaults.autoReview?.enabled}
                  className="mp-item"
                  onCheckedChange={() => window.dispatchEvent(new CustomEvent("autoreview-toggle"))}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 1.8l5 2v4c0 3.2-2.2 5.4-5 6.4-2.8-1-5-3.2-5-6.4v-4z" />
                    <path d="M5.8 8l1.6 1.6L10.5 6.3" />
                  </svg>
                  <span>Auto-review</span>
                </DropdownMenuCheckboxItem>
                {goalsSupported && p.onGoal && (
                  <DropdownMenuItem className="mp-item" onClick={() => setGoalOpen((v) => !v)}>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                      <circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="2.4" />
                    </svg>
                    <span>{t("goal.menu")}</span>
                  </DropdownMenuItem>
                )}
            </DropdownMenuContent>
          </DropdownMenu>
          {permissionOptions.length > 0 && (
            <Select
              compact
              title={t("settings.permission-default")}
              value={permissionMode}
              onChange={setPermissionMode}
              options={permissionOptions.map((m) => ({ value: m.id, label: t(m.labelKey as any) }))}
            />
          )}
          <span className="flex" />
          {p.usage && (
            <RowButton className="ctx-ring-wrap"
              aria-label={t("chat.context-window")}>
              {(() => {
                // Priorité : window fourni par le provider (Codex, Grok registry),
                // sinon heuristique modèle (Claude [1m], Grok 4.5 = 500k docs xAI,
                // Kimi K3 = 1M platform.kimi.ai), sinon défaut historique 200k.
                const WINDOW = p.usage.window
                  ?? (model.includes("[1m]") ? 1_000_000
                    : /^grok-4\.5\b/.test(model) ? 500_000
                    // ids Kimi réels : `kimi-code/k3` (1M) et
                    // `kimi-code/kimi-for-coding*` (262 144) — maxContextSize
                    // du `kimi provider list --json` 0.26.0
                    : /(^|\/)(kimi-)?k3\b/.test(model) ? 1_000_000
                    : /(^|\/)kimi-for-coding/.test(model) ? 262_144
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
                        stroke={pct > 80 ? "var(--status-error)" : pct > 60 ? "var(--status-warning)" : "var(--muted)"}
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
            </RowButton>
          )}
          <span className="model-pick">
            <Popover
              open={menuOpen}
              onOpenChange={(next) => {
                if (next) {
                  setEffortOpen(false);
                }
                setMenuOpen(next);
              }}
            >
            <PopoverTrigger
              render={
                <RowButton ref={modelBtnRef} className="mp-btn mp-model" title={t("chat.model-title")}>
                  <span className={!model ? "mp-dim" : undefined}>{modelButtonLabel}</span>
                </RowButton>
              }
            />
            {menuOpen && (() => {
              // Un fil possède déjà son provider. Le picker de modèles reste
              // strictement dans ce provider; changer de provider se fait lors
              // de la création d'un nouveau chat, jamais depuis ce popover.
              const menuProvider = provider;
              const menuInfo = providerInfo(menuProvider) ?? {
                id: menuProvider as ProviderInfo["id"],
                label: menuProvider === "claude"
                  ? "Claude Code"
                  : menuProvider === "opencode"
                    ? "OpenCode"
                    : menuProvider.charAt(0).toUpperCase() + menuProvider.slice(1),
                kind: "cli" as const,
                version: null,
                ok: true,
                models: [],
                defaultModel: "",
                efforts: [],
              };
              const sortedModels = sortByFav(modelsFor(menuProvider), menuProvider);
              const activeModelId = resolvedModelId(menuProvider);
              const menuModels = menuProvider === "opencode"
                ? sortedModels.filter((entry) => (
                    favModels.includes(`${menuProvider}:${entry.id}`)
                    || (provider === menuProvider && activeModelId === entry.id)
                  ))
                : sortedModels;
              return (
                <PopoverContent
                  plain
                  side="top"
                  align="end"
                  sideOffset={6}
                  className="mp-menu model-menu model-only"
                  ref={modelMenuRef}
                  role="menu"
                  aria-label={t("chat.model-title")}
                  onKeyDown={menuKeys(() => setMenuOpen(false), modelBtnRef)}
                >
                  {false && <div className="model-provider-list model-effort-legacy" aria-hidden="true">
                    {(() => {
                      // effort du provider COURANT — popover unique modèle+effort
                      // (décision composer 2026-07-09 : options avancées en popover,
                      // valeur active toujours résumée dans la barre)
                      const info = providerInfo();
                      const effortTitle = info?.kind === "api" ? t("chat.thinking") : t("chat.effort");
                      const lvls = levelsFor(provider, resolvedModelId());
                      if (lvls.length < 2) return null;
                      const labels: Record<string, string> = {
                        "": info?.kind === "api" ? autoReasoningLabel(info, resolvedModelId()) : t("common.auto-default"),
                        none: "Off", low: "Low", medium: "Medium", high: "High",
                        xhigh: "Extra High", max: "Max", minimal: "Minimal",
                      };
                      const idx = Math.max(0, lvls.indexOf(effort));
                      const pick = (e: React.PointerEvent) => {
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const i = Math.min(lvls.length - 1, Math.max(0,
                          Math.round(((e.clientX - r.left) / r.width) * (lvls.length - 1))));
                        if (lvls[i] !== effort) setEffort(lvls[i]);
                      };
                      return (
                        <div className="ef-block">
                          <div className="mp-sep" />
                          <div className="ef-title">{effortTitle} <b>{labels[effort] ?? effort}</b></div>
                          <div className="ef-scale"><span>{t("effort.faster")}</span><span>{t("effort.smarter")}</span></div>
                          <div className="ef-track"
                            role="slider"
                            tabIndex={0}
                            aria-label={effortTitle}
                            aria-valuemin={0}
                            aria-valuemax={lvls.length - 1}
                            aria-valuenow={idx}
                            aria-valuetext={labels[effort] ?? effort}
                            onKeyDown={(e) => {
                              if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                                e.preventDefault(); e.stopPropagation();
                                setEffort(lvls[Math.min(lvls.length - 1, idx + 1)]);
                              } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                                e.preventDefault(); e.stopPropagation();
                                setEffort(lvls[Math.max(0, idx - 1)]);
                              }
                            }}
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
                  </div>}
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
                      // Claude : chaque nouveau choix part en contexte 1M. Le
                      // bouton 200k plus bas reste disponible comme exception
                      // explicite après la sélection.
                      const baseModelId = resolvedModelId(menuProvider, m.id)
                        || (menuProvider === "claude" ? "claude-sonnet-5" : "");
                      const selectedModelId = menuProvider === "claude" && !baseModelId.endsWith("[1m]")
                        ? `${baseModelId}[1m]`
                        : baseModelId;
                      const active = provider === menuProvider && activeModelId === selectedModelId;
                      const fav = favModels.includes(key);
                      return (
                        // interactifs JAMAIS imbriqués (contrat ThreadRow) :
                        // rangée = wrapper, sélection et favori = boutons frères
                        <div key={key} className={`mp-item model-row ${active ? "active" : ""}`}>
                          <RowButton
                            role="menuitemradio"
                            aria-checked={active}
                            className="mp-row-main"
                            onClick={() => {
                              setModel(selectedModelId);
                              setEffort(effortFor(menuProvider, selectedModelId));
                              setMenuOpen(false);
                            }}
                          >
                            <span title={m.id || undefined}>{modelLabel(m, menuProvider)}</span>
                          </RowButton>
                          <span className="mp-end">
                            {active && <span className="mp-check">✓</span>}
                            {m.id && (
                              <Toggle
                                className={`mp-star ${fav ? "on" : ""}`}
                                pressed={fav}
                                aria-label={fav ? t("action.remove-favorite") : t("action.add-favorite")}
                                title={fav ? t("action.remove-favorite") : t("action.add-favorite")}
                                onClick={(e) => e.stopPropagation()}
                                onPressedChange={() => toggleFavModel(key)}
                              >
                                {fav ? "★" : "☆"}
                              </Toggle>
                            )}
                          </span>
                        </div>
                      );
                    })}
                    {menuProvider === "claude" && (
                      <>
                        <div className="mp-sep" />
                        <div className="mp-hd">{t("chat.context")}</div>
                        {[
                          { id: "200k", label: t("chat.context-200k"), on: provider === "claude" && !activeModelId.includes("[1m]") },
                          { id: "1m", label: "1M", on: provider === "claude" && activeModelId.includes("[1m]") },
                        ].map((ctx) => (
                          <RowButton key={ctx.id} role="menuitemradio" aria-checked={ctx.on}
                            className="mp-item model-row"
                            onClick={() => {
                              if (ctx.id === "1m" && !activeModelId.includes("[1m]")) {
                                setModel(activeModelId + "[1m]");
                              } else if (ctx.id === "200k" && activeModelId.includes("[1m]")) {
                                setModel(activeModelId.replace(/\[1m\]$/, ""));
                              }
                            }}>
                            <span>{ctx.label}</span>
                            {ctx.on && <span className="mp-check">✓</span>}
                          </RowButton>
                        ))}
                      </>
                    )}
                    {menuProvider === "opencode" && p.onOpenModelSettings && (
                      <>
                        <div className="mp-sep" />
                        <RowButton
                          className="mp-item model-row model-manage-row"
                          onClick={() => {
                            setMenuOpen(false);
                            p.onOpenModelSettings?.();
                          }}
                        >
                          <span>{t("chat.manage-models")}</span>
                        </RowButton>
                      </>
                    )}
                  </div>
                </PopoverContent>
              );
            })()}
            </Popover>
          </span>
          {effortLevels.length >= 2 && (
            <span className="effort-pick">
              <Popover
                open={effortOpen}
                onOpenChange={(next) => {
                  if (next) setMenuOpen(false);
                  setEffortOpen(next);
                }}
              >
              <PopoverTrigger
                render={
                  <RowButton ref={effortBtnRef} className="mp-btn mp-effort" title={effortTitle}>
                    {effortSummary}
                  </RowButton>
                }
              />
              {effortOpen && (
                <PopoverContent
                  plain
                  side="top"
                  align="end"
                  sideOffset={6}
                  className="mp-menu effort-menu"
                  ref={effortMenuRef}
                  aria-label={effortTitle}
                >
                  <div className="ef-block">
                    <div className="ef-title">{effortTitle} <b>{effortSummary}</b></div>
                    <div className="ef-scale"><span>{t("effort.faster")}</span><span>{t("effort.smarter")}</span></div>
                    <div
                      className="ef-track"
                      role="slider"
                      tabIndex={0}
                      aria-label={effortTitle}
                      aria-valuemin={0}
                      aria-valuemax={effortLevels.length - 1}
                      aria-valuenow={effortIndex}
                      aria-valuetext={effortSummary}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                          e.preventDefault();
                          e.stopPropagation();
                          setEffort(effortLevels[Math.min(effortLevels.length - 1, effortIndex + 1)]);
                        } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                          e.preventDefault();
                          e.stopPropagation();
                          setEffort(effortLevels[Math.max(0, effortIndex - 1)]);
                        }
                      }}
                      onPointerDown={(e) => {
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                        const rect = e.currentTarget.getBoundingClientRect();
                        const index = Math.min(effortLevels.length - 1, Math.max(0,
                          Math.round(((e.clientX - rect.left) / rect.width) * (effortLevels.length - 1))));
                        if (effortLevels[index] !== effort) setEffort(effortLevels[index]);
                      }}
                      onPointerMove={(e) => {
                        if (!e.buttons) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const index = Math.min(effortLevels.length - 1, Math.max(0,
                          Math.round(((e.clientX - rect.left) / rect.width) * (effortLevels.length - 1))));
                        if (effortLevels[index] !== effort) setEffort(effortLevels[index]);
                      }}
                    >
                      <div className="ef-fill" style={{ width: `${(effortIndex / (effortLevels.length - 1)) * 100}%` }} />
                      {effortLevels.map((level, index) => (
                        <span
                          key={level}
                          className={`ef-dot ${index === effortLevels.length - 1 ? "last" : ""}`}
                          style={{ left: `${(index / (effortLevels.length - 1)) * 100}%` }}
                        />
                      ))}
                      <div className="ef-thumb" style={{ left: `${(effortIndex / (effortLevels.length - 1)) * 100}%` }} />
                    </div>
                  </div>
                </PopoverContent>
              )}
              </Popover>
            </span>
          )}
          {p.workingSince != null ? (
            p.hasContent ? (
              <Tooltip
                placement="top-end"
                contentClassName="follow-up-tooltip"
                label={(
                  <span className="follow-up-tooltip-grid">
                    <span>{followUpLabel(preferredFollowUpMode)}</span>
                    <Kbd>{t("shortcut.enter")}</Kbd>
                    {alternateFollowUpMode ? (
                      <>
                        <span>{followUpLabel(alternateFollowUpMode)}</span>
                        <Kbd>⌘ {t("shortcut.enter")}</Kbd>
                      </>
                    ) : null}
                  </span>
                )}
              >
                <Button
                  type="submit"
                  variant="secondary"
                  className={`send follow-up-submit follow-up-${preferredFollowUpMode}`}
                  disabled={p.disabled || !p.hasContent}
                  aria-label={followUpLabel(preferredFollowUpMode)}
                >
                  <ArrowUpIcon data-icon="inline-start" aria-hidden="true" />
                </Button>
              </Tooltip>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="send stop"
                disabled={p.disabled}
                title={t("action.interrupt")}
                aria-label={t("action.interrupt")}
                onClick={p.onStop}
              >
                <SquareIcon data-icon="inline-start" aria-hidden="true" />
              </Button>
            )
          ) : (
            <Button
              type="submit"
              variant="secondary"
              className="send"
              disabled={p.disabled || !p.hasContent}
              title={t("action.send")}
            >
              ↑
            </Button>
          )}
        </div>
    </>
  );
}
