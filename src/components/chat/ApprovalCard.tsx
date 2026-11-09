// Carte d'approbation (variante C « compacte », choisie le 2026-11-09) :
// en attente = deux lignes (action + commande sur une ligne, puis raison et
// actions) ; répondue = une ligne dans l'historique (verdict + règle retenue),
// dépliable. Chargée à part (lazy depuis HarnessInteraction) : le budget
// d'entrée est plein.
//
// Réponses : choix dynamiques (Claude, Kimi) = optionId OPAQUE, dans l'ordre
// du provider, touche n = n-ième choix ; sans choix (Codex) = les quatre
// réponses fixes 1 autoriser · 2 toujours (session) · 3 refuser · 4 arrêter.
import { lazy, Suspense, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { InteractionResponse } from "../../lib/ws";
import { t } from "../../lib/i18n";
import { Input } from "../shadcn/input";
import { Button, RowButton } from "../ui";
import { LazyDropdownMenu, type LazyDropdownMenuItem } from "../ui/LazyDropdownMenu";
import { sendInteractionAnswer, type InteractionEvent } from "./HarnessInteraction";

const AtelierDiffView = lazy(() => import("../AtelierDiffView"));

type Kind = "allow_once" | "allow_always" | "reject_once" | "reject_always";
type Opt = { key: string; label: string; kind: Kind; stop: boolean; respond: (message?: string) => InteractionResponse };

const RUN = "Exécution de commande";
const EDIT = "Modification de fichiers";
const PLAN = "Plan prêt à exécuter";

/** « Oui, et ne plus demander pour … » → « Ne plus demander pour … » (le
 *  bouton dit déjà « Autoriser »). */
const sansOui = (label: string, upper = true) => {
  const m = /^Oui, et (.)/.exec(label);
  if (!m) return label;
  return (upper ? m[1].toUpperCase() : m[1]) + label.slice(m[0].length);
};

/** Chemins personnels raccourcis : /Users/nom/… → ~/… (affichage seulement). */
const home = (s: string) => s.replace(/(?<![\w.~/-])\/(?:Users|home)\/[^/\s'"]+(?=[/\s'"]|$)/g, "~");

/** Coupe une commande shell aux « ; », « && », « || » et retours de premier
 *  niveau — jamais dans une chaîne ni dans $( … ). */
export function commandLines(command: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote = "";
  let depth = 0;
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ""; };
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      cur += ch;
      if (ch === "\\" && quote !== "'" && i + 1 < command.length) cur += command[++i];
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") quote = ch;
    else if (ch === "\\" && i + 1 < command.length) { cur += ch + command[++i]; continue; }
    else if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && (ch === ";" || ch === "\n")) { push(); continue; }
    else if (depth === 0 && (ch === "&" || ch === "|") && command[i + 1] === ch) {
      cur = `${cur.trimEnd()} ${ch}${ch}`;
      i++;
      push();
      continue;
    }
    cur += ch;
  }
  push();
  return out;
}

const Icon = ({ title }: { title: string }) => (
  <svg className="appr-ico" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {title === RUN ? <><rect x="1.8" y="2.8" width="12.4" height="10.4" rx="2" /><path d="M4.6 6.2 6.6 8l-2 1.8M8.2 10h3" /></>
      : title === EDIT ? <path d="M10.6 2.9 13.1 5.4 6 12.5 3 13l.5-3z" />
      : <><path d="M8 1.9 13 3.8v3.9c0 3-2.1 5.4-5 6.4-2.9-1-5-3.4-5-6.4V3.8z" /><path d="M5.8 8.1 7.3 9.6l3-3.2" /></>}
  </svg>
);
const Chevron = ({ open }: { open?: boolean }) => (
  <svg className="appr-chev" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={open ? "M4.5 9.5 8 6l3.5 3.5" : "M4.5 6.5 8 10l3.5-3.5"} />
  </svg>
);

function CommandBlock({ lines }: { lines: string[] }) {
  return (
    <div className="appr-code">
      {lines.map((line, index) => {
        const at = line.search(/\s/);
        return (
          <div key={index} className="appr-code-line">
            <span className="appr-prog">{at < 0 ? line : line.slice(0, at)}</span>{at < 0 ? "" : line.slice(at)}
          </div>
        );
      })}
    </div>
  );
}

export default function ApprovalCard({ event: e, threadId }: { event: InteractionEvent; threadId: string | null }) {
  // choix envoyé : la carte se replie aussitôt (optimiste), avant l'état
  // final ré-émis par le serveur — pas de double envoi.
  const [done, setDone] = useState<{ key: string; message?: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<"" | "deny" | "allow">("");
  // consigne de refus : null = champ fermé (il ne s'ouvre qu'à la demande)
  const [consigne, setConsigne] = useState<string | null>(null);
  const final = !!done || e.state !== "pending";

  const opts: Opt[] = e.choices?.length
    ? e.choices.map((c, index) => {
      const reject = c.kind === "reject_once" || c.kind === "reject_always";
      return {
        key: c.optionId,
        label: c.label,
        kind: c.kind ?? (reject ? "reject_once" : index === 0 ? "allow_once" : "allow_always"),
        stop: !!c.cancelTurn || c.kind === "reject_always",
        respond: (message?: string) => ({
          optionId: c.optionId,
          ...(c.cancelTurn ? { cancelTurn: true } : {}),
          ...(message && e.feedback && reject ? { message } : {}),
        }),
      };
    })
    : [
      { key: "1", label: t("interaction.allow-once"), kind: "allow_once", stop: false, respond: () => ({ allow: true, scope: "once" }) },
      { key: "2", label: t("interaction.allow-session"), kind: "allow_always", stop: false, respond: () => ({ allow: true, scope: "session" }) },
      { key: "3", label: t("interaction.deny"), kind: "reject_once", stop: false, respond: () => ({ allow: false, scope: "once" }) },
      { key: "4", label: t("interaction.cancel-turn"), kind: "reject_always", stop: true, respond: () => ({ allow: false, scope: "once", cancelTurn: true }) },
    ];
  const run = (o: Opt, message?: string) => {
    sendInteractionAnswer(e, threadId, o.respond(message));
    setDone({ key: o.key, message });
  };
  const isReject = (o: Opt) => o.kind === "reject_once" || o.kind === "reject_always";
  const primary = opts.find((o) => !isReject(o));
  const allows = opts.filter((o) => o !== primary && !isReject(o));
  const rejects = opts.filter(isReject);
  const firstReject = rejects.find((o) => !o.stop) ?? rejects[0];
  const keyOf = (o: Opt) => opts.indexOf(o) + 1;

  // Clavier (comme le terminal) : seule la DERNIÈRE carte en attente écoute,
  // jamais pendant la frappe dans un champ.
  useEffect(() => {
    if (final) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof Element && target.matches("input, textarea, select, [contenteditable=true]")) return;
      const pendingCards = [...document.querySelectorAll<HTMLElement>('.int-card[data-approval-pending="true"]')];
      if (pendingCards[pendingCards.length - 1]?.dataset.requestId !== e.requestId) return;
      const opt = opts[Number.parseInt(event.key, 10) - 1];
      if (!opt) return;
      event.preventDefault();
      run(opt);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const detail = home(e.detail ?? "");
  const lines = e.title === RUN ? commandLines(detail) : detail ? [detail] : [];
  const long = lines.length > 1 || detail.length > 72;

  if (final) {
    // Repli en une ligne : verdict + règle retenue / consigne ; chevron pour la commande.
    const local = e.state === "pending" && done;
    const summary = local ? "" : e.answerSummary ?? "";
    const picked = local ? opts.find((o) => o.key === done.key)
      : e.state === "answered"
        ? opts.filter((o) => summary.startsWith(o.label)).sort((a, b) => b.label.length - a.label.length)[0]
        : undefined;
    const allowed = local || e.state === "answered"
      ? picked ? !isReject(picked) : /^(autoris|toujours|oui|allow)/i.test(summary)
      : false;
    const rest = local ? (done.message ? `« ${done.message} »` : "")
      : picked ? summary.slice(picked.label.length).replace(/^ · /, "") : summary;
    const plain = !picked || picked === primary || picked === firstReject || picked.stop;
    const sub = [
      picked && !plain ? sansOui(picked.label, false) : "",
      /^(autorisé une fois|refusé)$/i.test(rest) ? "" : rest,
    ].filter(Boolean).join(" · ");
    const what = e.title === RUN ? "cmd" : e.title === EDIT ? "edit" : "req";
    const verdict = e.state === "expired" ? t("interaction.expired-title")
      : t(`interaction.${what}-${allowed ? "allowed" : "denied"}` as Parameters<typeof t>[0]);
    const body = lines.length > 0 || !!e.markdown;
    return (
      <div className={`int-card appr is-done${allowed ? "" : " is-denied"}`} data-request-id={e.requestId}>
        <RowButton className="appr-done" aria-expanded={body ? open : undefined} disabled={!body} onClick={() => setOpen(!open)}>
          <svg className="appr-ico" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {allowed
              ? <><path d="M8 1.9 13 3.8v3.9c0 3-2.1 5.4-5 6.4-2.9-1-5-3.4-5-6.4V3.8z" /><path d="M5.8 8.1 7.3 9.6l3-3.2" /></>
              : <><circle cx="8" cy="8" r="6.2" /><path d="M3.6 3.6l8.8 8.8" /></>}
          </svg>
          <span className="appr-verdict">{verdict}</span>
          {sub ? <span className="appr-sub">{sub}</span> : null}
          {body ? <Chevron open={open} /> : null}
        </RowButton>
        {open && lines.length ? <CommandBlock lines={lines} /> : null}
        {open && e.markdown ? (
          <div className="int-plan is-final">
            <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>{e.markdown}</ReactMarkdown>
          </div>
        ) : null}
      </div>
    );
  }

  const title = e.title === RUN ? t("interaction.run") : e.title === EDIT ? t("interaction.edit")
    : e.title === PLAN ? t("interaction.title-plan") : e.title;
  const item = (o: Opt, label: string, separatorBefore = false): LazyDropdownMenuItem => ({
    key: o.key,
    label: <>{label}<span className="appr-key">{keyOf(o)}</span></>,
    onSelect: () => run(o),
    destructive: o.stop,
    separatorBefore,
  });
  const denyItems: LazyDropdownMenuItem[] = [
    ...rejects.filter((o) => !o.stop).map((o) => item(o, o.label)),
    ...(e.feedback && firstReject ? [{ key: "consigne", label: t("interaction.feedback-open"), onSelect: () => setConsigne("") }] : []),
    ...rejects.filter((o) => o.stop).map((o, index) => item(o, o.label, index === 0)),
  ];
  const sendConsigne = () => {
    const message = (consigne ?? "").trim();
    if (message && firstReject) run(firstReject, message);
  };

  return (
    <div className="int-card appr" data-approval-pending="true" data-request-id={e.requestId}>
      <div className="appr-l1">
        <Icon title={e.title} />
        <span className="appr-title">{title}</span>
        {detail ? (
          long ? (
            <RowButton className="appr-cmd" aria-expanded={open} aria-label={t("interaction.show-command")} onClick={() => setOpen(!open)}>
              <code>{open ? "" : detail.replace(/\s*\n\s*/g, " ")}</code>
              <Chevron open={open} />
            </RowButton>
          ) : <code className="appr-cmd">{detail}</code>
        ) : null}
      </div>
      {open && long ? <CommandBlock lines={lines} /> : null}
      {e.forTitle ? <div className="int-for">{t("interaction.for-linked", { title: e.forTitle })}</div> : null}
      {e.markdown ? (
        <div className="int-plan">
          <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>{e.markdown}</ReactMarkdown>
        </div>
      ) : null}
      {e.preview ? (
        <div className="int-preview">
          <Suspense fallback={<span className="muted">{t("common.loading")}</span>}>
            <AtelierDiffView before={e.preview.oldText} after={e.preview.newText} path={e.preview.path} compact />
          </Suspense>
        </div>
      ) : null}
      <div className="appr-l2">
        {e.reason ? (
          <span className="appr-reason" title={e.reason}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
              <circle cx="8" cy="8" r="6.2" /><path d="M8 7.4v3.6M8 5h.01" />
            </svg>
            <span>{e.reason}</span>
          </span>
        ) : null}
        <span className="appr-actions">
          {denyItems.length ? (
            <LazyDropdownMenu
              open={menu === "deny"}
              onOpenChange={(next) => setMenu(next ? "deny" : "")}
              align="end"
              label={t("interaction.deny")}
              items={denyItems}
              trigger={(
                <Button variant="ghost" className="appr-deny" aria-haspopup="menu">
                  {t("interaction.deny")}<Chevron />
                </Button>
              )}
            />
          ) : null}
          {primary ? (
            <span className="appr-split">
              <Button variant="primary" className="appr-allow" aria-label={primary.label} onClick={() => run(primary)}>
                {e.choices?.length ? sansOui(primary.label) : t("interaction.allow")}<kbd aria-hidden="true">{keyOf(primary)}</kbd>
              </Button>
              {allows.length ? (
                <LazyDropdownMenu
                  open={menu === "allow"}
                  onOpenChange={(next) => setMenu(next ? "allow" : "")}
                  align="end"
                  label={t("interaction.more-allow")}
                  items={allows.map((o) => item(o, sansOui(o.label)))}
                  trigger={(
                    <Button variant="primary" className="appr-allow-more" aria-label={t("interaction.more-allow")} aria-haspopup="menu">
                      <Chevron />
                    </Button>
                  )}
                />
              ) : null}
            </span>
          ) : null}
        </span>
      </div>
      {consigne !== null ? (
        <div className="appr-consigne">
          <Input
            autoFocus
            className="int-input int-feedback"
            value={consigne}
            placeholder={t("interaction.feedback-placeholder")}
            aria-label={t("interaction.feedback-placeholder")}
            onChange={(ev) => setConsigne(ev.target.value)}
            onKeyDown={(ev) => {
              // Entrée = refuser avec cette consigne, comme dans le terminal.
              if (ev.key === "Enter") { ev.preventDefault(); sendConsigne(); }
              else if (ev.key === "Escape") { ev.preventDefault(); setConsigne(null); }
            }}
          />
          <span className="appr-hint">{t("interaction.feedback-hint")}</span>
        </div>
      ) : null}
    </div>
  );
}
