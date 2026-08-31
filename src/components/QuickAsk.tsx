import { useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { t } from "../lib/i18n";
import { ProviderIcon, ZapIcon } from "./icons";
import { wsSend } from "../lib/wsBus";
import { buildQuickAskPrompt, type QaContext } from "../lib/quickAskContext";
import { normalizeMathDelimiters } from "../lib/markdown";
import { chatSelection, threadModelKey } from "../lib/quickAskModel";
import { resizeBox, type ResizeEdge } from "../lib/quickAskBox";
import { clampToolbarLeft } from "../lib/selectionToolbar";
import { useMdPlugins } from "./chat/md";
import type { ProviderInfo } from "../lib/providers";
import { modelDisplayLabel } from "../lib/modelCatalog";
import { Textarea } from "./shadcn/textarea";
import { Button, IconButton, RowButton } from "./ui";
import { Select as ProductSelect } from "./Select";
import { Button as ShadcnButton } from "./shadcn/button";
import { Field, FieldGroup, FieldLabel } from "./shadcn/field";
import {
  Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger,
} from "./shadcn/popover";

type QaMsg = { role: "user" | "assistant"; text: string; streaming?: boolean; context?: QaContext };
type QaRecent = { qaId: string; ts: number; msgs: QaMsg[] };
const RECENTS_KEY = "atelier-studio.qaRecents";

function loadRecents(): QaRecent[] {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]"); } catch { return []; }
}
function saveRecent(qaId: string, msgs: QaMsg[]) {
  if (!msgs.some((m) => m.role === "assistant")) return;
  const clean = msgs.map((m) => ({ role: m.role, text: m.text, context: m.context }));
  const rest = loadRecents().filter((r) => r.qaId !== qaId);
  localStorage.setItem(RECENTS_KEY, JSON.stringify([{ qaId, ts: Date.now(), msgs: clean }, ...rest].slice(0, 20)));
}
type QaSelection = { provider: string; model: string; effort: string };
/** Capture collée : la vignette est immédiate, le chemin arrive du backend. */
type QaImage = { dataURL: string; name: string; path: string | null };
// Une fenêtre se prend par ses huit côtés, pas seulement par un coin.
const RESIZE_EDGES: ResizeEdge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
const MIN_BOX = { w: 380, h: 240 };
const QA_SELECTION_KEY = "atelier-studio.qaSelection";
const DEFAULT_QA_SELECTION: QaSelection = { provider: "grok", model: "grok-4.6", effort: "high" };

function loadSelection(): QaSelection {
  try {
    const saved = JSON.parse(localStorage.getItem(QA_SELECTION_KEY) ?? "null");
    return saved?.provider && saved?.model ? saved : DEFAULT_QA_SELECTION;
  } catch {
    return DEFAULT_QA_SELECTION;
  }
}

/// Message lisible d'un turn échoué : `result` porte souvent un JSON
/// `{"error":{"message":…}}` (codex), sinon on montre le texte brut.
function qaFailureMessage(result: unknown): string {
  const raw = typeof result === "string" ? result.trim() : "";
  if (raw) {
    try {
      const msg = JSON.parse(raw)?.error?.message;
      if (typeof msg === "string" && msg) return msg;
    } catch { /* pas du JSON — texte brut */ }
    return raw;
  }
  return t("qa.turn-failed");
}

/** D'où vient le passage cité : le fichier, sinon le fil, sinon l'auteur. */
function qaContextSource(ctx: QaContext): string {
  if (ctx.source) return ctx.source.lines ? `${ctx.source.file} (${ctx.source.lines})` : ctx.source.file;
  if (ctx.threadTitle) return ctx.threadTitle;
  return ctx.role === "user" ? t("qa.ctx-from-user") : t("qa.ctx-from-assistant");
}

/** Remonte d'un nœud surligné jusqu'à l'index du message qui le porte. */
function qaMsgIndexFromNode(node: Node | null): number | null {
  const start = node?.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node?.parentElement ?? null;
  const host = start?.closest<HTMLElement>("[data-qa-msg]");
  const raw = host?.dataset.qaMsg;
  const index = raw == null ? NaN : Number(raw);
  return Number.isInteger(index) ? index : null;
}

function clampBox(b: { x: number; y: number; w: number; h: number }) {
  const gap = 8;
  const w = Math.min(b.w, Math.max(320, window.innerWidth - gap * 2));
  const h = Math.min(b.h, Math.max(240, window.innerHeight - gap * 2));
  return {
    x: Math.min(Math.max(gap, b.x), Math.max(gap, window.innerWidth - w - gap)),
    y: Math.min(Math.max(gap, b.y), Math.max(gap, window.innerHeight - h - gap)),
    w,
    h,
  };
}

export default function QuickAsk({
  open,
  minimized,
  draft,
  context,
  activeThreadId,
  activeProject,
  providers,
  customModels = [],
  defaultModels = {},
  defaultEfforts = {},
  modelEfforts = {},
  onMinimize,
  onClose,
  onInject,
  onPromote,
}: {
  open: boolean;
  minimized: boolean;
  draft: string;
  context?: QaContext | null;
  /** fil affiché dans le chat — le Quick Ask emprunte son modèle */
  activeThreadId?: string | null;
  /** dossier du projet ouvert — le Quick Ask y lance son CLI, comme le chat */
  activeProject?: string | null;
  providers: ProviderInfo[];
  customModels?: { provider: string; id: string }[];
  defaultModels?: Record<string, string>;
  defaultEfforts?: Record<string, string>;
  modelEfforts?: Record<string, string>;
  onMinimize: () => void;
  onClose: () => void;
  onInject: (text: string) => void;
  onPromote: (qaId: string, title: string) => void;
}) {
  const mdPlugins = useMdPlugins();
  const [qaId, setQaId] = useState<string>(() => crypto.randomUUID());
  const [msgs, setMsgs] = useState<QaMsg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [ctx, setCtx] = useState<QaContext | null>(null);
  const [selection, setSelectionState] = useState<QaSelection>(loadSelection);
  const [recentsOpen, setRecentsOpen] = useState(false);
  const [promoteErr, setPromoteErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("atelier-studio.qaBox") ?? "null");
      return saved ? clampBox(saved) : null;
    }
    catch { return null; }
  });
  function saveBox(b: { x: number; y: number; w: number; h: number }) {
    const next = clampBox(b);
    setBox(next);
    localStorage.setItem("atelier-studio.qaBox", JSON.stringify(next));
  }

  function setSelection(next: QaSelection) {
    setSelectionState(next);
    localStorage.setItem(QA_SELECTION_KEY, JSON.stringify(next));
  }
  function startDrag(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const el = popRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ox = e.clientX - r.left, oy = e.clientY - r.top;
    const move = (ev: MouseEvent) => {
      saveBox({
        x: Math.min(window.innerWidth - 120, Math.max(0, ev.clientX - ox)),
        y: Math.min(window.innerHeight - 80, Math.max(0, ev.clientY - oy)),
        w: r.width, h: r.height,
      });
    };
    const up = () => {
      document.body.classList.remove("dragging");
      window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up);
    };
    document.body.classList.add("dragging");
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }
  function startResize(e: React.MouseEvent, edge: ResizeEdge) {
    e.preventDefault();
    e.stopPropagation();
    const el = popRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const move = (ev: MouseEvent) => {
      saveBox(resizeBox(r, edge, { x: ev.clientX, y: ev.clientY }, MIN_BOX));
    };
    const up = () => {
      document.body.classList.remove("dragging");
      window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up);
    };
    // Au-dessus d'une iframe (galerie, PDF, biblio) le pointeur quitte le
    // document parent et le geste se fige : `body.dragging` les neutralise
    // le temps du glissement (App.css, convention du splitter).
    document.body.classList.add("dragging");
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }
  const bodyRef = useRef<HTMLDivElement>(null);

  // Captures collées dans le champ : même geste que le composeur du chat —
  // la vignette remplace le chemin de fichier que WebKit collait en clair.
  const [images, setImages] = useState<QaImage[]>([]);
  useEffect(() => {
    const onSaved = (e: Event) => {
      const { path, name, dataURL } = (e as CustomEvent).detail ?? {};
      if (typeof path !== "string") return;
      setImages((prev) => prev.map((img) => (
        img.path === null && (dataURL == null || img.dataURL === dataURL)
          ? { ...img, path, name: typeof name === "string" ? name : img.name }
          : img
      )));
    };
    window.addEventListener("qa-image-saved", onSaved);
    return () => window.removeEventListener("qa-image-saved", onSaved);
  }, []);

  function pasteImage(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataURL = String(reader.result);
      setImages((prev) => [...prev, { dataURL, path: null, name: file.name || t("qa.image-pending") }]);
      window.dispatchEvent(new CustomEvent("qa-paste-image", { detail: { dataURL } }));
    };
    reader.readAsDataURL(file);
  }

  // « Ajouter au chat » DANS le Quick Ask : surligner un passage de la réponse
  // et le reposer en contexte de la question suivante, sans repasser par le
  // chat principal — la fenêtre est une conversation à part entière.
  const [quote, setQuote] = useState<{ x: number; y: number; text: string; msgIndex: number | null } | null>(null);
  const selToolbarRef = useRef<HTMLDivElement>(null);
  const [selToolbarLeft, setSelToolbarLeft] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!quote) { setSelToolbarLeft(null); return; }
    const bar = selToolbarRef.current;
    const host = popRef.current;
    if (!bar || !host) return;
    const zone = host.getBoundingClientRect();
    setSelToolbarLeft(clampToolbarLeft(quote.x, bar.offsetWidth, { left: zone.left, right: zone.right }));
  }, [quote?.x, quote?.y, quote?.text]);

  function onBodyMouseUp() {
    // La sélection n'est pas encore posée au moment du mouseup.
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? "";
      const host = bodyRef.current;
      if (!text || !sel || sel.rangeCount === 0 || !host) { setQuote(null); return; }
      const range = sel.getRangeAt(0);
      if (!host.contains(range.startContainer)) { setQuote(null); return; }
      const rect = range.getBoundingClientRect();
      setQuote({
        x: rect.left + rect.width / 2,
        y: rect.top,
        text,
        msgIndex: qaMsgIndexFromNode(range.startContainer),
      });
    }, 0);
  }

  useEffect(() => {
    if (!box) return;
    const fit = () => saveBox(box);
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [box?.x, box?.y, box?.w, box?.h]);

  // ouverture : reset de session, pré-remplissage du brouillon
  const wasMin = useRef(false);
  useEffect(() => {
    if (!open) { wasMin.current = minimized; return; }
    if (wasMin.current) { wasMin.current = false; inputRef.current?.focus(); return; }
    archive();
    setQaId(crypto.randomUUID());
    // Le modèle du chat prime sur le dernier choix manuel : poser une
    // question de côté sur une réponse ne doit pas changer de cerveau en
    // route (capture Thierry 2026-08-26 : chat sous GLM, Quick Ask sous Grok).
    const key = threadModelKey(activeThreadId ?? null);
    const suivi = key ? chatSelection(localStorage.getItem(key)) : null;
    if (suivi) setSelectionState(suivi);
    setMsgs([]);
    setText(draft);
    setCtx(context ?? null);
    setQuote(null);
    setImages([]);
    setBusy(false);
    setRecentsOpen(false);
    setPromoteErr(null);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  // L'historique ne se remplissait que dans close() — un chemin que la
  // fenêtre n'offre même pas (aucun bouton fermer : le ✕ du bandeau est
  // l'icône du provider). Minimiser, vider ou quitter perdait le tour sans
  // trace (ui.json du 2026-08-26 : qaRecents jamais écrit). On archive donc
  // à chaque fois que la conversation est remplacée ou disparaît, via une
  // ref — le nettoyage de démontage ne voit pas l'état du dernier rendu.
  const latest = useRef({ qaId, msgs });
  latest.current = { qaId, msgs };
  function archive() {
    saveRecent(latest.current.qaId, latest.current.msgs);
  }
  useEffect(() => () => archive(), []);

  function close() {
    archive();
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    const onErr = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d.qaId === qaId) setPromoteErr(d.message);
    };
    window.addEventListener("qa-promote-error", onErr);
    return () => window.removeEventListener("qa-promote-error", onErr);
  }, [open, qaId]);

  // contexte ajouté depuis le chat principal pendant qu'une conversation vit
  useEffect(() => {
    const onAdd = (e: Event) => {
      const next = ((e as CustomEvent).detail?.context as QaContext | undefined) ?? null;
      if (next) setCtx(next);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    };
    window.addEventListener("qa-add-context", onAdd);
    return () => window.removeEventListener("qa-add-context", onAdd);
  }, []);

  // événements de la session éphémère
  useEffect(() => {
    const onEvent = (e: Event) => {
      const { qaId: id, event } = (e as CustomEvent).detail;
      if (id !== qaId) return;
      setMsgs((prev) => {
        const list = [...prev];
        const last = list[list.length - 1];
        if (event.kind === "delta") {
          if (last?.streaming) list[list.length - 1] = { ...last, text: last.text + event.text };
          else list.push({ role: "assistant", text: event.text, streaming: true });
          return list;
        }
        if (event.kind === "stream_set") {
          if (last?.streaming) list[list.length - 1] = { ...last, text: event.text };
          else list.push({ role: "assistant", text: event.text, streaming: true });
          return list;
        }
        if (event.kind === "text") {
          if (last?.streaming) list[list.length - 1] = { role: "assistant", text: event.text };
          else list.push({ role: "assistant", text: event.text });
          return list;
        }
        if (event.kind === "done" || event.kind === "error") {
          if (last?.streaming) list[list.length - 1] = { ...last, streaming: false };
          if (event.kind === "error") list.push({ role: "assistant", text: `⚠ ${event.message}` });
          // Un turn qui échoue en amont (effort refusé, clé invalide…) ne
          // produit aucun événement `error` : seulement done ok:false avec le
          // détail dans `result`. Sans ce cas, la fenêtre restait muette.
          else if (event.ok === false && !list[list.length - 1]?.text.startsWith("⚠")) {
            list.push({ role: "assistant", text: `⚠ ${qaFailureMessage(event.result)}` });
          }
        }
        return list;
      });
      if (event.kind === "done" || event.kind === "error") setBusy(false);
    };
    window.addEventListener("qa-event", onEvent);
    return () => window.removeEventListener("qa-event", onEvent);
  }, [qaId]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [msgs]);
  if (minimized) return null;
  if (!open) return null;

  const fallbackProviders: ProviderInfo[] = [
    // Repli affiché avant l'arrivée de providerStatus : aligné sur le défaut du CLI.
    {
      id: "grok", label: "Grok", kind: "cli", version: null, ok: true,
      defaultModel: "grok-4.6", models: ["grok-4.6", "grok-4.5"],
      modelLabels: { "grok-4.6": "Grok 4.6", "grok-4.5": "Grok 4.5" },
      efforts: ["minimal", "low", "medium", "high", "xhigh", "max"],
    },
  ];
  const catalog = (providers.length ? providers : fallbackProviders).map((info) => ({
    ...info,
    models: Array.from(new Set([
      ...info.models,
      ...customModels.filter((item) => item.provider === info.id).map((item) => item.id),
    ])),
  }));
  const selectedProvider = catalog.find((info) => info.id === selection.provider) ?? catalog[0];
  const selectedModels = selectedProvider?.models ?? [selection.model];
  const selectedEfforts = selectedProvider?.efforts?.length ? selectedProvider.efforts : [selection.effort || "high"];
  const selectedModel = selectedModels.includes(selection.model)
    ? selection.model
    : selectedProvider?.defaultModel || selectedModels[0] || selection.model;
  const selectedEffort = selectedEfforts.includes(selection.effort)
    ? selection.effort
    : defaultEfforts[selectedProvider?.id] || selectedEfforts[0] || "high";
  const activeSelection = {
    provider: selectedProvider?.id ?? selection.provider,
    model: selectedModel,
    effort: selectedEffort,
  };
  const effortLabel = (value: string) => value ? value[0].toUpperCase() + value.slice(1) : t("common.auto-default");

  function ask() {
    const q = text.trim();
    if (!q || busy) return;
    // Une capture encore en cours d'écriture n'a pas de chemin : sans elle, le
    // modèle répondrait à côté. On attend le retour du backend.
    if (images.some((img) => img.path === null)) return;
    setMsgs((prev) => [...prev, { role: "user", text: q, context: ctx ?? undefined }]);
    setText("");
    setBusy(true);
    const prompt = buildQuickAskPrompt(ctx, q, images.map((img) => img.path!).filter(Boolean));
    if (ctx) setCtx(null);
    setImages([]);
    wsSend({ type: "quickAsk", qaId, prompt, projectRoot: activeProject ?? "", ...activeSelection });
  }

  const lastAnswer = [...msgs].reverse().find((x) => x.role === "assistant" && !x.text.startsWith("⚠"));

  return (
    <div className={`qa-overlay ${box ? "free" : ""}`} onClick={box ? undefined : close}>
      <div
        className={`qa-pop ${box ? "free" : ""}`}
        ref={popRef}
        onClick={(e) => e.stopPropagation()}
        style={box ? { position: "fixed", left: box.x, top: box.y, width: box.w, height: box.h, maxHeight: "none" } : undefined}
      >
        <div className="qa-head" onMouseDown={startDrag} style={{ cursor: "move" }}>
          <span className="qa-zap"><ZapIcon /></span>
          <span>{t("qa.title")}</span>
          <IconButton className="qa-recents-btn" label={t("qa.recents")} title={t("qa.recents")}
            onClick={() => setRecentsOpen((v) => !v)}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
              <circle cx="8" cy="8" r="6.2" /><path d="M8 4.5V8l2.5 1.5" />
            </svg>
          </IconButton>
          <IconButton
            className="qa-recents-btn qa-clear-btn"
            label={t("qa.clear")}
            title={t("qa.clear")}
            onClick={() => {
              archive();
              setQaId(crypto.randomUUID());
              setMsgs([]);
              setCtx(null);
              setQuote(null);
              setImages([]);
              setText("");
              setBusy(false);
              window.setTimeout(() => inputRef.current?.focus(), 0);
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
              <path d="M3 4h10M6.5 4V2.8c0-.4.3-.8.8-.8h1.4c.5 0 .8.4.8.8V4M4.5 4l.7 8.4c0 .5.4.8.9.8h3.8c.5 0 .9-.3.9-.8L11.5 4" />
            </svg>
          </IconButton>
          <IconButton className="qa-min" label={t("qa.minimize")} title={t("qa.minimize")} onClick={onMinimize}>—</IconButton>
          <Popover modal={false}>
            <PopoverTrigger
              render={
                <ShadcnButton
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="qa-model"
                  aria-label={t("qa.model-selector")}
                />
              }
            >
              <ProviderIcon provider={activeSelection.provider} />
              <span>{modelDisplayLabel(activeSelection.provider, activeSelection.model, selectedProvider?.modelLabels)}</span>
              <span className="qa-model-effort">· {effortLabel(activeSelection.effort)}</span>
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="end"
              className="qa-model-pop"
              positionerClassName="qa-model-positioner"
            >
              <PopoverHeader>
                <PopoverTitle>{t("qa.model-selector")}</PopoverTitle>
                <PopoverDescription>{t("qa.model-selector-hint")}</PopoverDescription>
              </PopoverHeader>
              <FieldGroup className="qa-model-fields">
                <Field>
                  <FieldLabel>{t("qa.provider")}</FieldLabel>
                  <ProductSelect
                    compact
                    title={t("qa.provider")}
                    portalContainer={null}
                    positionerClassName="qa-model-positioner"
                    value={activeSelection.provider}
                    options={catalog.map((info) => ({
                      value: info.id,
                      label: `${info.label}${!info.ok ? ` · ${t("app.provider-unavailable")}` : ""}`,
                      icon: <ProviderIcon provider={info.id} />,
                    }))}
                    onChange={(providerId) => {
                      const info = catalog.find((item) => item.id === providerId)!;
                      const model = defaultModels[providerId] && info.models.includes(defaultModels[providerId])
                        ? defaultModels[providerId]
                        : info.defaultModel || info.models[0];
                      const effort = modelEfforts[`${providerId}:${model}`]
                        ?? defaultEfforts[providerId]
                        ?? (providerId === "grok" && info.efforts.includes("high") ? "high" : info.efforts[0] ?? "");
                      setSelection({ provider: providerId, model, effort });
                    }}
                  />
                </Field>
                <Field>
                  <FieldLabel>{t("qa.model")}</FieldLabel>
                  <ProductSelect
                    compact
                    title={t("qa.model")}
                    portalContainer={null}
                    positionerClassName="qa-model-positioner"
                    value={activeSelection.model}
                    options={selectedModels.map((model) => ({ value: model, label: modelDisplayLabel(activeSelection.provider, model, selectedProvider?.modelLabels) }))}
                    onChange={(modelValue) => setSelection({
                      ...activeSelection,
                      model: modelValue,
                      effort: modelEfforts[`${activeSelection.provider}:${modelValue}`]
                        ?? defaultEfforts[activeSelection.provider]
                        ?? activeSelection.effort,
                    })}
                  />
                </Field>
                <Field>
                  <FieldLabel>{t("qa.effort")}</FieldLabel>
                  <ProductSelect
                    compact
                    title={t("qa.effort")}
                    portalContainer={null}
                    positionerClassName="qa-model-positioner"
                    value={activeSelection.effort}
                    options={selectedEfforts.map((effort) => ({ value: effort, label: effortLabel(effort) }))}
                    onChange={(effortValue) => setSelection({ ...activeSelection, effort: effortValue })}
                  />
                </Field>
              </FieldGroup>
            </PopoverContent>
          </Popover>
        </div>
        {recentsOpen && (
          <div className="qa-recents">
            {loadRecents().length === 0 && <div className="qa-empty">{t("qa.no-recents")}</div>}
            {loadRecents().map((r) => (
              <RowButton key={r.qaId} className="qa-recent-row" onClick={() => {
                setQaId(r.qaId);
                setMsgs(r.msgs);
                setRecentsOpen(false);
              }}>
                <span className="qa-recent-q">{r.msgs.find((m) => m.role === "user")?.text.slice(0, 60) ?? "—"}</span>
                <span className="qa-recent-ts">{new Date(r.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </RowButton>
            ))}
          </div>
        )}
        <div className="qa-body" ref={bodyRef} onMouseUp={onBodyMouseUp}>
          {msgs.length === 0 && <div className="qa-empty">{t("qa.hint")}</div>}
          {msgs.map((msg, i) => (
            <div key={i} className={`qa-msg ${msg.role}`} data-qa-msg={i}>
              {msg.role === "assistant" ? (
                <>
                  <ReactMarkdown remarkPlugins={mdPlugins.remark} rehypePlugins={mdPlugins.rehype}>
                    {normalizeMathDelimiters(msg.text)}
                  </ReactMarkdown>
                  {!msg.streaming && !msg.text.startsWith("⚠") && (
                    <IconButton className="qa-inject-one" label={t("qa.inject")} title={t("qa.inject")}
                      onClick={() => { onInject(msg.text); onMinimize(); }}>
                      ↰
                    </IconButton>
                  )}
                </>
              ) : (
                <>
                  {msg.context && (
                    <span className="qa-msg-quote" title={msg.context.message ?? msg.context.selection}>
                      {msg.context.selection}
                    </span>
                  )}
                  <span>{msg.text}</span>
                </>
              )}
            </div>
          ))}
          {busy && msgs[msgs.length - 1]?.role !== "assistant" && (
            <div className="qa-busy" aria-label="…">
              <span /><span /><span />
            </div>
          )}
        </div>
        {quote && (
          <div className="sel-toolbar qa-sel-toolbar" ref={selToolbarRef}
            style={{ left: selToolbarLeft ?? quote.x, top: quote.y - 44 }}>
            <RowButton
              onMouseDown={(e) => {
                e.preventDefault();
                const src = quote.msgIndex == null ? undefined : msgs[quote.msgIndex];
                setCtx({
                  selection: quote.text,
                  message: src?.text,
                  role: src?.role,
                });
                setQuote(null);
                window.getSelection()?.removeAllRanges();
                window.setTimeout(() => inputRef.current?.focus(), 0);
              }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                <path d="M14 8c0 3-2.7 5.2-6 5.2-.8 0-1.6-.1-2.3-.4L2.5 14l1-2.6C2.6 10.5 2 9.3 2 8c0-3 2.7-5.2 6-5.2S14 5 14 8z" />
              </svg>
              {t("action.add-to-chat")}
            </RowButton>
          </div>
        )}
        {/* Citation et champ dans le MÊME cadre : la puce était un bloc frère,
            avec sa propre bordure et sa propre marge — elle se lisait comme un
            objet posé par-dessus la boîte, pas comme ce qui part avec la
            question (capture Thierry 2026-08-31). */}
        <div className="qa-composer">
          {ctx && (
            <div className="qa-ctx" title={ctx.message ?? ctx.selection}>
              <span className="qa-ctx-txt">
                {ctx.selection}
                <span className="qa-ctx-src">{qaContextSource(ctx)}</span>
              </span>
              <IconButton size="s" label={t("action.close")} onClick={() => setCtx(null)}>✕</IconButton>
            </div>
          )}
          {images.length > 0 && (
            <div className="qa-shots">
              {images.map((img) => (
                <span key={img.dataURL} className={`qa-shot ${img.path ? "" : "pending"}`} title={img.path ?? t("qa.image-pending")}>
                  <img src={img.dataURL} alt="" />
                  <span className="qa-shot-name">{img.name}</span>
                  <IconButton
                    size="s"
                    label={t("action.close")}
                    onClick={() => setImages((prev) => prev.filter((x) => x.dataURL !== img.dataURL))}
                  >✕</IconButton>
                </span>
              ))}
            </div>
          )}
          <Textarea
            ref={inputRef}
            className="qa-input"
            rows={Math.min(6, Math.max(1, text.split("\n").length, Math.ceil(text.length / 60)))}
            value={text}
            placeholder={t("qa.placeholder")}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              for (const item of e.clipboardData.items) {
                if (!item.type.startsWith("image/")) continue;
                const file = item.getAsFile();
                if (!file) continue;
                e.preventDefault();
                pasteImage(file);
                return;
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); }
              if (e.key === "Escape") close();
            }}
          />
        </div>
        <div className="qa-foot">
          {/* Injecter REPLIE la fenêtre au lieu de la fermer : fermer effaçait la
              conversation (l'ouverture suivante repart à neuf), alors qu'on
              vient justement de s'en servir — on veut pouvoir y revenir par
              ⚡ / ⌥⌘K (signalé 2026-08-31). */}
          <Button variant="ghost" disabled={!lastAnswer} onClick={() => { if (lastAnswer) { onInject(lastAnswer.text); onMinimize(); } }}>
            ↰ {t("qa.inject")}
          </Button>
          <Button variant="ghost" disabled={msgs.length === 0 || busy} onClick={() => {
            saveRecent(qaId, msgs);
            onPromote(qaId, msgs.find((x) => x.role === "user")?.text.slice(0, 40) ?? "Quick Ask");
            onClose();
          }}>
            ⤴ {t("qa.promote")}
          </Button>
          {promoteErr && <span className="qa-promote-err">{promoteErr}</span>}
          <span className="qa-esc">esc</span>
        </div>
        {RESIZE_EDGES.map((edge) => (
          <div
            key={edge}
            className={`qa-resize qa-resize-${edge}`}
            onMouseDown={(e) => startResize(e, edge)}
          />
        ))}
      </div>
    </div>
  );
}
