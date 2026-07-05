import { useEffect, useRef, useState } from "react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { wsSend } from "../lib/wsBus";

type LocalServer = { port: number; title: string | null };

export default function BrowserTab(p: {
  tabId: string;
  ws: WebSocket | null;
  visible: boolean;
  onTitle: (title: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [stack, setStack] = useState<string[]>([]);
  const [idx, setIdx] = useState(-1);
  const [reloadKey, setReloadKey] = useState(0);
  const [servers, setServers] = useState<LocalServer[] | null>(null);
  const [blocked, setBlocked] = useState(false);
  const scanned = useRef(false);
  const urlRef = useRef<string | null>(null);

  function scan() {
    if (!wsSend({ type: "scanLocal" })) setTimeout(scan, 700);
  }

  useEffect(() => {
    const onServers = (e: Event) => setServers((e as CustomEvent).detail);
    const onFrame = (e: Event) => {
      const d = (e as CustomEvent).detail as { url: string; blocked: boolean };
      if (d.url === urlRef.current) setBlocked(d.blocked);
    };
    window.addEventListener("local-servers", onServers);
    window.addEventListener("frame-checked", onFrame);
    if (!scanned.current) {
      scanned.current = true;
      scan();
    }
    return () => {
      window.removeEventListener("local-servers", onServers);
      window.removeEventListener("frame-checked", onFrame);
    };
  }, []);

  function navigate(raw: string) {
    let u = raw.trim();
    if (!u) return;
    if (!/^https?:\/\//.test(u)) {
      // pas une URL → recherche (DuckDuckGo lite, iframe-friendly)
      u = /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(u) || u.startsWith("localhost")
        ? "http://" + u.replace(/^http:\/\//, "")
        : `https://www.google.com/search?igu=1&q=${encodeURIComponent(u)}`;
      if (u.startsWith("http://localhost") || /^http:\/\/[\w.-]+\.[a-z]{2,}/i.test(u)) {
        u = u.replace(/^http:\/\/(?!localhost|127\.)/, "https://");
      }
    }
    const next = [...stack.slice(0, idx + 1), u];
    setStack(next);
    setIdx(next.length - 1);
    setUrl(u);
    urlRef.current = u;
    setBlocked(false);
    if (!u.includes("localhost") && !u.includes("127.0.0.1")) {
      wsSend({ type: "checkFrame", url: u });
    }
    setInput(u);
    try {
      p.onTitle(new URL(u).hostname || "browser");
    } catch {}
  }

  function go(delta: number) {
    const n = idx + delta;
    if (n < 0 || n >= stack.length) return;
    setIdx(n);
    setUrl(stack[n]);
    setInput(stack[n]);
  }

  return (
    <div className="browser-tab" style={{ display: p.visible ? "flex" : "none" }}>
      <div className="browser-bar">
        <button className="ghost" disabled={idx <= 0} onClick={() => go(-1)} title="Précédent">←</button>
        <button className="ghost" disabled={idx >= stack.length - 1} onClick={() => go(1)} title="Suivant">→</button>
        <button className="ghost" onClick={() => setReloadKey((n) => n + 1)} title="Recharger">↻</button>
        <button
          className="ghost"
          title="Add to chat : sélectionne du texte dans la page, ⌘C, puis clique ici"
          onClick={async () => {
            try {
              const text = await navigator.clipboard.readText();
              if (!text.trim()) return;
              window.dispatchEvent(new CustomEvent("browser-add-to-chat", {
                detail: { text: text.trim(), url: url ?? "" },
              }));
            } catch {}
          }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
            <path d="M14 8c0 3-2.7 5.2-6 5.2-.8 0-1.6-.1-2.3-.4L2.5 14l1-2.6C2.6 10.5 2 9.3 2 8c0-3 2.7-5.2 6-5.2S14 5 14 8z" />
          </svg>
        </button>
        <input
          className="browser-url"
          placeholder="Rechercher ou entrer une URL"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") navigate(input);
          }}
          onFocus={(e) => e.target.select()}
        />
      </div>
      {url && blocked ? (
        <div className="browser-home">
          <div className="bh-card" style={{ cursor: "default" }}>
            <div className="bh-card-txt">
              <div className="bh-card-title">Ce site refuse l'intégration</div>
              <div className="bh-card-sub">
                {(() => { try { return new URL(url).hostname; } catch { return url; } })()} bloque
                l'affichage embarqué (X-Frame-Options).
              </div>
            </div>
            <button
              className="set-btn"
              onClick={() => {
                new WebviewWindow(`browser-${Date.now()}`, {
                  url,
                  title: (() => { try { return new URL(url).hostname; } catch { return "Browser"; } })(),
                  width: 1100,
                  height: 800,
                });
              }}
            >
              Ouvrir dans une fenêtre
            </button>
          </div>
        </div>
      ) : url ? (
        <iframe key={`${url}-${reloadKey}`} className="browser-frame" src={url} title="browser" />
      ) : (
        <div className="browser-home">
          <div className="bh-row">
            <span className="bh-title">Local</span>
            <button className="ghost" title="Re-scanner" onClick={scan}>↻</button>
          </div>
          {servers === null && <div className="bh-empty">Scan des ports locaux…</div>}
          {servers?.length === 0 && <div className="bh-empty">Aucun serveur local détecté.</div>}
          {servers?.map((s) => (
            <div key={s.port} className="bh-card" onClick={() => navigate(`http://localhost:${s.port}`)}>
              <div className="bh-card-txt">
                <div className="bh-card-title">{s.title || `localhost:${s.port}`}</div>
                <div className="bh-card-sub">localhost:{s.port}</div>
              </div>
              <span className="bh-dot" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
