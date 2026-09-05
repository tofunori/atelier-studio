import { pluginCanAttach, type PluginCatalogEntry } from "../lib/plugins";
import { t } from "../lib/i18n";
import { RowButton } from "./ui";
import { DialogSurface } from "./ui/DialogSurface";

export default function PluginPanel({
  plugins,
  onClose,
  loading = false,
  error = null,
  onRetry,
}: {
  plugins: PluginCatalogEntry[];
  onClose: () => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  return (
    <DialogSurface open onOpenChange={(open) => { if (!open) onClose(); }} className="plugin-panel"
      title="Plugins Codex" closeLabel={t("action.close")}
      description={<span aria-live="polite">{loading ? t("plugins.loading") : t("plugins.installed", { count: plugins.length })}</span>}>
      <div className="plugin-list">
        {error && <div className="plugin-empty" role="alert">{t("plugins.error")}
          <p>{error}</p>
          {onRetry && <RowButton onClick={onRetry}>{t("plugins.retry")}</RowButton>}
        </div>}
        {plugins.map((plugin) => (
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
              <small>{plugin.skills.length} skill{plugin.skills.length === 1 ? "" : "s"}{plugin.version ? ` · v${plugin.version}` : ""}</small>
            </div>
            <span className="plugin-ready" data-ready={pluginCanAttach(plugin)}>{t(!plugin.enabled ? "plugins.disabled"
              : plugin.detailError ? "plugins.unreadable"
              : pluginCanAttach(plugin) ? "plugins.attachable" : "plugins.no-skill")}</span>
          </article>
        ))}
        {!loading && !error && !plugins.length && <p className="plugin-empty">{t("plugins.empty")}</p>}
      </div>
      <footer className="plugin-panel-foot">{t("plugins.hint")}</footer>
    </DialogSurface>
  );
}
