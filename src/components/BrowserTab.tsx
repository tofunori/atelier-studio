import { useEffect, useRef, useState } from "react";

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
  const scanned = useRef(false);

  function scan() {
    if (p.ws?.readyState === 1) p.ws.send(JSON.stringify({ type: "scanLocal" }));
  }

  useEffect(() => {
    const onServers = (e: Event) => setServers((e as CustomEvent).detail);
    window.addEventListener("local-servers", onServers);
    if (!scanned.current) {
      scanned.current = true;
      scan();
    }
    return () => window.removeEventListener("local-servers", onServers);
  }, []);

  function navigate(raw: string) {
    let u = raw.trim();
    if (!u) return;
    if (!/^https?:\/\//.test(u)) {
      // pas une URL → recherche (DuckDuckGo lite, iframe-friendly)
      u = /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(u) || u.startsWith("localhost")
        ? "http://" + u.replace(/^http:\/\//, "")
        : `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(u)}`;
      if (u.startsWith("http://localhost") || /^http:\/\/[\w.-]+\.[a-z]{2,}/i.test(u)) {
        u = u.replace(/^http:\/\/(?!localhost|127\.)/, "https://");
      }
    }
    const next = [...stack.slice(0, idx + 1), u];
    setStack(next);
    setIdx(next.length - 1);
    setUrl(u);
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
      {url ? (
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
                <div className="bh-card-title">{s.title || `Serveur local`}</div>
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
