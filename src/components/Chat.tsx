import React, { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { AgentEvent } from "../lib/ws";
import { wsSend } from "../lib/wsBus";
import { eventLabel, t } from "../lib/i18n";
import { buildHighlightContext } from "../lib/highlightContext";
import type { HighlightEntry } from "./Rail";
import {
  CloseIcon,
  ArrowDownIcon,
  ZapIcon,
} from "./icons";
import { ProviderInfo } from "../lib/providers";
import {
  EditLine, formatPermInput,
  ThinkingBlock, Working, ActivityCard,
} from "./chat/turnParts";
import {
  ToolOutputLine, isSummarizableTool,
} from "./chat/toolPresentation";
import {
  ChatEmptyState, UserTurn, StreamingText, AssistantText, AssistantDone,
  ActivityFold, ActivityGroup,
} from "./chat/turns";
import { ChatComposer } from "./chat/ChatComposer";
import { mentionLabel, isValidSkill } from "./chat/mentions";



const BUILTIN_MODEL_LABELS: Record<string, Record<string, string>> = {
  claude: {
    "claude-fable-5": "Fable 5",
    "claude-opus-4-8": "Opus 4.8",
    "claude-sonnet-5": "Sonnet 5",
    "claude-haiku-4-5-20251001": "Haiku 4.5",
  },
};

const MODELS: Record<string, { id: string; label: string }[]> = {
  claude: [
    { id: "claude-fable-5", label: "Fable 5" },
    { id: "claude-opus-4-8", label: "Opus 4.8" },
    { id: "claude-sonnet-5", label: "Sonnet 5" },
    { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
  ],
  grok: [
    { id: "grok-4.5", label: "Grok 4.5" },
    { id: "grok-composer-2.5-fast", label: "Composer 2.5 Fast" },
  ],
};

const EFFORTS: Record<string, string[]> = {
  claude: ["", "low", "medium", "high", "xhigh", "max"],
  codex: ["", "low", "medium", "high", "xhigh"],
  // Grok : pas d'entrée "" (Auto) — défaut explicite "high" (DEFAULT_SETTINGS)
  grok: ["minimal", "low", "medium", "high", "xhigh", "max"],
};
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
export default function Chat(p: {
  events: AgentEvent[];
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
  onGoal?: (action: "set" | "clear", objective?: string) => void;
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
    if (info?.kind !== "api") return EFFORTS[pv] ?? ["", ...(info?.efforts ?? [])];
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
  const [effortMenuOpen, setEffortMenuOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalText, setGoalText] = useState("");

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
  // modèles connus : catalogue sidecar par défaut, avec libellés locaux seulement
  // quand ils apportent une meilleure présentation que l'id brut.
  function baseModelsFor(pv: string): { id: string; label: string }[] {
    const info = (p.providers ?? []).find((pr) => pr.id === pv);
    if (MODELS[pv]) return MODELS[pv];
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
  // pas une entrée séparée dans MODELS) pour éviter d'afficher l'id brut.
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
    if (!menuOpen && !effortMenuOpen) return;
    const close = () => { setMenuOpen(false); setEffortMenuOpen(false); };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpen, effortMenuOpen]);
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
    const KEEP_TAIL = new Set(["text", "edit", "todos", "error", "permission", "usage", "goal"]);
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
    const groupKey = first?.kind === "tool_update"
      ? `tools:${first.id}`
      : `tools:${first?.name ?? i}:${i}`;
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
  const activeGoal = latestGoal && !latestGoal.cleared ? latestGoal.goal : null;
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
          <span className="tool-tick">▸</span> {eventLabel(e.name)}
          {e.detail ? <span className="tool-detail">({e.detail})</span> : null}
        </div>
      );
    }
    return <ToolOutputLine key={key} event={e} />;
  }

  return (
    <div className="chat">
      {p.threadId && review && reviewMin && (
        <button
          className={`reviewer-strip v-${review.status === "running" ? "running" : review.verdict}`}
          title={t("review.expand")}
          onClick={() => setReviewMin(false)}
        />
      )}
      {p.threadId && review && !reviewMin && (
        <div className="reviewer-wrap">
          <button
            className={`reviewer-bar v-${review.status === "running" ? "running" : review.verdict} ${review.status === "done" ? "clickable" : ""}`}
            onClick={() => review.status === "done" && setBarOpen((v) => !v)}
          >
            <svg className="rb-ico" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 1.8l5 2v4c0 3.2-2.2 5.4-5 6.4-2.8-1-5-3.2-5-6.4v-4z" />
              {review.verdict === "ok" && <path d="M5.8 8l1.6 1.6L10.5 6.3" />}
            </svg>
            <span className="rb-name">Reviewer</span>
            <span className="rb-dot">·</span>
            {fixing ? (
              <span className="rb-verdict running"><span className="rb-spin" /> {t("review.fixing")}</span>
            ) : review.status === "running" ? (
              <span className="rb-verdict running"><span className="rb-spin" /> {t("review.running")}</span>
            ) : review.verdict === "ok" ? (
              <span className="rb-verdict ok">{t("review.ok-bar")}</span>
            ) : review.verdict === "issues" ? (
              <span className="rb-verdict warn">{t("review.issues", { n: review.issues?.length ?? 0 })}</span>
            ) : (
              <span className="rb-verdict">{t("review.inconclusive")}</span>
            )}
            {review.status === "done" && !fixing && review.checks != null && review.checks > 0 && (
              <>
                <span className="rb-dot">·</span>
                <span className="rb-checks">{t("review.checks", { n: review.checks })}</span>
              </>
            )}
            {review.status === "done" ? <span className="rb-chevron">{barOpen ? "▴" : "▾"}</span> : null}
            <span className="rb-min" title={t("review.minimize")} onClick={(e) => { e.stopPropagation(); setBarOpen(false); setReviewMin(true); }}>–</span>
            <span className="rb-close" title={t("action.close")} onClick={(e) => { e.stopPropagation(); setReview(null); }}>✕</span>
          </button>
          {barOpen && review.status === "done" ? (
            <div className="reviewer-menu">
              {review.issues?.length ? (
                <>
                  {review.issues.map((iss, k) => (
                    <div key={k} className={`rm-issue s-${iss.severity}`}>
                      <div className="rm-claim">« {iss.claim} »</div>
                      <div className="rm-problem">{iss.problem}</div>
                      {iss.fix && <div className="rm-fix">→ {iss.fix}</div>}
                    </div>
                  ))}
                  <button
                    className="rm-correct"
                    disabled={fixing}
                    onClick={() => {
                      setFixing(true);
                      setBarOpen(false);
                      window.dispatchEvent(new CustomEvent("correct-issues", { detail: { threadId: p.threadId, issues: review.issues } }));
                    }}
                  >
                    {fixing ? t("review.fixing") : t("review.correct")}
                  </button>
                </>
              ) : (
                <div className="rm-ok">{t("review.ok-detail")}</div>
              )}
              {(review.checkedTools?.length || review.checkedFiles?.length) ? (
                <div className="rm-checked">
                  <div className="rm-checked-h">{t("review.checked-against")}</div>
                  {review.checkedFiles?.map((f, k) => (
                    <div key={"f" + k} className="rm-checked-row"><span className="rm-ck-kind">fichier</span> {f}</div>
                  ))}
                  {review.checkedTools?.map((tl, k) => (
                    <div key={"t" + k} className="rm-checked-row"><span className="rm-ck-kind">outil</span> {tl}</div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
      <div
        className="messages"
        ref={messagesRef}
        onMouseUp={onMessagesMouseUp}
        onScroll={(e) => {
          const el = e.currentTarget;
          const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
          // près du bas = on (re)colle le suivi ; remonter le détache
          stickRef.current = fromBottom <= 80;
          setShowJump(fromBottom > 200);
        }}
      >
        <ChatEmptyState
          threadId={p.threadId}
          hasEvents={p.events.length > 0}
          onNewChat={p.onNewChat}
          onOpenProject={p.onOpenProject}
        />
        {renderedEvents.map((item) => {
          if (item.type === "fold") {
            const { fold, open } = item;
            return (
              <ActivityFold
                key={fold.key}
                fold={fold}
                open={open}
                label={fold.ms != null
                  ? t("chat.worked-for", { dur: fmtWorkDur(fold.ms) })
                  : t("chat.worked-steps", { n: fold.count })}
                onToggle={() =>
                  setOpenFolds((prev) => {
                    const next = new Set(prev);
                    if (next.has(fold.key)) next.delete(fold.key);
                    else next.add(fold.key);
                    return next;
                  })
                }
              />
            );
          }
          if (item.type === "actions") {
            const open = openToolGroups.has(item.key) || (p.workingSince != null && item.key === activeToolGroupKey);
            return (
              <ActivityGroup
                key={item.key}
                actions={item.actions}
                open={open}
                onToggle={() =>
                  setOpenToolGroups((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.key)) next.delete(item.key);
                    else next.add(item.key);
                    return next;
                  })
                }
                renderToolLine={renderToolLine}
              />
            );
          }
          const e = item.event;
          const i = item.index;
          if (e.kind === "user")
            return (
              <UserTurn
                key={i}
                event={e}
                index={i}
                timeFormat={p.defaults.timeFormat}
                pinned={p.pins.some((c) => c.index === i)}
                renderBubbleText={(text) => {
                  const m = /^(\/[\w:-]+)([\s\S]*)$/.exec(text);
                  if (m && isValidSkill(m[1], p.commands)) {
                    return (
                      <>
                        <span className="slash-cmd">{m[1]}</span>
                        {m[2]}
                      </>
                    );
                  }
                  return text;
                }}
                editingText={editing?.index === i ? editing.text : null}
                onEditingChange={(text) => setEditing(text == null ? null : { index: i, text })}
                onEditSend={p.onEditSend}
                onRevert={p.onRevert}
                onTogglePin={p.onTogglePin}
                onOpenPaste={setPasteView}
              />
            );
          if (e.kind === "streaming")
            return <StreamingText key={i} text={e.text} working={p.workingSince != null} />;
          if (e.kind === "text")
            return (
              <AssistantText
                key={i}
                event={e}
                index={i}
                timeFormat={p.defaults.timeFormat}
                pinned={p.pins.some((c) => c.index === i)}
                onFork={p.onFork}
                onTogglePin={p.onTogglePin}
              />
            );
          if (e.kind === "thinking_live" || e.kind === "thinking")
            return <ThinkingBlock key={i} text={e.text} live={e.kind === "thinking_live"} />;
          if (e.kind === "activity")
            return <ActivityCard key={e.id} event={e} live={p.workingSince != null && e.status === "running"} />;
          if (e.kind === "permission")
            return (
              <div key={i} className={`perm-card ${e.answered != null ? "answered" : ""}`}>
                <div className="perm-head">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1.8l5 2v4c0 3.2-2.2 5.4-5 6.4-2.8-1-5-3.2-5-6.4v-4z"/></svg>
                  <span>{t("perm.ask", { tool: e.toolName })}</span>
                </div>
                {e.input ? <pre className="perm-input">{formatPermInput(e.toolName, e.input)}</pre> : null}
                {e.answered == null ? (
                  <div className="perm-actions">
                    <button className="perm-allow" onClick={() => window.dispatchEvent(new CustomEvent("permission-answer", { detail: { threadId: p.threadId, requestId: e.requestId, allow: true } }))}>{t("perm.allow")}</button>
                    <button className="perm-deny" onClick={() => window.dispatchEvent(new CustomEvent("permission-answer", { detail: { threadId: p.threadId, requestId: e.requestId, allow: false } }))}>{t("perm.deny")}</button>
                  </div>
                ) : (
                  <div className="perm-verdict">{e.answered ? t("perm.allowed") : t("perm.denied")}</div>
                )}
              </div>
            );
          if (e.kind === "tool" || e.kind === "tool_update") return renderToolLine(e, i);
          if (e.kind === "edit") return <EditLine key={i} event={e} threadId={p.threadId} />;
          if (e.kind === "todos")
            return (
              <div key={i} className="todos">
                {e.items.map((todo, idx) => (
                  <div key={idx} className={todo.completed ? "todo done" : "todo"}>
                    <span className="todo-box">{todo.completed ? "✓" : ""}</span>
                    <span>{todo.text}</span>
                  </div>
                ))}
              </div>
            );
          if (e.kind === "goal")
            return (
              <div key={i} className={`goal-card ${e.cleared || !e.goal ? "cleared" : e.goal.status}`}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                  <circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="2.4" />
                </svg>
                {e.cleared || !e.goal ? (
                  <span className="goal-obj">{t("goal.cleared")}</span>
                ) : (
                  <>
                    <span className="goal-obj">{e.goal.objective}</span>
                    <span className="goal-status">{t(`goal.status.${e.goal.status}` as Parameters<typeof t>[0])}</span>
                    {e.goal.tokenBudget != null && (
                      <span className="goal-budget">{Math.round((e.goal.tokensUsed ?? 0) / 1000)}k / {Math.round(e.goal.tokenBudget / 1000)}k</span>
                    )}
                  </>
                )}
              </div>
            );
          if (e.kind === "error")
            return (
              <div key={i} className="error">
                ⚠ {e.message}
              </div>
            );
          if (e.kind === "done") {
            const isLastDone = !p.events.slice(i + 1).some((x) => x.kind === "done");
            return (
              <AssistantDone
                key={i}
                event={e}
                isLastDone={isLastDone}
                threadId={p.threadId}
                review={review}
                reviewOpen={reviewOpen}
                onStartReview={() => {
                  setReview({ status: "running" });
                  window.dispatchEvent(new CustomEvent("request-review", { detail: { threadId: p.threadId } }));
                }}
                onToggleReviewOpen={() => setReviewOpen((v) => !v)}
              />
            );
          }
          return null;
        })}
        {p.workingSince != null && (
          <div className="working-stack">
            <div className="working-row">
              <Working since={p.workingSince} />
            </div>
            {currentWorkName && (
              <div className="working-tool">
                <span className="working-tool-glyph" aria-hidden="true">↳</span>
                <span>{currentWorkName}</span>
              </div>
            )}
            {activeGoal && (
              <div className="working-goal">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
                  <circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="2.4" />
                </svg>
                <span className="working-goal-label">{t("goal.live")}</span>
                <span className="working-goal-objective">{activeGoal.objective}</span>
                <span className="working-goal-status">{t(`goal.status.${activeGoal.status}` as Parameters<typeof t>[0])}</span>
              </div>
            )}
            <button type="button" className="stop-hint" title={t("action.interrupt")} onClick={p.onStop}>
              <kbd>esc</kbd> {t("action.interrupt")}
            </button>
          </div>
        )}
      </div>
      {p.pins.length > 0 && (
        <div className={`chapters${p.threadId && review ? " below-reviewer" : ""}`}>
          {[...p.pins].sort((a, b) => (tickPos[a.index] ?? a.index) - (tickPos[b.index] ?? b.index)).map((c) => (
            <div
              key={c.index}
              className="chapter-tick"
              onClick={() => {
                resolvePinEl(c.index, c.label, (c as any).anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setPinMenu({ index: c.index, x: e.clientX, y: e.clientY });
              }}
            >
              <span
                className={`chapter-bar st-${c.style ?? "bar"}`}
                style={c.color ? { borderColor: c.color, background: `color-mix(in srgb, ${c.color} 25%, transparent)` } : undefined}
              />
              <span className="chapter-label">{c.label}</span>
            </div>
          ))}
        </div>
      )}
      {pinMenu && (
        <div className="ctx-menu pin-menu" style={{ position: "fixed", left: pinMenu.x, top: pinMenu.y, zIndex: 200 }}
          onClick={(e) => e.stopPropagation()}>
          <input
            className="pin-rename"
            defaultValue={p.pins.find((x) => x.index === pinMenu.index)?.label ?? ""}
            placeholder={t("chat.pin-rename")}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const v = (e.target as HTMLInputElement).value.trim();
                if (v) p.onStylePin(pinMenu.index, { label: v });
                setPinMenu(null);
              }
              if (e.key === "Escape") setPinMenu(null);
            }}
            onBlur={(e) => {
              const v = e.target.value.trim();
              const cur = p.pins.find((x) => x.index === pinMenu.index)?.label ?? "";
              if (v && v !== cur) p.onStylePin(pinMenu.index, { label: v });
            }}
          />
          <div className="swatches" style={{ padding: "6px 10px" }}>
            {["#e05d5d", "#e8823a", "#e0b74a", "#22b07d", "#3b82f6", "#8b5cf6"].map((col) => (
              <span key={col} className="swatch" style={{ background: col }}
                onClick={() => { p.onStylePin(pinMenu.index, { color: col }); setPinMenu(null); }} />
            ))}
            <span className="swatch none" onClick={() => { p.onStylePin(pinMenu.index, { color: undefined }); setPinMenu(null); }}>∅</span>
          </div>
          <div className="pin-styles" style={{ display: "flex", gap: 6, padding: "2px 10px 8px" }}>
            {[
              { id: "bar", el: <span className="chapter-bar st-bar" style={{ background: "var(--fg2)" }} /> },
              { id: "dot", el: <span className="chapter-bar st-dot" style={{ background: "var(--fg2)" }} /> },
              { id: "square", el: <span className="chapter-bar st-square" style={{ background: "var(--fg2)" }} /> },
              { id: "flag", el: <span className="chapter-bar st-flag" style={{ background: "var(--fg2)" }} /> },
            ].map((st) => (
              <button key={st.id} type="button" className="pin-style-btn"
                onClick={() => { p.onStylePin(pinMenu.index, { style: st.id }); setPinMenu(null); }}>
                {st.el}
              </button>
            ))}
          </div>
          <div className="danger" onClick={() => {
            const pin = p.pins.find((x) => x.index === pinMenu.index);
            if (pin) p.onTogglePin(pinMenu.index, pin.label);
            setPinMenu(null);
          }}>
            {t("chat.unpin")}
          </div>
        </div>
      )}
      {quote && (
        <div className="sel-toolbar" style={{ left: quote.x, top: quote.y - 44 }}>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              if (quoteHasHl) removeMark(quote.text, "hl"); else addMark(quote.text, "hl");
              setQuote(null);
              window.getSelection()?.removeAllRanges();
            }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M10.5 2.5l3 3L6 13H3v-3z" /><path d="M9 4l3 3" />
            </svg>
            {quoteHasHl ? t("chat.remove-highlight") : t("chat.highlight")}
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              if (quoteHasUl) removeMark(quote.text, "ul"); else addMark(quote.text, "ul");
              setQuote(null);
              window.getSelection()?.removeAllRanges();
            }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M4 2.5v5a4 4 0 008 0v-5" /><path d="M3.5 13.5h9" />
            </svg>
            {quoteHasUl ? t("chat.remove-underline") : t("chat.underline")}
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              window.dispatchEvent(new CustomEvent("quick-ask-open", { detail: { context: quote.text } }));
              setQuote(null);
              window.getSelection()?.removeAllRanges();
            }}
          >
            <ZapIcon />
            {t("qa.title")}
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              p.onQuote(quote.text);
              setQuote(null);
              window.getSelection()?.removeAllRanges();
            }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M14 8c0 3-2.7 5.2-6 5.2-.8 0-1.6-.1-2.3-.4L2.5 14l1-2.6C2.6 10.5 2 9.3 2 8c0-3 2.7-5.2 6-5.2S14 5 14 8z" />
            </svg>
            {t("action.add-to-chat")}
          </button>
        </div>
      )}
      {showJump && (
        <div className="jump-pill">
          <button
            type="button"
            title={t("chat.jump-last-message")}
            onClick={() => {
              const el = messagesRef.current;
              if (!el) return;
              const bubbles = el.querySelectorAll(".user-wrap");
              const last = bubbles[bubbles.length - 1] as HTMLElement | undefined;
              if (last) last.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3.6 9.8L8 5.4l4.4 4.4" />
            </svg>
            <span>{t("chat.jump-last-message")}</span>
          </button>
          <span className="jump-sep" />
          <button
            type="button"
            title={t("chat.jump-bottom")}
            onClick={() => {
              const el = messagesRef.current;
              if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
            }}
          >
            <ArrowDownIcon />
          </button>
        </div>
      )}
      <ChatComposer
        text={text}
        setText={setText}
        provider={provider}
        setProvider={setProvider}
        model={model}
        setModel={setModel}
        effort={effort}
        setEffort={setEffort}
        permissionMode={permissionMode}
        setPermissionMode={setPermissionMode}
        plusOpen={plusOpen}
        setPlusOpen={setPlusOpen}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        modelMenuProvider={modelMenuProvider}
        setModelMenuProvider={setModelMenuProvider}
        effortMenuOpen={effortMenuOpen}
        setEffortMenuOpen={setEffortMenuOpen}
        goalOpen={goalOpen}
        setGoalOpen={setGoalOpen}
        goalText={goalText}
        setGoalText={setGoalText}
        attachFiles={attachFiles}
        providerInfo={providerInfo}
        resolvedModelId={resolvedModelId}
        autoReasoningLabel={autoReasoningLabel}
        levelsFor={levelsFor}
        effortFor={effortFor}
        modelsFor={modelsFor}
        sortByFav={sortByFav}
        modelLabel={modelLabel}
        modelButtonLabel={modelButtonLabel}
        favModels={favModels}
        toggleFavModel={toggleFavModel}
        taRef={taRef}
        suggestions={suggestions}
        selIdx={selIdx}
        setSelIdx={setSelIdx}
        applySuggestion={applySuggestion}
        commands={p.commands}
        onPasteImage={p.onPasteImage}
        onPasteText={p.onPasteText}
        attachments={p.attachments}
        onRemoveAttachment={p.onRemoveAttachment}
        onOpenPaste={setPasteView}
        usage={p.usage}
        disabled={p.disabled}
        workingSince={p.workingSince}
        onStop={p.onStop}
        onSubmit={p.onSubmit}
        onGoal={p.onGoal}
        defaults={p.defaults}
        providers={p.providers}
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
