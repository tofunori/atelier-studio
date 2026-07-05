import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { wsSend } from "../lib/wsBus";

type LocalServer = { port: number; title: string | null };

// Navigateur NATIF : webview enfant Tauri superposée à la zone de contenu —
// aucune restriction X-Frame-Options (x.com, github, tout s'affiche).
export default function BrowserTab(p: {
  tabId: string;
  visible: boolean;
  onTitle: (title: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [servers, setServers] = useState<LocalServer[] | null>(null);
  const scanned = useRef(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const urlRef = useRef<string | null>(null);
  // correction d'origine auto-calibrée : on demande une position, on relit la
  // position réelle, l'écart devient la correction (indépendant des conventions
  // de coordonnées Tauri/macOS)
  const corrRef = useRef({ x: 0, y: 0 });

  async function calibrate(wanted: { x: number; y: number }) {
    try {
      const [ax, ay] = await invoke<[number, number]>("browser_probe");
      const dx = wanted.x - ax;
      const dy = wanted.y - ay;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        corrRef.current = { x: corrRef.current.x + dx, y: corrRef.current.y + dy };
        const r = rect();
        if (r) await invoke("browser_bounds", r);
      }
    } catch {}
  }

  function scan() {
    if (!wsSend({ type: "scanLocal" })) setTimeout(scan, 700);
  }

  function rect() {
    const r = areaRef.current?.getBoundingClientRect();
    if (!r || r.width < 10) return null;
    return {
      x: r.left + corrRef.current.x,
      y: r.top + corrRef.current.y,
      w: r.width,
      h: r.height,
    };
  }

  function syncBounds() {
    const r = rect();
    if (r && urlRef.current) invoke("browser_bounds", r).catch(() => {});
  }

  function navigate(raw: string) {
    let u = raw.trim();
    if (!u) return;
    if (!/^https?:\/\//.test(u)) {
      u = /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(u) || u.startsWith("localhost") || u.startsWith("127.")
        ? (u.startsWith("localhost") || u.startsWith("127.") ? "http://" : "https://") + u
        : `https://www.google.com/search?q=${encodeURIComponent(u)}`;
    }
    setUrl(u);
    urlRef.current = u;
    setInput(u);
    const r0 = areaRef.current?.getBoundingClientRect();
    if (r0) {
      const wanted = { x: r0.left + corrRef.current.x, y: r0.top + corrRef.current.y };
      invoke("browser_show", { url: u, x: wanted.x, y: wanted.y, w: r0.width, h: r0.height })
        .then(() => setTimeout(() => calibrate({ x: r0.left, y: r0.top }), 150))
        .catch(() => {});
    }
    try {
      p.onTitle(new URL(u).hostname || "browser");
    } catch {}
  }

  // visibilité : montrer/cacher la webview native avec la surface
  useEffect(() => {
    if (!urlRef.current) return;
    if (p.visible) {
      invoke("browser_show_again", {}).catch(() => {});
      setTimeout(syncBounds, 30);
    } else {
      invoke("browser_hide", {}).catch(() => {});
    }
  }, [p.visible]);

  // suivre la taille du pane
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => syncBounds());
    ro.observe(el);
    window.addEventListener("resize", syncBounds);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncBounds);
    };
  }, []);

  // synchroniser l'URL (navigation interne à la webview)
  useEffect(() => {
    const t = setInterval(async () => {
      if (!p.visible || !urlRef.current) return;
      try {
        const u = await invoke<string>("browser_url");
        if (u && u !== urlRef.current) {
          urlRef.current = u;
          setInput(u);
          try { p.onTitle(new URL(u).hostname); } catch {}
        }
      } catch {}
    }, 1200);
    return () => clearInterval(t);
  }, [p.visible]);

  // page d'accueil : scan des serveurs locaux
  useEffect(() => {
    const onServers = (e: Event) => setServers((e as CustomEvent).detail);
    window.addEventListener("local-servers", onServers);
    if (!scanned.current) {
      scanned.current = true;
      scan();
    }
    return () => window.removeEventListener("local-servers", onServers);
  }, []);

  useEffect(() => () => { invoke("browser_hide", {}).catch(() => {}); }, []);

  return (
    <div className="browser-tab" style={{ display: p.visible ? "flex" : "none" }}>
      <div className="browser-bar">
        <button className="ghost" onClick={() => invoke("browser_eval", { js: "history.back()" })} title="Précédent">←</button>
        <button className="ghost" onClick={() => invoke("browser_eval", { js: "history.forward()" })} title="Suivant">→</button>
        <button className="ghost" onClick={() => invoke("browser_eval", { js: "location.reload()" })} title="Recharger">↻</button>
        <button
          className="ghost"
          title="Add to chat : sélectionne dans la page, ⌘C, puis clique ici"
          onClick={async () => {
            try {
              const text = await navigator.clipboard.readText();
              if (!text.trim()) return;
              window.dispatchEvent(new CustomEvent("browser-add-to-chat", {
                detail: { text: text.trim(), url: urlRef.current ?? "" },
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
        {url && (
          <button className="ghost" title="Fermer la page (retour à l'accueil)"
            onClick={() => {
              invoke("browser_hide", {}).catch(() => {});
              setUrl(null);
              urlRef.current = null;
              setInput("");
              scan();
            }}>✕</button>
        )}
      </div>
      <div className="browser-body" ref={areaRef}>
        {!url && (
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
    </div>
  );
}
