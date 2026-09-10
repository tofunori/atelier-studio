import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCodexApps } from "../lib/useCodexApps";
import { pluginCanAttach, type PluginCatalogEntry } from "../lib/plugins";
import { t } from "../lib/i18n";
import { Button } from "./ui";
import { Input } from "./shadcn/input";
import { Field, FieldLabel } from "./shadcn/field";
import "./PluginPanel.css";
import { DialogSurface } from "./ui/DialogSurface";

export default function PluginPanel({
  plugins,
  onClose,
  loading = false,
  error = null,
  onRetry,
  socket,
  projectRoot = "",
}: {
  plugins: PluginCatalogEntry[];
  onClose: () => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  socket?: WebSocket | null;
  projectRoot?: string;
}) {
  const [query, setQuery] = useState("");
  const matches = (entry: { name: string; description?: string | null }) => `${entry.name} ${entry.description ?? ""}`.toLowerCase().includes(query.toLowerCase());
  const [browse, setBrowse] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const catalog = useCodexApps(socket, projectRoot);
  const connect = async (url: string) => {
    if (!/^https:\/\//i.test(url)) return;
    try { await openUrl(url); setLinkError(null); }
    catch { setLinkError(t("plugins.open-failed")); }
  };
  return (
    <DialogSurface open onOpenChange={(open) => { if (!open) onClose(); }} className="plugin-panel"
      title={t("plugins.title")} closeLabel={t("action.close")}
      description={<span aria-live="polite">{loading ? t("plugins.loading") : t("plugins.installed", { count: plugins.length })}</span>}>
      <div className="plugin-catalog-toolbar">
        <Button variant="ghost" size="sm" onClick={() => { setBrowse(!browse); if (!browse) catalog.load(); }}>{t(browse ? "plugins.show-installed" : "plugins.browse")}</Button>
        {onRetry && <Button variant="ghost" size="sm" disabled={loading} onClick={() => { onRetry(); if (browse) catalog.load(); }}>{t("plugins.refresh")}</Button>}
      </div>
      <Field className="plugin-catalog-search">
        <FieldLabel htmlFor="plugin-catalog-search">{t(browse ? "plugins.filter-loaded" : "plugins.filter")}</FieldLabel>
        <Input id="plugin-catalog-search" value={query} onChange={event => setQuery(event.target.value)} />
      </Field>
      <div className="plugin-list">
        {linkError && <p role="alert">{linkError}</p>}
        {browse && <section aria-label={t("plugins.browse")}>
          <p>{t("plugins.connect-hint")}</p>
          {catalog.apps.filter(matches).map(app => <article className="plugin-row" key={app.id}>
            <span className="plugin-icon plugin-icon-fallback">@</span>
            <div className="plugin-copy"><strong>{app.name}</strong><p>{app.description}</p>
              <small>{t(app.isAccessible ? "plugins.connected" : "plugins.not-connected")}</small>
            </div>
            {app.installUrl && /^https:\/\//i.test(app.installUrl) && <Button variant="ghost" size="sm" onClick={() => void connect(app.installUrl!)}>{t("plugins.connect")}</Button>}
          </article>)}
          {catalog.error && <p role="alert">{catalog.error} <Button variant="ghost" size="sm" onClick={catalog.retry}>{t("plugins.retry")}</Button></p>}
          {catalog.loading && <p role="status">{t("plugins.loading")}</p>}
          {!catalog.loading && catalog.cursor && <Button variant="ghost" size="sm" onClick={() => catalog.load(catalog.cursor)}>{t("plugins.more")}</Button>}
        </section>}

        {error && <div className="plugin-empty" role="alert">{t("plugins.error")}
          <p>{error}</p>
          {onRetry && <Button variant="ghost" size="sm" onClick={onRetry}>{t("plugins.retry")}</Button>}
        </div>}
        {!browse && plugins.filter(plugin => matches({ name: plugin.displayName, description: plugin.description })).map((plugin) => (
          <article className="plugin-row" key={plugin.id}>
            {plugin.icon && /^https?:\/\//.test(plugin.icon)
              ? <img src={plugin.icon} alt="" className="plugin-icon" />
              : <span className="plugin-icon plugin-icon-fallback">@</span>}
            <div className="plugin-copy">
              <div className="plugin-title">
                <strong>{plugin.displayName}</strong>
                {pluginCanAttach(plugin) && <code>@{plugin.name}</code>}
              </div>
              <p>{plugin.description}</p>
              <small>{plugin.kind === "app" ? t("plugins.app") : `${plugin.skills.length} skills${plugin.mcpServers?.length ? ` · ${plugin.mcpServers.length} MCP` : ""}${plugin.version ? ` · v${plugin.version}` : ""}`}</small>
            </div>
            <span className="plugin-ready" data-ready={pluginCanAttach(plugin)}>{t(!plugin.enabled ? "plugins.disabled"
              : plugin.detailError ? "plugins.unreadable"
              : plugin.kind === "app" ? (plugin.callable ? "plugins.callable" : "plugins.not-callable")
              : pluginCanAttach(plugin) ? "plugins.attachable" : "plugins.no-skill")}</span>
          </article>
        ))}
        {!browse && !loading && !error && !plugins.length && <p className="plugin-empty">{t("plugins.empty")}</p>}
      </div>
      <footer className="plugin-panel-foot">{t("plugins.hint")}</footer>
    </DialogSurface>
  );
}
