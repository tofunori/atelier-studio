import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { wsSend } from "../lib/wsBus";
import { t } from "../lib/i18n";
import { CloseIcon, RefreshIcon } from "./icons";
import { Input } from "./shadcn/input";
import { Button, IconButton, RowButton } from "./ui";

type LocalServer = { port: number; title: string | null };
type BrowserAddMode = "selection" | "page";
type BrowserCapture = { text: string; title: string; url: string };
type BrowserPaneTab = {
  id: string;
  label: string;
  title: string;
  url: string | null;
  input: string;
};
type BrowserLink = { url: string; title: string; ts: number };
type BrowserSession = { tabs: BrowserPaneTab[]; activeTabId: string };
type BrowserSearchEngine = { name: string; template: string };
type BrowserVivaldiImport = {
  bookmarks: Array<{ title: string; url: string }>;
  search: BrowserSearchEngine | null;
};

const BOOKMARKS_KEY = "atelier-studio.browser.bookmarks";
const HISTORY_KEY = "atelier-studio.browser.history";
const SESSION_KEY = "atelier-studio.browser.session";
const SEARCH_KEY = "atelier-studio.browser.search";
const MAX_HISTORY = 80;

function readLinks(key: string): BrowserLink[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item): item is BrowserLink =>
        typeof item?.url === "string" &&
        typeof item?.title === "string" &&
        typeof item?.ts === "number")
      .slice(0, key === HISTORY_KEY ? MAX_HISTORY : 200);
  } catch {
    return [];
  }
}

function writeLinks(key: string, links: BrowserLink[]) {
  localStorage.setItem(key, JSON.stringify(links));
}

function readSearchEngine(): BrowserSearchEngine {
  try {
    const raw = JSON.parse(localStorage.getItem(SEARCH_KEY) ?? "{}");
    if (typeof raw?.name === "string" && typeof raw?.template === "string" && raw.template.includes("{searchTerms}")) {
      return { name: raw.name || "Search", template: raw.template };
    }
  } catch {}
  return { name: "Google", template: "https://www.google.com/search?q={searchTerms}" };
}

function writeSearchEngine(engine: BrowserSearchEngine) {
  localStorage.setItem(SEARCH_KEY, JSON.stringify(engine));
}

function makeBrowserLabel(id: string) {
  return `embedded-browser-${id.replace(/-/g, "")}`;
}

function makeBrowserTab(seed: Partial<BrowserPaneTab> = {}): BrowserPaneTab {
  const id = seed.id && /^[a-zA-Z0-9_-]{8,80}$/.test(seed.id) ? seed.id : crypto.randomUUID();
  return {
    id,
    label: seed.label && /^embedded-browser-[a-zA-Z0-9_-]{8,96}$/.test(seed.label)
      ? seed.label
      : makeBrowserLabel(id),
    title: seed.title || "New tab",
    url: seed.url || null,
    input: seed.input || seed.url || "",
  };
}

function readSession(): BrowserSession {
  try {
    const raw = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "{}");
    const savedTabs: unknown[] = Array.isArray(raw?.tabs) ? raw.tabs : [];
    const tabs = savedTabs
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => makeBrowserTab({
        id: typeof item.id === "string" ? item.id : undefined,
        label: typeof item.label === "string" ? item.label : undefined,
        title: typeof item.title === "string" ? item.title : undefined,
        url: typeof item.url === "string" && item.url ? item.url : null,
        input: typeof item.input === "string" ? item.input : undefined,
      }))
      .slice(0, 12);
    if (tabs.length === 0) {
      const tab = makeBrowserTab();
      return { tabs: [tab], activeTabId: tab.id };
    }
    const activeTabId = typeof raw?.activeTabId === "string" && tabs.some((tab: BrowserPaneTab) => tab.id === raw.activeTabId)
      ? raw.activeTabId
      : tabs[0].id;
    return { tabs, activeTabId };
  } catch {
    const tab = makeBrowserTab();
    return { tabs: [tab], activeTabId: tab.id };
  }
}

function writeSession(session: BrowserSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    tabs: session.tabs.map((tab) => ({
      id: tab.id,
      label: tab.label,
      title: tab.title,
      url: tab.url,
      input: tab.input,
    })),
    activeTabId: session.activeTabId,
  }));
}

// Navigateur NATIF : webview enfant Tauri superposée à la zone de contenu —
// aucune restriction X-Frame-Options (x.com, github, tout s'affiche).
export default function BrowserTab(p: {
  tabId: string;
  visible: boolean;
  onTitle: (title: string) => void;
}) {
  const initialSessionRef = useRef<BrowserSession | null>(null);
  if (initialSessionRef.current === null) initialSessionRef.current = readSession();
  const [tabs, setTabs] = useState<BrowserPaneTab[]>(() => initialSessionRef.current?.tabs ?? [makeBrowserTab()]);
  const [activeTabId, setActiveTabId] = useState(() => initialSessionRef.current?.activeTabId ?? tabs[0]?.id ?? "");
  const [bookmarks, setBookmarks] = useState<BrowserLink[]>(() => readLinks(BOOKMARKS_KEY));
  const [history, setHistory] = useState<BrowserLink[]>(() => readLinks(HISTORY_KEY));
  const [searchEngine, setSearchEngine] = useState<BrowserSearchEngine>(() => readSearchEngine());
  const [importNote, setImportNote] = useState("");
  const [servers, setServers] = useState<LocalServer[] | null>(null);
  // épinglage base de connaissances (plan 049 T2) : retour visuel bref
  const [kbFlash, setKbFlash] = useState<"ok" | "err" | null>(null);

  useEffect(() => {
    const onKbAdded = (e: Event) => {
      const detail = (e as CustomEvent).detail as { ok?: boolean } | undefined;
      setKbFlash(detail?.ok ? "ok" : "err");
    };
    window.addEventListener("kb-source-added", onKbAdded);
    return () => window.removeEventListener("kb-source-added", onKbAdded);
  }, []);

  useEffect(() => {
    if (!kbFlash) return;
    const timer = setTimeout(() => setKbFlash(null), 1600);
    return () => clearTimeout(timer);
  }, [kbFlash]);
  const scanned = useRef(false);
  const barRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef(tabs);
  const activeTabIdRef = useRef(activeTabId);
  // correction d'origine auto-calibrée : on demande une position, on relit la
  // position réelle, l'écart devient la correction (indépendant des conventions
  // de coordonnées Tauri/macOS)
  const corrRef = useRef({ x: 0, y: 0 });
  tabsRef.current = tabs;
  activeTabIdRef.current = activeTabId;
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

  async function calibrate(label: string, wanted: { x: number; y: number }) {
    try {
      const [ax] = await invoke<[number, number]>("browser_probe", { label });
      const dx = wanted.x - ax;
      // La coordonnée Y doit rester ancrée sous le chrome Browser React.
      // Selon la convention native macOS/Tauri, probe peut rapporter une origine
      // qui fait remonter la webview par-dessus les contrôles si on l'applique.
      const dy = 0;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        corrRef.current = { x: corrRef.current.x + dx, y: corrRef.current.y + dy };
        const r = rect();
        if (r) await invoke("browser_bounds", { label, ...r });
      }
    } catch {}
  }

  function scan() {
    if (!wsSend({ type: "scanLocal" })) setTimeout(scan, 700);
  }

  function rect() {
    const el = areaRef.current;
    const r = el?.getBoundingClientRect();
    if (!el || !r || r.width < 10) return null;
    const pane = el.closest(".pane-slot")?.getBoundingClientRect();
    const surfaces = el.closest(".pane-surfaces")?.getBoundingClientRect();
    const chrome = barRef.current?.getBoundingClientRect();
    const viewport = {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
    };
    const bounds = [r, pane, surfaces, viewport].filter(Boolean) as DOMRect[];
    const left = Math.max(...bounds.map((b) => b.left));
    const top = Math.max(...bounds.map((b) => b.top), chrome?.bottom ?? 0);
    const right = Math.min(...bounds.map((b) => b.right));
    const bottom = Math.min(...bounds.map((b) => b.bottom));
    const nativeYOffset = controlsRef.current?.getBoundingClientRect().height ?? 0;
    if (right - left < 10 || bottom - top - nativeYOffset < 10) return null;
    return {
      x: left + corrRef.current.x,
      y: top + nativeYOffset + corrRef.current.y,
      w: right - left,
      h: bottom - top - nativeYOffset,
    };
  }

  function syncBounds() {
    const r = rect();
    const active = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current);
    if (r && active?.url) invoke("browser_bounds", { label: active.label, ...r }).catch(() => {});
  }

  function showNativeTab(tab: BrowserPaneTab, forceNavigate = false) {
    if (!tab.url) return;
    const r0 = rect();
    if (!r0) return;
    const wanted = { x: r0.x, y: r0.y };
    const showFresh = () => {
      invoke("browser_show", { label: tab.label, url: tab.url, x: r0.x, y: r0.y, w: r0.w, h: r0.h })
        .then(() => setTimeout(() => calibrate(tab.label, wanted), 150))
        .catch(() => {});
    };
    if (forceNavigate) {
      showFresh();
      return;
    }
    invoke<string>("browser_url", { label: tab.label })
      .then((currentUrl) => {
        if (!currentUrl) {
          showFresh();
          return;
        }
        invoke("browser_show_again", { label: tab.label }).catch(() => {});
        invoke("browser_bounds", { label: tab.label, ...r0 }).catch(() => {});
      })
      .catch(showFresh);
  }

  function tabTitleFor(u: string) {
    try { return new URL(u).hostname || "browser"; } catch { return "browser"; }
  }

  function compactUrl(u: string) {
    try {
      const parsed = new URL(u);
      const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
      return `${parsed.hostname}${path}`;
    } catch {
      return u;
    }
  }

  function persistBookmarkLinks(next: BrowserLink[]) {
    setBookmarks(next);
    writeLinks(BOOKMARKS_KEY, next);
  }

  function rememberHistory(url: string, title: string) {
    const clean = url.trim();
    if (!clean) return;
    setHistory((current) => {
      const next = [
        { url: clean, title: title || tabTitleFor(clean), ts: Date.now() },
        ...current.filter((item) => item.url !== clean),
      ].slice(0, MAX_HISTORY);
      writeLinks(HISTORY_KEY, next);
      return next;
    });
  }

  function searchUrl(query: string) {
    const template = searchEngine.template.includes("{searchTerms}")
      ? searchEngine.template
      : "https://www.google.com/search?q={searchTerms}";
    return template.replace("{searchTerms}", encodeURIComponent(query));
  }

  function toggleBookmark() {
    if (!activeTab?.url) return;
    const existing = bookmarks.some((item) => item.url === activeTab.url);
    const next = existing
      ? bookmarks.filter((item) => item.url !== activeTab.url)
      : [{ url: activeTab.url, title: activeTab.title || tabTitleFor(activeTab.url), ts: Date.now() }, ...bookmarks];
    persistBookmarkLinks(next);
  }

  function updateTab(id: string, patch: Partial<BrowserPaneTab>) {
    setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, ...patch } : tab));
  }

  function navigate(raw: string, tabId = activeTabIdRef.current) {
    let u = raw.trim();
    if (!u) return;
    const tab = tabsRef.current.find((item) => item.id === tabId);
    if (!tab) return;
    if (!/^https?:\/\//.test(u)) {
      u = /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(u) || u.startsWith("localhost") || u.startsWith("127.")
        ? (u.startsWith("localhost") || u.startsWith("127.") ? "http://" : "https://") + u
        : searchUrl(u);
    }
    const title = tabTitleFor(u);
    setActiveTabId(tabId);
    updateTab(tabId, { url: u, input: u, title });
    rememberHistory(u, title);
    showNativeTab({ ...tab, url: u, input: u, title }, true);
    p.onTitle(title);
  }

  async function addCurrentPageToChat() {
    if (!activeTab) return;
    const capture = await invoke<BrowserCapture>("browser_capture_selection", { label: activeTab.label }).catch(async () => ({
      text: "",
      title: "",
      url: await invoke<string>("browser_url", { label: activeTab.label }).catch(() => activeTab.url ?? ""),
    }));
    const selected = capture.text.trim();
    const currentUrl = capture.url || activeTab.url || "";
    const mode: BrowserAddMode = selected ? "selection" : "page";
    const text = selected || [
      "Page web ajoutée au contexte.",
      capture.title ? `Titre: ${capture.title}` : "",
      currentUrl ? `URL: ${currentUrl}` : "",
    ].filter(Boolean).join("\n");
    if (!text) return;
    window.dispatchEvent(new CustomEvent("browser-add-to-chat", {
      detail: { text, url: currentUrl, mode },
    }));
  }

  async function addCurrentPageToKb() {
    if (!activeTab?.url) return;
    const grab = (maxChars: number) =>
      invoke<BrowserCapture>("browser_capture_page", { label: activeTab.label, maxChars })
        .catch(() => null);
    // Canal titre : 100k d'abord ; WebKit refuse silencieusement les titres
    // très longs → retente à 24k (couvre les pages derrière un login).
    let capture = await grab(100000);
    if (!capture?.text?.trim()) capture = await grab(24000);
    const url = capture?.url || activeTab.url || "";
    if (!url) {
      setKbFlash("err");
      return;
    }
    const text = capture?.text?.trim() ?? "";
    // Texte capturé transmis tel quel (pas de re-fetch : login possible) ;
    // sans texte, le backend re-télécharge la page (publique). Réponse
    // kbAdded/kbError relayée par App en événement "kb-source-added".
    const sent = wsSend({
      type: "kbAdd",
      kind: "web",
      origin: url,
      title: capture?.title || activeTab.title || "",
      ...(text ? { text } : {}),
    });
    if (!sent) setKbFlash("err");
  }

  function newTab() {
    const tab = makeBrowserTab();
    setTabs((current) => [...current, tab]);
    setActiveTabId(tab.id);
    scan();
  }

  function closeTab(id: string) {
    const tab = tabsRef.current.find((item) => item.id === id);
    if (tab?.url) invoke("browser_close", { label: tab.label }).catch(() => {});
    setTabs((current) => {
      if (current.length === 1) {
        const fresh = makeBrowserTab();
        setActiveTabId(fresh.id);
        return [fresh];
      }
      const idx = current.findIndex((item) => item.id === id);
      const next = current.filter((item) => item.id !== id);
      if (id === activeTabIdRef.current) {
        const fallback = next[Math.max(0, idx - 1)] ?? next[0];
        setActiveTabId(fallback.id);
      }
      return next;
    });
  }

  async function importFromVivaldi() {
    setImportNote(t("browser.vivaldi-importing"));
    const result = await invoke<BrowserVivaldiImport>("browser_import_vivaldi").catch((error) => {
      setImportNote(String(error || t("browser.vivaldi-import-failed")));
      return null;
    });
    if (!result) return;
    const imported = result.bookmarks
      .filter((item) => item.url && /^https?:\/\//.test(item.url))
      .map((item) => ({
        url: item.url,
        title: item.title || tabTitleFor(item.url),
        ts: Date.now(),
      }));
    const seen = new Set<string>();
    const next = [...imported, ...bookmarks]
      .filter((item) => {
        if (seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
      })
      .slice(0, 200);
    persistBookmarkLinks(next);
    if (result.search?.template) {
      setSearchEngine(result.search);
      writeSearchEngine(result.search);
    }
    setImportNote(t("browser.vivaldi-imported", { count: String(imported.length), search: result.search?.name ?? searchEngine.name }));
  }

  // visibilité : montrer/cacher la webview native avec la surface
  useEffect(() => {
    for (const tab of tabsRef.current) {
      if (!tab.url) continue;
      if (p.visible && tab.id === activeTabIdRef.current) {
        setTimeout(() => showNativeTab(tab), 30);
      } else {
        invoke("browser_hide", { label: tab.label }).catch(() => {});
      }
    }
    const active = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current);
    p.onTitle(active?.title || "browser");
  }, [p.visible, activeTabId, tabs.length]);

  useEffect(() => {
    writeSession({ tabs, activeTabId });
  }, [tabs, activeTabId]);

  // suivre la taille du pane
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const pane = el.closest(".pane-slot");
    const surfaces = el.closest(".pane-surfaces");
    const ro = new ResizeObserver(() => syncBounds());
    ro.observe(el);
    if (barRef.current) ro.observe(barRef.current);
    if (pane) ro.observe(pane);
    if (surfaces) ro.observe(surfaces);
    window.addEventListener("resize", syncBounds);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncBounds);
    };
  }, []);

  // synchroniser l'URL (navigation interne à la webview)
  useEffect(() => {
    const t = setInterval(async () => {
      const active = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current);
      if (!p.visible || !active?.url) return;
      try {
        const u = await invoke<string>("browser_url", { label: active.label });
        if (u && u !== active.url) {
          const title = tabTitleFor(u);
          updateTab(active.id, { url: u, input: u, title });
          rememberHistory(u, title);
          p.onTitle(title);
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

  useEffect(() => () => {
    for (const tab of tabsRef.current) {
      if (tab.url) invoke("browser_hide", { label: tab.label }).catch(() => {});
    }
  }, []);

  return (
    <div className="browser-tab" style={{ display: p.visible ? "flex" : "none" }}>
      <div className="browser-chrome" ref={barRef}>
        <div className="browser-tabs" role="tablist" aria-label="Browser tabs">
          {tabs.map((tab) => (
            <RowButton
              key={tab.id}
              className={`browser-mini-tab ${tab.id === activeTabId ? "on" : ""}`}
              role="tab"
              aria-selected={tab.id === activeTabId}
              onClick={() => setActiveTabId(tab.id)}
              title={tab.url ?? tab.title}
            >
              <span className="browser-mini-title">{tab.title}</span>
              <span
                className="browser-mini-close"
                role="button"
                aria-label={t("action.close-tab")}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                <CloseIcon />
              </span>
            </RowButton>
          ))}
          <IconButton size="s" className="browser-tab-add" onClick={newTab} title={t("action.new-tab")} label={t("action.new-tab")}>+</IconButton>
        </div>
        <div className="browser-bar" ref={controlsRef}>
          <IconButton size="s" className="ghost" label={t("browser.back")} onClick={() => invoke("browser_eval", { label: activeTab?.label, js: "history.back()" })} title={t("browser.back")}>←</IconButton>
          <IconButton size="s" className="ghost" label={t("browser.forward")} onClick={() => invoke("browser_eval", { label: activeTab?.label, js: "history.forward()" })} title={t("browser.forward")}>→</IconButton>
          <IconButton size="s" className="ghost" label={t("action.reload")} onClick={() => invoke("browser_eval", { label: activeTab?.label, js: "location.reload()" })} title={t("action.reload")}>
            <RefreshIcon />
          </IconButton>
          <IconButton
            size="s"
            label={t("action.search-web-add")}
            className="ghost"
            title={t("action.search-web-add")}
            onClick={() => { void addCurrentPageToChat(); }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M14 8c0 3-2.7 5.2-6 5.2-.8 0-1.6-.1-2.3-.4L2.5 14l1-2.6C2.6 10.5 2 9.3 2 8c0-3 2.7-5.2 6-5.2S14 5 14 8z" />
            </svg>
          </IconButton>
          <IconButton
            size="s"
            className={`ghost ${kbFlash === "ok" ? "on" : ""}${kbFlash === "err" ? " kb-flash-err" : ""}`}
            label={t("browser.add-kb")}
            disabled={!activeTab?.url}
            title={kbFlash === "ok" ? t("browser.added-kb") : kbFlash === "err" ? t("browser.add-kb-error") : t("browser.add-kb")}
            onClick={() => { void addCurrentPageToKb(); }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M3.2 12.9V4.1c0-.9.7-1.6 1.6-1.6h8v9.4H4.8c-.9 0-1.6.7-1.6 1s.7 1.6 1.6 1.6h8v-2.6" />
              <path d="M6.8 6.4h3.4M8.5 4.7v3.4" />
            </svg>
          </IconButton>
          <IconButton
            size="s"
            label={activeTab?.url && bookmarks.some((item) => item.url === activeTab.url) ? t("browser.bookmarked") : t("browser.bookmark")}
            className={`ghost ${activeTab?.url && bookmarks.some((item) => item.url === activeTab.url) ? "on" : ""}`}
            disabled={!activeTab?.url}
            title={activeTab?.url && bookmarks.some((item) => item.url === activeTab.url) ? t("browser.bookmarked") : t("browser.bookmark")}
            onClick={toggleBookmark}
          >
            {activeTab?.url && bookmarks.some((item) => item.url === activeTab.url) ? "★" : "☆"}
          </IconButton>
          <Input
            className="browser-url"
            placeholder={t("browser.placeholder")}
            value={activeTab?.input ?? ""}
            onChange={(e) => activeTab && updateTab(activeTab.id, { input: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && activeTab) navigate(e.currentTarget.value, activeTab.id);
            }}
            onFocus={(e) => e.target.select()}
          />
          {activeTab?.url && (
            <IconButton size="s" className="ghost" label={t("browser.close-home")} title={t("browser.close-home")}
              onClick={() => {
                invoke("browser_hide", { label: activeTab.label }).catch(() => {});
                updateTab(activeTab.id, { url: null, input: "", title: "New tab" });
                scan();
              }}><CloseIcon /></IconButton>
          )}
        </div>
      </div>
      <div className="browser-body" ref={areaRef}>
        {!activeTab?.url && (
          <div className="browser-home">
            <div className="browser-home-command">
              <Input
                className="browser-home-search"
                placeholder={t("browser.placeholder")}
                value={activeTab?.input ?? ""}
                onChange={(e) => activeTab && updateTab(activeTab.id, { input: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && activeTab) navigate(e.currentTarget.value, activeTab.id);
                }}
                autoComplete="off"
              />
              <div className="browser-home-hint">{t("browser.home-muted")}</div>
            </div>

            <div className="browser-home-grid">
              <section className="browser-hub-section">
                <div className="browser-hub-head">
                  <span className="browser-hub-title">{t("browser.bookmarks")}</span>
                  <span className="browser-hub-actions">
                    <Button variant="ghost" className="browser-hub-text-btn" onClick={importFromVivaldi}>{t("browser.import-vivaldi")}</Button>
                    <span className="browser-hub-count">{bookmarks.length}</span>
                  </span>
                </div>
                <div className="browser-hub-list">
                  {importNote && <div className="browser-hub-note">{importNote}</div>}
                  {bookmarks.length === 0 && <div className="browser-hub-empty">{t("browser.no-bookmarks")}</div>}
                  {bookmarks.slice(0, 8).map((item) => (
                    <RowButton key={item.url} className="browser-hub-item" onClick={() => activeTab && navigate(item.url, activeTab.id)}>
                      <span className="browser-hub-status bookmark" />
                      <span className="browser-hub-item-main">
                        <span className="browser-hub-item-title">{item.title || tabTitleFor(item.url)}</span>
                        <span className="browser-hub-item-sub">{compactUrl(item.url)}</span>
                      </span>
                    </RowButton>
                  ))}
                </div>
              </section>

              <section className="browser-hub-section">
                <div className="browser-hub-head">
                  <span className="browser-hub-title">{t("browser.recent")}</span>
                  <span className="browser-hub-count">{history.length}</span>
                </div>
                <div className="browser-hub-list">
                  {history.length === 0 && <div className="browser-hub-empty">{t("browser.no-history")}</div>}
                  {history.slice(0, 8).map((item) => (
                    <RowButton key={item.url} className="browser-hub-item" onClick={() => activeTab && navigate(item.url, activeTab.id)}>
                      <span className="browser-hub-status recent" />
                      <span className="browser-hub-item-main">
                        <span className="browser-hub-item-title">{item.title || tabTitleFor(item.url)}</span>
                        <span className="browser-hub-item-sub">{compactUrl(item.url)}</span>
                      </span>
                    </RowButton>
                  ))}
                </div>
              </section>

              <section className="browser-hub-section">
                <div className="browser-hub-head">
                  <span className="browser-hub-title">{t("browser.local")}</span>
                  <IconButton className="ghost browser-hub-refresh" label={t("action.rescan")} title={t("action.rescan")} onClick={scan}>
                    <RefreshIcon />
                  </IconButton>
                </div>
                <div className="browser-hub-list">
                  {servers === null && <div className="browser-hub-empty">{t("browser.scanning")}</div>}
                  {servers?.length === 0 && <div className="browser-hub-empty">{t("browser.empty")}</div>}
                  {servers?.map((s) => (
                    <RowButton key={s.port} className="browser-hub-item" onClick={() => activeTab && navigate(`http://localhost:${s.port}`, activeTab.id)}>
                      <span className="browser-hub-status local" />
                      <span className="browser-hub-item-main">
                        <span className="browser-hub-item-title">{s.title || `localhost:${s.port}`}</span>
                        <span className="browser-hub-item-sub">localhost:{s.port}</span>
                      </span>
                    </RowButton>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
