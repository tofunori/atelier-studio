import type { PluginCatalogEntry } from "../lib/plugins";
import { CloseIcon } from "./icons";

export default function PluginPanel({
  plugins,
  onClose,
}: {
  plugins: PluginCatalogEntry[];
  onClose: () => void;
}) {
  return (
    <section className="plugin-panel" role="dialog" aria-modal="true" aria-label="Plugins Codex" onClick={(event) => event.stopPropagation()}>
      <header className="plugin-panel-head">
        <div>
          <h2>Plugins Codex</h2>
          <p>{plugins.length} plugins disponibles dans Atelier</p>
        </div>
        <button type="button" className="plugin-close" aria-label="Fermer" onClick={onClose}><CloseIcon /></button>
      </header>
      <div className="plugin-list">
        {plugins.map((plugin) => (
          <article className="plugin-row" key={plugin.id}>
            {plugin.icon && /^https?:\/\//.test(plugin.icon)
              ? <img src={plugin.icon} alt="" className="plugin-icon" />
              : <span className="plugin-icon plugin-icon-fallback">@</span>}
            <div className="plugin-copy">
              <div className="plugin-title">
                <strong>{plugin.displayName}</strong>
                <code>@{plugin.name}</code>
              </div>
              <p>{plugin.description}</p>
              <small>{plugin.skills.length} skill{plugin.skills.length === 1 ? "" : "s"}{plugin.version ? ` · v${plugin.version}` : ""}</small>
            </div>
            <span className="plugin-ready">Disponible</span>
          </article>
        ))}
        {!plugins.length && <p className="plugin-empty">Aucun plugin compatible trouvé dans l’installation Codex.</p>}
      </div>
      <footer className="plugin-panel-foot">Tape <code>@visualize</code> ou un autre nom dans le chat Codex pour l’activer sur le prochain message.</footer>
    </section>
  );
}
