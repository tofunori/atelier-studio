import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";

export default function AtelierPane({ url, reloadKey }: { url: string; reloadKey: number }) {
  const [manualReload, setManualReload] = useState(0);
  return (
    <div className="atelier-wrap">
      <div className="atelier-bar">
        <span className="atelier-title">atelier</span>
        <span className="flex" />
        <button className="ghost" title="Recharger" onClick={() => setManualReload((n) => n + 1)}>
          ↻
        </button>
        <button
          className="ghost"
          title="Ouvrir dans le navigateur"
          onClick={() => openUrl(url)}
        >
          ⧉
        </button>
      </div>
      <div className="atelier-body">
        <iframe
          key={`${reloadKey}-${manualReload}`}
          className="atelier"
          src={url}
          title="atelier"
        />
      </div>
    </div>
  );
}
