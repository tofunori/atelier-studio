import { fmtTime } from "./turnParts";

export function formatStampRange(startMs: number, endMs: number | null,
  fmt?: "system" | "24h" | "12h"): string {
  const start = fmtTime(startMs, fmt);
  if (endMs == null) return start;
  const end = fmtTime(endMs, fmt);
  return end === start ? start : `${start} → ${end}`;
}

export function TimelineStamp({ startMs, endMs, fmt }:
  { startMs: number; endMs: number | null; fmt?: "system" | "24h" | "12h" }) {
  // l'infobulle porte la DATE (fil de plusieurs jours, GAP-30)
  const precise = (ms: number) => new Date(ms).toLocaleString([], {
    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  return (
    <span className="timeline-stamp"
      title={endMs != null ? `${precise(startMs)} → ${precise(endMs)}` : precise(startMs)}>
      {formatStampRange(startMs, endMs, fmt)}
    </span>
  );
}
