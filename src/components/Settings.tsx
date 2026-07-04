import { useEffect, useState } from "react";
import { Settings as S, DEFAULT_SETTINGS } from "../lib/settings";

const SECTIONS = [
  { id: "general", label: "Général" },
  { id: "apparence", label: "Apparence" },
  { id: "atelier", label: "Atelier" },
  { id: "providers", label: "Providers" },
  { id: "avance", label: "Avancé" },
];

const CLAUDE_MODELS = [
  { id: "", label: "Défaut CLI" },
  { id: "claude-fable-5", label: "Fable 5" },
  { id: "claude-opus-4-8", label: "Opus 4.8" },
  { id: "claude-sonnet-5", label: "Sonnet 5" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
];
const CODEX_MODELS = [
  { id: "", label: "Défaut CLI" },
  { id: "gpt-5.2-codex", label: "GPT-5.2 Codex" },
  { id: "gpt-5.2", label: "GPT-5.2" },
  { id: "gpt-5.1-codex-mini", label: "Codex mini" },
];

function Row(p: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-row-txt">
        <div className="set-row-title">{p.title}</div>
        {p.desc && <div className="set-row-desc">{p.desc}</div>}
      </div>
      <div className="set-row-ctl">{p.children}</div>
    </div>
  );
}

export default function SettingsPage(p: {
  settings: S;
  onChange: (s: S) => void;
  onClose: () => void;
  ws: WebSocket | null;
}) {
  const [section, setSection] = useState("general");
  const [status, setStatus] = useState<{ port: number | null; pastedCount: number; pasteDir: string } | null>(null);
  const [provs, setProvs] = useState<{ id: string; label: string; version: string | null; ok: boolean }[] | null>(null);
  const s = p.settings;
  const set = (patch: Partial<S>) => p.onChange({ ...s, ...patch });

  useEffect(() => {
    if (!p.ws || p.ws.readyState !== 1) return;
    const onMsg = (e: MessageEvent) => {
      const m = JSON.parse(e.data);
      if (m.type === "status") setStatus(m);
      if (m.type === "providerStatus") setProvs(m.providers);
      if (m.type === "pastedCleared") {
        p.ws!.send(JSON.stringify({ type: "status" }));
      }
    };
    p.ws.addEventListener("message", onMsg);
    p.ws.send(JSON.stringify({ type: "status" }));
    p.ws.send(JSON.stringify({ type: "providerStatus" }));
    return () => p.ws?.removeEventListener("message", onMsg);
  }, [p.ws]);

  return (
    <div className="settings-page">
      <div className="set-nav">
        <button className="set-back" onClick={p.onClose}>
          ← Retour à l'app
        </button>
        {SECTIONS.map((sec) => (
          <button
            key={sec.id}
            className={`set-nav-item ${section === sec.id ? "on" : ""}`}
            onClick={() => setSection(sec.id)}
          >
            {sec.label}
          </button>
        ))}
        <span className="flex" />
        <button className="set-restore" onClick={() => p.onChange({ ...DEFAULT_SETTINGS })}>
          Restaurer les défauts
        </button>
      </div>
      <div className="set-body">
        {section === "general" && (
          <>
            <h1>Général</h1>
            <p className="set-sub">Provider, modèle et permissions par défaut des nouveaux messages.</p>
            <Row title="Provider par défaut" desc="Utilisé pour les nouveaux chats.">
              <select value={s.defaultProvider} onChange={(e) => set({ defaultProvider: e.target.value as any })}>
                <option value="claude">Claude</option>
                <option value="codex">Codex</option>
              </select>
            </Row>
            <Row title="Modèle Claude par défaut">
              <select value={s.defaultModel.claude}
                onChange={(e) => set({ defaultModel: { ...s.defaultModel, claude: e.target.value } })}>
                {CLAUDE_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </Row>
            <Row title="Modèle Codex par défaut">
              <select value={s.defaultModel.codex}
                onChange={(e) => set({ defaultModel: { ...s.defaultModel, codex: e.target.value } })}>
                {CODEX_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </Row>
            <Row title="Effort Claude par défaut">
              <select value={s.defaultEffort.claude}
                onChange={(e) => set({ defaultEffort: { ...s.defaultEffort, claude: e.target.value } })}>
                {["", "low", "medium", "high", "xhigh", "max"].map((l) => (
                  <option key={l} value={l}>{l === "" ? "auto" : l}</option>
                ))}
              </select>
            </Row>
            <Row title="Mode de permission par défaut" desc="Full access = aucun prompt d'approbation.">
              <select value={s.defaultPermissionMode} onChange={(e) => set({ defaultPermissionMode: e.target.value })}>
                <option value="bypassPermissions">Full access</option>
                <option value="acceptEdits">Accept edits</option>
                <option value="default">Ask (default)</option>
                <option value="plan">Plan mode</option>
              </select>
            </Row>
            <Row title="Ordre des chats" desc="Dans la sidebar, sous chaque projet.">
              <select value={s.threadOrder} onChange={(e) => set({ threadOrder: e.target.value as any })}>
                <option value="recent">Récents d'abord</option>
                <option value="manual">Ordre de création</option>
              </select>
            </Row>
          </>
        )}
        {section === "apparence" && (
          <>
            <h1>Apparence</h1>
            <p className="set-sub">Typographie et mise en page du chat.</p>
            <Row title="Taille du texte du chat">
              <input type="range" min={12} max={19} step={0.5} value={s.chatFontSize}
                onChange={(e) => set({ chatFontSize: Number(e.target.value) })} />
              <span className="set-val">{s.chatFontSize}px</span>
            </Row>
            <Row title="Largeur de la colonne de lecture">
              <input type="range" min={560} max={1100} step={20} value={s.chatWidth}
                onChange={(e) => set({ chatWidth: Number(e.target.value) })} />
              <span className="set-val">{s.chatWidth}px</span>
            </Row>
            <Row title="Interligne">
              <input type="range" min={1.4} max={2.0} step={0.05} value={s.chatLineHeight}
                onChange={(e) => set({ chatLineHeight: Number(e.target.value) })} />
              <span className="set-val">{s.chatLineHeight.toFixed(2)}</span>
            </Row>
          </>
        )}
        {section === "atelier" && (
          <>
            <h1>Atelier</h1>
            <p className="set-sub">Intégration de la galerie cmux-gallery.</p>
            <Row title="Dossier cmux-gallery" desc="Doit contenir cmux_gallery.py. Prend effet au prochain démarrage de serveur.">
              <input className="set-text" value={s.galleryPath}
                onChange={(e) => set({ galleryPath: e.target.value })} />
            </Row>
            <Row title="Rechargement auto" desc="Recharger le panneau atelier quand un agent termine (figures régénérées).">
              <input type="checkbox" checked={s.autoRefreshAtelier}
                onChange={(e) => set({ autoRefreshAtelier: e.target.checked })} />
            </Row>
          </>
        )}
        {section === "providers" && (
          <>
            <h1>Providers</h1>
            <p className="set-sub">CLIs détectés sur cette machine (les sessions utilisent tes logins existants).</p>
            {provs === null && <div className="set-row-desc">Vérification…</div>}
            {provs?.map((pr) => (
              <Row key={pr.id} title={pr.label} desc={pr.ok ? pr.version ?? "" : "introuvable sur le PATH"}>
                <span className={`set-badge ${pr.ok ? "ok" : "ko"}`}>{pr.ok ? "détecté" : "absent"}</span>
              </Row>
            ))}
          </>
        )}
        {section === "avance" && (
          <>
            <h1>Avancé</h1>
            <p className="set-sub">Diagnostic et maintenance.</p>
            <Row title="Sidecar" desc={status ? `WebSocket sur le port ${status.port}` : "…"}>
              <span className={`set-badge ${p.ws?.readyState === 1 ? "ok" : "ko"}`}>
                {p.ws?.readyState === 1 ? "connecté" : "déconnecté"}
              </span>
            </Row>
            <Row title="Images collées" desc={status ? `${status.pastedCount} fichier(s) — ${status.pasteDir}` : "…"}>
              <button className="set-btn"
                onClick={() => p.ws?.readyState === 1 && p.ws.send(JSON.stringify({ type: "clearPasted" }))}>
                Vider
              </button>
            </Row>
          </>
        )}
      </div>
    </div>
  );
}
