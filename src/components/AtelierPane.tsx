import { openUrl } from "@tauri-apps/plugin-opener";

type Tab = { id: string; url: string; title: string };

export default function AtelierPane({
  url,
  tabs,
  activeTab,
  onSelectTab,
  onCloseTab,
  reloadKey,
  onHardReload,
}: {
  url: string;
  tabs: Tab[];
  activeTab: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  reloadKey: number;
  onHardReload: () => void;
}) {
  const current = tabs.find((t) => t.id === activeTab);
  return (
    <div className="atelier-wrap">
      <div className="atelier-bar">
        <button
          className={`atab ${activeTab === "gallery" ? "on" : ""}`}
          onClick={() => onSelectTab("gallery")}
        >
          🖼 galerie
        </button>
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`atab ${activeTab === t.id ? "on" : ""}`}
            onClick={() => onSelectTab(t.id)}
            title={t.title}
          >
            <span className="atab-title">{t.title}</span>
            <span
              className="atab-x"
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(t.id);
              }}
            >
              ✕
            </span>
          </button>
        ))}
        <span className="flex" />
        <button className="ghost" title="Recharger (relance le serveur si mort)" onClick={onHardReload}>
          ↻
        </button>
        <button
          className="ghost"
          title="Ouvrir dans le navigateur"
          onClick={() => openUrl(current?.url ?? url)}
        >
          ⧉
        </button>
      </div>
      <div className="atelier-body">
        {/* la galerie reste montée (état préservé) ; les onglets aussi */}
        <iframe
          key={reloadKey}
          className="atelier"
          style={{ display: activeTab === "gallery" ? "block" : "none" }}
          src={url}
          title="atelier"
        />
        {tabs.map((t) => (
          <iframe
            key={t.id}
            className="atelier"
            style={{ display: activeTab === t.id ? "block" : "none" }}
            src={t.url}
            title={t.title}
          />
        ))}
      </div>
    </div>
  );
}
