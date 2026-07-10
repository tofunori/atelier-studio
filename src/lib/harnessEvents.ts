// Reducer d'événements harnais (plan 025, step 8) — le MÊME code réduit les
// événements live (WS sidecar) et le replay d'un historique (materialize) :
// toute divergence live/replay est un bug de parité, pas une "nuance".
//
// Invariants (plan 025) :
//  - au plus UNE bulle streaming par turn ; un événement avec meta ne se
//    rattache qu'à la bulle de SON turnId, un événement legacy (sans meta)
//    garde la recherche globale historique ;
//  - identité d'un tool_update = (turnId, itemId) — deux turns peuvent
//    réutiliser le même id d'outil sans se remplacer ;
//  - thinking final remplace le thinking_live du même turn seulement ;
//  - un terminal (done/error) ne fige que la bulle streaming du même turn ;
//  - un meta.eventId déjà présent dans la liste est ignoré (dédup reconnexion
//    WS) — l'état de dédup vit DANS la liste elle-même, aucun état module ;
//  - un history tardif fusionne les événements manquants par eventId/sequence
//    sans jamais écraser les événements live plus récents.
import type { AgentEvent, HarnessEventMeta } from "./ws";

/** Meta harnais (schema v1) si présente — la meta provisoire (bulle user
 * optimiste) n'a pas d'eventId et n'est jamais une identité autoritaire. */
function harnessMeta(ev: AgentEvent): HarnessEventMeta | null {
  const m = ev.meta;
  return m && "eventId" in m ? m : null;
}

/** turnId d'un événement ; "" pour un événement legacy (même convention que
 * l'identité (turnId, itemId) des tool_update). */
function turnOf(ev: AgentEvent): string {
  const m = ev.meta;
  return m && "turnId" in m ? m.turnId : "";
}

function tsOf(ev: AgentEvent): number | undefined {
  return "ts" in ev ? ev.ts : undefined;
}

/** Horodatage affiché : ts du corps (fixtures, bulle optimiste), sinon ts de
 * la meta (horloge sidecar — seule valeur correcte au replay d'un journal),
 * sinon maintenant (événement live legacy, comportement historique). */
function stamp(ev: AgentEvent): number {
  return tsOf(ev) ?? harnessMeta(ev)?.ts ?? Date.now();
}

/** Indice de LA bulle streaming à laquelle `ev` peut se rattacher.
 * Avec meta : bulle du même turn seulement (une bulle d'un autre turn est
 * invisible — on en créera une nouvelle). Sans meta : dernière bulle du fil,
 * où qu'elle soit (les events outils/thinking s'intercalent entre les deltas
 * et le bloc final — comportement historique inchangé). */
function findStreamingIdx(list: AgentEvent[], ev: AgentEvent): number {
  const m = harnessMeta(ev);
  for (let k = list.length - 1; k >= 0; k--) {
    const it = list[k];
    if (it.kind !== "streaming") continue;
    if (!m || turnOf(it) === m.turnId) return k;
  }
  return -1;
}

/** Le dernier élément est-il un thinking_live rattachable à `ev` ?
 * (même règle turn-scoped que le streaming ; sans meta → comportement
 * historique : simple test du dernier élément). */
function lastIsAttachableThinking(list: AgentEvent[], ev: AgentEvent): boolean {
  const last = list[list.length - 1];
  if (last?.kind !== "thinking_live") return false;
  const m = harnessMeta(ev);
  return !m || turnOf(last) === m.turnId;
}

/**
 * Réduit UN événement dans la liste d'un thread. Pure : retourne une NOUVELLE
 * liste, ou la même référence si l'événement est un no-op (éphémère jamais
 * affiché, ou duplicate de reconnexion).
 */
export function reduceHarnessEvent(list: AgentEvent[], ev: AgentEvent): AgentEvent[] {
  // éphémères jamais matérialisés dans le fil (les side-effects — workingSince,
  // usage ring — restent dans App) : no-op strict
  if (ev.kind === "started" || ev.kind === "heartbeat" || ev.kind === "usage") return list;
  // dédup reconnexion WS : un eventId déjà présent dans la liste (y compris
  // adopté par une bulle streaming/thinking_live au fil des deltas) est ignoré
  const meta = harnessMeta(ev);
  if (meta && list.some((x) => harnessMeta(x)?.eventId === meta.eventId)) return list;

  const next = [...list];
  const last = next[next.length - 1];

  // ack sidecar d'un message user optimiste : adopter la metadata autoritaire
  // (turnId/sequence/eventId) sans dupliquer la bulle ni perdre l'affichage
  // local (imageUrl, pastes complets)
  if (ev.kind === "user") {
    const mid = ev.meta?.messageId;
    if (mid) {
      const idx = next.findIndex((x) => x.kind === "user" && x.meta?.messageId === mid);
      if (idx >= 0) {
        next[idx] = { ...next[idx], meta: ev.meta };
        return next;
      }
    }
    next.push({ ...ev, ts: stamp(ev) });
    return next;
  }

  // raisonnement en cours de frappe : accumuler sur le bloc live du même turn
  if (ev.kind === "thinking_delta") {
    if (lastIsAttachableThinking(next, ev)) {
      const lv = last as Extract<AgentEvent, { kind: "thinking_live" }>;
      // le bloc adopte la meta du dernier delta : il porte ainsi le turnId et
      // le dernier eventId vu (dédup) sans état hors liste
      next[next.length - 1] = { ...lv, text: lv.text + ev.text, meta: ev.meta ?? lv.meta };
    } else {
      next.push({ kind: "thinking_live", text: ev.text, ts: stamp(ev), meta: ev.meta });
    }
    return next;
  }
  if (ev.kind === "thinking") {
    // bloc final : remplace le live du même turn s'il termine le fil, sinon s'ajoute
    if (lastIsAttachableThinking(next, ev)) {
      next[next.length - 1] = { kind: "thinking", text: ev.text, ts: stamp(ev), meta: ev.meta };
    } else {
      next.push({ kind: "thinking", text: ev.text, ts: stamp(ev), meta: ev.meta });
    }
    return next;
  }

  // texte en cours de frappe : accumuler (delta) ou remplacer (stream_set),
  // puis le bloc final "text" remplace la bulle streaming
  if (ev.kind === "delta" || ev.kind === "stream_set") {
    const sIdx = findStreamingIdx(next, ev);
    if (sIdx >= 0) {
      const sb = next[sIdx] as Extract<AgentEvent, { kind: "streaming" }>;
      next[sIdx] = {
        ...sb,
        text: ev.kind === "delta" ? sb.text + ev.text : ev.text,
        meta: ev.meta ?? sb.meta,
      };
    } else {
      next.push({ kind: "streaming", text: ev.text, ts: stamp(ev), meta: ev.meta });
    }
    return next;
  }
  if (ev.kind === "text") {
    // le bloc final remplace SA bulle streaming, même si des events outils se
    // sont intercalés depuis les derniers deltas
    const sIdx = findStreamingIdx(next, ev);
    if (sIdx >= 0) next[sIdx] = { ...ev, ts: stamp(ev) };
    else next.push({ ...ev, ts: stamp(ev) });
    return next;
  }

  if (ev.kind === "tool_update") {
    // identité d'un item = (turnId, itemId) : deux turns peuvent réutiliser le
    // même id d'outil sans se remplacer (plan 025)
    const idx = next.findIndex(
      (item) => item.kind === "tool_update" && item.id === ev.id && turnOf(item) === turnOf(ev),
    );
    const upd: AgentEvent = { ...ev, ts: stamp(ev) };
    if (idx >= 0) next[idx] = upd;
    else next.push(upd);
    return next;
  }
  if (ev.kind === "activity") {
    const idx = next.findIndex((item) => item.kind === "activity" && item.id === ev.id);
    const upd: AgentEvent = { ...ev, ts: stamp(ev) };
    if (idx >= 0) next[idx] = upd;
    else next.push(upd);
    return next;
  }
  if (ev.kind === "interaction") {
    // mises à jour d'état (answered/declined/expired) ré-émises avec le MÊME
    // requestId : remplacement en place, la dernière version gagne (plan 025,
    // step 5) — requestId est unique par requête sidecar
    const idx = next.findIndex(
      (item) => item.kind === "interaction" && item.requestId === ev.requestId,
    );
    const upd: AgentEvent = { ...ev, ts: stamp(ev) };
    if (idx >= 0) next[idx] = upd;
    else next.push(upd);
    return next;
  }
  if (ev.kind === "todos" || ev.kind === "goal") {
    // singletons : le serveur ré-émet l'état complet à chaque mise à jour
    // (goal : temps/tokens à chaque tour) — remplacement en place, comme le
    // journal sidecar (SINGLETON_KINDS)
    let idx = -1;
    for (let i = next.length - 1; i >= 0; i--) {
      if (next[i].kind === ev.kind) { idx = i; break; }
    }
    const upd: AgentEvent = { ...ev, ts: stamp(ev) };
    if (idx >= 0) next[idx] = upd;
    else next.push(upd);
    return next;
  }

  // fin de tour : une bulle streaming jamais finalisée (interruption, provider
  // sans bloc final) devient un texte définitif — ou disparaît si vide. Un
  // terminal avec meta ne fige que la bulle de SON turn.
  if (ev.kind === "done" || ev.kind === "error") {
    const sIdx = findStreamingIdx(next, ev);
    if (sIdx >= 0) {
      const sb = next[sIdx] as Extract<AgentEvent, { kind: "streaming" }>;
      const txt = String(sb.text ?? "");
      if (txt.trim()) next[sIdx] = { kind: "text", text: txt, ts: sb.ts, meta: sb.meta };
      else next.splice(sIdx, 1);
    }
    // error/tool n'ont pas de ts déclaré mais le runtime historique en pose un
    // (affichage de l'heure) — cast local plutôt qu'un élargissement de ws.ts
    next.push({ ...ev, ts: stamp(ev) } as AgentEvent);
    return next;
  }

  // permission, tool, edit, streaming (déjà matérialisé)… : simple ajout
  next.push({ ...ev, ts: stamp(ev) } as AgentEvent);
  return next;
}

/** Assainissement d'un historique reçu : une bulle "streaming" orpheline
 * persistée (avant le fix bec2c27) ressusciterait son curseur clignotant —
 * figée en texte si non vide, retirée sinon. */
function sanitizeHistory(events: AgentEvent[]): AgentEvent[] {
  return events.flatMap((ev) =>
    ev.kind !== "streaming" ? [ev]
    : String(ev.text ?? "").trim() ? [{ ...ev, kind: "text" as const }] : []);
}

/**
 * Matérialise un historique en le REJOUANT à travers reduceHarnessEvent,
 * événement par événement : le replay passe par LE MÊME code que le live
 * (point central du plan 025, step 8).
 */
export function materializeHarnessHistory(events: AgentEvent[]): AgentEvent[] {
  let out: AgentEvent[] = [];
  for (const ev of sanitizeHistory(events)) out = reduceHarnessEvent(out, ev);
  return out;
}

/**
 * Fusionne un history tardif dans un fil possiblement déjà peuplé en mémoire :
 *  - fil vide → materialize(incoming) ;
 *  - fil peuplé → seuls les événements de `incoming` IDENTIFIÉS (meta.eventId)
 *    et absents de `current` sont insérés, ordonnés par meta.sequence avant
 *    les événements live de sequence supérieure, puis la timeline complète est
 *    rejouée via le reducer — un état live plus récent (même item, même
 *    requestId, duplicate eventId) reste gagnant. Les événements sans meta
 *    sont ignorés en fusion : un history legacy ne peut jamais écraser une
 *    session vivante (retourne la même référence si rien à fusionner).
 */
export function mergeHarnessHistory(current: AgentEvent[], incoming: AgentEvent[]): AgentEvent[] {
  if (!current.length) return materializeHarnessHistory(incoming);
  const known = new Set<string>();
  for (const ev of current) {
    const m = harnessMeta(ev);
    if (m) known.add(m.eventId);
  }
  const missing = sanitizeHistory(incoming)
    .filter((ev) => {
      const m = harnessMeta(ev);
      return m !== null && !known.has(m.eventId);
    })
    .sort((a, b) => harnessMeta(a)!.sequence - harnessMeta(b)!.sequence);
  if (!missing.length) return current;

  // interclassement par sequence : chaque manquant précède le premier
  // événement courant de sequence STRICTEMENT supérieure ; les événements
  // courants sans sequence (bulle optimiste, legacy) gardent leur place
  const timeline: AgentEvent[] = [];
  let mi = 0;
  for (const ev of current) {
    const seq = harnessMeta(ev)?.sequence;
    while (mi < missing.length && seq !== undefined && harnessMeta(missing[mi])!.sequence < seq) {
      timeline.push(missing[mi++]);
    }
    timeline.push(ev);
  }
  while (mi < missing.length) timeline.push(missing[mi++]);

  let out: AgentEvent[] = [];
  for (const ev of timeline) out = reduceHarnessEvent(out, ev);
  return out;
}

/** Contenu court discriminant d'un événement legacy (pour l'identité
 * synthétique) — jamais le contenu complet, seulement de quoi distinguer. */
function legacyContent(ev: AgentEvent): string {
  switch (ev.kind) {
    case "error": return ev.message;
    case "permission": return ev.requestId;
    case "interaction": return ev.requestId;
    case "tool_update": return `${ev.id}:${ev.name}`;
    case "activity": return `${ev.id}:${ev.title}`;
    case "tool": return ev.name;
    case "edit": return ev.files.map((f) => f.path).join("|");
    case "todos": return ev.items.map((i) => `${i.completed ? "x" : "-"}${i.text}`).join("|");
    case "goal": return ev.goal?.objective ?? "";
    case "done": return ev.result;
    case "usage": return String(ev.usage.output ?? "");
    default: return "text" in ev ? String(ev.text ?? "") : "";
  }
}

/** Hash djb2 court et stable (base36) du début du contenu. */
function contentHash(s: string): string {
  let h = 5381;
  const src = s.slice(0, 200);
  for (let i = 0; i < src.length; i++) h = ((h << 5) + h + src.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Identité stable d'un événement : turnId + itemId (ou eventId) quand la meta
 * harnais existe ; sinon identité synthétique legacy kind+ts+hash de contenu
 * court — JAMAIS un index de tableau (instable à la moindre insertion).
 */
export function eventIdentity(ev: AgentEvent): string {
  const m = harnessMeta(ev);
  if (m) return `${m.turnId}:${m.itemId ?? m.eventId}`;
  return `legacy:${ev.kind}:${tsOf(ev) ?? 0}:${contentHash(legacyContent(ev))}`;
}
