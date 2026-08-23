// Section Modèles (lot 1) : ex-« setup » + ex-« providers » + ex-« modeles »
// fusionnées. Migration verbatim depuis Settings.tsx:595-672 (setup),
// :790-862 (modeles), :1006-1229 (providers) — trois pages entières
// deviennent une, dans l'ordre setup → providers → modeles. Le tableau
// dense de modèles, les défauts sur place et les favoris généralisés sont
// hors périmètre (lot 3) ; ici on regroupe seulement, sous un repli
// « Avancé » pour les deux blocs les moins consultés (fournisseurs API,
// slugs enregistrés — déjà les derniers de leur section d'origine).
import { useEffect, useState } from "react";
import { confirm as tauriConfirm } from "@tauri-apps/plugin-dialog";
import { Advanced, Group, Row, Toggle } from "../primitives";
import type { ApiProviderRow, ProviderCatalogRow, SectionProps } from "../shared";
import type { Settings } from "../../../lib/settings";
import { t } from "../../../lib/i18n";
import { modelDisplayLabel } from "../../../lib/modelCatalog";
import { PlusIcon, StarIcon } from "../../icons";
import { Select } from "../../Select";
import { Button, InlineNotice } from "../../ui";
import { Checkbox, CheckboxIndicator } from "../../shadcn/checkbox";
import { Field, FieldGroup, FieldLabel } from "../../shadcn/field";
import { Input } from "../../shadcn/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "../../shadcn/input-group";
import { ScrollArea } from "../../shadcn/scroll-area";
import { Toggle as ShadcnToggle } from "../../shadcn/toggle";
import { ToggleGroup, ToggleGroupItem } from "../../shadcn/toggle-group";
import { CheckIcon } from "lucide-react";
import { CLAUDE_MODELS, modelLabel, providerModels } from "../models";

// Paliers d'effort — pas dupliqués au sens du bug signalé (seul le
// catalogue de modèles désalignait General.tsx et Models.tsx), donc pas
// déplacés dans models.ts.
const CLAUDE_EFFORTS = ["", "low", "medium", "high", "xhigh", "max"];
const CODEX_EFFORTS = ["", "low", "medium", "high", "xhigh"];

// Copié tel quel de Settings.tsx:85-109 — seul consommateur restant.
function normalizeApiProviderRows(value: unknown): ApiProviderRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    const models = Array.isArray(row.models)
      ? row.models.filter((model): model is string => typeof model === "string" && Boolean(model.trim()))
      : [];
    const baseURL = typeof row.baseURL === "string" ? row.baseURL : "";
    if (!baseURL || !models.length) return [];
    return [{
      id: String(row.id ?? ""),
      label: String(row.label ?? row.id ?? ""),
      baseURL,
      protocol: row.protocol === "anthropic" ? "anthropic" as const : "openai" as const,
      models,
      defaultModel: typeof row.defaultModel === "string" ? row.defaultModel : models[0],
      keySet: Boolean(row.keySet ?? row.hasApiKey),
      apiKeyEnv: typeof row.apiKeyEnv === "string" ? row.apiKeyEnv : null,
      modelReasoning: row.modelReasoning && typeof row.modelReasoning === "object"
        ? row.modelReasoning as Record<string, unknown>
        : {},
    }];
  });
}

// Types locaux à la section setup (Settings.tsx:111-130) — seul consommateur
// restant du statut d'installation.
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

export default function Models(p: SectionProps) {
  const save = (patch: Partial<Settings>) => { p.set(patch); p.onSaved(); };
  const s = p.s;
  const customModels = s.customModels ?? [];
  const modelEfforts = s.modelEfforts ?? {};
  const favoriteModels = s.favoriteModels ?? {};

  // État local déménagé de Settings.tsx : setup (ex-« setup »), provs +
  // opencode + apiProvs/apiForm/apiModels* (ex-« providers »), slug*
  // (ex-« modeles »).
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [provs, setProvs] = useState<ProviderCatalogRow[] | null>(null);
  const [apiProvs, setApiProvs] = useState<ApiProviderRow[]>([]);
  const [apiForm, setApiForm] = useState<{
    id: string; label: string; baseURL: string; protocol: "openai" | "anthropic";
    apiKey: string; models: string; modelMetadata?: Record<string, { label?: string; reasoning?: any }>;
  } | null>(null);
  const [apiModels, setApiModels] = useState<{ id: string; label: string; reasoning?: any }[] | null>(null);
  const [apiModelsError, setApiModelsError] = useState("");
  const [apiModelsBusy, setApiModelsBusy] = useState(false);
  const [apiModelsQuery, setApiModelsQuery] = useState("");
  const [openCodeModelQuery, setOpenCodeModelQuery] = useState("");
  const [slugProv, setSlugProv] = useState<"claude" | "codex">("codex");
  const [slugText, setSlugText] = useState("");

  function toggleFavoriteModel(provider: string, model: string) {
    const current = favoriteModels[provider] ?? [];
    const next = current.includes(model)
      ? current.filter((id) => id !== model)
      : [...current, model];
    save({ favoriteModels: { ...favoriteModels, [provider]: next } });
  }

  function refreshSetup() {
    if (p.ws?.readyState === 1) p.ws.send(JSON.stringify({ type: "setupStatus" }));
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

  // Abonnement WebSocket : cette section n'écoute que ses propres types de
  // message (providerStatus, setupStatus, apiProviders, listApiModels).
  // providerStatus est aussi écouté par General.tsx — sans effet de bord,
  // chaque section ne fait que dériver son propre état local en lecture
  // seule. status/pastedCleared/pastedList/retitleAllDone appartiennent à
  // General.tsx, pas ici.
  useEffect(() => {
    const ws = p.ws;
    if (!ws || ws.readyState !== 1) return;
    const onMessage = (event: MessageEvent) => {
      const m = JSON.parse(event.data);
      if (m.type === "providerStatus") {
        const providers = Array.isArray(m.providers) ? m.providers : [];
        setProvs(providers.map((provider: ProviderCatalogRow) => ({
          ...provider,
          models: Array.isArray(provider?.models) ? provider.models : [],
          efforts: Array.isArray(provider?.efforts) ? provider.efforts : [],
        })));
      }
      if (m.type === "setupStatus") setSetup(m.status ?? null);
      if (m.type === "apiProviders") setApiProvs(normalizeApiProviderRows(m.providers));
      if (m.type === "apiModels") {
        setApiModelsBusy(false);
        setApiModels(m.models ?? null);
        setApiModelsError(m.error ?? "");
      }
    };
    ws.addEventListener("message", onMessage);
    ws.send(JSON.stringify({ type: "providerStatus" }));
    ws.send(JSON.stringify({ type: "setupStatus" }));
    ws.send(JSON.stringify({ type: "apiProviders" }));
    return () => ws.removeEventListener("message", onMessage);
  }, [p.ws]);

  return (
    <>
      <h1>{t("settings.models")}</h1>
      <p className="set-sub">{t("settings.models-sub")}</p>

      {/* Settings.tsx:597-609 — en-tête setup : titre propre + actions
          (copier diagnostic, actualiser). h2 (pas h1) : correction de revue
          — deux h1 coexistaient à l'écran, un défaut introduit par la
          fusion (les trois anciennes sections s'excluaient mutuellement,
          jamais deux h1 simultanés). Voir App.css:1350. */}
      <div className="set-headline">
        <div>
          <h2>{t("settings.setup")}</h2>
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
      {/* Settings.tsx:610-614 */}
      {p.ws?.readyState !== 1 && (
        <InlineNotice tone="warning" className="set-notice">
          {t("settings.sidecar-disconnected-notice")}
        </InlineNotice>
      )}
      {/* Settings.tsx:615 */}
      {!setup && <p className="set-empty">{t("settings.checking")}</p>}
      {/* Settings.tsx:616-670 */}
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
                    className="set-btn"
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

      {/* Settings.tsx:1010-1051 — catalogue provs : ordre du picker +
          visibilité. */}
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
          save({ providerOrder: ids });
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
                  save({ hiddenProviders: [...next] });
                }} />
              </Row>
            ))}
          </Group>
        );
      })()}
      {/* Settings.tsx:1052 */}
      <p className="set-sub">{t("settings.providers-visibility-sub")}</p>

      {/* Settings.tsx:1053-1117 — recherche + favoris OpenCode. */}
      {(() => {
        const provider = provs?.find((row) => row.id === "opencode");
        if (!provider) return null;
        const favorites = favoriteModels.opencode ?? [];
        const query = openCodeModelQuery.trim().toLowerCase();
        const models = (provider.models ?? []).filter((id) => {
          if (!query) return true;
          return id.toLowerCase().includes(query)
            || modelDisplayLabel("opencode", id).toLowerCase().includes(query);
        });
        return (
          <Group label={t("settings.opencode-models")}>
            <Row
              title={t("settings.opencode-models")}
              desc={t("settings.opencode-models-sub", {
                favorites: favorites.length,
                total: provider.models?.length ?? 0,
              })}
            >
              <Field className="set-model-search-field">
                <FieldLabel className="tw:sr-only">{t("settings.model-search")}</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    value={openCodeModelQuery}
                    placeholder={t("settings.model-search")}
                    onChange={(event) => setOpenCodeModelQuery(event.target.value)}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      onClick={() => p.ws?.readyState === 1
                        && p.ws.send(JSON.stringify({ type: "providerStatus" }))}
                    >
                      {t("action.refresh")}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </Field>
            </Row>
            <ScrollArea className="set-model-scroll">
              <div className="set-model-list">
                {models.map((id) => {
                  const favorite = favorites.includes(id);
                  return (
                    <Row key={id} title={modelDisplayLabel("opencode", id)} desc={id}>
                      <ShadcnToggle
                        size="sm"
                        className="set-model-favorite tw:size-7 tw:min-w-7 tw:border tw:border-transparent tw:p-0"
                        pressed={favorite}
                        aria-label={favorite ? t("action.remove-favorite") : t("action.add-favorite")}
                        title={favorite ? t("action.remove-favorite") : t("action.add-favorite")}
                        onPressedChange={() => toggleFavoriteModel("opencode", id)}
                      >
                        <StarIcon size={14} />
                      </ShadcnToggle>
                    </Row>
                  );
                })}
                {!models.length && (
                  <p className="set-empty">{t("settings.model-no-match")}</p>
                )}
              </div>
            </ScrollArea>
          </Group>
        );
      })()}

      {/* Settings.tsx:794-819 — ajouter un slug personnalisé. */}
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
                save({ customModels: [...customModels, { provider: slugProv, id: slugText.trim() }] });
                setSlugText("");
              }
            }} />
          <Button className="set-btn" onClick={() => {
            if (!slugText.trim()) return;
            save({ customModels: [...customModels, { provider: slugProv, id: slugText.trim() }] });
            setSlugText("");
          }}><PlusIcon /> {t("action.add")}</Button>
        </Row>
      </Group>

      {/* Settings.tsx:820-844 — effort par modèle. */}
      <Group label={t("settings.model-effort-sub")}>
        {([
          ...CLAUDE_MODELS.filter((m) => m.id).map((m) => ({ provider: "claude" as const, ...m })),
          ...providerModels("codex", provs, s.defaultModel).filter((m) => m.id).map((m) => ({ provider: "codex" as const, ...m })),
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
                  save({ modelEfforts: next });
                }}
                options={efforts.map((l) => ({ value: l, label: l === "" ? t("common.provider-default") : l }))}
              />
            </Row>
          );
        })}
      </Group>

      {/* Repli « Avancé » : fournisseurs API (Settings.tsx:1118-1248) et
          slugs enregistrés (Settings.tsx:845-860) — dans chaque section
          d'origine, ces deux blocs étaient déjà les derniers, les moins
          consultés au quotidien (CRUD d'endpoint personnalisé, gestion des
          slugs déjà ajoutés). */}
      <Advanced count={2}>
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
        <div className="set-group">
          <div className="set-group-label">{t("settings.slug-saved")}</div>
          {customModels.length > 0 ? (
            <div className="set-card">
              {customModels.map((m, i) => (
                <Row key={m.provider + ":" + m.id + ":" + i} title={m.id} desc={m.provider === "claude" ? "Claude" : "Codex"}>
                  <Button variant="ghost" className="set-btn quiet" onClick={() =>
                    save({ customModels: customModels.filter((_, j) => j !== i) })
                  }>{t("action.remove")}</Button>
                </Row>
              ))}
            </div>
          ) : (
            <p className="set-empty">{t("settings.no-custom-models")}</p>
          )}
        </div>
      </Advanced>
    </>
  );
}
