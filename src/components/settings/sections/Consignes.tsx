import { useState } from "react";
import { normaliserNom, nouvelId, type Consigne } from "../../../lib/consignes";
import type { SectionProps } from "../shared";
import { DEFAULT_SETTINGS, type Settings } from "../../../lib/settings";
import { getResolvedLanguage, t } from "../../../lib/i18n";
import { Check, ChevronDown, Mic, Plus, Square, Undo2, WandSparkles, X } from "lucide-react";
import { useConsigneAssistant, type ConsigneRewriteMode, type ConsigneRewriteRequest } from "./useConsigneAssistant";
import "./Consignes.css";
import { Button, IconButton, InlineNotice, RowButton, Select } from "../../ui";
import { Field, FieldGroup, FieldLabel } from "../../shadcn/field";
import { Input } from "../../shadcn/input";
import { Textarea } from "../../shadcn/textarea";

type Assist = { provider: string; model: string };

// Liste en dur, même parti pris que le sélecteur autoReview
// (sections/Atelier.tsx) : aucun catalogue à porter pour une poignée
// d'entrées. Ne jamais y ajouter un provider dont `reformuler_consigne`
// rend encore `None` côté Rust — un choix qui éteint le bouton sans
// l'expliquer serait pire que pas de choix.
const OPTIONS_MODELE_REFORMULATION: { value: string; label: string }[] = [
  { value: "codex:gpt-5.6-sol", label: "GPT-5.6 sol" },
  { value: "codex:gpt-5.5", label: "GPT-5.5" },
  { value: "claude:claude-haiku-4-5-20251001", label: "Haiku 4.5 · rapide" },
  { value: "claude:claude-sonnet-5", label: "Sonnet 5" },
];

const EVENT_CONSIGNE_REFORMULEE = "consigne-reformulee";
const SOCKET_OPEN = 1;

/** Correlate each request so a late reply cannot resolve a newer proposal. */
export function reformulerViaWs(
  ws: WebSocket | null,
  projectRoot: string,
  assist: Assist,
  c: Consigne,
  rewrite?: ConsigneRewriteRequest,
): Promise<string | null> {
  if (!ws || ws.readyState !== SOCKET_OPEN) return Promise.resolve(null);
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    let settled = false;
    const finish = (texte: string | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener(EVENT_CONSIGNE_REFORMULEE, onEvent);
      resolve(texte);
    };
    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail as { requestId?: string; texte?: string | null } | undefined;
      if (detail?.requestId === requestId) finish(detail.texte ?? null);
    };
    const timer = window.setTimeout(() => finish(null), 65_000);
    window.addEventListener(EVENT_CONSIGNE_REFORMULEE, onEvent);
    try { ws.send(JSON.stringify({
      type: "reformulerConsigne",
      requestId,
      rewrite,
      nom: c.nom,
      description: c.description,
      texte: c.texte,
      provider: assist.provider,
      model: assist.model,
      projectRoot,
    })); } catch { finish(null); }
  });
}

// Cadenas — consigne livrée avec l'app : modifiable, jamais supprimable
// (sinon le catalogue redevient vidable par erreur). Icône locale, pas dans
// icons.tsx : même principe que GlypheConsigne dans ConsigneMenu.tsx, seul
// consommateur.
function IconeCadenas() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor"
         strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}

export function Consignes(p: {
  consignes: Consigne[];
  onChange: (consignes: Consigne[]) => void;
  reformuler?: ((c: Consigne, request?: ConsigneRewriteRequest) => Promise<string | null>) | null;
  assist?: Assist;
  onChangeAssist?: (a: Assist) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(p.consignes[0]?.id ?? null);
  const selected = p.consignes.find(c => c.id === selectedId) ?? null;
  const assist = p.assist ?? DEFAULT_SETTINGS.consignesAssist;
  const fr = getResolvedLanguage() === "fr";
  const copy = (frText: string, enText: string) => fr ? frText : enText;
  function patchSelected(patch: Partial<Consigne>) {
    if (!selected) return;
    p.onChange(p.consignes.map(c => c.id === selected.id ? { ...c, ...patch } : c));
  }
  const a = useConsigneAssistant({ selected, onText: texte => patchSelected({ texte }), reformuler: p.reformuler });
  const modes: { value: ConsigneRewriteMode; label: string; hint: string }[] = [
    { value: "correct", label: copy("Corriger", "Correct"), hint: copy("Corrige les fautes et la ponctuation, en gardant vos mots.", "Fix spelling and punctuation while keeping your words.") },
    { value: "clarify", label: copy("Clarifier", "Clarify"), hint: copy("Rend les instructions plus claires, sans changer votre intention.", "Make instructions clearer while preserving your intent.") },
    { value: "shorten", label: copy("Raccourcir", "Shorten"), hint: copy("Retire les répétitions et conserve l’essentiel.", "Remove repetition and keep the essentials.") },
    { value: "structure", label: copy("Structurer", "Structure"), hint: copy("Organise les instructions en étapes ou en règles.", "Organize instructions into steps or rules.") },
    { value: "questions", label: copy("Préciser avec moi", "Ask me questions"), hint: copy("Pose quelques questions avant de proposer une consigne complète.", "Ask a few questions before drafting complete instructions.") },
    { value: "custom", label: copy("Ajustement personnalisé", "Custom adjustment"), hint: copy("Décrivez le changement souhaité.", "Describe the change you want.") },
  ];
  const action = modes.find(m => m.value === a.mode)!;
  const locked = a.busy || a.dictation.active;
  function ajouter() {
    const id = nouvelId(p.consignes);
    p.onChange([...p.consignes, { id, nom: "", description: "", texte: "" }]);
    setSelectedId(id);
  }
  function supprimer() {
    if (!selected || selected.livree) return;
    p.onChange(p.consignes.filter(c => c.id !== selected.id));
    setSelectedId(p.consignes.find(c => c.id !== selected.id)?.id ?? null);
  }
  const modelSelect = <Select title={t("settings.consignes-assist-model")}
    value={`${assist.provider}:${assist.model}`} disabled={locked}
    onChange={value => {
      const [provider, model] = value.split(":");
      p.onChangeAssist?.({ provider, model });
    }} options={OPTIONS_MODELE_REFORMULATION} />;

  return (
    <div className="set-consignes-wrap consignes-studio">
      <div className="set-consignes">
        <nav className="set-consignes-list" aria-label={copy("Bibliothèque de consignes", "Instruction library")}>
          <div className="consignes-library-heading">{copy("Bibliothèque", "Library")}<span>{p.consignes.length}</span></div>
          <div className="consignes-library-items">
            {p.consignes.map(c => (
              <RowButton key={c.id} className={`set-consignes-item ${selectedId === c.id ? "on" : ""}`}
                aria-current={selectedId === c.id ? "true" : undefined} onClick={() => setSelectedId(c.id)}>
                {c.livree && <span className="set-consignes-item-lock" title={t("settings.consignes-locked")}><IconeCadenas /></span>}
                <span className="set-consignes-item-nom">{c.nom || t("settings.consignes-untitled")}</span>
              </RowButton>
            ))}
          </div>
          <RowButton className="set-consignes-new" onClick={ajouter}><Plus size={14} aria-hidden="true" />{t("settings.consignes-new")}</RowButton>
        </nav>
        <div className="set-consignes-form">
          {selected ? <>
            <FieldGroup className="consignes-metadata">
              <Field>
                <FieldLabel htmlFor="consigne-nom">{t("settings.consignes-field-nom")}</FieldLabel>
                <Input id="consigne-nom" className="consignes-title" value={selected.nom} maxLength={24}
                  placeholder={t("settings.consignes-untitled")}
                  onChange={e => { a.cancel(); patchSelected({ nom: normaliserNom(e.target.value) }); }} />
              </Field>
              <Field>
                <FieldLabel htmlFor="consigne-description">{t("settings.consignes-field-description")}</FieldLabel>
                <Input id="consigne-description" className="consignes-description" value={selected.description}
                  placeholder={copy("Une courte description pour la retrouver", "A short description to find it again")}
                  onChange={e => { a.cancel(); patchSelected({ description: e.target.value }); }} />
              </Field>
            </FieldGroup>
            <FieldGroup className="consignes-writing-field">
              <div className="consignes-editor">
                <Field className="consignes-text-field">
                  <div className="set-consignes-field-header">
                    <FieldLabel htmlFor="consigne-texte">{t("settings.consignes-field-texte")}</FieldLabel>
                    {a.original !== null && <Button variant="ghost" disabled={locked} onClick={a.restore}><Undo2 size={14} aria-hidden="true" />{t("settings.consignes-restore")}</Button>}
                  </div>
                  <Textarea ref={a.taRef} id="consigne-texte" className="set-consignes-textarea" rows={10}
                    value={selected.texte} placeholder={copy("Écrivez ou dictez ce que le modèle doit faire…", "Write or dictate what the model should do…")}
                    onChange={e => a.editText(e.target.value)}
                    onKeyDown={e => { if (e.key === "Escape" && a.dictation.active) { e.preventDefault(); e.stopPropagation(); a.dictation.stop(); } }} />
                </Field>
                <div className="consignes-toolbar">
                  {a.dictation.active ? <div className="consignes-recording" role="group" aria-label={copy("Dictée", "Dictation")}>
                    <IconButton label={t("dictation.cancel")} onClick={a.dictation.discard}><X size={16} /></IconButton>
                    <div className="dictation-waveform" aria-hidden="true" data-phase={a.dictation.phase}>
                      {a.dictation.levels.map((level, i) => <span key={i} style={{ height: `${1.5 + Math.pow(level, 1.3) * 12.5}px`, opacity: .35 + level * .65 }} />)}
                    </div>
                    <span role="status">{t(a.dictation.phase === "starting" ? "dictation.starting" : a.dictation.phase === "finishing" ? "dictation.finishing" : "dictation.listening")}</span>
                    <IconButton label={t("dictation.stop")} disabled={a.dictation.phase === "finishing"} onClick={a.dictation.stop}><Square size={14} fill="currentColor" /></IconButton>
                  </div> : <>
                    {a.dictation.available && <Button variant="ghost" className="consignes-dictate" disabled={a.busy}
                      onMouseDown={e => e.preventDefault()} onClick={a.dictation.toggle}><Mic size={16} aria-hidden="true" />{copy("Dicter", "Dictate")}</Button>}
                    <div className="consignes-rewrite-tools">
                      {modelSelect}
                      <div className="consignes-action-picker">
                        <Button variant="outline" className="set-consignes-reformuler" loading={a.busy}
                          disabled={!p.reformuler || (a.mode === "custom" && !a.custom.trim())}
                          onClick={a.run}><WandSparkles size={15} aria-hidden="true" />{!selected.texte.trim() && a.mode === "clarify" ? t("settings.consignes-write") : action.label}</Button>
                        <Select title={copy("Action de reformulation", "Rewrite action")} value={a.mode} disabled={a.busy}
                          triggerIcon={<ChevronDown size={14} />} onChange={value => a.setMode(value as ConsigneRewriteMode)} options={modes} />
                      </div>
                    </div>
                  </>}
                </div>
              </div>
              <p className="consignes-action-hint">{action.hint}</p>
            </FieldGroup>
            {a.mode === "custom" && <Field>
              <FieldLabel htmlFor="consigne-custom">{copy("Ajustement personnalisé", "Custom adjustment")}</FieldLabel>
              <Input id="consigne-custom" value={a.custom} disabled={locked} onChange={e => a.setCustom(e.target.value)}
                placeholder={copy("Ex. : garde mon ton, mais rends les critères plus explicites", "E.g. keep my tone, but make the criteria more explicit")} />
            </Field>}
            {a.busy && <div className="consignes-pending" role="status"><span>{copy("Préparation de la proposition…", "Preparing the proposal…")}</span>{a.questions === null && a.proposal === null && <Button variant="ghost" onClick={a.cancel}>{copy("Annuler", "Cancel")}</Button>}</div>}
            <span role="status" className="tw:sr-only">{a.proposal !== null ? copy("Proposition prête à comparer.", "Proposal ready to compare.") : a.questions !== null ? copy("Questions prêtes. Ajoutez vos précisions.", "Questions ready. Add your answers.") : ""}</span>
            {a.error && <InlineNotice tone="error" className="set-notice">{t("settings.consignes-rewrite-failed")}</InlineNotice>}
            {a.questions !== null && a.proposal === null && <section className="consignes-review" aria-label={copy("Préciser la consigne", "Clarify the instruction")}>
              <h2>{copy("Quelques précisions", "A few questions")}</h2>
              <div className="consignes-review-text">{a.questions}</div>
              <Field><FieldLabel htmlFor="consigne-answers">{copy("Vos précisions", "Your answers")}</FieldLabel>
                <Textarea id="consigne-answers" value={a.answers} disabled={a.busy} onChange={e => a.setAnswers(e.target.value)} rows={3} /></Field>
              <div className="consignes-review-actions"><Button variant="ghost" onClick={a.cancel}>{copy("Annuler", "Cancel")}</Button>
                <Button loading={a.busy} disabled={!a.answers.trim()} onClick={a.run}>{copy("Créer la proposition", "Create proposal")}</Button></div>
            </section>}
            {a.proposal !== null && <section className="consignes-review" aria-label={copy("Aperçu de la reformulation", "Rewrite preview")}>
              <div className="consignes-review-heading"><h2>{copy("Comparer avant d’appliquer", "Compare before applying")}</h2><span>{copy("Votre consigne reste intacte", "Your instruction is unchanged")}</span></div>
              <div className="consignes-comparison">
                <div><h3>{copy("Original", "Original")}</h3><div className="consignes-review-text">{selected.texte || copy("Consigne vide", "Empty instruction")}</div></div>
                <div><h3>{copy("Proposition", "Proposal")}</h3><div className="consignes-review-text">{a.proposal}</div></div>
              </div>
              <div className="consignes-review-actions"><Button variant="ghost" onClick={a.cancel}>{copy("Annuler", "Cancel")}</Button>
                <Button variant="ghost" disabled={locked} onClick={a.retry}>{copy("Réessayer", "Retry")}</Button>
                <Button disabled={locked} onClick={a.apply}><Check size={14} aria-hidden="true" />{copy("Appliquer", "Apply")}</Button></div>
            </section>}
            {!selected.livree && <Button variant="ghost" className="set-consignes-delete" onClick={supprimer}>{t("action.delete")}</Button>}
          </> : <div className="consignes-empty"><p className="set-empty">{t("settings.consignes-empty")}</p>{modelSelect}</div>}
        </div>
      </div>
    </div>
  );
}

export default function ConsignesSection(p: SectionProps) {
  const save = (patch: Partial<Settings>) => { p.set(patch); p.onSaved(); };
  return (
    <>
      <h1>{t("settings.consignes")}</h1>
      <p className="set-sub">{t("settings.consignes-sub")}</p>
      <Consignes
        consignes={p.s.consignes}
        onChange={(consignes) => save({ consignes })}
        reformuler={p.ws?.readyState === SOCKET_OPEN ? (c, request) => reformulerViaWs(p.ws, p.projectRoot ?? "", p.s.consignesAssist, c, request) : null}
        assist={p.s.consignesAssist}
        onChangeAssist={(consignesAssist) => save({ consignesAssist })}
      />
    </>
  );
}
