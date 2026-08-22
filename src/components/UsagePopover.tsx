import { useEffect, useState } from "react";
import { Popover, PopoverContent } from "./shadcn/popover";
import { t } from "../lib/i18n";
import { wsSend } from "../lib/wsBus";
import { Button } from "./ui";

type Limit = { used_percent?: number | null; window_minutes?: number; resets_at?: number | null } | null;
type LimitsData = { primary?: Limit; secondary?: Limit };
type ProviderUsage =
  | { kind: "limits"; ts: number; stale_s?: number; label?: string | null; data: LimitsData }
  | { kind: "tokens"; ts: number; data: { input: number; output: number; turns: number } }
  | { kind: "ledger" }
  | null;
type Usage = {
  providers?: Record<string, ProviderUsage>;
  models: Record<string, { turns: number; output: number }>;
};

/** Ordre d'affichage fixe des providers du popover. */
const PROVIDERS: { id: string; name: string }[] = [
  { id: "claude", name: "Claude" },
  { id: "codex", name: "Codex" },
  { id: "grok", name: "Grok" },
  { id: "kimi", name: "Kimi" },
  { id: "opencode", name: "OpenCode" },
];

function ringColor(p: number): string {
  if (p >= 85) return "var(--u-hot, #e06c75)";
  if (p >= 60) return "var(--u-warn, #e0b74a)";
  return "var(--u-ok, #98c379)";
}

function fmtReset(ts?: number | null): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const today = d.toDateString() === new Date().toDateString();
  return today
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

function fmtAgo(s: number): string {
  if (s < 5400) return `${Math.max(1, Math.round(s / 60))} min`;
  if (s < 172800) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} j`;
}

function fmtTok(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} M`;
  if (n >= 1000) return `${Math.round(n / 1000)} k`;
  return `${n}`;
}

/** Mini-jauge : anneau + % + fenêtre (5 h / sem.). */
function Gauge({ pct, label }: { pct: number | null; label: string }) {
  const p = pct ?? 0;
  const C = 2 * Math.PI * 12;
  return (
    <div className="ur-gauge">
      <svg width="30" height="30" viewBox="0 0 30 30">
        <circle cx="15" cy="15" r="12" fill="none" stroke="var(--bg-ctl)" strokeWidth="4" />
        <circle cx="15" cy="15" r="12" fill="none" stroke={pct == null ? "var(--bg-ctl)" : ringColor(p)}
          strokeWidth="4" strokeLinecap="round" strokeDasharray={C}
          strokeDashoffset={C * (1 - Math.min(100, p) / 100)} transform="rotate(-90 15 15)" />
      </svg>
      <div>
        <div className="ur-v">{pct == null ? "—" : `${Math.round(p)} %`}</div>
        <div className="ur-l">{label}</div>
      </div>
    </div>
  );
}

/** Pire pourcentage toutes limites confondues — pour le point sur l'icône. */
export function worstOf(u: Usage | null): number | null {
  if (!u) return null;
  const vals: number[] = [];
  for (const p of Object.values(u.providers ?? {})) {
    if (p?.kind !== "limits") continue;
    if (p.data?.primary?.used_percent != null) vals.push(p.data.primary.used_percent);
    if (p.data?.secondary?.used_percent != null) vals.push(p.data.secondary.used_percent);
  }
  return vals.length ? Math.max(...vals) : null;
}

function ProviderRow({ name, p }: { name: string; p: ProviderUsage }) {
  if (p?.kind === "limits") {
    const { primary, secondary } = p.data ?? {};
    const resets = [
      primary?.resets_at ? `${t("usage.5h")} : ${fmtReset(primary.resets_at)}` : null,
      secondary?.resets_at ? `${t("usage.week")} : ${fmtReset(secondary.resets_at)}` : null,
    ].filter(Boolean);
    // grok : une seule fenêtre (crédits hebdo) → jauge unique étiquetée sem.
    const single = primary !== undefined && secondary == null;
    return (
      <div className="ur-row">
        <div className="ur-head">
          <span className="ur-name">{name}</span>
          <div className="ur-gauges">
            {single ? (
              <Gauge
                pct={primary?.used_percent ?? null}
                label={(primary?.window_minutes ?? 0) >= 10000 ? t("usage.week") : t("usage.5h")}
              />
            ) : (
              <>
                <Gauge pct={primary?.used_percent ?? null} label={t("usage.5h")} />
                <Gauge pct={secondary?.used_percent ?? null} label={t("usage.week")} />
              </>
            )}
          </div>
        </div>
        {(resets.length > 0 || p.stale_s != null || p.label) && (
          <div className="ur-sub">
            {resets.length > 0 && <span>reset {resets.join(" · ")}</span>}
            {p.label && <span>{p.label}</span>}
            {p.stale_s != null && p.stale_s > 900 && (
              <span>{t("usage.updated-ago", { d: fmtAgo(p.stale_s) })}</span>
            )}
          </div>
        )}
      </div>
    );
  }
  if (p?.kind === "tokens") {
    const d = p.data;
    return (
      <div className="ur-row">
        <div className="ur-head">
          <span className="ur-name">{name}</span>
          <span className="ur-tok">
            {fmtTok(d.input + d.output)} tok · {d.turns} {t("usage.turns")}
          </span>
        </div>
        <div className="ur-sub"><span>{t("usage.no-quota")}</span></div>
      </div>
    );
  }
  // ledger (opencode) ou provider sans données
  return (
    <div className="ur-row ur-off">
      <div className="ur-head">
        <span className="ur-name">{name}</span>
        <span className="ur-tok">—</span>
      </div>
      <div className="ur-sub"><span>{t("usage.no-quota")}</span></div>
    </div>
  );
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

  const providers = usage?.providers ?? {};
  const anyData = Object.values(providers).some((p) => p != null && p.kind !== "ledger");
  const models = Object.entries(usage?.models ?? {}).sort((a, b) => b[1].output - a[1].output);

  // ancre = bouton usage du Rail (déclencheur découplé via l'événement
  // "usage-toggle") ; résolue paresseusement à l'ouverture
  const anchor = () => document.querySelector<HTMLElement>(".usage-ib");

  return (
    <Popover
      open={open}
      onOpenChange={(next, details) => {
        if (next) return;
        // le bouton du Rail toggle déjà usageOpen : ignorer l'outside-press
        // sur l'ancre, sinon Base UI ferme puis le clic rouvre aussitôt
        if (
          details.reason === "outside-press" &&
          anchor()?.contains(details.event.target as Node)
        ) {
          return;
        }
        onClose();
      }}
    >
      <PopoverContent anchor={anchor} side="top" align="start" sideOffset={8} className="ur-pop">
      <h4>{t("usage.title")}</h4>
      {anyData ? (
        <div className="ur-provs">
          {PROVIDERS.map(({ id, name }) => (
            <ProviderRow key={id} name={name} p={providers[id] ?? null} />
          ))}
        </div>
      ) : (
        <div className="ur-empty">{t("usage.empty")}</div>
      )}
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
      <Button variant="ghost" className="ur-close" onClick={onClose}>esc</Button>
      </PopoverContent>
    </Popover>
  );
}
