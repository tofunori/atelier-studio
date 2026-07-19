import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { writeFileAtomic } from "./store.mjs";

const now = () => Date.now();
const optional = (value) => typeof value === "string" && value.trim() ? value.trim() : null;

function parseRrule(rrule) {
  const body = String(rrule ?? "").trim().replace(/^RRULE:/i, "");
  const fields = Object.fromEntries(body.split(";").map((part) => {
    const at = part.indexOf("=");
    if (at < 1) throw new Error("règle RRULE invalide");
    return [part.slice(0, at).trim().toUpperCase(), part.slice(at + 1).trim().toUpperCase()];
  }));
  if (!fields.FREQ) throw new Error("FREQ requis");
  if (!["MINUTELY", "HOURLY", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(fields.FREQ)) {
    throw new Error("fréquence non prise en charge");
  }
  const ranges = { INTERVAL: [1, 999], BYHOUR: [0, 23], BYMINUTE: [0, 59], BYMONTHDAY: [1, 31], BYMONTH: [1, 12] };
  for (const [key, [min, max]] of Object.entries(ranges)) {
    if (fields[key] == null) continue;
    const value = Number(fields[key]);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${key} invalide`);
  }
  if (fields.BYDAY && fields.BYDAY.split(",").some((day) => !["MO", "TU", "WE", "TH", "FR", "SA", "SU"].includes(day))) {
    throw new Error("BYDAY invalide");
  }
  return fields;
}

export function nextRunAt(rrule, after = now()) {
  const fields = parseRrule(rrule);
  const interval = Number(fields.INTERVAL ?? 1);
  if (fields.FREQ === "MINUTELY") {
    const minute = Math.floor(after / 60_000);
    return (minute + interval - (minute % interval || interval)) * 60_000 + (minute % interval === 0 ? interval * 60_000 : 0);
  }
  if (fields.FREQ === "HOURLY") {
    let hour = Math.floor(after / 3_600_000) + 1;
    while (hour % interval !== 0) hour += 1;
    return hour * 3_600_000 + Number(fields.BYMINUTE ?? 0) * 60_000;
  }
  const start = new Date(after);
  const days = fields.BYDAY?.split(",") ?? [];
  const dayCode = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const hour = Number(fields.BYHOUR ?? 9);
  const minute = Number(fields.BYMINUTE ?? 0);
  const monthDay = Number(fields.BYMONTHDAY ?? start.getDate());
  const month = Number(fields.BYMONTH ?? start.getMonth() + 1);
  for (let offset = 0; offset <= 366 * 6; offset += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset, hour, minute, 0, 0);
    if (date.getTime() <= after) continue;
    const epochDays = Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 86_400_000);
    const weekdayOk = days.length === 0 || days.includes(dayCode[date.getDay()]);
    const matches = fields.FREQ === "DAILY"
      ? epochDays % interval === 0 && weekdayOk
      : fields.FREQ === "WEEKLY"
        ? Math.floor(epochDays / 7) % interval === 0 && (days.length ? weekdayOk : date.getDay() === start.getDay())
        : fields.FREQ === "MONTHLY"
          ? (date.getFullYear() * 12 + date.getMonth()) % interval === 0 && date.getDate() === monthDay && weekdayOk
          : date.getFullYear() % interval === 0 && date.getMonth() + 1 === month && date.getDate() === monthDay && weekdayOk;
    if (matches) return date.getTime();
  }
  throw new Error("aucune prochaine exécution trouvée");
}

function normalize(item) {
  if (!item || !optional(item.id) || !optional(item.name) || !optional(item.prompt)) return null;
  if (!["ACTIVE", "PAUSED"].includes(item.status) || !["cron", "heartbeat"].includes(item.kind)) return null;
  if (item.kind === "heartbeat" && !optional(item.targetThreadId)) return null;
  try { parseRrule(item.rrule); } catch { return null; }
  return { ...item, runs: Array.isArray(item.runs) ? item.runs.slice(0, 50) : [] };
}

export class AutomationManager {
  constructor(filePath, threadStore) {
    this.filePath = filePath;
    this.threadStore = threadStore;
    this.items = [];
    this.activeRuns = new Map();
    if (existsSync(filePath)) {
      try { this.items = JSON.parse(readFileSync(filePath, "utf8")).map(normalize).filter(Boolean); } catch {}
    }
  }

  list() {
    return [...this.items].sort((a, b) => (a.nextRunAt ?? Infinity) - (b.nextRunAt ?? Infinity) || b.updatedAt - a.updatedAt);
  }

  get(id) { return this.items.find((item) => item.id === id); }

  persist() { writeFileAtomic(this.filePath, JSON.stringify(this.items, null, 2)); }

  activeHeartbeatFor(threadId, exceptId = null) {
    return this.items.some((item) => item.kind === "heartbeat" && item.status === "ACTIVE" && item.targetThreadId === threadId && item.id !== exceptId);
  }

  validateTarget(kind, status, targetThreadId, exceptId = null) {
    if (kind !== "heartbeat") return;
    if (!targetThreadId || !this.threadStore.get(targetThreadId)) throw new Error("chat cible introuvable");
    if (status === "ACTIVE" && this.activeHeartbeatFor(targetThreadId, exceptId)) throw new Error("ce chat possède déjà un heartbeat actif");
  }

  create(raw) {
    const name = optional(raw.name); const prompt = optional(raw.prompt); const rrule = optional(raw.rrule);
    if (!name || !prompt || !rrule) throw new Error("nom, prompt et fréquence requis");
    parseRrule(rrule);
    const status = raw.status === "PAUSED" ? "PAUSED" : "ACTIVE";
    const kind = raw.kind === "cron" ? "cron" : "heartbeat";
    const targetThreadId = optional(raw.targetThreadId);
    this.validateTarget(kind, status, targetThreadId);
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `automation-${crypto.randomUUID().slice(0, 8)}`;
    let id = base;
    while (this.get(id)) id = `${base}-${crypto.randomUUID().slice(0, 6)}`;
    const timestamp = now();
    const item = {
      id, name, prompt, status, kind, rrule, targetThreadId,
      projectRoot: optional(raw.projectRoot) ?? "", provider: optional(raw.provider) ?? "codex",
      model: optional(raw.model), effort: optional(raw.effort), permissionMode: optional(raw.permissionMode),
      nextRunAt: status === "ACTIVE" ? nextRunAt(rrule, timestamp) : null,
      lastRunAt: null, lastError: null, runs: [], createdAt: timestamp, updatedAt: timestamp,
    };
    this.items.push(item); this.persist(); return item;
  }

  update(raw) {
    const previous = this.get(raw.id);
    if (!previous) throw new Error("automatisation introuvable");
    const status = raw.status ?? previous.status; const kind = raw.kind ?? previous.kind;
    const rrule = optional(raw.rrule) ?? previous.rrule; parseRrule(rrule);
    const targetThreadId = raw.targetThreadId === undefined ? previous.targetThreadId : optional(raw.targetThreadId);
    this.validateTarget(kind, status, targetThreadId, previous.id);
    const scheduleChanged = status !== previous.status || rrule !== previous.rrule;
    const item = {
      ...previous, ...raw, status, kind, rrule, targetThreadId,
      name: optional(raw.name) ?? previous.name, prompt: optional(raw.prompt) ?? previous.prompt,
      nextRunAt: status === "ACTIVE" ? (scheduleChanged || previous.nextRunAt == null ? nextRunAt(rrule) : previous.nextRunAt) : null,
      updatedAt: now(),
    };
    this.items = this.items.map((entry) => entry.id === item.id ? item : entry); this.persist(); return item;
  }

  delete(id) { this.items = this.items.filter((item) => item.id !== id); this.persist(); }

  async execute(id, ctx, route, scheduled = false) {
    const item = this.get(id); if (!item) throw new Error("automatisation introuvable");
    if (scheduled && item.status !== "ACTIVE") throw new Error("automatisation en pause");
    let threadId; let thread; let provider; let projectRoot; let model; let effort;
    if (item.kind === "heartbeat") {
      threadId = item.targetThreadId; thread = this.threadStore.get(threadId);
      if (!thread) throw new Error("chat cible introuvable");
      if (thread.status === "running") {
        if (scheduled) { item.nextRunAt = now() + 60_000; item.lastError = "Chat occupé; nouvel essai dans une minute"; item.updatedAt = now(); this.persist(); }
        throw new Error("chat cible occupé; nouvel essai dans une minute");
      }
      provider = thread.provider; projectRoot = thread.projectRoot; ({ model, effort } = thread.lastTurn ?? {});
    } else {
      threadId = `automation-${crypto.randomUUID()}`; provider = item.provider; projectRoot = item.projectRoot;
      ({ model, effort } = item);
    }
    const timestamp = now(); const runId = crypto.randomUUID();
    item.runs.unshift({ id: runId, status: "IN_PROGRESS", threadId, createdAt: timestamp, completedAt: null, error: null });
    item.runs = item.runs.slice(0, 50); item.lastRunAt = timestamp; item.lastError = null;
    item.nextRunAt = item.status === "ACTIVE" ? nextRunAt(item.rrule, timestamp) : null; item.updatedAt = timestamp;
    this.activeRuns.set(threadId, { automationId: item.id, runId }); this.persist();
    const prompt = item.kind === "heartbeat"
      ? `<heartbeat>\n  <automation_id>${item.id}</automation_id>\n  <current_time_ms>${timestamp}</current_time_ms>\n  <instructions>${item.prompt}</instructions>\n</heartbeat>`
      : item.prompt;
    // Une automatisation se réveille sans utilisateur présent pour approuver un
    // élargissement de périmètre. Elle reste donc toujours en plan/read-only ;
    // toute correction doit être reprise dans un tour interactif explicite.
    await route({ type: "send", threadId, provider, projectRoot, prompt, title: item.name, model, effort, permissionMode: "plan",
      clientMessageId: crypto.randomUUID(), displayEvent: { kind: "user", text: item.prompt, label: "Automatisation" } }, ctx);
    ctx.broadcast({ type: "automations", automations: this.list() });
    return threadId;
  }

  recordEvent(threadId, event, broadcast) {
    if (!event || !["done", "error"].includes(event.kind)) return;
    const active = this.activeRuns.get(threadId); if (!active) return;
    this.activeRuns.delete(threadId);
    const item = this.get(active.automationId); const run = item?.runs.find((entry) => entry.id === active.runId);
    if (!item || !run) return;
    run.status = event.kind === "done" && event.ok !== false ? "COMPLETED" : "FAILED";
    run.completedAt = now(); run.error = event.kind === "error" ? String(event.message ?? "Échec") : null;
    item.lastError = run.error; item.updatedAt = now(); this.persist();
    broadcast?.({ type: "automations", automations: this.list() });
  }

  async runDue(ctx, route) {
    const due = this.list().filter((item) => item.status === "ACTIVE" && item.nextRunAt != null && item.nextRunAt <= now()).slice(0, 3);
    for (const item of due) { try { await this.execute(item.id, ctx, route, true); } catch {} }
  }
}
