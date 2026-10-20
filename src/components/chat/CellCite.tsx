// Citation « cellule N » d'une réponse de l'agent (noyau Python, A) : le
// chiffre cité juste avant est vérifié dans la sortie de la cellule. Pastille
// ✓ quand il y figure, avertissement sinon ; un clic ouvre le détail et la
// cellule dans la surface Noyau.
import { useContext, useEffect, useRef, useState } from "react";
import { t } from "../../lib/i18n";
import { kernelCommand, openKernelCell } from "../../lib/kernel";
import { Button, Popover, PopoverContent, PopoverTrigger, RowButton } from "../ui";
import { MdThreadContext } from "./mdThread";

/** Verdict d'un chiffre cité : `found` dans la sortie, `code` seulement dans
 *  le code, `missing`, `unknown` (sortie coupée), `nocell`. */
export type ClaimCheck = { status: "found" | "code" | "missing" | "unknown" | "nocell"; closest?: string };

const claimCache = new Map<string, Promise<ClaimCheck>>();
type PendingClaim = { cell: number; value: string; resolve: (c: ClaimCheck) => void };
const pendingClaims = new Map<string, PendingClaim[]>();

/** Vérifie un chiffre cité (`value`, tel qu'écrit) dans la sortie de la
 *  cellule ; les demandes d'un même rendu partent en un seul message. */
export function verifyClaim(threadId: string, cell: number, value: string): Promise<ClaimCheck> {
  const key = `${threadId}:${cell}:${value}`;
  const known = claimCache.get(key);
  if (known) return known;
  const promise = new Promise<ClaimCheck>((resolve) => {
    const queue = pendingClaims.get(threadId);
    if (queue) { queue.push({ cell, value, resolve }); return; }
    pendingClaims.set(threadId, [{ cell, value, resolve }]);
    window.setTimeout(() => {
      const batch = pendingClaims.get(threadId) ?? [];
      pendingClaims.delete(threadId);
      kernelCommand<{ checks: { cell: number; value: string; check: ClaimCheck }[] }>(
        threadId, "verify", { claims: batch.map(({ cell: c, value: v }) => ({ cell: c, value: v })) }, 15_000,
      ).then((r) => {
        batch.forEach((item, i) => item.resolve(r.checks?.[i]?.check ?? { status: "unknown" }));
      }).catch(() => {
        batch.forEach((item) => { claimCache.delete(`${threadId}:${item.cell}:${item.value}`); item.resolve({ status: "unknown" }); });
      });
    }, 30);
  });
  claimCache.set(key, promise);
  return promise;
}

/** Un nombre tel que l'agent l'écrit : signe, virgule décimale, pourcentage. */
const CITED_NUMBER = /[-\u2212\u2013]?\d+(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d+)?(?:[eE][-+]?\d+)?(?:[ \u00a0\u202f]?%)?/gu;

/** Dernier nombre avant une citation de cellule, dans la même phrase ; un
 *  nombre collé à une lettre (1er, x2) n'en est pas un. */
export function citedValue(before: string): string | null {
  const sentence = before.slice(-160).split(/(?<=[.!?;])\s|\n/u).pop() ?? "";
  let last: string | null = null;
  for (const m of sentence.matchAll(CITED_NUMBER)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (/[\p{L}_]/u.test(sentence[start - 1] ?? "") || /[\p{L}_]/u.test(sentence[end] ?? "")) continue;
    last = m[0].trim();
  }
  return last;
}

/** Texte du bloc avant la pastille, depuis la pastille précédente : le
 *  chiffre que l'agent a écrit juste avant la citation. */
export function textBefore(el: HTMLElement): string {
  const block = el.closest("p, li, td, th") ?? el.parentElement;
  if (!block) return "";
  const range = document.createRange();
  range.selectNodeContents(block);
  const pills = [...block.querySelectorAll(".cell-cite")];
  const previous = pills[pills.indexOf(el) - 1];
  if (previous) range.setStartAfter(previous);
  range.setEndBefore(el);
  return range.toString();
}

const CHECK = <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>;
const WARN = <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.8" /><path d="M8 5v3.4M8 10.8v.1" /></svg>;
const CELL = <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3" width="11" height="10" rx="1.5" /><path d="M5 6.5 6.8 8 5 9.5M8.5 9.8h2.5" /></svg>;

/** Valeur de la sortie écrite comme l'agent écrit (virgule décimale). */
function asWritten(shown: string, claim: string): string {
  return claim.includes(",") ? shown.replace(".", ",") : shown;
}

export default function CellCite({ cell, label }: { cell: number; label: string }) {
  const threadId = useContext(MdThreadContext);
  const pill = useRef<HTMLButtonElement | null>(null);
  const [value, setValue] = useState<string | null>(null);
  const [check, setCheck] = useState<ClaimCheck | null>(null);
  useEffect(() => {
    const el = pill.current;
    setValue(el ? citedValue(textBefore(el)) : null);
  }, [label]);
  useEffect(() => {
    if (!threadId || !value || !Number.isInteger(cell) || cell <= 0) return;
    let live = true;
    void verifyClaim(threadId, cell, value).then((c) => { if (live) setCheck(c); });
    return () => { live = false; };
  }, [threadId, cell, value]);

  const state = !value ? "plain" : !check ? "pending" : check.status === "found" ? "found"
    : check.status === "missing" || check.status === "nocell" ? "missing" : "plain";
  const icon = state === "found" ? CHECK : state === "missing" ? WARN : CELL;
  const title = !value || !check ? t("kernel.cite-open", { n: cell })
    : check.status === "found" ? t("kernel.cite-found", { value, n: cell })
    : check.status === "missing" ? t("kernel.cite-missing", { value, n: cell })
    : check.status === "code" ? t("kernel.cite-code", { value, n: cell })
    : check.status === "nocell" ? t("kernel.cite-nocell", { n: cell })
    : t("kernel.cite-unknown", { n: cell });
  const detail = check?.status === "missing"
    ? (check.closest
      ? t("kernel.cite-closest", { n: cell, value: asWritten(check.closest, value ?? "") })
      : t("kernel.cite-none"))
    : check?.status === "code" ? t("kernel.cite-code-detail")
    : check?.status === "unknown" ? t("kernel.cite-unknown-detail")
    : null;
  const ask = () => {
    window.dispatchEvent(new CustomEvent("kernel-add-to-chat", {
      detail: { text: t("kernel.cite-ask", { value: value ?? "", n: cell }) },
    }));
  };

  return (
    <Popover modal={false}>
      <PopoverTrigger render={<RowButton ref={pill} className="cell-cite" data-state={state} title={title} />}>
        {icon}<span>{label}</span>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" plain className="cell-cite-pop">
        <p className="cell-cite-title" data-state={state}>{state === "found" || state === "missing" ? icon : null}{title}</p>
        {detail ? <p className="cell-cite-detail">{detail}</p> : null}
        <div className="cell-cite-actions">
          <Button variant="ghost" size="xs" onClick={() => openKernelCell(cell)}>{t("kernel.cite-open", { n: cell })}</Button>
          {state === "missing" ? <Button variant="ghost" size="xs" onClick={ask}>{t("kernel.cite-ask-agent")}</Button> : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
