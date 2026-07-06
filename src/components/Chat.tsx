import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import hljs from "highlight.js/lib/common";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AgentEvent } from "../lib/ws";
import { wsSend } from "../lib/wsBus";
import { eventLabel, t } from "../lib/i18n";
import {
  CloseIcon,
  CollapseIcon,
  CopyIcon,
  ExpandIcon,
  ForkIcon,
  PlusIcon,
  ProviderIcon,
  ResumeIcon,
  ArrowDownIcon,
  ZapIcon,
} from "./icons";
import { Select } from "./Select";

const PERMISSION_MODES = [
  { id: "bypassPermissions", labelKey: "permission.full" },
  { id: "acceptEdits", labelKey: "permission.accept-edits" },
  { id: "default", labelKey: "action.ask-default" },
  { id: "plan", labelKey: "permission.plan" },
];

const MODELS: Record<string, { id: string; label: string }[]> = {
  claude: [
    { id: "", label: "__default" },
    { id: "claude-fable-5", label: "Fable 5" },
    { id: "claude-opus-4-8", label: "Opus 4.8" },
    { id: "claude-sonnet-5", label: "Sonnet 5" },
    { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
  ],
  codex: [
    { id: "", label: "__default" },
    { id: "gpt-5.5", label: "GPT-5.5" },
    { id: "gpt-5.4", label: "GPT-5.4" },
    { id: "gpt-5.4-mini", label: "GPT-5.4 mini" },
    { id: "gpt-5.3-codex-spark", label: "Codex Spark" },
  ],
};

const EFFORTS: Record<string, string[]> = {
  claude: ["", "low", "medium", "high", "xhigh", "max"],
  codex: ["", "minimal", "low", "medium", "high", "xhigh"],
};

// réf. fichier type "main.tex:31", "sections/method.tex:60-74", "script.py"
const FILE_REF = /^[\w~./-]*[\w-]\.(tex|py|jl|md|r|R|bib|json|toml|yaml|yml|sh|js|ts|tsx|jsx|css|html|txt|csv|sql|rs|mjs|ipynb)(:\d+(?:-\d+)?)?$/;

function openFileRef(ref: string) {
  const m = /^(.+?)(?::(\d+(?:-\d+)?))?$/.exec(ref.trim());
  if (!m) return;
  window.dispatchEvent(new CustomEvent("chat-open-file", { detail: { rel: m[1], line: m[2] ?? null } }));
}

// texte complet des enfants markdown (string, tableau, éléments imbriqués)
function mdText(children: any): string {
  if (children == null) return "";
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(mdText).join("");
  if (typeof children === "object" && children.props) return mdText(children.props.children);
  return "";
}

const LANG_ALIAS: Record<string, string> = {
  cjs: "javascript",
  console: "bash",
  js: "javascript",
  jsx: "javascript",
  md: "markdown",
  mjs: "javascript",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "bash",
  shell: "bash",
  ts: "typescript",
  tsx: "typescript",
  yml: "yaml",
  zsh: "bash",
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function highlightCode(raw: string, lang: string): string {
  const normalized = LANG_ALIAS[lang.toLowerCase()] ?? lang.toLowerCase();
  try {
    if (normalized && hljs.getLanguage(normalized)) {
      return hljs.highlight(raw, { language: normalized, ignoreIllegals: true }).value;
    }
    return hljs.highlightAuto(raw).value;
  } catch {
    return escapeHtml(raw);
  }
}

function MarkdownCodeBlock(props: any) {
  const [copied, setCopied] = useState(false);
  const child = props.children?.props ?? {};
  const lang = /language-([\w-]+)/.exec(String(child.className ?? ""))?.[1] ?? "";
  const raw = mdText(child.children);
  const label = lang || "text";
  const languageClass = label.replace(/[^\w-]/g, "");
  const highlighted = highlightCode(raw, lang);
  return (
    <div className="codeblock">
      <div className="codeblock-bar">
        <span className="codeblock-lang">{label}</span>
        <button
          type="button"
          className={`codeblock-copy${copied ? " copied" : ""}`}
          title={copied ? t("chat.output-copied") : t("chat.output-copy")}
          aria-label={copied ? t("chat.output-copied") : t("chat.output-copy")}
          onClick={() => {
            void navigator.clipboard.writeText(raw).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
        >
          <CopyIcon size={12} />
        </button>
      </div>
      <pre>
        <code
          className={`hljs language-${languageClass}`}
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </pre>
    </div>
  );
}

function diffLineClass(line: string): string {
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+") && !line.startsWith("+++")) return "add";
  if (line.startsWith("-") && !line.startsWith("---")) return "del";
  return "";
}

function DoneDiffToggle({ event, threadId }: {
  event: Extract<AgentEvent, { kind: "done" }>;
  threadId: string | null;
}) {
  const files = event.filesChanged ?? [];
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [diff, setDiff] = useState("");

  useEffect(() => {
    const onDiff = (ev: Event) => {
      const msg = (ev as CustomEvent).detail;
      if (event.projectRoot && msg.projectRoot !== event.projectRoot) return;
      setDiff(String(msg.diff ?? ""));
      setLoading(false);
    };
    window.addEventListener("git-diff", onDiff);
    return () => window.removeEventListener("git-diff", onDiff);
  }, [event.projectRoot]);

  if (!files.length) return null;
  return (
    <div className="turn-diff">
      <button
        type="button"
        className="turn-diff-toggle"
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (!next || diff || loading) return;
          setLoading(true);
          const sent = wsSend({
            type: "gitDiff",
            threadId,
            projectRoot: event.projectRoot,
          });
          if (!sent) setLoading(false);
        }}
      >
        <span>{t("chat.files-modified", { count: files.length })}</span>
        <span className="tool-tick">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <pre className="turn-diff-body">
          {loading && !diff ? (
            <span className="muted">{t("common.loading")}</span>
          ) : diff.trim() ? (
            diff.split("\n").map((line, idx) => (
              <span key={idx} className={diffLineClass(line)}>{line || " "}</span>
            ))
          ) : (
            <span className="muted">{t("git.diff-empty")}</span>
          )}
        </pre>
      )}
    </div>
  );
}

// composants markdown : liens externes stylés + réfs fichier:ligne cliquables
const MD_COMPONENTS = {
  pre: MarkdownCodeBlock,
  table: (props: any) => (
    <div className="md-table"><table>{props.children}</table></div>
  ),
  a: (props: any) => {
    const label = mdText(props.children);
    const href = String(props.href ?? "");
    const ref = FILE_REF.test(label) ? label : FILE_REF.test(href) ? href : null;
    if (ref)
      return (
        <button className="file-ref" onClick={() => openFileRef(ref)} title={t("action.open-file", { ref })}>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 1.8h5.2L13 5.6v8.6H4z" /><path d="M9 1.8v4h4" />
          </svg>
          {label}
        </button>
      );
    return (
      <a
        className="md-link"
        href={href}
        onClick={(e) => { e.preventDefault(); if (/^https?:/.test(href)) openUrl(href); }}
      >
        {props.children}
      </a>
    );
  },
  code: (props: any) => {
    const txt = mdText(props.children);
    if (!props.className && FILE_REF.test(txt) && txt.includes(":"))
      return (
        <button className="file-ref" onClick={() => openFileRef(txt)} title={t("action.open-file", { ref: txt })}>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 1.8h5.2L13 5.6v8.6H4z" /><path d="M9 1.8v4h4" />
          </svg>
          {txt}
        </button>
      );
    return <code className={props.className}>{props.children}</code>;
  },
};

function fmtTime(ts: number, fmt?: "system" | "24h" | "12h") {
  const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  if (fmt === "24h") opts.hour12 = false;
  if (fmt === "12h") opts.hour12 = true;
  return new Date(ts).toLocaleTimeString([], opts);
}

/** « Williamson et al. - 2025 - Temperature… .pdf » → « Williamson et al. 2025 » ; sinon nom court. */
function citeLabel(name: string): string {
  const base = name.replace(/\.[a-z0-9]+$/i, "");
  const m = /^(.{2,60}?)\s+-\s+(\d{4})\s+-\s+/.exec(base);
  if (m) return `${m[1]} ${m[2]}`;
  return base.length > 34 ? base.slice(0, 33) + "…" : base;
}

function formatPermInput(tool: string, input: Record<string, unknown>): string {
  const one = (v: unknown) => String(v ?? "").slice(0, 400);
  if (tool === "Bash") return one((input as any).command);
  if ((input as any).file_path) return one((input as any).file_path);
  const s = JSON.stringify(input, null, 1);
  return s.length > 400 ? s.slice(0, 400) + "…" : s;
}

function ThinkingBlock({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  const preview = text.replace(/\s+/g, " ").slice(-140);
  return (
    <div className={`thinking ${live ? "live" : ""}`}>
      <button type="button" className="thinking-head" onClick={() => setOpen((v) => !v)}>
        <span className="tool-tick">{open ? "▾" : "▸"}</span>
        <span className="thinking-label">{live ? t("chat.thinking-live") : t("chat.thinking")}</span>
        {!open && <span className="thinking-preview">{preview}</span>}
      </button>
      {open && <div className="thinking-body">{text}</div>}
    </div>
  );
}

function Working({ since }: { since: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(1, Math.round((Date.now() - since) / 1000));
  return (
    <div className="working">
      <span className="working-spin" aria-hidden="true" />
      <span className="working-label">{t("chat.working")}</span> {t("chat.working-for", { secs })}
    </div>
  );
}

function ActivityCard({ event, live }: { event: Extract<AgentEvent, { kind: "activity" }>; live: boolean }) {
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const open = manualOpen ?? live;
  const steps = event.steps ?? [];
  return (
    <div className={`activity-card ${event.status ?? "running"} ${live ? "live" : ""}`}>
      <button type="button" className="activity-head" onClick={() => setManualOpen((v) => !(v ?? live))}>
        <span className="activity-pulse" aria-hidden="true" />
        <span className="activity-title">{event.title}</span>
        {event.detail && <span className="activity-detail">{event.detail}</span>}
        {steps.length > 0 && <span className="activity-count">{t("chat.actions-used", { count: steps.length })}</span>}
        <span className="tool-tick">{open ? "▾" : "▸"}</span>
      </button>
      {open && steps.length > 0 && (
        <div className="activity-steps">
          {steps.map((step, idx) => (
            <div key={`${step.title}-${idx}`} className={`activity-step ${step.status ?? "running"}`}>
              <span className="activity-step-dot" aria-hidden="true" />
              <span className="activity-step-title">{step.title}</span>
              {step.detail && <span className="activity-step-detail">{step.detail}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function toolOutputSummary(output: string) {
  const clean = output.trim();
  if (!clean) return "";
  const lines = clean.split(/\r?\n/).length;
  const chars = clean.length;
  const size = chars >= 1000 ? `${Math.round(chars / 100) / 10}k chars` : `${chars} chars`;
  return lines > 1 ? `${lines} lines · ${size}` : size;
}

function ToolOutputLine({ event }: { event: Extract<AgentEvent, { kind: "tool_update" }> }) {
  const output = event.output.length > 6000 ? "[...]\n" + event.output.slice(-6000) : event.output;
  const failed = Boolean(event.exitCode && event.exitCode !== 0) || event.status === "failed";
  const [open, setOpen] = useState(failed);
  const summary = toolOutputSummary(output);
  return (
    <div className={`tool-output ${open ? "open" : "collapsed"} ${failed ? "failed" : ""}`}>
      <button type="button" className="tool-output-head" onClick={() => setOpen((v) => !v)}>
        <span className="tool-tick">{open ? "▾" : "▸"}</span>
        <span className="tool-output-name">{eventLabel(event.name)}</span>
        {summary && <span className="tool-output-summary">{summary}</span>}
        {event.status && <span className="tool-status">{event.status}</span>}
      </button>
      {open && output.trim() && <pre>{output}</pre>}
    </div>
  );
}

const FICONS = import.meta.glob("../assets/ficons/*.svg", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
function ficon(name: string): string | null {
  return FICONS[`../assets/ficons/${name}.svg`] ?? null;
}
const EXT_ICON: Record<string, string> = {
  py: "python", md: "markdown", markdown: "markdown", json: "json",
  js: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "react", jsx: "react",
  pdf: "pdf", png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", svg: "image",
  tex: "tex", bib: "tex", r: "r", jl: "julia", css: "css", html: "html",
  sh: "console", zsh: "console", bash: "console", csv: "table", tsv: "table",
  yml: "yaml", yaml: "yaml", toml: "toml", txt: "document", log: "document",
  gitignore: "git",
};
function FileTypeIcon({ ext }: { ext: string }) {
  if (ext === "local")
    return (
      <span className="fglyph">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.3">
          <rect x="2" y="3" width="12" height="8" rx="1.5" /><path d="M5.5 13.5h5" />
        </svg>
      </span>
    );
  const name = ext === "dir" ? "folder" : EXT_ICON[ext] ?? "file";
  const url = ficon(name);
  if (!url) return <span className="fglyph" />;
  return <img className="fglyph" src={url} alt="" width={16} height={16} />;
}

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
  kind?: "file" | "folder" | "zotero" | "quote";
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

function mentionLabel(path: string) {
  const clean = path.replace(/^@/, "").replace(/\/+$/, "");
  const name = clean.split("/").filter(Boolean).pop() ?? clean;
  return `@${name || clean}${path.endsWith("/") ? "/" : ""}`;
}

function isValidSkill(token: string, commands: { name: string }[]): boolean {
  const name = token.replace(/^\//, "");
  return commands.some((cmd) => cmd.name === name);
}

function PinBtn({ pinned, onClick }: { pinned: boolean; onClick: () => void }) {
  return (
    <button title={pinned ? t("action.unpin-chapter") : t("action.pin-chapter")} onClick={onClick}
      style={pinned ? { color: "#e8823a" } : undefined}>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M9.5 2.5l4 4-3 1-2.5 4.5-4-4L8.5 5.5l1-3z" />
        <path d="M5.5 10.5L2.5 13.5" />
      </svg>
    </button>
  );
}

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
  onStop: () => void;
  onAttachPath?: (path: string) => void;
  onAttachFolder?: (folder: string) => void;
  onAttachZotero?: (key: string) => void;
  goal: string | null;
  onClearGoal: () => void;
  layout: "split" | "chat" | "atelier";
  onToggleExpand: () => void;
  usage: { context: number; output: number; cost: number | null; turns: number | null } | null;
  onRevert: (index: number, text: string, edit: boolean) => void;
  onFork: (index: number) => void;
  onEditSend: (index: number, oldText: string, newText: string) => void;
  onNewChat: () => void;
  onOpenProject: () => void;
  defaults: {
    defaultProvider: "claude" | "codex";
    defaultModel: { claude: string; codex: string };
    defaultEffort: { claude: string; codex: string };
    defaultPermissionMode: string;
    timeFormat?: "system" | "24h" | "12h";
    customModels?: { provider: "claude" | "codex"; id: string }[];
    modelEfforts?: Record<string, string>;
    autoReview?: { enabled: boolean };
  };
  pins: { index: number; label: string; color?: string; style?: string }[];
  onStylePin: (index: number, patch: { color?: string; style?: string; label?: string }) => void;
  onTogglePin: (index: number, label: string) => void;
  disabled: boolean;
  onSubmit: (
    prompt: string,
    provider: "claude" | "codex",
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
      return;
    }
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 220) + "px";
  }, [text]);
  const [provider, setProvider] = useState<"claude" | "codex">("claude");
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  const [permissionMode, setPermissionMode] = useState("bypassPermissions");

  function effortFor(pv: "claude" | "codex", modelId: string): string {
    return (
      p.defaults.modelEfforts?.[pv + ":" + modelId] ??
      p.defaults.defaultEffort[pv] ??
      ""
    );
  }

  // appliquer les défauts des réglages (au montage et quand ils changent)
  useEffect(() => {
    const pv = p.defaults.defaultProvider;
    const m = p.defaults.defaultModel[pv] ?? "";
    setProvider(pv);
    setModel(m);
    setEffort(effortFor(pv, m));
    setPermissionMode(p.defaults.defaultPermissionMode);
  }, [p.defaults]);
  const [selIdx, setSelIdx] = useState(0);
  const [quote, setQuote] = useState<{ x: number; y: number; text: string } | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [review, setReview] = useState<{ status: string; verdict?: string; model?: string; checks?: number; issues?: { claim: string; problem: string; severity: string; fix?: string }[]; checkedTools?: string[]; checkedFiles?: string[] } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [barOpen, setBarOpen] = useState(false);
  const [openChipGroup, setOpenChipGroup] = useState<string | null>(null);
  const [fixing, setFixing] = useState(false);
  const [reviewMin, setReviewMin] = useState(false);
  useEffect(() => { setBarOpen(false); setFixing(false); setReviewMin(false); }, [p.threadId]);
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
  function toggleMark(text: string, kind: "hl" | "ul") {
    const t = text.trim();
    if (!t) return;
    const existing = marks.find((m) => m.text === t && m.kind === kind);
    saveMarks(existing ? marks.filter((m) => m !== existing) : [...marks, { text: t, kind }]);
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [effortMenuOpen, setEffortMenuOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);

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
  function modelsFor(pv: "claude" | "codex") {
    const customs = (p.defaults.customModels ?? [])
      .filter((m) => m.provider === pv)
      .map((m) => ({ id: m.id, label: m.id }));
    return [...MODELS[pv], ...customs];
  }
  function resolvedDefaultLabel(pv: "claude" | "codex"): string {
    const id = p.defaults.defaultModel[pv] ?? "";
    if (!id) return t("common.default-cli");
    const known = [...MODELS[pv], ...(p.defaults.customModels ?? [])
      .filter((m) => m.provider === pv).map((m) => ({ id: m.id, label: m.id }))]
      .find((m) => m.id === id);
    const eff = p.defaults.defaultEffort?.[pv];
    return (known?.label && known.label !== "__default" ? known.label : id) + (eff ? ` · ${eff}` : "");
  }
  function modelLabel(model: { label: string }, pv?: "claude" | "codex") {
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
  const [editing, setEditing] = useState<{ index: number; text: string } | null>(null);
  const [openToolGroups, setOpenToolGroups] = useState<Set<string>>(new Set());

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
  const slashMatch = /^\/([\w:-]*)$/.exec(text);
  const atMatch = /(^|\s)@([\w./:-]*)$/.exec(text);
  if (slashMatch) {
    const q = slashMatch[1].toLowerCase();
    suggestions = p.commands
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 12)
      .map((c) => ({ insert: `/${c.name} `, label: `/${c.name}`, hint: c.source }));
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
    setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}${paths.map((p) => mentionLabel(p as string)).join(" ")} `);
    for (const path of paths) p.onAttachPath?.(path as string);
  }

  const renderedEvents: (
    | { type: "event"; event: AgentEvent; index: number }
    | { type: "actions"; actions: Extract<AgentEvent, { kind: "tool" | "tool_update" }>[]; index: number; key: string }
  )[] = [];
  for (let i = 0; i < p.events.length; i++) {
    const e = p.events[i];
    if (e.kind !== "tool" && e.kind !== "tool_update") {
      renderedEvents.push({ type: "event", event: e, index: i });
      continue;
    }
    let end = i + 1;
    while (end < p.events.length && (p.events[end].kind === "tool" || p.events[end].kind === "tool_update")) end++;
    const actions = p.events.slice(i, end) as Extract<AgentEvent, { kind: "tool" | "tool_update" }>[];
    const first = actions[0];
    const groupKey = first?.kind === "tool_update"
      ? `tools:${first.id}`
      : `tools:${first?.name ?? i}:${i}`;
    if (actions.length >= 4) renderedEvents.push({ type: "actions", actions, index: i, key: groupKey });
    else actions.forEach((action, offset) => renderedEvents.push({ type: "event", event: action, index: i + offset }));
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
  const activeToolGroupKey = [...renderedEvents].reverse().find((item) => item.type === "actions")?.key;
  const selectedModel = modelsFor(provider).find((m) => m.id === model);
  const selectedModelLabel = selectedModel ? modelLabel(selectedModel) : model;
  const modelButtonLabel = model ? selectedModelLabel : resolvedDefaultLabel(provider);

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
      <button className="expand-btn" title={p.layout === "chat" ? t("action.restore-split-chat") : t("chat.full")}
        onClick={p.onToggleExpand}>
        {p.layout === "chat" ? <CollapseIcon /> : <ExpandIcon />}
      </button>
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
          setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 300);
        }}
      >
        {!p.threadId && (
          <div className="empty-card">
            <div className="empty-title">{t("chat.empty-ready")}</div>
            <div className="empty-actions">
              <button type="button" className="empty-action" onClick={p.onNewChat}>
                {t("action.new-chat")}
              </button>
              <button
                type="button"
                className="empty-action"
                onClick={() => window.dispatchEvent(new CustomEvent("atelier-open-resume", { detail: { provider: "claude" } }))}
              >
                <ResumeIcon /> {t("action.resume-session")}
              </button>
              <button type="button" className="empty-action" onClick={p.onOpenProject}>
                {t("action.open-project")}
              </button>
            </div>
          </div>
        )}
        {p.threadId && p.events.length === 0 && (
          <div className="empty">{t("chat.empty")}</div>
        )}
        {renderedEvents.map((item) => {
          if (item.type === "actions") {
            const open = openToolGroups.has(item.key) || (p.workingSince != null && item.key === activeToolGroupKey);
            return (
              <div key={item.key} className="tool-group">
                <button
                  type="button"
                  className="tool-group-row"
                  onClick={() =>
                    setOpenToolGroups((prev) => {
                      const next = new Set(prev);
                      if (next.has(item.key)) next.delete(item.key);
                      else next.add(item.key);
                      return next;
                    })
                  }
                >
                  <span>{t("chat.actions-used", { count: item.actions.length })}</span>
                  <span className="tool-tick">{open ? "▾" : "▸"}</span>
                </button>
                {open && (
                  <div className="tool-group-list">
                    {item.actions.map((action, offset) => renderToolLine(action, offset))}
                  </div>
                )}
              </div>
            );
          }
          const e = item.event;
          const i = item.index;
          if (e.kind === "user")
            return (
              <div key={i} id={`msg-${i}`} className="user-wrap">
                {e.imageUrl && <img className="user-img" src={e.imageUrl} alt="" />}
                {e.label && <div className="user-label">{e.label}</div>}
                {editing?.index === i ? (
                  <div className="edit-box">
                    <textarea
                      autoFocus
                      value={editing.text}
                      rows={Math.min(8, Math.max(2, editing.text.split("\n").length))}
                      onChange={(ev) => setEditing({ index: i, text: ev.target.value })}
                      onKeyDown={(ev) => {
                        if (ev.key === "Escape") setEditing(null);
                        if (ev.key === "Enter" && !ev.shiftKey) {
                          ev.preventDefault();
                          if (editing.text.trim()) {
                            p.onEditSend(i, e.text, editing.text);
                            setEditing(null);
                          }
                        }
                      }}
                    />
                    <div className="edit-actions">
                      <button type="button" className="edit-cancel" onClick={() => setEditing(null)}>
                        {t("action.cancel")}
                      </button>
                      <button
                        type="button"
                        className="edit-send"
                        onClick={() => {
                          if (editing.text.trim()) {
                            p.onEditSend(i, e.text, editing.text);
                            setEditing(null);
                          }
                        }}
                      >
                        {t("action.send")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="user-bubble">
                    {(() => {
                      const m = /^(\/[\w:-]+)([\s\S]*)$/.exec(e.text);
                      if (m && isValidSkill(m[1], p.commands)) {
                        return (
                          <>
                            <span className="slash-cmd">{m[1]}</span>
                            {m[2]}
                          </>
                        );
                      }
                      return e.text;
                    })()}
                  </div>
                )}
                <div className="msg-actions">
                  {e.ts && (
                    <span className="msg-time">
                      {fmtTime(e.ts, p.defaults.timeFormat)}
                    </span>
                  )}
                  <button title={t("action.copy")} onClick={() => navigator.clipboard.writeText(e.text)}>
                    <CopyIcon />
                  </button>
                  <button title={t("action.edit-resend")} onClick={() => setEditing({ index: i, text: e.text })}>✎</button>
                  <button title={t("chat.revert-title")} onClick={() => p.onRevert(i, e.text, false)}>↩</button>
                  <PinBtn pinned={p.pins.some((c) => c.index === i)} onClick={() => p.onTogglePin(i, e.text.slice(0, 44))} />
                </div>
              </div>
            );
          if (e.kind === "streaming")
            return (
              <div key={i} className="msg-wrap">
                <div className="msg">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS as any}>{e.text}</ReactMarkdown>
                  <span className="stream-caret" />
                </div>
              </div>
            );
          if (e.kind === "text")
            return (
              <div key={i} id={`msg-${i}`} className="msg-wrap">
                <div className="msg">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS as any}>{e.text}</ReactMarkdown>
                </div>
                <div className="msg-actions">
                  {"ts" in e && e.ts && (
                    <span className="msg-time">
                      {fmtTime(e.ts, p.defaults.timeFormat)}
                    </span>
                  )}
                  <button title={t("action.copy")} onClick={() => navigator.clipboard.writeText(e.text)}>
                    <CopyIcon />
                  </button>
                  <button title={t("action.fork")} onClick={() => p.onFork(i)}>
                    <ForkIcon />
                  </button>
                  <PinBtn pinned={p.pins.some((c) => c.index === i)} onClick={() => p.onTogglePin(i, e.text.replace(/[#*>`]/g, "").trim().slice(0, 44))} />
                </div>
              </div>
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
          if (e.kind === "error")
            return (
              <div key={i} className="error">
                ⚠ {e.message}
              </div>
            );
          if (e.kind === "done") {
            const isLastDone = !p.events.slice(i + 1).some((x) => x.kind === "done");
            return (
              <div key={i} id={isLastDone ? "last-done" : undefined} className="done">
                {e.ok ? t("chat.done-ok") : t("chat.done-fail")}
                {isLastDone && !review && (
                  <button
                    className="done-verify"
                    title={t("review.verify")}
                    onClick={() => {
                      setReview({ status: "running" });
                      window.dispatchEvent(new CustomEvent("request-review", { detail: { threadId: p.threadId } }));
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 1.8l5 2v4c0 3.2-2.2 5.4-5 6.4-2.8-1-5-3.2-5-6.4v-4z" />
                      <path d="M5.8 8l1.6 1.6L10.5 6.3" />
                    </svg>
                    {t("review.verify-now")}
                  </button>
                )}
                {isLastDone && review && (
                  <span
                    className={`review-badge v-${review.status === "running" ? "running" : review.verdict}`}
                    onClick={() => review.issues?.length && setReviewOpen((v) => !v)}
                  >
                    {review.status === "running" ? t("review.running")
                      : review.verdict === "ok" ? t("review.ok")
                      : review.verdict === "issues" ? t("review.issues", { n: review.issues?.length ?? 0 })
                      : t("review.inconclusive")}
                  </span>
                )}
                {isLastDone && reviewOpen && review?.issues?.length ? (
                  <div className="review-detail">
                    {review.issues.map((iss, k) => (
                      <div key={k} className={`review-issue s-${iss.severity}`}>
                        <div className="ri-claim">« {iss.claim} »</div>
                        <div className="ri-problem">{iss.problem}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
                <DoneDiffToggle event={e} threadId={p.threadId} />
              </div>
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
              toggleMark(quote.text, "hl");
              setQuote(null);
              window.getSelection()?.removeAllRanges();
            }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M10.5 2.5l3 3L6 13H3v-3z" /><path d="M9 4l3 3" />
            </svg>
            {t("chat.highlight")}
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              toggleMark(quote.text, "ul");
              setQuote(null);
              window.getSelection()?.removeAllRanges();
            }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M4 2.5v5a4 4 0 008 0v-5" /><path d="M3.5 13.5h9" />
            </svg>
            {t("chat.underline")}
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
      <form
        className="composer"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (!text.trim()) return;
          p.onSubmit(text, provider, model, effort, permissionMode, "steer");
          setText("");
        }}
      >
        {suggestions.length > 0 && (
          <ul className="suggest">
            {suggestions.map((s, i) => (
              <React.Fragment key={s.insert + s.label}>
                {s.section && (i === 0 || suggestions[i - 1].section !== s.section) && (
                  <li className="suggest-section">{s.section}</li>
                )}
                <li
                  className={i === selIdx ? "sel" : ""}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applySuggestion(s);
                  }}
                >
                  <span className="suggest-main">
                    {s.icon && <FileTypeIcon ext={s.icon} />}
                    <b>{s.label}</b>
                  </span>
                  {s.hint && <span className="hint">{s.hint}</span>}
                </li>
              </React.Fragment>
            ))}
          </ul>
        )}
        {p.goal && (
          <div className="goal-pill" title={p.goal}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <circle cx="8" cy="8" r="6.2" />
              <circle cx="8" cy="8" r="2.2" fill="currentColor" stroke="none" />
            </svg>
            <span className="goal-label">{t("chat.goal")}</span>
            <span className="goal-cond">{p.goal.slice(0, 80)}{p.goal.length > 80 ? "…" : ""}</span>
            <button type="button" className="ghost" title={t("chat.goal-clear")}
              onClick={p.onClearGoal}><CloseIcon /></button>
          </div>
        )}
        {p.attachments.length > 0 && (
          <div className="chips-row">
            {p.attachments.map((a, i) => a.imageUrl ? (
              <div key={i} className="img-chip">
                <img src={a.imageUrl} alt={a.name} />
                <button type="button" className="img-chip-x" onClick={() => p.onRemoveAttachment(i)}>
                  <CloseIcon />
                </button>
                <span className="img-chip-name">{a.name}</span>
              </div>
            ) : null)}
            {(() => {
              // grouper les citations par source : « Williamson…pdf ×3 » au lieu de 3 chips
              const groups: { name: string; idxs: number[]; first: typeof p.attachments[number] }[] = [];
              p.attachments.forEach((a, i) => {
                if (a.imageUrl) return;
                const g = groups.find((x) => x.name === a.name);
                if (g) g.idxs.push(i); else groups.push({ name: a.name, idxs: [i], first: a });
              });
              return groups.map((g) => {
                const a = g.first;
                const many = g.idxs.length > 1;
                return (
                  <div key={g.name} className={`chip ${many ? "chip-grouped" : ""}`}>
                    <svg className="chip-doc" width="11" height="13" viewBox="0 0 11 13" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
                      <rect x="0.8" y="0.8" width="9.4" height="11.4" rx="1.6" />
                      <path d="M3 4.4h5M3 6.8h5M3 9.2h3.4" />
                    </svg>
                    <span className="chip-label" title={a.name} onClick={() => many && setOpenChipGroup(openChipGroup === g.name ? null : g.name)}
                      style={many ? { cursor: "pointer" } : undefined}>
                      {citeLabel(a.name)}
                    </span>
                    {many ? <span className="chip-count" onClick={() => setOpenChipGroup(openChipGroup === g.name ? null : g.name)}>×{g.idxs.length}</span>
                      : a.lines && <span className="chip-lines">{t("chat.lines", { lines: a.lines })}</span>}
                    {!many && a.preview && (
                      <span className="chip-preview" role="tooltip">
                        <strong>{a.preview.title}</strong>
                        {a.preview.rows.map((row, j) => (
                          <span key={j} className="chip-preview-row">
                            <em>{row.label}</em>
                            <span>{row.value}</span>
                          </span>
                        ))}
                      </span>
                    )}
                    <button type="button" className="ghost" onClick={() => {
                      [...g.idxs].sort((x, y) => y - x).forEach((idx) => p.onRemoveAttachment(idx));
                      setOpenChipGroup(null);
                    }}>
                      <CloseIcon />
                    </button>
                    {many && openChipGroup === g.name && (
                      <div className="chip-group-pop">
                        {g.idxs.map((idx, k) => {
                          const it = p.attachments[idx];
                          return (
                            <div key={idx} className="cgp-row">
                              <span className="cgp-n">{k + 1}</span>
                              <span className="cgp-txt">{it.lines ? t("chat.lines", { lines: it.lines }) : (it.text || "").replace(/\s+/g, " ").slice(0, 60)}</span>
                              <button type="button" className="ghost" onClick={() => p.onRemoveAttachment(idx)}><CloseIcon /></button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        )}
        <div className={`ta-wrap ${(() => {
          const m = /^(\/[\w:-]+)/.exec(text);
          if (m && isValidSkill(m[1], p.commands)) return "slash-active";
          if (/(^|\s)@[\w./:-]+/.test(text)) return "slash-active";
          return "";
        })()}`}>
        <div className="ta-backdrop" aria-hidden="true">
          {(() => {
            const m = /^(\/[\w:-]+)([\s\S]*)$/.exec(text);
            if (m && isValidSkill(m[1], p.commands)) {
              return (
                <>
                  <span className="slash-cmd-inline">{m[1]}</span>
                  {m[2]}
                </>
              );
            }
            // mentions @fichier → pilules bleues
            const parts = text.split(/((?:^|\s)@[\w./:-]+)/g);
            if (parts.length > 1) {
              return parts.map((seg, k) => {
                const mm = /^(\s?)(@[\w./:-]+)$/.exec(seg);
                if (mm) return <React.Fragment key={k}>{mm[1]}<span className="at-mention">{mentionLabel(mm[2])}</span></React.Fragment>;
                return <React.Fragment key={k}>{seg}</React.Fragment>;
              });
            }
            return text;
          })()}
        </div>
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onScroll={(e) => {
            const bd = e.currentTarget.parentElement?.querySelector(".ta-backdrop");
            if (bd) bd.scrollTop = e.currentTarget.scrollTop;
          }}
          onPaste={(e) => {
            for (const item of e.clipboardData.items) {
              if (item.type.startsWith("image/")) {
                e.preventDefault();
                const file = item.getAsFile();
                if (!file) continue;
                const reader = new FileReader();
                reader.onload = () => p.onPasteImage(String(reader.result));
                reader.readAsDataURL(file);
                return;
              }
            }
          }}
          onKeyDown={(e) => {
            if (suggestions.length > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelIdx((i) => (i + 1) % suggestions.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
                return;
              }
              if (e.key === "Tab" || e.key === "Enter") {
                e.preventDefault();
                applySuggestion(suggestions[Math.min(selIdx, suggestions.length - 1)]);
                return;
              }
              if (e.key === "Escape") {
                setText((t) => t + " ");
                return;
              }
            }
            if (e.key === "Escape" && p.workingSince != null) {
              e.preventDefault();
              p.onStop();
              return;
            }
            if (e.key === "Enter" && e.altKey) {
              e.preventDefault();
              window.dispatchEvent(new CustomEvent("quick-ask-open", { detail: { draft: text } }));
              return;
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement).requestSubmit();
            }
          }}
          disabled={p.disabled}
          rows={1}
          placeholder={t("chat.placeholder")}
        />
        </div>
        <div className="composer-bar">
          <span className="plus-wrap" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="ghost qa-zap-btn" title={t("qa.open") + " (⌥⌘K)"}
              onClick={() => window.dispatchEvent(new CustomEvent("quick-ask-toggle"))}>
              <ZapIcon />
            </button>
            <button type="button" className="ghost" title={t("action.add-file-image")} onClick={() => setPlusOpen((v) => !v)}>
              <PlusIcon />
            </button>
            {plusOpen && (
              <div className="mp-menu plus-up">
                <div className="mp-item" onClick={() => { setPlusOpen(false); attachFiles(); }}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                    <path d="M13.5 7.5l-5 5a3.2 3.2 0 0 1-4.5-4.5l5.5-5.5a2.2 2.2 0 0 1 3.1 3.1l-5.5 5.5a1.1 1.1 0 0 1-1.6-1.6l5-5" />
                  </svg>
                  <span>{t("action.add-file-image")}</span>
                </div>
                <div className="mp-item" onClick={() => setPermissionMode(permissionMode === "plan" ? "bypassPermissions" : "plan")}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                    <path d="M2.5 4h2M6.5 4h7M2.5 8h2M6.5 8h7M2.5 12h2M6.5 12h7" />
                  </svg>
                  <span>{t("permission.plan")}</span>
                  <span className={`toggle ${permissionMode === "plan" ? "on" : ""}`}>
                    <span className="knob" />
                  </span>
                </div>
                <div className="mp-item" onClick={() =>
                  window.dispatchEvent(new CustomEvent("autoreview-toggle"))
                }>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 1.8l5 2v4c0 3.2-2.2 5.4-5 6.4-2.8-1-5-3.2-5-6.4v-4z" />
                    <path d="M5.8 8l1.6 1.6L10.5 6.3" />
                  </svg>
                  <span>Auto-review</span>
                  <span className={`toggle ${p.defaults.autoReview?.enabled ? "on" : ""}`}>
                    <span className="knob" />
                  </span>
                </div>
              </div>
            )}
          </span>
          <Select
            compact
            title={t("settings.permission-default")}
            value={permissionMode}
            onChange={setPermissionMode}
            options={PERMISSION_MODES.map((m) => ({ value: m.id, label: t(m.labelKey as any) }))}
          />
          <span className="flex" />
          {p.usage && (
            <span className="ctx-ring-wrap">
              {(() => {
                const WINDOW = (p.usage as any).window
                  ?? (model.includes("[1m]") ? 1_000_000 : 200_000);
                const pct = Math.min(100, Math.round((p.usage.context / WINDOW) * 100));
                const r = 6.5, c = 2 * Math.PI * r;
                return (
                  <>
                    <svg className="ctx-ring" width="18" height="18" viewBox="0 0 18 18">
                      <circle cx="9" cy="9" r={r} fill="none" stroke="var(--bg-ctl)" strokeWidth="2.4" />
                      <circle cx="9" cy="9" r={r} fill="none"
                        stroke={pct > 80 ? "#e06c75" : pct > 60 ? "#e0b74a" : "var(--muted)"}
                        strokeWidth="2.4" strokeLinecap="round"
                        strokeDasharray={`${(pct / 100) * c} ${c}`}
                        transform="rotate(-90 9 9)" />
                    </svg>
                    <span className="ctx-pop">
                      <b>{t("chat.context-window")}</b>
                      <span>{t("chat.context-used", { pct, used: Math.round(p.usage.context / 1000), window: WINDOW >= 1_000_000 ? "1M" : Math.round(WINDOW / 1000) + "k" })}</span>
                      <span>{t("chat.last-output", { tokens: Math.round(p.usage.output / 1000 * 10) / 10 })}</span>
                      {p.usage.turns != null && <span>{t("chat.session-turns", { turns: p.usage.turns })}</span>}
                      {p.usage.cost != null && <span>{t("chat.cost", { cost: p.usage.cost.toFixed(2) })}</span>}
                    </span>
                  </>
                );
              })()}
            </span>
          )}
          <span className="model-pick" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="mp-btn"
              onClick={() => { setMenuOpen((v) => !v); setEffortMenuOpen(false); }}
            >
              <ProviderIcon provider={provider} />
              <span className={!model ? "mp-dim" : undefined}>{modelButtonLabel}</span>
            </button>
            {menuOpen && (
              <div className="mp-menu">
                {(["claude", "codex"] as const).map((pv, pi) => (
                  <div key={pv}>
                    {pi > 0 && <div className="mp-sep" />}
                    <div className="mp-hd">
                      <ProviderIcon provider={pv} size={11} /> {pv === "claude" ? "Claude" : "Codex"}
                    </div>
                    {sortByFav(modelsFor(pv), pv).map((m) => {
                      const key = pv + ":" + m.id;
                      const active = provider === pv && model === m.id;
                      const fav = favModels.includes(key);
                      return (
                        <div
                          key={key}
                          className="mp-item"
                          onClick={() => {
                            setProvider(pv);
                            setModel(m.id);
                            setEffort(effortFor(pv, m.id));
                          }}
                        >
                          <ProviderIcon provider={pv} />
                          <span>{modelLabel(m, pv)}</span>
                          <span className="mp-end">
                            {active && <span className="mp-check">✓</span>}
                            <span
                              className={`mp-star ${fav ? "on" : ""}`}
                              title={fav ? t("action.remove-favorite") : t("action.add-favorite")}
                              onClick={(e) => { e.stopPropagation(); toggleFavModel(key); }}
                            >
                              {fav ? "★" : "☆"}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
                {provider === "claude" && (
                  <>
                    <div className="mp-sep" />
                    <div className="mp-hd">{t("chat.context")}</div>
                    {[
                      { id: "200k", label: t("chat.context-200k"), on: !model.includes("[1m]") },
                      { id: "1m", label: "1M", on: model.includes("[1m]") },
                    ].map((ctx) => (
                      <div key={ctx.id} className="mp-item"
                        onClick={() => {
                          if (ctx.id === "1m" && !model.includes("[1m]")) {
                            setModel((model || "claude-sonnet-5") + "[1m]");
                          } else if (ctx.id === "200k" && model.includes("[1m]")) {
                            setModel(model.replace(/\[1m\]$/, ""));
                          }
                        }}>
                        <span>{ctx.label}</span>
                        {ctx.on && <span className="mp-check">✓</span>}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </span>
          <span className="model-pick" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="mp-btn mp-effort"
              title={t("chat.effort")}
              onClick={() => { setEffortMenuOpen((v) => !v); setMenuOpen(false); }}
            >
              <span className={!effort ? "mp-dim" : undefined}>{effort || t("common.auto-default")}</span>
            </button>
            {effortMenuOpen && (
              <div className="mp-menu">
                <div className="mp-hd">{t("chat.effort")}</div>
                {EFFORTS[provider].map((lvl) => {
                  const labels: Record<string, string> = {
                    "": t("common.auto-default"), low: "Low", medium: "Medium", high: "High",
                    xhigh: "Extra High", max: "Max", minimal: "Minimal",
                  };
                  return (
                    <div key={lvl} className="mp-item" onClick={() => { setEffort(lvl); setEffortMenuOpen(false); }}>
                      <span>{labels[lvl] ?? lvl}</span>
                      {effort === lvl && <span className="mp-check">✓</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </span>
          {p.workingSince != null ? (
            <>
              <button
                type="button"
                className="queue-btn"
                disabled={p.disabled || !text.trim()}
                title={t("action.queue-title")}
                onClick={() => {
                  if (!text.trim()) return;
                  p.onSubmit(text, provider, model, effort, permissionMode, "queue");
                  setText("");
                }}
              >
                ⏱ {t("action.queue")}
              </button>
              <button className="send steer" disabled={p.disabled} title={t("action.send-now")}>
                ↑
              </button>
            </>
          ) : (
            <button className="send" disabled={p.disabled} title={t("action.send")}>
              ↑
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
