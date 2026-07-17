import { useEffect, useState } from "react";
import { confirm as tauriConfirm } from "@tauri-apps/plugin-dialog";
import { Settings as S, DEFAULT_SETTINGS } from "../lib/settings";
import {
  getAppSnapState,
  onAppSnapState,
  requestAppSnapPermissions,
  setAppSnapEnabled,
  type AppSnapPermission,
  type AppSnapState,
} from "../lib/appSnap";
import { THEME_PRESETS } from "../lib/themes";
import { setLanguage, t } from "../lib/i18n";
import { PlusIcon } from "./icons";
import { Select } from "./Select";
import { Button, InlineNotice, SegmentedControl, showError } from "./ui";
import { Checkbox, CheckboxIndicator } from "./shadcn/checkbox";
import { Field, FieldGroup, FieldLabel } from "./shadcn/field";
import { Input } from "./shadcn/input";
import { Switch } from "./shadcn/switch";
import { Textarea } from "./shadcn/textarea";
import { ToggleGroup, ToggleGroupItem } from "./shadcn/toggle-group";
import { Slider as ShadcnSlider } from "./shadcn/slider";
import { CheckIcon, ScanLineIcon } from "lucide-react";
import { RemoteDevicesPanel } from "./RemoteDevicesPanel";

const SECTIONS = [
  { id: "general", labelKey: "settings.general" },
  { id: "setup", labelKey: "settings.setup" },
  { id: "apparence", labelKey: "settings.appearance" },
  { id: "modeles", labelKey: "settings.models" },
  { id: "review", labelKey: "settings.review" },
  { id: "appsnap", labelKey: "settings.appsnap" },
  { id: "atelier", labelKey: "settings.atelier" },
  { id: "providers", labelKey: "settings.providers" },
  { id: "avance", labelKey: "settings.advanced" },
];

const CLAUDE_MODELS = [
  { id: "", labelKey: "common.default-cli" },
  { id: "claude-fable-5[1m]", label: "Fable 5 · 1M" },
  { id: "claude-opus-4-8[1m]", label: "Opus 4.8 · 1M" },
  { id: "claude-sonnet-5[1m]", label: "Sonnet 5 · 1M" },
  { id: "claude-haiku-4-5-20251001[1m]", label: "Haiku 4.5 · 1M" },
];
const CLAUDE_EFFORTS = ["", "low", "medium", "high", "xhigh", "max"];
const CODEX_EFFORTS = ["", "low", "medium", "high", "xhigh"];

const MODEL_LABELS: Record<string, Record<string, string>> = {
  claude: Object.fromEntries(CLAUDE_MODELS.filter((m) => m.id).map((m) => [m.id, m.label ?? m.id])),
};

type ProviderCatalogRow = {
  id: string;
  label: string;
  version: string | null;
  ok: boolean;
  kind?: "cli" | "api";
  models?: string[];
  defaultModel?: string | null;
  efforts?: string[];
};

type SetupProvider = {
  id: string;
  label: string;
  kind: "cli" | "api";
  installed: boolean;
  version: string | null;
  binPath: string | null;
  auth: string;
  models: number;
  defaultModel?: string | null;
  modelError?: string | null;
  /** Commande de login annoncée par le harnais (Kimi, plan 046). */
  loginCommand?: string | null;
};

type SetupStatus = {
  runtime: { node: string; version: string; bundled: boolean };
  sidecar: { pid: number; startedAt: string; appVersion: string; bundleHash: string; dir: string };
  providers: SetupProvider[];
};

function modelLabel(m: { label?: string; labelKey?: string }) {
  return m.labelKey === "common.default-cli" ? t("common.default-cli") : m.label ?? "";
}

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

function Toggle(p: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <Switch
      checked={p.checked}
      aria-label={p.label ?? "Toggle setting"}
      className={`switch ${p.checked ? "on" : ""}`}
      onCheckedChange={(checked) => p.onChange(checked)}
    />
  );
}

// pastille couleur façon Codex : fond = couleur, hex lisible par-dessus
function hexLuma(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
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

// groupe = étiquette discrète + carte arrondie contenant des rangées séparées par des filets
function Group(p: { label?: string; children: React.ReactNode }) {
  return (
    <div className="set-group">
      {p.label && <div className="set-group-label">{p.label}</div>}
      <div className="set-card">{p.children}</div>
    </div>
  );
}

export default function SettingsPage(p: {
  settings: S;
  onChange: (s: S) => void;
  onClose: () => void;
  ws: WebSocket | null;
  projects?: string[];
}) {
  const [section, setSection] = useState("general");
  // ≤880 px : la nav colonne écraserait le contenu — select compact au-dessus
  const [narrow, setNarrow] = useState(() =>
    typeof window !== "undefined" && window.matchMedia?.("(max-width: 880px)")?.matches === true);
  const [slugProv, setSlugProv] = useState<"claude" | "codex">("codex");
  const [slugText, setSlugText] = useState("");
  const [themeQuery, setThemeQuery] = useState("");
  const [status, setStatus] = useState<{ port: number | null; pastedCount: number; pasteDir: string } | null>(null);
  const [provs, setProvs] = useState<ProviderCatalogRow[] | null>(null);
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [retitleStatus, setRetitleStatus] = useState("");
  const [apiProvs, setApiProvs] = useState<{
    id: string; label: string; baseURL: string; protocol: "openai" | "anthropic";
    models: string[]; defaultModel: string; keySet: boolean; apiKeyEnv?: string | null;
    modelReasoning?: Record<string, any>;
  }[]>([]);
  const [apiForm, setApiForm] = useState<{
    id: string; label: string; baseURL: string; protocol: "openai" | "anthropic";
    apiKey: string; models: string; modelMetadata?: Record<string, { label?: string; reasoning?: any }>;
  } | null>(null);
  const [apiModels, setApiModels] = useState<{ id: string; label: string; reasoning?: any }[] | null>(null);
  const [apiModelsError, setApiModelsError] = useState("");
  const [apiModelsBusy, setApiModelsBusy] = useState(false);
  const [apiModelsQuery, setApiModelsQuery] = useState("");
  const [pasted, setPasted] = useState<{ name: string; size: number; mtime: number; dataURL?: string }[] | null>(null);
  const [appSnapState, setAppSnapState] = useState<AppSnapState | null>(null);
  const [appSnapBusy, setAppSnapBusy] = useState(false);
  const s = p.settings;
  const customModels = s.customModels ?? [];
  const modelEfforts = s.modelEfforts ?? {};
  const set = (patch: Partial<S>) => p.onChange({ ...s, ...patch });

  function providerModels(provider: "claude" | "codex") {
    if (provider === "claude") return CLAUDE_MODELS;
    const row = provs?.find((pr) => pr.id === provider);
    const ids = row?.models?.length ? row.models : [s.defaultModel[provider]].filter(Boolean);
    const labels = MODEL_LABELS[provider] ?? {};
    return [
      { id: "", labelKey: "common.default-cli" },
      ...ids.map((id) => ({ id, label: labels[id] ?? id })),
    ];
  }

  useEffect(() => {
    const mq = window.matchMedia?.("(max-width: 880px)");
    if (!mq) return;
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // Échap ferme la page (convention app) — jamais pendant une saisie
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      p.onClose();
    };
    // Capture avant le handler global d'App qui utilise Échap pour interrompre
    // un tour actif. Fermer Settings ne doit jamais envoyer les deux actions.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [p.onClose]);

  useEffect(() => {
    if (!p.ws || p.ws.readyState !== 1) return;
    const onMsg = (e: MessageEvent) => {
      const m = JSON.parse(e.data);
      if (m.type === "status") setStatus(m);
      if (m.type === "providerStatus") setProvs(m.providers);
      if (m.type === "setupStatus") setSetup(m.status ?? null);
      if (m.type === "apiProviders") setApiProvs(m.providers ?? []);
      if (m.type === "apiModels") {
        setApiModelsBusy(false);
        setApiModels(m.models ?? null);
        setApiModelsError(m.error ?? "");
      }
      if (m.type === "pastedCleared") {
        p.ws!.send(JSON.stringify({ type: "status" }));
        p.ws!.send(JSON.stringify({ type: "listPasted" }));
      }
      if (m.type === "pastedList") setPasted(m.files ?? []);
      if (m.type === "retitleAllDone") {
        setRetitleStatus(m.running ? t("settings.retitle-running") : t("settings.retitle-done", { count: m.renamed }));
      }
    };
    p.ws.addEventListener("message", onMsg);
    p.ws.send(JSON.stringify({ type: "status" }));
    p.ws.send(JSON.stringify({ type: "providerStatus" }));
    p.ws.send(JSON.stringify({ type: "setupStatus" }));
    p.ws.send(JSON.stringify({ type: "apiProviders" }));
    p.ws.send(JSON.stringify({ type: "listPasted" }));
    return () => p.ws?.removeEventListener("message", onMsg);
  }, [p.ws]);

  useEffect(() => {
    let disposed = false;
    let unlisten = () => {};
    void getAppSnapState()
      .then((state) => { if (!disposed) setAppSnapState(state); })
      .catch((error) => { if (!disposed) void showError(String(error)); });
    void onAppSnapState((state) => { if (!disposed) setAppSnapState(state); })
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      });
    return () => {
      disposed = true;
      unlisten();
    };
  }, []);

  const themeMatches = THEME_PRESETS.filter((th) =>
    th.name.toLowerCase().includes(themeQuery.toLowerCase()));
  const currentTheme = themeMatches.find((th) => th.id === s.themePreset);
  const otherThemes = themeMatches.filter((th) => th.id !== s.themePreset);

  function refreshSetup() {
    if (p.ws?.readyState === 1) p.ws.send(JSON.stringify({ type: "setupStatus" }));
  }

  async function toggleAppSnap(enabled: boolean) {
    setAppSnapBusy(true);
    try {
      if (enabled) setAppSnapState(await requestAppSnapPermissions());
      const state = await setAppSnapEnabled(enabled);
      setAppSnapState(state);
      set({ enableAppSnap: enabled });
    } catch (error) {
      void showError(t("appsnap.action-failed", { error: String(error) }));
    } finally {
      setAppSnapBusy(false);
    }
  }

  async function recheckAppSnap() {
    setAppSnapBusy(true);
    try {
      let state = await getAppSnapState();
      if (s.enableAppSnap) state = await setAppSnapEnabled(true);
      setAppSnapState(state);
    } catch (error) {
      void showError(t("appsnap.action-failed", { error: String(error) }));
    } finally {
      setAppSnapBusy(false);
    }
  }

  function permissionBadge(permission: AppSnapPermission) {
    return (
      <span className={`set-badge ${permission === "granted" ? "ok" : permission === "denied" ? "ko" : "warn"}`}>
        {permission === "granted"
          ? t("appsnap.permission-granted")
          : permission === "denied"
            ? t("appsnap.permission-required")
            : t("appsnap.permission-unknown")}
      </span>
    );
  }

  function authLabel(auth: string) {
    const labels: Record<string, string> = {
      ready: t("settings.setup-auth-ready"),
      missing_key: t("settings.setup-auth-key"),
      login_needed: t("settings.setup-auth-login"),
      login_or_models_needed: t("settings.setup-auth-login-models"),
      check_provider_config: t("settings.setup-auth-provider-config"),
      not_installed: t("settings.setup-auth-not-installed"),
      unknown: t("settings.setup-auth-unknown"),
      // états de la sonde Kimi (plan 046 étape 10)
      version_unsupported: t("settings.setup-auth-version-unsupported"),
      model_config_needed: t("settings.setup-auth-model-config"),
      protocol_error: t("settings.setup-auth-protocol-error"),
    };
    return labels[auth] ?? auth;
  }

  function authClass(auth: string) {
    if (auth === "ready") return "ok";
    if (
      auth === "check_provider_config" ||
      auth === "unknown" ||
      auth === "model_config_needed" ||
      auth === "version_unsupported"
    )
      return "warn";
    return "ko";
  }

  function themeRow(th: (typeof THEME_PRESETS)[number]) {
    const on = s.themePreset === th.id;
    return (
      <Button key={th.id} type="button" variant="ghost"
        className={`theme-row ${on ? "on" : ""}`}
        aria-pressed={on}
        onClick={() => set({ themePreset: th.id })}>
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
    <div className={`settings-page ${narrow ? "narrow" : ""}`}>
      {narrow ? (
        <div className="set-nav-compact">
          <Button variant="ghost" className="set-back" onClick={p.onClose}>
            {t("settings.back")}
          </Button>
          <Select
            compact
            title={t("settings.section")}
            value={section}
            onChange={setSection}
            options={SECTIONS.map((sec) => ({ value: sec.id, label: t(sec.labelKey as any) }))}
          />
        </div>
      ) : (
      <div className="set-nav">
        <Button variant="ghost" className="set-back" onClick={p.onClose}>
          {t("settings.back")}
        </Button>
        {SECTIONS.map((sec) => (
          <Button
            variant="ghost"
            key={sec.id}
            className={`set-nav-item ${section === sec.id ? "on" : ""}`}
            aria-current={section === sec.id ? "true" : undefined}
            onClick={() => setSection(sec.id)}
          >
            {t(sec.labelKey as any)}
          </Button>
        ))}
        <span className="flex" />
        <Button variant="ghost" className="set-restore" onClick={async () => {
          const ok = await tauriConfirm(t("settings.restore-confirm"), { kind: "warning" }).catch(() => false);
          if (ok) p.onChange({ ...DEFAULT_SETTINGS });
        }}>
          {t("action.restore-defaults")}
        </Button>
      </div>
      )}
      <div className="set-body">
        {section === "general" && (
          <>
            <h1>{t("settings.general")}</h1>
            <p className="set-sub">{t("settings.general-sub")}</p>
            <Group>
              <Row title={t("language.label")}>
                <Select
                  title={t("language.label")}
                  value={s.language}
                  onChange={(value) => {
                    const language = value as S["language"];
                    setLanguage(language);
                    set({ language });
                  }}
                  options={[
                    { value: "fr", label: t("language.fr") },
                    { value: "en", label: t("language.en") },
                    { value: "system", label: t("language.system") },
                  ]}
                />
              </Row>
            </Group>
            <Group label={t("settings.group.agents")}>
              <Row title={t("settings.default-provider")} desc={t("settings.default-provider-desc")}>
                <Select
                  title={t("settings.default-provider")}
                  value={s.defaultProvider}
                  onChange={(value) => set({ defaultProvider: value as S["defaultProvider"] })}
                  options={[
                    { value: "claude", label: "Claude" },
                    { value: "codex", label: "Codex" },
                  ]}
                />
              </Row>
              <Row title={t("settings.default-claude-model")}>
                <Select
                  title={t("settings.default-claude-model")}
                  value={s.defaultModel.claude}
                  onChange={(value) => set({ defaultModel: { ...s.defaultModel, claude: value } })}
                  options={CLAUDE_MODELS.map((m) => ({ value: m.id, label: modelLabel(m) }))}
                />
              </Row>
              <Row title={t("settings.default-codex-model")}>
                <Select
                  title={t("settings.default-codex-model")}
                  value={s.defaultModel.codex}
                  onChange={(value) => set({ defaultModel: { ...s.defaultModel, codex: value } })}
                  options={providerModels("codex").map((m) => ({ value: m.id, label: modelLabel(m) }))}
                />
              </Row>
              <Row title={t("settings.default-claude-effort")}>
                <Select
                  title={t("settings.default-claude-effort")}
                  value={s.defaultEffort.claude}
                  onChange={(value) => set({ defaultEffort: { ...s.defaultEffort, claude: value } })}
                  options={CLAUDE_EFFORTS.map((l) => ({ value: l, label: l === "" ? "auto" : l }))}
                />
              </Row>
              <Row title={t("settings.default-codex-effort")}>
                <Select
                  title={t("settings.default-codex-effort")}
                  value={s.defaultEffort.codex}
                  onChange={(value) => set({ defaultEffort: { ...s.defaultEffort, codex: value } })}
                  options={CODEX_EFFORTS.map((l) => ({ value: l, label: l === "" ? "auto" : l }))}
                />
              </Row>
            </Group>
            <Group label={t("settings.group.tools")}>
              <Row title={t("settings.permission-default")} desc={t("settings.permission-default-desc")}>
                <Select
                  title={t("settings.permission-default")}
                  value={s.defaultPermissionMode}
                  onChange={(value) => set({ defaultPermissionMode: value })}
                  options={[
                    { value: "bypassPermissions", label: t("permission.full") },
                    { value: "acceptEdits", label: t("permission.accept-edits") },
                    { value: "default", label: t("action.ask-default") },
                    { value: "plan", label: t("permission.plan") },
                  ]}
                />
              </Row>
              <Row title={t("settings.web-search")} desc={t("settings.web-search-desc")}>
                <Toggle label={t("settings.web-search")} checked={s.webSearch} onChange={(v) => set({ webSearch: v })} />
              </Row>
              <Row title={t("settings.additional-dirs")} desc={t("settings.additional-dirs-desc")}>
                <Textarea className="set-text" rows={3} value={s.additionalDirectories}
                  onChange={(e) => set({ additionalDirectories: e.target.value })} />
              </Row>
            </Group>
            <Group label={t("settings.group.conversations")}>
              <Row title={t("settings.thread-order")} desc={t("settings.thread-order-desc")}>
                <Select
                  title={t("settings.thread-order")}
                  value={s.threadOrder}
                  onChange={(value) => set({ threadOrder: value as S["threadOrder"] })}
                  options={[
                    { value: "recent", label: t("settings.thread-order-recent") },
                    { value: "manual", label: t("settings.thread-order-manual") },
                  ]}
                />
              </Row>
              <Row title={t("settings.chat-titles")} desc={t("settings.chat-titles-desc")}>
                {retitleStatus && <InlineNotice tone="info" className="set-notice">{retitleStatus}</InlineNotice>}
                <Button
                  className="set-btn"
                  disabled={p.ws?.readyState !== 1}
                  onClick={() => {
                    setRetitleStatus(t("settings.running"));
                    p.ws?.send(JSON.stringify({ type: "retitleAll" }));
                  }}
                >
                  {t("action.generate-chat-titles")}
                </Button>
              </Row>
            </Group>
          </>
        )}
        {section === "setup" && (
          <>
            <div className="set-headline">
              <div>
                <h1>{t("settings.setup")}</h1>
                <p className="set-sub">{t("settings.setup-sub")}</p>
              </div>
              <span className="set-headline-actions">
                <Button variant="ghost" className="set-btn quiet" onClick={() => {
                  const details = { generatedAt: new Date().toISOString(), setup, wsConnected: p.ws?.readyState === 1 };
                  navigator.clipboard.writeText(JSON.stringify(details, null, 2));
                }}>{t("settings.copy-details")}</Button>
                <Button variant="ghost" className="set-btn quiet" onClick={refreshSetup}>{t("action.refresh")}</Button>
              </span>
            </div>
            {p.ws?.readyState !== 1 && (
              <InlineNotice tone="warning" className="set-notice">
                {t("settings.sidecar-disconnected-notice")}
              </InlineNotice>
            )}
            {!setup && <p className="set-empty">{t("settings.checking")}</p>}
            {setup && (
              <>
                <Group label={t("settings.setup-runtime")}>
                  <Row title={t("settings.setup-node")}
                    desc={`${setup.runtime.version} — ${setup.runtime.node}`}>
                    <span className={`set-badge ${setup.runtime.bundled ? "ok" : "warn"}`}>
                      {setup.runtime.bundled ? t("settings.setup-bundled") : t("settings.setup-system")}
                    </span>
                  </Row>
                  <Row title={t("settings.setup-sidecar")}
                    desc={`${setup.sidecar.appVersion} · pid ${setup.sidecar.pid} · ${setup.sidecar.dir}`}>
                    <span className={`set-badge ${p.ws?.readyState === 1 ? "ok" : "ko"}`}>
                      {p.ws?.readyState === 1 ? t("settings.connected") : t("settings.disconnected")}
                    </span>
                  </Row>
                </Group>
                <Group label={t("settings.setup-providers")}>
                  {setup.providers.map((pr) => (
                    <Row key={pr.id} title={pr.label}
                      desc={pr.kind === "api"
                        ? `${t("settings.provider-api")} · ${pr.defaultModel ?? ""}`
                        : (pr.binPath || t("settings.path-missing"))}>
                      <span className={`set-badge ${pr.installed ? "ok" : "ko"}`}>
                        {pr.installed ? t("settings.detected") : t("settings.absent")}
                      </span>
                      <span className={`set-badge ${authClass(pr.auth)}`}>
                        {authLabel(pr.auth)}
                      </span>
                      {pr.auth === "login_needed" && pr.loginCommand ? (
                        // ouvre le terminal Atelier avec la commande exacte
                        // annoncée par le harnais (jamais le canal stdio ACP) ;
                        // après le login : Refresh ⇒ authenticate + modèles.
                        <Button
                          variant="secondary"
                          size="s"
                          onClick={() =>
                            window.dispatchEvent(
                              new CustomEvent("atelier-terminal-command", {
                                detail: { command: pr.loginCommand },
                              }),
                            )
                          }
                        >
                          {t("settings.setup-login-terminal")}
                        </Button>
                      ) : null}
                      <span className="setup-model-count">
                        {pr.models} {t("settings.api-models-count")}
                      </span>
                      {pr.version && <span className="setup-version">{pr.version}</span>}
                    </Row>
                  ))}
                </Group>
              </>
            )}
          </>
        )}
        {section === "apparence" && (
          <>
            <h1>{t("settings.appearance")}</h1>
            <p className="set-sub">{t("settings.appearance-sub")}</p>
            <div className="set-group">
              <div className="set-group-label">{t("settings.group.theme")}</div>
              <Input className="theme-search" placeholder={t("settings.search-theme")} value={themeQuery}
                onChange={(e) => setThemeQuery(e.target.value)} />
              <div className="theme-gallery">
                {currentTheme && <div className="theme-current">{themeRow(currentTheme)}</div>}
                {otherThemes.map(themeRow)}
              </div>
            </div>
            <Group>
              <Row title={t("settings.theme")} desc={t("settings.theme-desc")}>
                <SegmentedControl
                  label={t("settings.theme")}
                  value={s.theme}
                  onChange={(v) => set({ theme: v as S["theme"] })}
                  options={[
                    { value: "light", label: t("settings.theme-light") },
                    { value: "dark", label: t("settings.theme-dark") },
                    { value: "system", label: t("settings.theme-system") },
                  ]}
                />
              </Row>
            </Group>
            <Group label={t("settings.group.colors")}>
              <Row title={t("settings.accent")} desc={t("settings.accent-desc")}>
                <ColorField value={s.accentColor} fallback="#e77f3e"
                  onChange={(v) => set({ accentColor: v })} onReset={() => set({ accentColor: "" })} />
              </Row>
              <Row title={t("settings.bg")} desc={t("settings.bg-desc")}>
                <ColorField value={s.bgColor} fallback="#1e2124"
                  onChange={(v) => set({ bgColor: v })} onReset={() => set({ bgColor: "" })} />
              </Row>
              <Row title={t("settings.text")} desc={t("settings.text-desc")}>
                <ColorField value={s.fgColor} fallback="#e8eaed"
                  onChange={(v) => set({ fgColor: v })} onReset={() => set({ fgColor: "" })} />
              </Row>
            </Group>
            <Group label={t("settings.group.typography")}>
              <Row title={t("settings.ui-font")} desc={t("settings.ui-font-desc")}>
                <Input className="set-text" placeholder="Inter" value={s.uiFont}
                  onChange={(e) => set({ uiFont: e.target.value })} />
              </Row>
              <Row title={t("settings.code-font")} desc={t("settings.code-font-desc")}>
                <Input className="set-text" placeholder="JetBrains Mono" value={s.codeFont}
                  onChange={(e) => set({ codeFont: e.target.value })} />
              </Row>
              <Row title={t("settings.base-size")} desc={t("settings.base-size-desc")}>
                <SettingSlider min={12} max={18} step={0.5} value={s.baseFontSize} onChange={(v) => set({ baseFontSize: v })} />
                <span className="set-val">{s.baseFontSize}px</span>
              </Row>
              <Row title={t("settings.smoothing")} desc={t("settings.smoothing-desc")}>
                <Toggle label={t("settings.smoothing")} checked={s.fontSmoothing} onChange={(v) => set({ fontSmoothing: v })} />
              </Row>
            </Group>
            <Group label={t("settings.group.layout")}>
              <Row title={t("settings.density")} desc={t("settings.density-desc")}>
                <SegmentedControl
                  label={t("settings.density")}
                  value={s.density}
                  onChange={(v) => set({ density: v as S["density"] })}
                  options={[
                    { value: "compact", label: t("settings.density-compact") },
                    { value: "comfortable", label: t("settings.density-comfortable") },
                    { value: "spacious", label: t("settings.density-spacious") },
                  ]}
                />
              </Row>
              <Row title={t("settings.chat-text-size")}>
                <SettingSlider min={12} max={19} step={0.5} value={s.chatFontSize} onChange={(v) => set({ chatFontSize: v })} />
                <span className="set-val">{s.chatFontSize}px</span>
              </Row>
              <Row title={t("settings.reading-width")}>
                <SettingSlider min={560} max={1100} step={20} value={s.chatWidth} onChange={(v) => set({ chatWidth: v })} />
                <span className="set-val">{s.chatWidth}px</span>
              </Row>
              <Row title={t("settings.interline")}>
                <SettingSlider min={1.4} max={2.0} step={0.05} value={s.chatLineHeight} onChange={(v) => set({ chatLineHeight: v })} />
                <span className="set-val">{s.chatLineHeight.toFixed(2)}</span>
              </Row>
              <Row title={t("settings.time-format")} desc={t("settings.time-format-desc")}>
                <Select
                  title={t("settings.time-format")}
                  value={s.timeFormat}
                  onChange={(value) => set({ timeFormat: value as S["timeFormat"] })}
                  options={[
                    { value: "system", label: t("language.system") },
                    { value: "24h", label: "24 h" },
                    { value: "12h", label: "12 h (AM/PM)" },
                  ]}
                />
              </Row>
            </Group>
          </>
        )}
        {section === "modeles" && (
          <>
            <h1>{t("settings.models")}</h1>
            <p className="set-sub">{t("settings.models-sub")}</p>
            <Group>
              <Row title={t("settings.slug-add")} desc={t("settings.slug-add-desc")}>
                <Select
                  title={t("settings.slug-add")}
                  value={slugProv}
                  onChange={(value) => setSlugProv(value as "claude" | "codex")}
                  options={[
                    { value: "claude", label: "Claude" },
                    { value: "codex", label: "Codex" },
                  ]}
                />
                <Input className="set-text" placeholder={t("settings.slug-placeholder")} value={slugText}
                  onChange={(e) => setSlugText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && slugText.trim()) {
                      set({ customModels: [...customModels, { provider: slugProv, id: slugText.trim() }] });
                      setSlugText("");
                    }
                  }} />
                <Button className="set-btn" onClick={() => {
                  if (!slugText.trim()) return;
                  set({ customModels: [...customModels, { provider: slugProv, id: slugText.trim() }] });
                  setSlugText("");
                }}><PlusIcon /> {t("action.add")}</Button>
              </Row>
            </Group>
            <Group label={t("settings.model-effort-sub")}>
              {([
                ...CLAUDE_MODELS.filter((m) => m.id).map((m) => ({ provider: "claude" as const, ...m })),
                ...providerModels("codex").filter((m) => m.id).map((m) => ({ provider: "codex" as const, ...m })),
                ...customModels.map((m) => ({ provider: m.provider, id: m.id, label: m.id })),
              ]).map((m) => {
                const key = m.provider + ":" + m.id;
                const efforts = m.provider === "claude" ? CLAUDE_EFFORTS : CODEX_EFFORTS;
                return (
                  <Row key={key} title={modelLabel(m)} desc={m.provider === "claude" ? "Claude" : "Codex"}>
                    <Select
                      title={modelLabel(m)}
                      value={modelEfforts[key] ?? ""}
                      onChange={(value) => {
                        const next = { ...modelEfforts };
                        if (value) next[key] = value;
                        else delete next[key];
                        set({ modelEfforts: next });
                      }}
                      options={efforts.map((l) => ({ value: l, label: l === "" ? t("common.provider-default") : l }))}
                    />
                  </Row>
                );
              })}
            </Group>
            <div className="set-group">
              <div className="set-group-label">{t("settings.slug-saved")}</div>
              {customModels.length > 0 ? (
                <div className="set-card">
                  {customModels.map((m, i) => (
                    <Row key={m.provider + ":" + m.id + ":" + i} title={m.id} desc={m.provider === "claude" ? "Claude" : "Codex"}>
                      <Button variant="ghost" className="set-btn quiet" onClick={() =>
                        set({ customModels: customModels.filter((_, j) => j !== i) })
                      }>{t("action.remove")}</Button>
                    </Row>
                  ))}
                </div>
              ) : (
                <p className="set-empty">{t("settings.no-custom-models")}</p>
              )}
            </div>
          </>
        )}
        {section === "review" && (
          <>
            <h1>{t("settings.review")}</h1>
            <p className="set-sub">{t("settings.review-sub")}</p>
            <Group>
              <Row title={t("settings.autoreview-enable")} desc={t("settings.autoreview-enable-desc")}>
                <Toggle label={t("settings.autoreview-enable")} checked={s.autoReview.enabled}
                  onChange={(v) => set({ autoReview: { ...s.autoReview, enabled: v } })} />
              </Row>
              <Row title={t("settings.autoreview-agent")} desc={t("settings.autoreview-agent-desc")}>
                <Select
                  title={t("settings.autoreview-agent")}
                  value={`${s.autoReview.provider}:${s.autoReview.model}:${s.autoReview.effort}`}
                  onChange={(value) => {
                    const [provider, model, effort] = value.split(":");
                    set({ autoReview: { ...s.autoReview, provider: provider as "claude" | "codex", model, effort } });
                  }}
                  options={[
                    { value: "codex:gpt-5.5:high", label: "GPT-5.5 · high" },
                    { value: "codex:gpt-5.5:medium", label: "GPT-5.5 · medium" },
                    { value: "claude:claude-opus-4-8:high", label: "Opus 4.8 · high" },
                    { value: "claude:claude-sonnet-5:high", label: "Sonnet 5 · high" },
                  ]}
                />
              </Row>
              <Row title={t("settings.autoreview-trigger")}>
                <Select
                  title={t("settings.autoreview-trigger")}
                  value={s.autoReview.trigger}
                  onChange={(value) => set({ autoReview: { ...s.autoReview, trigger: value as "always" | "files-changed" | "manual" } })}
                  options={[
                    { value: "files-changed", label: t("settings.autoreview-files") },
                    { value: "always", label: t("settings.autoreview-always") },
                    { value: "manual", label: t("settings.autoreview-manual") },
                  ]}
                />
              </Row>
            </Group>
          </>
        )}
        {section === "appsnap" && (
          <>
            <h1>{t("settings.appsnap")}</h1>
            <p className="set-sub">{t("settings.appsnap-sub")}</p>
            <div className="appsnap-intro" role="note">
              <div className="appsnap-intro-icon" aria-hidden="true">
                <ScanLineIcon />
              </div>
              <div>
                <div className="appsnap-intro-title">{t("appsnap.card-title")}</div>
                <p>
                  {t("appsnap.card-prefix")}{" "}
                  <kbd className="appsnap-key">⌥ Option</kbd>{" "}
                  {t("appsnap.card-suffix")}
                </p>
              </div>
            </div>
            <Group label={t("appsnap.group.capture")}>
              <Row title={t("appsnap.enable")} desc={t("appsnap.enable-desc")}>
                <Toggle
                  label={t("appsnap.enable")}
                  checked={s.enableAppSnap}
                  onChange={(enabled) => { void toggleAppSnap(enabled); }}
                />
              </Row>
              <Row title={t("appsnap.shortcut")} desc={t("appsnap.shortcut-desc")}>
                <span className="appsnap-shortcut" aria-label={t("appsnap.shortcut-value-label")}>
                  <kbd>⌥ {t("appsnap.left")}</kbd>
                  <span>+</span>
                  <kbd>⌥ {t("appsnap.right")}</kbd>
                </span>
              </Row>
              <Row title={t("appsnap.destination")} desc={t("appsnap.destination-desc")}>
                <span className="set-badge ok">{t("appsnap.destination-auto")}</span>
              </Row>
              <Row title={t("appsnap.sound")} desc={t("appsnap.sound-desc")}>
                <Toggle
                  label={t("appsnap.sound")}
                  checked={s.appSnapPlaySound}
                  onChange={(appSnapPlaySound) => set({ appSnapPlaySound })}
                />
              </Row>
            </Group>
            <Group label={t("appsnap.group.permissions")}>
              <Row title={t("appsnap.input-monitoring")} desc={t("appsnap.input-monitoring-desc")}>
                {permissionBadge(appSnapState?.inputMonitoringPermission ?? "unknown")}
              </Row>
              <Row title={t("appsnap.screen-recording")} desc={t("appsnap.screen-recording-desc")}>
                {permissionBadge(appSnapState?.screenRecordingPermission ?? "unknown")}
              </Row>
              <Row title={t("appsnap.accessibility")} desc={t("appsnap.accessibility-desc")}>
                {permissionBadge(appSnapState?.accessibilityPermission ?? "unknown")}
              </Row>
              <Row
                title={t("appsnap.status")}
                desc={appSnapState?.message || t(`appsnap.status-${appSnapState?.status ?? "disabled"}` as any)}
              >
                <Button
                  variant="ghost"
                  className="set-btn quiet"
                  disabled={appSnapBusy}
                  onClick={() => { void recheckAppSnap(); }}
                >
                  {appSnapBusy ? t("settings.checking") : t("appsnap.recheck")}
                </Button>
              </Row>
            </Group>
            <p className="appsnap-local-note">{t("appsnap.local-note")}</p>
          </>
        )}
        {section === "atelier" && (
          <>
            <h1>{t("settings.atelier")}</h1>
            <p className="set-sub">{t("settings.atelier-sub")}</p>
            <Group>
              <Row title={t("settings.gallery-folder")} desc={t("settings.gallery-folder-desc")}>
                <Input className="set-text" value={s.galleryPath}
                  onChange={(e) => set({ galleryPath: e.target.value })} />
              </Row>
              <Row title={t("settings.auto-refresh")} desc={t("settings.auto-refresh-desc")}>
                <Toggle label={t("settings.auto-refresh")} checked={s.autoRefreshAtelier} onChange={(v) => set({ autoRefreshAtelier: v })} />
              </Row>
            </Group>
            <Group label={t("settings.group.gallery-exts")}>
              <Row title={t("settings.gallery-exts-default")} desc={t("settings.gallery-exts-desc")}>
                <Input className="set-text" placeholder="png, svg, pdf, html, md…" value={s.galleryExts}
                  onChange={(e) => set({ galleryExts: e.target.value })} />
              </Row>
              {(p.projects ?? []).map((root) => (
                <Row key={root} title={root.split("/").pop() ?? root} desc={root}>
                  <Input className="set-text" placeholder={s.galleryExts || t("settings.gallery-exts-inherit")}
                    value={(s.galleryExtsByProject ?? {})[root] ?? ""}
                    onChange={(e) => {
                      const next = { ...(s.galleryExtsByProject ?? {}) };
                      if (e.target.value.trim()) next[root] = e.target.value;
                      else delete next[root];
                      set({ galleryExtsByProject: next });
                    }} />
                </Row>
              ))}
            </Group>
          </>
        )}
        {section === "providers" && (
          <>
            <h1>{t("settings.providers")}</h1>
            <p className="set-sub">{t("settings.providers-sub")}</p>
            {provs === null && <p className="set-empty">{t("settings.checking")}</p>}
            {provs && (() => {
              // ordre du picker : providerOrder d'abord, puis le reste dans l'ordre du catalogue
              const order = s.providerOrder ?? [];
              const hidden = new Set(s.hiddenProviders ?? []);
              const sorted = [...provs].sort((a, b) => {
                const ra = order.indexOf(a.id), rb = order.indexOf(b.id);
                return (ra === -1 ? order.length + provs.findIndex((x) => x.id === a.id) : ra)
                  - (rb === -1 ? order.length + provs.findIndex((x) => x.id === b.id) : rb);
              });
              const move = (id: string, dir: -1 | 1) => {
                const ids = sorted.map((x) => x.id);
                const i = ids.indexOf(id);
                const j = i + dir;
                if (j < 0 || j >= ids.length) return;
                [ids[i], ids[j]] = [ids[j], ids[i]];
                set({ providerOrder: ids });
              };
              return (
                <Group>
                  {sorted.map((pr, i) => (
                    <Row key={pr.id} title={pr.label}
                      desc={pr.ok
                        ? (pr.kind === "api" ? t("settings.provider-api") : pr.version ?? "")
                        : (pr.kind === "api" ? t("settings.key-missing") : t("settings.path-missing"))}>
                      <span className={`set-badge ${pr.ok ? "ok" : "ko"}`}>
                        {pr.ok ? t("settings.detected") : t("settings.absent")}
                      </span>
                      <Button variant="ghost" className="set-btn quiet" disabled={i === 0}
                        title={t("settings.provider-up")} onClick={() => move(pr.id, -1)}>↑</Button>
                      <Button variant="ghost" className="set-btn quiet" disabled={i === sorted.length - 1}
                        title={t("settings.provider-down")} onClick={() => move(pr.id, 1)}>↓</Button>
                      <Toggle label={pr.label} checked={!hidden.has(pr.id)} onChange={(v) => {
                        const next = new Set(s.hiddenProviders ?? []);
                        if (v) next.delete(pr.id); else next.add(pr.id);
                        set({ hiddenProviders: [...next] });
                      }} />
                    </Row>
                  ))}
                </Group>
              );
            })()}
            <p className="set-sub">{t("settings.providers-visibility-sub")}</p>
            <Group label={t("settings.api-providers")}>
              {apiProvs.map((ap) => (
                <Row key={ap.id} title={ap.label}
                  desc={`${ap.baseURL} · ${ap.protocol} · ${ap.models.length} ${t("settings.api-models-count")}${ap.keySet ? "" : " · " + t("settings.key-missing")}`}>
                  <Button variant="ghost" className="set-btn quiet" onClick={() => setApiForm({
                    id: ap.id, label: ap.label, baseURL: ap.baseURL, protocol: ap.protocol,
                    apiKey: "", models: ap.models.join(", "),
                    modelMetadata: Object.fromEntries(Object.entries(ap.modelReasoning ?? {})
                      .map(([modelId, reasoning]) => [modelId, { reasoning }])),
                  })}>{t("action.edit")}</Button>
                  <Button variant="ghost" className="set-btn quiet" onClick={() =>
                    void (async () => {
                      const ok = await tauriConfirm(t("settings.api-delete-confirm", { id: ap.label || ap.id }), { kind: "warning" }).catch(() => false);
                      if (ok && p.ws?.readyState === 1) p.ws.send(JSON.stringify({ type: "deleteApiProvider", id: ap.id }));
                    })()
                  }>{t("action.delete")}</Button>
                </Row>
              ))}
              {!apiForm && (
                <Row title={t("settings.api-add")} desc={t("settings.api-add-desc")}>
                  <Button className="set-btn" onClick={() => setApiForm({
                    id: "", label: "", baseURL: "", protocol: "openai", apiKey: "", models: "", modelMetadata: {},
                  })}>{t("action.add")}</Button>
                </Row>
              )}
              {apiForm && (
                <div className="set-row" style={{ display: "block" }}>
                  <FieldGroup className="tw:gap-2">
                    <Field>
                      <FieldLabel className="tw:sr-only">{t("settings.api-label-ph")}</FieldLabel>
                      <Input className="set-text" placeholder={t("settings.api-label-ph")} value={apiForm.label}
                        onChange={(e) => setApiForm({ ...apiForm, label: e.target.value, id: apiForm.id || e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })} />
                    </Field>
                    <Field>
                      <FieldLabel className="tw:sr-only">Base URL</FieldLabel>
                      <Input className="set-text" placeholder="https://openrouter.ai/api/v1" value={apiForm.baseURL}
                        onChange={(e) => setApiForm({ ...apiForm, baseURL: e.target.value })} />
                    </Field>
                    <Field>
                      <FieldLabel className="tw:sr-only">Protocol</FieldLabel>
                      <ToggleGroup
                        aria-label="Protocol"
                        value={[apiForm.protocol]}
                        onValueChange={(next) => {
                          const protocol = next[0];
                          if (protocol === "openai" || protocol === "anthropic") setApiForm({ ...apiForm, protocol });
                        }}
                        className="api-protocol"
                      >
                        <ToggleGroupItem value="openai" aria-label="OpenAI" className="tw:px-2.5">
                          OpenAI (/chat/completions)
                        </ToggleGroupItem>
                        <ToggleGroupItem value="anthropic" aria-label="Anthropic" className="tw:px-2.5">
                          Anthropic (/v1/messages)
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </Field>
                    <Field>
                      <FieldLabel className="tw:sr-only">{t("settings.api-key-ph")}</FieldLabel>
                      <Input className="set-text" type="password" placeholder={t("settings.api-key-ph")} value={apiForm.apiKey}
                        onChange={(e) => setApiForm({ ...apiForm, apiKey: e.target.value })} />
                    </Field>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Field className="tw:min-w-0 tw:flex-1">
                        <FieldLabel className="tw:sr-only">{t("settings.api-models-ph")}</FieldLabel>
                        <Input className="set-text" style={{ flex: 1 }} placeholder={t("settings.api-models-ph")} value={apiForm.models}
                          onChange={(e) => setApiForm({ ...apiForm, models: e.target.value })} />
                      </Field>
                      <Button variant="ghost" className="set-btn quiet" disabled={apiModelsBusy} onClick={() => {
                        if (p.ws?.readyState !== 1) return;
                        setApiModelsBusy(true); setApiModels(null); setApiModelsError(""); setApiModelsQuery("");
                        p.ws.send(JSON.stringify({ type: "listApiModels", provider: {
                          id: apiForm.id, baseURL: apiForm.baseURL, protocol: apiForm.protocol,
                          ...(apiForm.apiKey ? { apiKey: apiForm.apiKey } : {}),
                        } }));
                      }}>{apiModelsBusy ? "…" : t("settings.api-detect")}</Button>
                    </div>
                    {apiModelsError && <InlineNotice tone="error" className="set-notice">{apiModelsError}</InlineNotice>}
                    {apiModels && (() => {
                      const selected = new Set(apiForm.models.split(",").map((m) => m.trim()).filter(Boolean));
                      const q = apiModelsQuery.toLowerCase();
                      const shown = apiModels.filter((m) => !q || m.id.toLowerCase().includes(q)).slice(0, 200);
                      const toggle = (id: string) => {
                        const next = new Set(selected);
                        if (next.has(id)) next.delete(id); else next.add(id);
                        const model = apiModels.find((m) => m.id === id);
                        const modelMetadata = { ...(apiForm.modelMetadata ?? {}) };
                        if (model?.reasoning) modelMetadata[id] = { label: model.label, reasoning: model.reasoning };
                        setApiForm({ ...apiForm, models: [...next].join(", "), modelMetadata });
                      };
                      return (
                        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 8 }}>
                          <Field>
                            <FieldLabel className="tw:sr-only">{t("settings.api-filter-ph")}</FieldLabel>
                            <Input className="set-text" placeholder={t("settings.api-filter-ph")} value={apiModelsQuery}
                              onChange={(e) => setApiModelsQuery(e.target.value)} />
                          </Field>
                          <div style={{ maxHeight: 220, overflowY: "auto", marginTop: 6 }}>
                            {shown.map((m) => (
                              <label key={m.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "3px 4px", cursor: "pointer" }}>
                                <Checkbox
                                  checked={selected.has(m.id)}
                                  aria-label={m.label || m.id}
                                  onCheckedChange={() => toggle(m.id)}
                                >
                                  <CheckboxIndicator><CheckIcon className="tw:size-3" /></CheckboxIndicator>
                                </Checkbox>
                                <span style={{ fontSize: "var(--fs-m)" }}>{m.id}</span>
                                {m.reasoning && <span className="set-badge ok">reasoning</span>}
                              </label>
                            ))}
                            {shown.length === 0 && <p className="set-empty">{t("settings.api-no-match")}</p>}
                          </div>
                          <p className="set-sub" style={{ margin: "6px 0 0" }}>
                            {t("settings.api-detect-count", { total: apiModels.length, sel: selected.size })}
                          </p>
                        </div>
                      );
                    })()}
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <Button variant="ghost" className="set-btn quiet" onClick={() => setApiForm(null)}>{t("action.cancel")}</Button>
                      <Button className="set-btn" onClick={() => {
                        if (p.ws?.readyState !== 1) return;
                        p.ws.send(JSON.stringify({ type: "saveApiProvider", provider: apiForm }));
                        setApiForm(null);
                      }}>{t("action.save")}</Button>
                    </div>
                  </FieldGroup>
                </div>
              )}
            </Group>
          </>
        )}
        {section === "avance" && (
          <>
            <h1>{t("settings.advanced")}</h1>
            <p className="set-sub">{t("settings.advanced-sub")}</p>
            <Group>
              <Row title={t("settings.sidecar")} desc={status ? t("settings.sidecar-desc", { port: status.port }) : "…"}>
                <span className={`set-badge ${p.ws?.readyState === 1 ? "ok" : "ko"}`}>
                  {p.ws?.readyState === 1 ? t("settings.connected") : t("settings.disconnected")}
                </span>
              </Row>
              <Row title={t("settings.pasted-images")} desc={status ? t("settings.pasted-images-desc", { count: status.pastedCount, dir: status.pasteDir }) : "…"}>
                <Button variant="ghost" className="set-btn quiet"
                  onClick={async () => {
                    const ok = await tauriConfirm(t("settings.clear-pasted-confirm"), { kind: "warning" }).catch(() => false);
                    if (ok && p.ws?.readyState === 1) p.ws.send(JSON.stringify({ type: "clearPasted" }));
                  }}>
                  {t("action.clear")}
                </Button>
              </Row>
              {pasted && pasted.length > 0 && (
                <div className="pasted-grid">
                  {pasted.map((f) => (
                    <figure key={f.name} className="pasted-thumb" title={`${f.name} — ${(f.size / 1024).toFixed(0)} KB`}>
                      {f.dataURL ? (
                        <img src={f.dataURL} alt={f.name} loading="lazy" />
                      ) : (
                        <span className="pasted-ext">{f.name.split(".").pop()?.toUpperCase()}</span>
                      )}
                      <figcaption>{f.name}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </Group>
            <Group label={t("settings.remote-devices")}>
              <div style={{ padding: 12 }}>
                <RemoteDevicesPanel />
              </div>
            </Group>
          </>
        )}
      </div>
    </div>
  );
}
