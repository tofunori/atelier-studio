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
import type { InteractionEvent } from "./HarnessInteraction";
import { sendInteractionAnswer } from "./interactionAnswer";
import { commandLines } from "./commandLines";

import { BanIcon, ChevronDownIcon, ChevronUpIcon, InfoIcon, PencilIcon, ShieldCheckIcon, SquareTerminalIcon } from "lucide-react";
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

const Icon = ({ title }: { title: string }) => (
  title === RUN ? <SquareTerminalIcon className="appr-ico" size={14} /> : title === EDIT ? <PencilIcon className="appr-ico" size={14} /> : <ShieldCheckIcon className="appr-ico" size={14} />
);
const Chevron = ({ open }: { open?: boolean }) => (
  open ? <ChevronUpIcon className="appr-chev" size={12} /> : <ChevronDownIcon className="appr-chev" size={12} />
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

/** Choix proposés : dynamiques (Claude, Kimi : optionId OPAQUE, ordre du
 *  provider) ou les quatre réponses fixes de Codex. */
function buildOptions(e: InteractionEvent): Opt[] {
  return e.choices?.length
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
}

const isReject = (o: Opt) => o.kind === "reject_once" || o.kind === "reject_always";

type Done = { key: string; message?: string };

/** Verdict d'une carte répondue : autorisée ou non, et ce qui mérite d'être
 *  gardé (règle retenue, consigne, tour arrêté) — jamais une redite. */
function verdictOf(e: InteractionEvent, opts: Opt[], done: Done | null) {
  const primary = opts.find((o) => !isReject(o));
  const firstReject = opts.find((o) => isReject(o) && !o.stop) ?? opts.find(isReject);
  const local = e.state === "pending" ? done : null;
  const summary = local ? "" : e.answerSummary ?? "";
  const picked = local ? opts.find((o) => o.key === local.key)
    : e.state === "answered"
      ? opts.filter((o) => summary.startsWith(o.label)).sort((a, b) => b.label.length - a.label.length)[0]
      : undefined;
  const allowed = local || e.state === "answered"
    ? picked ? !isReject(picked) : /^(autoris|toujours|oui|allow)/i.test(summary)
    : false;
  const rest = local ? (local.message ? `« ${local.message} »` : "")
    : picked ? summary.slice(picked.label.length).replace(/^ · /, "") : summary;
  const plain = !picked || picked === primary || picked === firstReject || picked.stop;
  const sub = [
    picked && !plain ? sansOui(picked.label, false) : "",
    /^(autorisé une fois|refusé)$/i.test(rest) ? "" : rest,
  ].filter(Boolean).join(" · ");
  const what = e.title === RUN ? "cmd" : e.title === EDIT ? "edit" : "req";
  const label = e.state === "expired" ? t("interaction.expired-title")
    : t(`interaction.${what}-${allowed ? "allowed" : "denied"}` as Parameters<typeof t>[0]);
  return { allowed, label, sub };
}

/** Carte répondue : une ligne dans l'historique, dépliable. */
function DoneLine({ e, lines, verdict }: { e: InteractionEvent; lines: string[]; verdict: ReturnType<typeof verdictOf> }) {
  const [open, setOpen] = useState(false);
  const body = lines.length > 0 || !!e.markdown;
  return (
    <div className={`int-card appr is-done${verdict.allowed ? "" : " is-denied"}`} data-request-id={e.requestId}>
      <RowButton className="appr-done" aria-expanded={body ? open : undefined} disabled={!body} onClick={() => setOpen(!open)}>
        {verdict.allowed ? <ShieldCheckIcon className="appr-ico" size={14} /> : <BanIcon className="appr-ico" size={14} />}
        <span className="appr-verdict">{verdict.label}</span>
        {verdict.sub ? <span className="appr-sub">{verdict.sub}</span> : null}
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

/** Ligne 1 : action + commande sur une ligne ; le chevron la déplie. */
function CommandHead({ e, detail, lines }: { e: InteractionEvent; detail: string; lines: string[] }) {
  const [open, setOpen] = useState(false);
  const long = lines.length > 1 || detail.length > 72;
  const title = e.title === RUN ? t("interaction.run") : e.title === EDIT ? t("interaction.edit")
    : e.title === PLAN ? t("interaction.title-plan") : e.title;
  const command = long ? (
    <RowButton className="appr-cmd" aria-expanded={open} aria-label={t("interaction.show-command")} onClick={() => setOpen(!open)}>
      <code>{open ? "" : detail.replace(/\s*\n\s*/g, " ")}</code>
      <Chevron open={open} />
    </RowButton>
  ) : <code className="appr-cmd">{detail}</code>;
  return (
    <>
      <div className="appr-l1">
        <Icon title={e.title} />
        <span className="appr-title">{title}</span>
        {detail ? command : null}
      </div>
      {open && long ? <CommandBlock lines={lines} /> : null}
    </>
  );
}

/** Contexte facultatif : fil lié, plan à valider, aperçu de modification. */
function Context({ e }: { e: InteractionEvent }) {
  return (
    <>
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
    </>
  );
}

/** Ligne 2 à droite : « Refuser ▾ » (refus, consigne, arrêt) et « Autoriser »
 *  en relief, les autorisations durables sous son chevron. */
function Actions({ e, opts, run, onConsigne }: {
  e: InteractionEvent;
  opts: Opt[];
  run: (o: Opt) => void;
  onConsigne: (() => void) | null;
}) {
  const [menu, setMenu] = useState<"" | "deny" | "allow">("");
  const primary = opts.find((o) => !isReject(o));
  const allows = opts.filter((o) => o !== primary && !isReject(o));
  const rejects = opts.filter(isReject);
  const keyOf = (o: Opt) => opts.indexOf(o) + 1;
  const item = (o: Opt, label: string, separatorBefore = false): LazyDropdownMenuItem => ({
    key: o.key,
    label: <>{label}<span className="appr-key">{keyOf(o)}</span></>,
    onSelect: () => run(o),
    destructive: o.stop,
    separatorBefore,
  });
  const denyItems: LazyDropdownMenuItem[] = [
    ...rejects.filter((o) => !o.stop).map((o) => item(o, o.label)),
    ...(onConsigne ? [{ key: "consigne", label: t("interaction.feedback-open"), onSelect: onConsigne }] : []),
    ...rejects.filter((o) => o.stop).map((o, index) => item(o, o.label, index === 0)),
  ];
  return (
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
  );
}

/** Consigne de refus, ouverte à la demande : Entrée refuse avec elle (comme
 *  le terminal), Échap la referme. */
function Consigne({ onSend, onClose }: { onSend: (message: string) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  return (
    <div className="appr-consigne">
      <Input
        autoFocus
        className="int-input int-feedback"
        value={text}
        placeholder={t("interaction.feedback-placeholder")}
        aria-label={t("interaction.feedback-placeholder")}
        onChange={(ev) => setText(ev.target.value)}
        onKeyDown={(ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            if (text.trim()) onSend(text.trim());
          } else if (ev.key === "Escape") {
            ev.preventDefault();
            onClose();
          }
        }}
      />
      <span className="appr-hint">{t("interaction.feedback-hint")}</span>
    </div>
  );
}

export default function ApprovalCard({ event: e, threadId }: { event: InteractionEvent; threadId: string | null }) {
  // choix envoyé : la carte se replie aussitôt (optimiste), avant l'état
  // final ré-émis par le serveur — pas de double envoi.
  const [done, setDone] = useState<Done | null>(null);
  // consigne de refus : le champ ne s'ouvre qu'à la demande
  const [consigne, setConsigne] = useState(false);
  const final = !!done || e.state !== "pending";
  const opts = buildOptions(e);
  const run = (o: Opt, message?: string) => {
    sendInteractionAnswer(e, threadId, o.respond(message));
    setDone({ key: o.key, message });
  };
  const firstReject = opts.find((o) => isReject(o) && !o.stop) ?? opts.find(isReject);

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
  if (final) return <DoneLine e={e} lines={lines} verdict={verdictOf(e, opts, done)} />;

  return (
    <div className="int-card appr" data-approval-pending="true" data-request-id={e.requestId}>
      <CommandHead e={e} detail={detail} lines={lines} />
      <Context e={e} />
      <div className="appr-l2">
        {e.reason ? (
          <span className="appr-reason" title={e.reason}>
            <InfoIcon size={12} />
            <span>{e.reason}</span>
          </span>
        ) : null}
        <Actions e={e} opts={opts} run={run} onConsigne={e.feedback && firstReject ? () => setConsigne(true) : null} />
      </div>
      {consigne && firstReject ? (
        <Consigne onSend={(message) => run(firstReject, message)} onClose={() => setConsigne(false)} />
      ) : null}
    </div>
  );
}
