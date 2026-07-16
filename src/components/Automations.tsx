import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  Clock3Icon,
  EllipsisIcon,
  ExternalLinkIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { t } from "../lib/i18n";
import type { Thread } from "../lib/ws";
import {
  rruleFromSchedule,
  scheduleFromRrule,
  type Automation,
  type ScheduleDraft,
  type ScheduleMode,
} from "../lib/automations";
import { IconButton } from "./ui/IconButton";
import { showError, showSuccess } from "./ui/toast";
import { SidebarIcon } from "./icons";
import { Select } from "./Select";
import { Badge } from "./shadcn/badge";
import { Button } from "./shadcn/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./shadcn/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./shadcn/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./shadcn/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./shadcn/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "./shadcn/field";
import { Input } from "./shadcn/input";
import { ScrollArea } from "./shadcn/scroll-area";
import { Separator } from "./shadcn/separator";
import { Spinner } from "./shadcn/spinner";
import { Textarea } from "./shadcn/textarea";

type FormDraft = Omit<Automation, "id" | "nextRunAt" | "lastRunAt" | "lastError" | "runs" | "createdAt" | "updatedAt"> & { id?: string };

const WEEKDAYS = [
  ["MO", "Lundi", "Monday"], ["TU", "Mardi", "Tuesday"], ["WE", "Mercredi", "Wednesday"],
  ["TH", "Jeudi", "Thursday"], ["FR", "Vendredi", "Friday"], ["SA", "Samedi", "Saturday"], ["SU", "Dimanche", "Sunday"],
] as const;

const relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function relativeTime(timestamp?: number | null) {
  if (!timestamp) return "";
  const delta = timestamp - Date.now();
  if (Math.abs(delta) < 3_600_000) return relativeTimeFormatter.format(Math.round(delta / 60_000), "minute");
  if (Math.abs(delta) < 86_400_000) return relativeTimeFormatter.format(Math.round(delta / 3_600_000), "hour");
  return relativeTimeFormatter.format(Math.round(delta / 86_400_000), "day");
}

function scheduleLabel(automation: Automation) {
  const schedule = scheduleFromRrule(automation.rrule, automation.kind);
  if (schedule.mode === "interval") return `${t("automations.every")} ${schedule.intervalMinutes} ${t("automations.minutes")}`;
  if (schedule.mode === "hourly") return t("automations.hourly");
  if (schedule.mode === "daily") return `${t("automations.daily")} · ${schedule.time}`;
  if (schedule.mode === "weekdays") return `${t("automations.weekdays")} · ${schedule.time}`;
  if (schedule.mode === "weekly") return `${t("automations.weekly")} · ${schedule.time}`;
  return t("automations.custom");
}

function newDraft(targetThreadId: string | null, projectRoot: string): { draft: FormDraft; schedule: ScheduleDraft } {
  return {
    draft: {
      name: "", prompt: "", status: "ACTIVE", kind: "heartbeat", rrule: "FREQ=MINUTELY;INTERVAL=30",
      targetThreadId, projectRoot, provider: "codex", model: null, effort: null, permissionMode: null,
    },
    schedule: { mode: "interval", intervalMinutes: 30, time: "09:00", weekday: "MO", customRrule: "FREQ=MINUTELY;INTERVAL=30" },
  };
}

export default function AutomationsPanel(props: {
  ws: WebSocket | null;
  threads: Thread[];
  favorites: string[];
  projects: string[];
  preferredThreadId: string | null;
  preferredProjectRoot: string | null;
  onCompact: () => void;
  onOpenThread: (thread: Thread) => void;
}) {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [draft, setDraft] = useState<FormDraft | null>(null);
  const [schedule, setSchedule] = useState<ScheduleDraft | null>(null);
  const [pending, dispatchPending] = useReducer((_current: string | null, next: string | null) => next, null);
  const [deleteTarget, setDeleteTarget] = useState<Automation | null>(null);
  const actionRef = useRef<string | null>(null);

  const threadById = useMemo(() => new Map(props.threads.map((thread) => [thread.id, thread])), [props.threads]);
  const favoriteIds = useMemo(() => new Set(props.favorites), [props.favorites]);
  const selected = draft?.id ? automations.find((automation) => automation.id === draft.id) ?? null : null;
  const usedTargets = useMemo(() => automations.reduce((targets, automation) => {
    if (automation.kind === "heartbeat" && automation.status === "ACTIVE" && automation.id !== draft?.id) {
      targets.add(automation.targetThreadId);
    }
    return targets;
  }, new Set<string | null | undefined>()), [automations, draft?.id]);
  const targetThreads = useMemo(() => {
    const values = props.favorites.flatMap((id) => {
      const thread = threadById.get(id);
      return thread ? [thread] : [];
    });
    if (draft?.targetThreadId && !values.some((thread) => thread.id === draft.targetThreadId)) {
      const current = threadById.get(draft.targetThreadId);
      if (current) values.unshift(current);
    }
    return values;
  }, [draft?.targetThreadId, props.favorites, threadById]);

  useEffect(() => {
    const ws = props.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const onMessage = (event: MessageEvent) => {
      let message: any;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.type === "automations") {
        const next = Array.isArray(message.automations) ? message.automations : [];
        setAutomations(next);
        const action = actionRef.current;
        actionRef.current = null;
        dispatchPending(null);
        if (action === "create") {
          const created = [...next].sort((a, b) => b.createdAt - a.createdAt)[0];
          if (created) { setDraft(created); setSchedule(scheduleFromRrule(created.rrule, created.kind)); }
        } else if (draft?.id) {
          const refreshed = next.find((automation: Automation) => automation.id === draft.id);
          if (refreshed && action) { setDraft(refreshed); setSchedule(scheduleFromRrule(refreshed.rrule, refreshed.kind)); }
          if (!refreshed && action === "delete") { setDraft(null); setSchedule(null); }
        }
      }
      if (message.type === "automationRunStarted") {
        dispatchPending(null); actionRef.current = null; void showSuccess(t("automations.started"));
      }
      if (message.type === "error" && actionRef.current) {
        dispatchPending(null); actionRef.current = null; void showError(String(message.message ?? "Erreur"));
      }
    };
    ws.addEventListener("message", onMessage);
    ws.send(JSON.stringify({ type: "listAutomations" }));
    return () => ws.removeEventListener("message", onMessage);
  }, [props.ws, draft?.id]);

  const send = (type: string, payload: Record<string, unknown>, actionName: string) => {
    if (!props.ws || props.ws.readyState !== WebSocket.OPEN) { void showError("Sidecar déconnecté"); return; }
    dispatchPending(actionName);
    actionRef.current = actionName;
    props.ws.send(JSON.stringify({ type, ...payload }));
  };

  const openAutomation = (automation: Automation) => {
    setDraft({ ...automation }); setSchedule(scheduleFromRrule(automation.rrule, automation.kind));
  };

  const createAutomation = () => {
    const preferred = props.preferredThreadId && favoriteIds.has(props.preferredThreadId)
      ? targetThreads.find((thread) => thread.id === props.preferredThreadId)
      : null;
    const first = preferred ?? targetThreads.find((thread) => !usedTargets.has(thread.id)) ?? null;
    const projectRoot = props.preferredProjectRoot ?? props.projects[0] ?? "";
    const next = newDraft(first?.id ?? null, projectRoot);
    setDraft(next.draft); setSchedule(next.schedule);
  };

  const save = () => {
    if (!draft || !schedule) return;
    if (!draft.name.trim() || !draft.prompt.trim()) { void showError("Nom et prompt requis"); return; }
    if (draft.kind === "heartbeat" && !draft.targetThreadId) { void showError(t("automations.choose-pinned")); return; }
    const automation = { ...draft, rrule: rruleFromSchedule(schedule, draft.kind) };
    send(draft.id ? "updateAutomation" : "createAutomation", { automation }, draft.id ? "save" : "create");
  };

  const changeStatus = (automation: Automation) => send("updateAutomation", { automation: { id: automation.id, status: automation.status === "ACTIVE" ? "PAUSED" : "ACTIVE" } }, "status");
  const runNow = (automation: Automation) => send("runAutomationNow", { id: automation.id }, "run");
  const confirmDelete = () => {
    if (!deleteTarget) return;
    send("deleteAutomation", { id: deleteTarget.id }, "delete"); setDeleteTarget(null);
  };

  const modeOptions = (draft?.kind === "heartbeat" ? ["interval", "daily", "weekdays", "weekly", "custom"] : ["hourly", "daily", "weekdays", "weekly", "custom"]).map((value) => ({
    value,
    label: t((`automations.${value}`) as any),
  }));

  return (
    <>
      <div className="sidebar automation-panel">
        <div className="side-top" data-tauri-drag-region>
          <span className="flex" />
          <IconButton className="mini compact-btn" label={t("action.collapse-sidebar")} title={t("action.collapse-sidebar")} onClick={props.onCompact}>
            <SidebarIcon size={17} />
          </IconButton>
        </div>
        <div className="hl-head">
          <span className="hl-head-title">{t("automations.title")}</span>
          <span className="hl-count">{automations.length}</span>
          <Button className="tw:ml-auto" variant="ghost" size="icon-sm" aria-label={t("automations.create")} onClick={createAutomation}>
            <PlusIcon />
          </Button>
        </div>
        <ScrollArea className="tw:min-h-0 tw:flex-1">
          {automations.length === 0 ? (
            <Empty className="tw:min-h-64 tw:border-0 tw:p-4">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Clock3Icon /></EmptyMedia>
                <EmptyTitle>{t("automations.empty")}</EmptyTitle>
                <EmptyDescription>{t("automations.empty-help")}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent><Button size="sm" onClick={createAutomation}><PlusIcon data-icon="inline-start" />{t("automations.create")}</Button></EmptyContent>
            </Empty>
          ) : (
            <div className="tw:flex tw:flex-col tw:gap-2 tw:py-1">
              {automations.map((automation) => {
                const target = automation.targetThreadId ? threadById.get(automation.targetThreadId) : null;
                const running = automation.runs?.[0]?.status === "IN_PROGRESS";
                return (
                  <div key={automation.id} className="tw:rounded-lg tw:border tw:border-border tw:bg-card tw:p-2">
                    <Button variant="ghost" className="tw:h-auto tw:w-full tw:justify-start tw:px-1 tw:py-1 tw:text-left" onClick={() => openAutomation(automation)}>
                      <span className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-1.5">
                        <span className="tw:flex tw:min-w-0 tw:items-center tw:gap-2">
                          <span className="tw:truncate tw:font-medium">{automation.name}</span>
                          <Badge className="tw:ml-auto" variant={running ? "secondary" : automation.status === "PAUSED" ? "outline" : "ghost"}>
                            {running ? t("automations.in-progress") : automation.status === "PAUSED" ? t("automations.paused") : t("automations.active")}
                          </Badge>
                        </span>
                        <span className="tw:truncate tw:text-[length:var(--fs-caption)] tw:text-muted-foreground">{scheduleLabel(automation)}</span>
                        <span className="tw:line-clamp-2 tw:text-[length:var(--fs-caption)] tw:text-muted-foreground">
                          {automation.kind === "heartbeat" ? t("automations.heartbeat-task", { task: target?.title ?? automation.targetThreadId }) : automation.projectRoot.split("/").pop()}
                        </span>
                      </span>
                    </Button>
                    <div className="tw:mt-1 tw:flex tw:items-center tw:gap-1">
                      {automation.status === "ACTIVE" && automation.nextRunAt && !running && (
                        <span className="tw:min-w-0 tw:flex-1 tw:truncate tw:px-1 tw:text-[length:var(--fs-caption)] tw:text-muted-foreground">{t("automations.next-run", { time: relativeTime(automation.nextRunAt) })}</span>
                      )}
                      <Button className="tw:ml-auto" variant="ghost" size="icon-sm" aria-label={automation.status === "ACTIVE" ? t("automations.pause") : t("automations.resume")} onClick={() => changeStatus(automation)}>
                        {automation.status === "ACTIVE" ? <PauseIcon /> : <PlayIcon />}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Actions" />}><EllipsisIcon /></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuGroup>
                            <DropdownMenuItem onClick={() => runNow(automation)}><PlayIcon />{t("automations.run-now")}</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => changeStatus(automation)}>{automation.status === "ACTIVE" ? <PauseIcon /> : <PlayIcon />}{automation.status === "ACTIVE" ? t("automations.pause") : t("automations.resume")}</DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(automation)}><Trash2Icon />{t("automations.delete")}</DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      <Dialog
        open={draft != null}
        onOpenChange={(open) => {
          if (!open) { setDraft(null); setSchedule(null); }
        }}
      >
        {draft && schedule && (
          <DialogContent
            closeLabel={t("action.close")}
            className="tw:flex tw:max-h-[calc(100vh-48px)] tw:flex-col tw:gap-0! tw:overflow-hidden tw:p-0! tw:sm:max-w-2xl!"
          >
            <DialogHeader className="tw:border-b tw:border-border tw:px-5 tw:py-4 tw:pr-12">
              <div className="tw:flex tw:items-center tw:gap-2">
                <DialogTitle>{draft.name || t("automations.new")}</DialogTitle>
                {draft.id && (
                  <Badge variant={draft.status === "ACTIVE" ? "secondary" : "outline"}>
                    {draft.status === "ACTIVE" ? t("automations.active") : t("automations.paused")}
                  </Badge>
                )}
                {pending && <Spinner className="tw:ml-auto" />}
              </div>
              <DialogDescription>{t("automations.dialog-help")}</DialogDescription>
            </DialogHeader>

            <div className="tw:min-h-0 tw:flex-1 tw:overflow-y-auto tw:px-5 tw:py-4">
              <FieldGroup className="tw:gap-5">
                <Field><FieldLabel htmlFor="automation-name">{t("automations.name")}</FieldLabel><Input id="automation-name" autoFocus={!draft.id} value={draft.name} placeholder={t("automations.name-placeholder")} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
                <Field><FieldLabel htmlFor="automation-prompt">{t("automations.prompt")}</FieldLabel><Textarea id="automation-prompt" rows={5} value={draft.prompt} placeholder={t("automations.prompt-placeholder")} onChange={(event) => setDraft({ ...draft, prompt: event.target.value })} /></Field>

                <Separator />
                <FieldSet className="tw:gap-3">
                  <FieldLegend>{t("automations.details")}</FieldLegend>
                  <FieldGroup className="tw:grid tw:grid-cols-1 tw:gap-4 tw:sm:grid-cols-2">
                    <Field><FieldLabel>{t("automations.runs-in")}</FieldLabel><Select value={draft.kind === "heartbeat" ? "heartbeat" : "cron"} onChange={(value) => {
                      const kind = value as Automation["kind"];
                      const nextSchedule = scheduleFromRrule(kind === "heartbeat" ? "FREQ=MINUTELY;INTERVAL=30" : "FREQ=DAILY;BYHOUR=9;BYMINUTE=0", kind);
                      setDraft({ ...draft, kind, targetThreadId: kind === "heartbeat" ? draft.targetThreadId ?? targetThreads[0]?.id ?? null : null }); setSchedule(nextSchedule);
                    }} options={[{ value: "heartbeat", label: t("automations.existing-task") }, { value: "cron", label: t("automations.new-task") }]} /></Field>
                    {draft.kind === "heartbeat" ? (
                      <Field data-invalid={!draft.targetThreadId}><FieldLabel>{t("automations.task")}</FieldLabel><Select value={draft.targetThreadId ?? ""} onChange={(value) => setDraft({ ...draft, targetThreadId: value })} options={targetThreads.map((thread) => ({ value: thread.id, label: `${thread.title}${favoriteIds.has(thread.id) ? "" : ` · ${t("automations.unpinned")}`}` }))} title={t("automations.choose-pinned")} />{targetThreads.length === 0 && <FieldDescription>{t("automations.pin-first")}</FieldDescription>}</Field>
                    ) : (
                      <>
                        <Field><FieldLabel>{t("automations.project")}</FieldLabel><Select value={draft.projectRoot} onChange={(value) => setDraft({ ...draft, projectRoot: value })} options={props.projects.map((project) => ({ value: project, label: project.split("/").pop() ?? project }))} /></Field>
                        <Field><FieldLabel>{t("automations.provider")}</FieldLabel><Select value={draft.provider} onChange={(value) => setDraft({ ...draft, provider: value })} options={[{ value: "codex", label: "Codex" }, { value: "claude", label: "Claude" }, { value: "grok", label: "Grok" }, { value: "opencode", label: "OpenCode" }]} /></Field>
                      </>
                    )}
                  </FieldGroup>
                </FieldSet>

                <Separator />
                <FieldSet className="tw:gap-3">
                  <FieldLegend>{t("automations.frequency")}</FieldLegend>
                  <FieldGroup className="tw:grid tw:grid-cols-1 tw:gap-4 tw:sm:grid-cols-2">
                    <Field><FieldLabel>{t("automations.frequency")}</FieldLabel><Select value={schedule.mode} onChange={(value) => setSchedule({ ...schedule, mode: value as ScheduleMode })} options={modeOptions} /></Field>
                    {schedule.mode === "interval" && <Field><FieldLabel htmlFor="automation-interval">{t("automations.every")}</FieldLabel><div className="tw:flex tw:items-center tw:gap-2"><Input id="automation-interval" type="number" min={1} max={999} value={schedule.intervalMinutes} onChange={(event) => setSchedule({ ...schedule, intervalMinutes: Number(event.target.value) || 1 })} /><FieldDescription className="tw:shrink-0">{t("automations.minutes")}</FieldDescription></div></Field>}
                    {["daily", "weekdays", "weekly"].includes(schedule.mode) && <Field><FieldLabel htmlFor="automation-time">{t("automations.at")}</FieldLabel><Input id="automation-time" type="time" value={schedule.time} onChange={(event) => setSchedule({ ...schedule, time: event.target.value })} /></Field>}
                    {schedule.mode === "weekly" && <Field><FieldLabel>{t("automations.on")}</FieldLabel><Select value={schedule.weekday} onChange={(value) => setSchedule({ ...schedule, weekday: value })} options={WEEKDAYS.map(([value, fr, en]) => ({ value, label: navigator.language.startsWith("fr") ? fr : en }))} /></Field>}
                    {schedule.mode === "custom" && <Field className="tw:sm:col-span-2"><FieldLabel htmlFor="automation-rrule">{t("automations.rrule")}</FieldLabel><Textarea id="automation-rrule" value={schedule.customRrule} onChange={(event) => setSchedule({ ...schedule, customRrule: event.target.value })} /></Field>}
                  </FieldGroup>
                </FieldSet>

                {selected && (
                  <>
                    <Separator />
                    <FieldSet className="tw:gap-3">
                      <FieldLegend>{t("automations.previous-runs")}</FieldLegend>
                      {selected.runs.length === 0 ? <FieldDescription>{t("automations.no-runs")}</FieldDescription> : (
                        <div className="tw:flex tw:flex-col tw:divide-y tw:divide-border">
                          {selected.runs.map((run) => {
                            const runThread = threadById.get(run.threadId);
                            const content = <><span className="tw:min-w-0 tw:flex-1 tw:truncate">{runThread?.title ?? run.threadId}</span><Badge variant={run.status === "FAILED" ? "destructive" : run.status === "IN_PROGRESS" ? "secondary" : "outline"}>{run.status === "FAILED" ? t("automations.failed") : run.status === "IN_PROGRESS" ? t("automations.in-progress") : t("automations.completed")}</Badge><span className="tw:shrink-0 tw:text-[length:var(--fs-caption)] tw:text-muted-foreground">{new Date(run.createdAt).toLocaleString()}</span></>;
                            return runThread ? <Button key={run.id} variant="ghost" className="tw:h-auto tw:w-full tw:justify-start tw:rounded-none tw:px-1 tw:py-2.5 tw:text-left" onClick={() => props.onOpenThread(runThread)}>{content}</Button> : <div key={run.id} className="tw:flex tw:items-center tw:gap-3 tw:px-1 tw:py-2.5">{content}</div>;
                          })}
                        </div>
                      )}
                    </FieldSet>
                  </>
                )}
              </FieldGroup>
            </div>

            <div className="tw:flex tw:items-center tw:justify-end tw:gap-2 tw:border-t tw:border-border tw:px-5 tw:py-3">
              {selected?.kind === "heartbeat" && selected.targetThreadId && threadById.get(selected.targetThreadId) && (
                <Button variant="outline" onClick={() => props.onOpenThread(threadById.get(selected.targetThreadId!)!)}><ExternalLinkIcon data-icon="inline-start" />{t("automations.open-task")}</Button>
              )}
              <Button disabled={pending != null} onClick={save}>{pending === "save" || pending === "create" ? <Spinner data-icon="inline-start" /> : null}{t("automations.save")}</Button>
            </div>
          </DialogContent>
        )}
      </Dialog>

      <AlertDialog open={deleteTarget != null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t("automations.delete-title", { name: deleteTarget?.name })}</AlertDialogTitle><AlertDialogDescription>{t("automations.delete-help")}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={confirmDelete}>{t("automations.delete")}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
