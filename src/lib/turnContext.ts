import type { AgentEvent } from './ws';

export type ContextSource = {
  id: string; title: string; kind: string;
  mode: 'inline' | 'search' | 'unavailable' | 'corpus';
  chars: number; providedChars: number; truncated: boolean;
};
/** Server-authored snapshot of Atelier's additions, not the model's entire context. */
export type TurnContext = {
  version: 1; provider: string; consigne: string | null; consigneDeferred?: boolean;
  sources: ContextSource[]; delivery: 'this_turn' | 'session' | 'none'; knowledgeText: string;
};
export type RecoveredPassage = { sourceId: string; quote: string; location: string; toolId: string };
/** Projected timeline rows are copies; resolve them within the current thread. */
export function contextMessage(events: AgentEvent[], requested?: AgentEvent) {
  if (!requested) return null;
  return events.find((e): e is Extract<AgentEvent, {kind:'user'}> => e.kind === 'user' && (
    e === requested || Boolean(e.meta?.messageId && e.meta.messageId === requested.meta?.messageId)
    || Boolean(e.meta && requested.meta && 'eventId' in e.meta && 'eventId' in requested.meta && e.meta.eventId === requested.meta.eventId)
  )) ?? null;
}
export function turnId(event: AgentEvent): string | undefined {
  return event.meta && 'turnId' in event.meta ? event.meta.turnId : undefined;
}
/** Only actual successful KB command results count as retrieved passages. */
export function recoveredPassages(events: AgentEvent[], selected: AgentEvent): RecoveredPassage[] {
  const id = turnId(selected);
  if (!id) return [];
  const latest = new Map<string, Extract<AgentEvent, {kind:'tool_update'}>>();
  for (const e of events) if (e.kind === 'tool_update' && turnId(e) === id) latest.set(e.id, e);
  return [...latest.values()].flatMap(e => {
    if (e.truncated || (e.exitCode !== undefined && e.exitCode !== 0)
      || !['completed', 'success', 'done'].includes(e.status ?? '')
      || !/atelier-kb(?:-rs)?\b[\s\S]*\bsearch\b/.test(`${e.detail ?? ''} ${JSON.stringify(e.input ?? '')}`)) return [];
    const start = e.output.indexOf('{');
    const end = e.output.lastIndexOf('}');
    if (start < 0 || end < start) return [];
    try {
      const result = JSON.parse(e.output.slice(start, end + 1));
      if (result.ok !== true || typeof result.source?.id !== 'string' || !Array.isArray(result.passages)) return [];
      return result.passages.flatMap((p: Record<string, unknown>) => typeof p.quote === 'string' && p.quote.trim()
        ? [{ sourceId: result.source.id, quote: p.quote, location: typeof p.cite === 'string' ? p.cite : typeof p.location === 'string' ? p.location : '', toolId: e.id }]
        : []);
    } catch { return []; }
  });
}
