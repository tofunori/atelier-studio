// Section Modèles (lot B1, tâche 4) : câblage du tableau dense sur la
// dérivation pure `buildModelRows` (tâche 2) et le composant présentationnel
// `ModelsGrid` (tâche 3). Cette tâche solde aussi la dette du lot 1 : les
// groupes ex-« setup » et ex-« providers » listaient le MÊME ensemble de
// fournisseurs l'un sous l'autre (statut d'installation d'un côté, ordre du
// picker de l'autre) — un fournisseur n'apparaît désormais qu'une fois dans
// la page, dans le tableau (prêt) ou dans « Non disponibles » (absent).
//
// Le vieux bloc « effort par modèle » (Settings.tsx:820-844, une liste plate
// CLAUDE_MODELS + providerModels + customModels) disparaît aussi : c'est la
// colonne Effort du tableau qui porte ce réglage maintenant, ligne par ligne
// — le garder aurait recréé une troisième liste des mêmes modèles. Même sort
// pour le bloc de recherche/favoris réservé à opencode (Settings.tsx:1053-
// 1117) : la recherche et les favoris de ModelsGrid couvrent déjà TOUS les
// fournisseurs (spec §6.2).
//
// Structure de page (spec §6.1/§6.2, dans cet ordre) :
//   1. Au lancement d'une conversation — fournisseur de départ (segmenté) +
//      rangée récapitulative en lecture seule.
//   2. Le tableau — ModelsGrid.
//   3. Non disponibles — fournisseurs sans aucun modèle exploitable.
//   4. Avancé — ordre du sélecteur, fournisseurs API, slugs personnalisés.
//
// Le bloc « Runtime » (Node/sidecar) et les actions « copier le diagnostic »/
// « actualiser » de l'ancienne section setup disparaissent : ce ne sont ni
// des fournisseurs ni des modèles, et la structure à 4 blocs ci-dessus est
// prescrite par le brief. Signalé dans le rapport de tâche.
import { useEffect, useState } from "react";
import { confirm as tauriConfirm } from "@tauri-apps/plugin-dialog";
import { Advanced, Group, Row, Toggle } from "../primitives";
import type { ApiProviderRow, ProviderCatalogRow, SectionProps } from "../shared";
import type { Settings } from "../../../lib/settings";
import { t } from "../../../lib/i18n";
import { modelDisplayLabel } from "../../../lib/modelCatalog";
import { buildModelRows, type ModelRow } from "../models/buildModelRows";
import { ModelsGrid } from "../models/ModelsGrid";
import { PlusIcon } from "../../icons";
import { Select } from "../../Select";
import { Button, InlineNotice, SegmentedControl } from "../../ui";
import { Checkbox, CheckboxIndicator } from "../../shadcn/checkbox";
import { Field, FieldGroup, FieldLabel } from "../../shadcn/field";
import { Input } from "../../shadcn/input";
import { ToggleGroup, ToggleGroupItem } from "../../shadcn/toggle-group";
import { CheckIcon } from "lucide-react";

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

// Types locaux à l'ancienne section setup (Settings.tsx:111-130) — seul
// consommateur restant : enrichir les lignes « Non disponibles » avec le
// détail d'auth (login requis, commande de terminal…) que le catalogue
// providerStatus n'expose pas (voir buildModelRows.ts, commentaire d'en-tête).
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

// Filtre textuel du tableau : appliqué ICI (pas dans ModelsGrid, qui reste
// présentationnel — voir son commentaire d'en-tête). Ne trie ni ne réordonne
// rien : un simple .filter() préserve la contiguïté par fournisseur que
// ModelsGrid suppose pour regrouper ses radios ARIA.
function filterModelRows(rows: ModelRow[], filter: string): ModelRow[] {
  const q = filter.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) =>
    row.label.toLowerCase().includes(q)
    || row.modelId.toLowerCase().includes(q)
    || row.providerLabel.toLowerCase().includes(q));
}

export default function Models(p: SectionProps) {
  const save = (patch: Partial<Settings>) => { p.set(patch); p.onSaved(); };
  const s = p.s;
  const customModels = s.customModels ?? [];
  const modelEfforts = s.modelEfforts ?? {};
  const favoriteModels = s.favoriteModels ?? {};

  // État local déménagé de Settings.tsx : setup (auth des fournisseurs
  // absents), provs (catalogue vivant, source de buildModelRows) +
  // apiProvs/apiForm/apiModels* (fournisseurs API), slug* (ajout de slug).
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
  const [slugProv, setSlugProv] = useState<"claude" | "codex">("codex");
  const [slugText, setSlugText] = useState("");
  const [modelFilter, setModelFilter] = useState("");

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

  // Abonnement WebSocket (inchangé) : cette section n'écoute que ses propres
  // types de message (providerStatus, setupStatus, apiProviders,
  // listApiModels). providerStatus est aussi écouté par General.tsx — sans
  // effet de bord, chaque section ne fait que dériver son propre état local
  // en lecture seule.
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

  // Dérivation pure (tâche 2) : catalogue + favoris + efforts + slugs +
  // défauts → une ligne par modèle, plus les fournisseurs sans rien à
  // montrer.
  const { rows, unavailable } = buildModelRows(provs, s);
  const filteredRows = filterModelRows(rows, modelFilter);

  function handleSetDefault(row: ModelRow) {
    save({ defaultModel: { ...s.defaultModel, [row.provider]: row.modelId } });
  }

  function handleToggleFavorite(row: ModelRow) {
    const current = favoriteModels[row.provider] ?? [];
    const next = row.isFavorite
      ? current.filter((id) => id !== row.modelId)
      : [...current, row.modelId];
    save({ favoriteModels: { ...favoriteModels, [row.provider]: next } });
  }

  function handleSetEffort(row: ModelRow, effort: string) {
    const key = `${row.provider}:${row.modelId}`;
    const next = { ...modelEfforts };
    if (effort) next[key] = effort;
    else delete next[key];
    save({ modelEfforts: next });
  }

  // Rangée récapitulative « Conversation neuve » (spec §6.1) : ce que
  // donnera concrètement un nouveau fil, dérivé en lecture seule des mêmes
  // réglages que le reste de la page — jamais un état local dupliqué.
  const activeProviderRow = provs?.find((row) => row.id === s.defaultProvider) ?? null;
  const activeModelId = s.defaultModel[s.defaultProvider] ?? "";
  const activeModelLabel = activeModelId
    ? modelDisplayLabel(s.defaultProvider, activeModelId, activeProviderRow?.modelLabels)
    : t("settings.checking");
  // L'effort par modèle (colonne Effort du tableau) prime sur l'effort par
  // défaut du fournisseur — même règle que l'ancien Settings.tsx:820-844.
  const perModelEffort = modelEfforts[`${s.defaultProvider}:${activeModelId}`];
  const activeEffort = perModelEffort || s.defaultEffort[s.defaultProvider] || "";
  const permissionLabels: Record<string, string> = {
    bypassPermissions: t("permission.full"),
    acceptEdits: t("permission.accept-edits"),
    default: t("action.ask-default"),
    plan: t("permission.plan"),
  };
  // Fournisseur de départ : segmenté à 2 options (Claude/Codex), comme
  // l'ancien Select de General.tsx (Settings.tsx:500-544 avant migration) —
  // les autres fournisseurs (API, Grok, opencode…) restent sélectionnables
  // depuis le tableau via leur propre défaut, mais ne sont pas encore des
  // fournisseurs de DÉPART complets (pas de defaultModel/defaultEffort dédié
  // pour tous). Généraliser ce sélecteur est hors périmètre de cette tâche.
  const providerLabelFor = (id: string) => (id === "claude" ? "Claude" : id === "codex" ? "Codex" : id);

  return (
    <>
      <h1>{t("settings.models")}</h1>
      <p className="set-sub">{t("settings.models-sub")}</p>

      {/* Bloc 1 : Au lancement d'une conversation (spec §6.1). */}
      <h2>{t("settings.models-startup")}</h2>
      <Group>
        <Row title={t("settings.default-provider")} desc={t("settings.default-provider-desc")}>
          <SegmentedControl
            label={t("settings.default-provider")}
            value={s.defaultProvider}
            onChange={(value) => save({ defaultProvider: value })}
            options={[
              { value: "claude", label: "Claude" },
              { value: "codex", label: "Codex" },
            ]}
          />
        </Row>
        <Row
          title={t("settings.models-new-thread")}
          desc={t("settings.models-new-thread-desc", {
            provider: providerLabelFor(s.defaultProvider),
            model: activeModelLabel,
            effort: activeEffort || t("common.provider-default"),
            permission: permissionLabels[s.defaultPermissionMode] ?? s.defaultPermissionMode,
          })}
        >
          {/* Lecture seule, dérivée (spec §6.1) : aucun contrôle, seule la
              description de la rangée porte l'information. */}
          <></>
        </Row>
      </Group>

      {p.ws?.readyState !== 1 && (
        <InlineNotice tone="warning" className="set-notice">
          {t("settings.sidecar-disconnected-notice")}
        </InlineNotice>
      )}

      {/* Bloc 2 : le tableau dense (spec §6.2, tâche 3). */}
      <h2>{t("settings.models-table")}</h2>
      {provs === null && <p className="set-empty">{t("settings.checking")}</p>}
      <ModelsGrid
        rows={filteredRows}
        onSetDefault={handleSetDefault}
        onToggleFavorite={handleToggleFavorite}
        onSetEffort={handleSetEffort}
        filter={modelFilter}
        onFilterChange={setModelFilter}
      />

      {/* Bloc 3 : Non disponibles — un fournisseur SANS AUCUN modèle
          exploitable (voir buildModelRows.ts). L'information d'installation
          de l'ancienne section setup devient ici la pastille d'état et le
          bouton de la ligne, jamais une seconde liste complète. */}
      {unavailable.length > 0 && (
        <>
          <h2>{t("settings.models-unavailable")}</h2>
          <p className="set-sub">{t("settings.models-unavailable-sub")}</p>
          <Group>
            {unavailable.map((row) => {
              const su = setup?.providers.find((sp) => sp.id === row.id) ?? null;
              return (
                <Row
                  key={row.id}
                  title={row.label}
                  desc={su
                    ? (su.kind === "api"
                      ? `${t("settings.provider-api")} · ${su.defaultModel ?? ""}`
                      : (su.binPath || t("settings.path-missing")))
                    : (row.kind === "api" ? t("settings.key-missing") : t("settings.path-missing"))}
                >
                  <span className={`set-badge ${row.ok ? "ok" : "ko"}`}>
                    {row.ok ? t("settings.detected") : t("settings.absent")}
                  </span>
                  {su && (
                    <span className={`set-badge ${authClass(su.auth)}`}>{authLabel(su.auth)}</span>
                  )}
                  {su?.auth === "login_needed" && su.loginCommand ? (
                    // ouvre le terminal Atelier avec la commande exacte
                    // annoncée par le harnais ; après le login : la ligne se
                    // rafraîchit au prochain providerStatus/setupStatus.
                    <Button
                      variant="secondary"
                      className="set-btn"
                      onClick={() =>
                        window.dispatchEvent(
                          new CustomEvent("atelier-terminal-command", {
                            detail: { command: su.loginCommand },
                          }),
                        )
                      }
                    >
                      {t("settings.setup-login-terminal")}
                    </Button>
                  ) : null}
                  {row.version && <span className="setup-version">{row.version}</span>}
                </Row>
              );
            })}
          </Group>
        </>
      )}

      {/* Bloc 4 : Avancé — ordre du sélecteur, fournisseurs API, slugs
          personnalisés (spec §6.1/§6.2). Chaque sous-bloc porte désormais son
          étiquette : le groupe « ordre du sélecteur » n'en avait AUCUNE
          avant cette tâche (revue du lot 1). */}
      <Advanced count={3}>
        <p className="set-sub">{t("settings.providers-visibility-sub")}</p>
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
            <Group label={t("settings.models-picker-order")}>
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

        <Group label={t("settings.models-slug-group")}>
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
          {customModels.length > 0 ? (
            customModels.map((m, i) => (
              <Row key={m.provider + ":" + m.id + ":" + i} title={m.id} desc={m.provider === "claude" ? "Claude" : "Codex"}>
                <Button variant="ghost" className="set-btn quiet" onClick={() =>
                  save({ customModels: customModels.filter((_, j) => j !== i) })
                }>{t("action.remove")}</Button>
              </Row>
            ))
          ) : (
            <p className="set-empty">{t("settings.no-custom-models")}</p>
          )}
        </Group>
      </Advanced>
    </>
  );
}
