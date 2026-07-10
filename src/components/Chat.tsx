import React, { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { AgentEvent } from "../lib/ws";
import { wsSend } from "../lib/wsBus";
import { eventLabel, t } from "../lib/i18n";
import { buildHighlightContext } from "../lib/highlightContext";
import type { HighlightEntry } from "./Rail";
import { CloseIcon } from "./icons";
import { ProviderInfo } from "../lib/providers";
import { ToolOutputLine, isSummarizableTool, Tick } from "./chat/toolPresentation";
import { ChatTimeline } from "./chat/ChatTimeline";
import { ChatHeader } from "./chat/ChatHeader";
import type { ResearchHomeBundle } from "./ResearchHome";
import { ChatComposer } from "./chat/ChatComposer";
import { mentionLabel } from "./chat/mentions";



// Libellés lisibles par id — PAS une liste de modèles (plan 025, step 9) :
// les ids offerts viennent UNIQUEMENT du catalogue sidecar (info.models).
// Un id sans entrée ici s'affiche tel quel.
const BUILTIN_MODEL_LABELS: Record<string, Record<string, string>> = {
  claude: {
    "claude-fable-5": "Fable 5",
    "claude-opus-4-8": "Opus 4.8",
    "claude-sonnet-5": "Sonnet 5",
    "claude-haiku-4-5-20251001": "Haiku 4.5",
  },
  grok: {
    "grok-4.5": "Grok 4.5",
    "grok-composer-2.5-fast": "Composer 2.5 Fast",
  },
  codex: {
    "gpt-5.6-sol": "GPT-5.6 Sol",
    "gpt-5.6-terra": "GPT-5.6 Terra",
    "gpt-5.6-luna": "GPT-5.6 Luna",
    "gpt-5.5": "GPT-5.5",
    "gpt-5.1-codex-max": "GPT-5.1 Codex Max",
    "gpt-5.1-codex": "GPT-5.1 Codex",
  },
};

// Cas particulier documenté (plan 025, step 9) : le harnais Grok n'a PAS
// d'effort « Auto » ("") — il exige un effort explicite (défaut "high" dans
// DEFAULT_SETTINGS) et son catalogue liste déjà minimal…max au complet. Le
// registry sidecar n'expose pas (encore) de donnée « effort par défaut vide »,
// donc la nuance reste keyed par id de provider ici.
const NO_AUTO_EFFORT = new Set(["grok"]);
const API_REASONING_LEVELS = ["", "none", "minimal", "low", "medium", "high", "xhigh", "max"];

// réf. fichier type "main.tex:31", "sections/method.tex:60-74", "script.py"
type Suggestion = {
  insert: string;
  label: string;
  hint?: string;
  section?: string;
  icon?: string;
  keep?: boolean;
  attachPath?: string;
  attachFolder?: string;
  attachZoteroKey?: string;
};

type ChatAttachment = {
  name: string;
  lines: string | null;
  text: string;
  imageUrl?: string;
  path?: string;
  kind?: "file" | "folder" | "zotero" | "quote" | "paste";
  preview?: { title: string; rows: { label: string; value: string }[] };
};

type ChatZoteroItem = {
  key: string;
  title: string;
  creators?: string;
  year?: string;
  citeKey?: string;
  publication?: string;
  doi?: string;
  hasPdf?: boolean;
  pdfFile?: string | null;
};


// ---- résumés d'outils façon Codex : « Recherche de code, commande exécutée » ----
// « permission » = bruit (demandes d'autorisation Grok) : absorbé, hors phrase

// `Chat` reste le composant PUBLIC (ChatWorkspace) : point d'entrée stable
// importé par App. Il ne rend plus la timeline directement — il détient l'état
// de la conversation et assemble <ChatTimeline> (affichage des tours) et
// <ChatComposer> (saisie). Décision plan 015 (correction 3) : garder le nom
// `Chat` pour ne pas toucher les imports d'App, tout en clarifiant le rôle.
export default function Chat(p: {
  events: AgentEvent[];
  /** Research Home (plan 017) — rendu par la timeline quand threadId est null */
  home?: ResearchHomeBundle | null;
  workingSince: number | null;
  commands: { name: string; source: string }[];
  files: string[];
  recentFiles: string[];
  zoteroItems: ChatZoteroItem[];
  injectText: string | null;
  onInjected: () => void;
  attachments: ChatAttachment[];
  onRemoveAttachment: (index: number) => void;
  onQuote: (text: string) => void;
  threadId: string | null;
  onPasteImage: (dataURL: string) => void;
  onPasteText: (text: string) => void;
  onStop: () => void;
  onAttachPath?: (path: string) => void;
  onAttachFolder?: (folder: string) => void;
  onAttachZotero?: (key: string) => void;
  layout: "split" | "chat" | "atelier";
  onToggleExpand: () => void;
  usage: { context: number; output: number; cost: number | null; turns: number | null; window?: number | null } | null;
  onRevert: (index: number, text: string, edit: boolean) => void;
  onFork: (index: number) => void;
  onEditSend: (index: number, oldText: string, newText: string) => void;
  onNewChat: () => void;
  onOpenProject: () => void;
  projectRoot?: string | null;
  /** nom d'affichage du projet (projMeta) — eyebrow de l'en-tête local */
  projectName?: string | null;
  threadTitle?: string;
  threadProvider?: string;
  highlights: HighlightEntry[];
  defaults: {
    defaultProvider: string;
    defaultModel: Record<string, string>;
    defaultEffort: Record<string, string>;
    defaultPermissionMode: string;
    timeFormat?: "system" | "24h" | "12h";
    customModels?: { provider: string; id: string }[];
    modelEfforts?: Record<string, string>;
    autoReview?: { enabled: boolean };
    providerOrder?: string[];
    hiddenProviders?: string[];
  };
  providers?: ProviderInfo[];
  pins: { index: number; label: string; color?: string; style?: string }[];
  onStylePin: (index: number, patch: { color?: string; style?: string; label?: string }) => void;
  onTogglePin: (index: number, label: string) => void;
  disabled: boolean;
  onGoal?: (action: "set" | "clear", objective?: string, status?: "active" | "paused") => void;
  onSubmit: (
    prompt: string,
    provider: string,
    model: string,
    effort: string,
    permissionMode: string,
    mode: "steer" | "queue",
  ) => void;
}) {
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  // resync la hauteur quand le texte change autrement que par frappe
  // (suggestion appliquée, envoi qui vide la boîte…)
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    // champ vide : hauteur CSS fixe, sans mesure — sous WebKit le placeholder
    // compte dans scrollHeight et gonfle la boîte au montage (largeur pas prête)
    if (text === "") {
      ta.style.height = "";
      ta.style.overflowY = "";
      return;
    }
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 220) + "px";
    // au plafond 220px : réactiver le scroll (le CSS le cache pour éviter la
    // scrollbar fantôme due à l'arrondi WebKit d'1px)
    ta.style.overflowY = ta.scrollHeight > 220 ? "auto" : "";
  }, [text]);
  const [provider, setProvider] = useState<string>("claude");
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  const [permissionMode, setPermissionMode] = useState("bypassPermissions");

  function providerInfo(pv = provider) {
    return (p.providers ?? []).find((pr) => pr.id === pv);
  }

  function resolvedModelId(pv = provider, modelId = model) {
    return modelId || providerInfo(pv)?.defaultModel || "";
  }

  function autoReasoningLabel(info: ProviderInfo | undefined, modelId: string) {
    const meta = info?.modelReasoning?.[modelId];
    const d = meta?.default_effort && meta.default_effort !== "none" ? meta.default_effort : "";
    return d ? `Auto (${d})` : t("common.auto-default");
  }

  function levelsFor(pv: string, modelId: string) {
    const info = providerInfo(pv);
    if (info?.kind !== "api") {
      // Catalogue sidecar = source des efforts. "" (Auto — le CLI décide)
      // en tête, sauf providers sans Auto (NO_AUTO_EFFORT). Catalogue pas
      // encore chargé : [""] dégradé (Auto seul), comme avant pour les
      // providers hors liste.
      const efforts = info?.efforts ?? [];
      if (NO_AUTO_EFFORT.has(pv) && efforts.length) return [...efforts];
      return ["", ...efforts];
    }
    const meta = info.modelReasoning?.[modelId];
    const supported = Array.isArray(meta?.supported_efforts) && meta.supported_efforts.length
      ? meta.supported_efforts.filter((lvl) => API_REASONING_LEVELS.includes(lvl))
      : API_REASONING_LEVELS.slice(2);
    return ["", ...(meta?.mandatory ? [] : ["none"]), ...supported.filter((lvl) => lvl !== "none")];
  }

  function effortFor(pv: string, modelId: string): string {
    return (
      p.defaults.modelEfforts?.[pv + ":" + modelId] ??
      p.defaults.defaultEffort[pv] ??
      ""
    );
  }

  // appliquer la sélection mémorisée du projet, sinon les défauts des réglages
  // (le choix de modèle survit ainsi aux changements de projet — il était
  // réinitialisé aux défauts à chaque remontage du composant)
  const modelSelKey = (root: string) => "atelier-studio.modelSel:" + root;
  // projet dont la sélection affichée provient — évite qu'au changement de
  // projet, l'effet de sauvegarde écrive l'ancienne sélection sous la
  // nouvelle clé (les states ne sont restaurés qu'au rendu suivant)
  const selRootRef = useRef<string | null>(null);
  useEffect(() => {
    let saved: { provider?: string; model?: string; effort?: string; permissionMode?: string } | null = null;
    if (p.projectRoot) {
      try { saved = JSON.parse(localStorage.getItem(modelSelKey(p.projectRoot)) ?? "null"); } catch { saved = null; }
    }
    const pv = saved?.provider || p.defaults.defaultProvider;
    const m = saved?.model ?? (p.defaults.defaultModel[pv] ?? "");
    setProvider(pv);
    setModel(m);
    setEffort(saved?.effort ?? effortFor(pv, m));
    setPermissionMode(saved?.permissionMode || p.defaults.defaultPermissionMode);
    selRootRef.current = p.projectRoot ?? null;
  }, [p.defaults, p.projectRoot]);
  // mémoriser la sélection courante pour ce projet (clé = projet restauré,
  // volontairement absent des deps : voir selRootRef ci-dessus)
  useEffect(() => {
    const root = selRootRef.current;
    if (!root) return;
    try {
      localStorage.setItem(modelSelKey(root), JSON.stringify({ provider, model, effort, permissionMode }));
    } catch {}
  }, [provider, model, effort, permissionMode]);
  const [selIdx, setSelIdx] = useState(0);
  const [quote, setQuote] = useState<{ x: number; y: number; text: string } | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [review, setReview] = useState<{ status: string; verdict?: string; model?: string; checks?: number; issues?: { claim: string; problem: string; severity: string; fix?: string }[]; checkedTools?: string[]; checkedFiles?: string[] } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [barOpen, setBarOpen] = useState(false);
  const [pasteView, setPasteView] = useState<{ name: string; text: string } | null>(null);
  const [pasteCopied, setPasteCopied] = useState(false);
  useEffect(() => {
    if (!pasteView) return;
    setPasteCopied(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPasteView(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pasteView]);
  const [fixing, setFixing] = useState(false);
  const [reviewMin, setReviewMin] = useState(false);
  useEffect(() => { setBarOpen(false); setFixing(false); setReviewMin(false); stickRef.current = true; }, [p.threadId]);
  useEffect(() => setReview(null), [p.threadId]);
  useEffect(() => {
    const onReview = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      if (msg.threadId === p.threadId) {
        setReview(msg);
        if (msg.status === "done") setFixing(false);
      }
    };
    window.addEventListener("review-result", onReview);
    return () => window.removeEventListener("review-result", onReview);
  }, [p.threadId]);
  const [tickPos, setTickPos] = useState<Record<number, number>>({});

  function resolvePinEl(index: number, label?: string, anchor?: string): HTMLElement | null {
    let el = document.getElementById(`msg-${index}`);
    const key = anchor || label;
    if (!el && key) {
      const needle = key.slice(0, 30).toLowerCase();
      el = ([...document.querySelectorAll(".user-wrap, .msg-wrap")].find((n) =>
        (n.textContent ?? "").toLowerCase().includes(needle)
      ) as HTMLElement) ?? null;
    }
    return el;
  }

  // ordre chronologique réel (position du message), affichage groupé en haut
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const pos: Record<number, number> = {};
      for (const pin of p.pins) {
        const el = resolvePinEl(pin.index, pin.label, (pin as any).anchor);
        if (el) pos[pin.index] = el.offsetTop;
      }
      setTickPos(pos);
    });
    return () => cancelAnimationFrame(id);
  }, [p.pins, p.events.length, p.threadId]);
  const [pinMenu, setPinMenu] = useState<{ index: number; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!pinMenu) return;
    const close = () => setPinMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [pinMenu]);

  // ---- marques persistantes (Highlight / Underline) sur les réponses ----
  type Mark = { text: string; kind: "hl" | "ul" };
  const [marks, setMarks] = useState<Mark[]>([]);
  const messagesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!p.threadId) { setMarks([]); return; }
    try {
      setMarks(JSON.parse(localStorage.getItem("atelier-studio.marks." + p.threadId) ?? "[]"));
    } catch { setMarks([]); }
  }, [p.threadId]);
  function saveMarks(next: Mark[]) {
    setMarks(next);
    if (p.threadId) localStorage.setItem("atelier-studio.marks." + p.threadId, JSON.stringify(next));
  }
  // texte du message (user ou agent) qui contient le passage — sert à
  // photographier le contexte ~280 caractères de la fiche durable
  function findEventTextContaining(needle: string): string {
    for (const e of p.events) {
      if ((e.kind === "user" || e.kind === "text") && e.text?.includes(needle)) return e.text;
    }
    return "";
  }
  // création : mark local (rendu in-chat, inchangé) + fiche durable envoyée
  // au sidecar avec le contexte photographié à l'instant du clic (spec §2)
  function addMark(text: string, kind: "hl" | "ul") {
    const txt = text.trim();
    if (!txt) return;
    saveMarks([...marks, { text: txt, kind }]);
    wsSend({
      type: "addHighlight",
      highlight: {
        text: txt,
        context: buildHighlightContext(findEventTextContaining(txt), txt),
        kind,
        projectRoot: p.projectRoot ?? "",
        projectName: (p.projectRoot ?? "").split("/").filter(Boolean).pop() ?? "",
        threadId: p.threadId ?? "",
        threadTitle: p.threadTitle ?? "",
        provider: p.threadProvider ?? "",
      },
    });
  }
  // retrait EXPLICITE (action nommée dans le popover, jamais silencieux) :
  // retire le mark local ET la fiche correspondante (match threadId+text+kind)
  function removeMark(text: string, kind: "hl" | "ul") {
    const txt = text.trim();
    if (!txt) return;
    saveMarks(marks.filter((m) => !(m.text === txt && m.kind === kind)));
    const match = p.highlights.find((h) => h.threadId === p.threadId && h.text === txt && h.kind === kind);
    if (match) wsSend({ type: "removeHighlight", id: match.id });
  }
  // applique les marques via la CSS Custom Highlight API (aucune chirurgie DOM)
  useEffect(() => {
    const H = (window as any).Highlight;
    const reg = (CSS as any).highlights;
    if (!H || !reg || !messagesRef.current) return;
    const find = (needle: string): Range[] => {
      const out: Range[] = [];
      const root = messagesRef.current!;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      // concatène les nœuds texte par message pour retrouver le passage même s'il
      // traverse du gras/des liens : on cherche nœud par nœud (couvre la majorité)
      let n: Node | null;
      while ((n = walker.nextNode())) {
        const idx = (n.textContent ?? "").indexOf(needle);
        if (idx >= 0) {
          const r = document.createRange();
          r.setStart(n, idx);
          r.setEnd(n, idx + needle.length);
          out.push(r);
        }
      }
      return out;
    };
    const hl = new H(), ul = new H();
    for (const m of marks) for (const r of find(m.text)) (m.kind === "hl" ? hl : ul).add(r);
    reg.set("chat-hl", hl);
    reg.set("chat-ul", ul);
    return () => { reg.delete("chat-hl"); reg.delete("chat-ul"); };
  }, [marks, p.events]);
  // suivi collant du bas : vrai tant que l'utilisateur n'a pas scrollé vers le haut
  const stickRef = useRef(true);
  // La pastille « aller au dernier message » ne se recalculait que sur scroll :
  // quand l'agent répond (le contenu grandit sans événement de scroll), elle
  // n'apparaissait pas tant qu'on ne scrollait pas. p.events change d'identité
  // à chaque token → recalculer ici la garde après chaque mise à jour du fil.
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    // auto-scroll collant : tant que l'utilisateur est resté près du bas, suivre
    // la réponse qui arrive ; remonter détache le suivi (stickRef mis à jour par
    // onScroll), le bouton ↓ le rattache naturellement
    if (stickRef.current) el.scrollTop = el.scrollHeight;
    setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 200);
  }, [p.events]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modelMenuProvider, setModelMenuProvider] = useState(provider);
  const [plusOpen, setPlusOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalText, setGoalText] = useState("");
  // pastille goal fermée localement (clic corbeille) — un NOUVEAU goal
  // (clé objective|ts différente) la fait réapparaître
  const [goalDismissed, setGoalDismissed] = useState<string | null>(null);
  useEffect(() => { setGoalDismissed(null); }, [p.threadId]);

  useEffect(() => {
    if (!plusOpen) return;
    const close = () => setPlusOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [plusOpen]);
  const [favModels, setFavModels] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("atelier-studio.favModels") ?? "[]"); }
    catch { return []; }
  });
  function toggleFavModel(key: string) {
    setFavModels((f) => {
      const n = f.includes(key) ? f.filter((x) => x !== key) : [...f, key];
      localStorage.setItem("atelier-studio.favModels", JSON.stringify(n));
      return n;
    });
  }
  // modèles connus : catalogue sidecar UNIQUEMENT (plan 025, step 9), avec
  // libellés locaux seulement quand ils apportent une meilleure présentation
  // que l'id brut. L'entrée Auto ("" → défaut) reste en tête.
  function baseModelsFor(pv: string): { id: string; label: string }[] {
    const info = (p.providers ?? []).find((pr) => pr.id === pv);
    const labels = BUILTIN_MODEL_LABELS[pv] ?? {};
    return [
      { id: "", label: "__default" },
      ...(info?.models ?? []).map((id) => ({ id, label: labels[id] ?? id })),
    ];
  }
  function modelsFor(pv: string) {
    const customs = (p.defaults.customModels ?? [])
      .filter((m) => m.provider === pv)
      .map((m) => ({ id: m.id, label: m.id }));
    return [...baseModelsFor(pv), ...customs];
  }
  // libellé propre d'un id de modèle : gère le suffixe "[1m]" (contexte 1M Claude,
  // pas une entrée séparée du catalogue) pour éviter d'afficher l'id brut.
  function modelIdLabel(pv: string, id: string): string {
    const is1m = id.endsWith("[1m]");
    const baseId = is1m ? id.slice(0, -"[1m]".length) : id;
    const known = [...baseModelsFor(pv), ...(p.defaults.customModels ?? [])
      .filter((m) => m.provider === pv).map((m) => ({ id: m.id, label: m.id }))]
      .find((m) => m.id === baseId);
    const base = known?.label && known.label !== "__default" ? known.label : baseId;
    return is1m ? `${base} · 1M` : base;
  }
  function resolvedDefaultLabel(pv: string): string {
    const id = p.defaults.defaultModel[pv] ?? "";
    if (!id) return t("common.default-cli");
    const eff = p.defaults.defaultEffort?.[pv];
    return modelIdLabel(pv, id) + (eff ? ` · ${eff}` : "");
  }
  function modelLabel(model: { label: string }, pv?: string) {
    if (model.label !== "__default") return model.label;
    // « Défaut » seul est amnésique : afficher ce qu'il résout réellement
    return `${t("chat.model-default")} — ${resolvedDefaultLabel(pv ?? provider)}`;
  }
  function sortByFav<T extends { id: string }>(list: T[], prov: string): T[] {
    return [...list].sort((a, b) => {
      const fa = favModels.includes(prov + ":" + a.id) ? 0 : 1;
      const fb = favModels.includes(prov + ":" + b.id) ? 0 : 1;
      return fa - fb;
    });
  }

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpen]);
  useEffect(() => {
    // cascade : à l'ouverture, ne montrer QUE la liste des providers (sous-menu fermé)
    if (menuOpen) setModelMenuProvider("");
  }, [menuOpen, provider]);
  const [editing, setEditing] = useState<{ index: number; text: string } | null>(null);
  const [openToolGroups, setOpenToolGroups] = useState<Set<string>>(new Set());
  // plis « A travaillé Xm Ys » : tours terminés dont le détail est déplié
  const [openFolds, setOpenFolds] = useState<Set<string>>(new Set());

  // « Add to chat » sur sélection de texte dans les messages
  function onMessagesMouseUp() {
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? "";
      if (!text || !sel || sel.rangeCount === 0) {
        setQuote(null);
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      setQuote({ x: rect.left + rect.width / 2, y: rect.top, text });
    }, 0);
  }

  // texte injecté depuis l'extérieur (annotation atelier, sélection…)
  useEffect(() => {
    if (p.injectText != null) {
      setText(p.injectText);
      p.onInjected();
    }
  }, [p.injectText]);

  // autocomplétion : "/xxx" en début de message → skills ; "@xxx" (dernier mot) → fichiers/références
  let suggestions: Suggestion[] = [];
  // "/" accepté aussi en plein milieu du message (après un espace), comme "@"
  const slashMatch = /(^|\s)\/([\w:-]*)$/.exec(text);
  const atMatch = /(^|\s)@([\w./:-]*)$/.exec(text);
  if (slashMatch) {
    const q = slashMatch[2].toLowerCase();
    const slashBase = text.slice(0, slashMatch.index) + slashMatch[1];
    suggestions = p.commands
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 12)
      .map((c) => ({ insert: `${slashBase}/${c.name} `, label: `/${c.name}`, hint: c.source }));
  } else if (atMatch) {
    const q = atMatch[2].toLowerCase();
    const base = text.slice(0, atMatch.index) + atMatch[1];
    suggestions = [];
    if ("local".startsWith(q) || q === "") {
      suggestions.push({ insert: "__browse__", label: "@local", hint: t("at.browse"), section: t("at.local"), icon: "local" });
    }
    if ("recent".startsWith(q) || q.startsWith("recent")) {
      if (q === "" || q === "recent") {
        suggestions.push({ insert: base + "@recent:", label: "@recent", hint: t("at.recent-hint"), section: t("at.smart"), icon: "file", keep: true });
      }
      const recentQuery = q.startsWith("recent:") ? q.slice("recent:".length) : "";
      suggestions.push(
        ...p.recentFiles
          .filter((file) => !recentQuery || file.toLowerCase().includes(recentQuery))
          .slice(0, 8)
          .map((file) => ({
            insert: base + `${mentionLabel(file)} `,
            label: file.split("/").pop() ?? file,
            hint: file,
            section: t("at.recent"),
            icon: file.split(".").pop()?.toLowerCase() ?? "",
            attachPath: file,
          })),
      );
    }
    if ("zotero".startsWith(q) || q.startsWith("zotero")) {
      if (q === "" || q === "zotero") {
        suggestions.push({ insert: base + "@zotero:", label: "@zotero", hint: t("at.zotero-hint"), section: t("at.smart"), icon: "bib", keep: true });
      }
      const zoteroQuery = q.startsWith("zotero:") ? q.slice("zotero:".length) : "";
      const terms = zoteroQuery.split(/\s+/).filter(Boolean);
      suggestions.push(
        ...p.zoteroItems
          .filter((item) => {
            if (!terms.length) return true;
            const hay = `${item.title} ${item.creators ?? ""} ${item.year ?? ""} ${item.citeKey ?? ""} ${item.key}`.toLowerCase();
            return terms.every((term) => hay.includes(term));
          })
          .slice(0, 8)
          .map((item) => {
            const label = item.citeKey ? `@${item.citeKey}` : `@${item.key}`;
            return {
              insert: base + `${label} `,
              label,
              hint: [item.title, item.year].filter(Boolean).join(" · "),
              section: "Zotero",
              icon: "bib",
              attachZoteroKey: item.key,
            };
          }),
      );
    }
    // dossiers correspondants (clic = descendre dedans, l'autocomplétion continue)
    const dirSet = new Set<string>();
    for (const f of p.files) {
      const parts = f.split("/");
      for (let d = 1; d < parts.length; d++) {
        const dir = parts.slice(0, d).join("/");
        if (dir.toLowerCase().includes(q)) dirSet.add(dir);
      }
    }
    suggestions.push(
      ...[...dirSet].sort((a, b) => a.length - b.length).slice(0, 4).map((dir) => ({
        insert: base + `@${dir}/`,
        label: dir.split("/").pop() ?? dir,
        hint: dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/")) : "",
        section: t("at.files"),
        icon: "dir",
        attachFolder: dir,
      }))
    );
    suggestions.push(
      ...p.files
        .filter((f) => f.toLowerCase().includes(q))
        .slice(0, 10)
        .map((f) => {
          const name = f.split("/").pop() ?? f;
          const dir = f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : "";
          return {
            insert: base + `${mentionLabel(f)} `,
            label: name,
            hint: dir,
            section: t("at.files"),
            icon: f.split(".").pop()?.toLowerCase() ?? "",
            attachPath: f,
          };
        })
    );
  }

  async function applySuggestion(s: Suggestion) {
    if (s.insert === "__browse__") {
      const picked = await open({ multiple: true });
      if (picked) {
        const arr = Array.isArray(picked) ? picked : [picked];
        // retirer le @… en cours puis attacher les fichiers choisis
        setText((cur) => cur.replace(/(^|\s)@[\w./:-]*$/, "$1"));
        for (const path of arr) p.onAttachPath?.(path as string);
      }
      setSelIdx(0);
      return;
    }
    // pièce jointe « feuille » (fichier / citation) : la PUCE représente la
    // référence — retirer le @token tapé au lieu de laisser « @main.tex » en
    // double dans le message
    if (s.attachPath || s.attachZoteroKey) {
      if (s.attachPath) p.onAttachPath?.(s.attachPath);
      if (s.attachZoteroKey) p.onAttachZotero?.(s.attachZoteroKey);
      setText((cur) => cur.replace(/(^|\s)@[\w./:-]*$/, "$1"));
      setSelIdx(0);
      return;
    }
    // navigation (dossier, @recent:/@zotero:…) : on garde le texte pour continuer
    if (s.attachFolder) p.onAttachFolder?.(s.attachFolder);
    setText(s.insert);
    setSelIdx(0);
  }

  async function attachFiles() {
    const picked = await open({ multiple: true });
    if (!picked) return;
    const paths = Array.isArray(picked) ? picked : [picked];
    // la PUCE représente la référence — ne PAS aussi insérer « @fichier » dans
    // le texte, sinon le fichier apparaît en double (puce + mention). Idem que
    // le chemin @-autocomplete plus haut, qui retire le token tapé.
    for (const path of paths) p.onAttachPath?.(path as string);
  }

  // ---- pliage des tours terminés (pattern Codex « Worked for Xm Ys ») ----
  // un tour = user → … → done ; une fois terminé, le travail intermédiaire
  // (narration, outils, réflexion) se replie en une ligne dépliable. Restent
  // visibles : le bloc final (texte de réponse, cartes edit, todos, erreurs).
  type TurnFold = { key: string; start: number; end: number; count: number; ms: number | null };
  const turnFolds = new Map<number, TurnFold>();
  {
    // "interaction" suit le précédent "permission" : gardé visible en fin de
    // tour (KEEP_TAIL), mais pas compté comme étape de travail (COUNTED) — une
    // carte interactive n'est pas une action de l'agent, et sans KEEP_TAIL elle
    // disparaîtrait sous le repli « Worked for … »
    const KEEP_TAIL = new Set(["text", "edit", "todos", "error", "permission", "interaction", "usage", "goal"]);
    const COUNTED = new Set(["tool", "tool_update", "text", "thinking", "activity", "edit"]);
    let u = -1;
    for (let i = 0; i < p.events.length; i++) {
      const e = p.events[i];
      if (e.kind === "user") { u = i; continue; }
      if (e.kind !== "done" || u < 0) continue;
      // bloc final : remonter depuis done tant que ce sont des kinds « réponse »
      let tail = i;
      while (tail - 1 > u && KEEP_TAIL.has(p.events[tail - 1].kind)) tail--;
      const count = p.events.slice(u + 1, tail).filter((x) => COUNTED.has(x.kind)).length;
      if (count >= 2) {
        const uts = (p.events[u] as { ts?: number }).ts;
        const ms = e.ts != null && uts != null ? e.ts - uts : null;
        turnFolds.set(u + 1, { key: `fold:${u}`, start: u + 1, end: tail, count, ms });
      }
      u = -1;
    }
  }
  const fmtWorkDur = (ms: number) => {
    const s = Math.max(1, Math.round(ms / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
    return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
  };

  const renderedEvents: (
    | { type: "event"; event: AgentEvent; index: number }
    | { type: "actions"; actions: Extract<AgentEvent, { kind: "tool" | "tool_update" }>[]; index: number; key: string }
    | { type: "fold"; fold: TurnFold; open: boolean }
  )[] = [];
  for (let i = 0; i < p.events.length; i++) {
    const fold = turnFolds.get(i);
    if (fold) {
      const open = openFolds.has(fold.key);
      renderedEvents.push({ type: "fold", fold, open });
      if (!open) { i = fold.end - 1; continue; }
    }
    const e = p.events[i];
    // les sentinelles (__thinking, __compacted…) et non-outils gardent leur ligne
    if (!isSummarizableTool(e)) {
      renderedEvents.push({ type: "event", event: e, index: i });
      continue;
    }
    // grappe d'outils « résumables » consécutifs → une ligne résumée façon Codex
    let end = i + 1;
    while (end < p.events.length && isSummarizableTool(p.events[end])) end++;
    const actions = p.events.slice(i, end) as Extract<AgentEvent, { kind: "tool" | "tool_update" }>[];
    const first = actions[0];
    // le turn fait partie de l'identité : deux turns peuvent réutiliser le
    // même id d'outil (plan 025) — sans lui, React fusionne les deux grappes
    const turnKey = first?.meta && "turnId" in first.meta ? `${first.meta.turnId}:` : "";
    const groupKey = first?.kind === "tool_update"
      ? `tools:${turnKey}${first.id}`
      : `tools:${turnKey}${first?.name ?? i}:${i}`;
    renderedEvents.push({ type: "actions", actions, index: i, key: groupKey });
    i = end - 1;
  }
  const currentTool = [...p.events].reverse().find((e) => e.kind === "tool_update" || e.kind === "tool");
  const currentToolName =
    currentTool?.kind === "tool_update" ? eventLabel(currentTool.name) :
    currentTool?.kind === "tool" ? eventLabel(currentTool.name) : "";
  const currentActivity = [...p.events].reverse().find((e) => e.kind === "activity") as Extract<AgentEvent, { kind: "activity" }> | undefined;
  const currentActivityName = currentActivity?.status === "running"
    ? [currentActivity.title, currentActivity.detail].filter(Boolean).join(" · ")
    : "";
  const currentWorkName = currentActivityName || currentToolName;
  const latestGoal = [...p.events].reverse().find((e): e is Extract<AgentEvent, { kind: "goal" }> => e.kind === "goal");
  const goalKey = latestGoal ? `${latestGoal.goal?.objective ?? ""}|${latestGoal.ts ?? ""}` : null;
  const activeGoal = latestGoal && !latestGoal.cleared && goalKey !== goalDismissed
    ? latestGoal.goal : null;
  const activeToolGroupKey = [...renderedEvents].reverse().find((item) => item.type === "actions")?.key;
  const selectedModel = modelsFor(provider).find((m) => m.id === model);
  const selectedModelLabel = selectedModel ? modelLabel(selectedModel) : (model ? modelIdLabel(provider, model) : model);
  const modelButtonLabel = model ? selectedModelLabel : resolvedDefaultLabel(provider);
  // popover de sélection : la sélection courante correspond-elle à un mark
  // déjà posé ? → le bouton devient une action "Retirer" explicite (jamais
  // de suppression silencieuse en re-cliquant le même bouton, spec §2)
  const quoteText = quote?.text.trim() ?? "";
  const quoteHasHl = !!quoteText && marks.some((m) => m.text === quoteText && m.kind === "hl");
  const quoteHasUl = !!quoteText && marks.some((m) => m.text === quoteText && m.kind === "ul");

  function renderToolLine(e: Extract<AgentEvent, { kind: "tool" | "tool_update" }>, key: React.Key) {
    if (e.kind === "tool") {
      return (
        <div key={key} className="tool">
          <Tick /> {eventLabel(e.name)}
          {e.detail ? <span className="tool-detail">({e.detail})</span> : null}
        </div>
      );
    }
    return <ToolOutputLine key={key} event={e} />;
  }

  // demande Thierry (2026-07-10) : AUCUN badge d'état dans l'en-tête —
  // running est visible dans le fil (spinner + Stop), les erreurs dans la
  // capsule/le fil. L'en-tête ne porte que le titre et le provider.
  const headerStatus = null;

  return (
    <div className="chat">
      {p.threadId && (
        <ChatHeader
          title={p.threadTitle || t("app.new-chat-title")}
          provider={p.threadProvider ?? ""}
          projectName={p.projectName ?? (p.projectRoot ? p.projectRoot.split("/").filter(Boolean).pop() ?? null : null)}
          projectPath={p.projectRoot}
          status={headerStatus}
        />
      )}
      <ChatTimeline
        thread={{ threadId: p.threadId, events: p.events, workingSince: p.workingSince }}
        rev={{ review, reviewMin, setReviewMin, setReview, barOpen, setBarOpen, fixing, setFixing, reviewOpen, setReviewOpen }}
        list={{ renderedEvents, openFolds, setOpenFolds, openToolGroups, setOpenToolGroups, activeToolGroupKey, renderToolLine, fmtWorkDur }}
        msg={{
          editing, setEditing, pins: p.pins, onTogglePin: p.onTogglePin, onRevert: p.onRevert,
          onEditSend: p.onEditSend, onFork: p.onFork, setPasteView, commands: p.commands,
          defaults: p.defaults, onQuote: p.onQuote,
        }}
        scroll={{ messagesRef, onMessagesMouseUp, setShowJump, stickRef, showJump }}
        working={{ currentWorkName, onStop: p.onStop }}
        chapters={{ tickPos, resolvePinEl, pinMenu, setPinMenu, onStylePin: p.onStylePin }}
        empty={{ onNewChat: p.onNewChat, onOpenProject: p.onOpenProject, home: p.home ?? null }}
        selection={{ quote, setQuote, quoteHasHl, quoteHasUl, addMark, removeMark }}
      />
      <ChatComposer
        input={{
          text, setText, taRef, suggestions, selIdx, setSelIdx, applySuggestion,
          commands: p.commands, onPasteImage: p.onPasteImage, onPasteText: p.onPasteText,
        }}
        model={{
          provider, setProvider, model, setModel, effort, setEffort,
          permissionMode, setPermissionMode,
        }}
        menus={{
          plusOpen, setPlusOpen, menuOpen, setMenuOpen, modelMenuProvider,
          setModelMenuProvider,
          goalOpen, setGoalOpen, goalText, setGoalText,
        }}
        catalog={{
          providerInfo, resolvedModelId, autoReasoningLabel, levelsFor, effortFor,
          modelsFor, sortByFav, modelLabel, modelButtonLabel, favModels,
          toggleFavModel, attachFiles,
        }}
        context={{ attachments: p.attachments, onRemoveAttachment: p.onRemoveAttachment, onOpenPaste: setPasteView }}
        host={{
          usage: p.usage, disabled: p.disabled, workingSince: p.workingSince,
          onStop: p.onStop, onSubmit: p.onSubmit,
          // interception clear : fermeture optimiste de la pastille avant
          // (et indépendamment de) l'écho goal/cleared du sidecar
          onGoal: p.onGoal
            ? (action, objective, status) => {
                if (action === "clear") setGoalDismissed(goalKey);
                p.onGoal!(action, objective, status);
              }
            : undefined,
          activeGoal,
          defaults: p.defaults, providers: p.providers,
        }}
      />
      {pasteView && (
        <div className="paste-overlay" onClick={() => setPasteView(null)}>
          <div className="paste-modal" onClick={(e) => e.stopPropagation()}>
            <div className="paste-modal-head">
              <span className="paste-modal-title">{pasteView.name}</span>
              <span className="paste-modal-lines">{t("chat.lines", { lines: String(pasteView.text.split("\n").length) })}</span>
              <span className="flex" />
              <button type="button" className="ghost" onClick={() => {
                navigator.clipboard.writeText(pasteView.text);
                setPasteCopied(true);
              }}>
                {pasteCopied ? t("chat.output-copied") : t("chat.output-copy")}
              </button>
              <button type="button" className="ghost" onClick={() => setPasteView(null)}>
                <CloseIcon />
              </button>
            </div>
            <div className="paste-modal-body">{pasteView.text}</div>
          </div>
        </div>
      )}
    </div>
  );
}
