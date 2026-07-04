import { openUrl } from "@tauri-apps/plugin-opener";

export default function AtelierPane({
  url,
  reloadKey,
  onHardReload,
}: {
  url: string;
  reloadKey: number;
  onHardReload: () => void;
}) {
  return (
    <div className="atelier-wrap">
      <div className="atelier-bar">
        <span className="atelier-title">atelier</span>
        <span className="flex" />
        <button className="ghost" title="Recharger (relance le serveur si mort)" onClick={onHardReload}>
          ↻
        </button>
        <button className="ghost" title="Ouvrir dans le navigateur" onClick={() => openUrl(url)}>
          ⧉
        </button>
      </div>
      <div className="atelier-body">
        <iframe key={reloadKey} className="atelier" src={url} title="atelier" />
      </div>
    </div>
  );
}
