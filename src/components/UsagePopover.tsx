import { useEffect, useState } from "react";
import { t } from "../lib/i18n";
import { wsSend } from "../lib/wsBus";

type Limit = { used_percent?: number; window_minutes?: number; resets_at?: number } | null;
type Usage = {
  claude: { ts: number; data: any } | null;
  codex: { ts: number; data: any } | null;
  models: Record<string, { turns: number; output: number }>;
};

function ringColor(p: number): string {
  if (p >= 85) return "var(--u-hot, #e06c75)";
  if (p >= 60) return "var(--u-warn, #e0b74a)";
  return "var(--u-ok, #98c379)";
}

function fmtReset(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const today = d.toDateString() === new Date().toDateString();
  return today
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

function Ring({ pct, label }: { pct: number | null; label: string }) {
  const p = pct ?? 0;
  const C = 2 * Math.PI * 19;
  return (
    <div className="ur-ring">
      <svg width="46" height="46" viewBox="0 0 46 46">
        <circle cx="23" cy="23" r="19" fill="none" stroke="var(--bg-ctl)" strokeWidth="5" />
        <circle cx="23" cy="23" r="19" fill="none" stroke={pct == null ? "var(--bg-ctl)" : ringColor(p)}
          strokeWidth="5" strokeLinecap="round" strokeDasharray={C}
          strokeDashoffset={C * (1 - Math.min(100, p) / 100)} transform="rotate(-90 23 23)" />
      </svg>
      <div className="ur-v">{pct == null ? "—" : `${Math.round(p)} %`}</div>
      <div className="ur-l">{label}</div>
    </div>
  );
}

/** Pire pourcentage toutes limites confondues — pour le point sur l'icône. */
export function worstOf(u: Usage | null): number | null {
  if (!u) return null;
  const vals: number[] = [];
  for (const rl of [u.claude?.data, u.codex?.data]) {
    if (rl?.primary?.used_percent != null) vals.push(rl.primary.used_percent);
    if (rl?.secondary?.used_percent != null) vals.push(rl.secondary.used_percent);
  }
  return vals.length ? Math.max(...vals) : null;
}

export default function UsagePopover({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    const onUsage = (e: Event) => setUsage((e as CustomEvent).detail);
    window.addEventListener("usage-data", onUsage);
    return () => window.removeEventListener("usage-data", onUsage);
  }, []);

  useEffect(() => {
    if (!open || usage) return;
    wsSend({ type: "getUsage" });
    let tries = 0;
    const iv = setInterval(() => {
      if (tries++ > 8) { clearInterval(iv); return; }
      wsSend({ type: "getUsage" });
    }, 1200);
    return () => clearInterval(iv);
  }, [open, usage == null]);

  if (!open) return null;
  const cl: { primary?: Limit; secondary?: Limit } = usage?.claude?.data ?? {};
  const cx: { primary?: Limit; secondary?: Limit } = usage?.codex?.data ?? {};
  const models = Object.entries(usage?.models ?? {}).sort((a, b) => b[1].output - a[1].output);

  return (
    <div className="ur-pop" onClick={(e) => e.stopPropagation()}>
      <h4>{t("usage.title")}</h4>
      <div className="ur-rings">
        <Ring pct={cl.primary?.used_percent ?? null} label={t("usage.claude-5h")} />
        <Ring pct={cl.secondary?.used_percent ?? null} label={t("usage.claude-week")} />
        <Ring pct={cx.primary?.used_percent ?? null} label={t("usage.codex-5h")} />
        <Ring pct={cx.secondary?.used_percent ?? null} label={t("usage.codex-week")} />
      </div>
      {models.length > 0 && (
        <div className="ur-models">
          <h4>{t("usage.today")}</h4>
          {models.slice(0, 6).map(([m, v]) => (
            <div key={m} className="ur-mrow">
              <span>{m}</span>
              <em>{v.turns} {t("usage.turns")} · {v.output >= 1000 ? `${(v.output / 1000).toFixed(0)} k` : v.output} tok</em>
            </div>
          ))}
        </div>
      )}
      <div className="ur-reset">
        {cl.primary?.resets_at && <span>Claude 5 h : {fmtReset(cl.primary.resets_at)}</span>}
        {cx.primary?.resets_at && <span>Codex 5 h : {fmtReset(cx.primary.resets_at)}</span>}
      </div>
      {!usage?.claude && !usage?.codex && (
        <div className="ur-empty">{t("usage.empty")}</div>
      )}
      <button className="ur-close" onClick={onClose}>esc</button>
    </div>
  );
}
